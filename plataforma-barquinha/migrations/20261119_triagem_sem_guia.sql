-- Atendimentos Barquinha: Triagem para primeira chegada sem Guia, de forma compatível.
-- Nunca altera registros já existentes nem as tabelas de Projetos.
alter table public.barquinha_attendance_visits
 alter column guide_id drop not null,
 alter column ficha_tipo drop not null,
 alter column ficha_numero drop not null;

alter table public.barquinha_attendance_visits
 add constraint barquinha_triagem_consistent_fields
 check (
   (guide_id is null and ficha_tipo is null and ficha_numero is null
     and guia_nome_registro is null and status='Aguardando')
   or
   (guide_id is not null and ficha_tipo is not null and ficha_numero is not null
     and guia_nome_registro is not null)
 );

-- Triagem de primeira chegada não recebe ficha até a escolha do Guia.
-- Continuam vigentes as restrições para atendimentos remotos e chegada após 17h.
create or replace function private.barquinha_attendance_assign_ticket()
returns trigger language plpgsql security invoker set search_path=''
as $$
declare birth_date date;
begin
 if new.modalidade <> 'presencial' then
  raise exception 'Atendimentos à distância ou de trabalhadores da casa exigem autorização do Presidente.';
 end if;
 if (pg_catalog.now() at time zone 'America/Fortaleza')::time >= time '17:00' then
  raise exception 'Chegadas após 17h exigem autorização do Presidente.';
 end if;
 if exists(select 1 from public.barquinha_attendance_closures c where c.service_date=new.service_date) then
  raise exception 'Atendimentos desta data foram encerrados';
 end if;
 select p.nascimento into birth_date from public.barquinha_attendance_patients p where p.id=new.patient_id;
 if birth_date is not null and pg_catalog.age(new.service_date,birth_date)>=interval '60 years'
    and new.prioridade='Normal' then
  new.prioridade='Idoso';
 end if;
 if new.guide_id is null then
  if exists(select 1 from public.barquinha_attendance_visits v where v.patient_id=new.patient_id) then
   raise exception 'Triagem somente para a primeira chegada do paciente. Selecione um Guia para os retornos.';
  end if;
  new.ficha_tipo=null;
  new.ficha_numero=null;
  new.guia_nome_registro=null;
  return new;
 end if;
 new.ficha_tipo := case when new.prioridade='Normal' then 'N' else 'P' end;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
  new.service_date::text || ':' || new.guide_id::text || ':' || new.ficha_tipo,0));
 select coalesce(max(v.ficha_numero),0)+1 into new.ficha_numero
  from public.barquinha_attendance_visits v where v.service_date=new.service_date
  and v.guide_id=new.guide_id and v.ficha_tipo=new.ficha_tipo;
 return new;
end
$$;
revoke all on function private.barquinha_attendance_assign_ticket() from public,anon,authenticated;

create or replace function private.barquinha_attendance_snapshot_guide()
returns trigger language plpgsql security invoker set search_path=''
as $$
begin
 if new.guide_id is null then
  new.guia_nome_registro=null;
  return new;
 end if;
 select g.nome into new.guia_nome_registro from public.barquinha_attendance_guides g
 where g.id=new.guide_id;
 if new.guia_nome_registro is null then raise exception 'Guia não encontrado'; end if;
 return new;
end
$$;
revoke all on function private.barquinha_attendance_snapshot_guide() from public,anon,authenticated;

-- Apenas recepção e administrador podem atribuir Guia à triagem.
-- SECURITY DEFINER deliberado para operação atômica e escopo estritamente limitado:
-- verifica usuário autorizado, visita de hoje ainda em Triagem e Guia ativo.
create or replace function public.barquinha_attendance_route_triage(
 p_visit_id uuid,p_guide_id uuid
)
returns public.barquinha_attendance_visits
language plpgsql security definer set search_path=''
as $$
declare v public.barquinha_attendance_visits%rowtype;
        g public.barquinha_attendance_guides%rowtype;
        kind text;
        next_number integer;
begin
 if (select auth.uid()) is null or
    not (select private.barquinha_attendance_permitted(array['administrador','recepcao'])) then
  raise exception 'Acesso não autorizado para encaminhar a Triagem';
 end if;
 if p_visit_id is null or p_guide_id is null then
  raise exception 'Selecione um paciente da Triagem e um Guia';
 end if;
 select * into v from public.barquinha_attendance_visits
  where id=p_visit_id for update;
 if not found or v.guide_id is not null or v.status<>'Aguardando' then
  raise exception 'O atendimento não está mais aguardando na Triagem';
 end if;
 if v.service_date <> (pg_catalog.now() at time zone 'America/Fortaleza')::date
    or exists(select 1 from public.barquinha_attendance_closures c where c.service_date=v.service_date)
 then
  raise exception 'Atendimento já encerrado ou de outra data';
 end if;
 select * into g from public.barquinha_attendance_guides
  where id=p_guide_id and ativo for share;
 if not found then raise exception 'Selecione um Guia ativo'; end if;
 kind:=case when v.prioridade='Normal' then 'N' else 'P' end;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
  v.service_date::text || ':' || g.id::text || ':' || kind,0));
 select coalesce(max(x.ficha_numero),0)+1 into next_number
  from public.barquinha_attendance_visits x
  where x.service_date=v.service_date and x.guide_id=g.id and x.ficha_tipo=kind;
 update public.barquinha_attendance_visits
  set guide_id=g.id,ficha_tipo=kind,ficha_numero=next_number,guia_nome_registro=g.nome
  where id=v.id returning * into v;
 update public.barquinha_attendance_patients
  set guide_id=g.id where id=v.patient_id;
 return v;
end
$$;
revoke all on function public.barquinha_attendance_route_triage(uuid,uuid) from public,anon;
grant execute on function public.barquinha_attendance_route_triage(uuid,uuid) to authenticated;

-- A edição de status de pacientes ainda sem Guia deve permanecer bloqueada até a atribuição.
create or replace function private.barquinha_attendance_block_closed_status()
returns trigger language plpgsql security invoker set search_path=''
as $$
begin
 if exists(select 1 from public.barquinha_attendance_closures c where c.service_date=old.service_date) then
  raise exception 'Atendimentos desta data foram encerrados';
 end if;
 if old.guide_id is null then
  raise exception 'Encaminhe o paciente da Triagem a um Guia antes de mudar seu status';
 end if;
 return new;
end
$$;
revoke all on function private.barquinha_attendance_block_closed_status() from public,anon,authenticated;
