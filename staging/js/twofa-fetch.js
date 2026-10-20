import { BACKEND_BASE_URL } from "./firebase-config.js?h=69b74fc63a";
import { installClinicalFetch } from "./twofa-session.js?h=295a6b1bd5";

// Loaded once by the ES module registry; contains no profile loading or UI work.
installClinicalFetch({ backend: BACKEND_BASE_URL });
