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

## The `targetsFilter` and `targetPredicate` configuration

Target selection is split into two composable halves, so each stays a simple
function:

- **`targetsFilter`** — the _chooser_. It decides the **cardinality** (first
  vs all) and receives the whole candidate array plus an options object (the
  viewport and the tool configuration), returning the subset to measure.
- **`targetPredicate`** — the _per-candidate predicate_. It decides whether
  **one** candidate is eligible, returning `true`/`false`. The chooser calls
  it once per candidate; the predicate never has to know how many targets are
  wanted.

```ts
type MeasurementTargetsFilter = (
  candidates: MeasurementTargetCandidate[],
  options: MeasurementTargetOptions // { viewport, configuration, data }
) => MeasurementTargetCandidate[];

type MeasurementTargetPredicate = (
  candidate: MeasurementTargetCandidate,
  options: MeasurementTargetOptions
) => boolean;
```

Because the two decisions are independent, the same `forModality('PT')`
predicate means _"the first PT"_ under the `firstPixelData` chooser and
_"every PT"_ under `allPixelData`, without writing a bespoke combined filter.

The display set related parameters of each candidate include:

- `displaySet` — the display set being shown, where registered (an
  `IDisplaySet` from `@cornerstonejs/metadata` via the `displaySetModule`
  metadata module, or the display set registered with the generic viewports)
- `displaySetUID` — the uid of the display set, where known
- `instance` — an exemplar (first) instance of the display set: naturalized
  DICOM metadata (with `Modality`, `Rows`, `SeriesInstanceUID`, ...), if
  available
- `index` — the index of this display set within the viewport
- plus convenience fields: `modality`, `imageIds` and `referencedId` (the
  backing volume/image id)

### The two built-in choosers

The ready-made choosers apply the pixel-data test **first** (so segmentations
etc are never measured), and then the configured `targetPredicate` when one is
set:

- **`allPixelData`** (the ROI tools' default) — every eligible candidate, via
  `filter`. On a CT/PT fusion viewport this measures both volumes at once.
- **`firstPixelData`** — just the first eligible candidate, via `find` (it
  stops at the first match instead of building an intermediate array), or an
  empty array when nothing is eligible.

There are also the raw `first`/`all` choosers, which ignore the predicate and
the pixel-data test — an escape hatch for measuring literally the first or all
candidates.

The included candidates drive both:

- **The primary targetId** — `getTargetId` returns the first included
  target, so the chooser controls which statistics are stored/read by default.
- **Multi-target statistics** — every included target has its statistics
  computed and displayed. On a single fusion viewport of CT and PT, a chooser
  including both display sets makes that one viewport compute the statistics
  for both volumes, each over its own pixel data, even if no other viewport
  has computed them.

The predicate's decision should be based on the **modality of the display
set** where available. When the display set is unknown — for example a stack
viewport using the legacy set image ids — the candidate has no
`displaySet`/`instance`/`imageIds`/`modality`, and the predicate can choose
whether to include it based on those being undefined.

A configured chooser's result is **authoritative**: when it includes no
candidates (a PT-only predicate on a CT viewport, or the default pixel-data
test when only a SEG is shown), the annotation is still drawn but no
statistics are computed or displayed for that viewport.

Ready-made choosers and predicates are the pure functions exported from
`measurementTargetFilters`, defined once outside any tool. Choosers may also
be referenced **by name**, eg `targetsFilter: 'firstPixelData'`:

```ts
import { measurementTargetFilters } from '@cornerstonejs/tools';
```

## Examples

All display sets with pixel values — this is the default configuration for
the ROI tools, made explicit. Candidates with a non-pixel modality
(non-pixel modalities: SEG, RTSTRUCT, RTPLAN, SR, PR, KO)
are excluded, while candidates with an unknown display set (legacy stacks)
are included:

```ts
toolGroup.addTool(CircleROITool.toolName, {
  targetsFilter: measurementTargetFilters.allPixelData,
});
```

CT statistics only — nothing is shown on viewports without a CT. The chooser
takes every candidate the predicate keeps:

```ts
toolGroup.addTool(CircleROITool.toolName, {
  targetsFilter: measurementTargetFilters.allPixelData,
  targetPredicate: measurementTargetFilters.forModality('CT'),
});
```

PT statistics only (on a fusion viewport this shows the SUV statistics;
nothing is shown on viewports without a PT):

```ts
toolGroup.addTool(CircleROITool.toolName, {
  targetsFilter: measurementTargetFilters.allPixelData,
  targetPredicate: measurementTargetFilters.forModality('PT'),
});
```

Both CT and PT explicitly — like the default, but restricted to exactly
those two modalities:

```ts
toolGroup.addTool(CircleROITool.toolName, {
  targetsFilter: measurementTargetFilters.allPixelData,
  targetPredicate: measurementTargetFilters.forModality('CT', 'PT'),
});
```

Just the first pixel-data target (the pre-5.x single-target behaviour),
referencing the chooser by name:

```ts
toolGroup.addTool(CircleROITool.toolName, {
  targetsFilter: 'firstPixelData',
});
```

The first PT target only — the `firstPixelData` chooser with the PT
predicate:

```ts
toolGroup.addTool(CircleROITool.toolName, {
  targetsFilter: 'firstPixelData',
  targetPredicate: measurementTargetFilters.forModality('PT'),
});
```

A specific volume by id (a substring match, so a series UID contained in the
id also works). This replaces the deprecated `isPreferredTargetId`
configuration:

```ts
toolGroup.addTool(RectangleROITool.toolName, {
  targetsFilter: measurementTargetFilters.allPixelData,
  targetPredicate: measurementTargetFilters.forId(ptVolumeId),
});
```

Predicates are plain functions, so any per-candidate selection logic is
possible — including deciding from the exemplar instance or handling unknown
display sets explicitly:

```ts
toolGroup.addTool(CircleROITool.toolName, {
  // Custom predicate: PT only, decided from the exemplar instance
  targetsFilter: 'firstPixelData',
  targetPredicate: (candidate) => candidate.instance?.Modality === 'PT',
});

toolGroup.addTool(CircleROITool.toolName, {
  // PT statistics where the display set is known, plus anything whose
  // display set is unknown (no imageIds array, eg legacy stacks)
  targetsFilter: measurementTargetFilters.allPixelData,
  targetPredicate: (candidate) =>
    !candidate.imageIds || candidate.modality === 'PT',
});
```

The `tmtv` example wires several of these as separately labelled dropdown
entries (default both, PT SUV only, CT HU only) on a PT/CT fusion layout,
and the `petCt` example shows the `forId` variant.

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
  the configured chooser/predicate that decides whether to include them. The
  default `isPixelData` predicate (applied by the `firstPixelData`/
  `allPixelData` choosers) excludes any candidate with a `representationUID`,
  so segmentations are never measured by default, but a custom predicate can
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

Statistics are keyed in `cachedStats` by view reference IDs. Volume candidates
use IDs of the form
`volumeId:<volumeId>?sliceIndex=...&viewPlaneNormal=...`; stack candidates keep
using imageId-derived target IDs. For each volume candidate, if the annotation
already has a `cachedStats` key whose embedded volume ID exactly matches the
candidate, that existing key is reused. The annotation's world-space geometry,
and therefore its statistics, do not depend on the viewing orientation, so
recomputing per view would only duplicate work and display entries. Only when
no key exists for the volume is a new targetId generated from this viewport's
view reference for that volume.

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
