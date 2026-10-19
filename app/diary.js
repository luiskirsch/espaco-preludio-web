import { createSoundscape, createDictation } from './diary-audio.js?h=fb22bb467e';
import { FEELINGS, AROMAS, WEATHER, today, dateLabel, draft, hasEntryContent, countWords, feelingStats, searchEntries, escapeHtml as esc } from './diary-model.js?h=15c6c8575e';

const $ = id => document.getElementById(id);
const student = document.body.dataset.portal === 'student';
const assetBase = new URL('./assets/diary/', import.meta.url);
const preview = ['localhost', '127.0.0.1'].includes(location.hostname) && new URLSearchParams(location.search).has('preview');
const endpoint = '/therapy/paciente/diario';
let account, backend = '', ready = false, entries = [], nextCursor = null, current = draft(), tab = 'diary';
let dirty = false, editTick = 0, saveTimer, saving = null, toastTimer, dialogOrigin, dialogCleanup = null, bootGeneration = 0;
let dialogGeneration = 0, dialogSerial = 0, deletingId = null, conflict = false;
let dictationEntryId = null, dictationGeneration = 0;
let preset = 'rain';
const dialog = $('diaryDialog');
const text = $('journalText');
const uiErrors = {
  REGISTRO_ALTERADO: 'Esta página foi alterada em outra aba. Sua escrita continua aqui. Copie o texto e recarregue para conciliar as versões.',
  CAPSULA_SELADA: 'Esta cápsula já está selada. Você pode escrever uma nova carta.',
  DIARIO_INDISPONIVEL: 'Não foi possível acessar o diário agora. Tente novamente em instantes.',
  TEXTO_INVALIDO: 'Escreva entre 1 e 20.000 caracteres.',
  AROMA_INVALIDO: 'Descreva o aroma em até 100 caracteres, em uma única linha.',
  ABERTURA_INVALIDA: 'Escolha uma data de abertura a partir de amanhã.',
  TOKEN_INVALIDO: 'Sua sessão expirou. Entre novamente no portal.',
  TOKEN_NAO_INFORMADO: 'Entre no portal para acessar seu diário.',
};
function errorText(error) { return uiErrors[error?.message] || 'Não foi possível salvar. Sua escrita continua nesta página. Verifique a conexão e tente novamente.'; }
function showAvatarFallback(user) {
  const name = user?.displayName || user?.email?.split('@')[0] || '';
  $('avatar').replaceChildren(document.createTextNode(name.trim().charAt(0).toUpperCase() || '✦'));
  $('avatar').setAttribute('aria-label', name ? `Perfil de ${name}` : 'Perfil');
}
async function loadPortalAvatar(user) {
  const generation = bootGeneration;
  showAvatarFallback(user);
  try {
    const data = await api('/therapy/paciente/me');
    if (generation !== bootGeneration || account?.uid !== user.uid) return;
    const profile = data.account || {};
    const mime = String(profile.photoMime || '');
    const base64 = String(profile.photoBase64 || '');
    if (!/^image\/(?:png|jpeg|webp)$/.test(mime) || base64.length > 1_500_000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) return;
    const image = new Image();
    image.alt = '';
    image.src = `data:${mime};base64,${base64}`;
    $('avatar').replaceChildren(image);
    $('avatar').setAttribute('aria-label', `Foto de perfil de ${user.displayName || 'usuário'}`);
  } catch { /* A inicial continua disponível quando a foto não puder ser carregada. */ }
}
function toast(message) { clearTimeout(toastTimer); $('diaryToast').textContent = message; $('diaryToast').hidden = false; toastTimer = setTimeout(() => { $('diaryToast').hidden = true; }, 6500); }
function setStatus(message, state = '') {
  $('saveState').textContent = message; $('saveState').dataset.state = state;
  if (state === 'error') { $('saveState').setAttribute('tabindex', '0'); $('saveState').setAttribute('role', 'button'); $('saveState').setAttribute('aria-label', `${message}. Tentar novamente`); }
  else { $('saveState').removeAttribute('tabindex'); $('saveState').removeAttribute('aria-label'); $('saveState').setAttribute('role', 'status'); }
}
function assertReady() { if (!ready) { toast('Aguarde enquanto seu diário é preparado.'); return false; } return true; }
async function api(path, options = {}) {
  if (preview) return demoApi(path, options);
  if (!account) throw new Error('TOKEN_NAO_INFORMADO');
  const generation = bootGeneration;
  const token = await account.getIdToken();
  if (generation !== bootGeneration) throw new Error('STALE_SESSION');
  const response = await fetch(`${backend}${path}`, { ...options, cache: 'no-store', credentials: 'omit', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(options.headers || {}) }, signal: AbortSignal.timeout(20000) });
  const data = await response.json().catch(() => ({}));
  if (generation !== bootGeneration) throw new Error('STALE_SESSION');
  if (!response.ok || data.ok === false) throw new Error(data.error || `HTTP_${response.status}`);
  return data;
}
function upsert(item) { entries = [item, ...entries.filter(entry => entry.id !== item.id)].sort((a, b) => b.createdAt - a.createdAt); }
function resizeEditor() { text.style.height = 'auto'; text.style.height = `${Math.max(330, text.scrollHeight)}px`; }
function renderMeta() {
  $('wordCount').textContent = `${countWords(current.text)} ${countWords(current.text) === 1 ? 'palavra' : 'palavras'}`;
  $('entryTags').innerHTML = (current.tags || []).map(tag => `<span class="tag">#${esc(tag)}</span>`).join('');
  $('paper').dataset.font = current.font || 'hand';
  $('feelingButton').textContent = current.feelings?.length ? current.feelings.map(id => `${FEELINGS[id]?.icon || ''} ${FEELINGS[id]?.label || ''}`).join(' · ') : '♡ Como você se sente?';
  const aromaLabel = current.aromaText || AROMAS[current.aroma]?.[0] || '';
  $('aromaLabel').textContent = current.aromaText ? `Memória de ${current.aromaText}` : current.aroma ? `Memória de ${aromaLabel.toLowerCase()}` : 'Um perfume para esta lembrança.';
  $('weatherLabel').textContent = current.weather ? `${WEATHER[current.weather]?.[0]} · guardado nesta página` : 'O clima de hoje na sua página.';
  $('entryExtra').textContent = [current.weather ? WEATHER[current.weather]?.[0] : '', current.aroma || current.aromaText ? aromaLabel : ''].filter(Boolean).join(' · ');
  $('entryExtra').hidden = !$('entryExtra').textContent;
  $('deleteCurrent').hidden = !current.version;
  $('entryExtra').parentElement.hidden = $('entryExtra').hidden && !current.version;
  renderInsights();
  requestAnimationFrame(resizeEditor);
}
function renderInsights() {
  const list = entries.filter(entry => entry.date === today() && entry.id !== current.id);
  if (current.date === today() && hasEntryContent(current)) list.push(current);
  const stats = feelingStats(list);
  let offset = 0;
  $('feelingRing').style.background = stats.length ? `conic-gradient(${stats.map(item => { const start = offset; offset += item.percent; return `${item.color} ${start}% ${offset}%`; }).join(',')})` : '#998b7b';
  $('feelingRing').querySelector('span').textContent = stats.length ? '✧' : '♡';
  $('insightLegend').innerHTML = stats.length ? stats.slice(0, 3).map(item => `<p><strong>${esc(item.label)}</strong><small>${Math.round(item.percent)}% das escolhas de hoje</small></p>`).join('') : '<p class="insight-prompt"><strong>Como você se sente hoje?</strong><small>Registre até três sentimentos na sua página.</small></p>';
}
function markDirty({ immediate = false } = {}) {
  if (!ready || current.locked || current.kind === 'capsule') return;
  dirty = true; editTick++; renderMeta(); clearTimeout(saveTimer);
  if (!hasEntryContent(current) && !saving) { dirty = false; setStatus('Sua página espera por você'); return; }
  setStatus('Alterações pendentes…');
  saveTimer = setTimeout(() => flush(), immediate ? 0 : 950);
}
async function flush() {
  clearTimeout(saveTimer);
  const generation = bootGeneration;
  if (!ready || deletingId === current.id) return false;
  while (saving) { const ok = await saving; if (!ok || generation !== bootGeneration) return false; }
  if (!ready || deletingId === current.id) return false;
  if (!dirty) return true;
  if (!hasEntryContent(current)) { dirty = false; setStatus('Sua página espera por você'); return true; }
  const snapshot = structuredClone(current), tick = editTick;
  setStatus('Guardando suas palavras…');
  const operation = (async () => {
    try {
      const data = await api(`${endpoint}/${encodeURIComponent(snapshot.id)}`, { method: 'PUT', body: JSON.stringify(snapshot) });
      if (generation !== bootGeneration) return false;
      upsert(data.item);
      if (current.id === snapshot.id) {
        current.version = data.item.version; current.createdAt = data.item.createdAt; current.updatedAt = data.item.updatedAt;
        if (editTick === tick) { dirty = false; setStatus('Salvo automaticamente', 'saved'); }
        else { setStatus('Alterações pendentes…'); saveTimer = setTimeout(() => flush(), 950); }
      }
      renderMeta(); return true;
    } catch (error) {
      if (generation === bootGeneration) { conflict = error.message === 'REGISTRO_ALTERADO'; setStatus(conflict ? 'Versões diferentes · recuperar escrita' : 'Não salvo · tentar novamente', 'error'); toast(errorText(error)); }
      return false;
    } finally { if (saving === operation) saving = null; }
  })();
  saving = operation;
  return operation;
}
async function settle() {
  const generation = bootGeneration;
  while (dirty || saving) {
    if (generation !== bootGeneration || !ready || !await flush()) return false;
  }
  return generation === bootGeneration;
}
function activateTab(name) {
  tab = name;
  document.querySelectorAll('[data-tab]').forEach(button => {
    button.classList.toggle('is-active', button.dataset.tab === name);
    if (button.dataset.tab === name) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current');
  });
}
function revealPage(heading) {
  requestAnimationFrame(() => {
    if (dialog.open) return;
    heading?.setAttribute('tabindex', '-1');
    heading?.focus({ preventScroll: true });
    const stage = document.querySelector('.journal-stage');
    if (stage.getBoundingClientRect().top < 0) stage.scrollIntoView({ block: 'start', behavior: 'instant' });
  });
}
function showEditor(entry) {
  dictation.stop(); dictationEntryId = null;
  current = structuredClone(entry); dirty = false; conflict = false; editTick++; clearTimeout(saveTimer);
  $('editorView').hidden = false; $('collectionView').hidden = true;
  activateTab(current.kind === 'dream' ? 'dreams' : current.kind === 'capsule' ? 'capsules' : 'diary');
  $('entryDate').textContent = dateLabel(current.date);
  $('entryKind').textContent = current.kind === 'dream' ? 'UM SONHO PARA GUARDAR' : current.kind === 'capsule' ? 'UMA CARTA DO SEU PASSADO' : 'UMA PÁGINA SÓ SUA';
  text.value = current.text; text.disabled = !ready || current.kind === 'capsule';
  $('newPageButton').textContent = current.kind === 'dream' ? '+ Novo sonho' : '+ Nova página';
  ['feelingButton', 'tagsButton'].forEach(id => { $(id).disabled = current.kind === 'capsule'; });
  setStatus(current.version ? current.kind === 'capsule' ? 'Cápsula aberta · somente leitura' : 'Salvo automaticamente' : 'Seu espaço está pronto', current.version ? 'saved' : '');
  renderMeta(); requestAnimationFrame(resizeEditor);
}
async function newPage(kind = 'diary') {
  const generation = bootGeneration;
  if (!assertReady() || !await settle()) return;
  if (generation !== bootGeneration) return;
  showEditor(draft(kind)); text.focus();
}
async function switchTab(name) {
  const generation = bootGeneration;
  if (!assertReady() || !await settle()) return;
  if (generation !== bootGeneration) return;
  dictation.stop();
  if (name === 'diary') {
    const latest = entries.find(item => item.kind === 'diary' && item.date === today());
    showEditor(latest || draft()); revealPage($('entryDate')); return;
  }
  activateTab(name); $('editorView').hidden = true; $('collectionView').hidden = false;
  renderCollection(name);
  revealPage($('collectionView').querySelector('h1'));
}
function emptyState(icon, title, description) { return `<div class="empty-state"><svg><use href="#i-${icon}"/></svg><strong>${title}</strong><p>${description}</p></div>`; }
function cardMarkup(entry) {
  if (entry.locked) return `<article class="entry-card"><div class="capsule-lock"><svg><use href="#i-lock"/></svg><div><strong>Uma carta para o futuro</strong><small>Abre em ${esc(dateLabel(entry.unlockDate))}</small></div></div><button class="entry-delete" data-delete="${esc(entry.id)}">Excluir cápsula</button></article>`;
  const content = entry.text.trim();
  const firstLine = content.split('\n')[0];
  const excerpt = firstLine.slice(0, 82);
  const boundary = excerpt.lastIndexOf(' ');
  const writtenTitle = firstLine.length > 82 && boundary > 0 ? excerpt.slice(0, boundary) : excerpt;
  const title = writtenTitle || (entry.weather ? `${WEATHER[entry.weather]?.[0] || 'O clima'} guardado neste dia` : entry.aromaText ? `Memória de ${entry.aromaText}` : entry.aroma ? `Memória de ${(AROMAS[entry.aroma]?.[0] || entry.aroma).toLowerCase()}` : entry.feelings?.length ? entry.feelings.map(id => FEELINGS[id]?.label).filter(Boolean).join(' · ') : 'Uma página guardada com carinho');
  const remainder = writtenTitle ? content.slice(writtenTitle.length).trim().replace(/\s+/g, ' ') : '';
  const label = entry.kind === 'dream' ? 'Sonho' : entry.kind === 'capsule' ? 'Cápsula aberta' : 'Memória';
  return `<article class="entry-card"><button class="entry-open" data-open="${esc(entry.id)}"><time>${esc(dateLabel(entry.date))} · ${label}</time><h2>${esc(title)}${firstLine.length > 82 ? '…' : ''}</h2>${remainder ? `<p>${esc(remainder.slice(0, 130))}${remainder.length > 130 ? '…' : ''}</p>` : ''}<div class="entry-tags">${(entry.tags || []).map(tag => `<span class="tag">#${esc(tag)}</span>`).join('')}${(entry.feelings || []).map(id => `<span class="tag">${esc(FEELINGS[id]?.label || '')}</span>`).join('')}</div></button><button class="entry-delete" data-delete="${esc(entry.id)}">Excluir ${entry.kind === 'dream' ? 'sonho' : 'página'}</button></article>`;
}
function renderCollection(name) {
  const box = $('collectionView');
  if (name === 'feelings') {
    const stats = feelingStats(entries), count = entries.filter(item => !item.locked && item.feelings?.length).length;
    const overview = stats.length ? `<section class="feelings-chart" aria-labelledby="feelingsChartTitle"><div class="feelings-section-heading"><span>SEUS REGISTROS</span><h2 id="feelingsChartTitle">Como os sentimentos apareceram</h2><p>Uma visão das escolhas feitas nas páginas carregadas.</p></div><div class="sentiment-bars">${stats.map(item => `<div class="sentiment-row"><div class="sentiment-row__heading"><span><i style="--color:${item.color}"></i>${esc(item.icon)} ${esc(item.label)}</span><strong>${Math.round(item.percent)}%</strong></div><div class="sentiment-track" role="img" aria-label="${esc(item.label)}: ${Math.round(item.percent)}%"><i style="--value:${item.percent}%;--color:${item.color}"></i></div><small>${item.count} ${item.count === 1 ? 'registro' : 'registros'}</small></div>`).join('')}</div><p class="sentiment-explanation">As porcentagens consideram todas as escolhas de sentimentos nas páginas carregadas. Uma página pode guardar até três sentimentos.</p></section>` : `<section class="feelings-empty"><div class="feelings-empty__icon" aria-hidden="true"><svg><use href="#i-leaf"/></svg></div><div class="feelings-empty__copy"><span>SEU PRIMEIRO REGISTRO</span><h2>Comece pela página de hoje</h2><p>Escolha até três sentimentos que se aproximem deste momento. Com o tempo, este espaço ganha cores e mostra apenas o que você decidiu registrar.</p><button class="gold-button" id="backToWriting">Registrar como me sinto</button></div></section>`;
    box.innerHTML = `<div class="feelings-view"><header class="feelings-header"><span class="collection-kicker">UM OLHAR GENTIL PARA DENTRO</span><h1>As cores do que você sente</h1><p class="collection-intro">Um retrato cuidadoso dos sentimentos que você escolheu guardar.</p></header><div class="feelings-dashboard" aria-label="Resumo dos sentimentos"><article class="feeling-stat-card"><span>PÁGINAS REGISTRADAS</span><strong>${count}</strong><small>${count === 1 ? 'página com sentimentos' : 'páginas com sentimentos'}</small></article><article class="feeling-stat-card"><span>CORES PRESENTES</span><strong>${stats.length}</strong><small>${stats.length === 1 ? 'sentimento diferente' : 'sentimentos diferentes'}</small></article></div>${overview}<aside class="feelings-care-note"><svg aria-hidden="true"><use href="#i-lock"/></svg><p><strong>Este espaço pertence a você.</strong><span>Ele organiza suas próprias percepções e não faz avaliação psicológica nem interpreta o que foi escrito.</span></p></aside>${stats.length ? '<div class="feelings-actions"><button class="gold-button" id="backToWriting">Voltar à minha escrita</button></div>' : ''}${nextCursor ? '<button class="quiet-button load-more" id="loadMoreButton">Carregar mais páginas</button>' : ''}</div>`;
    $('backToWriting').addEventListener('click', async () => {
      await switchTab('diary');
      if (!stats.length) openFeelings();
    });
  } else {
    const config = {
      timeline: ['AS HISTÓRIAS QUE FICAM', 'Linha do Tempo de Memórias', 'Alguns momentos merecem ser revisitados com calma.'],
      dreams: ['ENTRE O SONO E A IMAGINAÇÃO', 'Mundo dos Sonhos', 'Guarde os fragmentos que a noite deixou com você.'],
      capsules: ['UMA CONVERSA COM QUEM VOCÊ SERÁ', 'Cápsula do Tempo', 'Escreva para o seu eu do futuro. Algumas palavras precisam de tempo.'],
    }[name];
    const list = entries.filter(item => name === 'dreams' ? item.kind === 'dream' : name === 'capsules' ? item.kind === 'capsule' : item.kind !== 'capsule' || !item.locked);
    box.innerHTML = `<span class="collection-kicker">${config[0]}</span><h1>${config[1]}</h1><p class="collection-intro">${config[2]}</p><div class="collection-toolbar"><button class="gold-button" id="collectionNew">${name === 'dreams' ? '+ Guardar um sonho' : name === 'capsules' ? '+ Escrever para o futuro' : '+ Nova memória'}</button></div><label class="sr-only" for="memorySearch">Buscar nas páginas carregadas</label><input type="search" class="collection-search" id="memorySearch" placeholder="Buscar por palavras, marcadores ou data…"><div class="entry-list" id="entryList"></div>${nextCursor ? '<button class="quiet-button load-more" id="loadMoreButton">Carregar mais páginas</button>' : ''}`;
    const renderList = () => {
      const filtered = searchEntries(list, $('memorySearch').value);
      $('entryList').innerHTML = filtered.length ? filtered.map(cardMarkup).join('') : emptyState(name === 'dreams' ? 'star' : name === 'capsules' ? 'hourglass' : 'book', $('memorySearch').value ? 'Nenhuma página encontrada' : name === 'dreams' ? 'O próximo sonho começa aqui' : name === 'capsules' ? 'Uma mensagem para outro tempo' : 'Sua história começa aqui', $('memorySearch').value ? 'Experimente outra palavra ou carregue mais páginas.' : 'Escreva sem pressa. Este espaço vai florescer com as suas palavras.');
    };
    renderList(); $('memorySearch').addEventListener('input', renderList);
    $('collectionNew').addEventListener('click', () => name === 'capsules' ? openCapsule() : newPage(name === 'dreams' ? 'dream' : 'diary'));
    $('entryList').addEventListener('click', event => {
      const open = event.target.closest('[data-open]'), remove = event.target.closest('[data-delete]');
      if (open) { const item = entries.find(entry => entry.id === open.dataset.open); if (item) { showEditor(item); revealPage($('entryDate')); } }
      if (remove) confirmDelete(entries.find(entry => entry.id === remove.dataset.delete));
    });
  }
  $('loadMoreButton')?.addEventListener('click', loadMore);
}
async function loadMore() {
  const generation = bootGeneration;
  const button = $('loadMoreButton'); if (button) { button.disabled = true; button.textContent = 'Buscando memórias…'; }
  try { const data = await api(`${endpoint}?cursor=${encodeURIComponent(nextCursor)}`); data.items.forEach(upsert); nextCursor = data.nextCursor; renderCollection(tab); }
  catch { if (generation !== bootGeneration) return; toast('Não foi possível carregar mais páginas. Tente novamente.'); if (button) { button.disabled = false; button.textContent = 'Carregar mais páginas'; } }
}
function openDialog(title, markup, cleanup = null) {
  if (dialog.open) closeDialog();
  dialogOrigin = document.activeElement; dialogCleanup = cleanup; dialogGeneration = bootGeneration; dialogSerial++;
  $('dialogTitle').textContent = title; $('dialogBody').innerHTML = markup; document.documentElement.classList.add('diary-modal-open'); dialog.showModal();
}
function closeDialog() { dialogSerial++; dialogCleanup?.(); dialogCleanup = null; if (dialog.open) dialog.close(); document.documentElement.classList.remove('diary-modal-open'); dialog.classList.remove('diary-dialog--aroma'); $('dialogBody').replaceChildren(); $('dialogTitle').textContent = ''; dialogOrigin?.focus?.(); }
function requestCloseDialog() {
  if ($('capsuleText')?.value.trim() && !window.confirm('Descartar esta carta ainda não selada?')) return;
  closeDialog();
}
dialog.addEventListener('click', event => { if (dialogGeneration !== bootGeneration) { event.preventDefault(); event.stopImmediatePropagation(); closeDialog(); } }, true);
dialog.addEventListener('submit', event => { if (dialogGeneration !== bootGeneration) { event.preventDefault(); event.stopImmediatePropagation(); closeDialog(); } }, true);
$('closeDialog').addEventListener('click', requestCloseDialog);
dialog.addEventListener('cancel', event => { event.preventDefault(); requestCloseDialog(); });
dialog.addEventListener('click', event => { if (event.target === dialog) { const r = dialog.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) requestCloseDialog(); } });
function canEdit() { if (!assertReady()) return false; if ($('editorView').hidden) { toast('Abra uma página para personalizar sua escrita.'); return false; } if (current.kind === 'capsule') { toast('Esta carta já foi selada. Comece uma nova página.'); return false; } return true; }
function openFeelings() {
  if (!canEdit()) return;
  const selected = new Set(current.feelings || []);
  openDialog('Que cor tem este momento?', `<p>Não existe sentimento certo ou errado. Escolha até três que se aproximem do que você sente.</p><div class="choice-grid">${Object.entries(FEELINGS).map(([id, feeling]) => `<button class="choice-button" data-feeling="${id}" aria-pressed="${selected.has(id)}"><span>${feeling.icon}</span>${feeling.label}</button>`).join('')}</div><div class="dialog-actions"><button class="gold-button" id="applyFeelings">Guardar sentimentos</button></div>`);
  dialog.querySelectorAll('[data-feeling]').forEach(button => button.addEventListener('click', () => {
    const id = button.dataset.feeling;
    if (selected.has(id)) selected.delete(id); else if (selected.size < 3) selected.add(id); else { toast('Escolha até três sentimentos para esta página.'); return; }
    button.setAttribute('aria-pressed', String(selected.has(id)));
  }));
  $('applyFeelings').addEventListener('click', () => { current.feelings = [...selected]; markDirty({ immediate: true }); closeDialog(); });
}
function openAroma() {
  if (!canEdit()) return;
  openDialog('O perfume de uma memória', `<p class="aroma-intro">Um cheiro pode guardar um lugar, uma pessoa ou um instante. Qual acompanha esta lembrança?</p><div class="aroma-section-label">ESCOLHA UM AROMA</div><div class="choice-grid aroma-choices">${Object.entries(AROMAS).map(([id, [label, icon]]) => `<button type="button" class="choice-button aroma-choice" data-aroma="${id}" aria-pressed="${!current.aromaText && current.aroma === id}"><span aria-hidden="true">${icon}</span><strong>${label}</strong></button>`).join('')}</div><form id="customAromaForm" class="aroma-custom"><label for="customAroma">Ou descreva o seu aroma</label><p>Algumas memórias têm um perfume só delas.</p><input type="text" id="customAroma" name="aroma" maxlength="100" required autocomplete="off" placeholder="Ex.: bolo saindo do forno, perfume da minha mãe…" value="${esc(current.aromaText || '')}" aria-describedby="customAromaHint"><div class="aroma-custom__footer"><small id="customAromaHint">Até 100 caracteres.</small><button type="submit" class="gold-button">Guardar aroma <span aria-hidden="true">↗</span></button></div></form><p class="aroma-footnote"><svg aria-hidden="true"><use href="#i-leaf"/></svg> Um detalhe para sentir essa história outra vez.</p>`);
  dialog.classList.add('diary-dialog--aroma');
  dialog.querySelectorAll('[data-aroma]').forEach(button => button.addEventListener('click', () => { current.aroma = button.dataset.aroma; current.aromaText = ''; markDirty({ immediate: true }); closeDialog(); }));
  $('customAromaForm').addEventListener('submit', event => {
    event.preventDefault();
    const value = $('customAroma').value.trim();
    if (!value) { $('customAroma').setCustomValidity('Escreva o aroma que deseja guardar.'); $('customAroma').reportValidity(); return; }
    current.aroma = ''; current.aromaText = value; markDirty({ immediate: true }); closeDialog();
  });
  $('customAroma').addEventListener('input', () => $('customAroma').setCustomValidity(''));
}
function openFont() {
  if (!canEdit()) return;
  openDialog('A sua letra, o seu ritmo', `<p>Escolha a caligrafia que mais combina com você.</p><div class="entry-list">${[['hand', 'Escrita à mão'], ['classic', 'Clássica & delicada'], ['simple', 'Simples & leve']].map(([id, label]) => `<button class="choice-button font-choice" data-font="${id}" aria-pressed="${current.font === id}">${label}</button>`).join('')}</div>`);
  dialog.querySelectorAll('[data-font]').forEach(button => button.addEventListener('click', () => { current.font = button.dataset.font; markDirty({ immediate: true }); closeDialog(); }));
}
function openTags() {
  if (!canEdit()) return;
  openDialog('Pequenas pistas da sua história', '<form id="tagsForm"><p>Separe por vírgulas. Você pode guardar até seis marcadores de até 30 caracteres.</p><label class="dialog-field">Marcadores<input id="tagsInput" maxlength="185" placeholder="parque, nostalgia, reflexão"></label><div class="dialog-actions"><button class="gold-button" type="submit">Guardar marcadores</button></div></form>');
  $('tagsInput').value = current.tags.join(', ');
  $('tagsForm').addEventListener('submit', event => { event.preventDefault(); const tags = [...new Set($('tagsInput').value.split(',').map(tag => tag.trim().replace(/^#/, '')).filter(Boolean))]; if (tags.length > 6 || tags.some(tag => tag.length > 30)) { toast('Use até seis marcadores de até 30 caracteres.'); return; } current.tags = tags; markDirty({ immediate: true }); closeDialog(); });
}
async function captureWeather() {
  if (!canEdit()) return;
  const generation = bootGeneration, entryId = current.id, weatherDialogSerial = dialogSerial;
  const button = $('weatherButton'); button.disabled = true; $('weatherLabel').textContent = 'Olhando pela janela do tempo…';
  try {
    const coordinates = preview ? null : await new Promise(resolve => { if (!navigator.geolocation) return resolve(null); navigator.geolocation.getCurrentPosition(position => resolve({ lat: position.coords.latitude, lon: position.coords.longitude }), () => resolve(null), { timeout: 7000, maximumAge: 600000, enableHighAccuracy: false }); });
    const data = preview ? { weather: null } : coordinates ? await api('/therapy/paciente/ambiente', { method: 'POST', body: JSON.stringify(coordinates) }) : await api('/therapy/paciente/ambiente');
    if (generation !== bootGeneration || entryId !== current.id) return;
    const weather = data.weather === 'partly' ? 'cloudy' : data.weather;
    if (WEATHER[weather]) { current.weather = weather; markDirty({ immediate: true }); toast('Um pedacinho do clima ficou guardado nesta página.'); if (weather === 'rain' || weather === 'storm') preset = 'rain'; }
    else if (weatherDialogSerial === dialogSerial) openWeatherChoice();
  } catch { if (generation === bootGeneration && entryId === current.id && weatherDialogSerial === dialogSerial) openWeatherChoice(); }
  finally { button.disabled = false; if (generation === bootGeneration) renderMeta(); }
}
function openWeatherChoice() {
  openDialog('Como está o tempo por aí?', `<p>Não conseguimos capturar o clima agora. Você pode escolher o que vê pela janela.</p><div class="choice-grid">${Object.entries(WEATHER).map(([id, [label, icon]]) => `<button class="choice-button" data-weather="${id}"><span>${icon}</span>${label}</button>`).join('')}</div>`);
  dialog.querySelectorAll('[data-weather]').forEach(button => button.addEventListener('click', () => { current.weather = button.dataset.weather; markDirty({ immediate: true }); closeDialog(); }));
}
const soundscape = createSoundscape({ onState({ playing, preset: selected }) {
  preset = selected;
  document.body.classList.toggle('is-playing', playing);
  $('playButton').textContent = playing ? 'Ⅱ' : '▶'; $('playButton').setAttribute('aria-pressed', String(playing)); $('playButton').setAttribute('aria-label', playing ? 'Pausar trilha sonora' : 'Reproduzir trilha sonora');
  const name = { rain: 'Chuva na cabana & piano', forest: 'Um passeio pela floresta', piano: 'Piano para desacelerar' }[selected];
  $('playerDescription').removeAttribute('data-i18n-html'); $('soundLabel').removeAttribute('data-i18n-html');
  $('playerDescription').textContent = `${name} · ${playing ? 'tocando' : 'pausado'}`; $('soundLabel').textContent = name;
} });
soundscape.setVolume(.25);
async function toggleSound() { try { if (soundscape.playing) await soundscape.stop(); else await soundscape.play(preset); } catch (error) { toast(error.message); } }
function openSound() {
  openDialog('Uma trilha para o seu momento', '<p>Escolha uma paisagem sonora. Ajuste o volume no painel ao lado.</p><div class="entry-list">' + [['rain', '🌧', 'Chuva na cabana & piano'], ['forest', '🌿', 'Um passeio pela floresta'], ['piano', '♫', 'Piano para desacelerar']].map(([id, icon, label]) => `<button class="choice-button" data-preset="${id}" aria-pressed="${preset === id}"><span>${icon}</span>${label}</button>`).join('') + '</div><div class="dialog-actions"><button class="quiet-button" id="stopSound">Pausar trilha</button></div>');
  dialog.querySelectorAll('[data-preset]').forEach(button => button.addEventListener('click', async () => { try { await soundscape.play(button.dataset.preset); closeDialog(); } catch (error) { toast(error.message); } }));
  $('stopSound').addEventListener('click', () => { soundscape.stop(); closeDialog(); });
}
const dictation = createDictation({ onText(transcript) {
  if (!ready || current.kind === 'capsule' || dictationEntryId !== current.id || dictationGeneration !== bootGeneration) return;
  const spacer = text.value && !/\s$/.test(text.value) ? ' ' : '';
  text.value = (text.value + spacer + transcript).slice(0, 20000); current.text = text.value; markDirty(); resizeEditor();
}, onState(listening) {
  $('voiceButton').classList.toggle('is-listening', listening);
  $('voiceLabel').textContent = listening ? 'Ouvindo… fale no seu tempo' : 'Fale e registre seus pensamentos.';
  $('voiceStatus')?.classList.toggle('is-listening', listening);
  if ($('voiceStatusText')) $('voiceStatusText').textContent = listening ? 'Ouvindo a sua história…' : 'O microfone está pausado';
  if ($('voiceToggle')) $('voiceToggle').textContent = listening ? 'Pausar microfone' : 'Começar a falar';
}, onError(message) { toast(message); if ($('voiceStatusText')) $('voiceStatusText').textContent = message; } });
function openVoice() {
  if (!canEdit()) return;
  if (!dictation.supported) { openDialog('Sua voz também tem lugar aqui', '<p>O ditado não está disponível neste navegador. Você pode usar o microfone do teclado do seu celular ou abrir este diário no Google Chrome.</p><p class="dialog-note">Sua escrita continua disponível normalmente.</p>'); return; }
  openDialog('Deixe sua voz virar palavras', '<p>Fale com calma. Suas palavras serão acrescentadas à página aberta.</p><div class="voice-status" id="voiceStatus"><svg><use href="#i-mic"/></svg><span id="voiceStatusText">Quando quiser, é só começar.</span></div><p class="dialog-note">O navegador pode enviar áudio ao serviço de reconhecimento de voz. O diário salva a transcrição, sem guardar o áudio.</p><div class="dialog-actions"><button class="gold-button" id="voiceToggle">Começar a falar</button></div>', () => dictation.stop());
  $('voiceToggle').addEventListener('click', () => { if (dictation.listening) dictation.stop(); else { dictationEntryId = current.id; dictationGeneration = bootGeneration; dictation.start(); } });
}
function openMemory(kind) {
  openDialog(kind === 'park' ? 'Parque ao entardecer' : 'Folhas ao vento', `<img class="memory-preview" src="${new URL(kind === 'park' ? 'autumn-memory.webp' : 'autumn-paper.webp', assetBase).href}" alt="${kind === 'park' ? 'Caminho entre árvores de outono sob a luz dourada do pôr do sol' : 'Folhas douradas e avermelhadas em uma página de pergaminho'}"><p>${kind === 'park' ? 'Que lugar faz você se sentir em casa? Talvez seja um caminho, uma pessoa ou um instante.' : 'Algumas coisas a gente guarda. Outras, deixa o vento levar. O que este momento desperta em você?'}</p><div class="dialog-actions"><button class="gold-button" id="memoryWrite">Escrever a partir daqui</button></div>`);
  $('memoryWrite').addEventListener('click', async () => { closeDialog(); if (!assertReady() || !await settle()) return; if ($('editorView').hidden || current.kind === 'capsule') showEditor(draft()); const tag = kind === 'park' ? 'parque' : 'outono'; if (!current.tags.includes(tag) && current.tags.length < 6) { current.tags.push(tag); markDirty({ immediate: true }); } text.focus(); });
}
function openRelease() {
  openDialog('Nem tudo precisa ficar guardado', '<form id="releaseForm"><p>Escreva o que pesa. Quando estiver pronto, deixe suas palavras encontrar outro lugar no céu.</p><label class="sr-only" for="releaseText">O que você gostaria de soltar?</label><textarea class="release-field" id="releaseText" maxlength="5000" placeholder="Hoje eu quero deixar ir…" required></textarea><p class="dialog-note">Estas palavras não são salvas nem enviadas.</p><div class="dialog-actions"><button class="gold-button" type="submit">✧ Deixar ir</button></div></form>');
  $('releaseForm').addEventListener('submit', event => { event.preventDefault(); if (!$('releaseText').value.trim()) return; const stars = Math.min(75, Math.max(20, countWords($('releaseText').value))); $('releaseText').value = ''; $('dialogBody').innerHTML = `<div class="constellation">${Array.from({ length: stars }, (_, i) => `<i style="--x:${(i * 37.7) % 100}%;--y:${(i * 19.3) % 100}%;--d:${i * .025}s"></i>`).join('')}<span>Há espaço para respirar.</span></div><p>Suas palavras se desfizeram em estrelas. Fique aqui pelo tempo que precisar.</p><div class="dialog-actions"><button class="quiet-button" id="releaseDone">Voltar ao meu diário</button></div>`; $('releaseDone').addEventListener('click', closeDialog); });
}
function tomorrow() { const value = new Date(`${today()}T12:00:00Z`); value.setUTCDate(value.getUTCDate() + 1); return value.toISOString().slice(0, 10); }
function openCapsule() {
  if (!assertReady()) return;
  const generation = bootGeneration;
  const capsule = draft('capsule');
  openDialog('Querido eu do futuro…', `<form id="capsuleForm"><p>Uma carta para quem você está se tornando. Depois de selada, ela só poderá ser lida a partir da data escolhida.</p><label class="dialog-field">Quando abrir?<input type="date" id="capsuleDate" min="${tomorrow()}" required></label><label class="dialog-field">Sua mensagem<textarea id="capsuleText" maxlength="20000" placeholder="Espero que, quando você ler isso…" required></textarea></label><p class="dialog-note">Uma cápsula selada não pode ser editada. Ela continua podendo ser excluída.</p><p id="capsuleError" role="alert"></p><div class="dialog-actions"><button class="gold-button" type="submit" id="sealCapsule">Selar minha cápsula ✧</button></div></form>`);
  const capsuleDialogSerial = dialogSerial;
  $('capsuleForm').addEventListener('submit', async event => {
    event.preventDefault(); if (generation !== bootGeneration) return;
    const button = $('sealCapsule'), errorBox = $('capsuleError');
    capsule.text = $('capsuleText').value; capsule.unlockDate = $('capsuleDate').value;
    if (!capsule.text.trim() || capsule.unlockDate < tomorrow()) { $('capsuleError').textContent = 'Escreva sua carta e escolha uma data a partir de amanhã.'; return; }
    button.disabled = true; button.textContent = 'Selando suas palavras…';
    try { const data = await api(`${endpoint}/${capsule.id}`, { method: 'PUT', body: JSON.stringify(capsule) }); upsert(data.item); if (capsuleDialogSerial === dialogSerial) { $('capsuleText').value = ''; closeDialog(); await switchTab('capsules'); } toast('Sua cápsula está guardada. O futuro cuida do próximo encontro.'); }
    catch (error) { if (generation !== bootGeneration) return; errorBox.textContent = errorText(error); button.disabled = false; button.textContent = 'Selar minha cápsula ✧'; }
  });
}
function confirmDelete(entry) {
  if (!entry) return;
  const generation = bootGeneration;
  openDialog('Deixar esta página partir?', `<p>${entry.locked ? 'Esta cápsula será excluída, junto com a mensagem guardada nela.' : 'Esta página será excluída permanentemente do seu diário.'} Esta ação não pode ser desfeita.</p><div class="dialog-actions"><button class="quiet-button" id="cancelDelete">Manter página</button><button class="gold-button danger-button" id="confirmDelete">Excluir para sempre</button></div>`);
  const deleteDialogSerial = dialogSerial;
  $('cancelDelete').addEventListener('click', closeDialog);
  $('confirmDelete').addEventListener('click', async () => {
    if (generation !== bootGeneration) return;
    const button = $('confirmDelete'); button.disabled = true; deletingId = entry.id; clearTimeout(saveTimer);
    try { if (saving) await saving; if (generation !== bootGeneration) return; const latest = entries.find(item => item.id === entry.id) || entry; await api(`${endpoint}/${encodeURIComponent(entry.id)}?version=${latest.version}`, { method: 'DELETE' }); entries = entries.filter(item => item.id !== entry.id); if (current.id === entry.id) { dirty = false; clearTimeout(saveTimer); current = draft(); if ($('collectionView').hidden) showEditor(current); } if (deleteDialogSerial === dialogSerial) closeDialog(); if (!$('collectionView').hidden) renderCollection(tab); renderInsights(); toast('Página excluída.'); }
    catch (error) { if (generation !== bootGeneration) return; toast(errorText(error)); button.disabled = false; }
    finally { deletingId = null; }
  });
}
function recoverWriting() {
  openDialog('Vamos preservar as suas palavras', '<p>Outra aba alterou esta página. Você pode guardar o texto que está aqui como uma nova página, preservando as duas versões.</p><div class="dialog-actions"><button class="quiet-button" id="keepWriting">Continuar aqui</button><button class="gold-button" id="saveAsNew">Salvar como nova página</button></div>');
  $('keepWriting').addEventListener('click', closeDialog);
  $('saveAsNew').addEventListener('click', async () => { current.id = `page-${crypto.randomUUID()}`; current.version = 0; delete current.createdAt; delete current.updatedAt; conflict = false; dirty = true; editTick++; closeDialog(); await flush(); });
}
text.addEventListener('input', () => { current.text = text.value; markDirty(); resizeEditor(); });
document.querySelectorAll('[data-tab]').forEach(button => button.addEventListener('click', () => switchTab(button.dataset.tab)));
document.querySelectorAll('[data-go]').forEach(button => button.addEventListener('click', () => switchTab(button.dataset.go)));
document.querySelectorAll('[data-memory]').forEach(button => button.addEventListener('click', () => openMemory(button.dataset.memory)));
$('newPageButton').addEventListener('click', () => newPage(current.kind === 'dream' ? 'dream' : 'diary'));
$('feelingButton').addEventListener('click', openFeelings); $('tagsButton').addEventListener('click', openTags);
$('aromaButton').addEventListener('click', openAroma); $('fontButton').addEventListener('click', openFont);
$('weatherButton').addEventListener('click', captureWeather); $('voiceButton').addEventListener('click', openVoice);
$('playButton').addEventListener('click', toggleSound); $('soundButton').addEventListener('click', openSound);
$('volumeSlider').addEventListener('input', event => soundscape.setVolume(Number(event.target.value) / 100));
$('releaseButton').addEventListener('click', openRelease); $('deleteCurrent').addEventListener('click', () => confirmDelete(current));
$('saveState').addEventListener('click', () => { if ($('saveState').dataset.state === 'error') { if (conflict) recoverWriting(); else if (ready) flush(); else loadDiary(); } });
$('saveState').addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); $('saveState').click(); } });
document.querySelectorAll('a.back-link, a.diary-brand').forEach(link => link.addEventListener('click', async event => { if (!dirty) return; event.preventDefault(); if (await settle()) location.assign(link.href); }));
window.addEventListener('beforeunload', event => { if (dirty || $('capsuleText')?.value.trim()) { event.preventDefault(); event.returnValue = ''; } });
window.addEventListener('pagehide', () => { soundscape.stop(); dictation.stop(); dictationEntryId = null; });
window.addEventListener('online', () => { if (ready && dirty) flush(); });
$('headerDate').dateTime = today(); $('headerDate').textContent = dateLabel(today(), { weekday: 'long' });
$('entryDate').textContent = dateLabel(today());
document.querySelector('.fireflies').innerHTML = Array.from({ length: 38 }, (_, i) => `<i style="--x:${(i * 27.3 + 3) % 100}%;--y:${(i * 17.6 + 2) % 100}%;--s:${i % 4 === 0 ? 4 : 2}px;--o:${.3 + (i % 5) / 10};--t:${3 + i % 4}s;--d:-${i * .3}s"></i>`).join('');
document.querySelector('.spectrum').innerHTML = Array.from({ length: 38 }, (_, i) => `<i style="--h:${15 + Math.abs(Math.sin(i * 1.8) * Math.cos(i * .42)) * 85}%;--hue:${15 + i * 7};--d:-${i * .13}s"></i>`).join('');
document.fonts?.ready.then(() => requestAnimationFrame(resizeEditor));
let previousPaperWidth = 0;
new ResizeObserver(records => {
  const width = records[0]?.contentRect.width;
  if (width && width !== previousPaperWidth) { previousPaperWidth = width; requestAnimationFrame(resizeEditor); }
}).observe($('paper'));
async function loadDiary() {
  setStatus('Abrindo seu diário…'); const generation = ++bootGeneration;
  try {
    const data = await api(endpoint); if (generation !== bootGeneration) return;
    entries = data.items; nextCursor = data.nextCursor; ready = true;
    const latest = entries.find(item => item.kind === 'diary' && item.date === today());
    showEditor(latest || draft());
  } catch (error) { if (generation !== bootGeneration) return; ready = false; text.disabled = true; setStatus('Diário indisponível · tentar novamente', 'error'); toast(errorText(error)); }
}
const demoEntries = new Map();
async function demoApi(path, options = {}) {
  if (options.method === 'PUT') {
    const item = JSON.parse(options.body); const previous = demoEntries.get(item.id);
    if ((previous?.version || 0) !== item.version) throw new Error('REGISTRO_ALTERADO');
    const saved = { ...item, version: item.version + 1, createdAt: previous?.createdAt || Date.now(), updatedAt: Date.now(), locked: item.kind === 'capsule' && item.unlockDate > today() };
    if (saved.locked) { delete saved.text; delete saved.tags; delete saved.feelings; delete saved.aroma; delete saved.aromaText; delete saved.font; delete saved.weather; }
    demoEntries.set(item.id, saved); return { ok: true, item: saved };
  }
  if (options.method === 'DELETE') { demoEntries.delete(path.split('/').pop().split('?')[0]); return { ok: true }; }
  return { ok: true, items: [...demoEntries.values()], nextCursor: null };
}
if (preview) {
  $('previewBanner').hidden = false;
  const example = { ...draft(), text: 'Hoje o dia teve um tom diferente… caminhei pelo parque e o vento parecia trazer memórias antigas…\nE de repente, uma sensação de nostalgia me abraçou, como se o próprio cenário estivesse contando uma história.\nSinto que o outono sempre traz essa vontade de olhar para dentro.', feelings: ['nostalgia', 'serenidade'], tags: ['parque', 'nostalgia', 'reflexão'], version: 1, createdAt: Date.now(), updatedAt: Date.now() };
  demoEntries.set(example.id, example); loadDiary();
} else {
  try {
    const [{ onAuthStateChanged }, config] = await Promise.all([import('https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js'), import('../js/firebase-config.js?h=a1e6b0a1a1')]);
    backend = config.BACKEND_BASE_URL;
    onAuthStateChanged(config.auth, user => {
      if (!user || account && account.uid !== user.uid) {
        bootGeneration++; ready = false; dirty = false; conflict = false; saving = null; deletingId = null; clearTimeout(saveTimer); closeDialog(); dictation.stop(); soundscape.stop();
        text.value = ''; text.disabled = true; entries = []; current = draft(); renderMeta();
        $('collectionView').innerHTML = ''; $('collectionView').hidden = true; $('editorView').hidden = false;
      }
      if (!user) { account = null; location.replace(student ? './aluno-login.html' : './login.html'); return; }
      account = user; loadDiary(); loadPortalAvatar(user);
    });
  } catch { setStatus('Não foi possível conectar · recarregue a página', 'error'); toast('Não foi possível abrir o diário. Verifique sua conexão e recarregue a página.'); }
}
