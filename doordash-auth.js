export async function handleDoorDashAuth(request, env) {
  const url = new URL(request.url);

  if (url.pathname === "/api/marketplace/doordash/api-test") {
    return handleDoorDashApiTest(request, env);
  }

  if (url.pathname !== "/api/marketplace/doordash/auth-status") {
    return null;
  }

  if (request.method !== "GET") {
    return json({ error: "Method not allowed" }, 405);
  }

  const configured = {
    developerId: Boolean(env.DOORDASH_DEVELOPER_ID),
    keyId: Boolean(env.DOORDASH_KEY_ID),
    signingSecret: Boolean(env.DOORDASH_SIGNING_SECRET)
  };

  if (!configured.developerId || !configured.keyId || !configured.signingSecret) {
    return json({
      service: "DoorDash Marketplace Auth",
      configured,
      jwtGenerated: false
    }, 503);
  }

  try {
    const jwt = await createDoorDashJwt(env);
    return json({
      service: "DoorDash Marketplace Auth",
      configured,
      jwtGenerated: jwt.split(".").length === 3,
      expiresInSeconds: 300,
      apiRoot: "https://openapi.doordash.com/marketplace/"
    });
  } catch (error) {
    return json({
      service: "DoorDash Marketplace Auth",
      configured,
      jwtGenerated: false,
      error: String(error?.message || error)
    }, 500);
  }
}

async function handleDoorDashApiTest(request, env) {
  if (request.method !== "GET") {
    return json({ error: "Method not allowed" }, 405);
  }

  if (String(env.DOORDASH_API_PROBE_ENABLED || "").toLowerCase() !== "true") {
    return json({
      service: "DoorDash Marketplace API Probe",
      enabled: false,
      message: "Probe is disabled"
    }, 503);
  }

  try {
    const jwt = await createDoorDashJwt(env);
    const response = await fetch(
      "https://openapi.doordash.com/marketplace/api/v1/stores/__courier_eats_auth_probe__/store_details",
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${jwt}`,
          "auth-version": "v2",
          "User-Agent": String(
            env.DOORDASH_PROVIDER_USER_AGENT || "CourierEatsSandbox/1.0"
          )
        }
      }
    );

    let providerMessage = null;
    try {
      const body = await response.json();
      providerMessage =
        body?.message ||
        body?.error ||
        body?.detail ||
        body?.code ||
        null;
    } catch {
      providerMessage = null;
    }

    return json({
      service: "DoorDash Marketplace API Probe",
      enabled: true,
      doorDashStatus: response.status,
      authenticated: response.status !== 401,
      accessGranted: ![401, 403].includes(response.status),
      interpretation:
        response.status === 401
          ? "DoorDash rejected the JWT"
          : response.status === 403
            ? "DoorDash accepted authentication but denied this resource"
            : response.status === 404
              ? "DoorDash accepted the request; the probe store does not exist"
              : response.ok
                ? "DoorDash accepted the request"
                : "DoorDash returned a non-authentication response",
      providerMessage
    }, response.status >= 500 ? 502 : 200);
  } catch (error) {
    return json({
      service: "DoorDash Marketplace API Probe",
      enabled: true,
      authenticated: false,
      error: String(error?.message || error)
    }, 502);
  }
}

export async function createDoorDashJwt(env) {
  const developerId = String(env.DOORDASH_DEVELOPER_ID || "").trim();
  const keyId = String(env.DOORDASH_KEY_ID || "").trim();
  const signingSecret = String(env.DOORDASH_SIGNING_SECRET || "").trim();

  if (!developerId || !keyId || !signingSecret) {
    throw new Error("DoorDash Marketplace credentials are incomplete");
  }

  const now = Math.floor(Date.now() / 1000);
  const header = {
    alg: "HS256",
    typ: "JWT",
    "dd-ver": "DD-JWT-V1"
  };
  const payload = {
    aud: "doordash",
    iss: developerId,
    kid: keyId,
    iat: now,
    exp: now + 300
  };

  const encodedHeader = base64UrlEncodeUtf8(JSON.stringify(header));
  const encodedPayload = base64UrlEncodeUtf8(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  const keyBytes = decodeBase64Url(signingSecret);
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "HMAC",
    cryptoKey,
    new TextEncoder().encode(signingInput)
  );

  return `${signingInput}.${base64UrlEncodeBytes(new Uint8Array(signature))}`;
}

function decodeBase64Url(value) {
  let normalized = String(value).replace(/-/g, "+").replace(/_/g, "/");
  while (normalized.length % 4) normalized += "=";
  const binary = atob(normalized);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function base64UrlEncodeUtf8(value) {
  return base64UrlEncodeBytes(new TextEncoder().encode(value));
}

function base64UrlEncodeBytes(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}
