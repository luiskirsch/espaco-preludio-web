# Entrega direta do painel da empresa

Quando a publicação do GitHub Pages atrasa, os Workers de segurança podem entregar
o painel corporativo e suas dependências públicas diretamente pela Cloudflare.
As rotas do domínio e os cabeçalhos de segurança permanecem os mesmos.

O Worker consulta a versão da página no Pages e volta a usar a origem quando
encontra a entrada `empresa-gestao.js`. A conferência é compartilhada por dez
segundos em cada instância do Worker. Isso permite que atualizações posteriores
continuem pelo fluxo normal do GitHub, sem manter o painel preso ao pacote local.

Antes de publicar os Workers, na cópia limpa de deploy:

```powershell
node scripts/build-empresa-edge.mjs
npx -y wrangler@4 deploy -c security/edge/wrangler.staging.jsonc
npx -y wrangler@4 deploy -c security/edge/wrangler.jsonc
```

O pacote `.empresa-edge-assets/` é ignorado pelo Git e contém somente os arquivos
explicitamente listados em `security/edge/empresa-assets.mjs`. Nunca configure a
raiz do repositório como diretório público dos assets.
