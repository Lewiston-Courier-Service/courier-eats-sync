export async function handleShipdayAuth(request, env) {
  const url = new URL(request.url);

  if (url.pathname === "/api/dispatch/shipday/auth-status") {
    if (request.method !== "GET") {
      return json({ error: "Method not allowed" }, 405);
    }

    return json({
      service: "Shipday Auth",
      configured: Boolean(env.SHIPDAY_API_KEY),
      apiRoot: "https://api.shipday.com/"
    });
  }

  if (url.pathname === "/api/dispatch/shipday/api-test") {
    return handleShipdayApiTest(request, env);
  }

  return null;
}

async function handleShipdayApiTest(request, env) {
  if (request.method !== "GET") {
    return json({ error: "Method not allowed" }, 405);
  }

  if (!env.SHIPDAY_API_KEY) {
    return json({
      service: "Shipday API Probe",
      configured: false,
      authenticated: false,
      message: "SHIPDAY_API_KEY is not configured"
    }, 503);
  }

  if (String(env.SHIPDAY_API_PROBE_ENABLED || "").toLowerCase() !== "true") {
    return json({
      service: "Shipday API Probe",
      configured: true,
      enabled: false,
      message: "Probe is disabled"
    }, 503);
  }

  try {
    const response = await fetch("https://api.shipday.com/carriers", {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Basic ${String(env.SHIPDAY_API_KEY).trim()}`
      }
    });

    let carrierCount = null;
    let providerMessage = null;

    try {
      const body = await response.json();
      if (Array.isArray(body)) {
        carrierCount = body.length;
      } else {
        providerMessage =
          body?.message ||
          body?.error ||
          body?.detail ||
          null;
      }
    } catch {
      providerMessage = null;
    }

    return json({
      service: "Shipday API Probe",
      configured: true,
      enabled: true,
      shipdayStatus: response.status,
      authenticated: response.status !== 401,
      accessGranted: ![401, 403].includes(response.status),
      carrierCount,
      providerMessage
    }, response.status >= 500 ? 502 : 200);
  } catch (error) {
    return json({
      service: "Shipday API Probe",
      configured: true,
      enabled: true,
      authenticated: false,
      error: String(error?.message || error)
    }, 502);
  }
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
