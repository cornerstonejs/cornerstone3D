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
- addMetadata providers for adding information to caches/waiting for async results to be added.
- clear metadata handling for removing specific changes and/or removing all cached data
- Providers that register directly for a specific single metadata type, so resolution can short-circuit quickly.
- Shared caches used across metadata providers and metadata types.
- Shared cache usage for Part10, DICOMweb, imageId-derived values, and other cached metadata outputs.
- Provision for new metadata types such as display set, series-level, and study-level results.

## Metadata provider caching updates

In 5.x, metadata providers are first-class extension points in the retrieval pipeline. Instead of each caller manually transforming and writing metadata, providers can normalize source payloads, compose with other providers, and rely on shared cache behavior for consistent lookups.

- Use add-path metadata ingestion when the data requires parameters/externally provided values.
  For example, the NATURALIZED data is computed from binary part 10 or DICMweb metadata format
  - Use `metaData.addMetaData(MetadataModules.NATURALIZED, imageId, { dicomwebJson })` for DICOMweb JSON payloads.
  - Use `metaData.addMetaData(MetadataModules.NATURALIZED, imageId, { part10Buffer })` for async Part10 ingestion (`ArrayBuffer`, `Uint8Array`, or resolver function).
- The metadata layer now owns frame/base imageId mapping and derived cache invalidation; avoid direct frame propagation with `setCacheData`.

### New metadata handling (and backwards compatibility)

- In 5.x, **NATURALIZED metadata is the base state for DICOM imaging data**. Other metadata modules (for example `INSTANCE` and derived module lookups) are expected to resolve from that canonical naturalized state rather than from source-specific conversion code.
- Data sources should migrate to providing metadata through naturalized add handlers (`{ dicomwebJson }` and `{ part10Buffer }`) instead of performing custom source-local conversion to instance/natural objects.
- New in 5.x: metadata ingestion is handled through add-path typed-provider requests, so callers can pass source data as options (`{ dicomwebJson }` or `{ part10Buffer }`) and let the provider chain naturalize/cache it.
- Existing usage still works: if your app already resolves metadata through the legacy provider chain (`addProvider` / prior `metaData.get(...)` flow), that behavior remains supported while you migrate.
- Recommended migration path: move NATURALIZED writes to `metaData.addMetaData(...)` calls and remove custom frame/base propagation logic from app code.
- This migration is optional until you adopt the new metadata handler path; legacy flows remain supported during transition.
- Why this matters: shared naturalization creates consistent behavior across DICOMweb, Part10, and other ingest paths, and helps eliminate recurring bugs caused by multiple, slightly different conversion implementations.

### Naturalized handlers

`registerNaturalizedHandlers()` now registers NATURALIZED handlers as composable read and add provider chains:

- **Base imageId query filter:** a shared `baseImageIdQueryFilter` can be plugged into typed provider chains and is registered for `NATURALIZED` at high priority so frame-specific imageIds resolve on canonical base imageId first.
- **Synchronous naturalization handler (add path):** when callers provide `{ dicomwebJson }`, the handler naturalizes DICOMweb-style metadata into NATURALIZED output.
- **Asynchronous Part10 handler (add path):** accepts `{ part10Buffer }` (`ArrayBuffer`, `Uint8Array`, or resolver function), resolves to NATURALIZED, and commits to shared cache.
- **Cache interaction:** with base-image filtering ahead of cache providers, NATURALIZED cache keys remain canonical and downstream typed modules can rely on consistent lookups.

Recommended usage:

- `metaData.addMetaData(MetadataModules.NATURALIZED, imageId, { dicomwebJson })` for sync naturalization from DICOMweb metadata.
- `metaData.addMetaData(MetadataModules.NATURALIZED, imageId, { part10Buffer })` for async naturalization from Part10 payloads.

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

### Writable cache ingestion path

- Prefer add-path ingestion (`metaData.addMetaData(...)`) over direct writable cache setters.
- Register writable behavior with `addWritableCacheForType(type)` (currently intended for `NATURALIZED`) so add-path ingestion writes to shared cache consistently.
- Use `addCacheForType(type, { secondaryOf: ... })` to register derived caches that should be invalidated when a base cache type changes.
- This keeps write behavior centralized in providers while preserving typed-provider cache behavior for reads.

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
