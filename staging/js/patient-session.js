// Espaço Prelúdio — sessionStorage helpers do PACIENTE.
// Namespace separado das chaves do profissional para que mesmo navegador
// possa hospedar dois logins (terapeuta numa aba, paciente em outra) sem
// uma sessionStorage colidir com a outra.

const PATIENT_DEK_KEY  = "ep_pat_dek_b64";
const PATIENT_USER_KEY = "ep_pat_user";

function bytesToB64(bytes) {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}
function b64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function rememberPatientDek(dekBytes) {
  try { sessionStorage.setItem(PATIENT_DEK_KEY, bytesToB64(dekBytes)); } catch {}
}
export function recallPatientDek() {
  try {
    const b64 = sessionStorage.getItem(PATIENT_DEK_KEY);
    return b64 ? b64ToBytes(b64) : null;
  } catch { return null; }
}
export function clearPatientDek() {
  try { sessionStorage.removeItem(PATIENT_DEK_KEY); } catch {}
  try { sessionStorage.removeItem(PATIENT_USER_KEY); } catch {}
}
export function rememberPatientUser(user) {
  try { sessionStorage.setItem(PATIENT_USER_KEY, JSON.stringify(user || {})); } catch {}
}
export function recallPatientUser() {
  try { return JSON.parse(sessionStorage.getItem(PATIENT_USER_KEY) || "null"); } catch { return null; }
}
