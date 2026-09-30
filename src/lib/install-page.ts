export function installPage(configured: boolean): Response {
  const status = configured ? 'Configuração do Supabase detectada' : 'Configuração do Supabase pendente'
  const detail = configured
    ? 'A URL e a chave publicável foram fornecidas ao servidor. Faça login e confira seus módulos antes de apontar o domínio.'
    : 'Defina as variáveis abaixo no painel da aplicação Node.js da Hostinger e execute uma nova compilação.'
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Instalação · OS</title><style>body{font:16px/1.5 system-ui,sans-serif;background:#fcfaf7;color:#191a17;margin:0;padding:2rem}main{max-width:720px;margin:auto}h1{font-size:2rem}section{background:#fff;border:1px solid #dfddd4;border-radius:16px;padding:1.5rem;margin:1rem 0}code{background:#f1ede6;padding:.2rem .35rem;border-radius:4px;overflow-wrap:anywhere}li{margin:.5rem 0}a{color:#176540}strong{color:${configured ? '#176540' : '#8a5b16'}}</style></head><body><main><h1>Instalação do OS</h1><section><strong>${status}</strong><p>${detail}</p><p>Este sistema usa Supabase. A hospedagem executa a aplicação Node.js; um banco MySQL da Hostinger não substitui automaticamente o banco atual.</p></section><section><h2>Configurar na Hostinger</h2><ol><li>Abra sua aplicação Node.js em <b>Sites → Gerenciar → Variáveis de ambiente</b>.</li><li>Adicione <code>VITE_SUPABASE_URL</code> e <code>SUPABASE_URL</code> com a URL do projeto autorizado do OS.</li><li>Adicione <code>VITE_SUPABASE_PUBLISHABLE_KEY</code> e <code>SUPABASE_PUBLISHABLE_KEY</code> com a chave publicável desse mesmo projeto. Nunca use service_role no navegador.</li><li>Compile novamente com <code>npm run build:hostinger</code> e inicie com <code>npm start</code>.</li></ol><p>Depois teste o <a href="/auth">login</a>, o dashboard e as permissões antes de mudar o domínio.</p></section></main></body></html>`
  return new Response(html, {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'x-robots-tag': 'noindex, nofollow',
      'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'",
    },
  })
}
