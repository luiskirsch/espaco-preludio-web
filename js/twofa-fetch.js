import { BACKEND_BASE_URL } from "./firebase-config.js?h=a1e6b0a1a1";
import { installClinicalFetch } from "./twofa-session.js?h=fbd5e4b98b";

// Loaded once by the ES module registry; contains no profile loading or UI work.
installClinicalFetch({ backend: BACKEND_BASE_URL });
