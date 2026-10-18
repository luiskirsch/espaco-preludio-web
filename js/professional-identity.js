// Tab-scoped display identity only. Never used for authentication, permissions,
// professional profile responses, or clinical data.
(function () {
  if (window.EP_PROFESSIONAL_IDENTITY) return;
  const key = 'ep:professional-display:v1';
  let identity = null;
  function normalize(value) {
    if (!value || typeof value.uid !== 'string' || !value.uid || value.uid.length > 160 || typeof value.displayName !== 'string') return null;
    const name = value.displayName.trim().slice(0, 160);
    const photo = typeof value.photo === 'string' && value.photo.length <= 1_500_100 && /^data:image\/(?:jpeg|png|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/.test(value.photo) ? value.photo : '';
    return { uid: value.uid, displayName: name, photo, verified: value.verified === true };
  }
  function read() {
    try { identity = normalize(JSON.parse(sessionStorage.getItem(key) || 'null')); } catch { identity = null; }
  }
  function renderAvatar(avatar) {
    if (identity.photo) {
      avatar.style.backgroundImage = `url("${identity.photo}")`;
      avatar.style.backgroundSize = 'cover'; avatar.style.backgroundPosition = 'center';
      avatar.textContent = '';
    } else {
      avatar.style.backgroundImage = '';
      avatar.textContent = (identity.displayName.match(/\b\p{L}/gu) || []).slice(0, 2).join('').toUpperCase() || '·';
    }
    avatar.classList.add('ep-avatar-wrap');
    if (identity.verified) {
      const badge = document.createElement('span'); badge.className = 'ep-verified-badge';
      badge.setAttribute('title', 'Profissional verificado · inscrição no conselho confirmada');
      badge.setAttribute('aria-label', 'Profissional verificado');
      badge.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12l5 5L20 7" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      avatar.appendChild(badge);
    }
  }
  function hydrate() {
    if (!identity) return;
    const topName = document.getElementById('topUserName');
    if (topName) topName.textContent = identity.displayName || 'Perfil';
    const sideName = document.getElementById('sidebarUserName');
    if (sideName) {
      const parts = (identity.displayName || 'Perfil').split(/\s+/).filter(Boolean);
      sideName.replaceChildren(...(parts.length > 1 ? [parts[0], parts.at(-1)] : parts).map(part => {
        const span = document.createElement('span'); span.textContent = part; return span;
      }));
    }
    ['topUserAvatar', 'sidebarUserAvatar'].forEach(id => {
      const avatar = document.getElementById(id); if (avatar) renderAvatar(avatar);
    });
  }
  function clear() {
    identity = null;
    try { sessionStorage.removeItem(key); } catch {}
    ['topUserName', 'sidebarUserName', 'topUserAvatar', 'sidebarUserAvatar'].forEach(id => {
      const element = document.getElementById(id);
      if (element) { element.replaceChildren(); element.style.backgroundImage = ''; }
    });
  }
  function save(uid, therapist) {
    const photoBase64 = String(therapist?.photoBase64 || '');
    const mime = /^(?:image\/)(?:jpeg|png|webp|gif)$/i.test(therapist?.photoMime || '') ? therapist.photoMime.toLowerCase() : 'image/jpeg';
    identity = normalize({ uid, displayName: String(therapist?.displayName || ''),
      photo: photoBase64 ? `data:${mime};base64,${photoBase64}` : '', verified: therapist?.verificationStatus === 'verified' });
    if (!identity) return;
    try { sessionStorage.setItem(key, JSON.stringify(identity)); } catch { /* current-page rendering still works */ }
    hydrate();
  }
  function reconcile(uid) { if (!uid || identity && identity.uid !== uid) clear(); }
  read();
  if (identity?.photo) { const image = new Image(); image.src = identity.photo; }
  window.EP_PROFESSIONAL_IDENTITY = { hydrate, save, clear, reconcile };
  const selector = '#topUserName,#sidebarUserName,#topUserAvatar,#sidebarUserAvatar';
  new MutationObserver(records => {
    if (records.some(record => [...record.addedNodes].some(node => node.nodeType === 1 && (node.matches(selector) || node.querySelector(selector))))) hydrate();
  }).observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener('click', event => {
    if (event.target.closest?.('#sidebarLogout,#logoutBtn')) clear();
  }, { capture: true });
  // A prerender gets a cloned sessionStorage; activation restores the live tab's
  // storage. Read it again so edits made after preparation are reflected too.
  document.addEventListener('prerenderingchange', () => { read(); hydrate(); });
  window.addEventListener('pageshow', () => { read(); hydrate(); });
  hydrate();
})();
