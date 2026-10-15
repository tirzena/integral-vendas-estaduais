# Comissões por venda

Nos novos pedidos, a regra mais específica substitui as regras mais amplas: produto > subcategoria > categoria > geral. Os acordos ativos no mesmo nível são somados. Sem acordo aplicável, permanece a comissão padrão do item/pedido.

Percentuais incidem sobre o valor do item após seu desconto. Valor fixo por venda é cobrado uma vez e rateado entre os itens abrangidos; valores em outras moedas usam a cotação congelada do pedido. Acordos diários, semanais e mensais ficam separados desta automação.

Cada novo pedido guarda os acordos e os escopos aplicados. Revisões preservam esses acordos; alterar um contrato afeta pedidos futuros. A troca do vendedor em um novo pedido recalcula usando os acordos do responsável selecionado. Pedidos históricos sem registro de acordos não são recalculados.

A folha usa a comissão registrada no pedido, libera proporcionalmente aos pagamentos confirmados, desconta retiradas e exclui versões substituídas, cancelamentos e pré-pedidos. A prévia do lançamento usa a mesma regra do servidor.

Validação: 16 blocos anteriores de regressão SQL; precedência, fallback, conversão, valor fixo rateado, criação idempotente, pagamento parcial, revisão, preservação de histórico e autorização da prévia; 3 testes de folha. Migração aplicada no projeto canônico wyutdvttldxkaqqysiuv. Nenhum pedido histórico recebeu contratos retroativamente e os dados de teste foram revertidos.

As alterações de interface precisam ser publicadas no ambiente de hospedagem para aparecer na aplicação. Esta alteração não implanta o aplicativo na Hostinger.

Verificações de acesso: a tabela privada não tem acesso de clientes e mantém RLS sem políticas por não ser consultada diretamente. A prévia autenticada é SECURITY DEFINER e valida o ator, o vendedor e o pedido; o aviso [de execução autenticada](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable) é esperado para essa RPC autorizada. As funções internas não podem ser executadas por clientes.

Os builds de produção passaram nos dois projetos. A checagem de tipos geral ainda aponta problemas anteriores fora dos arquivos desta alteração.
