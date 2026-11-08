import { BACKEND_BASE_URL } from "./firebase-config.js?h=524e7ae9db";
import { installClinicalFetch } from "./twofa-session.js?h=cd0e678dbd";

// Loaded once by the ES module registry; contains no profile loading or UI work.
installClinicalFetch({ backend: BACKEND_BASE_URL });
