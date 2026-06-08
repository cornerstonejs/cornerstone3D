---
id: index
title: Cornerstone Metadata
summary: How @cornerstonejs/metadata provides canonical metadata ingestion, providers, and cache behavior in current Cornerstone3D
---

# Metadata Module

`@cornerstonejs/metadata` is the canonical metadata layer for current
Cornerstone3D. It centralizes metadata ingestion, typed provider resolution, and
shared cache behavior so applications do not need to duplicate source-specific
metadata conversion logic.

## Current package role

- Owns metadata provider registration and typed provider orchestration.
- Normalizes source metadata into common module outputs used by core/tools.
- Provides metadata cache coordination across source and derived metadata types.
- Exposes utilities for tag mapping, normalized object handling, and metadata
  organization flows.

## Import path guidance

- Recommended: import metadata APIs from `@cornerstonejs/metadata`.
- Legacy compatibility: `@cornerstonejs/core` still re-exports metadata APIs via
  `core/src/metaData.ts`, but this path is deprecated.

## Provider model

The module supports two complementary provider patterns:

- **General provider chain** (`addProvider`): priority-ordered providers, highest
  priority first.
- **Typed provider chain** (`addTypedProvider`): per-type provider composition
  with a typed provider bridge in the general chain.

This allows applications to keep legacy provider integrations while adopting
typed providers incrementally.

## Add-path ingestion and NATURALIZED

Current metadata changes add explicit ingestion handlers through the add path:

- `metaData.addMetaData(type, query, options)` routes to typed `typeAdd`
  providers.
- `NATURALIZED` is the canonical base metadata state for DICOM source data.
- Callers can provide source payloads (for example DICOMweb JSON or Part10 data)
  and let the metadata layer naturalize and cache them consistently.

## Cache and imageId model (current behavior)

- Shared typed caches support read-through and in-flight de-duplication.
- Source metadata (especially `NATURALIZED`) should be keyed by canonical base
  imageId.
- Derived frame-specific modules resolve on frame imageIds.
- Frame/base normalization and frame-image expansion are handled by metadata
  providers (including `FRAME_IMAGE_IDS`) rather than scattered call-site logic.

## Initialization and provider registration

`registerDefaultProviders()` wires the default typed provider stack and related
helpers. If the provider chain is reset or re-initialized by application startup
flow, required providers must be re-registered after init.

This is especially important during migration from older code paths where
provider registration happened once and relied on persistent global state.

## Display sets and their attributes

The module organizes a series' instances into **display sets** via split rules
(`splitSeriesInstanceGroupsFromImageIds` + `createDisplaySetFromGroup`). A
display set implements `IDisplaySet`, which declares the **common attributes**
read from a display set as plain data — not accessor methods — so it behaves
like the OHIF display set object:

```ts
const displaySet = createDisplaySetFromGroup(group);

displaySet.displaySetInstanceUID;
displaySet.viewportTypes; // readonly ViewportTypeHint[]
displaySet.preferredViewportType; // viewportTypes[0]
displaySet.instances; // readonly NaturalizedInstance[]
displaySet.imageIds; // frame-level, renderable image ids
displaySet.underlyingImageIds; // SOP-level image ids (one per instance)
```

### Adding new display set attributes

- **Shared / common attributes** belong on `IDisplaySet` directly. Declare them
  optional unless every display set populates them. Many are produced by a split
  rule's `customAttributes` callback and spread flat onto the display set in
  `createDisplaySetFromGroup` (for example `isMultiFrame`, `isClip`,
  `numImageFrames`, `splitNumber`).
- **App- or extension-specific attributes** that are not part of the common model
  should be added through **TypeScript module augmentation**, so they stay
  type-checked without widening the shared surface:

  ```ts
  // my-extension.ts — in an extension or the consuming app
  import '@cornerstonejs/metadata';

  declare module '@cornerstonejs/metadata' {
    interface IDisplaySet {
      /** Whether this display set supports window/level. */
      supportsWindowLevel?: boolean;
    }
  }
  ```

Keep augmented attributes optional — not all display set types define them.

## Package boundaries

- `@cornerstonejs/metadata`: metadata ingestion, provider chains, normalized
  module resolution, metadata-specific cache orchestration.
- `@cornerstonejs/core`: rendering/runtime primitives and rendering-focused
  caches and loaders.
- `@cornerstonejs/dicom-image-loader`: retrieve/decode pipeline and source data
  handoff into metadata.
- adapters: conversion between parsed metadata and tool/segmentation
  representations.

## Related docs

- [Metadata Providers](../cornerstone-core/metadataProvider.md)
- [Custom Metadata Provider](../../how-to-guides/custom-metadata-provider.md)
- [5.x Migration Guides](../../migration-guides/5x/index.md)
