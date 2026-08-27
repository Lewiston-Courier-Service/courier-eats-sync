export type CatalogObject = {
  id: string;
  type: string;
  is_deleted?: boolean;
  version?: number;
  updated_at?: string;
  present_at_all_locations?: boolean;
  present_at_location_ids?: string[];
  item_data?: {
    name?: string;
    description?: string;
    description_html?: string;
    category_id?: string;
    categories?: Array<{ id?: string }>;
    variations?: CatalogObject[];
    modifier_list_info?: Array<{ modifier_list_id?: string; enabled?: boolean }>;
  };
  item_variation_data?: {
    item_id?: string;
    name?: string;
    price_money?: { amount?: number; currency?: string };
    pricing_type?: string;
  };
  category_data?: { name?: string };
  modifier_list_data?: { name?: string; modifiers?: CatalogObject[] };
};

export type CatalogIssue = {
  code: string;
  severity: "info" | "warning" | "error";
  objectId: string;
  objectType: string;
  message: string;
  fixable: boolean;
};

export type CatalogFix = {
  issue: CatalogIssue;
  object: CatalogObject;
  reason: string;
};

export type AuditReport = {
  scanned: number;
  issues: CatalogIssue[];
  safeFixes: CatalogFix[];
};

const normalize = (value?: string) => (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");

export function auditCatalog(objects: CatalogObject[]): AuditReport {
  const issues: CatalogIssue[] = [];
  const safeFixes: CatalogFix[] = [];
  const names = new Map<string, CatalogObject[]>();

  for (const object of objects) {
    if (object.is_deleted) continue;

    if (object.type === "ITEM") {
      const name = normalize(object.item_data?.name);
      if (!name) {
        issues.push({ code: "ITEM_MISSING_NAME", severity: "error", objectId: object.id, objectType: object.type, message: "Item has no name.", fixable: false });
      }

      const variations = object.item_data?.variations ?? [];
      if (variations.length === 0) {
        issues.push({ code: "ITEM_NO_VARIATION", severity: "error", objectId: object.id, objectType: object.type, message: "Item has no item variation.", fixable: false });
      }

      if (name) names.set(name, [...(names.get(name) ?? []), object]);
    }

    if (object.type === "ITEM_VARIATION") {
      if (!normalize(object.item_variation_data?.name)) {
        issues.push({ code: "VARIATION_MISSING_NAME", severity: "error", objectId: object.id, objectType: object.type, message: "Item variation has no name.", fixable: false });
      }
      if (!object.item_variation_data?.price_money && object.item_variation_data?.pricing_type !== "VARIABLE_PRICING") {
        issues.push({ code: "VARIATION_MISSING_PRICE", severity: "warning", objectId: object.id, objectType: object.type, message: "Fixed-price variation has no price.", fixable: false });
      }
    }
  }

  for (const [name, matches] of names) {
    if (matches.length > 1) {
      for (const object of matches) {
        issues.push({ code: "DUPLICATE_ITEM_NAME", severity: "warning", objectId: object.id, objectType: object.type, message: `Duplicate active item name: ${name}`, fixable: false });
      }
    }
  }

  return { scanned: objects.length, issues, safeFixes };
}

/**
 * Only deterministic, non-destructive fixes belong here.
 * Prices, taxes, categories, modifiers, and names are intentionally NOT invented.
 */
export function buildSafeFixes(_objects: CatalogObject[], report: AuditReport): CatalogFix[] {
  return report.safeFixes;
}
