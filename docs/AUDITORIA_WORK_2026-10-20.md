# Auditoria e correções — 20/10/2026

Bases consultadas: Direção Geral `83edd66`; Estadual `414376e`. Regras recuperadas dos chats “Sistema estadual” e “Continuar chat do login”.

## Alterações entregues

- Editor reinicializado ao trocar de pedido, preenchido também ao reabrir dados em cache e protegido contra perda do rascunho em atualização automática.
- Seleção de cliente em venda balcão preservada; cliente atual continua identificado mesmo quando não aparece nas opções atuais.
- Datas do pedido e prazo de entrega, transportadora e rastreio editáveis; quantidades, preços e descontos de itens recebem validação numérica.
- Seleção de dados do editor considera a permissão comercial combinada dos cargos, em vez de tratar todo não administrador como vendedor restrito.
- Pedido aprovado sinaliza necessidade de revisão mesmo antes de pagamento. Pedido em análise ou com proposta pendente não aparece como editável no contexto do servidor.
- Servidor bloqueia segunda proposta enquanto existe solicitação pendente, preservando a repetição idempotente da mesma solicitação.
- Detalhes mostram o estado da alteração solicitada; fila da Direção Geral atualiza a cada minuto e compara cliente, estoque, datas e dados logísticos, além dos campos anteriores.
- Estadual consulta projeções e RPCs sanitizadas de pedidos, detalhes, versões históricas e comissão. Custos também são removidos de JSON aninhado.
- Permissão de financeiro empresarial e controles de aprovação desativados no Estadual, inclusive na apresentação para administradores. Edição e exclusão ficam nos detalhes.
- Busca global, histórico comercial do cliente e pedidos do CRM filtram registros excluídos/substituídos. Corrigido uso do campo inexistente `code` no CRM para `number`.

Nenhuma concessão real foi revogada. Nenhum pagamento real foi alterado. Os testes com escrita usaram dados sintéticos e ROLLBACK.

## Banco central

Aplicado em `wyutdvttldxkaqqysiuv`, com SQL sincronizado aos arquivos de migração correspondentes:

| Versão | Migração |
| --- | --- |
| 20261020150126 | divisional_order_cost_redaction |
| 20261020150610 | order_edit_review_integrity |
| 20261020150643 | division_order_read_models |

A projeção divisional usa SECURITY INVOKER e mantém as políticas existentes de visibilidade. As funções sanitizadoras não substituem a autorização original.

## Validação efetivamente realizada

- Build Node/Hostinger dos dois projetos: aprovado.
- Testes de edição/aprovação/câmbio: 8 na Direção Geral e 12 no Estadual, todos aprovados.
- Venda balcão para cliente identificado, preservando transportadora e rastreio: teste SQL com dados sintéticos e rollback aprovado.
- Revisão de pedido aprovado, parcialmente pago e já enviado: três regressões SQL com rollback aprovadas.
- Concessões: exclusão de item e bloqueio explícito de criação respeitados em teste SQL com rollback.
- União de seis combinações de cargos, bloqueios explícitos, perfil inativo e sessão ausente: teste SQL com rollback aprovado.
- RLS de um vendedor ativo: seis pedidos vigentes visíveis, todos próprios.
- Resposta divisional de um administrador: sem margem, custo total ou custo unitário; valor pago mantido.
- Domínios públicos abertos no navegador; Estadual e Direção Geral alcançaram as telas de login. Não havia sessão autenticada disponível.
- Typecheck completo continua falhando em problemas anteriores. Estadual: 265 diagnósticos na base, 261 após as alterações, sem novos diagnósticos na comparação normalizada. Direção Geral: 11 diagnósticos em arquivos preexistentes fora das alterações desta entrega.

## Pendências e limites

1. Confirmar implantação destes commits na Hostinger e executar a matriz completa de abas, botões, responsividade e perfis com sessões autenticadas.
2. O teste integrado adicional de submissão/repetição/aprovação retornou erro do conector “Invalid or expired requestState”; não foi considerado aprovado. Os três testes de aplicação de revisões acima passaram.
3. As consultas implementadas no Estadual deixam de receber os campos internos, mas isso **não é isolamento integral da API por portal**. Uma sessão Supabase administrativa mantém os privilégios canônicos independentemente da origem. Para garantir a restrição também contra chamadas diretas fora dessas consultas, é necessário separar a autorização da sessão divisional no servidor/gateway. Não revogar privilégios globais indiscriminadamente, pois isso interromperia a Direção Geral.
4. Auditar o restante das consultas e portais divisionais: esta entrega não certifica todos os caminhos existentes.
5. Resolver os erros antigos de TypeScript e revisar os avisos preexistentes do assessor de segurança. Os novos modelos são invoker e não receberam acesso anônimo.
6. A interface de edição mantém as restrições monetárias e de concessões do servidor; esta entrega não certifica edição irrestrita de todos os campos ou todos os estados na interface real.

## Verificação online após a publicação

- As branches main receberam os commits de código `8c7e6a9` (Direção Geral) e `40e015e` (Estadual).
- Os módulos de pedidos efetivamente referenciados pelo HTML dos dois domínios foram consultados. Não continham o novo editor; no Estadual também não continham `division_order_context`. A implantação das alterações publicadas não foi confirmada e os módulos observados permaneciam anteriores à entrega.
- O login Google iniciado em `estadual.qrcodevalidacao.com/auth` terminou em `tirzena.vercel.app/painel`. Retornar ao domínio Estadual levou novamente ao login, sem sessão autenticada nesse domínio.
- O código atual pede retorno para `window.location.origin + '/painel'`. É necessário conferir a configuração de URLs permitidas/retorno do Supabase e o código efetivamente implantado. A causa de configuração ainda não foi inspecionada.
- As ferramentas administrativas de Hostinger não estavam expostas nesta sessão. A publicação no GitHub está confirmada; reimplantação e auditoria completa autenticada na Hostinger seguem pendentes.

## Complemento: edição e criador do pedido

- Eliminado o caminho que aplicava diretamente a edição de pedidos legados. Toda edição pelo fluxo unificado cria uma solicitação pendente, mantém o pedido atual e só aplica os dados depois da aprovação.
- Os RPCs públicos antigos de edição direta foram bloqueados para impedir contorno da fila. O PDV passa a exigir o fluxo de revisão para qualquer edição, inclusive se a configuração geral ainda estiver carregando.
- Criado registro privado de autoria capturado pelo banco para novos pedidos. A revisão herda o criador original; o aprovador não assume essa autoria. O criador ou vendedor responsável pode solicitar alterações, mantendo as demais permissões e concessões.
- Pedidos históricos sem autoria comprovada não foram preenchidos por suposição: continuam editáveis pelo vendedor responsável e pelos perfis já autorizados.
- O editor não envia um custo interno ausente como zero. O servidor preserva o custo existente quando o formulário não o fornece.
- Corrigido o resumo do cliente no editor para acompanhar a opção selecionada, incluindo a mudança de venda balcão para cliente identificado.
- Teste SQL com rollback: pedido legado balcão → proposta de cliente/logística → fila pendente → aprovação independente → nova versão com cliente, logística e custo interno preservados. Aprovado.
- Teste SQL com rollback: criador diferente do vendedor, autoria protegida em fixture administrativa, solicitação e aprovação, autoria herdada pela revisão. Aprovado.
- Os testes não editaram pedidos ou pagamentos reais. A identificação do criador para registros anteriores continua limitada pela ausência desse dado no histórico.
- A implantação da interface atualizada na Hostinger continua pendente.


## Correção do erro “Use the seller portal RPC.” no editor

Reproduzido com o perfil vendedor que também possui a capacidade company_sales: sales_items_for_sale bloqueia a chamada, enquanto seller_portal_data e estadual_seller_customers retornam corretamente. O editor agora usa a mesma fronteira do servidor (cargo vendedor sem admin), independente de capacidades comerciais adicionais. As permissões de outros cargos permanecem intactas.

Regressão do formulário cobre vendedor, vendedor+gestor, vendedor+financeiro, gestor e vendedor+superadmin. Suítes: 13 testes na Direção Geral e 17 no Estadual. Consulta controlada no banco reproduziu a mensagem original e confirmou as consultas corretas, com rollback e sem alterar registros reais.


## Compatibilidade imediata com o editor ainda publicado

Após o usuário informar persistência do erro, os módulos efetivamente servidos nos dois domínios ainda continham a seleção antiga baseada apenas em company_sales. Aplicada a migração seller_editor_read_compatibility: sales_items_for_sale e sales_warehouses agora delegam ao payload restrito de seller_portal_data para vendedores, mantendo formato de resposta, filtro de produto e ausência de custos e localização exata. Outros perfis seguem os caminhos anteriores.

Teste em transação com SET LOCAL ROLE authenticated confirmou contexto do pedido, consulta de clientes e equivalência exata das quantidades de itens e estoques com o payload autorizado. Não houve alteração de dados reais. Esta compatibilidade de leitura vale imediatamente, inclusive para a interface antiga, sem desativar controles de autorização ou aprovação.


## Visualização pública de catálogos

Reproduzida falha na rota pública Estadual: Missing Supabase environment variable(s): SUPABASE_SERVICE_ROLE_KEY. O mesmo material e catálogo geral abrem na Direção Geral. Links de copiar e visualizar agora apontam à publicação central em login.qrcodevalidacao.com, preservando slug codificado e público vendedor/cliente. A rota Estadual redireciona links antigos antes de executar o loader que depende da chave. Não adicionada chave administrativa ao portal divisional.

Validação no navegador: material de membro abriu com preços no público vendedor e sem coluna de valores no cliente; catálogo geral e promoção também abriram na publicação central. Testes automatizados de público, codificação do slug e ocultação de preço passaram (16 na Direção Geral; 20 no Estadual). Redirecionamento Estadual depende da implantação do novo código na Hostinger. Nenhum catálogo ou preço real foi alterado.


## Catálogo no celular: cabeçalho e rolagem

Removida a área de produtos presa em h-dvh/overflow-hidden e a lógica que alterava a altura do cabeçalho com base no scroll interno. A página usa rolagem natural, cabeçalho sem animação de altura e banner de 144 px em telas pequenas. Busca, botões e espaçamentos foram compactados; categorias recolhem no celular e continuam visíveis no desktop. Listas largas mantêm rolagem horizontal local.

A verificação visual na versão publicada depende da implantação. Não foram alterados catálogo, preços, pedidos ou regras de público vendedor/cliente.


## Categoria acompanhando a rolagem

O menu destaca a categoria na linha de leitura do documento e rola apenas sua própria área no desktop para manter esse botão visível. O acompanhamento não muda os filtros nem usa scrollIntoView, evitando deslocamento involuntário da página. No celular, o botão recolhido identifica a categoria atual. Atualizações de rolagem limitadas por requestAnimationFrame, com limpeza de eventos e frame ao desmontar. Verificação visual na publicação depende da implantação.


## Avisos de alteração de preço

Adicionado gatilho para alterações administrativas de preço de venda ou moeda em inventory_items. Cria notificação com produto, valor anterior/novo e moeda apenas para vendedores ativos autorizados ao produto; não notifica alteração de custo/estoque ou gravação do mesmo preço. Não altera pedidos existentes.

A leitura das notificações do próprio vendedor foi liberada mantendo restrição de acesso às de terceiros. RPC de confirmação limitada às próprias notificações; guarda por linha proíbe alterar título, corpo ou destinatário ao confirmar leitura. Interface mostra aviso de tela por até 15 segundos, agrupando mudanças, mantém histórico no sino, atualiza consultas de preços e usa Realtime com consulta de segurança a cada 60 segundos. Modo espelho não lê nem confirma notificações de outro membro.

Teste transacional passou com produto e usuários sintéticos: destino autorizado, exclusão de vendedor sem concessão, não duplicação, troca de moeda, leitura isolada e confirmação. Todas as fixtures revertidas. Geração no banco está ativa; aviso visual depende de implantação do código. Alterações de preço anteriores não foram reconstruídas nem notificadas retroativamente.


## Inclusão de novos produtos ao editar pedido

O seletor de inclusão foi separado em busca por nome/SKU, seleção de produto liberado e botão Adicionar ao pedido. Produtos já presentes ficam fora das opções para evitar duplicação. Após adicionar, quantidade/preço/desconto ficam editáveis na nova linha; a solicitação mantém a mesma aprovação administrativa.

Teste SQL transacional com dois produtos sintéticos passou: original preservado antes da aprovação e segundo produto presente na revisão aprovada com quantidade e preço propostos. Fixtures revertidas. Teste de renderização verifica presença dos controles de inclusão. A disponibilização visual depende da implantação na Hostinger.


## Identificação e atualização das solicitações de edição

Incluídos nome do solicitante, vendedor responsável e data/hora explícita em America/Sao_Paulo. Fila ordenada por criação decrescente, botão de atualização manual e atualização automática a cada 15 segundos.

Conferida solicitação real da Renata no pedido 79, pendente, registrada em 20/10/2026 às 15:29:26 (Brasília). A consulta executada como authenticated com identidade do superadmin conseguiu ler solicitação, pedido e nome do solicitante. Não foi aprovada/rejeitada nem modificada. A fila anterior exibia os registros mais antigos primeiro e não mostrava autoria/data. Implantação necessária para os novos campos aparecerem na interface.


## Tela vazia na entrada

Reproduzida entrada vazia em / nos dois domínios; acesso direto a /auth renderizou a tela de entrada. Estadual apresentou erro React 418 na hidratação da raiz. Removido bloqueio de autenticação antes da primeira renderização: Direção Geral mostra a entrada pública imediatamente e usa presença de sessão somente para escolher o destino; a área protegida continua validando usuário e concessão no servidor. Estadual redireciona / diretamente a /auth, que restaura sessões existentes.

Adicionado estado de carregamento explícito do roteador e opções de recuperação após espera prolongada. Testes de regressão cobrem renderização imediata da entrada geral e redirecionamento síncrono estadual. A sessão autenticada do usuário não foi reproduzida; falhas posteriores ao login ainda precisam de validação na publicação. Nenhum dado ou credencial alterado.


## Navegação após retornar à aba

Estadual mantinha uma assinatura de auth por useSession/useCurrentUser e invalidava todas as consultas dentro de SIGNED_IN, evento também emitido no retorno ao foco. A camada Realtime ainda invalidava globalmente ao conectar/reconectar e em alterações de muitas tabelas. Direção Geral já centralizava sessão, mas ainda executava invalidação de perfil dentro do callback de auth.

Criado observador compartilhado com uma assinatura, processamento dos eventos fora do callback do SDK, proteção contra leitura inicial atrasada e cancelamento ao desmontar. Retornos da mesma conta e renovação de token não limpam cache nem provocam refetch global. Troca de conta/logout continuam limpando cache antes de publicar a próxima sessão. Estadual passou a usar o provider central no root; política de atualização alinhada ao estoque em Realtime e demais áreas a cada 10 minutos. Consultas deixam de recarregar por foco/reconexão por padrão, preservando overrides específicos e validações de autorização.

Seis testes de regressão passaram: callback sem consultas, foco repetido/refresh, troca de conta, desmontagem, corrida de inicialização e logout. Suítes: 24 testes na Direção Geral; 28 no Estadual. Sem alteração de dados, credenciais ou concessões. Validação com troca real de aba em sessão autenticada na hospedagem continua pendente.

Conferidos também os repositórios integral-estoques, integral-fornecedores, integral-transportes, integral-lideranca-regional, integral-distribuidores-municipais e integral-captacao: são portais PHP com links nativos/formulários, não a mesma camada React/Auth. Não aplicado patch de autenticação React nesses projetos sem evidência. Falha autenticada nesses portais ainda requer reprodução própria.
