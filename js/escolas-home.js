(function () {
  "use strict";

  var menuButton = document.querySelector(".menu-toggle");
  var navigation = document.getElementById("main-navigation");
  var accessMenu = document.querySelector(".access-menu");

  document.querySelectorAll('a.brand[href="#inicio"]').forEach(function (brandLink) {
    brandLink.addEventListener("click", function (event) {
      event.preventDefault();
      window.scrollTo({
        top: 0,
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth"
      });
    });
  });

  function setMenu(open) {
    if (!menuButton || !navigation) return;
    menuButton.setAttribute("aria-expanded", String(open));
    navigation.classList.toggle("is-open", open);
    document.body.classList.toggle("menu-open", open);
    if (!open && accessMenu) accessMenu.open = false;
    var label = menuButton.querySelector(".sr-only");
    if (label) label.textContent = open ? "Fechar menu" : "Abrir menu";
  }

  if (menuButton && navigation) {
    menuButton.addEventListener("click", function () {
      setMenu(menuButton.getAttribute("aria-expanded") !== "true");
    });

    navigation.addEventListener("click", function (event) {
      if (event.target.closest("a")) setMenu(false);
    });

    document.addEventListener("keydown", function (event) {
      if (event.key !== "Escape") return;
      if (accessMenu && accessMenu.open) {
        accessMenu.open = false;
        accessMenu.querySelector("summary").focus();
      } else if (menuButton.getAttribute("aria-expanded") === "true") {
        setMenu(false);
        menuButton.focus();
      }
    });

    window.addEventListener("resize", function () {
      if (window.innerWidth > 960) setMenu(false);
    });
  }

  if (accessMenu) {
    document.addEventListener("click", function (event) {
      if (!accessMenu.contains(event.target)) accessMenu.open = false;
    });
  }

  var currentYear = document.getElementById("currentYear");
  if (currentYear) currentYear.textContent = String(new Date().getFullYear());

  var form = document.getElementById("institutionLeadForm");
  var status = document.getElementById("leadFormStatus");
  if (!form || !status) return;

  var isStaging = /(^|\.)staging\./i.test(location.hostname) || /\/staging\//i.test(location.pathname);
  var apiBase = isStaging
    ? "https://osl-video-server-staging.up.railway.app"
    : "https://osl-video-server-production.up.railway.app";

  function setStatus(message, kind) {
    status.textContent = message;
    status.classList.toggle("is-error", kind === "error");
    status.classList.toggle("is-success", kind === "success");
  }

  function clean(value) {
    return String(value || "").trim();
  }

  function markValidity() {
    var firstInvalid = null;
    form.querySelectorAll("input, select, textarea").forEach(function (field) {
      if (field.name === "website") return;
      var invalid = !field.checkValidity();
      field.setAttribute("aria-invalid", String(invalid));
      if (invalid && !firstInvalid) firstInvalid = field;
    });
    return firstInvalid;
  }

  form.addEventListener("input", function (event) {
    if (event.target.matches("input, select, textarea")) {
      event.target.removeAttribute("aria-invalid");
    }
  });

  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    setStatus("", "");

    var invalidField = markValidity();
    if (invalidField) {
      setStatus("Revise os campos destacados para continuar.", "error");
      invalidField.focus();
      return;
    }

    var data = new FormData(form);
    if (clean(data.get("website"))) {
      form.reset();
      setStatus("Recebemos sua solicitação. Em breve entraremos em contato.", "success");
      return;
    }

    var studentsRaw = clean(data.get("students"));
    var payload = {
      name: clean(data.get("name")),
      role: clean(data.get("role")),
      institution: clean(data.get("institution")),
      institutionType: clean(data.get("institutionType")),
      students: studentsRaw ? Number(studentsRaw) : null,
      email: clean(data.get("email")).toLowerCase(),
      phone: clean(data.get("phone")),
      city: clean(data.get("city")),
      state: clean(data.get("state")).toUpperCase(),
      message: clean(data.get("message")),
      privacyConsent: data.get("privacyConsent") === "on",
      source: "site-institucional-escolas"
    };

    var submitButton = form.querySelector("button[type='submit']");
    var originalLabel = submitButton.innerHTML;
    submitButton.disabled = true;
    submitButton.textContent = "Enviando…";
    setStatus("Enviando sua solicitação com segurança…", "");

    var timeoutId;
    try {
      var controller = new AbortController();
      timeoutId = setTimeout(function () { controller.abort(); }, 12000);
      var response = await fetch(apiBase + "/public/leads/instituicao", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      var body = await response.json().catch(function () { return {}; });
      if (!response.ok || !body.ok) {
        var messages = {
          RATE_LIMIT_EXCEDIDO: "Recebemos muitas solicitações deste endereço. Aguarde um pouco e tente novamente.",
          EMAIL_INVALIDO: "Confira o e-mail institucional informado.",
          TELEFONE_OBRIGATORIO: "Informe um telefone para contato.",
          UF_INVALIDA: "Informe a UF com duas letras.",
          CONSENTIMENTO_OBRIGATORIO: "Confirme a autorização de contato para continuar."
        };
        throw new Error(body.hint || messages[body.error] || "Não foi possível enviar agora.");
      }

      form.reset();
      form.querySelectorAll("[aria-invalid]").forEach(function (field) {
        field.removeAttribute("aria-invalid");
      });
      setStatus("Solicitação recebida. Nossa equipe entrará em contato para entender a instituição.", "success");
    } catch (error) {
      if (timeoutId) clearTimeout(timeoutId);
      var errorMessage = error && error.name === "AbortError"
        ? "O envio demorou mais que o esperado."
        : (error && error.message ? error.message : "Não foi possível enviar agora.");
      setStatus(errorMessage + " Se preferir, escreva para contato@espacopreludio.com.br.", "error");
    } finally {
      submitButton.disabled = false;
      submitButton.innerHTML = originalLabel;
    }
  });
})();
