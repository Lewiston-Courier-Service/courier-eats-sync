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

function ext(file, fallback) {
  const m = String(file?.name || "").match(/\.([A-Za-z0-9]{1,8})$/);
  return m ? m[1].toLowerCase() : fallback;
}

export async function handleDriverPod(request, env) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/driver/")) return null;

  const parts = url.pathname.split("/").filter(Boolean);
  const isPod =
    parts.length === 6 &&
    parts[0] === "api" &&
    parts[1] === "driver" &&
    parts[3] === "jobs" &&
    parts[5] === "pod";

  if (!isPod) return null;
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!env.DISPATCH_DB) return json({ error: "Dispatch database unavailable" }, 500);
  if (!env.LCS_TMS_POD) return json({ error: "POD storage unavailable" }, 500);

  const token = decodeURIComponent(parts[2]);
  const driverId = await verifyDriverToken(token, env);
  if (!driverId) return json({ error: "Invalid driver access link" }, 401);

  const orderId = Number(parts[4]);
  if (!Number.isInteger(orderId) || orderId < 1) {
    return json({ error: "Invalid dispatch order" }, 400);
  }

  const driver = await env.DISPATCH_DB
    .prepare("SELECT id,name,status FROM drivers WHERE id=?")
    .bind(driverId)
    .first();
  if (!driver) return json({ error: "Driver not found" }, 404);

  const order = await env.DISPATCH_DB
    .prepare("SELECT id,status,assigned_driver_id FROM dispatch_orders WHERE id=?")
    .bind(orderId)
    .first();

  if (!order) return json({ error: "Dispatch order not found" }, 404);
  if (Number(order.assigned_driver_id) !== Number(driverId)) {
    return json({ error: "Dispatch is not assigned to this driver" }, 403);
  }

  let form;
  try {
    form = await request.formData();
  } catch {
    return json({ error: "Expected multipart/form-data" }, 400);
  }

  const recipientName = String(form.get("recipient_name") || "").trim().slice(0, 160);
  const deliveryNote = String(form.get("delivery_note") || "").trim().slice(0, 2000);
  const photo = form.get("photo");
  const signature = form.get("signature");

  if (!recipientName) return json({ error: "Recipient name is required" }, 400);
  if (!(photo instanceof File) || photo.size < 1) return json({ error: "Delivery photo is required" }, 400);
  if (!(signature instanceof File) || signature.size < 1) return json({ error: "Signature is required" }, 400);
  if (photo.size > 10 * 1024 * 1024) return json({ error: "Delivery photo is too large (10 MB max)" }, 413);
  if (signature.size > 3 * 1024 * 1024) return json({ error: "Signature is too large (3 MB max)" }, 413);

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const prefix = `orders/${orderId}/${stamp}`;
  const photoKey = `${prefix}-photo.${ext(photo, "jpg")}`;
  const signatureKey = `${prefix}-signature.${ext(signature, "png")}`;

  try {
    await env.LCS_TMS_POD.put(photoKey, photo.stream(), {
      httpMetadata: { contentType: photo.type || "application/octet-stream" }
    });
    await env.LCS_TMS_POD.put(signatureKey, signature.stream(), {
      httpMetadata: { contentType: signature.type || "application/octet-stream" }
    });
  } catch (error) {
    console.error("POD R2 upload failed:", error);
    return json({ error: "Could not save POD files" }, 500);
  }

  const deliveredAt = new Date().toISOString();

  try {
    await env.DISPATCH_DB.batch([
      env.DISPATCH_DB.prepare(`
        INSERT INTO proof_of_delivery
          (order_id,recipient_name,delivery_note,photo_key,signature_key,delivered_at)
        VALUES (?,?,?,?,?,?)
        ON CONFLICT(order_id) DO UPDATE SET
          recipient_name=excluded.recipient_name,
          delivery_note=excluded.delivery_note,
          photo_key=excluded.photo_key,
          signature_key=excluded.signature_key,
          delivered_at=excluded.delivered_at
      `).bind(orderId, recipientName, deliveryNote || null, photoKey, signatureKey, deliveredAt),
      env.DISPATCH_DB.prepare("UPDATE dispatch_orders SET status='DELIVERED',updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(orderId),
      env.DISPATCH_DB.prepare("INSERT INTO dispatch_events (order_id,status,note) VALUES (?,?,?)").bind(
        orderId, "DELIVERED", `POD completed by driver ${driver.name}`
      ),
      env.DISPATCH_DB.prepare("UPDATE drivers SET status='AVAILABLE' WHERE id=?").bind(driverId)
    ]);
  } catch (error) {
    console.error("POD database save failed:", error);
    return json({ error: "POD files saved but database update failed" }, 500);
  }

  return json({
    success: true,
    service: "LCS Driver POD",
    dispatchOrderId: orderId,
    status: "DELIVERED",
    recipientName,
    deliveredAt,
    photoSaved: true,
    signatureSaved: true
  });
}
