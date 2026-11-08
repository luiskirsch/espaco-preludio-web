// Prepare actual consultation/SP-SADT guides from a professional's own sessions.
export function mountTissGuideEditor({ api, onSaved }) {
  const dialog = document.createElement("dialog");
  dialog.className = "ep-admin-card";
  dialog.style.cssText = "width:min(720px,92vw);max-height:88vh;overflow:auto;border:1px solid #ddd;border-radius:16px;padding:24px";
  const field = (name, label, type = "text", attrs = "") => `<label class="ep-field"><span class="ep-label">${label}</span><input class="ep-input" name="${name}" type="${type}" ${attrs}></label>`;
  dialog.innerHTML = `<form class="ep-stack" style="gap:12px"><h2 class="ep-h3">Preparar guia TISS</h2>
    <label class="ep-field"><span class="ep-label">Sessão realizada</span><select class="ep-select" name="session" required></select></label>
    <label class="ep-field"><span class="ep-label">Convênio credenciado</span><select class="ep-select" name="convenio" required></select></label>
    <label class="ep-field"><span class="ep-label">Tipo de guia</span><select class="ep-select" name="tipoGuia"><option value="sadt">SP/SADT — terapia</option><option value="consulta">Consulta</option></select></label>
    ${field("numeroCarteira", "Carteirinha do beneficiário", "text", 'required maxlength="20"')}
    ${field("tussCode", "Código TUSS do procedimento", "text", 'required maxlength="10"')}
    ${field("tussLabel", "Descrição do procedimento", "text", 'required maxlength="150"')}
    ${field("valorProcedimento", "Valor contratado com a operadora (R$)", "number", 'required min="0" step="0.01"')}
    ${field("dataAutorizacao", "Data da autorização (se houver)", "date")}
    ${field("senha", "Senha de autorização da operadora (se houver)", "text", 'maxlength="20" autocomplete="off"')}
    <fieldset class="ep-stack" style="gap:8px" data-requester><legend>Profissional solicitante — conforme encaminhamento</legend>
      ${field("nome", "Nome completo", "text", 'maxlength="70"')}
      ${field("conselho", "Conselho (ex.: CRM)", "text", 'maxlength="10"')}
      ${field("numero", "Número no conselho", "text", 'maxlength="15"')}
      ${field("uf", "UF de inscrição", "text", 'maxlength="2"')}
      ${field("cbos", "CBO do solicitante", "text", 'maxlength="6"')}
      ${field("codigoPrestador", "Código do solicitante na operadora", "text", 'maxlength="14"')}
      ${field("nomeContratado", "Nome do prestador solicitante", "text", 'maxlength="70"')}
    </fieldset>
    <p class="ep-text-sm ep-text-muted">Informe os dados do atendimento e da autorização. O cadastro do convênio em Perfil deve conter registro ANS, CNES, UF e CBO.</p>
    <p role="status" data-status></p><div class="ep-flex ep-gap-8"><button class="ep-btn ep-btn--primary" type="submit">Salvar guia</button><button class="ep-btn ep-btn--ghost" type="button" data-close>Cancelar</button></div></form>`;
  document.body.append(dialog);
  const form = dialog.querySelector("form");
  const status = dialog.querySelector("[data-status]");
  const requester = dialog.querySelector("[data-requester]");
  const setType = () => {
    requester.hidden = form.elements.tipoGuia.value !== "sadt";
    requester.style.display = requester.hidden ? "none" : "flex";
    requester.querySelectorAll("input").forEach(input => { input.required = !requester.hidden; });
  };
  form.elements.tipoGuia.addEventListener("change", setType);
  dialog.querySelector("[data-close]").addEventListener("click", () => dialog.close());
  document.getElementById("btnPrepararGuia").addEventListener("click", async () => {
    status.textContent = "Carregando sessões…"; dialog.showModal();
    try {
      const [sessions, plans] = await Promise.all([api("/therapy/sessoes?includeHidden=true"), api("/therapy/profissional/tiss/convenios")]);
      form.elements.session.replaceChildren(...(sessions.sessions || []).filter(s => s.status === "completed").map(s =>
        new Option(`${s.patientName || "Paciente"} — ${new Date(s.scheduledAt).toLocaleDateString("pt-BR")}`, s.sessionId)));
      form.elements.convenio.replaceChildren(...(plans.convenios || []).filter(c => c.enabled !== false).map(c => new Option(c.nome, c.code)));
      status.textContent = form.elements.session.options.length ? "" : "Nenhuma sessão realizada disponível para preparar guia.";
      setType();
    } catch (error) { status.textContent = error.message; }
  });
  form.addEventListener("submit", async event => {
    event.preventDefault();
    const fields = new FormData(form), button = form.querySelector('[type="submit"]');
    if (!fields.get("session")) return;
    button.disabled = true; status.textContent = "Salvando guia…";
    const payload = Object.fromEntries(["tipoGuia", "numeroCarteira", "tussCode", "tussLabel", "dataAutorizacao", "senha"].map(key => [key, fields.get(key)]));
    payload.convenioCode = fields.get("convenio");
    payload.valorProcedimento = Number(fields.get("valorProcedimento"));
    if (payload.tipoGuia === "sadt") payload.solicitante = Object.fromEntries(["nome", "conselho", "numero", "uf", "cbos", "codigoPrestador", "nomeContratado"].map(key => [key, fields.get(key)]));
    try {
      await api(`/therapy/sessao/${encodeURIComponent(fields.get("session"))}/tiss/marcar`, { method: "POST", body: JSON.stringify(payload) });
      dialog.close(); form.reset(); await onSaved();
    } catch (error) { status.textContent = error.message; }
    finally { button.disabled = false; }
  });
}
