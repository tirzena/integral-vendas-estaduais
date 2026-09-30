# Publicação do OS integrado na Hostinger

O sistema principal deste projeto é o OS, com as rotas e os módulos existentes. A versão demonstrativa anterior está disponível em `/integral/` após a compilação. Este projeto precisa de um servidor Node.js para servir as rotas e os endpoints; o ZIP estático anterior em `public_html` não executa esses endpoints.

## Antes de alterar o domínio atual

Use a opção **Deploy Web App → Upload your website files** da Hostinger em um endereço temporário. É necessário um plano que aceite aplicações Node.js. Não substitua o conteúdo atual de `public_html` enquanto não tiver confirmado login, dashboard e módulos no endereço temporário.

Selecione Node.js 24, gerenciador npm e, caso a configuração seja manual, use:

| Configuração | Valor |
| --- | --- |
| Instalação | `npm ci` |
| Compilação | `npm run build:hostinger` |
| Inicialização | `npm start` |
| Arquivo de entrada | `.output/server/index.mjs` |
| Tipo de aplicação | Other, caso não seja reconhecido automaticamente |

Configure as variáveis de ambiente no painel da Hostinger, sem gravá-las no ZIP:

- `VITE_SUPABASE_URL` e `SUPABASE_URL`: URL do projeto Supabase autorizado do OS.
- `VITE_SUPABASE_PUBLISHABLE_KEY` e `SUPABASE_PUBLISHABLE_KEY`: mesma chave **publishable** desse projeto. Nunca use uma chave secret/service_role no frontend.
- Os endpoints opcionais de Meta, campanhas, rastreamento e outras integrações podem exigir as credenciais de servidor próprias, que devem ser configuradas separadamente no painel. A compilação não comprova que esses serviços estejam conectados.

Acesse `/install.php` para conferir se as duas variáveis de servidor do Supabase foram detectadas e ver os passos de instalação. Esta rota é servida pelo aplicativo Node.js, não pelo interpretador PHP; ela não grava senhas nem provisiona MySQL. Como as variáveis `VITE_` entram na compilação, configure-as antes de compilar e faça uma nova implantação quando alterá-las.

O login por senha usa o Supabase. Para Google, recuperação de senha e links enviados por email funcionarem no novo endereço, confira os URLs permitidos em **Supabase Auth → URL Configuration** antes de apontar o domínio. Após a publicação temporária, teste ao menos login, `/painel`, `/crm`, `/pedidos`, `/integral/` e uma função real autorizada de cada módulo relevante. Só então troque o endereço principal para o novo aplicativo.

Para voltar à versão anterior da prévia do Sites, use o histórico de versões. Para voltar ao site atual na Hostinger, preserve a publicação anterior e mantenha o domínio apontado para ela até terminar a validação.
