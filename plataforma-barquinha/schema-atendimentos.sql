-- Atendimentos Barquinha • módulo isolado (sem alterar tabelas de Projetos).
-- Dados de pacientes: acesso exclusivamente a usuários com permissão neste módulo.
create schema if not exists private;

create table if not exists public.barquinha_attendance_access (
  user_id uuid primary key references auth.users(id) on delete cascade,
  access_role text not null default 'recepcao' check (access_role in ('administrador','recepcao','guia')),
  enabled boolean not null default true,
  granted_at timestamptz not null default now()
);
alter table public.barquinha_attendance_access enable row level security;
revoke all on public.barquinha_attendance_access from anon, authenticated;
grant select on public.barquinha_attendance_access to authenticated;
create policy attendance_access_self_select on public.barquinha_attendance_access
 for select to authenticated using (user_id=(select auth.uid()));

-- Inicialização: somente membros já ativos na Plataforma; não conceder acesso a usuários novos automaticamente.
insert into public.barquinha_attendance_access(user_id,access_role)
select user_id, 'recepcao' from public.barquinha_members where status='active'
on conflict (user_id) do nothing;

-- SECURITY INVOKER respeita RLS de barquinha_members e attendance_access; nenhuma bypass RLS.
create or replace function private.barquinha_attendance_permitted(p_roles text[])
returns boolean language sql stable security invoker set search_path=''
as $$
 select exists (
  select 1
  from public.barquinha_attendance_access a
  join public.barquinha_members m on m.user_id=a.user_id
  where a.user_id=(select auth.uid()) and a.enabled
    and m.status='active'
    and a.access_role=any(p_roles)
 );
$$;
revoke all on function private.barquinha_attendance_permitted(text[]) from public,anon;
grant usage on schema private to authenticated;
grant execute on function private.barquinha_attendance_permitted(text[]) to authenticated;

create table if not exists public.barquinha_attendance_guides (
 id uuid primary key default gen_random_uuid(),
 nome text not null check (length(trim(nome)) between 2 and 120),
 cor text not null default '#467C9C' check (cor ~ '^#[0-9a-fA-F]{6}$'),
 ativo boolean not null default true,
 created_at timestamptz not null default now(),
 created_by uuid not null default auth.uid() references auth.users(id)
);
create unique index if not exists barquinha_att_guides_nome_unique on public.barquinha_attendance_guides(lower(trim(nome)));
alter table public.barquinha_attendance_guides enable row level security;
revoke all on public.barquinha_attendance_guides from anon,authenticated;
grant select,insert(nome,cor,ativo) on public.barquinha_attendance_guides to authenticated;
create policy attendance_guides_read on public.barquinha_attendance_guides for select to authenticated
 using ((select private.barquinha_attendance_permitted(array['administrador','recepcao','guia'])));
create policy attendance_guides_add on public.barquinha_attendance_guides for insert to authenticated
 with check (created_by=(select auth.uid()) and (select private.barquinha_attendance_permitted(array['administrador','recepcao'])));

create table if not exists public.barquinha_attendance_patients (
 id uuid primary key default gen_random_uuid(),
 nome text not null check(length(trim(nome)) between 2 and 160),
 nascimento date not null,
 telefone text check(telefone is null or length(telefone)<=40),
 cpf text unique check(cpf is null or cpf ~ '^[0-9]{11}$'),
 encaminhamento text check(encaminhamento is null or length(encaminhamento)<=250),
 foto_path text,
 created_at timestamptz not null default now(),
 created_by uuid not null default auth.uid() references auth.users(id)
);
create index if not exists barquinha_att_patients_name on public.barquinha_attendance_patients(lower(nome));
alter table public.barquinha_attendance_patients enable row level security;
revoke all on public.barquinha_attendance_patients from anon,authenticated;
grant select,insert(nome,nascimento,telefone,cpf,encaminhamento),update(foto_path) on public.barquinha_attendance_patients to authenticated;
create policy attendance_patients_read on public.barquinha_attendance_patients for select to authenticated
 using ((select private.barquinha_attendance_permitted(array['administrador','recepcao','guia'])));
create policy attendance_patients_add on public.barquinha_attendance_patients for insert to authenticated
 with check(created_by=(select auth.uid()) and (select private.barquinha_attendance_permitted(array['administrador','recepcao'])));
create policy attendance_patients_photo on public.barquinha_attendance_patients for update to authenticated
 using ((select private.barquinha_attendance_permitted(array['administrador','recepcao'])))
 with check ((select private.barquinha_attendance_permitted(array['administrador','recepcao'])));

create table if not exists public.barquinha_attendance_visits (
 id uuid primary key default gen_random_uuid(),
 ordem bigint generated always as identity,
 patient_id uuid not null references public.barquinha_attendance_patients(id) on delete restrict,
 guide_id uuid not null references public.barquinha_attendance_guides(id) on delete restrict,
 service_date date not null default ((now() at time zone 'America/Fortaleza')::date),
 modalidade text not null default 'presencial' check (modalidade in ('presencial','distancia','trabalhador')),
 prioridade text not null default 'Normal' check (prioridade in ('Normal','Idoso','Gestante','Deficiência','Outra')),
 status text not null default 'Aguardando' check (status in ('Aguardando','Chamado','Em atendimento','Concluído','Não compareceu','Cancelado')),
 created_at timestamptz not null default now(),
 status_changed_at timestamptz not null default now(),
 created_by uuid not null default auth.uid() references auth.users(id)
);
create index if not exists barquinha_att_visits_day_guide_order on public.barquinha_attendance_visits(service_date,guide_id,ordem);
create index if not exists barquinha_att_visits_patient_history on public.barquinha_attendance_visits(patient_id,created_at desc);
alter table public.barquinha_attendance_visits enable row level security;
revoke all on public.barquinha_attendance_visits from anon,authenticated;
grant select,insert(patient_id,guide_id,modalidade,prioridade),update(status) on public.barquinha_attendance_visits to authenticated;
create policy attendance_visits_read on public.barquinha_attendance_visits for select to authenticated
 using ((select private.barquinha_attendance_permitted(array['administrador','recepcao','guia'])));
create policy attendance_visits_add on public.barquinha_attendance_visits for insert to authenticated
 with check (created_by=(select auth.uid()) and (select private.barquinha_attendance_permitted(array['administrador','recepcao'])));
create policy attendance_visits_status on public.barquinha_attendance_visits for update to authenticated
 using ((select private.barquinha_attendance_permitted(array['administrador','recepcao','guia'])))
 with check ((select private.barquinha_attendance_permitted(array['administrador','recepcao','guia'])));

create table if not exists public.barquinha_attendance_events(
 id bigint generated always as identity primary key,
 visit_id uuid not null references public.barquinha_attendance_visits(id) on delete restrict,
 previous_status text,
 next_status text not null,
 changed_at timestamptz not null default now(),
 actor_id uuid references auth.users(id)
);
create index if not exists barquinha_att_events_visit_idx on public.barquinha_attendance_events(visit_id,changed_at);
alter table public.barquinha_attendance_events enable row level security;
revoke all on public.barquinha_attendance_events from anon,authenticated;
grant select on public.barquinha_attendance_events to authenticated;
create policy attendance_events_read on public.barquinha_attendance_events for select to authenticated
 using ((select private.barquinha_attendance_permitted(array['administrador','recepcao','guia'])));

-- Trilha de auditoria gerada no banco, não alterável pelo navegador.
create or replace function private.barquinha_attendance_audit_status()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
 if tg_op='INSERT' then
  insert into public.barquinha_attendance_events(visit_id,previous_status,next_status,actor_id)
   values(new.id,null,new.status,auth.uid());
 elsif new.status is distinct from old.status then
  new.status_changed_at=now();
  insert into public.barquinha_attendance_events(visit_id,previous_status,next_status,actor_id)
   values(new.id,old.status,new.status,auth.uid());
 end if;
 return new;
end
$$;
revoke all on function private.barquinha_attendance_audit_status() from public,anon,authenticated;
create trigger attendance_status_audit before insert or update of status on public.barquinha_attendance_visits
 for each row execute function private.barquinha_attendance_audit_status();

-- Fotografias privadas dos pacientes (2 MB, somente JPG, sem exclusão/upsert via cliente).
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('barquinha-attendance-photos','barquinha-attendance-photos',false,2097152,array['image/jpeg'])
on conflict(id) do nothing;
create policy attendance_photos_read on storage.objects for select to authenticated using
 (bucket_id='barquinha-attendance-photos' and
  (select private.barquinha_attendance_permitted(array['administrador','recepcao','guia'])));
create policy attendance_photos_add on storage.objects for insert to authenticated with check
 (bucket_id='barquinha-attendance-photos'
  and (select private.barquinha_attendance_permitted(array['administrador','recepcao']))
  and name ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.]jpg$'
  and exists(select 1 from public.barquinha_attendance_patients p where p.id::text=split_part(name,'/',1)));
