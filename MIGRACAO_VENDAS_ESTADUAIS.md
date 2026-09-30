# MIGRAÇÃO — VENDAS ESTADUAIS

## Isolamento obrigatório
- Repositório exclusivo: tirzena/integral-vendas-estaduais.
- Domínio exclusivo: estadual.qrcodevalidacao.com.
- Não incluir links, menus, redirects ou rotas navegáveis para login.qrcodevalidacao.com ou outros portais divisionais.
- Compartilhar somente a fonte de dados canônica Supabase e contratos de dados; nunca compartilhar bundle, sessão administrativa ou navegação entre portais.
- Acesso é validado pelo papel/concessão do usuário e por RLS. Conhecer uma URL de outro portal não concede acesso.

## Escopo do vendedor
- Visão Geral: somente vendas, clientes, pedidos, CRM, metas, entregas e indicadores do próprio vendedor, salvo concessão territorial explícita.
- CRM, Atendimentos, Disparador de mensagens, Lista de contatos.
- Clientes, Catálogo de produtos, Categorias autorizadas, Pedidos, Promoções.
- Estoque somente leitura quando concedido; Entregas relacionadas/permitidas.
- Financeiro: somente valores/comissões do próprio vendedor. Investimentos não aparece.
- Ranking e bonificações, Cotações e câmbio.
- Tarefas, Scripts e treinamentos, Manuais/onboarding, Avisos e Chat.
- Sem Fornecedores, Compras administrativas, Membros, Governança, Acessos, Integrações ou Configurações administrativas.

## Sincronização
Usar o mesmo Supabase canônico. Não duplicar clientes, pedidos, estoque, pagamentos ou entregas em banco PHP local. Assinar Realtime para inventory_items, orders, order_items, customers, deliveries, payments, accounts_receivable e digital_catalogs; invalidar/refazer consultas autorizadas quando houver alteração.

## Segurança
- RLS é a autoridade. Filtro visual não é controle de acesso.
- seller_id/owner_id deve restringir vendedor comum aos próprios registros.
- territory_uf, region_code, municipality_ibge_id e product_id devem restringir concessões.
- Nunca usar service-role no browser.
- Nenhum segredo da Direção Geral deve entrar no repositório estadual.
- Não criar backdoor por query string, cookie compartilhado entre domínios ou link administrativo.

## 403 legado
O PHP atual possui bloqueios explícitos e dependência de integral-secrets/estadual.php, central_api, service_key e banco local. A migração não deve preservar esse fluxo. O novo portal deve autenticar diretamente no Supabase e usar as políticas do usuário.

## Checklist antes de publicar
1. Login/logout e sessão do domínio estadual.
2. Vendedor não abre fornecedor, compras administrativas, investimentos, equipe/admin/governança.
3. Vendedor A não lê pedido/cliente/financeiro do vendedor B.
4. Admin/superadmin somente conforme concessões previstas para este portal.
5. Alteração de estoque aparece sem F5.
6. Novo pedido aparece na Direção Geral e no Estadual autorizado.
7. Alteração de entrega/pagamento sincroniza nos dois lados.
8. CRM/atendimento/contatos respeitam owner_id e território.
9. Todos os botões, modais, filtros, paginação, mobile e estados vazios/erro.
10. Build de produção e rota direta sem 403/404.
11. Nenhum link ou texto revela os endereços dos outros portais.
12. Nenhuma chave secreta presente no bundle do navegador.
