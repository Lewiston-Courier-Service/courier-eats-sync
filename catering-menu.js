export async function addCateringMenuCategory(request, response) {
  const url = new URL(request.url);

  if (url.pathname !== "/api/menu" || request.method !== "GET") {
    return response;
  }

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return response;
  }

  let data;
  try {
    data = await response.clone().json();
  } catch {
    return response;
  }

  if (!response.ok || !data || !Array.isArray(data.items)) {
    return response;
  }

  const categories = Array.isArray(data.categories) ? [...data.categories] : [];
  if (!categories.includes("Catering")) {
    categories.push("Catering");
  }

  const items = data.items.map(item => {
    const squareCategories = Array.isArray(item.squareCategories)
      ? item.squareCategories
      : [];
    const text = `${item.name || ""} ${item.description || ""} ${squareCategories.join(" ")}`.toLowerCase();

    if (/catering|catered|party\s*(tray|platter|pack)|event\s*(tray|platter|pack)|family\s*(tray|platter|pack)|large\s*party|banquet/.test(text)) {
      return { ...item, courierCategory: "Catering" };
    }

    return item;
  });

  const headers = new Headers(response.headers);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Cache-Control", "no-store");

  return new Response(
    JSON.stringify({ ...data, categories, items }, null, 2),
    {
      status: response.status,
      statusText: response.statusText,
      headers
    }
  );
}
