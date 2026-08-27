# Courier Eats Square Catalog Auto-Fix

This module starts in **audit mode**. It detects catalog integrity problems without changing the live Square catalog.

## Workflow

1. `searchCatalogObjects` retrieves ITEM, ITEM_VARIATION, CATEGORY and MODIFIER_LIST objects.
2. `auditCatalog()` reports missing names, missing variations, missing fixed prices, and duplicate active item names.
3. Only deterministic, non-destructive fixes may be added to `buildSafeFixes()`.
4. Before any write, snapshot the affected objects and validate the complete object payload.
5. Use Square `batch-upsert` with a unique idempotency key.
6. Re-read the affected objects and compare them with the intended result.

## Safety rules

- Never invent a price.
- Never invent a tax.
- Never invent a modifier price.
- Never silently rename a restaurant item.
- Never delete duplicates automatically.
- Never overwrite an object without first retrieving its complete current representation.
- Keep the Square access token server-side only.
- Require explicit approval for destructive or ambiguous changes.
