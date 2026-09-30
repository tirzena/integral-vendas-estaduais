# Roadmap

## Concluído nesta etapa
- Ranking de pedidos, vendas reais, conversão e bonificações (página + resumo no painel com filtros).
- Regras de bonificação e bonificações concedidas (somente administração).
- Remuneração por pessoa/produto (% ou valor fixo, por dia/semana/mês/venda), lançamentos e folha de pagamento.
- Financeiro com resumo de ganhos, gastos e dividendos em dólar, real e guarani.
- Investimentos: pessoais (privados) e da empresa, com totais.
- Catálogo e tabela de preços automáticos dentro de Categorias e estoque, com exportação em texto/planilha e atualização por texto colado.
- Fornecedor selecionável ao cadastrar produto no estoque.
- Avisos internos somente por administradores e exibidos no painel de cada pessoa.
- Menu reorganizado: Membros, Ranking, Investimentos; Catálogos e Relatórios saíram do menu (relatórios viraram botão em Painel, Financeiro, Categorias e estoque e Tarefas).

- Cada categoria funciona como área própria: financeiro, folha, remuneração, investimentos e BMs de tráfego seguem a categoria escolhida no topo.
- Cotações extras ao vivo (criptos, ações, moedas) e investimentos em cripto/ação/CDB com valor atualizado.

## Pendências
- Importação de lista de produtos por IA (hoje a leitura de texto é por regra simples; falta foto/documento).
- Testes ponta a ponta de CRUD e permissões por papel.
- Revisar isolamento RLS por produto e avisos de SECURITY DEFINER do linter.
- Proteger tokens Meta (função segura/criptografia).

## Feito (set/2026)
- Menu agrupado por seções (Comercial reúne CRM, Atendimentos e Tráfego pago).
- Nova aba Listas de contatos: importar/exportar planilha, direcionar por membro e enviar ao CRM.

## Agenda e visão admin (set/2026)
- [ ] Google Agenda: agenda da empresa + cada membro conecta a sua por botão
- [ ] Visão interna admin: espelhar a tela como o membro a vê
- [ ] Painel: faturamento do dia e da semana + dívidas do dia e da semana

- [x] Disparador de mensagens (Atendimentos): campanhas WhatsApp/e-mail/SMS, consentimento LGPD, supressão, fila com idempotência e webhooks. Pendente: cadastrar chaves dos provedores e CAMPAIGNS_WEBHOOK_SECRET.
