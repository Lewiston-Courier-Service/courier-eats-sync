const enc = new TextEncoder();

function secretForDriver(env) {
  return String(env.CONNECTOR_ENCRYPTION_KEY || env.ADMIN_API_KEY || "").trim();
}

function toBase64Url(bytes) {
  let raw = "";
  for (const b of new Uint8Array(bytes)) raw += String.fromCharCode(b);
  return btoa(raw).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function signatureFor(driverId, env) {
  const secret = secretForDriver(env);
  if (!secret) throw new Error("Driver access secret is not configured");

  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(`driver:${driverId}`));
  return toBase64Url(sig).slice(0, 32);
}

export async function createDriverToken(driverId, env) {
  return `${Number(driverId)}.${await signatureFor(driverId, env)}`;
}

export async function verifyDriverToken(token, env) {
  const match = String(token || "").match(/^(\d+)\.([A-Za-z0-9_-]{32})$/);
  if (!match) return null;

  const driverId = Number(match[1]);
  const supplied = match[2];
  const expected = await signatureFor(driverId, env);

  if (supplied.length !== expected.length) return null;

  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ supplied.charCodeAt(i);
  }

  return diff === 0 ? driverId : null;
}
