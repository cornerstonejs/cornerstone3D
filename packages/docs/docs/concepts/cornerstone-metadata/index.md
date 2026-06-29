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

## Display sets

A **display set** is the unit a viewport renders. It groups the instances of a
series that should be shown together and records which viewport type(s) can
render them. This mirrors the OHIF "display set" concept, but lives in
`@cornerstonejs/metadata` as a framework-agnostic, **data-shaped** object
(`IDisplaySet`) so any application — not just OHIF — can reuse it.

A series does not always map to a single display set. The classic case is the
fix this module was extracted for: a **diffusion MR (DWI)** series that mixes
4D b-value frames with trailing frames that have no b-value. Those undefined
b-value frames are not part of the 4D data set, so rendering them as one volume
applies the wrong window/level. The `mixedDimensionalityBValue` split rule
separates them into their own display set (see [Split rules](#split-rules)).

### The split → create → consume pipeline

The end-to-end flow has three stages:

1. **Split** a series' image ids into instance groups with
   `splitSeriesInstanceGroupsFromImageIds` using a set of split rules.
2. **Create** an `IDisplaySet` for each group with `createDisplaySetFromGroup`.
3. **Consume** each display set — render it on a viewport, and/or cache it in the
   metadata layer so downstream code can resolve it by image id.

For examples, the demo helper `splitDisplaySetsFromImageIds(imageIds)` performs
stages 1–2 for you (it normalizes frame image ids to their base form, dedupes to
one instance per SOP, and re-attaches the frame-level image ids). Under the hood
it is just:

```ts
import {
  splitSeriesInstanceGroupsFromImageIds,
  createDisplaySetFromGroup,
  defaultDisplaySetSplitRules,
  type IDisplaySet,
  type NaturalizedInstance,
} from '@cornerstonejs/metadata';

// Resolve one (base) imageId to its naturalized DICOM instance. In a real app
// this reads the metadata cache, e.g. metaData.get('instance', imageId), with
// the imageId normalized to its base (frame 1) form.
function getNaturalizedInstance(
  imageId: string
): NaturalizedInstance | undefined {
  return metaData.get('instance', imageId) as NaturalizedInstance | undefined;
}

const groups = splitSeriesInstanceGroupsFromImageIds(seriesImageIds, {
  getNaturalizedInstance,
  splitRules: defaultDisplaySetSplitRules,
});

const displaySets: IDisplaySet[] = groups.map((group) =>
  createDisplaySetFromGroup(group)
);
```

### Driving a viewport from a display set

Each display set exposes the viewport type(s) it can be shown in
(`viewportTypes`, with `preferredViewportType` being the first). A viewport's
`setDisplaySets({ displaySetId })` is the single entry point that loads a display
set: it resolves `displaySetId` to renderable data, calls the viewport's native
setter (`setStack` / `setVolumes` / `setVideo` / `setWSI` / `setEcg`), and
records the mounted entry so `getDisplaySets()` reflects it.

For the legacy viewports, `setDisplaySets` resolves `displaySetId` through the
**generic-viewport dataset provider**, so you register the renderable data there
first. The registered shape depends on the viewport family:

```ts
import { Enums, utilities } from '@cornerstonejs/core';

const { ViewportType } = Enums;

const HINT_TO_VIEWPORT_TYPE: Record<string, Enums.ViewportType> = {
  stack: ViewportType.STACK,
  volume: ViewportType.ORTHOGRAPHIC,
  volume3d: ViewportType.VOLUME_3D,
  video: ViewportType.VIDEO,
  wholeslide: ViewportType.WHOLE_SLIDE,
  ecg: ViewportType.ECG,
};

const displaySetId = displaySet.displaySetInstanceUID;

// 1. Register the renderable data so the viewport can resolve `displaySetId`.
//    stack/volume use { imageIds }; video/ecg use { kind, sourceDataId };
//    wsi uses { kind: 'wsi', imageIds, options: { webClient } }.
utilities.genericViewportDataSetMetadataProvider.add(displaySetId, {
  imageIds: [...displaySet.imageIds],
});

// 2. Enable a viewport of the display set's preferred type, then mount it.
const viewportType =
  HINT_TO_VIEWPORT_TYPE[displaySet.preferredViewportType] ?? ViewportType.STACK;
renderingEngine.enableElement({ viewportId, type: viewportType, element });

const viewport = renderingEngine.getViewport(viewportId);
await viewport.setDisplaySets({ displaySetId });

viewport.getDisplaySets(); // [{ displaySetId }] — reflects what was mounted
```

The runnable end-to-end version (all five viewport families, plus a dropdown to
switch a display set among its allowed viewport types) is the **Display Sets**
example under `packages/core/examples/displaySets`.

### Caching display sets in the metadata layer

Independently of rendering, a display set can be stored in the typed metadata
cache so any consumer (tools, measurements, custom UI) can resolve it from any
of its image ids:

```ts
import {
  registerDisplaySetProviders,
  registerDisplaySetMetadata,
  Enums,
  metaData,
} from '@cornerstonejs/metadata';

// Once at app init (after registerDefaultProviders):
registerDisplaySetProviders();

// After creating a display set, cache it keyed by its (underlying) image ids:
registerDisplaySetMetadata(seriesImageIds, displaySet);

// Anywhere downstream, resolve the display set from one of its image ids:
const ds = metaData.getTyped(Enums.MetadataModules.DISPLAY_SET, imageId);
ds?.instances; // the full IDisplaySet — including instances and split-rule
ds?.numImageFrames; // attributes such as isClip / numImageFrames / splitNumber
```

`getTyped(MetadataModules.DISPLAY_SET, …)` returns the full `IDisplaySet` that
was registered, not a narrowed projection, so the cached shape and the typed
read never drift apart.

## Split rules

Split rules decide how a series' instances are grouped into display sets and
which viewport types each group supports. `defaultDisplaySetSplitRules` covers
the common DICOM cases (video, ECG, whole-slide, single-image modalities,
multi-frame clips, mixed-b-value DWI, volumetric series, and a fallback image
rule). Rules are evaluated **in order, first match wins per instance**.

A `SplitRule` has up to five parts:

| Field              | Purpose                                                                                         |
| ------------------ | ----------------------------------------------------------------------------------------------- |
| `ruleSelector`     | Returns true if an instance belongs to this rule. Omit to match everything.                     |
| `splitKey`         | Keys (tag names or functions) that partition matched instances into separate display sets.      |
| `makeSeriesInfo`   | Runs once per series **before** selection to compute series-level flags read by `ruleSelector`. |
| `viewportTypes`    | Allowed viewport types for the produced display sets; index `0` is preferred.                   |
| `customAttributes` | Returns extra attributes spread flat onto the display set (e.g. `isClip`, `numImageFrames`).    |

The DWI fix is a good worked example — a series-level pass flags the mixed
series, and `splitKey` then separates the b-value frames from the
undefined-b-value frames:

```ts
import type { SplitRule } from '@cornerstonejs/metadata';

const mixedDimensionalityBValue: SplitRule = {
  id: 'mixedDimensionalityBValue',
  viewportTypes: ['stack', 'volume', 'volume3d'],
  // Series-level pass: flag MR series that mix b-value and non-b-value frames.
  makeSeriesInfo: (instances, seriesInfo) => {
    const [instance] = instances;
    if (!instance || instance.Modality !== 'MR') {
      return;
    }
    const hasBValue = instances.some((i) => i.DiffusionBValue !== undefined);
    const missingBValue = instances.some(
      (i) => i.DiffusionBValue === undefined
    );
    if (hasBValue && missingBValue) {
      seriesInfo.mixedBValue = true;
    }
  },
  // Only applies once the series-level pass flagged the series.
  ruleSelector: (_instance, seriesInfo) => !!seriesInfo.mixedBValue,
  // Two display sets: undefined-b-value frames split off from the rest.
  splitKey: [
    'SeriesInstanceUID',
    (instance) => instance.DiffusionBValue === undefined,
  ],
};
```

To customize splitting, prepend your own rules to (or replace) the defaults and
pass the result as `splitRules`. `customAttributes` may set any attribute, but
the resolved data fields a display set is built from — `imageIds`,
`underlyingImageIds`, `instances`, and `displaySetInstanceUID` — are reserved and
cannot be overwritten, so the underlying-vs-frame image id invariant the
viewports rely on always holds.

`makeSeriesInfo` is run by `buildSeriesInfo`, which is safe to call with an empty
instance list (it returns zeroed counts without invoking any rule).

### Instance classifiers

The default rules rely on small SOP-class/modality heuristics that are also
exported for reuse, so you can detect a series' kind without re-hardcoding UID
lists:

- `isImageSopClass(sopClassUID)` — the SOP class carries renderable pixel data.
- `isVideoInstance(instance)` — video transfer syntax (reusing the shared
  `videoUIDs` list), a video SOP class, or a long multi-frame secondary capture.
- `isEcgInstance(instance)` — an ECG / waveform SOP class.
- `isWsiInstance(instance)` — VL Whole Slide Microscopy storage, or modality `SM`.

## Display set attributes (`IDisplaySet`)

A display set implements `IDisplaySet`, which declares the **common attributes**
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
