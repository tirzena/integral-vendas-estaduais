import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'

rmSync('dist', { recursive: true, force: true })
mkdirSync('dist/server', { recursive: true })
mkdirSync('dist/.openai', { recursive: true })
cpSync('.output/server', 'dist/server', { recursive: true })
cpSync('.output/public', 'dist/client', { recursive: true })
cpSync('.openai/hosting.json', 'dist/.openai/hosting.json')
writeFileSync('dist/server/index.js', "export { default } from './index.mjs'\n")
console.log('Sites Worker e arquivos públicos preparados em dist/')
