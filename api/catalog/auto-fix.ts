import { auditCatalog, buildSafeFixes, CatalogObject } from "../../catalog/auto-fix";

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const token = process.env.SQUARE_ACCESS_TOKEN;
  if (!token) return res.status(500).json({ error: "SQUARE_ACCESS_TOKEN is not configured" });
  if (process.env.CATALOG_AUTO_FIX_ENABLED !== "true") {
    return res.status(403).json({ error: "Catalog auto-fix is disabled. Set CATALOG_AUTO_FIX_ENABLED=true after testing audit mode." });
  }

  const list = await fetch("https://connect.squareup.com/v2/catalog/list?types=ITEM,ITEM_VARIATION,CATEGORY,MODIFIER_LIST,MODIFIER", {
    headers: { Authorization: `Bearer ${token}`, "Square-Version": "2026-01-22", "Content-Type": "application/json" }
  });
  if (!list.ok) return res.status(list.status).json({ error: "Square catalog request failed", details: await list.text() });

  const data = await list.json();
  const objects = (data.objects ?? []) as CatalogObject[];
  const report = auditCatalog(objects);
  const fixes = buildSafeFixes(objects, report);

  // Current rules intentionally produce no destructive writes. This endpoint
  // proves the production gate and returns the validated repair plan.
  return res.status(200).json({
    mode: "safe-auto-fix",
    applied: [],
    proposed: fixes,
    report,
    message: "No destructive catalog changes were applied."
  });
}
