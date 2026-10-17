import { BACKEND_BASE_URL } from "./firebase-config.js?v=20261017-mfa3";
import { installClinicalFetch } from "./twofa-session.js?v=20261017-mfa3";

// Loaded once by the ES module registry; contains no profile loading or UI work.
installClinicalFetch({ backend: BACKEND_BASE_URL });
