# Diário dos Pensamentos Vividos

Seção compartilhada pelos portais do colaborador (`app/diario.html`) e do aluno
(`aluno-diario.html`). Os atalhos ficam no início e nos menus dos portais.

## Desenvolvimento e prévia

Sirva o repositório por HTTP e abra `/app/diario.html?preview=1` ou
`/aluno-diario.html?preview=1` em `localhost` ou `127.0.0.1`. A prévia usa uma
memória ilustrativa e registros em memória; não acessa Firebase, não envia
texto ao servidor e não mantém as alterações ao recarregar. O modo de prévia
não é habilitado em outros domínios.

As duas páginas usam `app/diary.js`, `diary-model.js`, `diary-audio.js`,
`diary-pages.js` e `diary.css`. A versão do aluno mantém o mesmo HTML, com os caminhos de CSS/JS,
identidade de portal e links de retorno ajustados. Os arquivos de implantação
também são espelhados em `staging/`.

A experiência de escrita abre como um livro físico: a capa de couro pode ser
aberta e fechada, o pergaminho mantém proporção fixa e a data, a fase lunar,
as perguntas rotativas, o selo de página salva e os sentimentos rápidos ficam
integrados à folha. A textura de couro veio do protótipo HTML fornecido para o
projeto e foi incorporada como arquivo local em `app/assets/diary/`, sem
dependência externa. Em telas estreitas, o livro e os painéis se reorganizam
sem rolagem horizontal; a composição mantém os mesmos recursos nos portais do
colaborador e do aluno.

No desktop, ferramentas e inspirações acompanham o livro em duas laterais,
deixando a página sempre no centro. A capa usa movimentos inversos para abrir e
fechar: no fechamento ela é preparada fora do campo visual e volta opaca pela
dobradiça, sem atravessar o pergaminho como uma camada transparente. O nome,
a ação de edição e o convite para abrir permanecem dentro da moldura da capa.

## Registros e privacidade

O backend correspondente está em `osl-video-server/routes/diary.js` e
`services/diary.js`, integrado ao router de terapia e ao segundo fator já
existente. É necessário publicar **backend e frontend** para habilitar os
registros na instalação online.

- `GET /therapy/paciente/diario`: páginas, sonhos e metadados de cápsulas;
  paginação em blocos de 100 por `nextCursor`.
- `PUT /therapy/paciente/diario/:id`: gravação com controle de versão.
- `DELETE /therapy/paciente/diario/:id?version=N`: exclusão com controle de versão.

O proprietário é sempre a conta Firebase autenticada; não se aceita UID de
outra pessoa nem ID de aluno para escolher o diário. Quando o portal é usado
por um responsável, o diário pertence à conta do responsável. Não é um
registro individual de cada dependente selecionado.

Textos, sentimentos e personalizações são cifrados em repouso com AES-GCM,
usando chave derivada por conta. As respostas têm `private, no-store`. Não se
mantém rascunho pessoal em localStorage. Falhas de salvamento ficam visíveis;
trocas de página aguardam os salvamentos e conflitos permitem guardar uma
nova cópia. A exclusão definitiva da conta remove os registros associados.

Cápsulas seladas não são editáveis. O servidor omite sua mensagem até o dia
de abertura em `America/Sao_Paulo`, inclusive para o próprio titular. Elas
continuam podendo ser excluídas. O servidor verifica a data autenticada dentro
do conteúdo cifrado, além dos metadados de busca.

## Recursos sensoriais

A trilha só começa após uma ação. “Chuva na cabana & piano” mistura uma
gravação real de chuva, com agudos suavizados, e um piano sintetizado mais
baixo. O arquivo MP3 de 45 segundos é carregado do próprio portal, sem
serviços de áudio externos; sua emenda recebe uma transição suave. O preset
de piano sozinho também continua disponível. A gravação é de Ylmir, publicada
como CC0 em https://opengameart.org/content/rain-loopable; fonte e tratamento
estão em `app/assets/diary/AUDIO-CREDITS.md`. O exemplo WAV de 29 segundos em
`docs/diary-preview/cabin-rain.wav` contém apenas a chuva gravada tratada.
O ditado usa o reconhecimento de voz disponível no navegador;
o modal informa sobre o processamento de áudio pelo serviço do navegador.
O diário mantém apenas a transcrição. Aromas são associações simbólicas.
Além das sugestões, o titular pode descrever seu próprio aroma em até 100
caracteres. O campo opcional `aromaText` é cifrado com a página; uma sugestão
selecionada limpa esse campo. Registros antigos continuam usando `aroma`.
O clima reutiliza a API de ambiente do portal; quando indisponível, pode ser
escolhido manualmente. Coordenadas não são gravadas no diário. Clima,
sentimentos, marcadores, aroma e estilo de escrita acionam salvamento imediato,
mesmo antes de existir texto, e são restaurados ao recarregar a página.

Os insights representam os sentimentos escolhidos pelo titular, sem análise
automática do texto ou avaliação clínica. Desabafos são descartados na própria
interface, sem envio ou gravação. As ilustrações de pergaminho e parque foram
geradas para esta implementação e otimizadas em WebP em `app/assets/diary/`.
As folhas fazem parte da ilustração estática do pergaminho. O papel e a
escrita ficam estáveis. As pistas de escrita são curtas e os controles
ficam sobre uma superfície clara, afastados das folhas pintadas.

A escrita usa folhas de altura fixa. Quando o cursor alcança o fim da área
útil, a interface abre automaticamente a página seguinte com uma virada de
papel e um som curto gravado. O registro continua sendo um único texto cifrado,
por isso autosave, busca e reabertura preservam todas as páginas. Os botões sob
a escrita permitem voltar e avançar sem alterar o conteúdo. O efeito visual é
desativado quando o dispositivo pede movimento reduzido; o som respeita o
controle de volume da trilha e também pode ficar mudo. A gravação de papel de
yd é CC0 e está documentada em `app/assets/diary/AUDIO-CREDITS.md`.

O botão “Nova página” aguarda o salvamento da escrita atual e vira a folha
com o mesmo som de papel. A folha escrita permanece visível na virada enquanto
o novo registro aparece por baixo. A página anterior continua acessível na
linha do tempo. Cliques repetidos ficam bloqueados durante a troca; falhas de
salvamento mantêm a escrita atual aberta. A cópia visual da folha é removida ao
terminar a animação, navegar para outra seção ou trocar de conta.
O som só acompanha a criação de uma página ou uma virada real por escrita e
navegação. Ajustes de layout, salvamento, cliques para posicionar o cursor e
teclas sem navegação permanecem silenciosos. A gravação não fica em repetição
e é interrompida ao ocultar ou sair da página.

## Verificação

`npm test`, `npm run i18n:audit` e `npm run check:mirrors` verificam o frontend.
`test/diary-browser.test.mjs` exercita os fluxos e dimensões responsivas usando
Chrome/Edge, com a prévia isolada. Para atualizar as capturas locais, execute
com `DIARY_CAPTURE_PREVIEW=1`. Os testes de áudio usam simulações de Web Audio
e reconhecimento de voz; microfone, qualidade sonora e localização dependem
do dispositivo e das permissões do usuário.
