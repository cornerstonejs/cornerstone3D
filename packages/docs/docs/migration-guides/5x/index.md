---
id: index
title: 5.0 Migration Guides
---

import DocCardList from '@theme/DocCardList';
import {useCurrentSidebarCategory} from '@docusaurus/theme-common';

# 5.0 Migration Guides

Here you can find migration notes for moving from Cornerstone3D 4.x to 5.x.

# Metadata Module

In 5.x, the metadata module is designed as a shared handling layer for viewer metadata concerns, so core behavior is implemented once and reused rather than replicated across DICOMweb-specific code, OHIF-specific flows, JSON ingestion paths, and other module-specific integrations (which often resulted in multiple implementations with differing bugs).

### Optional metadata module features in current CS3D

The current CS3D version keeps existing metadata flows working, and also introduces optional features you can adopt incrementally:

- Typed getters for metadata lookup.
- Providers that register directly for a specific single metadata type, so resolution can short-circuit quickly.
- Shared caches used across metadata providers and metadata types.
- Shared cache usage for Part10, DICOMweb, imageId-derived values, and other cached metadata outputs.
- Provision for new metadata types such as display set, series-level, and study-level results.

## Metadata provider caching updates

In 5.x, metadata providers are first-class extension points in the retrieval pipeline. Instead of each caller manually transforming and writing metadata, providers can normalize source payloads, compose with other providers, and rely on shared cache behavior for consistent lookups.

- Prefer option-driven metadata retrieval over manual cache writes for NATURALIZED values.
- Use `metaData.get(MetadataModules.NATURALIZED, imageId, { metadata })` for DICOMweb JSON payloads.
- Use `metaData.get('asyncNaturalized', imageId, { part10 })` for async Part10 ingestion (`ArrayBuffer`, `Uint8Array`, or resolver function).
- The metadata layer now owns frame/base imageId mapping and derived cache invalidation; avoid direct frame propagation with `setCacheData`.

### New metadata handling (and backwards compatibility)

- In 5.x, **NATURALIZED metadata is the base state for DICOM imaging data**. Other metadata modules (for example `INSTANCE` and derived module lookups) are expected to resolve from that canonical naturalized state rather than from source-specific conversion code.
- Data sources should migrate to providing metadata through naturalized handlers (`{ metadata }` and `{ part10 }`) instead of performing custom source-local conversion to instance/natural objects.
- New in 5.x: metadata ingestion is handled through typed-provider requests, so callers can pass source data as options (`{ metadata }` or `{ part10 }`) and let the provider chain naturalize/cache it.
- Existing usage still works: if your app already resolves metadata through the legacy provider chain (`addProvider` / prior `metaData.get(...)` flow), that behavior remains supported while you migrate.
- Recommended migration path: move NATURALIZED writes to option-driven `metaData.get(...)` calls and remove custom frame/base propagation logic from app code.
- Why this matters: shared naturalization creates consistent behavior across DICOMweb, Part10, and other ingest paths, and helps eliminate recurring bugs caused by multiple, slightly different conversion implementations.

### Naturalized handlers

`registerNaturalizedHandlers()` now registers the NATURALIZED handlers as a composable provider chain:

- **Base imageId query filter:** a shared `baseImageIdQueryFilter` can be plugged into typed provider chains and is registered for `NATURALIZED` at high priority so frame-specific imageIds resolve on canonical base imageId first.
- **Synchronous naturalization handler:** when callers provide `{ metadata }`, the handler naturalizes DICOMweb-style metadata into NATURALIZED output.
- **Asynchronous Part10 handler:** `asyncNaturalized` accepts `{ part10 }` (`ArrayBuffer`, `Uint8Array`, or resolver function), de-duplicates in-flight work, and stores the resolved NATURALIZED result.
- **Cache interaction:** with base-image filtering ahead of cache providers, NATURALIZED cache keys remain canonical and downstream typed modules can rely on consistent lookups.

Recommended usage:

- `metaData.get(MetadataModules.NATURALIZED, imageId, { metadata })` for sync naturalization from DICOMweb metadata.
- `metaData.get('asyncNaturalized', imageId, { part10 })` for async naturalization from Part10 payloads.

### Standard cache behavior in 5.x

The metadata cache in 5.x is a new shared layer that can be reused by different metadata providers and types. It centralizes cache population, in-flight de-duplication, and query-key consistency so provider implementations can focus on source-specific lookup logic.

- Standard caches are now "read-through" caches: fetching metadata is expected to populate cache as a side effect of that fetch.
- `metaData.get(type, imageId, options)` resolves providers, and cache providers store successful results for the `(type, imageId)` key.
- Async lookups are de-duplicated in-flight, then committed to cache when resolved.
- For most modules, avoid manual `setCacheData(...)` calls; prefer provider-based lookup + automatic caching.
- Source metadata caches (NATURALIZED and ingestion inputs such as DICOMweb/Part10 handlers) should be keyed by base imageId, while derived per-frame caches are keyed by frame imageId.

### Adding a new cache type

- Register a cache for your module/type by calling `addCacheForType('yourType')` during provider registration.
- Then register one or more typed providers for that type; returned values are automatically cached under the query key.
- Keep provider logic as source-of-truth retrieval; let the cache layer handle storage and re-use.

### Writable custom caches (example: calibration-style setter)

- If a cache requires explicit external writes (for example a calibration setter), implement a writable cache class that uses the protected `setCacheDataInternal(...)`.
- Pattern:
  - Extend `CacheData`.
  - Expose a controlled public static setter (for example `setCalibration(...)`) that calls `setCacheDataInternal(type, query, value)`.
  - Export an instance as the public API, so consumers can write via that setter while still using standard cache read methods.
- This keeps write access explicit and scoped, while preserving normal typed-provider cache behavior for reads.

### ImageId mapping changes (old vs new)

- Previous behavior:
  - Frame/base conversion knowledge was spread across call sites, so mappings were inconsistent and not guaranteed to be unique.
  - Source metadata was sometimes written per-frame instead of at a canonical base imageId.
- Metadata 5.x behavior:
  - NATURALIZED/source metadata is canonicalized to base imageId only.
  - `INSTANCE` metadata is per-frame and indexed by the frame imageId (including frame selector).
  - A `FRAME_IMAGE_IDS` typed provider exposes frame-related imageIds generated from canonical base imageId + NATURALIZED metadata.
  - `FRAME_IMAGE_IDS` now resolves in this order: cache first, then NATURALIZED-backed generation.
  - If NATURALIZED is unavailable, `FRAME_IMAGE_IDS` resolves to `null`.
  - If NATURALIZED has no photometric interpretation, `FRAME_IMAGE_IDS` returns a `Set<string>` containing only the base imageId.
  - If NATURALIZED defines `NumberOfFrames`, frame ids are generated for `1..NumberOfFrames` and include:
    - DICOMweb path form (`/instances/{sopUID}/frames/{frameNo}`)
    - Query-param form (`?frame={frameNo}` or `&frame={frameNo}`)
  - Frame imageId -> base imageId normalization is handled by two filters: one for `/frames/{frameNo}` and one for `[?&]frame={frameNo}`.
  - The reusable generator `generateFrameImageIdsFromNaturalized(baseImageId, naturalized)` is exported for non-metadata clients that need the same expansion behavior.
  - A cache provider sits in front of frame/base filters so normalized base lookups and frame imageId expansion are reused.
- Migration guidance:
  - Keep `convertMultiframeImageIds(...)` for generating frame imageIds.
  - Store or fetch NATURALIZED/source metadata using canonical base imageId.
  - Resolve per-frame metadata via `INSTANCE`/derived modules using frame imageIds, and rely on provider filters for frame<->base normalization.

<DocCardList items={useCurrentSidebarCategory().items.filter(item => item.docId !== 'migration-guides/5x/index')}/>
