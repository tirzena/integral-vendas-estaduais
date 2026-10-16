-- Trigger context predicates are read-only. Only the trusted backend gains EXECUTE; anonymous access remains denied.
grant execute on function private.seller_in_creation() to service_role;
grant execute on function private.profile_in_edit() to service_role;
