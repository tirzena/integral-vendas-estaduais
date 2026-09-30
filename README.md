# Nexus Business Suite

Crie uma aplicação web responsiva e profissional para gestão empresarial, reunindo ERP, CRM por produto, atendimento via WhatsApp, gestão de vendedores, fornecedores, documentos, comunicação interna e relatórios.

O sistema deve ser modular, escalável e preparado para receber novos produtos, usuários, equipes e integrações futuramente.

Utilize:

- React e TypeScript.
- Supabase como banco de dados e backend.
- Supabase Auth para autenticação.
- Supabase Storage para arquivos.
- Supabase Realtime para chat e notificações.
- Row Level Security — RLS — para proteção e separação dos dados.
- Interface responsiva para computador, tablet e celular.
- Layout administrativo moderno, limpo e intuitivo.
- Idioma principal: português do Brasil.
- Moedas: real, dólar e guarani.

IMPORTANTE:

Não crie apenas telas demonstrativas. Implemente banco de dados, autenticação, relacionamentos, CRUDs, filtros, permissões e navegação funcional.

Quando uma integração externa ainda não estiver configurada, crie a estrutura real necessária, uma tela de configuração e um modo de demonstração claramente identificado. Não simule que uma integração está funcionando.

## 1. ESTRUTURA GERAL

O menu lateral deve possuir:

1. Dashboard
2. CRM
3. Atendimentos
4. Clientes
5. Produtos
6. Pedidos e orçamentos
7. Financeiro
8. Estoque
9. Vendedores e membros
10. Fornecedores
11. Cotações e câmbio
12. Catálogos e tabelas
13. Scripts e treinamentos
14. Tarefas
15. Avisos internos
16. Chat interno
17. Relatórios
18. Integrações
19. Configurações

O sistema deve permitir recolher o menu lateral e funcionar corretamente em dispositivos móveis.

## 2. AUTENTICAÇÃO E PERFIS

Criar login por e-mail e senha, recuperação de senha e gerenciamento de sessão.

Cada usuário deve possuir:

- Nome completo.
- Foto.
- E-mail.
- Telefone.
- Cargo.
- Setor.
- Status ativo ou inativo.
- Produtos aos quais possui acesso.
- Gestor responsável.
- Data de entrada.
- Permissões.
- Último acesso.

Criar os seguintes perfis iniciais:

### Superadministrador

Acesso completo a todos os módulos, configurações, usuários, produtos, clientes, conversas e relatórios.

### Administrador

Gerencia a operação, mas somente conforme as permissões concedidas.

### Gestor

Visualiza os produtos, equipes, vendedores e clientes sob sua responsabilidade.

### Vendedor

Visualiza apenas:

- Produtos autorizados.
- CRM dos produtos autorizados.
- Clientes atribuídos a ele.
- Conversas sob sua responsabilidade.
- Catálogos, tabelas e scripts liberados.
- Seus pedidos, orçamentos, metas e comissões.

### Financeiro

Acesso aos pedidos, pagamentos, contas, câmbio e relatórios financeiros autorizados.

### Estoque

Acesso aos produtos, movimentações, pedidos e controle de estoque.

### Fornecedor

Acesso externo restrito somente às informações, documentos ou solicitações liberadas para ele.

As permissões devem ser configuráveis por módulo e ação:

- Visualizar.
- Criar.
- Editar.
- Excluir.
- Exportar.
- Aprovar.
- Visualizar todos os registros.
- Visualizar apenas registros próprios.
- Visualizar apenas registros da equipe.
- Visualizar conversas.

Registrar em log todas as ações administrativas relevantes.

## 3. PRODUTOS E ÁREAS DE NEGÓCIO

O sistema deve permitir cadastrar quantos produtos ou áreas de negócio forem necessários.

Cada produto deve possuir:

- Nome.
- Descrição.
- Imagem ou logotipo.
- Categoria.
- Status ativo ou inativo.
- Cor de identificação.
- Gestor responsável.
- Vendedores vinculados.
- Fornecedores vinculados.
- Funil de vendas próprio.
- Tabelas de preços.
- Catálogos.
- Scripts.
- Integrações da Meta e WhatsApp.
- Metas.
- Formas de pagamento.
- Regras comerciais.
- Moeda principal.
- Observações.

Cada produto deve funcionar como uma área separada dentro do sistema.

Ao entrar no CRM, o usuário deverá escolher o produto que deseja visualizar. Depois da seleção, mostrar apenas o funil, clientes, leads, vendedores, campanhas, conversas e relatórios daquele produto.

Administradores poderão selecionar:

- Um produto.
- Vários produtos.
- Todos os produtos.

## 4. CLIENTES MULTIPRODUTO

Os clientes também devem ser organizados por produto.

Um cliente poderá pertencer a um ou a vários produtos, mas deve existir apenas um cadastro principal para evitar duplicidade.

### Cadastro principal do cliente

Guardar:

- Pessoa física ou jurídica.
- Nome ou razão social.
- Nome fantasia.
- CPF, CNPJ ou documento estrangeiro.
- Telefones.
- WhatsApp.
- E-mail.
- País.
- Estado ou departamento.
- Cidade.
- Endereço.
- Idioma.
- Data de nascimento.
- Origem inicial.
- Tags gerais.
- Observações gerais.
- Documentos e anexos.
- Data do cadastro.
- Status geral.

### Vínculo cliente-produto

Criar uma relação de muitos para muitos entre clientes e produtos.

Um cliente pode estar vinculado a vários produtos, e um produto pode possuir vários clientes.

Para cada vínculo entre cliente e produto, armazenar separadamente:

- Produto.
- Vendedor responsável.
- Vendedor auxiliar, se houver.
- Equipe responsável.
- Funil.
- Etapa atual.
- Status comercial.
- Origem do lead.
- Campanha.
- Anúncio.
- Canal de atendimento.
- Número do WhatsApp utilizado.
- Data de entrada.
- Último contato.
- Próxima ação.
- Valor potencial.
- Probabilidade de fechamento.
- Motivo de perda.
- Tags específicas.
- Observações específicas.
- Pedidos.
- Orçamentos.
- Conversas.
- Tarefas.
- Histórico de alterações.

Exemplo:

O cliente João pode estar:

- No Produto A, em “Proposta enviada”, com o vendedor Carlos.
- No Produto B, em “Novo lead”, com a vendedora Maria.
- No Produto C, como “Cliente inativo”, com o vendedor Pedro.

Os dados e históricos comerciais desses vínculos devem permanecer separados.

### Prevenção de duplicidade

Antes de cadastrar um novo cliente, pesquisar por:

- CPF ou CNPJ.
- Documento estrangeiro.
- Telefone e WhatsApp.
- E-mail.
- Nome ou razão social.

Se já existir, mostrar:

“Este cliente já está cadastrado. Deseja vinculá-lo a este produto?”

Não criar automaticamente um cadastro duplicado.

### Perfil do cliente

A página do cliente deve possuir:

#### Visão geral

- Dados cadastrais.
- Produtos vinculados.
- Responsáveis.
- Valor total movimentado.
- Documentos.
- Histórico geral.
- Alertas.
- Últimas atividades.

#### Visão por produto

Ao selecionar um produto, mostrar somente:

- Vendedor responsável.
- Etapa do funil.
- Conversas.
- Negociações.
- Orçamentos.
- Pedidos.
- Pagamentos.
- Tarefas.
- Observações.
- Origem e campanha.
- Arquivos daquele produto.

Um vendedor não poderá visualizar automaticamente informações comerciais do cliente referentes a produtos aos quais não possui acesso.

## 5. CRM POR PRODUTO

Cada produto deve possuir seu próprio CRM.

Criar visualização em:

- Kanban.
- Lista.
- Tabela.
- Agenda de próximas ações.

Cada produto poderá ter etapas personalizadas. Criar como padrão:

1. Novo lead
2. Primeiro contato
3. Qualificação
4. Cotação
5. Proposta enviada
6. Negociação
7. Fechado — ganho
8. Fechado — perdido
9. Pós-venda

Permitir:

- Arrastar oportunidades entre etapas.
- Cadastrar lead manualmente.
- Importar leads por planilha.
- Criar lead a partir do WhatsApp.
- Atribuir vendedor.
- Transferir lead.
- Adicionar tarefas.
- Registrar ligações e reuniões.
- Criar observações.
- Anexar arquivos.
- Definir valor potencial.
- Definir próxima ação.
- Marcar ganho ou perdido.
- Registrar motivo da perda.
- Filtrar por produto, vendedor, equipe, etapa, origem, campanha, data, status e tags.
- Visualizar histórico completo da oportunidade.
- Impedir que dois vendedores atendam o mesmo cliente no mesmo produto sem autorização.
- Manter histórico de todas as transferências.

Criar distribuição de leads:

- Manual.
- Por rodízio.
- Por produto.
- Por equipe.
- Por disponibilidade.
- Por prioridade.
- Por país ou região.

## 6. META E WHATSAPP

Criar uma área de integrações para cadastrar:

- Conta Meta Business.
- Página do Facebook.
- Conta do Instagram.
- Conta de anúncios.
- WhatsApp Business Account.
- Número de telefone.
- Token de acesso.
- Identificador do aplicativo.
- Webhook.
- Produtos vinculados.
- Status da integração.

Cada produto poderá ter uma configuração própria da Meta e do WhatsApp.

A integração deverá ser preparada para a API oficial do WhatsApp Business Platform — Cloud API — e webhooks oficiais da Meta.

Não tentar acessar WhatsApps pessoais dos vendedores.

Criar uma caixa de entrada centralizada contendo:

- Lista de conversas.
- Nome e telefone do contato.
- Produto relacionado.
- Vendedor responsável.
- Status do atendimento.
- Última mensagem.
- Horário.
- Mensagens não lidas.
- Tags.
- Campo de busca.
- Filtros.
- Painel da conversa.
- Painel lateral com dados do cliente.
- Histórico do CRM.
- Pedidos e orçamentos.
- Anexos.
- Notas internas.

Permitir:

- Receber e enviar mensagens.
- Enviar texto, imagem, áudio e documento.
- Atribuir uma conversa a um vendedor.
- Transferir atendimento.
- Vincular contato a cliente existente.
- Criar cliente a partir da conversa.
- Vincular a conversa a um produto.
- Criar oportunidade no CRM.
- Criar tarefa.
- Inserir nota interna.
- Utilizar respostas rápidas.
- Registrar data e responsável por cada atendimento.
- Separar as conversas por produto.
- Filtrar por vendedor, produto, canal, status e período.

Registrar a janela de atendimento do WhatsApp e identificar quando for necessário utilizar template aprovado pela Meta.

## 7. PERFIL DO VENDEDOR

Criar um painel individual para cada vendedor com:

- Leads atribuídos.
- CRM separado por produto.
- Conversas pendentes.
- Tarefas do dia.
- Próximos contatos.
- Orçamentos em aberto.
- Pedidos realizados.
- Vendas por período.
- Metas.
- Taxa de conversão.
- Tempo médio de atendimento.
- Comissões.
- Ranking, se autorizado.
- Avisos internos.
- Atalhos para catálogos, tabelas e scripts.

O vendedor deve selecionar um produto e visualizar somente os materiais correspondentes.

## 8. CATÁLOGOS, TABELAS E SCRIPTS

Criar uma biblioteca organizada por produto.

Permitir cadastrar:

- Catálogos.
- Tabelas de preços.
- Scripts de atendimento.
- Objeções e respostas.
- Treinamentos.
- Manuais.
- Vídeos.
- Links.
- Documentos.
- Promoções.
- Políticas comerciais.

Cada conteúdo deve possuir:

- Título.
- Produto.
- Categoria.
- Descrição.
- Arquivo ou link.
- Versão.
- Data de publicação.
- Data de validade.
- Usuários autorizados.
- Status.
- Responsável pela publicação.

Manter histórico de versões das tabelas de preço.

Sempre destacar a versão vigente e alertar quando uma tabela estiver vencida.

## 9. FORNECEDORES

Criar cadastro de fornecedores com:

- Nome ou razão social.
- Documento.
- Contatos.
- País.
- Endereço.
- Produtos fornecidos.
- Moedas aceitas.
- Prazos.
- Condições comerciais.
- Dados bancários.
- Documentos.
- Histórico de compras.
- Cotações.
- Status.
- Avaliação interna.
- Observações.

Um fornecedor poderá estar vinculado a vários produtos.

## 10. COTAÇÕES E CÂMBIO

Criar uma área para trabalhar com:

- Real brasileiro — BRL.
- Dólar americano — USD.
- Guarani paraguaio — PYG.

Permitir:

- Registrar cotação manual.
- Consultar cotação por API futuramente.
- Salvar data e horário da cotação.
- Identificar quem cadastrou.
- Definir margem de segurança.
- Converter valores.
- Manter histórico.
- Escolher a cotação usada em cada pedido ou orçamento.

As conversões de pedidos antigos não devem mudar quando uma nova cotação for cadastrada. Salvar no pedido a taxa efetivamente utilizada.

## 11. PEDIDOS E ORÇAMENTOS

Criar fluxo para:

- Elaborar orçamento.
- Selecionar cliente.
- Selecionar produto.
- Selecionar itens.
- Aplicar descontos conforme permissão.
- Escolher moeda.
- Aplicar cotação.
- Definir validade.
- Gerar PDF.
- Enviar ao cliente.
- Aprovar orçamento.
- Converter orçamento em pedido.
- Registrar pagamento.
- Acompanhar entrega.
- Cancelar com justificativa.

Status padrão:

- Rascunho.
- Enviado.
- Visualizado.
- Em negociação.
- Aprovado.
- Recusado.
- Expirado.
- Convertido em pedido.
- Cancelado.

O pedido deve registrar cliente, produto, vendedor, moeda, cotação, itens, descontos, pagamento, fornecedor e histórico.

## 12. ERP, FINANCEIRO E ESTOQUE

Criar estrutura inicial de ERP contendo:

### Financeiro

- Contas a receber.
- Contas a pagar.
- Receitas.
- Despesas.
- Categorias financeiras.
- Centros de custo.
- Formas de pagamento.
- Parcelas.
- Vencimentos.
- Status.
- Comissões.
- Fluxo de caixa.
- Relatórios por produto.
- Relatórios por moeda.

### Estoque

- Produtos e variações.
- SKU.
- Quantidade atual.
- Estoque mínimo.
- Entradas.
- Saídas.
- Reservas.
- Ajustes.
- Histórico de movimentações.
- Fornecedor.
- Custo.
- Preço.
- Produto ou área de negócio relacionada.

Toda movimentação deve registrar usuário, data, quantidade e motivo.

## 13. AVISOS INTERNOS

Criar uma central de comunicados oficiais.

Permitir:

- Criar avisos gerais.
- Direcionar para produto, setor, equipe, cargo ou usuário.
- Adicionar título, conteúdo e anexos.
- Definir prioridade.
- Marcar como urgente.
- Fixar no topo.
- Programar publicação.
- Definir validade.
- Permitir ou bloquear comentários.
- Solicitar confirmação de leitura.
- Visualizar quem recebeu, leu ou ainda não confirmou.
- Arquivar avisos.
- Enviar notificações dentro do sistema.

Exemplos de avisos:

- Nova tabela de preços.
- Alteração do câmbio.
- Nova campanha.
- Mudança de script.
- Treinamento.
- Reunião.
- Promoção de determinado produto.

## 14. CHAT INTERNO

Criar um chat corporativo em tempo real, separado do WhatsApp.

Permitir:

- Conversas individuais.
- Criação de grupos.
- Grupos por produto.
- Grupos por setor.
- Grupos por equipe.
- Grupos livres, conforme permissão.
- Envio de texto, imagem, áudio e documentos.
- Responder mensagens.
- Editar ou excluir conforme permissão.
- Reações.
- Menções com @usuário.
- Mensagens fixadas.
- Busca no histórico.
- Indicador de mensagem lida.
- Notificações em tempo real.
- Silenciar conversas.
- Mostrar usuários online, quando possível.

Criar grupos automáticos como:

- Todos os vendedores.
- Gestores.
- Financeiro.
- Administrativo.
- Equipe do Produto A.
- Equipe do Produto B.

Quando um usuário ganhar ou perder acesso a um produto, atualizar automaticamente sua participação nos grupos correspondentes.

Dentro do chat, permitir compartilhar links internos para:

- Cliente.
- Lead.
- Oportunidade.
- Pedido.
- Orçamento.
- Produto.
- Tarefa.
- Catálogo.
- Tabela de preço.
- Script.

O acesso ao registro compartilhado deve continuar respeitando as permissões do usuário.

## 15. TAREFAS E NOTIFICAÇÕES

Criar tarefas vinculadas a:

- Cliente.
- Produto.
- Lead.
- Oportunidade.
- Pedido.
- Usuário.
- Equipe.

Cada tarefa deve possuir:

- Título.
- Descrição.
- Responsável.
- Criador.
- Prazo.
- Prioridade.
- Status.
- Produto.
- Registro relacionado.
- Checklist.
- Anexos.
- Comentários.

Criar central de notificações para:

- Novo lead.
- Nova conversa.
- Transferência de atendimento.
- Tarefa próxima do vencimento.
- Orçamento aprovado.
- Pedido atualizado.
- Aviso interno.
- Mensagem no chat.
- Menção.
- Nova tabela de preços.
- Alteração relevante no cliente.

## 16. DASHBOARDS E RELATÓRIOS

Criar um dashboard geral para administradores e um dashboard específico para vendedores.

Indicadores:

- Leads por produto.
- Leads por vendedor.
- Leads por origem.
- Leads por campanha.
- Conversão por etapa.
- Vendas por produto.
- Vendas por vendedor.
- Valor do funil.
- Ticket médio.
- Tempo médio de atendimento.
- Conversas pendentes.
- Motivos de perda.
- Clientes ativos e inativos.
- Pedidos por status.
- Contas a receber.
- Contas a pagar.
- Comissões.
- Evolução mensal.
- Desempenho por moeda.

Permitir filtros por:

- Período.
- Produto.
- Vendedor.
- Equipe.
- País.
- Origem.
- Campanha.
- Moeda.

Os relatórios devem respeitar as permissões do usuário.

## 17. BANCO DE DADOS

Estruturar tabelas equivalentes a:

- profiles
- roles
- permissions
- user_permissions
- teams
- team_members
- products
- product_users
- customers
- customer_contacts
- customer_products
- customer_documents
- pipelines
- pipeline_stages
- opportunities
- opportunity_history
- lead_assignments
- activities
- tasks
- suppliers
- supplier_products
- catalogs
- price_tables
- price_table_items
- sales_scripts
- exchange_rates
- quotes
- quote_items
- orders
- order_items
- payments
- accounts_receivable
- accounts_payable
- inventory_items
- inventory_movements
- meta_integrations
- whatsapp_accounts
- whatsapp_conversations
- whatsapp_messages
- internal_notices
- notice_recipients
- notice_reads
- internal_conversations
- internal_conversation_members
- internal_messages
- internal_message_reads
- notifications
- audit_logs

Criar chaves estrangeiras, índices, datas de criação e atualização, campo de organização quando necessário e regras RLS.

## 18. REGRAS ESSENCIAIS

1. Um cliente pode pertencer a vários produtos.
2. O cadastro principal do cliente deve ser único.
3. O histórico comercial deve ser separado por produto.
4. Cada produto possui CRM, vendedores, materiais e integrações próprias.
5. Um vendedor só visualiza produtos e clientes autorizados.
6. Um administrador pode visualizar toda a operação.
7. Conversas de WhatsApp devem estar vinculadas ao cliente, produto e vendedor.
8. Chat interno e WhatsApp são módulos diferentes.
9. Avisos internos devem permitir confirmação de leitura.
10. Alterações importantes devem gerar histórico de auditoria.
11. Exclusões críticas devem ser lógicas, usando status ou deleted_at.
12. Nenhuma chave secreta deve ser exposta no frontend.
13. Tokens da Meta devem ser armazenados com segurança no backend.
14. Arquivos privados devem respeitar as permissões de acesso.
15. Valores históricos devem manter a cotação usada na operação.

## 19. DESIGN E EXPERIÊNCIA

Criar visual moderno, corporativo e limpo.

Usar:

- Menu lateral.
- Cabeçalho com busca global.
- Seletor de produto.
- Central de notificações.
- Atalho para chat.
- Cards de indicadores.
- Tabelas com filtros.
- Kanban no CRM.
- Modais apenas quando forem realmente úteis.
- Estados de carregamento.
- Mensagens de erro claras.
- Confirmação antes de ações críticas.
- Empty states com orientação.
- Feedback visual ao salvar.

A busca global deve localizar:

- Clientes.
- Leads.
- Produtos.
- Pedidos.
- Orçamentos.
- Fornecedores.
- Conversas.
- Documentos.

## 20. ORDEM DE IMPLEMENTAÇÃO

Implemente inicialmente uma base funcional com:

### Fase 1

- Autenticação.
- Perfis e permissões.
- Produtos.
- Equipes e vendedores.
- Clientes multiproduto.
- CRM por produto.
- Tarefas.
- Catálogos, tabelas e scripts.
- Avisos internos.
- Chat interno.
- Dashboard inicial.

### Fase 2

- Fornecedores.
- Câmbio.
- Orçamentos.
- Pedidos.
- Financeiro.
- Estoque.
- Relatórios avançados.

### Fase 3

- Meta.
- WhatsApp Cloud API.
- Webhooks.
- Distribuição automática de leads.
- Automações.
- Métricas avançadas.

Comece construindo a Fase 1, mas prepare o banco de dados e a arquitetura para as demais fases.

Inclua dados de demonstração identificados como fictícios para facilitar os testes.

Ao concluir cada módulo:

- Verifique se o CRUD funciona.
- Verifique as permissões.
- Teste a responsividade.
- Teste os estados vazios.
- Teste erros de formulário.
- Confirme que os dados estão sendo salvos no Supabase.

## Sistema OS

Esta é uma instalação independente do sistema OS.

**Produção**: https://tirzena.vercel.app

**Supabase**: projeto `wyutdvttldxkaqqysiuv`

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone https://github.com/leadinroi/tirzena.git
cd tirzena
npm i
npm run dev
```
