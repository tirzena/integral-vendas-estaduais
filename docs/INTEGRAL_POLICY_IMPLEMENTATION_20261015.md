# Integração de permissões e fluxos — 15/10/2026

## Implementado neste conjunto

- Cadastro de membro em cinco etapas na Visão Interna, com múltiplos perfis, cargos e níveis, divisões, categorias, exclusões, estoques e múltiplos acordos de remuneração por categoria/subcategoria.
- Link individual de ativação para definir senha; a senha fixa compartilhada foi removida do novo cadastro.
- Configuração de dados vinculados em transação no banco; falhas na configuração/ativação tentam remover a conta recém-criada. Uma falha de recuperação identifica a conta para intervenção administrativa.
- Membros fica como listagem com pesquisa e filtros de cargo e situação; cadastro e editor de concessões ficam na Visão Interna.
- Catálogo central ampliado com 25 operações. As chamadas de criação de clientes/oportunidades/pedidos e lançamentos de pagamento verificam as permissões centrais. As políticas antigas não foram globalmente substituídas.
- Concessões existentes preservadas. O editor manual conserva ausências de vínculos como exclusões, e exige salvar para mudar as concessões. Novos cadastros/configurações verificam estoque separado de produto.
- Detalhes e editor de pedidos carregam dados atuais via RPC autorizada. Editar/excluir foram retirados dos cartões externos. O novo editor funciona sem depender do checkout exclusivo de criação do vendedor.
- Alterações de pedidos com pagamento confirmado ou envio iniciado geram solicitação com justificativa e dados anteriores/propostos. Aprovação exige outro administrador e nova validação do estado atual.
- Revisões preservam número, histórico e pagamentos. Pedidos com estoque proporcional reconciliam a fração baixada, reservas e pagamentos seguintes em transação.
- Lançar pagamento ganhou formulário independente com identificação, total, pago, saldo, valor, moeda aplicável, câmbio registrado, data, forma, comprovante por link e observações. Repetições usam chave de idempotência no servidor.
- Pagamentos informados pelo vendedor mantêm a conferência financeira existente. O bloqueio comercial começa no primeiro pagamento confirmado.
- Geral passa a usar os fluxos autorizados de vendedor para clientes, oportunidades e criação de pedidos. Criação de cliente/pedido foi testada sem duplicação em repetição.
- Estadual pagina pedidos e itens, sem usar 500 como total, e mostra falhas dos detalhes em vez de uma janela vazia.
- Ranking seguro do portal também exclui Zé e Junior.

## Banco e recuperação

Backend: wyutdvttldxkaqqysiuv. Antes das alterações foi criada uma cópia das definições de funções, políticas e concessões em private.integral_policy_backups, rótulo before_unified_permissions_20261015. Não é um backup completo dos dados comerciais.

As alterações foram aplicadas por migrações nomeadas na ferramenta do Supabase. As definições reproduzíveis para revisão estão em docs/sql/integral-policy/; a numeração indica a ordem lógica. Não executar novamente às cegas em produção.

Foram introduzidas integral_member_rules, order_change_requests e tabelas privadas de backup/idempotência, com RLS/ACL; os RPCs públicos novos não permitem execução por anon. A configuração de nova conta é exclusiva do servidor.

## Validação realizada

- 11 casos SQL em tests/integral-policy-regression.sql, executados com fixtures controladas e ROLLBACK: cadastro, concessões/exclusões, edição administrativa, edição do vendedor, pagamento idempotente, solicitação/rejeição, aprovação preservando pagamento, estoque proporcional, pagamento posterior, criação de pedido com cliente e CRM.
- Consulta do próprio pedido e rejeição de acesso a pedido de outro vendedor.
- Recusa de lançamento por perfil sem permissão; compatibilidade do Financeiro verificada com conta e pedido fictícios.
- Conferência de inexistência de contas de teste remanescentes e preservação dos vínculos reais.
- Builds de produção Geral e Estadual passaram. Lint dos arquivos alterados sem erros; dependências de useMemo no CRM ajustadas.
- Typecheck global foi executado e encontrou erros anteriores em StockEntryDialog e painel; não foram tratados como validação aprovada do projeto inteiro.
- Advisors de segurança consultados; não equivale a afirmar ausência de avisos anteriores no projeto.

## Limites e pendências para considerar todo o documento concluído

- Implantação e teste de interface nos domínios da Hostinger ainda não confirmados: a sessão não expõe ferramentas operacionais da Hostinger, embora haja configuração dos servidores.
- Login/ativação real e testes de interface com os seis perfis ainda não foram feitos ponta a ponta; testes SQL não substituem testes de sessão e navegador.
- A união completa de cargos e a matriz de RLS/operações de todos os módulos e dos outros seis portais ainda precisam de auditoria e integração. O conjunto não substitui globalmente as políticas existentes.
- A seleção explícita de acesso à Direção Geral, regras de município/registro por operação e todas as restrições administrativas precisam de revisão transversal.
- Remuneração por item individual do estoque e todo o fluxo de folha/comissões não foram concluídos neste conjunto; os acordos atuais por categoria/subcategoria foram preservados.
- Clientes/oportunidades tiveram criação e movimentação corrigidas; edição/exclusão completa de todos os campos e autorizações ainda requer integração.
- Auditoria histórica integral de dashboard, financeiro, estoque e todos os relatórios ainda não foi concluída. Não foi apagado histórico comercial para corrigir visualização.
- Existem 12 vendedores sem warehouse_user_assignments. Nenhum estoque foi atribuído ou revogado automaticamente. A regularização deve ocorrer manualmente no editor administrativo.

Uma alteração inicialmente proposta para compatibilidade de Financeiro/Gestores foi rejeitada pela revisão automática. Após inspecionar as funções existentes, foi aplicada a alternativa que delega aos mesmos predicados de autorização já vigentes, sem conceder novos cargos nem remover as restrições dos vendedores.
