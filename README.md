# Espaço Prelúdio

SaaS de telessaúde para psicólogos e psiquiatras — videoconsulta cifrada, prontuário E2EE, receita digital com assinatura ICP-Brasil.

- Frontend: GitHub Pages servindo este repo em `https://espacopreludio.com.br`
- Backend: Node.js no Railway (`https://api.espacopreludio.com.br` → mesma instância do osl-video-server)
- Auth/DB: Firebase (projeto `sextolugar-staging`)

Esse repositório é só o frontend estático (HTML/CSS/JS puro). O código do backend mora em [osl-video-server](https://github.com/luiskirsch/osl-video-server).

## Status

Em ambiente de testes. Não usar com pacientes reais até auditoria jurídica + LGPD/CFP completa.
