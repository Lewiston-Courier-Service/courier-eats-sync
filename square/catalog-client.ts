const SQUARE_API = "https://connect.squareup.com/v2";

type SquareResponse<T> = T & { errors?: Array<{ category?: string; code?: string; detail?: string }> };

export async function searchCatalogObjects(accessToken: string, objectTypes: string[] = ["ITEM", "ITEM_VARIATION", "CATEGORY", "MODIFIER_LIST"], locationIds?: string[]) {
  const response = await fetch(`${SQUARE_API}/catalog/search`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "Square-Version": process.env.SQUARE_VERSION ?? "2026-01-22",
    },
    body: JSON.stringify({ object_types: objectTypes, ...(locationIds?.length ? { location_ids: locationIds } : {}) }),
  });
  if (!response.ok) throw new Error(`Square catalog search failed: ${response.status}`);
  return response.json() as Promise<SquareResponse<{ objects?: unknown[]; cursor?: string }>>;
}

export async function batchUpsertCatalogObjects(accessToken: string, idempotencyKey: string, batches: unknown[]) {
  if (batches.length > 10000) throw new Error("Square batch upsert is limited to 10,000 objects per request.");
  const response = await fetch(`${SQUARE_API}/catalog/batch-upsert`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "Square-Version": process.env.SQUARE_VERSION ?? "2026-01-22",
    },
    body: JSON.stringify({ idempotency_key: idempotencyKey, batches: [{ objects: batches }] }),
  });
  if (!response.ok) throw new Error(`Square catalog upsert failed: ${response.status}`);
  return response.json() as Promise<SquareResponse<Record<string, unknown>>>;
}
