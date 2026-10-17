// Quem volta do link do e-mail (conta-acao.html → ?passo=2) já trocou a senha:
// leva direto ao passo da chave-semente, que reconecta as anotações cifradas.
// `announce` é o setStatus da própria página (cada tela tem seu estilo).
export function focusRecoveryStepFromEmail(announce) {
  if (new URLSearchParams(location.search).get("passo") !== "2") return;
  const form = document.getElementById("formRecover");
  if (!form) return;
  announce();
  form.scrollIntoView({ block: "start" });
  document.getElementById("emailRecover")?.focus({ preventScroll: true });
}
