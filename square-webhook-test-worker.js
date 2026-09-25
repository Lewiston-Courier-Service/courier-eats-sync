const WEBHOOK_PATH = "/api/webhooks/square-sandbox";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/health" && request.method === "GET") {
      return json({
        ok: true,
        service: "Courier Eats Square Sandbox Webhook Test",
        webhookPath: WEBHOOK_PATH
      });
    }

    if (url.pathname !== WEBHOOK_PATH) {
      return json({ error: "Not found" }, 404);
    }

    if (request.method !== "POST") {
      return json({ error: "Method not allowed" }, 405);
    }

    const rawBody = await request.text();

    if (!env.SQUARE_WEBHOOK_TEST_SIGNATURE_KEY) {
      return json({
        received: true,
        setupMode: true,
        signatureValid: false,
        message:
          "Webhook endpoint is reachable. Configure the Square subscription signature key, then send another test event."
      });
    }
    const signature =
      request.headers.get("x-square-hmacsha256-signature") || "";
    const notificationUrl =
      env.SQUARE_WEBHOOK_TEST_NOTIFICATION_URL ||
      `${url.origin}${url.pathname}`;

    const valid = await verifySquareSignature({
      rawBody,
      signature,
      signatureKey: env.SQUARE_WEBHOOK_TEST_SIGNATURE_KEY,
      notificationUrl
    });

    if (!valid) {
      return json({ error: "Invalid Square webhook signature" }, 403);
    }

    let event;
    try {
      event = JSON.parse(rawBody);
    } catch {
      return json({ error: "Invalid JSON webhook body" }, 400);
    }

    return json({
      received: true,
      signatureValid: true,
      squareEnvironment:
        request.headers.get("square-environment") || null,
      retryNumber:
        request.headers.get("square-retry-number") || null,
      eventId: event.event_id || null,
      eventType: event.type || null,
      merchantId: event.merchant_id || null,
      createdAt: event.created_at || null
    });
  }
};

async function verifySquareSignature({
  rawBody,
  signature,
  signatureKey,
  notificationUrl
}) {
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

  return crypto.subtle.verify(
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
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  } catch {
    return null;
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}
