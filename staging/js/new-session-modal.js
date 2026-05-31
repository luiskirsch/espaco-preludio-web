// Módulo do modal "Nova consulta" — usado por painel.html e agenda.html.
//
// Por que módulo: o modal tem ~300 linhas de lógica (form, seleção de paciente
// com decifragem local, TISS opcional, recorrência, criação no backend, geração
// de link, recarga de sessões). Duplicar isso em 2 páginas garante divergência
// e bug. Módulo único, ambas chamam.
//
// Uso:
//   import { createNewSessionModal } from "./js/new-session-modal.js?v=1";
//   const modal = createNewSessionModal({
//     getToken,           // async () => string — sempre token fresco (Firebase TTL 1h)
//     uid, dek, therapist,
//     BACKEND_BASE_URL, tr, currentLocaleSafe,
//     getAllSessions,     // () => array — usado pra calcular pacientes "avulsos"
//     buildPatientLink,   // (joinCodeOrToken) => string
//     onCreated           // async () => void — chamado após criar (re-fetch sessions)
//   });
//   modal.open({ patientId, patientName, scheduledAt }); // todos opcionais
//
// Após mount, getElementById("newSessionModal") / "linkModal" funcionam normalmente
// (o módulo injeta esses elementos no body).

import { decryptNote } from "./crypto.js";

const MODAL_HTML = `
<div class="ep-modal" id="newSessionModal" role="dialog" aria-modal="true">
  <div class="ep-modal__panel">
    <h3 class="ep-modal__title" data-i18n="painel:modalNew.title">Nova consulta</h3>
    <p class="ep-modal__sub" data-i18n="painel:modalNew.sub">
      Defina o nome do paciente (apelido se preferir) e gere um link único.
      O link expira em 2 horas — perfeito para enviar pouco antes da sessão.
    </p>

    <form id="newSessionForm" class="ep-stack">
      <div class="ep-field">
        <label class="ep-label" for="patientSelect" data-i18n="painel:modalNew.patient">Paciente</label>
        <select id="patientSelect" class="ep-select">
          <option value="" data-i18n="painel:modalNew.patientPlaceholder">— Selecione ou digite o nome —</option>
        </select>
        <span class="ep-text-xs ep-text-muted">
          <a href="./pacientes.html" target="_blank" rel="noopener" data-i18n="painel:modalNew.managePatients">Gerenciar pacientes →</a>
        </span>
      </div>
      <div class="ep-field" id="freeNameField">
        <label class="ep-label" for="patientName" data-i18n="painel:modalNew.patientName">Nome do paciente</label>
        <input id="patientName" class="ep-input" type="text" maxlength="80" placeholder="Ex.: João S." data-i18n-placeholder="painel:modalNew.patientNamePlaceholder">
      </div>
      <div class="ep-field">
        <label class="ep-label" for="patientEmail" data-i18n="painel:modalNew.patientEmail">E-mail do paciente *</label>
        <input id="patientEmail" class="ep-input" type="email" maxlength="120" placeholder="paciente@exemplo.com" required data-i18n-placeholder="painel:modalNew.patientEmailPlaceholder">
        <span class="ep-text-xs ep-text-muted" data-i18n="painel:modalNew.patientEmailHint">Obrigatório — usado pra confirmação, lembrete 24h antes e pra vincular a conta do paciente (chat E2EE).</span>
      </div>
      <div class="ep-field">
        <label class="ep-label" for="patientPhone" data-i18n="painel:modalNew.patientPhone">WhatsApp do paciente (opcional)</label>
        <input id="patientPhone" class="ep-input" type="tel" maxlength="30" placeholder="(48) 99999-9999" data-i18n-placeholder="painel:modalNew.patientPhonePlaceholder">
        <span class="ep-text-xs ep-text-muted" data-i18n="painel:modalNew.patientPhoneHint">Recebe confirmação e lembrete via WhatsApp. Ative no Perfil → WhatsApp.</span>
      </div>
      <div class="ep-field">
        <label class="ep-label" for="scheduledAt" data-i18n="painel:modalNew.scheduledAt">Horário *</label>
        <input id="scheduledAt" class="ep-input" type="datetime-local" required>
        <span class="ep-text-xs ep-text-muted" data-i18n="painel:modalNew.scheduledAtHint">Obrigatório — a consulta precisa aparecer na agenda. Você pode entrar antes do horário marcado.</span>
      </div>
      <div class="ep-field">
        <label class="ep-label" for="recurrenceWeeks" data-i18n="painel:modalNew.recurrence">Repetir semanalmente</label>
        <select id="recurrenceWeeks" class="ep-select">
          <option value="1" data-i18n="painel:modalNew.rep1">Não repetir</option>
          <option value="4" data-i18n="painel:modalNew.rep4">Por 4 semanas</option>
          <option value="8" data-i18n="painel:modalNew.rep8">Por 8 semanas</option>
          <option value="12" data-i18n="painel:modalNew.rep12">Por 12 semanas</option>
          <option value="24" data-i18n="painel:modalNew.rep24">Por 24 semanas</option>
          <option value="52" data-i18n="painel:modalNew.rep52">Por 52 semanas (1 ano)</option>
        </select>
        <span class="ep-text-xs ep-text-muted" data-i18n="painel:modalNew.recurrenceHint">Cria N consultas no mesmo horário, espaçadas 7 dias. Exige horário definido.</span>
      </div>

      <div class="ep-field ep-hide" data-tiss-only id="tissNewSessionBlock">
        <details>
          <summary style="cursor: pointer; color: var(--ep-accent); font-weight: 500;" data-i18n="painel:modalNew.tissSummary">+ Faturar via convênio (TISS)</summary>
          <div class="ep-stack ep-mt-12" style="gap: 10px;">
            <div class="ep-field">
              <label class="ep-label ep-text-sm" for="tissNewConvSelect" data-i18n="painel:modalNew.tissConvenio">Convênio do paciente</label>
              <select id="tissNewConvSelect" class="ep-select">
                <option value="" data-i18n="painel:modalNew.tissConvenioPlaceholder">— Selecione (paciente precisa ter carteirinha cadastrada) —</option>
              </select>
            </div>
            <div class="ep-grid-2col">
              <div class="ep-field">
                <label class="ep-label ep-text-sm" for="tissNewTussCode" data-i18n="painel:modalNew.tissTuss">Código TUSS</label>
                <input id="tissNewTussCode" class="ep-input" type="text" maxlength="20" placeholder="ex: 50000489" data-i18n-placeholder="painel:modalNew.tissTussPlaceholder">
              </div>
              <div class="ep-field">
                <label class="ep-label ep-text-sm" for="tissNewValor" data-i18n="painel:modalNew.tissValor">Valor (R$)</label>
                <input id="tissNewValor" class="ep-input" type="number" step="0.01" min="0" placeholder="ex: 150.00" data-i18n-placeholder="painel:modalNew.tissValorPlaceholder">
              </div>
            </div>
            <div class="ep-field">
              <label class="ep-label ep-text-sm" for="tissNewTussLabel" data-i18n="painel:modalNew.tissTussLabel">Descrição do procedimento</label>
              <input id="tissNewTussLabel" class="ep-input" type="text" maxlength="200" placeholder="ex: Psicoterapia individual (45-60 min)" data-i18n-placeholder="painel:modalNew.tissTussLabelPlaceholder">
            </div>
            <p class="ep-text-xs ep-text-muted ep-mt-0" data-i18n-html="painel:modalNew.tissHint">
              A guia TISS é criada após salvar a consulta. Status inicial: <strong>rascunho</strong>.
              Acompanhe em <a href="./tiss.html" target="_blank">TISS → Guias</a>.
            </p>
          </div>
        </details>
      </div>

      <div class="ep-status" id="newSessionStatus"></div>
    </form>

    <div class="ep-modal__actions">
      <button type="button" class="ep-btn ep-btn--ghost" id="cancelNewSession" data-i18n="painel:modalNew.cancel">Cancelar</button>
      <button type="button" class="ep-btn ep-btn--primary" id="createNewSession" data-i18n="painel:modalNew.create">Criar consulta</button>
    </div>
  </div>
</div>

<div class="ep-modal" id="linkModal" role="dialog" aria-modal="true">
  <div class="ep-modal__panel ep-modal__panel--gilded">
    <h3 class="ep-modal__title" data-i18n="painel:modalLink.title">Link da consulta gerado</h3>
    <p class="ep-modal__sub" data-i18n="painel:modalLink.sub">
      Envie este link diretamente ao paciente. Ele expira em 2 horas e só pode ser usado uma vez.
    </p>
    <p class="ep-text-xs ep-text-muted ep-mt-0" id="linkSubtitle"></p>

    <div class="ep-link-box" id="linkValue"></div>

    <div class="ep-modal__actions">
      <button type="button" class="ep-btn ep-btn--ghost" id="copyLinkBtn" data-i18n="painel:modalLink.copyLink">Copiar link</button>
      <button type="button" class="ep-btn ep-btn--primary" id="closeLinkModal" data-i18n="painel:modalLink.ready">Pronto</button>
    </div>
  </div>
</div>
`;

export function createNewSessionModal({
  getToken,
  uid,
  dek,
  therapist,
  BACKEND_BASE_URL,
  tr,
  currentLocaleSafe,
  getAllSessions,
  buildPatientLink,
  onCreated
}) {
  // Mount idempotente — se já existe na página (ex: painel.html legado tinha
  // inline, agora não tem mais), não duplica.
  if (!document.getElementById("newSessionModal")) {
    document.body.insertAdjacentHTML("beforeend", MODAL_HTML);
    // Aplica i18n nos elementos recém-inseridos
    if (window.EP_I18N && window.EP_I18N.apply) {
      window.EP_I18N.apply(document.getElementById("newSessionModal"));
      window.EP_I18N.apply(document.getElementById("linkModal"));
    }
  }

  const newSessionModal = document.getElementById("newSessionModal");
  const linkModal       = document.getElementById("linkModal");
  const patientSelect   = document.getElementById("patientSelect");
  const freeNameField   = document.getElementById("freeNameField");

  // TISS é opt-in por profissional — esconde bloco se não habilitado.
  if (!therapist?.tissEnabled) {
    document.querySelectorAll("[data-tiss-only]").forEach(el => el.classList.add("ep-hide"));
  }

  let patientsCache = [];
  let avulsoCache   = [];

  async function loadPatientsForSelect() {
    try {
      const token = await getToken();
      const res = await fetch(`${BACKEND_BASE_URL}/therapy/pacientes`, {
        headers: { "Authorization": `Bearer ${token}` }
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        patientsCache = await Promise.all((data.patients || []).map(async p => {
          try {
            const json = await decryptNote({ ciphertext: p.ciphertext, iv: p.iv }, dek);
            const obj = JSON.parse(json);
            return { patientId: p.patientId, name: obj.name || "—" };
          } catch {
            return { patientId: p.patientId, name: "[corrompido]" };
          }
        }));
      }
    } catch (err) {
      console.warn("load_patients_for_select_error", err);
    }

    const allSessions = getAllSessions ? (getAllSessions() || []) : [];
    const seen = new Set();
    avulsoCache = [];
    const cadastradosLower = new Set(patientsCache.map(p => p.name.toLowerCase()));
    for (const s of allSessions) {
      if (s.patientId) continue;
      const name = (s.patientName || "").trim();
      if (!name || name.toLowerCase() === "paciente") continue;
      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      if (cadastradosLower.has(key)) continue;
      seen.add(key);
      avulsoCache.push({ name, lastSession: s.createdAt || 0 });
    }
    avulsoCache.sort((a, b) => (b.lastSession || 0) - (a.lastSession || 0));

    patientSelect.innerHTML = "";
    const optDefault = document.createElement("option");
    optDefault.value = "";
    optDefault.textContent = tr("painel:modalNew.patientPlaceholder", "— Selecione ou digite o nome —");
    patientSelect.appendChild(optDefault);

    const optNew = document.createElement("option");
    optNew.value = "__new__";
    optNew.textContent = tr("painel:modalNew.newPatient", "+ Cadastrar novo paciente");
    patientSelect.appendChild(optNew);

    if (patientsCache.length) {
      const grp = document.createElement("optgroup");
      grp.label = tr("painel:modalNew.groupRegistered", "Pacientes cadastrados");
      [...patientsCache]
        .sort((a, b) => a.name.localeCompare(b.name, currentLocaleSafe()))
        .forEach(p => {
          const opt = document.createElement("option");
          opt.value = "id:" + p.patientId;
          opt.textContent = p.name;
          grp.appendChild(opt);
        });
      patientSelect.appendChild(grp);
    }

    if (avulsoCache.length) {
      const grp = document.createElement("optgroup");
      grp.label = tr("painel:modalNew.groupAvulso", "Atendidos antes (sem cadastro)");
      avulsoCache.forEach(a => {
        const opt = document.createElement("option");
        opt.value = "name:" + a.name;
        opt.textContent = a.name;
        grp.appendChild(opt);
      });
      patientSelect.appendChild(grp);
    }
  }

  patientSelect.addEventListener("change", () => {
    const v = patientSelect.value;
    if (v === "__new__") {
      patientSelect.value = "";
      window.location.href = "./pacientes.html";
      return;
    }
    if (v.startsWith("id:")) {
      const patientId = v.slice(3);
      const p = patientsCache.find(x => x.patientId === patientId);
      document.getElementById("patientName").value = p?.name || "";
      freeNameField.classList.add("ep-hide");
    } else if (v.startsWith("name:")) {
      const name = v.slice(5);
      document.getElementById("patientName").value = name;
      freeNameField.classList.add("ep-hide");
    } else {
      freeNameField.classList.remove("ep-hide");
      document.getElementById("patientName").value = "";
    }
  });

  function openModal(prefill = {}) {
    if (prefill.patientId) {
      patientSelect.value = "id:" + prefill.patientId;
    } else if (prefill.patientName) {
      const found = avulsoCache.find(a => a.name.toLowerCase() === prefill.patientName.toLowerCase());
      patientSelect.value = found ? "name:" + found.name : "";
    } else {
      patientSelect.value = "";
    }
    document.getElementById("patientName").value = prefill.patientName || "";
    document.getElementById("scheduledAt").value = prefill.scheduledAt || "";
    document.getElementById("newSessionStatus").textContent = "";
    if (prefill.patientId || (prefill.patientName && patientSelect.value)) {
      freeNameField.classList.add("ep-hide");
    } else {
      freeNameField.classList.remove("ep-hide");
    }
    newSessionModal.classList.add("is-open");
    refreshTissNewSessionConvenios();
    setTimeout(() => {
      (prefill.patientId ? patientSelect : document.getElementById("patientName")).focus();
    }, 50);
  }
  function closeModal(el) { el.classList.remove("is-open"); }

  // TISS: popula select de convênio com base no paciente escolhido. Best-effort.
  let _tissAceitos = null;
  async function _loadTissAceitos() {
    if (_tissAceitos !== null) return _tissAceitos;
    try {
      const token = await getToken();
      const r = await fetch(`${BACKEND_BASE_URL}/therapy/profissional/tiss/convenios`, {
        headers: { "Authorization": `Bearer ${token}` }
      });
      const d = await r.json().catch(() => ({}));
      _tissAceitos = (d.ok && Array.isArray(d.convenios)) ? d.convenios : [];
    } catch { _tissAceitos = []; }
    return _tissAceitos;
  }
  async function refreshTissNewSessionConvenios() {
    const sel = document.getElementById("tissNewConvSelect");
    const block = document.getElementById("tissNewSessionBlock");
    if (!sel || !block) return;
    sel.innerHTML = `<option value="">${tr("painel:modalNew.tissConvenioPlaceholderShort", "— Selecione (paciente precisa ter carteirinha) —")}</option>`;
    const v = patientSelect.value;
    if (!v.startsWith("id:")) {
      block.classList.add("ep-hide");
      return;
    }
    const patientId = v.slice(3);
    try {
      const token = await getToken();
      const r = await fetch(`${BACKEND_BASE_URL}/therapy/pacientes/${encodeURIComponent(patientId)}`, {
        headers: { "Authorization": `Bearer ${token}` }
      });
      const d = await r.json().catch(() => ({}));
      const carts = (d?.patient?.convenios) || [];
      if (carts.length === 0) {
        block.classList.add("ep-hide");
        return;
      }
      const aceitos = await _loadTissAceitos();
      const nomeOf = (code) => aceitos.find(c => c.code === code)?.nome || code;
      sel.innerHTML = `<option value="">${tr("painel:modalNew.tissParticular", "— Particular (sem convênio) —")}</option>` +
        carts.map(c => `<option value="${c.convenioCode}">${nomeOf(c.convenioCode)} (${c.numeroCarteirinha})</option>`).join("");
      block.classList.remove("ep-hide");
    } catch {
      block.classList.add("ep-hide");
    }
  }
  patientSelect.addEventListener("change", refreshTissNewSessionConvenios);

  document.getElementById("cancelNewSession").addEventListener("click", () => closeModal(newSessionModal));

  document.getElementById("createNewSession").addEventListener("click", async () => {
    const v = patientSelect.value;
    let patientName = "";
    let patientId = "";
    if (v.startsWith("id:")) {
      patientId = v.slice(3);
      const p = patientsCache.find(x => x.patientId === patientId);
      patientName = p?.name || "";
    } else if (v.startsWith("name:")) {
      patientName = v.slice(5);
    } else {
      patientName = document.getElementById("patientName").value.trim();
    }
    const scheduledAtRaw  = document.getElementById("scheduledAt").value;
    const recurrenceWeeks = Number(document.getElementById("recurrenceWeeks").value || 1);
    const patientEmailRaw = document.getElementById("patientEmail").value.trim().toLowerCase();
    const patientPhoneRaw = document.getElementById("patientPhone").value.trim();
    const statusEl = document.getElementById("newSessionStatus");
    if (!patientName) {
      statusEl.textContent = tr("painel:modalNew.errPickPatient", "Selecione um paciente ou informe um nome.");
      statusEl.className = "ep-status is-err";
      return;
    }
    if (!scheduledAtRaw) {
      statusEl.textContent = tr("painel:modalNew.errMissingTime", "Defina o horário da consulta — sem isso ela não aparece na agenda.");
      statusEl.className = "ep-status is-err";
      document.getElementById("scheduledAt").focus();
      return;
    }
    if (!patientEmailRaw || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(patientEmailRaw)) {
      statusEl.textContent = tr("painel:modalNew.errMissingEmail", "Informe o e-mail do paciente — necessário pra confirmação, lembrete e vincular conta (chat).");
      statusEl.className = "ep-status is-err";
      document.getElementById("patientEmail").focus();
      return;
    }
    statusEl.textContent = tr("painel:modalNew.creating", "Criando…");
    statusEl.className = "ep-status";

    let scheduledAt = null;
    if (scheduledAtRaw) {
      const parsed = new Date(scheduledAtRaw).getTime();
      if (Number.isFinite(parsed)) {
        scheduledAt = parsed;
      } else {
        statusEl.textContent = tr("painel:modalNew.errInvalidDate", "Data/hora inválida.");
        statusEl.className = "ep-status is-err";
        return;
      }
    }
    const body = {
      patientName,
      patientId: patientId || undefined,
      patientEmail: patientEmailRaw || undefined,
      patientPhone: patientPhoneRaw || undefined,
      scheduledAt
    };
    if (recurrenceWeeks > 1) body.recurrence = { weekly: recurrenceWeeks };

    try {
      const token = await getToken();
      const res = await fetch(`${BACKEND_BASE_URL}/therapy/sessao/criar`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify(body)
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 402) {
        if (confirm(tr("painel:modalNew.trialExpired", "Sua trial expirou. Você precisa contratar um plano para criar consultas. Ir para o perfil agora?"))) {
          window.location.href = "./perfil.html";
        }
        return;
      }
      if (!res.ok || !data.ok) {
        statusEl.textContent = tr("painel:modalNew.errPrefix", "Erro: ") + (data?.error || res.status);
        statusEl.className = "ep-status is-err";
        return;
      }

      // TISS opcional: best-effort, se falhar usuário marca depois em /tiss.html.
      const tissConvCode = document.getElementById("tissNewConvSelect")?.value;
      if (tissConvCode && data.session?.sessionId) {
        const tussCode  = document.getElementById("tissNewTussCode").value.trim();
        const tussLabel = document.getElementById("tissNewTussLabel").value.trim();
        const valor     = Number(document.getElementById("tissNewValor").value) || 0;
        if (tussCode) {
          try {
            const tToken = await getToken();
            await fetch(`${BACKEND_BASE_URL}/therapy/sessao/${encodeURIComponent(data.session.sessionId)}/tiss/marcar`, {
              method: "POST",
              headers: { "Content-Type": "application/json", "Authorization": `Bearer ${tToken}` },
              body: JSON.stringify({
                convenioCode: tissConvCode,
                tussCode,
                tussLabel,
                valorProcedimento: valor
              })
            });
          } catch (e) { /* best-effort */ }
        }
      }

      closeModal(newSessionModal);

      // Waitlist → remove entrada se veio dela.
      const waitlistId = sessionStorage.getItem("ep:waitlist-after-create");
      if (waitlistId) {
        sessionStorage.removeItem("ep:waitlist-after-create");
        const wToken = await getToken();
        fetch(`${BACKEND_BASE_URL}/therapy/waitlist/${encodeURIComponent(waitlistId)}`, {
          method: "DELETE",
          headers: { "Authorization": `Bearer ${wToken}` }
        }).catch(() => { /* best-effort */ });
      }

      const link = buildPatientLink(data.session.joinCode || data.session.joinToken);
      document.getElementById("linkValue").textContent = link;
      const linkSubEl = document.getElementById("linkSubtitle");
      if (linkSubEl) {
        linkSubEl.textContent = data.recurrence
          ? tr("painel:modalLink.seriesSub", "Série de {{n}} consultas criada. Este é o link da 1ª — pegue os links das demais na agenda, no dia.", { n: data.recurrence.count })
          : "";
      }
      linkModal.classList.add("is-open");

      if (onCreated) await onCreated();
    } catch (error) {
      statusEl.textContent = tr("painel:modalNew.netErr", "Erro de rede.");
      statusEl.className = "ep-status is-err";
    }
  });

  document.getElementById("closeLinkModal").addEventListener("click", () => closeModal(linkModal));
  document.getElementById("copyLinkBtn").addEventListener("click", async () => {
    const text = document.getElementById("linkValue").textContent;
    try {
      await navigator.clipboard.writeText(text);
      const btn = document.getElementById("copyLinkBtn");
      const orig = btn.textContent;
      btn.textContent = tr("painel:modalLink.copied", "Copiado!");
      setTimeout(() => { btn.textContent = orig; }, 1200);
    } catch { /* noop */ }
  });

  // Esc fecha ambos os modais.
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      newSessionModal.classList.remove("is-open");
      linkModal.classList.remove("is-open");
    }
  });

  // Boot inicial: carrega pacientes em background (não bloqueia open()).
  loadPatientsForSelect();

  return {
    open: openModal,
    close: () => closeModal(newSessionModal),
    reloadPatients: loadPatientsForSelect
  };
}
