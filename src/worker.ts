import { auditCatalog, buildSafeFixes, type CatalogObject } from "../catalog/auto-fix";

type Env = {
  SQUARE_ACCESS_TOKEN: string;
  ADMIN_API_KEY: string;
  CATALOG_AUTO_FIX_ENABLED?: string;
};

const SQUARE_VERSION = "2026-08-19";
const TYPES = "ITEM,ITEM_VARIATION,CATEGORY,MODIFIER_LIST,MODIFIER,IMAGE";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function authorized(request: Request, env: Env): boolean {
  const auth = request.headers.get("authorization") ?? "";
  return auth === `Bearer ${env.ADMIN_API_KEY}`;
}

async function squareGet(env: Env, url: URL): Promise<Response> {
  return fetch(url, {
    headers: {
      Authorization: `Bearer ${env.SQUARE_ACCESS_TOKEN}`,
      "Square-Version": SQUARE_VERSION,
      "Content-Type": "application/json",
    },
  });
}

async function listCatalog(env: Env): Promise<CatalogObject[]> {
  const objects: CatalogObject[] = [];
  let cursor: string | undefined;

  do {
    const url = new URL("https://connect.squareup.com/v2/catalog/list");
    url.searchParams.set("types", TYPES);
    if (cursor) url.searchParams.set("cursor", cursor);

    const response = await squareGet(env, url);
    if (!response.ok) {
      const details = await response.text();
      throw new Error(`Square catalog request failed (${response.status}): ${details}`);
    }

    const data = (await response.json()) as {
      objects?: CatalogObject[];
      cursor?: string;
    };

    objects.push(...(data.objects ?? []));
    cursor = data.cursor || undefined;
  } while (cursor);

  return objects;
}

async function handleCatalog(request: Request, env: Env): Promise<Response> {
  if (!authorized(request, env)) {
    return json({ error: "Unauthorized" }, 401);
  }

  const { pathname } = new URL(request.url);

  if (pathname === "/api/catalog/audit") {
    const objects = await listCatalog(env);
    return json(auditCatalog(objects));
  }

  if (pathname === "/api/catalog/preview-fix") {
    const objects = await listCatalog(env);
    const report = auditCatalog(objects);
    const fixes = buildSafeFixes(objects, report);
    return json({ mode: "preview", report, proposed: fixes });
  }

  if (pathname === "/api/catalog/verify") {
    const objects = await listCatalog(env);
    const report = auditCatalog(objects);
    return json({ verified: true, report });
  }

  if (pathname === "/api/catalog/auto-fix") {
    if (request.method !== "POST") {
      return json({ error: "Method not allowed" }, 405);
    }

    if (env.CATALOG_AUTO_FIX_ENABLED !== "true") {
      return json(
        {
          error: "Catalog auto-fix is disabled",
          next_step: "Test audit and preview first, then set CATALOG_AUTO_FIX_ENABLED=true in Cloudflare Variables.",
        },
        403,
      );
    }

    const objects = await listCatalog(env);
    const report = auditCatalog(objects);
    const fixes = buildSafeFixes(objects, report);

    return json({
      mode: "safe-auto-fix",
      applied: [],
      proposed: fixes,
      report,
      message: "No destructive catalog changes were applied. Safe write rules have not been enabled yet.",
    });
  }

  return json({ error: "Not found" }, 404);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    try {
      if (url.pathname === "/" || url.pathname === "/api/health") {
        return json({
          ok: true,
          service: "Courier Eats Sync",
          platform: "Cloudflare Workers",
          square_api_version: SQUARE_VERSION,
        });
      }

      if (url.pathname.startsWith("/api/catalog/")) {
        return await handleCatalog(request, env);
      }

      return json({ error: "Not found" }, 404);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unexpected error";
      return json({ error: message }, 500);
    }
  },
};
