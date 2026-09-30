-- Apenas pessoas ativas com conta Auth podem receber um acesso utilizável.
insert into public.integral_division_access (user_id, system_code, can_view, can_write, own_records_only)
select p.id, 'vendas_estaduais', true, true, true
from public.profiles p join auth.users u on u.id = p.id
where p.is_active is true and lower(p.full_name) <> 'teste'
on conflict do nothing;

-- Reutiliza os líderes regionais explicitamente cadastrados, sem adivinhar estado.
insert into public.integral_division_access
  (user_id, system_code, region_code, can_view, can_write, own_records_only)
select r.user_id, 'lideranca_regional', lower(r.region), true, false, false
from public.dashboard_region_leaders r
join public.profiles p on p.id = r.user_id and p.is_active is true
join auth.users u on u.id = p.id
where lower(r.region) in ('norte','nordeste','centro-oeste','sudeste','sul')
on conflict do nothing;
