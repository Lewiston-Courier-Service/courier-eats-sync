import { verifyDriverToken } from "./driver-token.js";

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}

const DRIVER_STATUSES = new Set([
  "EN_ROUTE_TO_PICKUP",
  "PICKED_UP",
  "EN_ROUTE_TO_CUSTOMER",
  "DELIVERED"
]);

export async function handleDriverApp(request, env) {
  const url = new URL(request.url);

  if (!url.pathname.startsWith("/api/driver/")) return null;
  if (!env.DISPATCH_DB) return json({ error: "Dispatch database unavailable" }, 500);

  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length < 3) return json({ error: "Invalid driver route" }, 404);

  const token = decodeURIComponent(parts[2]);
  const driverId = await verifyDriverToken(token, env);
  if (!driverId) return json({ error: "Invalid driver access link" }, 401);

  const driver = await env.DISPATCH_DB
    .prepare("SELECT id,name,phone,status FROM drivers WHERE id=?")
    .bind(driverId)
    .first();

  if (!driver) return json({ error: "Driver not found" }, 404);

  if (parts.length === 4 && parts[3] === "jobs" && request.method === "GET") {
    const result = await env.DISPATCH_DB
      .prepare(`
        SELECT
          id,
          source,
          restaurant_name,
          customer_name,
          customer_phone,
          pickup_address,
          delivery_address,
          status,
          pickup_timing,
          requested_pickup_at,
          created_at,
          updated_at
        FROM dispatch_orders
        WHERE assigned_driver_id = ?
          AND status NOT IN ('DELIVERED','CANCELLED')
        ORDER BY
          CASE WHEN pickup_timing='SCHEDULED' AND requested_pickup_at IS NOT NULL THEN 0 ELSE 1 END,
          requested_pickup_at,
          id DESC
      `)
      .bind(driverId)
      .all();

    return json({
      success: true,
      service: "LCS Driver",
      driver,
      jobs: result.results || []
    });
  }

  if (
    parts.length === 6 &&
    parts[3] === "jobs" &&
    parts[5] === "status" &&
    (request.method === "PATCH" || request.method === "POST")
  ) {
    const orderId = Number(parts[4]);
    if (!Number.isInteger(orderId) || orderId < 1) {
      return json({ error: "Invalid dispatch order" }, 400);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "Invalid JSON body" }, 400);
    }

    const status = String(body.status || "").trim().toUpperCase();
    if (!DRIVER_STATUSES.has(status)) {
      return json({
        error: "Driver cannot set that status",
        allowedStatuses: [...DRIVER_STATUSES]
      }, 400);
    }

    const order = await env.DISPATCH_DB
      .prepare(`
        SELECT id,status,assigned_driver_id
        FROM dispatch_orders
        WHERE id=?
      `)
      .bind(orderId)
      .first();

    if (!order || Number(order.assigned_driver_id) !== driverId) {
      return json({ error: "Dispatch is not assigned to this driver" }, 403);
    }

    if (order.status === status) {
      return json({
        success: true,
        duplicate: true,
        dispatchOrderId: orderId,
        status
      });
    }

    await env.DISPATCH_DB
      .prepare(`
        UPDATE dispatch_orders
        SET status=?,updated_at=CURRENT_TIMESTAMP
        WHERE id=?
      `)
      .bind(status, orderId)
      .run();

    await env.DISPATCH_DB
      .prepare(`
        INSERT INTO dispatch_events (order_id,status,note)
        VALUES (?,?,?)
      `)
      .bind(orderId, status, `Driver ${driver.name} updated status to ${status}`)
      .run();

    if (status === "DELIVERED") {
      await env.DISPATCH_DB
        .prepare("UPDATE drivers SET status='AVAILABLE' WHERE id=?")
        .bind(driverId)
        .run();
    } else {
      await env.DISPATCH_DB
        .prepare("UPDATE drivers SET status='BUSY' WHERE id=?")
        .bind(driverId)
        .run();
    }

    return json({
      success: true,
      service: "LCS Driver",
      dispatchOrderId: orderId,
      previousStatus: order.status,
      status
    });
  }

  return json({ error: "Driver route not found" }, 404);
}
