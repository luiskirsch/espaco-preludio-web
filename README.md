# Espaço Prelúdio

SaaS de telessaúde para psicólogos e psiquiatras — videoconsulta cifrada, prontuário E2EE, receita digital com assinatura ICP-Brasil.

- Frontend: GitHub Pages servindo este repo em `https://espacopreludio.com.br`
- Backend: Node.js no Railway (`osl-video-server-staging.up.railway.app`)
- Auth/DB: Firebase (projeto interno `sextolugar-staging` — compartilhado com a plataforma Prelúdio Jogos)

Esse repositório é só o frontend estático (HTML/CSS/JS puro). O código do backend mora em [osl-video-server](https://github.com/luiskirsch/osl-video-server).

## Staging

`staging/` é cópia idêntica da produção (raiz). Edite só a raiz e rode `npm run sync:staging` antes do commit; o workflow de traduções também espelha a cada push na `main`. `npm run check:mirrors` acusa qualquer divergência. Arquivos que só fazem sentido na raiz (CNAME, robots.txt, sitemap.xml, 404.html etc.) estão listados em `ROOT_ONLY`, no próprio script.

## Responsividade

Todas as p?ginas de navega??o carregam `css/responsive.css` depois dos estilos espec?ficos. Rode `npm run check:responsive` com Chrome/Edge instalado (ou defina `CHROME_PATH`) para conferir as 120 p?ginas de 320 a 1440 pixels, incluindo orienta??o horizontal e janelas de di?logo. O relat?rio fica em `docs/mobile-audit.json`. A auditoria usa HTML/CSS locais com scripts e servi?os externos desativados; n?o substitui a valida??o dos fluxos autenticados em aparelhos reais. `npm run check` continua verificando os fluxos existentes e a igualdade do staging.
