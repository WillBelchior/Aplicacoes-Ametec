-- Restrição de recepção: autorização presidencial para casos excepcionais.
-- Não altera atendimentos existentes, apenas impede novas entradas sem fluxo de aprovação.
create or replace function private.barquinha_attendance_assign_ticket()
returns trigger language plpgsql security invoker set search_path=''
as $$
declare birth_date date;
begin
 if new.modalidade <> 'presencial' then
   raise exception 'Atendimentos à distância ou de trabalhadores da casa exigem autorização do Presidente. Este fluxo ainda não está habilitado.';
 end if;
 if (now() at time zone 'America/Fortaleza')::time >= time '17:00' then
   raise exception 'Chegadas após 17h exigem autorização do Presidente. Esta operação ainda não está habilitada.';
 end if;
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
drop policy if exists attendance_closures_create on public.barquinha_attendance_closures;
create policy attendance_closures_create on public.barquinha_attendance_closures
 for insert to authenticated
 with check (
 closed_by=(select auth.uid())
 and service_date=((now() at time zone 'America/Fortaleza')::date)
 and (select private.barquinha_attendance_permitted(array['administrador','recepcao']))
 );
