# Vendas Estaduais: primeiro teste PHP/MySQL

## Instalação pelo navegador

Depois de conectar a branch `main` na Hostinger e criar o banco MySQL, reimplante o Git. Adicione uma chave `deployment_key` aleatória de 64 caracteres hexadecimais a `integral-secrets/teste.php` da Direção Geral. Abra `/install.php` neste subdomínio e informe essa chave, nome, usuário e senha do banco, sem login administrativo. O instalador identifica tabelas já importadas, cria as ausentes em banco vazio, gera uma chave individual, registra a chave na Direção Geral e salva a configuração fora de `public_html`. Para Captação, informe também as chaves do Cloudflare Turnstile. Após instalar, `/install.php` fica bloqueado. Os passos de criação manual de `integral-secrets` abaixo são uma alternativa para ambientes onde o PHP não pode gravar fora de `public_html`.

Esta base permite login único via Direção Geral PHP e registros de trabalho por UF. As rotinas e dados específicos do OS ainda não foram migrados.

1. Criar o site PHP/HTML `estadual.qrcodevalidacao.com` na Hostinger e conectar este repositório pela branch `main` à pasta `public_html`.
2. Criar um banco exclusivo e importar `schema.sql` pelo phpMyAdmin.
3. Criar `integral-secrets/estadual.php` ao lado de `public_html`, copiando `config.example.php`. Preencher banco, URL da Direção e chave aleatória exclusiva de 32+ caracteres. Não salvar senhas ou chaves neste repositório.
4. Na configuração privada `integral-secrets/teste.php` do site Direção, adicionar a mesma chave à entrada `services['vendas_estaduais']`.
5. Acessar a Direção no navegador com um membro autorizado para `Vendas Estaduais` e a UF correspondente. Abrir `estadual.qrcodevalidacao.com`; o cookie da Direção é compartilhado entre subdomínios. Conferir que uma conta sem esse vínculo recebe acesso negado.

Não usar essa primeira etapa para dados reais antes de validar autenticação, banco e migração específica.
