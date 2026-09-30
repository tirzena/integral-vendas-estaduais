# Auditoria do OS — 11/09/2026

## Escopo e método

Auditoria exclusiva do repositório **OS** e do projeto Supabase `wyutdvttldxkaqqysiuv`. O deppeshop não faz parte desta análise.

Foram verificados:

- código das telas, funções e migrações;
- esquema exposto pelo banco ativo;
- contagens e consistência dos dados ativos;
- compilação, testes e lint;
- tamanho dos módulos gerados.

A automação visual do navegador não respondeu após duas tentativas. Por isso, itens classificados como “implementados” foram confirmados por código e banco, mas ainda precisam de um teste manual autenticado para serem classificados como “validados de ponta a ponta”.

## Resultado executivo

O sistema compila e as principais funções pedidas existem. As divergências de pedidos, membros, numeração e reservas encontradas nesta auditoria foram corrigidas. A pendência operacional restante é aplicar no banco ativo a migração de comissão, limite de desconto e número separado do endereço. Também permanecem o teste visual autenticado e a revisão dedicada das políticas de acesso.

## Correções executadas após a auditoria

Em 11/09/2026, após cópia de segurança dos registros afetados:

- cinco pedidos idênticos criados antes do pedido corrigido #26 foram removidos por exclusão lógica;
- o pedido com pagamento parcial foi sincronizado com a aba `pagamento_parcial`;
- os saldos reservados foram recalculados por pedido e por estoque; os três produtos agora têm divergência zero;
- os 26 pedidos ativos foram numerados de #01 a #26, sem repetição, e o contador foi sincronizado;
- as referências de João Vitor foram transferidas para Jorge Luiz, permissões repetidas foram removidas e o perfil/login antigo foi excluído;
- foi preparada uma restrição de banco para impedir novos números ativos repetidos;
- o fluxo de exclusão foi ajustado para reconciliar também reservas por estoque;
- enquanto a migração comercial não puder ser aplicada, a página de produtos usa os campos existentes e deixa indisponíveis somente os controles que dependem das novas colunas.
- as 55 chamadas de validação do servidor foram atualizadas para a API atual, removendo os avisos de depreciação da compilação sem alterar os fluxos.
- a lista de contatos passou a validar o filtro de categoria salvo no navegador, aguardar o carregamento das categorias e oferecer nova tentativa em falhas de conexão;
- o pedido do catálogo preserva a mesma chave ao repetir uma tentativa, evitando duplicar o pedido quando o vínculo posterior com a lista de contatos falhar.

A migração comercial continua pendente no banco ativo porque a conta Supabase disponível não possui privilégio para vincular e atualizar o projeto pelo CLI. O arquivo permanece versionado e pronto para aplicação.

## Situação dos dados ativos

- 58 registros de pedidos no histórico.
- 26 pedidos atuais, desconsiderando excluídos e versões substituídas.
- Situações atuais: 4 pedidos feitos, 4 em caminho, 3 esperando pagamento, 4 em pagamento parcial, 8 pagos e 3 cancelados.
- Situação financeira: 11 a pagar, 4 parciais, 8 pagos e 3 cancelados.
- 13 pagamentos e 14 comprovantes registrados.
- 4 estoques e 7 saldos por estoque.
- 201 movimentos de estoque.
- 1 catálogo digital e 2 listas de contatos.
- 3 eventos de entrega e nenhuma atribuição ativa a entregador.
- O cofre de acessos e as regras de bonificação existem, mas ainda não têm registros.

### Inconsistências encontradas

| Item                                                   | Gravidade | Evidência                                                                                                                        |
| ------------------------------------------------------ | --------: | -------------------------------------------------------------------------------------------------------------------------------- |
| Comissão não persiste                                  |   Crítica | O código envia comissão por pedido e por item, mas o banco não possui as colunas correspondentes.                                |
| Limite de desconto por subcategoria/produto incompleto |   Crítica | `product_categories` não possui os campos novos e `inventory_items` não possui `max_discount_percent`.                           |
| Número do endereço separado não persiste               |      Alta | O formulário separa rua e número, mas o banco ainda guarda ambos em `shipping_address`.                                          |
| Pedido parcial fora da aba                             | Corrigida | Situação financeira e aba foram sincronizadas.                                                                                   |
| Reservas de estoque divergentes                        | Corrigida | Os três produtos estão com divergência zero.                                                                                     |
| Numeração repetida                                     | Corrigida | Os 26 pedidos ativos estão numerados de #01 a #26, sem repetição.                                                                |
| Consolidação de vendedores incompleta                  | Corrigida | Referências foram transferidas para Jorge Luiz e o perfil/login antigo foi removido.                                             |
| Lint acumulado                                         |     Média | Após excluir arquivos gerados e temporários da análise: 782 erros e 28 avisos em 93 arquivos, em grande parte formatação antiga. |
| Componentes excessivamente grandes                     |     Média | Catálogo 2.309 linhas, Pedidos 2.255, Hierarquia 2.218, PDV 1.957 e Produtos 1.406.                                              |
| Pouca cobertura automática                             |     Média | Apenas 13 testes, todos focados na importação de fornecedores.                                                                   |

## Conferência das solicitações

### Pedidos e pagamentos

| Solicitação                                                   | Estado                         | Observação                                                                                       |
| ------------------------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------ |
| Abas Pago, Pagamento parcial e Cancelado                      | Implementado                   | Abas, contadores e dados estão sincronizados.                                                    |
| Mudança de status mover o pedido entre abas                   | Implementado                   | Feito pelas funções de fluxo; depende da consistência dos dois campos de status.                 |
| Remover ações repetidas de “marcar pago”                      | Implementado                   | A baixa foi concentrada nos detalhes e o status usa o mesmo fluxo.                               |
| Editar pedido e preservar versão anterior                     | Implementado                   | Cria nova versão, mantém snapshot, motivo, autor e horário.                                      |
| Excluir pedido                                                | Implementado                   | Exclusão lógica com motivo e reparo de reserva antes de tentar novamente.                        |
| Histórico geral e por pedido                                  | Implementado                   | A lista de histórico abre a versão selecionada.                                                  |
| Link sigiloso e detalhado por pedido                          | Implementado                   | Usa token não previsível; o acesso é concedido a quem possui o link.                             |
| Nota do cliente e nota interna diferentes                     | Implementado                   | A nota do cliente omite fornecedor, estoque, custo, margem e lucro.                              |
| Formato de impressão no filtro e no pedido                    | Implementado                   | A4/PDF, 80 mm e 58 mm disponíveis nos dois pontos.                                               |
| Relatório por aba ou por todos os pedidos                     | Implementado                   | Respeita filtros e aba. Nesta auditoria foi adicionado download em PDF, além de planilha e link. |
| Ordenação mais recente, mais antiga e A-Z                     | Implementado                   | Padrão é o pedido mais recente.                                                                  |
| Pagamento parcial                                             | Implementado no banco          | O banco aceita `parcial`; os registros ativos foram sincronizados com a aba correspondente.      |
| Comprovante por arquivo, foto ou link                         | Implementado                   | Obrigatório para meios sem dinheiro.                                                             |
| Excluir comprovante enviado por engano                        | Implementado                   | Permitido enquanto não estiver ligado a uma baixa.                                               |
| Editar ou cancelar pagamento                                  | Implementado                   | Mantém o registro cancelado e grava motivo no histórico.                                         |
| Pagamento em dinheiro com recibo                              | Implementado no código e banco | Gera token, comprovante interno e página de recibo. Ainda requer teste autenticado final.        |
| Cotação da criação e de cada pagamento                        | Implementado                   | Snapshot e origem aparecem no detalhe, link e impressão.                                         |
| Preço unitário no pedido e valor pago por unidade             | Implementado                   | Campos aparecem no detalhe; o valor pago é calculado conforme as baixas.                         |
| Numeração única e crescente                                   | Parcial                        | Dados renumerados; a restrição preparada ainda precisa ser aplicada no banco remoto.             |
| Comissão opcional por produto                                 | Parcial                        | Interface pronta; persistência bloqueada pela migração ausente.                                  |
| Comissão e desconto definidos em categoria/produto            | Parcial                        | Interface pronta; colunas do banco ausentes.                                                     |
| Rua e número separados                                        | Parcial                        | Interface pronta; compatibilidade atual concatena ambos para não impedir pedidos.                |
| CEP preenchendo endereço                                      | Implementado                   | Busca no formulário de pedido.                                                                   |
| Cliente, vendedor e destinatário com preenchimento automático | Implementado                   | Seletores por nome e opção de repetir dados do cliente.                                          |
| Vendedores limitados à equipe; administrador vê todos         | Implementado                   | A seleção usa `sales_seller_options`.                                                            |
| Frete 20% SP e 25% demais regiões, editável                   | Implementado                   | Duas regras estão ativas e o percentual/valor pode ser alterado.                                 |
| Custos variáveis, custo, frete e lucro bruto                  | Implementado                   | Presentes no pedido, relatório interno e cálculo financeiro.                                     |

### Estoque, fornecedores e financeiro

| Solicitação                                                   | Estado       | Observação                                                                             |
| ------------------------------------------------------------- | ------------ | -------------------------------------------------------------------------------------- |
| Estoque principal abastecido por compra com custo             | Implementado | Compra gera movimento e conta a pagar.                                                 |
| Estados/cidades abastecidos por transferência                 | Implementado | Transferência interna não duplica custo de compra.                                     |
| Estoques disponíveis no pedido                                | Implementado | O seletor usa a função `sales_warehouses` e sinaliza saldo insuficiente.               |
| Aviso de estoque principal baixo                              | Implementado | Aparece na dashboard e no pedido.                                                      |
| Cancelamento sugerir estoque próximo e permitir troca         | Implementado | Sugestão por cidade/estado, com seleção manual.                                        |
| Bonificação de fornecedor por quantidade, percentual ou valor | Implementado | Regras, compra, fornecedor e resumo financeiro existem. Ainda não há regra cadastrada. |
| Valor mensal a pagar ao fornecedor líquido da bonificação     | Implementado | A compra considera somente a quantidade paga.                                          |
| Custo da venda refletido no financeiro                        | Implementado | Custo dos produtos, frete, variável e lucro bruto são calculados.                      |
| Consistência das reservas                                     | Corrigida    | Reservas por estoque e totais estão iguais aos pedidos ativos.                         |

### Entregas

| Solicitação                                                     | Estado       | Observação                                                                                   |
| --------------------------------------------------------------- | ------------ | -------------------------------------------------------------------------------------------- |
| Remover “Esperando pagamento” da entrega                        | Implementado | As etapas são ajuste, saiu para entrega, chegando, entregue e cancelado.                     |
| Não mostrar cliente nem valores à entrega                       | Implementado | Cartão e detalhe usam destinatário e informações logísticas.                                 |
| Ordem clicável com destinatário, CPF, retirada, destino e itens | Implementado | Inclui CEP, cidade, estado, observações e quantidades.                                       |
| Link e PDF da ordem                                             | Implementado | PDF é gerado diretamente; não usa Excel.                                                     |
| Rastreio ativado por permissão                                  | Implementado | Controle de visualização e regras por perfil.                                                |
| QR Code no pedido e na ordem                                    | Implementado | O mesmo token acompanha os dois pontos.                                                      |
| Leitura do QR dar baixa e botão manual                          | Implementado | Scanner e baixa manual usam funções auditadas.                                               |
| Área do entregador                                              | Parcial      | A consulta por atribuição existe, mas atualmente há zero entregas atribuídas a entregadores. |

### Hierarquia, membros e acessos

| Solicitação                                      | Estado       | Observação                                                                       |
| ------------------------------------------------ | ------------ | -------------------------------------------------------------------------------- |
| Visão geral e Cadeia atual                       | Implementado | “Cadeia completa” e “Camadas” foram retiradas da navegação.                      |
| Abas por área                                    | Implementado | Governança, Comercial, Operações, Marketing e TI e Administração.                |
| Consolidar João Turco e João Vitor em Jorge Luiz | Concluído    | João Vitor foi consolidado em Jorge Luiz; João Turco não existia no banco atual. |
| Cofre de acessos com permissões                  | Implementado | Senhas cifradas, controle de revelar/editar e auditoria. Ainda sem registros.    |

### Catálogo

| Solicitação                                                | Estado       | Observação                                                                        |
| ---------------------------------------------------------- | ------------ | --------------------------------------------------------------------------------- |
| Carrossel com imagens, vídeos e links sociais              | Implementado | Configuração fica em arquivo privado no Storage e é servida por URLs temporárias. |
| Grupo de informações por produto                           | Implementado | Link configurável por produto.                                                    |
| Escolher vendedor e abrir WhatsApp                         | Implementado | Lista vendedores ativos e usa o número cadastrado.                                |
| Calcular frete em 25% SP e 30% demais regiões              | Implementado | Cálculo usa custo internamente sem revelar o custo ao cliente.                    |
| Pedido mínimo de 10 unidades                               | Implementado | Validado na tela, no servidor e no banco.                                         |
| Preço identificado como atacado                            | Implementado | Texto explícito no catálogo.                                                      |
| Criar lista de contatos por catálogo e registrar comprador | Implementado | O checkout registra/atualiza o contato e vincula à lista do catálogo.             |

### Chat interno

A integração com Session não foi implementada. O chat interno atual é próprio do OS. A conversa anterior sobre Session e alternativas foi tratada como estudo de possibilidade, sem uma decisão técnica autorizada para substituir o chat.

## Otimizações realizadas nesta auditoria

- estabilização das coleções e mapas do catálogo para evitar recálculos em renderizações;
- agrupamento indexado dos itens dos pedidos, evitando percorrer todas as linhas para cada card;
- remoção de linhas vazias no arquivo de entregas;
- exclusão de arquivos gerados e temporários da verificação de lint;
- inclusão de PDF real no componente comum de relatórios, disponível também para pedidos.

## Desempenho e manutenção

A compilação passa, mas os maiores módulos ainda são pesados:

- leitor de QR: aproximadamente 878 kB no pacote do servidor;
- roteador: 645 kB;
- gráficos: 570 kB;
- gerador de PDF: 478 kB;
- página de produtos: 278 kB;
- página de pedidos: 190 kB.

QR e PDF já são carregados sob demanda no navegador. Os maiores ganhos seguintes virão da divisão dos cinco componentes acima de 1.400 linhas e da troca gradual de consultas `select("*")` por colunas explícitas. Essa refatoração deve ser feita por módulo, com testes de regressão, para não reabrir erros de campos ausentes.

As migrações antigas também contêm políticas RLS amplas com condições `USING (true)`. Não foi possível consultar o Security Advisor nem as políticas efetivamente ativas com a conta disponível, portanto isso deve passar por uma revisão dedicada no banco antes de ampliar o acesso de usuários externos.

Uma verificação anônima direta no banco ativo não retornou registros de pedidos, pagamentos, comprovantes, cofre de acessos, perfis, estoque, chat ou sessões de rastreamento. As funções de pedido compartilhado e recibo também não expuseram dados quando chamadas com token aleatório. Esse teste confirma o bloqueio público dessas rotas; ele não substitui a revisão das permissões entre usuários autenticados e cargos diferentes.

## Validações executadas

- Compilação de produção: aprovada.
- Testes automatizados: 13 de 13 aprovados.
- Validação isolada da atualização dos validadores: sem erros; permanecem pendências antigas de formatação e tipagem no lint completo.
- Avisos de `inputValidator` obsoleto: eliminados da compilação.
- Banco ativo: tabelas, colunas, funções e contagens verificadas via API administrativa.
- Acesso anônimo às tabelas sensíveis e links com token aleatório: nenhum dado exposto.
- Login `tirzenavendedor2@gmail.com`: usuário confirmado, não bloqueado e com login recente em 11/09/2026.

## Próxima ordem recomendada

1. aplicar a migração `20260911174309_order_item_commissions_and_discount_limits.sql` com uma conta que tenha acesso ao projeto Supabase;
2. aplicar a migração `20260911212821_enforce_active_order_numbers.sql` para impedir novos números ativos repetidos;
3. executar roteiro autenticado de aceitação para pagamento em dinheiro, parcial, edição, cancelamento, comprovante, impressão, link e entrega por QR;
4. revisar as políticas RLS efetivamente ativas e o Security Advisor;
5. dividir Pedidos, Catálogo, Hierarquia, PDV e Produtos em componentes menores e reduzir as consultas amplas.
