# Encerramento de sessões após troca de senha

Implementação de 21/10/2026, Direção Geral e Vendas Estaduais.

- Configurações e recuperação de senha usam o mesmo fluxo: atualizar a senha, executar signOut com escopo global e retornar a /auth. Não entrar automaticamente no painel após recuperar a senha.
- Troca administrativa usa updateUserById. O serviço Supabase Auth encerra todas as sessões do usuário ao alterar sua senha sem uma sessão corrente; a troca pelo próprio usuário encerra as demais, e o logout global encerra também a corrente.
- Um observador compartilhado verifica a existência da sessão atual a cada 15 segundos quando visível e ao retornar ao foco/ficar online. Não cria consultas de negócio nem invalidação global de cache no foco.
- Sessão revogada limpa cache e modo espelho e retorna ao login. Falha de rede isolada não prova revogação e não provoca logout.
- As funções de servidor protegidas também recusam sessão revogada, além de validar assinatura e concessão. A RPC consulta apenas o session_id e usuário do JWT; não aceita identificadores externos e não expõe a tabela auth.sessions.

Segurança: a função SECURITY DEFINER é necessária para consulta restrita à tabela de sessões do Auth. EXECUTE revogado de PUBLIC/anon; authenticated recebe apenas boolean sobre a própria sessão. O aviso informativo de função autenticada é intencional e revisado: https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable .

Validação: oito testes de regressão por projeto; fixture SQL em docs/sql/tests/password-session-revocation-rollback.sql cobre sessão própria ativa, sessão de outra conta, ausência de session_id, token de sessão removida e bloqueio anônimo. Todos os registros da fixture são novos e sofrem rollback. Nenhuma senha de conta real foi alterada para testar.

Limites: abas suspensas/offline verificam ao retornar à atividade/conexão. JWTs são independentes da sessão; a checagem explícita cobre as funções de servidor acima. Rotas diretas de REST/Storage continuam com sua política de autorização e prazo do JWT, e não foi alterada toda a RLS neste ajuste. Publicação Git não comprova implantação Hostinger; teste em vários dispositivos reais após implantação permanece necessário.

Dependências: durante a CI foi identificado alerta alto do Vite 8.1.5 (launch-editor); atualizado para 8.3.5 nos dois projetos e repetidos testes/builds. Não removido nem ignorado o bloqueio de auditoria.

Referências: https://supabase.com/docs/guides/auth/sessions e https://supabase.com/docs/reference/javascript/auth-signout .
