import { auditCatalog, CatalogObject } from "../../catalog/auto-fix";

export default async function handler(req: any, res: any) {
  if (req.method !== "GET" && req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const token = process.env.SQUARE_ACCESS_TOKEN;
  if (!token) return res.status(500).json({ error: "SQUARE_ACCESS_TOKEN is not configured" });

  const response = await fetch("https://connect.squareup.com/v2/catalog/list?types=ITEM,ITEM_VARIATION,CATEGORY,MODIFIER_LIST,MODIFIER", {
    headers: { Authorization: `Bearer ${token}`, "Square-Version": "2026-01-22", "Content-Type": "application/json" }
  });
  if (!response.ok) return res.status(response.status).json({ error: "Square verification request failed", details: await response.text() });
  const data = await response.json();
  const report = auditCatalog((data.objects ?? []) as CatalogObject[]);
  return res.status(200).json({ verified: true, report });
}
