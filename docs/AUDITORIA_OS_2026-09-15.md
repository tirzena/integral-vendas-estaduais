# Auditoria do OS — 15/09/2026

## Escopo

Foram revisados o código, as migrações, a compilação, os testes automáticos e a consistência dos dados ativos no Supabase do OS. A verificação cobriu pedidos, solicitações de catálogo, pré-pedidos operacionais, pagamentos, contas a receber, reservas de estoque, compras automáticas, entregas e promoções.

## Resultado

- 70 versões no histórico e 25 pedidos atuais.
- 21 vendas atuais e 4 pré-pedidos operacionais com estoque reservado.
- Nenhuma solicitação de catálogo pendente.
- Nenhum número atual duplicado.
- Nenhum pedido ativo sem itens.
- Nenhuma venda sem vendedor ou estoque.
- Nenhuma divergência de reserva por produto ou estoque.
- A conferência complementar encontrou 21 vendas sem compra automática; o vínculo foi recomposto conforme descrito abaixo.

## Correções executadas

### Promoções

O cadastro de promoção passou a carregar e filtrar, nesta ordem:

1. categoria;
2. subcategoria;
3. produto.

Os campos de custo promocional, frete promocional e preço de venda promocional agora aceitam valores decimais com vírgula ou ponto. A gravação também impede promoção sem qualquer valor preenchido e informa quando existe um valor inválido.

A função `promotion_management_items()` foi atualizada no banco para retornar os identificadores e nomes de categoria e subcategoria, preservando a restrição de produtos por perfil, fornecedor e transportador.

### Financeiro dos pedidos

Foram encontrados três registros históricos com totais financeiros divergentes:

- pedido #7 marcado como pago sem baixa registrada;
- pedidos #18 e #23 sem pagamento, mas com saldo a receber zerado.

Os pagamentos confirmados passaram a ser a fonte de verdade. Os valores pagos, saldos, situação financeira, etapa do pedido e contas a receber foram reconciliados. A conferência posterior encontrou zero divergências financeiras.

## Pedidos que aguardam ação

Existem quatro pré-pedidos operacionais, todos com reserva de estoque válida. Os pedidos #15 e #17 são os mais antigos. Eles não são solicitações enviadas pelo catálogo e não devem ser confirmados ou cancelados automaticamente, porque isso exige a decisão comercial do vendedor. Eles permanecem visíveis e com estoque reservado até essa decisão.

## Validação do código

- 16 testes automáticos aprovados.
- Compilação do cliente e do servidor aprovada.
- Arquivo de promoções aprovado pelo lint direcionado.
- Verificação de diferenças sem linhas quebradas ou espaços inválidos.

## Débitos técnicos observados

A análise estática completa ainda aponta 611 erros e 26 avisos distribuídos em 62 arquivos antigos. A maior parte é formatação acumulada e tipagem frouxa em módulos grandes. Corrigir tudo em uma alteração única aumentaria o risco sobre fluxos financeiros e operacionais; o saneamento deve ser feito por módulo, com compilação e teste a cada etapa.

Os maiores módulos continuam concentrando responsabilidades, especialmente documentos, catálogo, hierarquia, PDV e produtos. A divisão desses módulos é a principal oportunidade de otimização estrutural. Também permanecem avisos de pacotes grandes na compilação, sem impedir a publicação.


## Conferência complementar e publicação — 15/09, após 02h

### Compras e fornecedor

- Geradas 21 compras para as 21 vendas atuais, usando a função existente de sincronização e seus identificadores de origem. A comparação dos itens encontrou zero diferenças de quantidade. O estoque permaneceu igual: compras vinculadas a vendas não são entradas de reposição.
- Os quatro pré-pedidos aguardam confirmação comercial e não geraram compras. O dashboard passou a distinguir Pedidos confirmados de Solicitações, com os mesmos filtros de período e categoria.
- Fornecedor farmacia vinculado ao perfil existente de Zé. Seu nível administrador foi preservado; nenhum pagamento foi criado.
- Compra de teste #OC-01 excluída após identificação expressa do usuário. Backup local preservado; suas três entradas de 0,001 unidade foram revertidas e a obrigação a pagar removida. O banco confirmou zero registros restantes para o identificador do teste.
- Cards de compra mostram unidades totais, produtos diferentes e a quantidade individual de cada produto, usando as linhas reais da compra, não a subcategoria.
- Cards mostram também a fase de entrega do pedido vinculado. Saldo passou a aparecer nas três moedas.
- Compras recebeu abas de pagamento: Pagos, Pagamento parcial e Esperando pagamento, além de Em caminho, Produtos perdidos e Compras canceladas.

### Perdas

- Regra no banco sincroniza a perda de uma venda com suas compras vinculadas e mantém pagamentos e obrigações financeiras. Perda não equivale a cancelamento e não devolve produtos ao estoque.
- Pedidos e Entregas receberam a fase Produtos perdidos. A ação de marcar uma venda perdida foi adicionada à lista de pedidos.
- Teste transacional com pedido que já possuía baixa: pedido e compra passaram para perdido/perdida, verificações aprovadas e ROLLBACK confirmado. Nenhum pedido real permaneceu perdido por causa do teste.
- A regra rejeita pedidos sem saída/reserva de estoque. Compras manuais ainda necessitam ação própria de perda com controle da saída efetiva; não considerar essa parte finalizada.

### Financeiro e membros

- Publicados cálculo reconciliado dos recebimentos parciais, custos proporcionais, compras e obrigações, resumo financeiro, fluxo de caixa e participação dos sócios.
- Criado histórico de retiradas com acesso restrito aos administradores, cotação registrada e preservação de lançamentos cancelados. Sem criação de sócios, retiradas ou pagamentos fictícios. Migração aplicada e fonte corrigida para escapar o percentual literal.
- Editor de membro compartilhado entre lista e página individual, incluindo seleção de vários cargos organizacionais. Validação de gravação com o usuário real ainda pendente.
- Tratamento de erro no botão de relatório publicado; isso não comprova que todos os botões de PDF baixam corretamente.

## Controle das solicitações anteriores, por área

A existência do código ou de um commit não comprova funcionamento ponta a ponta. Esta lista mantém explicitamente o que ainda precisa de verificação.

| Ordem | Solicitação | Situação nesta conferência |
|---|---|---|
| 1 | Catálogo: mínimo de 10 iniciado no botão, frete, preço de atacado | Implementações anteriores; revalidar catálogo e envio com as regras atuais por produto |
| 2 | Lista automática por catálogo, categorias/subcategorias, campos completos e contatos automáticos/manuais | Revalidar criação, lista vazia, captura e alteração do responsável |
| 3 | Login vendedor | Não testar senha em chat nem alterar acesso sem necessidade; validação de login pendente |
| 4 | Solicitações de catálogo revisadas pelo vendedor antes de venda e saída | Quatro pré-pedidos operacionais preservados; revalidar fluxo público completo |
| 5 | Entregas carregarem sem esconder erro | Código anterior e fase perdido publicados; revalidar carregamento em produção |
| 6 | Frete, comissão e desconto definidos somente no produto; Paraguai sem frete | Revalidar moeda, custo/base, quantidade e promoções em cada destino |
| 7 | CPF/dados opcionais; só vendedor e estoque obrigatórios; datas editáveis e pagamentos parciais | Revalidar PDV, edição e documentos após gravação |
| 8 | Rascunhos, edição carregando dados, sequência e revisões, cancelamentos | Revalidar persistência e relatórios; não renumerar histórico sem preservar vínculos |
| 9 | Três moedas em todos os valores e seleção de moeda principal por pedido | Resumos financeiros e saldo de compras ajustados; revisão global ainda pendente |
| 10 | Dashboard e relatório com todos os dados e períodos independentes | Pré-pedidos separados; conferir totais e períodos após publicação |
| 11 | PDFs: todos baixarem; vendedor na ordem de entrega; recibos e anexos abrirem | Ainda pendente teste real de cada botão e documento |
| 12 | WhatsApp privado por usuário e entrada em grupo gerar contato | Revalidar isolamento; integração de participantes de grupo não comprovada |
| 13 | Promoção por produto/categoria/subcategoria, valores por perfil, período e destaque no dashboard | Correção anterior de seleção/decimais; revalidar todos os perfis e sugestão no pedido |
| 14 | Compras administrativas, fornecedor Zé, vínculos, pagamento parcial e estoque principal | 21 compras e vínculo comprovados; testar reposição manual, pagamento, PDF e histórico |
| 15 | Ranking e campeonato: unidades de produtos, todas as equipes/categorias | Requer reconciliação ponta a ponta dos critérios de venda e período |
| 16 | Página de membro/equipe com pedidos, equipe, cargos e nível; edição de cargos | Editor publicado; revalidar gravação, permissões e dados da equipe |
| 17 | Financeiro: presumido/real, parcelas de cliente/fornecedor e sócios/retiradas | Cálculos e migração publicados/aplicados; testar permissões e interface final |
| 18 | Fases compartilhadas, compras canceladas e perdidos em todas as áreas | Abas e sincronização de perda publicadas; uniformização completa e ações de compras manuais pendentes |
| 19 | Auditoria, otimização e memória | Registro atualizado; não afirmar revisão integral concluída enquanto houver itens pendentes |

Arquivos de backup e evidência com dados operacionais permanecem somente em tmp e não foram publicados.


### Validação complementar em produção

- Vercel confirmou implantação concluída das páginas de compras, membros, perdidos e dashboard. A conferência no domínio principal mostrou 21 compras, itens com unidades individuais, vínculo de entrega e saldo nas três moedas.
- Três vendas históricas (#8, #16 e #22) tinham tipo venda e estoque baixado, mas status legado pre_pedido. O critério do painel foi corrigido para o tipo do documento: não excluir vendas confirmadas por causa do status legado. São 21 vendas e quatro pré-pedidos (#15, #17, #18 e #23).
- Financeiro também passou a excluir pré-pedidos e usar fulfillment_status a_caminho para o total em trajeto, excluindo entregues e perdidos desse indicador. Doze testes direcionados aprovados.
- Editor de cargos abriu em produção e mostrou todos os cargos e níveis disponíveis. Nenhum cargo real foi alterado só para teste. Acentos quebrados nas páginas de membros corrigidos e pedidos do membro ordenados numericamente.
- O clique no PDF financeiro não produziu evento de download no controle do navegador durante a janela do teste. Isso exige investigação adicional; não afirmar correção de todos os downloads. A consulta à página interna de downloads do Chrome foi bloqueada pela política do navegador e não foi contornada.


### Correções após confirmação dos 25 pedidos

- O administrador esclareceu que não existem pré-pedidos. Corrigida somente a classificação dos quatro registros #15, #17, #18 e #23; fases, reservas e pagamentos preservados. Backup privado anterior à alteração e registro de auditoria no banco.
- Conferência atual: 25 vendas ativas e 25 compras vinculadas; quantidades por produto iguais; nenhuma duplicação de entrada de estoque na sincronização.
- Compras movida imediatamente abaixo de Pedidos e posição confirmada em produção.
- Resumos exibidos para todos os pedidos, incluindo novos e revisados; observações usam os dados salvos. Situação, Solicitações e demais textos de pedidos/entregas corrigidos.
- Datas civis deixam de ser interpretadas como UTC, evitando mostrar o dia anterior. Dezessete testes direcionados passaram; compilação aprovada; arquivos alterados sem erros de lint (um aviso preexistente de recarga em desenvolvimento).
- Ordenação inicial dos pedidos passa a ser numérica crescente. Detalhe da compra mostra fornecedor, estoque de destino, pedido vinculado e fase da entrega.
- Rota de PDF validada com arquivo técnico sem dados operacionais: HTTP 200 e Content-Disposition attachment. Ajuste do envio para a página principal e tratamento de erro na geração de relatório; download real ainda precisa ser confirmado após implantação.
- Nova orientação: todas as compras devem alimentar o estoque principal, de onde saem os pedidos. Conciliação das compras históricas aguarda esclarecer se o saldo atual já contém essas entradas, para não duplicar produtos. A indicação do percurso não substitui a conferência das movimentações físicas.

O quadro anterior registra a situação histórica da investigação; a confirmação acima substitui a classificação antiga de quatro pré-pedidos. A auditoria integral permanece aberta nos itens ainda não verificados.

- Identificada também a origem recorrente da classificação: o botão Criar pedido persistia pre_pedido. Adicionada confirmação explícita e autorizada por vendedor/administrador ao fim da gravação; compras vinculadas sincronizadas sem inventar recebimentos. Teste transacional no banco confirmou idempotência e preservação de reservas e pagamentos, com rollback.
- Erro real do PDF registrado no console de produção: módulo jspdf de implantação anterior indisponível. Gerador passa a carregar junto aos componentes de relatório/documento; falhas de geração visíveis no relatório. Revalidação em produção em andamento.


### Downloads e percurso conferidos em produção

- Download real confirmado pelo evento do navegador para relatório de pedidos, ordem de compra #OC-02 e ordem de entrega #01. A rota devolveu attachment e a página permaneceu aberta. Isso valida as três famílias testadas, sem afirmar teste individual de todas as notas antigas.
- Detalhe da compra confirmou o percurso fornecedor → estoque principal → pedido #01 e situação da entrega. Detalhe da ordem de entrega #01 revelou ausência de estoque/endereço estruturados; informações de endereço estão nas observações da importação. Não inferir baixas físicas com base apenas no vínculo documental.
- Para dados históricos, a classificação comercial foi corrigida e o saldo de estoque preservado. A conciliação física permanece pendente da informação se as 25 compras já compõem o saldo existente. A geração de compra vinculada não foi tratada indevidamente como prova de recebimento físico.


## Financeiro visual e moeda selecionada

- Seletor único BRL/USD/PYG na área financeira; conversões somente para apresentação, sem alterar moeda dos registros.
- Resumos por unidades e valores: vendas, custo pago, parcelas, cancelamentos, perdas, trajeto e entregas por situação de pagamento.
- Caixa acumulado separado dos resultados do período; gráficos com entradas verdes, saídas vermelhas e retiradas amarelas.
- Lucro real apresentado como entradas recebidas menos saídas pagas. Custos reais apresentados como pagamentos efetivos aos fornecedores.
- Medidores por pedido e compra; pagamentos limitados visualmente entre 0% e 100%.
- Sócios: caixa e custos atribuídos por percentuais, retiradas por sócio. Atribuição não identifica quem efetuou pagamentos ao fornecedor.
- Verificação: 14 testes financeiros passaram; compilação de produção e análise dos arquivos alterados passaram.
- Pendências preservadas: filtros de fornecedor nas três áreas operacionais e conciliação física de estoque. Não foram concluídos nesta etapa.


## Financeiro visual e filtros operacionais — atualização
Financeiro publicado com seletor único BRL/USD/PYG, gráficos, quantidades, pagamentos proporcionais, caixa acumulado e participação por sócio. Percentuais dos sócios aguardam confirmação; nenhum foi inventado. Filtros combinados de fornecedor, produto, vendedor, equipe, origem, situação, período e ordem implementados em pedidos, compras e entregas; relatórios seguem os filtros. 18 testes passaram. Verificação geral de tipos ainda aponta erros no sistema, incluindo áreas anteriores fora deste recorte; auditoria integral permanece aberta. Estoque físico segue aguardando conciliação, sem duplicar entradas históricas.


## Controle de falsificação por lote e unidade
Implementado painel administrativo /autenticidade, integração com compra selecionada, QR exclusivo do lote e página pública /verificar/:batchId. Códigos aleatórios de 128 bits gerados no servidor, unicidade global do código e hash no banco, um QR por produto/lote. Geração transacional limitada às unidades da compra, sem alteração de estoque. Segredos restritos ao serviço no servidor; consultas públicas não leem tabelas de códigos. Primeira validação atômica com data/hora, repetição, inexistente, suspensão, limite de tentativas e compra cancelada. Exportação CSV, QR SVG e etiquetas PDF único. 20 testes locais passaram; compilação passou. Banco aplicado no projeto wyutdvttldxkaqqysiuv; testes transacionais comprovaram validação/repetição, isolamento entre QR de lotes, unicidade global, suspensão e privilégios, com zero lotes de teste retidos. Código cadastrado confirma registro de embalagem, não conteúdo físico nem certificado de qualidade. Datas reais e lotes não foram inventados. Painel e menu verificados em produção; formulário carregou compras/produtos e botão da OC-02 abriu com TG selecionado. Página pública respondeu lote inexistente sem pedir login. Visual administrativo inspecionado. Nenhum lote real nem datas reais foram cadastrados sem dados; teste público com código real e downloads via interface aguardam o primeiro lote real.


## Organização individual de lotes — 15/09/2026

Página administrativa individual em /autenticidade?batchId=ID, aberta pelo cartão do lote e automaticamente após cadastrar. QR visível, códigos exclusivos pesquisáveis e paginados em 50 unidades, indicação de primeira validação e histórico filtrado no servidor por lote. Cadastro identifica explicitamente a criação conjunta de lote, QR e códigos. Compilação e verificação do arquivo passaram. Publicação e conferência visual pendentes: Chrome não respondeu em duas tentativas. Nenhum lote ou código de exemplo foi salvo. Integração automática compra/estoque/lote continua pendente.


## Recebimentos e repasses nas compras

A consulta das compras agora carrega total, moeda, amount_paid e amount_receivable do pedido vinculado. Cartão e detalhe mostram recebimento do cliente separado do repasse ao fornecedor. Identificação Fornecedor: adicionada à lista, detalhes e percurso. Usuário confirmou que o recebimento do pedido também representa repasse ao fornecedor. Migração de baixa proporcional preparada; ainda não aplicada no banco real. Alterações locais: publicação e conferência visual bloqueadas por falta de resposta do Chrome.


## Baixa automática proporcional de compras — autorizada

Migração 20260915130459_sales_purchase_payment_sync.sql: percentual amount_paid/total da venda aplicado ao total de cada compra vinculada, histórico de parcelas e contas a pagar. Triggers cobrem recebimentos, mudanças de status e compras vinculadas criadas posteriormente. Reprocessamento dos vínculos existentes sem duplicar valores; pagamentos manuais entram na base já paga e reduções não apagam pagamentos reais.

Verificação com PostgreSQL local isolado (PGlite): reconciliação retroativa, parcial, quitação, repetição da migração, compensação de pagamentos manuais, atualização de custo, cancelamentos, histórico preservado, compra posterior e bloqueio anon passaram. Compilação da interface de compras passou no ajuste anterior. Nenhum pagamento real foi alterado.

Bloqueios de ativação: Supabase MCP recusou acesso ao projeto; Chrome sem resposta; GitHub não reconheceu acesso ao repositório privado no teste de envio. Migração e interface continuam somente locais. Requer recuperar o acesso já autorizado para publicação e aplicação.

## Verificacao publicada - 15/09/2026 10:20
- Chrome reconectado ao GitHub OS e Supabase tzn corretos.
- Barra de pagamento ja publicada e conferida nos 25 pedidos: 0%, 96,8%, 69%, 100% e 0,1%.
- Rotina sales_purchase_payment_sync validada em transacao com rollback e depois aplicada com commit.
- 25 compras vinculadas, 12 com recebimentos; antes 0 com baixa. Depois os percentuais foram conferidos na interface de compras.
- Interfaces de compras e pagina por lote enviadas ao GitHub. Fluxo de estoque de lotes proprios do fornecedor permanece pendente.


## Lotes do fornecedor, estoque e autenticidade — atualização final

- Fornecedor registra sua compra de lote em Lotes e estoque, com produto, número, datas, quantidade e custo. O lote completo gera automaticamente um QR e um código aleatório por unidade; paginação de códigos não limita a quantidade do lote.
- Nova compra administrativa seleciona somente lotes disponíveis do fornecedor e da moeda escolhida. Recebimento atômico reduz o saldo do fornecedor, registra a compra e abastece o estoque principal pelo fluxo protegido existente.
- Lotes recebidos preservam origem da compra nas saídas por pedido, transferências entre estoques e estornos. Estoque histórico sem origem identificada permanece preservado; não houve criação de lotes fictícios nem duplicação de entradas históricas.
- Venda de unidades já adquiridas não gera uma segunda cobrança de produto. Estoque misto gera compra automática apenas para a quantidade ainda sem aquisição identificada. Repasse proporcional considera unidades vendidas e percentual efetivamente recebido; pagamentos anteriores não são apagados.
- Migrações 20260915133604_supplier_stock_lots e 20260915135820_partial_stock_lot_coverage aplicadas no projeto correto, após teste transacional com rollback. Tabelas internas com RLS e acesso direto de anon/authenticated revogado.
- PostgreSQL isolado: lote de 5.000 unidades/códigos, unicidade global, isolamento entre fornecedores e QR, validação inicial/repetida, excesso de compra, rollback, entrada, saída, transferência, estorno, quitação proporcional idempotente e estoque misto passaram. Compilação de cliente/servidor e lint dos arquivos alterados passaram.
- Telas enviadas ao GitHub leadinroi/OS. Em produção foram conferidos a aba do fornecedor, os três produtos próprios, os campos de lote completo e o aviso de ausência de lote disponível na compra. Diálogo corrigido e conferido visualmente em produção, com altura limitada e rolagem. Vínculos das compras abrem a ficha correta do fornecedor; rótulos de situação mostram Pagamento. Abertura imediata e download do QR implementados; teste de geração pela tela aguarda o primeiro lote real.
- Pendências que exigem dados reais: informar lotes/datas/quantidades do fornecedor e conciliar se as compras históricas já compõem o saldo físico. Percentuais dos sócios continuam sem valores inventados. A auditoria integral de tipos e de todas as áreas não foi encerrada por este recorte.
