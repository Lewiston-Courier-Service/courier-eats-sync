# Local Breakfast Square Import

This directory holds verified local restaurant breakfast menu manifests for Courier Eats.

## Safety

- Default mode is dry-run.
- Sandbox writes require both `SQUARE_ENVIRONMENT=sandbox` and `ALLOW_CATALOG_WRITE=true`.
- A target Square location ID must be explicitly set in the restaurant manifest.
- No production endpoint is used by this importer.
- Items without a verified current price are excluded.
- Existing catalog objects are not overwritten by this initial importer.

## Dry run

```bash
node catalog/local-menu-import.js catalog/local-breakfast/italian-bakery.json --dry-run
```

## Sandbox apply

After confirming the target Square location ID in the manifest:

```bash
set SQUARE_ENVIRONMENT=sandbox
set ALLOW_CATALOG_WRITE=true
set SQUARE_ACCESS_TOKEN=YOUR_SANDBOX_TOKEN
node catalog/local-menu-import.js catalog/local-breakfast/italian-bakery.json --apply-sandbox
```

Production remains intentionally unsupported.
