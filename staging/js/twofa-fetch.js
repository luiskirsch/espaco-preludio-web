import { BACKEND_BASE_URL } from "./firebase-config.js";
import { createClinicalFetch } from "./twofa-session.js";

// Loaded once by the ES module registry; contains no profile loading or UI work.
let storage;
try { storage = globalThis.sessionStorage; } catch {}
globalThis.fetch = createClinicalFetch({
  fetch: globalThis.fetch.bind(globalThis), backend: BACKEND_BASE_URL,
  location: globalThis.location, storage
});
