alter table public.integral_sync_log drop constraint integral_sync_log_status_check;
alter table public.integral_sync_log add constraint integral_sync_log_status_check
 check(status in ('pending','applied','rejected','identity_connected','connection_verified','completed'));
