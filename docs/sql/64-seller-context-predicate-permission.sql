-- Invoker triggers evaluate only a boolean for auth.uid(), backend and transaction.
-- No access to private context rows or authority to create a context is granted.
grant execute on function private.seller_in_creation() to authenticated;
revoke all on function private.seller_in_creation() from anon;
