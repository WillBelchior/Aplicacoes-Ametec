-- Atendimentos Barquinha - aditivo, preserva pacientes, guias, visitas e eventos.
alter table public.barquinha_attendance_patients
  alter column nascimento drop not null,
  add column if not exists cadastro_modalidade text not null default 'presencial',
  add column if not exists endereco text,
  add column if not exists guide_id uuid references public.barquinha_attendance_guides(id) on delete set null;
alter table public.barquinha_attendance_patients
  add constraint attendance_patient_cadastro_modalidade_check
  check (cadastro_modalidade in ('presencial','distancia','trabalhador')),
  add constraint attendance_patient_remote_address_check
  check (cadastro_modalidade <> 'distancia' or length(trim(coalesce(endereco,''))) >= 5);
alter table public.barquinha_attendance_patients
  add constraint attendance_patient_address_length_check
  check (endereco is null or length(endereco) <= 900);
grant insert(nome,nascimento,telefone,cpf,encaminhamento,cadastro_modalidade,endereco,guide_id),
      update(nome,nascimento,telefone,cpf,encaminhamento,cadastro_modalidade,endereco,guide_id,foto_path)
on public.barquinha_attendance_patients to authenticated;

-- Fichas oficiais independentes por Guia, data e prioridade.
alter table public.barquinha_attendance_visits
 add column if not exists ficha_tipo text,
 add column if not exists ficha_numero integer;
update public.barquinha_attendance_visits v
set ficha_tipo=case when v.prioridade='Normal' then 'N' else 'P' end
where v.ficha_tipo is null;
with numbered as (
 select id,row_number() over (partition by guide_id,service_date,ficha_tipo order by ordem,id) as ticket
 from public.barquinha_attendance_visits where ficha_numero is null
)
update public.barquinha_attendance_visits v
set ficha_numero=n.ticket from numbered n where n.id=v.id;
alter table public.barquinha_attendance_visits
 alter column ficha_tipo set not null,
 alter column ficha_numero set not null,
 add constraint attendance_ficha_tipo_check check(ficha_tipo in ('N','P')),
 add constraint attendance_ficha_numero_positive check(ficha_numero > 0);
create unique index if not exists attendance_ticket_unique_per_guide_day
 on public.barquinha_attendance_visits(service_date,guide_id,ficha_tipo,ficha_numero);
alter table public.barquinha_attendance_visits drop constraint if exists barquinha_attendance_visits_status_check;
alter table public.barquinha_attendance_visits add constraint barquinha_attendance_visits_status_check
 check (status in ('Aguardando','Chamado','Em atendimento','Concluído','Não compareceu','Desistente','Cancelado'));

-- Fechamento independente do gerenciamento de Obras.
create table if not exists public.barquinha_attendance_closures(
 service_date date primary key,
 closed_at timestamptz not null default now(),
 closed_by uuid not null default auth.uid() references auth.users(id)
);
alter table public.barquinha_attendance_closures enable row level security;
revoke all on public.barquinha_attendance_closures from anon,authenticated;
grant select,insert(service_date) on public.barquinha_attendance_closures to authenticated;
create policy attendance_closures_read on public.barquinha_attendance_closures
 for select to authenticated
 using ((select private.barquinha_attendance_permitted(array['administrador','recepcao','guia'])));
create policy attendance_closures_create on public.barquinha_attendance_closures
 for insert to authenticated
 with check (closed_by=(select auth.uid()) and
             (select private.barquinha_attendance_permitted(array['administrador','recepcao'])));

create or replace function private.barquinha_attendance_assign_ticket()
returns trigger language plpgsql security invoker set search_path=''
as $$
declare birth_date date;
begin
 if exists(select 1 from public.barquinha_attendance_closures c where c.service_date=new.service_date) then
   raise exception 'Atendimentos desta data foram encerrados';
 end if;
 select p.nascimento into birth_date from public.barquinha_attendance_patients p where p.id=new.patient_id;
 if birth_date is not null and age(new.service_date,birth_date)>=interval '60 years' and new.prioridade='Normal' then
    new.prioridade='Idoso';
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
drop trigger if exists attendance_assign_ticket on public.barquinha_attendance_visits;
create trigger attendance_assign_ticket before insert on public.barquinha_attendance_visits
 for each row execute function private.barquinha_attendance_assign_ticket();

create or replace function private.barquinha_attendance_block_closed_status()
returns trigger language plpgsql security invoker set search_path=''
as $$
begin
 if exists(select 1 from public.barquinha_attendance_closures c where c.service_date=old.service_date) then
  raise exception 'Atendimentos desta data foram encerrados';
 end if;
 return new;
end
$$;
revoke all on function private.barquinha_attendance_block_closed_status() from public,anon,authenticated;
drop trigger if exists attendance_closed_status_guard on public.barquinha_attendance_visits;
create trigger attendance_closed_status_guard before update of status on public.barquinha_attendance_visits
 for each row execute function private.barquinha_attendance_block_closed_status();
