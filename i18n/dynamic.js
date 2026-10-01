// Espaço Prelúdio — tradução de textos gerados por JavaScript.
//
// As telas montam boa parte da interface em JS (listas, cartões, mensagens de
// erro, alert/confirm) com textos em português no código. Em vez de reescrever
// cada string, este módulo traduz o texto no momento em que ele aparece no DOM,
// a partir de um dicionário pt → idioma (i18n/locales/{lng}/js.json):
//   - entradas exatas: "Salvar" → "Save"
//   - padrões com valores dinâmicos: "{0} participantes" → "{0} participants"
// A lógica das telas continua comparando e enviando os valores em português.
// Só é carregado quando o idioma ativo não é pt-BR.

(function () {
  'use strict';
  if (window.EP_I18N_DYNAMIC) return;
  window.EP_I18N_DYNAMIC = true;

  const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'CODE', 'PRE', 'svg', 'SVG']);
  const ATTRS = ['placeholder', 'title', 'aria-label', 'alt'];
  const norm = s => s.replace(/\s+/g, ' ').trim();
  const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  let exact = new Map();
  let patterns = [];

  function load(dict) {
    exact = new Map();
    patterns = [];
    for (const [pt, tr] of Object.entries(dict)) {
      if (typeof tr !== 'string' || !tr) continue;
      if (/\{\d+\}/.test(pt)) {
        const order = [];
        const src = pt.split(/(\{\d+\})/).map(part => {
          const m = part.match(/^\{(\d+)\}$/);
          if (m) { order.push(m[1]); return '([\\s\\S]+?)'; }
          return escapeRe(part);
        }).join('');
        patterns.push({ re: new RegExp('^' + src + '$'), order, tr, weight: pt.replace(/\{\d+\}/g, '').length });
      } else {
        exact.set(pt, tr);
      }
    }
    // Padrões mais específicos (mais texto fixo) primeiro.
    patterns.sort((a, b) => b.weight - a.weight);
  }

  function translate(text) {
    const key = norm(text);
    if (key.length < 2 || !/[A-Za-zÀ-ÿ]/.test(key)) return null;
    const hit = exact.get(key);
    if (hit !== undefined) return hit;
    for (const p of patterns) {
      const m = key.match(p.re);
      if (!m) continue;
      const values = {};
      p.order.forEach((n, i) => { values[n] = m[i + 1]; });
      // Valores dinâmicos que também são textos conhecidos são traduzidos (ex.: status).
      return p.tr.replace(/\{(\d+)\}/g, (_, n) => {
        const v = values[n] ?? '';
        const inner = exact.get(norm(v));
        return inner !== undefined ? inner : v;
      });
    }
    return null;
  }

  function keepSpacing(original, translated) {
    const lead = original.match(/^\s*/)[0];
    const trail = original.match(/\s*$/)[0];
    return lead + translated + trail;
  }

  const done = new WeakMap(); // nó de texto → último valor aplicado

  function skipped(el) {
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      if (SKIP_TAGS.has(n.tagName) || n.isContentEditable || n.hasAttribute('data-no-i18n') || n.id === 'ep-lang-switcher') return true;
    }
    return false;
  }

  function textNode(node) {
    const v = node.nodeValue;
    if (!v || done.get(node) === v) return;
    const parent = node.parentElement;
    if (!parent || skipped(parent)) return;
    const tr = translate(v);
    if (tr != null) {
      const next = keepSpacing(v, tr);
      done.set(node, next);
      if (next !== v) node.nodeValue = next;
    } else {
      done.set(node, v);
    }
  }

  function attrs(el) {
    for (const a of ATTRS) {
      const v = el.getAttribute(a);
      if (!v) continue;
      const tr = translate(v);
      if (tr != null && tr !== v) el.setAttribute(a, tr);
    }
    if (el.tagName === 'INPUT' && /^(button|submit)$/i.test(el.type) && el.value) {
      const tr = translate(el.value);
      if (tr != null && tr !== el.value) el.value = tr;
    }
  }

  function walk(root) {
    if (!root) return;
    if (root.nodeType === 3) { textNode(root); return; }
    if (root.nodeType !== 1 && root.nodeType !== 9 && root.nodeType !== 11) return;
    if (root.nodeType === 1) {
      if (skipped(root)) return;
      attrs(root);
    }
    const tw = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode(n) {
        if (n.nodeType === 1 && (SKIP_TAGS.has(n.tagName) || n.hasAttribute('data-no-i18n') || n.isContentEditable)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    let n;
    while ((n = tw.nextNode())) {
      if (n.nodeType === 3) textNode(n);
      else attrs(n);
    }
  }

  function observe() {
    const mo = new MutationObserver(records => {
      for (const r of records) {
        if (r.type === 'characterData') textNode(r.target);
        else if (r.type === 'attributes') { if (r.target.nodeType === 1 && !skipped(r.target)) attrs(r.target); }
        else r.addedNodes.forEach(walk);
      }
    });
    mo.observe(document.documentElement, {
      childList: true, subtree: true, characterData: true,
      attributes: true, attributeFilter: ATTRS
    });
    const titleEl = document.querySelector('title');
    if (titleEl) {
      const fixTitle = () => { const tr = translate(document.title); if (tr && tr !== document.title) document.title = tr; };
      fixTitle();
      new MutationObserver(fixTitle).observe(titleEl, { childList: true, characterData: true, subtree: true });
    }
  }

  function wrapDialogs() {
    for (const name of ['alert', 'confirm', 'prompt']) {
      const orig = window[name];
      if (typeof orig !== 'function') continue;
      window[name] = function (msg, ...rest) {
        if (typeof msg === 'string') {
          // Mensagens com várias linhas: traduz linha a linha.
          const whole = translate(msg);
          msg = whole != null ? whole : msg.split('\n').map(l => { const t = translate(l); return t != null ? keepSpacing(l, t) : l; }).join('\n');
        }
        return orig.call(window, msg, ...rest);
      };
    }
  }

  window.EP_I18N_DYNAMIC_API = {
    start(dict) {
      load(dict);
      wrapDialogs();
      walk(document.body || document.documentElement);
      observe();
    },
    // Troca de idioma sem recarregar (telas com data-i18n-live): textos que o
    // JS gerar daqui pra frente usam o dicionário novo.
    setDict(dict) {
      load(dict || {});
      walk(document.body || document.documentElement);
    },
    translate
  };
})();
