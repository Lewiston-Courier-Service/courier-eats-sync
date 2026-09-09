import { verifyTrackingToken } from "./tracking-token.js";

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}

export async function handlePublicTracking(request, env) {
  const url = new URL(request.url);

  if (!url.pathname.startsWith("/api/track/")) return null;
  if (request.method !== "GET") return json({ error: "Method not allowed" }, 405);
  if (!env.DISPATCH_DB) return json({ error: "Tracking database unavailable" }, 500);

  const token = decodeURIComponent(url.pathname.slice("/api/track/".length));
  const orderId = await verifyTrackingToken(token, env);

  if (!orderId) {
    return json({ error: "Invalid or expired tracking link" }, 404);
  }

  const order = await env.DISPATCH_DB
    .prepare(`
      SELECT
        o.id,
        o.source,
        o.restaurant_name,
        o.status,
        o.pickup_timing,
        o.requested_pickup_at,
        o.created_at,
        o.updated_at,
        d.name AS driver_name
      FROM dispatch_orders o
      LEFT JOIN drivers d ON d.id = o.assigned_driver_id
      WHERE o.id = ?
    `)
    .bind(orderId)
    .first();

  if (!order) return json({ error: "Dispatch not found" }, 404);

  const events = await env.DISPATCH_DB
    .prepare(`
      SELECT status, created_at
      FROM dispatch_events
      WHERE order_id = ?
      ORDER BY id ASC
    `)
    .bind(orderId)
    .all();

  return json({
    success: true,
    service: "Lewiston Courier Tracking",
    dispatch: {
      id: order.id,
      source: order.source,
      storeOrRestaurant: order.restaurant_name,
      status: order.status,
      pickupTiming: order.pickup_timing || "ASAP",
      requestedPickupAt: order.requested_pickup_at,
      driverName: order.driver_name || null,
      createdAt: order.created_at,
      updatedAt: order.updated_at
    },
    timeline: (events.results || []).map(e => ({
      status: e.status,
      at: e.created_at
    }))
  });
}
