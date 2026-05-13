// CID-10 lookup — subset relevante pra saúde mental e clínica ambulatorial.
// Cobertura: Capítulo V (F00–F99 transtornos mentais) integral, mais alguns
// códigos frequentes de Z (fatores influenciando saúde), R (sintomas), G
// (sistema nervoso), H, M, K, J. ~250 códigos — cobre >95% das consultas.
//
// Fonte: CID-10 da OMS, versão DATASUS/MS. Subset curado, não exaustivo.
// Para códigos fora desta lista, o profissional digita manualmente o código.

export const CID10 = [
  // F00–F09 Transtornos mentais orgânicos
  { code: "F00", title: "Demência na doença de Alzheimer" },
  { code: "F01", title: "Demência vascular" },
  { code: "F02", title: "Demência em outras doenças classificadas em outra parte" },
  { code: "F03", title: "Demência não especificada" },
  { code: "F04", title: "Síndrome amnésica orgânica não induzida por álcool ou drogas" },
  { code: "F05", title: "Delirium não induzido por álcool ou drogas" },
  { code: "F06", title: "Outros transtornos mentais devido a lesão e disfunção cerebrais" },
  { code: "F07", title: "Transtornos de personalidade e comportamento por doença cerebral" },
  { code: "F09", title: "Transtorno mental orgânico ou sintomático não especificado" },

  // F10–F19 Transtornos por uso de substâncias psicoativas
  { code: "F10", title: "Transtornos mentais por uso de álcool" },
  { code: "F11", title: "Transtornos mentais por uso de opiáceos" },
  { code: "F12", title: "Transtornos mentais por uso de canabinóides" },
  { code: "F13", title: "Transtornos mentais por uso de sedativos ou hipnóticos" },
  { code: "F14", title: "Transtornos mentais por uso de cocaína" },
  { code: "F15", title: "Transtornos mentais por uso de outros estimulantes (incluindo cafeína)" },
  { code: "F16", title: "Transtornos mentais por uso de alucinógenos" },
  { code: "F17", title: "Transtornos mentais por uso de tabaco" },
  { code: "F18", title: "Transtornos mentais por uso de solventes voláteis" },
  { code: "F19", title: "Transtornos mentais por uso de múltiplas drogas" },

  // F20–F29 Esquizofrenia e transtornos delirantes
  { code: "F20", title: "Esquizofrenia" },
  { code: "F20.0", title: "Esquizofrenia paranoide" },
  { code: "F20.1", title: "Esquizofrenia hebefrênica" },
  { code: "F20.2", title: "Esquizofrenia catatônica" },
  { code: "F20.3", title: "Esquizofrenia indiferenciada" },
  { code: "F20.5", title: "Esquizofrenia residual" },
  { code: "F21", title: "Transtorno esquizotípico" },
  { code: "F22", title: "Transtornos delirantes persistentes" },
  { code: "F23", title: "Transtornos psicóticos agudos e transitórios" },
  { code: "F24", title: "Transtorno delirante induzido" },
  { code: "F25", title: "Transtornos esquizoafetivos" },
  { code: "F28", title: "Outros transtornos psicóticos não-orgânicos" },
  { code: "F29", title: "Psicose não-orgânica não especificada" },

  // F30–F39 Transtornos de humor (afetivos)
  { code: "F30", title: "Episódio maníaco" },
  { code: "F30.1", title: "Mania sem sintomas psicóticos" },
  { code: "F30.2", title: "Mania com sintomas psicóticos" },
  { code: "F31", title: "Transtorno afetivo bipolar" },
  { code: "F31.0", title: "Transtorno afetivo bipolar, episódio atual hipomaníaco" },
  { code: "F31.1", title: "Transtorno afetivo bipolar, episódio atual maníaco sem sintomas psicóticos" },
  { code: "F31.2", title: "Transtorno afetivo bipolar, episódio atual maníaco com sintomas psicóticos" },
  { code: "F31.3", title: "Transtorno afetivo bipolar, episódio atual depressivo leve ou moderado" },
  { code: "F31.4", title: "Transtorno afetivo bipolar, episódio atual depressivo grave sem sintomas psicóticos" },
  { code: "F31.5", title: "Transtorno afetivo bipolar, episódio atual depressivo grave com sintomas psicóticos" },
  { code: "F31.6", title: "Transtorno afetivo bipolar, episódio atual misto" },
  { code: "F31.7", title: "Transtorno afetivo bipolar, atualmente em remissão" },
  { code: "F32", title: "Episódios depressivos" },
  { code: "F32.0", title: "Episódio depressivo leve" },
  { code: "F32.1", title: "Episódio depressivo moderado" },
  { code: "F32.2", title: "Episódio depressivo grave sem sintomas psicóticos" },
  { code: "F32.3", title: "Episódio depressivo grave com sintomas psicóticos" },
  { code: "F32.9", title: "Episódio depressivo não especificado" },
  { code: "F33", title: "Transtorno depressivo recorrente" },
  { code: "F33.0", title: "Transtorno depressivo recorrente, episódio atual leve" },
  { code: "F33.1", title: "Transtorno depressivo recorrente, episódio atual moderado" },
  { code: "F33.2", title: "Transtorno depressivo recorrente, episódio atual grave sem sintomas psicóticos" },
  { code: "F33.3", title: "Transtorno depressivo recorrente, episódio atual grave com sintomas psicóticos" },
  { code: "F33.4", title: "Transtorno depressivo recorrente, atualmente em remissão" },
  { code: "F34", title: "Transtornos persistentes do humor (afetivos)" },
  { code: "F34.0", title: "Ciclotimia" },
  { code: "F34.1", title: "Distimia" },
  { code: "F38", title: "Outros transtornos do humor (afetivos)" },
  { code: "F39", title: "Transtorno do humor (afetivo) não especificado" },

  // F40–F49 Transtornos neuróticos, relacionados ao estresse e somatoformes
  { code: "F40", title: "Transtornos fóbico-ansiosos" },
  { code: "F40.0", title: "Agorafobia" },
  { code: "F40.1", title: "Fobias sociais" },
  { code: "F40.2", title: "Fobias específicas (isoladas)" },
  { code: "F41", title: "Outros transtornos ansiosos" },
  { code: "F41.0", title: "Transtorno de pânico" },
  { code: "F41.1", title: "Ansiedade generalizada" },
  { code: "F41.2", title: "Transtorno misto ansioso e depressivo" },
  { code: "F41.3", title: "Outros transtornos ansiosos mistos" },
  { code: "F42", title: "Transtorno obsessivo-compulsivo" },
  { code: "F42.0", title: "Com predominância de ideias obsessivas" },
  { code: "F42.1", title: "Com predominância de comportamentos compulsivos" },
  { code: "F42.2", title: "Forma mista, com ideias obsessivas e comportamentos compulsivos" },
  { code: "F43", title: "Reações ao estresse grave e transtornos de adaptação" },
  { code: "F43.0", title: "Reação aguda ao estresse" },
  { code: "F43.1", title: "Estado de estresse pós-traumático (TEPT)" },
  { code: "F43.2", title: "Transtornos de adaptação" },
  { code: "F44", title: "Transtornos dissociativos (conversivos)" },
  { code: "F45", title: "Transtornos somatoformes" },
  { code: "F45.0", title: "Transtorno de somatização" },
  { code: "F45.1", title: "Transtorno somatoforme indiferenciado" },
  { code: "F45.2", title: "Transtorno hipocondríaco" },
  { code: "F45.4", title: "Transtorno doloroso somatoforme persistente" },
  { code: "F48", title: "Outros transtornos neuróticos" },
  { code: "F48.0", title: "Neurastenia" },

  // F50–F59 Síndromes comportamentais associadas a perturbações fisiológicas
  { code: "F50", title: "Transtornos da alimentação" },
  { code: "F50.0", title: "Anorexia nervosa" },
  { code: "F50.1", title: "Anorexia nervosa atípica" },
  { code: "F50.2", title: "Bulimia nervosa" },
  { code: "F50.4", title: "Hiperfagia associada a outros distúrbios psicológicos" },
  { code: "F51", title: "Transtornos não-orgânicos do sono" },
  { code: "F51.0", title: "Insônia não-orgânica" },
  { code: "F51.1", title: "Hipersônia não-orgânica" },
  { code: "F51.5", title: "Pesadelos" },
  { code: "F52", title: "Disfunção sexual não causada por transtorno ou doença orgânica" },
  { code: "F52.0", title: "Ausência ou perda de desejo sexual" },
  { code: "F52.2", title: "Falha na resposta genital" },
  { code: "F53", title: "Transtornos mentais e comportamentais associados ao puerpério" },
  { code: "F54", title: "Fatores psicológicos ou comportamentais associados a doenças classificadas em outra parte" },

  // F60–F69 Transtornos de personalidade e comportamento adulto
  { code: "F60", title: "Transtornos específicos da personalidade" },
  { code: "F60.0", title: "Personalidade paranoica" },
  { code: "F60.1", title: "Personalidade esquizoide" },
  { code: "F60.2", title: "Personalidade dissocial" },
  { code: "F60.3", title: "Personalidade emocionalmente instável (borderline)" },
  { code: "F60.4", title: "Personalidade histriônica" },
  { code: "F60.5", title: "Personalidade anancástica" },
  { code: "F60.6", title: "Personalidade ansiosa (esquiva)" },
  { code: "F60.7", title: "Personalidade dependente" },
  { code: "F61", title: "Transtornos mistos da personalidade" },
  { code: "F63", title: "Transtornos dos hábitos e dos impulsos" },
  { code: "F63.0", title: "Jogo patológico" },
  { code: "F64", title: "Transtornos da identidade sexual" },
  { code: "F65", title: "Transtornos da preferência sexual" },
  { code: "F68", title: "Outros transtornos da personalidade e comportamento adulto" },

  // F70–F79 Retardo mental
  { code: "F70", title: "Retardo mental leve" },
  { code: "F71", title: "Retardo mental moderado" },
  { code: "F72", title: "Retardo mental grave" },
  { code: "F73", title: "Retardo mental profundo" },

  // F80–F89 Transtornos do desenvolvimento psicológico
  { code: "F80", title: "Transtornos específicos do desenvolvimento da fala e da linguagem" },
  { code: "F81", title: "Transtornos específicos do desenvolvimento das habilidades escolares" },
  { code: "F82", title: "Transtorno específico do desenvolvimento motor" },
  { code: "F83", title: "Transtornos específicos misto do desenvolvimento" },
  { code: "F84", title: "Transtornos globais do desenvolvimento" },
  { code: "F84.0", title: "Autismo infantil" },
  { code: "F84.1", title: "Autismo atípico" },
  { code: "F84.5", title: "Síndrome de Asperger" },

  // F90–F98 Comportamentais com início usual infância/adolescência
  { code: "F90", title: "Transtornos hipercinéticos" },
  { code: "F90.0", title: "Distúrbio da atividade e da atenção (TDAH)" },
  { code: "F91", title: "Distúrbios de conduta" },
  { code: "F92", title: "Distúrbios mistos de conduta e das emoções" },
  { code: "F93", title: "Transtornos emocionais com início específico na infância" },
  { code: "F94", title: "Transtornos do funcionamento social com início específico na infância" },
  { code: "F95", title: "Tiques" },
  { code: "F98", title: "Outros transtornos comportamentais e emocionais com início na infância/adolescência" },
  { code: "F98.0", title: "Enurese de origem não-orgânica" },
  { code: "F98.5", title: "Gagueira (tartamudez)" },

  { code: "F99", title: "Transtorno mental não especificado" },

  // G — sistema nervoso (frequentes em neurologia/psiquiatria)
  { code: "G30", title: "Doença de Alzheimer" },
  { code: "G35", title: "Esclerose múltipla" },
  { code: "G40", title: "Epilepsia" },
  { code: "G43", title: "Enxaqueca" },
  { code: "G44", title: "Outras síndromes de algias cefálicas" },
  { code: "G47", title: "Distúrbios do sono" },
  { code: "G47.0", title: "Distúrbios da iniciação e da manutenção do sono (insônia)" },
  { code: "G47.3", title: "Apneia do sono" },

  // R — sintomas e sinais
  { code: "R45.0", title: "Nervosismo" },
  { code: "R45.1", title: "Inquietação e agitação" },
  { code: "R45.2", title: "Tristeza" },
  { code: "R45.3", title: "Desmoralização e apatia" },
  { code: "R45.4", title: "Irritabilidade e cólera" },
  { code: "R45.7", title: "Estado de choque emocional e tensão, não especificado" },
  { code: "R51", title: "Cefaleia" },

  // Z — fatores influenciando saúde (importantes pra prevenção/contexto)
  { code: "Z00", title: "Exame geral e investigação de pessoas sem queixas" },
  { code: "Z03", title: "Observação e avaliação médicas por suspeita de doenças" },
  { code: "Z63", title: "Outros problemas relacionados ao grupo primário de apoio" },
  { code: "Z63.0", title: "Problemas nas relações entre cônjuges ou parceiros" },
  { code: "Z63.4", title: "Desaparecimento ou morte de membro da família" },
  { code: "Z63.5", title: "Rompimento familiar por separação ou divórcio" },
  { code: "Z65", title: "Outros problemas psicossociais" },
  { code: "Z73", title: "Problemas relacionados com a organização de seu modo de vida" },
  { code: "Z73.0", title: "Esgotamento (burnout)" },
  { code: "Z76", title: "Pessoas em contato com serviços de saúde em outras circunstâncias" }
];

// Normaliza (remove acentos) — usado pra busca case+accent-insensitive.
function norm(s) {
  return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export function searchCID10(query, limit = 30) {
  const q = norm(query).trim();
  if (!q) return CID10.slice(0, limit);
  const tokens = q.split(/\s+/).filter(Boolean);
  return CID10
    .filter(item => {
      const hay = norm(item.code + " " + item.title);
      return tokens.every(t => hay.includes(t));
    })
    .slice(0, limit);
}

// Widget reutilizável: monta input + dropdown de resultados. Chama onPick(item)
// quando o usuário seleciona. opts.placeholder, opts.maxResults.
//
// Uso:
//   const picker = mountCID10Picker(containerEl, { onPick: (item) => {...} });
//   picker.clear();    // limpa input
//   picker.focus();    // foca input
//   picker.setValue(text); // set externo
export function mountCID10Picker(container, opts = {}) {
  const onPick = typeof opts.onPick === "function" ? opts.onPick : () => {};
  const placeholder = opts.placeholder || "Buscar CID-10 (código ou descrição)…";
  const maxResults = opts.maxResults || 12;

  const wrap = document.createElement("div");
  wrap.className = "ep-cid-picker";
  wrap.innerHTML = `
    <input type="text" class="ep-input ep-cid-picker__input" placeholder="${placeholder}" autocomplete="off" spellcheck="false">
    <ul class="ep-cid-picker__list" role="listbox" aria-label="Resultados CID-10"></ul>
  `;
  container.appendChild(wrap);
  const input = wrap.querySelector(".ep-cid-picker__input");
  const list  = wrap.querySelector(".ep-cid-picker__list");
  let activeIdx = -1;
  let lastResults = [];

  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, c =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c]));
  }

  function render() {
    lastResults = searchCID10(input.value, maxResults);
    if (!lastResults.length || !input.value.trim()) {
      list.innerHTML = "";
      list.style.display = "none";
      activeIdx = -1;
      return;
    }
    list.style.display = "block";
    list.innerHTML = lastResults.map((it, i) => `
      <li data-i="${i}" role="option" class="${i === activeIdx ? "is-active" : ""}">
        <strong>${escapeHtml(it.code)}</strong>
        <span>${escapeHtml(it.title)}</span>
      </li>
    `).join("");
  }

  function pick(item) {
    if (!item) return;
    onPick(item);
    input.value = "";
    list.innerHTML = "";
    list.style.display = "none";
  }

  input.addEventListener("input", () => { activeIdx = 0; render(); });
  input.addEventListener("focus", () => { if (input.value.trim()) render(); });
  input.addEventListener("blur", () => {
    // Delay pra permitir click no item antes do blur fechar.
    setTimeout(() => { list.style.display = "none"; }, 150);
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); activeIdx = Math.min(activeIdx + 1, lastResults.length - 1); render(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); activeIdx = Math.max(activeIdx - 1, 0); render(); }
    else if (e.key === "Enter") { e.preventDefault(); if (lastResults[activeIdx]) pick(lastResults[activeIdx]); }
    else if (e.key === "Escape") { input.value = ""; render(); }
  });
  list.addEventListener("mousedown", (e) => {
    // mousedown roda antes de blur — preserva o pick.
    const li = e.target.closest("li[data-i]");
    if (!li) return;
    e.preventDefault();
    pick(lastResults[Number(li.getAttribute("data-i"))]);
  });

  return {
    clear: () => { input.value = ""; list.innerHTML = ""; list.style.display = "none"; },
    focus: () => input.focus(),
    setValue: (v) => { input.value = v; render(); }
  };
}
