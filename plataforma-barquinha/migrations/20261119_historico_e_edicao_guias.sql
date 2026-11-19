-- Barquinha: editar Guias sem alterar o histórico nominal de visitas já registradas.
-- Exclusões e alterações nas tabelas de Projetos não são executadas.
alter table public.barquinha_attendance_visits
  add column if not exists guia_nome_registro text;

-- Os atendimentos anteriores mantêm a referência textual disponível na migração.
update public.barquinha_attendance_visits v
set guia_nome_registro = g.nome
from public.barquinha_attendance_guides g
where g.id=v.guide_id and v.guia_nome_registro is null;

create or replace function private.barquinha_attendance_snapshot_guide()
returns trigger language plpgsql security invoker set search_path=''
as $$
begin
  select g.nome into new.guia_nome_registro
  from public.barquinha_attendance_guides g
  where g.id=new.guide_id;
  if new.guia_nome_registro is null then
    raise exception 'Guia não encontrado para registrar atendimento';
  end if;
  return new;
end
$$;
revoke all on function private.barquinha_attendance_snapshot_guide() from public,anon,authenticated;
drop trigger if exists attendance_guide_snapshot on public.barquinha_attendance_visits;
create trigger attendance_guide_snapshot
before insert on public.barquinha_attendance_visits
for each row execute function private.barquinha_attendance_snapshot_guide();

alter table public.barquinha_attendance_guides enable row level security;
grant update(nome,cor,ativo) on public.barquinha_attendance_guides to authenticated;
drop policy if exists attendance_guides_edit on public.barquinha_attendance_guides;
create policy attendance_guides_edit
on public.barquinha_attendance_guides for update to authenticated
using ((select private.barquinha_attendance_permitted(array['administrador','recepcao'])))
with check ((select private.barquinha_attendance_permitted(array['administrador','recepcao'])));
