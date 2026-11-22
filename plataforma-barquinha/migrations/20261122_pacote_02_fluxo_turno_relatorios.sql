-- PACOTE 02 — Atendimentos Barquinha (aplicar SOMENTE junto à próxima publicação).
-- Migração aditiva: preserva registros, Guias, fotos e todos os Projetos Barquinha.
-- ATENÇÃO: após aplicar, novas chegadas exigem botão INICIAR ATENDIMENTOS.

create table if not exists public.barquinha_attendance_shifts(
 service_date date primary key,
 started_at timestamptz not null default now(),
 started_by uuid not null default auth.uid() references auth.users(id),
 finished_at timestamptz,
 finished_by uuid references auth.users(id),
 constraint attendance_shift_end_after_start check(finished_at is null or finished_at >= started_at)
);
alter table public.barquinha_attendance_shifts enable row level security;
revoke all on public.barquinha_attendance_shifts from public,anon,authenticated;
grant select on public.barquinha_attendance_shifts to authenticated;
create policy attendance_shifts_read on public.barquinha_attendance_shifts for select to authenticated
 using((select private.barquinha_attendance_permitted(array['administrador','recepcao','guia'])));

create or replace function public.barquinha_attendance_start_shift()
returns public.barquinha_attendance_shifts
language plpgsql security definer set search_path=''
as $$
declare d date := (now() at time zone 'America/Fortaleza')::date;
        v public.barquinha_attendance_shifts%rowtype;
begin
 if (select auth.uid()) is null or not (select private.barquinha_attendance_permitted(array['administrador','recepcao'])) then
   raise exception 'Não autorizado a iniciar atendimentos';
 end if;
 if exists(select 1 from public.barquinha_attendance_closures where service_date=d) then
   raise exception 'O dia já está encerrado';
 end if;
 insert into public.barquinha_attendance_shifts(service_date,started_by) values(d,auth.uid())
 on conflict(service_date) do nothing;
 select * into v from public.barquinha_attendance_shifts where service_date=d;
 if v.finished_at is not null then raise exception 'O dia já foi finalizado'; end if;
 return v;
end
$$;
revoke all on function public.barquinha_attendance_start_shift() from public,anon;
grant execute on function public.barquinha_attendance_start_shift() to authenticated;

create or replace function public.barquinha_attendance_finish_shift()
returns public.barquinha_attendance_shifts
language plpgsql security definer set search_path=''
as $$
declare d date := (now() at time zone 'America/Fortaleza')::date;
        v public.barquinha_attendance_shifts%rowtype;
begin
 if (select auth.uid()) is null or not (select private.barquinha_attendance_permitted(array['administrador','recepcao'])) then
   raise exception 'Não autorizado a encerrar atendimentos';
 end if;
 select * into v from public.barquinha_attendance_shifts where service_date=d for update;
 if not found then raise exception 'Inicie os atendimentos antes de encerrar'; end if;
 if v.finished_at is not null or exists(select 1 from public.barquinha_attendance_closures where service_date=d) then
   raise exception 'O dia já foi encerrado';
 end if;
 -- Congela corretamente o cronômetro de atendimentos em andamento.
 update public.barquinha_attendance_visits
 set atendimento_segundos=atendimento_segundos+
     greatest(0,extract(epoch from(now()-timer_started_at))::integer),
     timer_started_at=null
 where service_date=d and timer_started_at is not null and excluded_at is null;
 update public.barquinha_attendance_shifts
 set finished_at=now(),finished_by=auth.uid() where service_date=d returning * into v;
 insert into public.barquinha_attendance_closures(service_date,closed_by) values(d,auth.uid());
 return v;
end
$$;
revoke all on function public.barquinha_attendance_finish_shift() from public,anon;
grant execute on function public.barquinha_attendance_finish_shift() to authenticated;

alter table public.barquinha_attendance_visits
 add column if not exists atendimento_iniciado_em timestamptz,
 add column if not exists atendimento_finalizado_em timestamptz,
 add column if not exists timer_started_at timestamptz,
 add column if not exists atendimento_segundos integer not null default 0,
 add column if not exists excluded_at timestamptz,
 add column if not exists excluded_by uuid references auth.users(id),
 add column if not exists exclusion_reason text;
alter table public.barquinha_attendance_visits
 add constraint attendance_duration_nonnegative check(atendimento_segundos>=0);

-- Controle de duração baseado no relógio do servidor, não no dispositivo.
create or replace function private.barquinha_attendance_track_timer()
returns trigger language plpgsql security invoker set search_path=''
as $$
begin
 if new.status is distinct from old.status then
   if old.status='Em atendimento' and old.timer_started_at is not null then
     new.atendimento_segundos=old.atendimento_segundos+
        greatest(0,extract(epoch from(now()-old.timer_started_at))::integer);
     new.timer_started_at=null;
   end if;
   if new.status='Em atendimento' then
     new.timer_started_at=now();
     new.atendimento_iniciado_em=coalesce(old.atendimento_iniciado_em,now());
     new.atendimento_finalizado_em=null;
   elsif new.status='Concluído' then
     new.atendimento_finalizado_em=now();
   elsif old.status='Concluído' then
     new.atendimento_finalizado_em=null;
   end if;
 end if;
 return new;
end
$$;
drop trigger if exists attendance_track_timer on public.barquinha_attendance_visits;
create trigger attendance_track_timer before update of status on public.barquinha_attendance_visits
 for each row execute function private.barquinha_attendance_track_timer();

-- Após o início do turno, todas as modalidades são permitidas sem autorização remota.
-- A regra histórica de autorização para chegadas após 17h permanece.
create or replace function private.barquinha_attendance_assign_ticket()
returns trigger language plpgsql security invoker set search_path=''
as $$
declare birth_date date;
begin
 if new.modalidade not in ('presencial','distancia','trabalhador') then
   raise exception 'Modalidade inválida';
 end if;
 if (now() at time zone 'America/Fortaleza')::time >= time '17:00' then
   raise exception 'Chegadas após 17h ainda exigem autorização do Presidente';
 end if;
 if not exists(select 1 from public.barquinha_attendance_shifts sh
    where sh.service_date=new.service_date and sh.finished_at is null) then
   raise exception 'Inicie os atendimentos antes de registrar chegadas';
 end if;
 if exists(select 1 from public.barquinha_attendance_closures c where c.service_date=new.service_date) then
   raise exception 'Atendimentos desta data foram encerrados';
 end if;
 select p.nascimento into birth_date from public.barquinha_attendance_patients p where p.id=new.patient_id;
 if birth_date is not null and age(new.service_date,birth_date)>=interval '60 years' and new.prioridade='Normal' then
   new.prioridade='Idoso';
 end if;
 if new.guide_id is null then
   if exists(select 1 from public.barquinha_attendance_visits v
     where v.patient_id=new.patient_id and v.excluded_at is null) then
     raise exception 'Triagem somente na primeira chegada do paciente';
   end if;
   new.ficha_tipo=null;new.ficha_numero=null;new.guia_nome_registro=null;
   return new;
 end if;
 new.ficha_tipo:=case when new.prioridade='Normal' then 'N' else 'P' end;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
   new.service_date::text||':'||new.guide_id::text||':'||new.ficha_tipo,0));
 select coalesce(max(v.ficha_numero),0)+1 into new.ficha_numero
 from public.barquinha_attendance_visits v
 where v.service_date=new.service_date and v.guide_id=new.guide_id and v.ficha_tipo=new.ficha_tipo;
 return new;
end
$$;

-- Impede mudar status de ficha excluída ou de turno encerrado, mesmo via API.
create or replace function private.barquinha_attendance_block_closed_status()
returns trigger language plpgsql security invoker set search_path=''
as $$
begin
 if old.excluded_at is not null then raise exception 'Registro excluído não pode ser alterado'; end if;
 if exists(select 1 from public.barquinha_attendance_closures c where c.service_date=old.service_date) then
  raise exception 'Atendimentos desta data foram encerrados';
 end if;
 if not exists(select 1 from public.barquinha_attendance_shifts sh
   where sh.service_date=old.service_date and sh.finished_at is null) then
  raise exception 'O turno não está em andamento';
 end if;
 if old.guide_id is null then
  raise exception 'Encaminhe o paciente da Triagem antes de mudar seu status';
 end if;
 return new;
end
$$;

-- Rastreabilidade permanente: exclusão lógica, edição e histórico anterior.
create table if not exists public.barquinha_attendance_visit_audit(
 id bigint generated always as identity primary key,
 visit_id uuid not null references public.barquinha_attendance_visits(id) on delete restrict,
 operation text not null check(operation in('editar','excluir')),
 previous_data jsonb not null,
 current_data jsonb,
 reason text,
 actor_id uuid not null references auth.users(id),
 changed_at timestamptz not null default now()
);
alter table public.barquinha_attendance_visit_audit enable row level security;
revoke all on public.barquinha_attendance_visit_audit from public,anon,authenticated;
grant select on public.barquinha_attendance_visit_audit to authenticated;
create policy attendance_visit_audit_read on public.barquinha_attendance_visit_audit for select to authenticated
 using((select private.barquinha_attendance_permitted(array['administrador','recepcao'])));

-- Ajustes de registro com bloqueio por data/turno e emissão atômica de nova ficha quando necessário.
create or replace function public.barquinha_attendance_edit_visit(
 p_visit_id uuid,p_patient_id uuid,p_guide_id uuid,
 p_modalidade text,p_prioridade text,p_status text
)
returns public.barquinha_attendance_visits
language plpgsql security definer set search_path=''
as $$
declare v public.barquinha_attendance_visits%rowtype;
        old_visit public.barquinha_attendance_visits%rowtype;
        g public.barquinha_attendance_guides%rowtype;
        new_kind text;
        new_number integer;
        dob date;
begin
 if (select auth.uid()) is null or not (select private.barquinha_attendance_permitted(array['administrador','recepcao'])) then
  raise exception 'Sem permissão para corrigir atendimentos';
 end if;
 select * into v from public.barquinha_attendance_visits where id=p_visit_id for update;
 if not found or v.excluded_at is not null then raise exception 'Registro indisponível para edição'; end if;
 old_visit:=v;
 if v.service_date<>(now() at time zone 'America/Fortaleza')::date or
    exists(select 1 from public.barquinha_attendance_closures where service_date=v.service_date) or
    not exists(select 1 from public.barquinha_attendance_shifts sh
      where sh.service_date=v.service_date and sh.finished_at is null) then
   raise exception 'Somente registros do turno atual em andamento podem ser editados';
 end if;
 if p_modalidade not in('presencial','distancia','trabalhador') or
    p_prioridade not in('Normal','Idoso','Gestante','Deficiência','Outra') or
    p_status not in('Aguardando','Chamado','Em atendimento','Concluído','Não compareceu','Desistente') then
   raise exception 'Modalidade, prioridade ou situação inválida';
 end if;
 select nascimento into dob from public.barquinha_attendance_patients where id=p_patient_id;
 if not found then raise exception 'Paciente não encontrado'; end if;
 if dob is not null and age(v.service_date,dob)>=interval '60 years' and p_prioridade='Normal' then
   p_prioridade:='Idoso';
 end if;
 if p_guide_id is null then
   if p_status<>'Aguardando' then raise exception 'Triagem somente em situação Aguardando'; end if;
   if exists(select 1 from public.barquinha_attendance_visits x
       where x.patient_id=p_patient_id and x.id<>v.id and x.excluded_at is null) then
     raise exception 'Triagem restrita à primeira chegada';
   end if;
   new_kind:=null;new_number:=null;
 else
   select * into g from public.barquinha_attendance_guides where id=p_guide_id and ativo for share;
   if not found then raise exception 'Selecione um Guia ativo'; end if;
   new_kind:=case when p_prioridade='Normal' then 'N' else 'P' end;
   if v.guide_id is distinct from p_guide_id or v.ficha_tipo is distinct from new_kind then
     perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
       v.service_date::text||':'||p_guide_id::text||':'||new_kind,0));
     select coalesce(max(x.ficha_numero),0)+1 into new_number
       from public.barquinha_attendance_visits x
       where x.service_date=v.service_date and x.guide_id=p_guide_id and x.ficha_tipo=new_kind;
   else
     new_number:=v.ficha_numero;
   end if;
 end if;
 update public.barquinha_attendance_visits
 set patient_id=p_patient_id,guide_id=p_guide_id,modalidade=p_modalidade,
     prioridade=p_prioridade,status=p_status,ficha_tipo=new_kind,
     ficha_numero=new_number,guia_nome_registro=case when p_guide_id is null then null else g.nome end
 where id=v.id returning * into v;
 if p_guide_id is not null then
   update public.barquinha_attendance_patients set guide_id=p_guide_id where id=p_patient_id;
 end if;
 insert into public.barquinha_attendance_visit_audit(
  visit_id,operation,previous_data,current_data,actor_id)
 values(v.id,'editar',to_jsonb(old_visit),to_jsonb(v),auth.uid());
 return v;
end
$$;
revoke all on function public.barquinha_attendance_edit_visit(uuid,uuid,uuid,text,text,text) from public,anon;
grant execute on function public.barquinha_attendance_edit_visit(uuid,uuid,uuid,text,text,text) to authenticated;

create or replace function public.barquinha_attendance_exclude_visit(p_visit_id uuid,p_reason text)
returns public.barquinha_attendance_visits
language plpgsql security definer set search_path=''
as $$
declare v public.barquinha_attendance_visits%rowtype;
        old_visit public.barquinha_attendance_visits%rowtype;
begin
 if (select auth.uid()) is null or not (select private.barquinha_attendance_permitted(array['administrador','recepcao'])) then
  raise exception 'Sem permissão para excluir registros de atendimento';
 end if;
 if length(trim(coalesce(p_reason,'')))<5 or length(p_reason)>300 then
   raise exception 'Informe o motivo da exclusão (5 a 300 caracteres)';
 end if;
 select * into v from public.barquinha_attendance_visits where id=p_visit_id for update;
 if not found or v.excluded_at is not null then raise exception 'Registro indisponível'; end if;
 old_visit:=v;
 if v.service_date<>(now() at time zone 'America/Fortaleza')::date or
    exists(select 1 from public.barquinha_attendance_closures where service_date=v.service_date) or
    not exists(select 1 from public.barquinha_attendance_shifts sh
       where sh.service_date=v.service_date and sh.finished_at is null) then
  raise exception 'Somente registros do turno atual podem ser excluídos';
 end if;
 update public.barquinha_attendance_visits
   set excluded_at=now(),excluded_by=auth.uid(),exclusion_reason=trim(p_reason),
   timer_started_at=null
 where id=v.id returning * into v;
 insert into public.barquinha_attendance_visit_audit(visit_id,operation,previous_data,current_data,reason,actor_id)
 values(v.id,'excluir',to_jsonb(old_visit),to_jsonb(v),trim(p_reason),auth.uid());
 return v;
end
$$;
revoke all on function public.barquinha_attendance_exclude_visit(uuid,text) from public,anon;
grant execute on function public.barquinha_attendance_exclude_visit(uuid,text) to authenticated;

-- Profissionais vinculados ao Guia principal, sem criar novo login institucional.
create table if not exists public.barquinha_attendance_guide_workers(
 id uuid primary key default gen_random_uuid(),
 guide_id uuid not null references public.barquinha_attendance_guides(id) on delete restrict,
 nome text not null check(length(trim(nome)) between 2 and 120),
 funcao text,
 ativo boolean not null default true,
 created_at timestamptz not null default now(),
 created_by uuid not null default auth.uid() references auth.users(id)
);
create index if not exists attendance_workers_guide_idx on public.barquinha_attendance_guide_workers(guide_id,ativo);
alter table public.barquinha_attendance_guide_workers enable row level security;
revoke all on public.barquinha_attendance_guide_workers from public,anon,authenticated;
grant select on public.barquinha_attendance_guide_workers to authenticated;
grant insert(guide_id,nome,funcao,ativo),update(nome,funcao,ativo) on public.barquinha_attendance_guide_workers to authenticated;
create policy attendance_guide_workers_read on public.barquinha_attendance_guide_workers for select to authenticated
 using((select private.barquinha_attendance_permitted(array['administrador','recepcao','guia'])));
create policy attendance_guide_workers_create on public.barquinha_attendance_guide_workers for insert to authenticated
 with check(created_by=auth.uid() and (select private.barquinha_attendance_permitted(array['administrador','recepcao'])));
create policy attendance_guide_workers_edit on public.barquinha_attendance_guide_workers for update to authenticated
 using((select private.barquinha_attendance_permitted(array['administrador','recepcao'])))
 with check((select private.barquinha_attendance_permitted(array['administrador','recepcao'])));

-- Remoção física de fotografias restrita ao bucket privado e à recepção autorizada.
create policy attendance_photos_delete on storage.objects for delete to authenticated
 using(bucket_id='barquinha-attendance-photos' and
  (select private.barquinha_attendance_permitted(array['administrador','recepcao'])));

-- Triagem já existente passa também a exigir expediente iniciado.
create or replace function private.barquinha_attendance_require_running_shift()
returns trigger language plpgsql security invoker set search_path=''
as $$
begin
 if new.guide_id is distinct from old.guide_id and old.guide_id is null then
   if not exists(select 1 from public.barquinha_attendance_shifts sh
       where sh.service_date=old.service_date and sh.finished_at is null) then
     raise exception 'Inicie os atendimentos antes de encaminhar da Triagem';
   end if;
   if old.excluded_at is not null then raise exception 'Registro excluído não pode ser encaminhado'; end if;
 end if;
 return new;
end
$$;
drop trigger if exists attendance_require_running_shift on public.barquinha_attendance_visits;
create trigger attendance_require_running_shift before update of guide_id on public.barquinha_attendance_visits
 for each row execute function private.barquinha_attendance_require_running_shift();
