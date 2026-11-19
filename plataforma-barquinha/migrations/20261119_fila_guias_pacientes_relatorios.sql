-- 2026-11-19 • Evolução da recepção Barquinha.
-- Migração aditiva: nenhum registro existente é removido ou reiniciado.
-- Requer as tabelas do schema-atendimentos.sql já existentes.

ALTER TABLE public.barquinha_attendance_patients
  ADD COLUMN IF NOT EXISTS preferred_guide_id uuid REFERENCES public.barquinha_attendance_guides(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS modalidade_cadastro text NOT NULL DEFAULT 'presencial',
  ADD COLUMN IF NOT EXISTS endereco text;
ALTER TABLE public.barquinha_attendance_patients ALTER COLUMN nascimento DROP NOT NULL;
ALTER TABLE public.barquinha_attendance_patients
  ADD CONSTRAINT attendance_patient_mode_chk
  CHECK(modalidade_cadastro IN ('presencial','distancia','trabalhador'));
ALTER TABLE public.barquinha_attendance_patients
  ADD CONSTRAINT attendance_patient_address_chk
  CHECK(endereco IS NULL OR length(endereco)<=600);
ALTER TABLE public.barquinha_attendance_patients
  ADD CONSTRAINT attendance_patient_remote_chk
  CHECK(modalidade_cadastro <> 'distancia' OR length(trim(coalesce(endereco,'')))>=5);
ALTER TABLE public.barquinha_attendance_patients
  ADD CONSTRAINT attendance_patient_birth_chk
  CHECK(modalidade_cadastro='distancia' OR nascimento IS NOT NULL);
GRANT UPDATE(nome,nascimento,telefone,cpf,preferred_guide_id,modalidade_cadastro,endereco,foto_path)
 ON public.barquinha_attendance_patients TO authenticated;
GRANT INSERT(nome,nascimento,telefone,cpf,preferred_guide_id,modalidade_cadastro,endereco)
 ON public.barquinha_attendance_patients TO authenticated;
CREATE POLICY attendance_patients_edit ON public.barquinha_attendance_patients
 FOR UPDATE TO authenticated
 USING ((SELECT private.barquinha_attendance_permitted(array['administrador','recepcao'])))
 WITH CHECK ((SELECT private.barquinha_attendance_permitted(array['administrador','recepcao'])));

-- Situações modernas mantêm a antiga "Cancelado" como valor legado de leitura.
ALTER TABLE public.barquinha_attendance_visits DROP CONSTRAINT barquinha_attendance_visits_status_check;
ALTER TABLE public.barquinha_attendance_visits
 ADD CONSTRAINT barquinha_attendance_visits_status_check CHECK (
  status IN ('Aguardando','Chamado','Em atendimento','Concluído','Não compareceu','Desistente','Cancelado')
 );

ALTER TABLE public.barquinha_attendance_visits
 ADD COLUMN IF NOT EXISTS chamada_numero integer,
 ADD COLUMN IF NOT EXISTS chamada_prioritaria boolean NOT NULL DEFAULT false;

-- Registros antigos recebem fichas ordenadas pela chegada real, por dia/Guia/classe.
WITH numbered AS (
  SELECT id,(prioridade<>'Normal') AS prioridade_ficha,
    row_number() over (PARTITION BY service_date,guide_id,(prioridade<>'Normal') ORDER BY created_at,ordem,id)::int AS ficha
  FROM public.barquinha_attendance_visits WHERE chamada_numero IS NULL
)
UPDATE public.barquinha_attendance_visits v
 SET chamada_numero=numbered.ficha,chamada_prioritaria=numbered.prioridade_ficha
 FROM numbered WHERE v.id=numbered.id;

ALTER TABLE public.barquinha_attendance_visits ALTER COLUMN chamada_numero SET NOT NULL;
ALTER TABLE public.barquinha_attendance_visits
 ADD CONSTRAINT attendance_ticket_positive CHECK(chamada_numero > 0);
CREATE UNIQUE INDEX IF NOT EXISTS attendance_ticket_guide_day_unique
  ON public.barquinha_attendance_visits(service_date,guide_id,chamada_prioritaria,chamada_numero);

-- Uma ficha de cada classe para cada Guia: 01,02,... e P01,P02,...
-- Contadores privados garantem unicidade sob várias recepcionistas concorrentes.
CREATE TABLE IF NOT EXISTS private.barquinha_attendance_ticket_counters(
  service_date date NOT NULL,
  guide_id uuid NOT NULL REFERENCES public.barquinha_attendance_guides(id) ON DELETE RESTRICT,
  prioritaria boolean NOT NULL,
  ultimo integer NOT NULL CHECK(ultimo>=0),
  PRIMARY KEY(service_date,guide_id,prioritaria)
);
REVOKE ALL ON private.barquinha_attendance_ticket_counters FROM public,anon,authenticated;
INSERT INTO private.barquinha_attendance_ticket_counters AS counter(service_date,guide_id,prioritaria,ultimo)
 SELECT service_date,guide_id,chamada_prioritaria,max(chamada_numero)
 FROM public.barquinha_attendance_visits GROUP BY service_date,guide_id,chamada_prioritaria
 ON CONFLICT(service_date,guide_id,prioritaria) DO UPDATE
 SET ultimo=greatest(counter.ultimo,excluded.ultimo);

-- Registrar encerramento de expediente; não mistura com Projetos ou Financeiro.
CREATE TABLE IF NOT EXISTS public.barquinha_attendance_sessions(
  service_date date PRIMARY KEY,
  started_at timestamptz NOT NULL DEFAULT now(),
  started_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  closed_at timestamptz,
  closed_by uuid REFERENCES auth.users(id)
);
ALTER TABLE public.barquinha_attendance_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.barquinha_attendance_sessions FROM anon,authenticated;
GRANT SELECT,INSERT(service_date),UPDATE(closed_at)
  ON public.barquinha_attendance_sessions TO authenticated;
CREATE POLICY attendance_sessions_select ON public.barquinha_attendance_sessions
 FOR SELECT TO authenticated USING ((SELECT private.barquinha_attendance_permitted(array['administrador','recepcao','guia'])));
CREATE POLICY attendance_sessions_start ON public.barquinha_attendance_sessions
 FOR INSERT TO authenticated
 WITH CHECK (started_by=(SELECT auth.uid())
   AND service_date=(now() AT TIME ZONE 'America/Fortaleza')::date
   AND (SELECT private.barquinha_attendance_permitted(array['administrador','recepcao'])));
CREATE POLICY attendance_sessions_close ON public.barquinha_attendance_sessions
 FOR UPDATE TO authenticated
 USING (closed_at IS NULL AND service_date=(now() AT TIME ZONE 'America/Fortaleza')::date
   AND (SELECT private.barquinha_attendance_permitted(array['administrador','recepcao'])))
 WITH CHECK (service_date=(now() AT TIME ZONE 'America/Fortaleza')::date
   AND (SELECT private.barquinha_attendance_permitted(array['administrador','recepcao'])));

CREATE OR REPLACE FUNCTION private.barquinha_attendance_lock_session()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(417219,pg_catalog.hashtext(new.service_date::text));
  IF tg_op='UPDATE' THEN
    IF old.closed_at IS NOT NULL THEN RAISE EXCEPTION 'Expediente já encerrado'; END IF;
    IF new.closed_at IS NULL THEN RAISE EXCEPTION 'Informe o encerramento do expediente'; END IF;
    new.closed_at=now();
    new.closed_by=auth.uid();
  END IF;
  RETURN new;
END;
$$;
REVOKE ALL ON FUNCTION private.barquinha_attendance_lock_session() FROM public,anon,authenticated;
CREATE TRIGGER attendance_session_lock BEFORE INSERT OR UPDATE OF closed_at
 ON public.barquinha_attendance_sessions FOR EACH ROW
 EXECUTE FUNCTION private.barquinha_attendance_lock_session();

CREATE OR REPLACE FUNCTION private.barquinha_attendance_assign_ticket()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE
  v_birth date;
  v_last integer;
BEGIN
  -- Serializa a inscrição com o fechamento, inclusive em clientes diferentes.
  PERFORM pg_catalog.pg_advisory_xact_lock(417219,pg_catalog.hashtext(new.service_date::text));
  IF EXISTS (SELECT 1 FROM public.barquinha_attendance_sessions s WHERE s.service_date=new.service_date AND s.closed_at IS NOT NULL) THEN
    RAISE EXCEPTION 'Expediente encerrado para esta data';
  END IF;
  -- Até existir autorização do Presidente, o servidor também bloqueia
  -- passagens à distância e chegadas após 17h.
  IF new.modalidade <> 'presencial' THEN
    RAISE EXCEPTION 'Passagens à distância ou de trabalhadores dependem da autorização e liberação do fluxo';
  END IF;
  IF (now() AT TIME ZONE 'America/Fortaleza')::time >= time '17:00' THEN
    RAISE EXCEPTION 'Chegadas após 17h dependem de autorização do Presidente';
  END IF;
  SELECT nascimento INTO v_birth FROM public.barquinha_attendance_patients WHERE id=new.patient_id;
  IF new.prioridade='Normal' AND v_birth IS NOT NULL
     AND v_birth <= (new.service_date - interval '60 years')::date THEN
    new.prioridade='Idoso';
  END IF;
  new.chamada_prioritaria=(new.prioridade<>'Normal');
  INSERT INTO private.barquinha_attendance_ticket_counters AS counter(service_date,guide_id,prioritaria,ultimo)
   VALUES(new.service_date,new.guide_id,new.chamada_prioritaria,1)
  ON CONFLICT(service_date,guide_id,prioritaria)
   DO UPDATE SET ultimo=counter.ultimo+1
  RETURNING ultimo INTO v_last;
  new.chamada_numero=v_last;
  RETURN new;
END;
$$;
REVOKE ALL ON FUNCTION private.barquinha_attendance_assign_ticket() FROM public,anon,authenticated;
CREATE TRIGGER attendance_ticket_before_insert
 BEFORE INSERT ON public.barquinha_attendance_visits
 FOR EACH ROW EXECUTE FUNCTION private.barquinha_attendance_assign_ticket();

-- Impede manipulação das fichas por UPDATE de situação (só a situação pode mudar).
-- A auditoria de situações existente continua ativa.


-- Após fechar a sessão, alterações de situação também ficam protegidas no banco.
CREATE OR REPLACE FUNCTION private.barquinha_attendance_guard_closed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $
BEGIN
 PERFORM pg_catalog.pg_advisory_xact_lock(417219,pg_catalog.hashtext(old.service_date::text));
 IF EXISTS (SELECT 1 FROM public.barquinha_attendance_sessions s
   WHERE s.service_date=old.service_date AND s.closed_at IS NOT NULL) THEN
   RAISE EXCEPTION 'Atendimento encerrado; alteração não permitida';
 END IF;
 RETURN new;
END;
$$;
REVOKE ALL ON FUNCTION private.barquinha_attendance_guard_closed() FROM public,anon,authenticated;
CREATE TRIGGER attendance_closed_guard BEFORE UPDATE OF status
 ON public.barquinha_attendance_visits FOR EACH ROW
 EXECUTE FUNCTION private.barquinha_attendance_guard_closed();
