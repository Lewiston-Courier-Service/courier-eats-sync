const SANDBOX_WEBHOOK_ROUTE = "/api/webhooks/square-restaurants-sandbox";

export async function handleSquareSandboxWebhook(request, env) {
  const url = new URL(request.url);

  if (url.pathname !== SANDBOX_WEBHOOK_ROUTE) {
    return null;
  }

  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders()
    });
  }

  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  if (!env.SQUARE_RESTAURANT_WEBHOOK_SANDBOX_SIGNATURE_KEY) {
    return json(
      { error: "Square sandbox restaurant webhook signature key is not configured" },
      503
    );
  }

  const signature = request.headers.get("x-square-hmacsha256-signature") || "";
  const rawBody = await request.text();
  const notificationUrl = `${url.origin}${url.pathname}`;

  const validSignature = await verifySquareSignature({
    rawBody,
    signature,
    signatureKey: env.SQUARE_RESTAURANT_WEBHOOK_SANDBOX_SIGNATURE_KEY,
    notificationUrl
  });

  if (!validSignature) {
    return json({ error: "Invalid Square sandbox webhook signature" }, 403);
  }

  let event;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return json({ error: "Invalid JSON webhook body" }, 400);
  }

  return json({
    received: true,
    sandbox: true,
    eventId: event.event_id || null,
    eventType: event.type || "",
    merchantId: event.merchant_id || null
  });
}

async function verifySquareSignature({ rawBody, signature, signatureKey, notificationUrl }) {
  if (!signature || !signatureKey || !notificationUrl) return false;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(signatureKey),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );

  const signatureBytes = base64ToBytes(signature);
  if (!signatureBytes) return false;

  return await crypto.subtle.verify(
    "HMAC",
    key,
    signatureBytes,
    encoder.encode(notificationUrl + rawBody)
  );
}

function base64ToBytes(value) {
  try {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Admin-Key, X-Square-HmacSha256-Signature",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS"
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...corsHeaders()
    }
  });
}
