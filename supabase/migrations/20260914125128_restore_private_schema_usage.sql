-- O cofre revogou o acesso ao schema private por completo. As funcoes publicas
-- de permissoes sao SECURITY INVOKER e precisam de USAGE no schema para chamar
-- private.effective_capabilities. USAGE nao concede leitura das tabelas do cofre.
GRANT USAGE ON SCHEMA private TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.effective_capabilities(uuid) TO authenticated, service_role;
