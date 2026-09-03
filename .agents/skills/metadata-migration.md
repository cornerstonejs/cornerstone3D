---
name: metadata-migration
description: Migrate codebases from legacy CS3D metadata flows to the metadata branch model with required init/provider updates and recommended provider/cache/imageId changes.
---

# Metadata Migration Skill (`origin/main` -> `metadata`)

Use this skill to migrate codebases from the legacy CS3D metadata flow in
`origin/main` to the `metadata` branch model.

## Mandated changes

1. Add the metadata module.
2. Re-add required providers after each CS3D init call.

### Required checklist

- Add and initialize the metadata module in bootstrap/startup.
- Ensure provider registration runs after CS3D init.
- Re-register all providers needed by your workflows after init.
- Confirm provider priority/ordering where providers overlap.

## Recommended changes

1. Use metadata module imports instead of legacy import paths.
2. Switch to new metadata providers and deprecate old providers.
3. Adopt the new caching model.
4. Adopt the `imageId` / `frameImageId` storage model.

## Compatibility notes

- Some providers are not yet available in both old and new schemes.
- Do not block migration on full parity.
- Keep temporary fallback providers only where required.
- Track and remove fallbacks as equivalent providers become available.

## Suggested migration sequence

1. Add metadata module and initialize it.
2. Move provider registration to post-init and re-add required providers.
3. Validate key metadata workflows and provider lookups.
4. Replace old imports with metadata module imports.
5. Migrate providers to new implementations where available.
6. Incrementally adopt new cache and `imageId`/`frameImageId` storage.
