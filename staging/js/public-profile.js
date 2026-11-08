// Photos are served by the API; never interpolate arbitrary profile URLs.
export function publicPhotoUrl(profile, backend) {
  const relative = String(profile?.photoUrl || "");
  if (!/^\/public\/profissionais\/[a-z0-9-]+\/foto\?t=[A-Za-z0-9_.%~-]+$/.test(relative)) return "";
  try {
    const base = new URL(backend);
    if (!["https:", "http:"].includes(base.protocol)) return "";
    return backend.replace(/\/$/, "") + relative;
  } catch { return ""; }
}
