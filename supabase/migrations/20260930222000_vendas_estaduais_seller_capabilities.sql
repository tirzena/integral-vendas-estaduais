-- Vendas Estaduais: vendedor precisa consultar catálogo e acompanhar as próprias entregas.
-- Mantém company_sales/company_finance fora do cargo; RLS continua limitando linhas e territórios.
create or replace function private.effective_capabilities(_uid uuid)
returns setof text language sql stable security definer set search_path = '' as $$
  select p.key from public.permission_catalog p
  where exists (
    select 1 from public.user_roles ur
    where ur.user_id = _uid and ur.role in ('superadmin','admin')
  )
  or exists (
    select 1
    from public.member_job_assignments a
    join public.job_role_permissions rp
      on rp.job_role_id = a.job_role_id
     and rp.permission_key = p.key
     and (rp.job_level_id = a.job_level_id or rp.job_level_id is null)
    where a.user_id = _uid
      and rp.allowed
      and (
        rp.job_level_id = a.job_level_id
        or not exists (
          select 1
          from public.job_role_permissions level_rule
          where level_rule.job_role_id = a.job_role_id
            and level_rule.job_level_id = a.job_level_id
            and level_rule.permission_key = p.key
        )
      )
  )
  or exists (
    select 1
    from public.user_roles ur
    where ur.user_id = _uid
      and (
        (p.key = 'company_finance' and ur.role = 'financeiro')
        or (p.key = 'company_sales' and ur.role in ('gestor','financeiro'))
        or (p.key = 'manage_team' and ur.role = 'gestor')
        or (p.key = 'manage_suppliers' and ur.role in ('gestor','financeiro','estoque'))
        or (p.key = 'marketing' and ur.role = 'gestor')
        or (p.key = 'inventory_view' and ur.role in ('gestor','financeiro','estoque','vendedor'))
        or (p.key = 'inventory_manage' and ur.role = 'estoque')
        or (p.key = 'deliveries_view' and ur.role in ('gestor','entregador','vendedor'))
        or (p.key = 'deliveries_manage' and ur.role = 'gestor')
        or (p.key = 'tracking_share_own' and ur.role = 'entregador')
      )
  );
$$;
