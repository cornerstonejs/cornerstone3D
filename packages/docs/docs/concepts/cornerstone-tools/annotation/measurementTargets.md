---
id: measurementTargets
title: Measurement Targets
summary: Configurable filtering of which targets (display sets/volumes) annotation tools compute and display statistics for, including multiple statistics on fusion viewports
---

# Measurement Targets

Annotation tools that calculate statistics (such as `CircleROITool` and
`RectangleROITool`) store their results in the annotation's `cachedStats`,
keyed by a **targetId** identifying the image data the statistics were
computed on. On a stack viewport the targetId is derived from the imageId; on
a volume viewport it is derived from the volumeId.

A viewport can display more than one set of image data at once — a PT/CT
fusion viewport has both a CT and a PT volume. Each displayed volume is a
candidate **measurement target**, and the tool configuration decides which of
them the tool computes and displays statistics for.

**By default, the ROI statistics tools (`CircleROITool`,
`RectangleROITool`) compute and display the statistics of every display set
containing pixel values** — on a CT/PT fusion viewport both the HU and the
SUV statistics are shown at once. Display sets whose modality does not carry
measurable pixel values (SEG, RTSTRUCT, SR, ...) are never included, even
when they are the only thing shown.

## The `targetsFilter` configuration

Every annotation tool accepts a `targetsFilter` configuration option. It is a
declarative spec naming an **`annotationTargetFilter` metadata provider key**
and its options:

```ts
toolGroup.addTool(CircleROITool.toolName, {
  targetsFilter: {
    key: 'modality',
    options: { modality: 'PT' },
  },
});
```

When selecting the measurement targets, `BaseTool` resolves the spec to a
filter function through the existing metadata-provider system:

```ts
const filter = metaData.getMetaData(
  'annotationTargetFilter',
  targetsFilter.key,
  targetsFilter.options
);
```

so the generic behaviour of each key is registered once as a metadata
provider, and the tool configuration only passes the value (`'PT'`, `'CT'`,
a volume id, ...) as options. No tool class carries its own copy of the
target-selection API, and applications can supply further target-selection
behaviour through their existing metadata providers (see
[Custom filters](#custom-filters) below).

### Built-in provider keys

The built-in provider (`utilities.annotationTargetFilterProvider`, registered
by `init()`) answers these keys:

| Key              | Options                                              | Selects                                                                                                                                                                         |
| ---------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `'allPixelData'` | —                                                    | Every display set containing pixel values — the ROI tools' **default**. Excludes segmentation representations and the non-pixel modalities (SEG, RTSTRUCT, RTPLAN, SR, PR, KO). |
| `'modality'`     | `{ modality: 'PT' }` or `{ modality: ['CT', 'PT'] }` | Display sets whose modality matches. Candidates with an unknown display set/modality are excluded.                                                                              |
| `'id'`           | `{ id: volumeId }`                                   | Display sets referencing the given display set/volume/image id — a substring match, so partial identifiers such as a contained series UID also work.                            |
| `'first'`        | —                                                    | Just the first candidate display set (the pre-5.x single-target behaviour).                                                                                                     |
| `'all'`          | —                                                    | Every candidate display set, including segmentation representations.                                                                                                            |

The built-in keys always resolve: if the provider chain returns nothing for
them (for example after `metaData.removeAllProviders()`), the built-in
provider is consulted directly. The built-in provider is registered below the
default priority, so an application provider registered at the default
priority can override any of these keys.

### The filter function

The resolved filter (or a function set directly as `targetsFilter` — see
[Custom filters](#custom-filters)) is called once per candidate display set
of the viewport, in order. Its first parameter is the display set related
information of the candidate, and its second parameter is the viewport the
filter is applying to:

```ts
type MeasurementTargetsFilter = (
  displaySetInfo: MeasurementTargetCandidate,
  viewport: Types.IViewport
) => MeasurementTargetsFilterResult;
```

The display set related parameters include:

- `displaySet` — the display set being shown, where registered (an
  `IDisplaySet` from `@cornerstonejs/metadata` via the `displaySetModule`
  metadata module, or the display set registered with the generic viewports)
- `displaySetUID` — the uid of the display set, where known
- `instance` — an exemplar (first) instance of the display set: naturalized
  DICOM metadata (with `Modality`, `Rows`, `SeriesInstanceUID`, ...), if
  available
- `index` — the index of this display set within the viewport
- `previous` — the candidate previously chosen (included) by the filter, if
  any, letting a filter decide relative to what it has already selected
- plus convenience fields: `modality`, `imageIds` and `referencedId` (the
  backing volume/image id)

### Return values — including, skipping and stopping

The return value decides what happens with the candidate **and** whether the
search continues:

| Return value          | This display set | Further display sets |
| --------------------- | ---------------- | -------------------- |
| `true`                | included         | keep looking         |
| `false` / `undefined` | skipped          | keep looking         |
| `'useAndStop'`        | included         | **stop looking**     |
| `'stop'`              | skipped          | **stop looking**     |

Return `'useAndStop'` or `'stop'` when no further items should be
considered — for example the `'first'` key resolves to simply
`() => 'useAndStop'`, and a "first PT only" filter is
`(displaySetInfo) => displaySetInfo.modality === 'PT' ? 'useAndStop' : false`.

The included candidates drive both:

- **The primary targetId** — `getTargetId` returns the first included
  target, so the filter controls which statistics are stored/read by default.
- **Multi-target statistics** — every included target has its statistics
  computed and displayed. On a single fusion viewport of CT and PT, a filter
  including both display sets makes that one viewport compute the statistics
  for both volumes, each over its own pixel data, even if no other viewport
  has computed them.

The filter's decision should be based on the **modality of the display set**
where available. When the display set is unknown — for example a stack
viewport using the legacy set image ids — the candidate has no
`displaySet`/`instance`/`imageIds`/`modality`, and the filter can choose
whether to include it based on those being undefined.

A configured filter's result is **authoritative**: when it includes no
candidates (a PT-only filter on a CT viewport, or the default pixel-data
filter when only a SEG is shown), the annotation is still drawn but no
statistics are computed or displayed for that viewport.

## Examples

All display sets with pixel values — this is the default configuration for
the ROI tools, made explicit. Candidates with a non-pixel modality
(`utilities.NON_PIXEL_DATA_MODALITIES`: SEG, RTSTRUCT, RTPLAN, SR, PR, KO)
are excluded, while candidates with an unknown display set (legacy stacks)
are included:

```ts
toolGroup.addTool(CircleROITool.toolName, {
  targetsFilter: { key: 'allPixelData' },
});
```

CT statistics only — nothing is shown on viewports without a CT:

```ts
toolGroup.addTool(CircleROITool.toolName, {
  targetsFilter: { key: 'modality', options: { modality: 'CT' } },
});
```

PT statistics only (on a fusion viewport this shows the SUV statistics even
though the first/default target is the CT volume; nothing is shown on
viewports without a PT):

```ts
toolGroup.addTool(CircleROITool.toolName, {
  targetsFilter: { key: 'modality', options: { modality: 'PT' } },
});
```

Both CT and PT explicitly — like the default, but restricted to exactly
those two modalities:

```ts
toolGroup.addTool(CircleROITool.toolName, {
  targetsFilter: { key: 'modality', options: { modality: ['CT', 'PT'] } },
});
```

Just the first target (the pre-5.x single-target behaviour):

```ts
toolGroup.addTool(CircleROITool.toolName, {
  targetsFilter: { key: 'first' },
});
```

A specific volume by id (a substring match, so a series UID contained in the
id also works). This replaces the deprecated `isPreferredTargetId`
configuration:

```ts
toolGroup.addTool(RectangleROITool.toolName, {
  targetsFilter: { key: 'id', options: { id: ptVolumeId } },
});
```

The `tmtv` example wires several of these as separately labelled dropdown
entries (default both, PT SUV only, CT HU only) on a PT/CT fusion layout,
and the `petCt` example shows the `id` variant.

## Custom filters

Applications add their own target-selection behaviour through the metadata
providers they already use — register a provider answering the
`annotationTargetFilter` type for new keys, then name the key in the tool
configuration:

```ts
import { metaData } from '@cornerstonejs/core';

metaData.addProvider((type, key, options) => {
  if (type !== 'annotationTargetFilter') {
    return;
  }
  if (key === 'suvCapable') {
    // The filter function receives each candidate display set in turn
    return ({ instance }) => instance?.Units === 'BQML';
  }
});

toolGroup.addTool(CircleROITool.toolName, {
  targetsFilter: { key: 'suvCapable' },
});
```

Providers that do not recognise a key return `undefined`, so the chain falls
through to the next provider (and finally to the built-in keys). Registering
a provider at the default priority also overrides the built-in keys, which
sit below it.

For one-off cases a filter function can also be set directly as the
`targetsFilter` configuration — any selection logic is possible, including
deciding from the exemplar instance, stopping early, or handling unknown
display sets explicitly:

```ts
toolGroup.addTool(CircleROITool.toolName, {
  // The first PT display set only, stopping the search once found
  targetsFilter: (displaySetInfo) =>
    displaySetInfo.instance?.Modality === 'PT' ? 'useAndStop' : false,
});

toolGroup.addTool(CircleROITool.toolName, {
  // PT statistics where the display set is known, plus anything whose
  // display set is unknown (no imageIds array, eg legacy stacks)
  targetsFilter: (displaySetInfo) =>
    !displaySetInfo.imageIds || displaySetInfo.modality === 'PT',
});

toolGroup.addTool(CircleROITool.toolName, {
  // At most one display set per modality, using the previously chosen
  // candidate to skip duplicates
  targetsFilter: (displaySetInfo) =>
    displaySetInfo.modality !== displaySetInfo.previous?.modality,
});
```

## How it behaves

### Candidate derivation

The candidates passed to the filter are built by
`BaseTool.getMeasurementTargetCandidates` from the viewport's actors:

- one candidate per actor whose `referencedId` is a volume present in the
  cache — the `displaySet`/`displaySetUID` come from the viewport's
  registered display sets where one matches the volume, the exemplar
  `instance` from the display set's instances or the `instance` metadata of
  the first image id, and `modality` from the instance or the volume
  metadata;
- actors not derived from a cached volume (tool/canvas actors) are skipped.
  Segmentation representations (labelmaps etc) are **not** skipped here —
  they are included as candidates carrying a `representationUID`, and it is
  the configured filter that decides whether to include them. The default
  `allPixelData` filter excludes any candidate with a `representationUID`,
  so segmentations are never measured by default, but a custom filter can
  opt to include them;
- when no actor produces a candidate (for example on a stack viewport), a
  single candidate for the viewport's default view reference is used. If the
  viewport displays a registered display set (`setDisplaySets` on the generic
  viewports), the candidate's display set fields are resolved from the
  `displaySetModule` metadata (an `IDisplaySet` from
  `@cornerstonejs/metadata`) or the generic viewport display set
  registration; a legacy stack (`setStack` with plain image ids) has no
  display set, so the candidate carries none of the display set fields —
  filters can detect this via the missing `imageIds`/`instance`.

### targetId computation and reuse

Statistics are keyed in `cachedStats` by view reference ids of the form
`volumeId:<volumeId>?sliceIndex=...&viewPlaneNormal=...`. For each candidate,
if the annotation already has a `cachedStats` key for the same volume — the
key is `volumeId:<volumeId>` followed by `?`, `&` or end-of-string, so
entries created by another viewport with a different slice or orientation
still match — that existing key is reused. The annotation's world-space
geometry, and therefore its statistics, do not depend on the viewing
orientation, so recomputing per view would only duplicate work and display
entries. Only when no key exists for the volume is a new targetId generated
from this viewport's view reference for that volume.

### Seeding and computing multiple statistics

The statistics calculators of the tools iterate the keys of the annotation's
`cachedStats`. When a tool renders on a viewport, it seeds (via
`BaseTool.ensureCachedStatsTargets`) a `cachedStats` entry for every filtered
target that does not have one yet, and then recalculates — so a fusion
viewport seeds and computes both its CT and PT statistics itself, even if the
annotation was originally drawn on (and computed by) a single-volume
viewport. Conversely, an annotation drawn on a fusion viewport with a
multi-target filter carries the statistics of both volumes to every other
viewport displaying it.

The text box then renders one line per metric with the values of each target,
for example `Mean: 34 HU 2.3 SUV`, skipping duplicated values.

### Relation to `isPreferredTargetId`

The older `isPreferredTargetId` configuration (and the
`BaseTool.isSpecifiedTargetId` helper) could only choose the preferred
targetId among statistics that some viewport had already computed. It is
deprecated in favour of `targetsFilter`, which selects among the actual
display sets of the viewport and can therefore also cause statistics to be
computed for targets no viewport has computed yet. For backward
compatibility, a configured `isPreferredTargetId` is honoured **before** the
filter (including the ROI tools' default filter), so configurations that
predate `targetsFilter` keep their behaviour.

:::note
Multi-target selection currently only works for volumes displayed on screen.
Stack-based fusion and targets not currently displayed are not yet supported.
:::
