const enc = new TextEncoder();

function secretForTracking(env) {
  return String(env.CONNECTOR_ENCRYPTION_KEY || env.ADMIN_API_KEY || "").trim();
}

function toBase64Url(bytes) {
  let raw = "";
  for (const b of new Uint8Array(bytes)) raw += String.fromCharCode(b);
  return btoa(raw).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function signatureFor(orderId, env) {
  const secret = secretForTracking(env);
  if (!secret) throw new Error("Tracking secret is not configured");

  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(String(orderId)));
  return toBase64Url(sig).slice(0, 32);
}

export async function createTrackingToken(orderId, env) {
  return `${Number(orderId)}.${await signatureFor(orderId, env)}`;
}

export async function verifyTrackingToken(token, env) {
  const match = String(token || "").match(/^(\d+)\.([A-Za-z0-9_-]{32})$/);
  if (!match) return null;

  const orderId = Number(match[1]);
  const supplied = match[2];
  const expected = await signatureFor(orderId, env);

  if (supplied.length !== expected.length) return null;

  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ supplied.charCodeAt(i);
  }

  return diff === 0 ? orderId : null;
}
