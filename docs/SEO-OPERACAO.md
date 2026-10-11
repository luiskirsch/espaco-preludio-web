# SEO — implementação e serviços externos

Atualizado em 11/10/2026.

## Implementado

- `app/login.html` e seu espelho em staging: `noindex, nofollow`.
- Logos da home: `alt="Espaço Prelúdio"`. As bandeiras geradas por `i18n/init.js` já tinham `alt=""` e permanecem decorativas.
- FAQPage com as seis perguntas e respostas publicadas na home.
- Quatro guias específicos e um índice editorial, vinculados pela home e entre si, com canonical, descrição, Open Graph e dados estruturados.
- Sitemap com os cinco novos endereços e atualização da data da home.

## Search Console

O DNS público de `espacopreludio.com.br` contém registros TXT `google-site-verification`. Não é necessário inventar uma tag de verificação no HTML. A presença do registro não confirma que a propriedade está acessível na conta atual, que a verificação continua aceita ou que o sitemap foi enviado.

O sitemap público é `https://espacopreludio.com.br/sitemap.xml`. Para conferir o envio ou registrar o sitemap pela API, é necessário OAuth de uma conta com permissão na propriedade. Não há credencial Google disponível nesta execução. Uma integração GSC Wizard foi sugerida para análise de propriedades e inspeção de URLs, mas ainda não está conectada; ela não deve ser tratada como tendo capacidade de enviar sitemap ou solicitar indexação sem conferir suas ferramentas.

Endpoint oficial de envio de sitemap, quando houver autenticação apropriada:

```text
PUT https://www.googleapis.com/webmasters/v3/sites/{siteUrl}/sitemaps/{feedpath}
Authorization: Bearer <OAuth access token>
```

Codificar os dois parâmetros como componentes de URL. Para propriedade de domínio, `siteUrl` é `sc-domain:espacopreludio.com.br`; `feedpath` é a URL completa do sitemap. A API de inspeção de URL consulta o estado de indexação; ela não solicita indexação. A Indexing API do Google não é um mecanismo genérico para enviar estes guias.

Referências: [envio de sitemap](https://developers.google.com/webmaster-tools/v1/sitemaps/submit), [inspeção de URL](https://developers.google.com/webmaster-tools/v1/urlInspection.index/inspect).

## Perfil da Empresa

O Google exige contato presencial com clientes para elegibilidade de um Perfil da Empresa. Empresas exclusivamente online não são elegíveis. Não foi criado um perfil com endereço ou atendimento presencial presumido.

Dados confirmados para um cadastro elegível:

- Nome: Espaço Prelúdio.
- Razão social: Prelúdio Software Systems LTDA.
- CNPJ: 67.092.881/0001-99.
- Site: https://espacopreludio.com.br/.
- E-mail: contato@espacopreludio.com.br.
- Telefone divulgado na home: +55 48 98863-7670.
- Descrição: Programa institucional de telepsicologia para escolas e redes de ensino, com acesso estudantil a atendimento psicológico remoto, consentimento, triagem, encaminhamento e acompanhamento por indicadores agregados.

Endereço de atendimento, horários, contato presencial e categoria apropriada precisam ser confirmados; o site não oferece esses dados como fatos verificáveis para este cadastro. A categoria deve representar a atividade da empresa, sem apresentar uma plataforma como um profissional de psicologia.

Referência: [elegibilidade do Perfil da Empresa](https://support.google.com/business/answer/13763036).

## Autoridade e links externos

Os guias publicados são os materiais que podem ser citados por parceiros. Não há autorização específica para enviar mensagens a terceiros nem acesso às contas de parceiros ou diretórios. Nenhum backlink, parceria, depoimento ou associação foi declarado como obtido.

| Canal verificado | Material ou oportunidade | Situação |
| --- | --- | --- |
| Escolas e redes com parceria real | Link para o guia sobre psicólogo para escolas em páginas de recursos para famílias ou gestores | Depende da instituição; não presumir parceria |
| Secretarias de educação com programa efetivamente contratado | Página institucional sobre o programa, com link para o site e seu escopo | Depende de publicação pela secretaria |
| [Startup Base / ABStartups](https://startupbase.app/sobre) | Vitrine pública de startups; avaliar cadastro com os dados confirmados | Cadastro não enviado |
| [ACATE](https://www.acate.com.br/empresas-associadas/) | Diretório de empresas associadas; usar apenas se houver vínculo ou adesão aprovada | Associação não confirmada; não contratar automaticamente |
| [ABED](https://www.abed.org.br/site/associados/consulta-associados-ativos/) | Relação de associados ligados à educação a distância | Associação não confirmada; não contratar automaticamente |

Texto preparado para uma escola parceira, sem envio:

> Publicamos um guia para gestores sobre como organizar o acesso de estudantes ao cuidado psicológico, com consentimento, sigilo e responsabilidades claras: https://espacopreludio.com.br/psicologo-para-escolas.html. Caso o conteúdo seja útil à comunidade da escola, ele pode ser incluído na página de recursos da instituição. O material descreve o planejamento do programa e seus limites, sem prometer resultados clínicos.

Pauta preparada para imprensa, sem envio: “Como escolas podem organizar acesso ao cuidado psicológico sem expor prontuários de estudantes”. Usar o guia de saúde mental de estudantes como referência. Estudos de caso exigem resultados documentados e autorização antes de divulgar instituições, profissionais ou participantes.

## FAQ e medição

O Google encerrou os resultados enriquecidos de FAQ a partir de 07/05/2026. A marcação descreve as perguntas existentes, mas não promete destaque visual ou melhora de ranking. [Atualização oficial](https://developers.google.com/search/updates#may-2026).

Após acesso ao Search Console, registrar estado de indexação dos cinco novos endereços, impressões, cliques, consultas e CTR. Comparar períodos equivalentes após a descoberta das páginas. Não há garantia de prazo ou posição na busca.
