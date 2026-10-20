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
