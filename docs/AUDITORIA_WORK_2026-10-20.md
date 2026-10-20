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
