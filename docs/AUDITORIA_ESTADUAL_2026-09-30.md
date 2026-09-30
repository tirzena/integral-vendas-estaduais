# Auditoria funcional — Vendas Estaduais — 2026-09-30

## Contexto preservado
- Repositório independente: tirzena/integral-vendas-estaduais, main.
- Base examinada: 38aac1743c51825312739db38a245ed6c27add1b.
- Ambiente: https://mediumvioletred-penguin-501833.hostingersite.com
- Manter a migração PHP → Node/TanStack/Nitro e o backend autorizado Supabase wyutdvttldxkaqqysiuv.
- Node 24; npm ci; npm run build:hostinger; npm start; entrada .output/server/index.mjs.
- Não conectar estadual.qrcodevalidacao.com antes de concluir a validação.
- Não alterar nem apagar registros reais sem necessidade.

## Evidências e pendências
| ID | Problema / observação | Evidência | Estado |
| --- | --- | --- | --- |
| AUD-001 | Erro de hidratação React no acesso inicial pela raiz | Console do navegador: Minified React error #418, após / → /auth. Acesso direto a /auth não apresentou esse erro nesta observação. | Investigar e reproduzir; ainda sem correção confirmada |
| AUD-002 | Menu Relatórios não abre módulo de relatórios | src/routes/_authenticated/relatorios.tsx executa redirect para /painel e component retorna null. | Confirmado por código; implementação e teste pendentes |
| AUD-003 | Auditoria autenticada bloqueada por verificação do Google | Login OAuth chega a “Confirme que é você”, com reCAPTCHA. | Aguardando conclusão segura do login; não é falha confirmada do sistema |
| ENV-001 | Build de referência | npm ci concluído e npm run build:hostinger passou em Node v24.19.0. | Validado, antes de correções |

O erro emitido por chrome-extension:// no navegador foi separado dos erros da aplicação.

## Cobertura real até este ponto
- Abertura do ambiente e redirecionamento para login observados.
- Tela pública /auth carregada diretamente.
- Início de OAuth Google observado até desafio; sucesso de login ainda não confirmado.
- Build de referência validado; nenhum dado operacional criado, editado ou removido.
- Ainda NÃO validados: logout, Visão Geral, Leads e CRM, Clientes, Catálogo e preços, Pedidos, Promoções, Entregas, Pagamentos e comissões, Metas e ranking, Relatórios, Vendedores, Tarefas, Notificações e Chat interno.
- Botões, filtros, formulários, modais, criação/edição, URLs internas, responsividade e rede dos módulos continuam pendentes de autenticação.

## Próxima execução
1. Concluir autenticação no mesmo navegador por mecanismo seguro.
2. Testar os 14 módulos com registros de teste identificados, preservando registros reais.
3. Corrigir achados por conjunto; validar build a cada conjunto.
4. Retestar no ambiente temporário e atualizar este registro com evidências e limitações.
