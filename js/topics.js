// Espaço Prelúdio — biblioteca curada de tópicos clínicos.
//
// Prompts abertos para o profissional usar como apoio à condução, sem prescrever
// rumo. Não é gamificação: é um livro de bolso visual. Cada tópico carrega a
// abordagem (TCC, psicanalítica, ACT, sistêmica, humanista) só pra navegação —
// o profissional escolhe o que fizer sentido no momento.
//
// Curadoria: prompts genéricos extraídos da prática clínica, formulados em
// português neutro. Para uso supervisionado por profissionais habilitados.

export const TOPIC_LIBRARY = [
  // ─── TCC (Terapia Cognitivo-Comportamental) ──────────────────
  { abord: "tcc", text: "Quais pensamentos passaram pela sua cabeça nesse momento?" },
  { abord: "tcc", text: "Que evidências você tem de que esse pensamento é verdade? E contra?" },
  { abord: "tcc", text: "Se um amigo passasse por isso, o que você diria a ele?" },
  { abord: "tcc", text: "Qual foi o gatilho — situação, sensação, lembrança?" },
  { abord: "tcc", text: "Como você se sentiu no corpo? Onde sentiu primeiro?" },
  { abord: "tcc", text: "Que comportamento aliviou (ou pioraria) essa emoção a curto prazo?" },
  { abord: "tcc", text: "Se essa cena se repetisse amanhã, o que você gostaria de testar diferente?" },
  { abord: "tcc", text: "Há uma distorção familiar aqui — catastrofização, leitura mental, tudo-ou-nada?" },

  // ─── Psicanalítica ───────────────────────────────────────────
  { abord: "psicanalitica", text: "Diga o primeiro que vier à mente — sem filtrar." },
  { abord: "psicanalitica", text: "O que isso te lembra de alguém ou de outro momento?" },
  { abord: "psicanalitica", text: "Como você acha que essa cena terminaria, se dependesse do desejo?" },
  { abord: "psicanalitica", text: "Quem está ouvindo isso por trás de mim, agora, na sua imaginação?" },
  { abord: "psicanalitica", text: "O que ficou sem dizer dessa vez?" },
  { abord: "psicanalitica", text: "Esse silêncio diz alguma coisa que as palavras não disseram?" },
  { abord: "psicanalitica", text: "Houve um sonho recente que você queira trazer?" },
  { abord: "psicanalitica", text: "Que parte de você está falando agora — e que parte está calada?" },

  // ─── ACT (Aceitação e Compromisso) ───────────────────────────
  { abord: "act", text: "Que valor seu está sendo afastado por essa decisão?" },
  { abord: "act", text: "Se essa dor fosse um companheiro de viagem, o que ela está te dizendo?" },
  { abord: "act", text: "O que você faria se a ansiedade não fosse o critério?" },
  { abord: "act", text: "Que pequena ação coerente com seu valor é possível esta semana?" },
  { abord: "act", text: "É possível ter esse pensamento e ainda assim seguir o que importa?" },
  { abord: "act", text: "Quais são as três coisas que você consegue ver, ouvir e sentir agora?" },
  { abord: "act", text: "Esse 'eu' que observa — ele é o pensamento ou está olhando o pensamento?" },

  // ─── Sistêmica / Familiar ────────────────────────────────────
  { abord: "sistemica", text: "Quem mais nessa história poderia se beneficiar de uma mudança?" },
  { abord: "sistemica", text: "Que papel você foi convidado a ocupar nessa família?" },
  { abord: "sistemica", text: "Se essa relação fosse uma dança, qual é o passo que sempre se repete?" },
  { abord: "sistemica", text: "Que história das gerações anteriores pode estar ecoando aqui?" },
  { abord: "sistemica", text: "Qual seria a fala que essa pessoa nunca ouviu de quem mais precisava?" },
  { abord: "sistemica", text: "Como ficaria essa cena se você desse um passo para trás e olhasse o conjunto?" },

  // ─── Humanista / Centrada na pessoa ──────────────────────────
  { abord: "humanista", text: "O que está sendo difícil aqui agora?" },
  { abord: "humanista", text: "Onde, no seu corpo, essa palavra faz mais sentido?" },
  { abord: "humanista", text: "Há algo que você gostaria de ouvir de si mesmo, mas ninguém disse?" },
  { abord: "humanista", text: "O que essa parte de você precisa que ainda não recebeu?" },
  { abord: "humanista", text: "Se a gente pudesse pausar a cobrança, o que apareceria?" },

  // ─── Encerramento de sessão ──────────────────────────────────
  { abord: "fechamento", text: "Do que falamos hoje, o que você quer levar pra essa semana?" },
  { abord: "fechamento", text: "Houve algum momento, hoje, em que sua respiração mudou?" },
  { abord: "fechamento", text: "Se essa sessão tivesse um título, qual seria?" },
  { abord: "fechamento", text: "O que ficou ainda querendo ser dito?" }
];

export const ABORDAGEM_LABEL = {
  tcc: "TCC",
  psicanalitica: "Psicanalítica",
  act: "ACT",
  sistemica: "Sistêmica",
  humanista: "Humanista",
  fechamento: "Fechamento"
};

export function shuffle(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
