---
id: display-sets
title: Display Sets
summary: Framework-agnostic display-set splitting in @cornerstonejs/metadata — the split/create/consume pipeline, split rules, and the IDisplaySet data model
---

# Display Sets

A **display set** is the unit a viewport renders. It groups the instances of a
series that should be shown together, and names the handler of a non-image
object. This mirrors the OHIF "display set" concept, but lives in
`@cornerstonejs/metadata` as a framework-agnostic, **data-shaped** object
(`IDisplaySet`) so any application — not just OHIF — can reuse it.

A series does not always map to a single display set. The classic case is the
fix this module was extracted for: a **diffusion MR (DWI)** series that mixes
4D b-value frames with trailing frames that have no b-value. Those undefined
b-value frames are not part of the 4D data set, so rendering them as one volume
applies the wrong window/level. The `mixedDimensionalityBValue` split rule
separates them into their own display set (see [Split rules](#split-rules)).

## The split → create → consume pipeline

The end-to-end flow has three stages:

1. **Split** a series' image ids into instance groups with
   `splitImageIdsBySplitRules` using a set of split rules.
2. **Create** an `IDisplaySet` for each group with `createDisplaySetFromGroup`.
3. **Consume** each display set — render it on a viewport, and/or cache it in the
   metadata layer so downstream code can resolve it by image id.

For examples, the demo helper `splitDisplaySetsFromImageIds(imageIds)` performs
stages 1–2 for you (it normalizes frame image ids to their base form, dedupes to
one instance per SOP, and re-attaches the frame-level image ids). Under the hood
it is just:

```ts
import {
  splitImageIdsBySplitRules,
  createDisplaySetFromGroup,
  compiledDisplaySetRules,
  metaData,
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

const groups = splitImageIdsBySplitRules(seriesImageIds, {
  getNaturalizedInstance,
  splitRules: compiledDisplaySetRules,
});

const displaySets: IDisplaySet[] = groups.map((group) =>
  createDisplaySetFromGroup(group)
);
```

## Driving a viewport from a display set

The default rules give no viewport type. The host chooses the viewport from
`displaySet.handler` (a non-image object) and `displaySet.isReconstructable` (an image;
see [Reconstructable display sets](#reconstructable-display-sets)). A custom rule's
`viewportTypes`, if any, is on `displaySet.viewportTypes`. A viewport's
`setDisplaySets({ displaySetId })` is the single entry point that loads a display
set: it resolves `displaySetId` to renderable data, calls the viewport's native
setter (`setStack` / `setVolumes` / `setVideo` / `setWSI` / `setEcg`), and
records the mounted entry so `getDisplaySets()` reflects it.

The viewport/registry `displaySetId` is the same value as the display set's
`displaySetId` field — there is one identifier for a display set, used on both
the metadata object and the viewport API.

For the legacy viewports, `setDisplaySets` resolves `displaySetId` through the
**generic-viewport display-set provider**, so you register the renderable data
there first. The registered shape depends on the viewport family:

```ts
import { Enums, utilities } from '@cornerstonejs/core';

const { ViewportType } = Enums;

const HANDLER_TO_VIEWPORT_TYPE: Record<string, Enums.ViewportType> = {
  video: ViewportType.VIDEO,
  wholeSlide: ViewportType.WHOLE_SLIDE,
  ecg: ViewportType.ECG,
};

const displaySetId = displaySet.displaySetId;

// 1. Register the renderable data so the viewport can resolve `displaySetId`.
//    stack/volume use { imageIds }; video/ecg use { kind, sourceDataId };
//    wsi uses { kind: 'wsi', imageIds, options: { webClient } }.
utilities.genericViewportDisplaySetMetadataProvider.add(displaySetId, {
  imageIds: [...displaySet.imageIds],
});

// 2. Choose the viewport: from the handler, else from isReconstructable.
const viewportType =
  HANDLER_TO_VIEWPORT_TYPE[displaySet.handler ?? ''] ??
  (displaySet.isReconstructable
    ? ViewportType.ORTHOGRAPHIC
    : ViewportType.STACK);
renderingEngine.enableElement({ viewportId, type: viewportType, element });

const viewport = renderingEngine.getViewport(viewportId);
await viewport.setDisplaySets({ displaySetId });

viewport.getDisplaySets(); // [{ displaySetId }] — reflects what was mounted
```

`getDisplaySets()` is available on both the legacy `Viewport` and the generic
viewport, so mounted display sets can be read uniformly across either hierarchy.

The runnable end-to-end version (all five viewport families, plus a dropdown to
switch a display set among the viewports that the example allows) is the **Display Sets**
example under `packages/core/examples/displaySets`.

### Reconstructable display sets

`createDisplaySetFromGroup` sets `isReconstructable` on each image display set
(no handler, or the handler `image`), and on no other display set. The attribute
has the name of the OHIF display set attribute `isReconstructable`. A host opens
the display set as a volume when it is true, else as a stack. A clip (`isClip`)
is never reconstructable, and an attribute that sets `isReconstructable` wins.

CS3D gives a reasonable first value from the instance attributes, and a host
may refine it for display (for example with a texture size limit).
`isReconstructableInstances(instances)` computes it from the naturalized
instances of the display set alone, so a server gets the same answer. It
follows OHIF `isDisplaySetReconstructable`, and reads the plane, the spacing
and the slice lattice with the `planeGeometry` series function:

- Single-frame instances: two or more, all with the same `Rows`, `Columns`,
  `SamplesPerPixel` and orientation, at two or more locations, and every slice
  on one regular lattice with a 20% tolerance. A missing slice is allowed; two
  slices at one location are not.
- A multi-frame instance (the first instance has more than one frame): pixel
  spacing (`PixelMeasuresSequence`, or `PixelSpacing` with `SliceThickness` or
  `SpacingBetweenFrames`), an orientation and a position are known; an NM
  instance is a reconstructed tomo (`ImageType[2]` is `RECON TOMO` or
  `RECON GATED TOMO`); and the frames are not all at one location.
- There is no modality list: the geometry decides.

Known differences from OHIF `isDisplaySetReconstructable`:

- A clip is never reconstructable here; OHIF has no clip rule.
- No texture size limit here; OHIF can apply `max3DTextureSize` from its
  configuration.
- The orientation is rounded to 1e-3 here; OHIF allows a difference of 0.01.
- The spacing is the most frequent gap here; OHIF averages first to last.
- Frames of a multi-frame instance that differ only in-plane are one location
  here (the distance is along the slice normal); OHIF measures 3D distance.

The `isValidVolume(imageIds)` utility of `@cornerstonejs/core` reads the
metadata providers by imageId; `@cornerstonejs/metadata` cannot import core, so
the display set test does not use it.

## Caching display sets in the metadata layer

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

Split rules decide how a series' instances are grouped into display sets, and
which handler builds each one. Rules are evaluated in **ascending
priority, first match wins per instance**.

### The default rules

`compiledDisplaySetRules` is the rule set you get without writing any rules.
It is the compiled form of `displaySetRules`, the same rules as JSON data
(see [Sharing rules between applications](#sharing-rules-between-applications-the-display-set-rules)).
It has seventeen rules. Sixteen have the priorities `10` to `160`, in steps of
10, and the catch-all `unsupported` runs last, at `Number.MAX_SAFE_INTEGER`:

| Priority | Id                          | Handler                | Claims                                                                                                                                                 |
| -------- | --------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 10       | `video`                     | `video`                | `isVideo`: a video-only SOP class, a video transfer syntax, or (with no known transfer syntax) a long secondary capture. One display set per instance. |
| 20       | `ecg`                       | `ecg`                  | `isEcg`: ECG and waveform SOP classes. One display set per instance.                                                                                   |
| 30       | `wholeslide`                | `wholeSlide`           | `isWsi`: VL Whole Slide Microscopy, or modality SM; all pyramid levels form one display set.                                                           |
| 40       | `singleImageModality`       |                        | CR, DX and MG: one display set per instance.                                                                                                           |
| 50       | `multiFrame`                |                        | Each multi-frame image instance: one display set per `SOPInstanceUID`, in `InstanceNumber` order. A cine clip gets `isClip: true`.                     |
| 60       | `localizer`                 |                        | CT, MR and PT series that mix `LOCALIZER` images with other images: the localizer images become one display set, with `isLocalizer: true`.             |
| 70       | `mixedDimensionalityBValue` |                        | Diffusion MR that mixes b-value frames with frames that have none; the two parts split.                                                                |
| 80       | `volume3d`                  |                        | Multi-slice CT, MR, PT and NM that reconstruct into a volume.                                                                                          |
| 90       | `defaultImageRule`          |                        | Any other image SOP class (`isImage`), also with no `Rows` in the metadata. One display set per series.                                                |
| 100      | `segmentation`              | `segmentation`         | `segmentationSopClassUids`. One display set per series.                                                                                                |
| 110      | `rtStructureSet`            | `rtStructureSet`       | `rtStructureSetSopClassUids`. One display set per series.                                                                                              |
| 120      | `parametricMap`             | `parametricMap`        | `parametricMapSopClassUids`. One display set per series.                                                                                               |
| 130      | `structuredReport`          | `structuredReport`     | `structuredReportSopClassUids`, also Comprehensive 3D SR. One display set per series, with the attributes `Manufacturer` and `ManufacturerModelName`.  |
| 140      | `encapsulatedDocument`      | `encapsulatedDocument` | `encapsulatedDocumentSopClassUids`. One display set per revision chain; see [Revision chains](#revision-chains).                                       |
| 150      | `bulkAnnotation`            | `bulkAnnotation`       | `bulkAnnotationSopClassUids`. One display set per series.                                                                                              |
| 160      | `chart`                     | `chart`                | `chartSopClassUids`, empty by default. One display set per revision chain; see [Revision chains](#revision-chains).                                    |
| max      | `unsupported`               | `unsupported`          | Everything else (presentation states, RT Plan, …); see [Objects nothing can render](#objects-nothing-can-render).                                      |

No default rule gives viewport types. The host chooses the viewport from
`handler` and the instance data. A custom rule may set `viewportTypes` for its
own use: CS3D copies it to the display set unchanged, and does not read it.

Each rule in data form also has a `description` that a UI can show. The next sections
explain how your own rules combine with these.

#### Revision chains

An encapsulated document or a chart can replace an earlier instance, and name
it in `PredecessorDocumentsSequence` > `ReferencedSeriesSequence` >
`ReferencedSOPSequence` > `ReferencedSOPInstanceUID`. Only the
`encapsulatedDocument` and `chart` rules use the revision chains. The SR and SEG
rules do not.

- The series function `revisionChains` reads the references one time for each
  series. Only a reference to an instance of the same series counts.
- Each chain end (an instance that no other instance names as a predecessor)
  starts its own chain, and is the active instance of that chain. So two chain
  ends give two display sets.
- The split sorts the instances of the series one time, in the default order
  `sortByInstanceNumber` (`InstanceNumber`, then `SOPInstanceUID`), before the
  series functions run.
  The chain ends are visited in that order, so the input order never matters.
  Each end takes its predecessors, directly and through other instances, that
  no earlier chain took. In a branch, the first chain end in the default order
  takes the shared predecessors: when B (`InstanceNumber` 2) and C (3) both
  name A (1), the display sets are [A, B] and [C].
- An instance that no chain end reaches (only possible with a reference cycle)
  is its own chain.
- `revisionChainUid` (instance scope) is the `SOPInstanceUID` of the active
  instance of the chain. An instance with no chain gets its own
  `SOPInstanceUID`. `isActiveRevision` is `SOPInstanceUID == revisionChainUid`.
- The two rules group by `revisionChainUid`, so each document without a
  predecessor is its own display set, and each chain is one display set. They
  sort by `isActiveRevision` and `InstanceNumber`, so the active instance is
  last. The display set attribute `activeSopInstanceUid` is the
  `revisionChainUid`. Every instance of the chain stays in `instances`.

#### Handlers

A rule can name a `handler`: the generic name of the code that builds the
display sets of one kind of object. `createDisplaySetFromGroup` copies the name
to `displaySet.handler`. The handler decides the class and `isDisplayable`:
no handler or `image` gives an `ImageStackDisplaySet`; `unsupported` gives a
`BaseDisplaySet` that is not displayable; any other handler gives a
displayable `BaseDisplaySet`. The host maps the name to its own code; OHIF maps
it to a SOP class handler. The default names are in
`DISPLAY_SET_HANDLER_NAMES`:

`image`, `video`, `wholeSlide`, `ecg`, `segmentation`, `rtStructureSet`,
`parametricMap`, `structuredReport`, `encapsulatedDocument`, `bulkAnnotation`,
`chart`, `unsupported`.

- A rule without `handler` names no handler. The image rules have none.
- The compile accepts any string. The host decides what an unknown name does;
  OHIF gives the unsupported display set and one console warning for each name.
- A server that only splits does not run a handler. The handler name tells the
  reader of the index which kind of object each display set holds.

### Changes from the earlier default rules

The default rules of this release give different display sets for some
series. A short UID such as `6.1` is the suffix after `1.2.840.10008.5.1.4.1.1.`.

| Rule                                | Change                                                                                                                                                                                                                                                                                                                                                                           | Effect                                                                                                                                                                                                                                                                                                                               |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| all image rules (`isImage`)         | `isImage` reads the list `imageSopClassUids`. The list adds MG For Presentation and For Processing (`1.2`, `1.2.1`), Intra-Oral, US (`3.1`, `6.1`, `6.2`), NM (`20`), IVOCT, ophthalmic photography and tomography, Corneal Topography Map (`82.1`), Enhanced PET (`130`), RT Image and RT Dose (`481.2`). It removes MR Spectroscopy (`4.2`), `13.1.6`, and `128.2` to `128.5`. | US, NM and RT Dose series get an image display set. MR spectroscopy goes to `unsupported`.                                                                                                                                                                                                                                           |
| `singleImageModality`               | CR, DX and MG, one display set per instance. Before, the rule split by a coarse image-size bucket; that split is now an example, see [Example: single images by size](#example-single-images-by-size).                                                                                                                                                                           | Each view of a four-view MG series is its own display set.                                                                                                                                                                                                                                                                           |
| `multiFrame`                        | Each multi-frame image instance, grouped by `SOPInstanceUID`. Each instance is tested. A cine clip gets `isClip: true`.                                                                                                                                                                                                                                                          | An enhanced CT, MR, PT or NM, an Enhanced US Volume and a multi-frame secondary capture are one display set per instance. Before, they went to the volume rules.                                                                                                                                                                     |
| `defaultImageRule`                  | A known image SOP class matches with no `Rows`.                                                                                                                                                                                                                                                                                                                                  | An image whose `Rows` has not loaded gets an image display set, and not `unsupported`.                                                                                                                                                                                                                                               |
| `mixedDimensionalityBValue`         | The MR test was on `instances[0]`; now each instance. `!== undefined` is now a test for no value.                                                                                                                                                                                                                                                                                | `null` and `''` b-values count as no value. A DWI series with `DiffusionBValue: ''` on the b0 frames splits into two. A b-value of `0` is a value.                                                                                                                                                                                   |
| `volume3d`                          | The modality test was on `instances[0]`; now each instance.                                                                                                                                                                                                                                                                                                                      | A series with mixed modalities splits by modality.                                                                                                                                                                                                                                                                                   |
| `video`                             | A video-only SOP class decides alone. Else any available transfer syntax (`AvailableTransferSyntaxUID`, `TransferSyntaxUID`) decides. The guess for a long secondary capture runs only when no transfer syntax is known.                                                                                                                                                         | A long secondary capture with an image transfer syntax is an image, and not a video.                                                                                                                                                                                                                                                 |
| `segmentation` to `chart`           | New rules, each with a `handler`.                                                                                                                                                                                                                                                                                                                                                | SEG, RTSTRUCT, parametric map, SR and bulk annotations get one display set per series. Encapsulated documents and charts get one display set per revision chain. Each has the handler name.                                                                                                                                          |
| all default rules                   | The priorities are `10` to `160`, in steps of 10, and not `1` to `15`. The order of the default rules does not change.                                                                                                                                                                                                                                                           | A custom rule with a priority between two defaults can change its place. For example, a rule at `6.5` ran between `mixedDimensionalityBValue` and `volume3d`, and now runs between `multiFrame` and `localizer`. Give such a rule a new priority, for example `75`. A priority below `0` or above `10000` does not change its place. |
| `localizer`                         | New rule, at `60`. It claims the `LOCALIZER` images (`ImageType`) of a CT, MR or PT series that also has other images.                                                                                                                                                                                                                                                           | The localizer images become one display set with `isLocalizer: true`, and the other images can form a volume. A series of localizers only, and a series with no localizer, do not change.                                                                                                                                            |
| `multiFrame`, `singleImageModality` | `groupBy` is `SeriesInstanceUID`, `InstanceNumber`, `SOPInstanceUID`, and not `SOPInstanceUID` only. The groups do not change.                                                                                                                                                                                                                                                   | The display sets come out in `InstanceNumber` order, and not in UID order. The text of the `splitKey` changes.                                                                                                                                                                                                                       |
| `video` (guess)                     | The guess for a long secondary capture with no known transfer syntax skips a grayscale image (`PhotometricInterpretation` `MONOCHROME1` or `MONOCHROME2`).                                                                                                                                                                                                                       | A grayscale multi-frame secondary capture is an image, and not a video.                                                                                                                                                                                                                                                              |
| `isReconstructable`                 | A single-frame display set with an instance that has no `PixelSpacing` is not reconstructable.                                                                                                                                                                                                                                                                                   | The host does not offer MPR for such a display set.                                                                                                                                                                                                                                                                                  |
| `unsupported`                       | New rule, at `Number.MAX_SAFE_INTEGER`.                                                                                                                                                                                                                                                                                                                                          | Objects that no rule matched were dropped. Now each series of them gives one non-displayable display set, and `onUnmatchedInstance` does not fire with the defaults.                                                                                                                                                                 |
| all rules                           | `viewportTypes` has no meaning in CS3D, and no default rule sets it. A rule may still have it: CS3D copies it to the display set unchanged, and reads it nowhere. The display set has no `preferredViewportType`.                                                                                                                                                                | A host chooses the viewport from `handler` and the instance data. The handler decides the class and `isDisplayable`. The helpers `getViewportTypesForRule`, `getViewportTypesForGroup`, `getPreferredViewportType`, the type `ViewportTypeHint` and `NO_VIEWPORT_TYPE` are removed.                                                  |

**Migration from the array form.** `groupInstancesBySplitRules`,
`splitImageIdsBySplitRules` and `compiledDisplaySetRules` take and give a
`SplitRuleSet` keyed by rule id, and not an ordered array of rules. To migrate a
call:

1. Make each rule of the array an entry of an object, with its `id` as the key.
2. Give each entry a `priority`. The earlier position in the array becomes the
   priority: the first rule gets the lowest number.
3. Merge your rules over `compiledDisplaySetRules` by key, and not with
   `concat`. See [Where your rule runs among the defaults](#where-your-rule-runs-among-the-defaults).

### Rule sets keyed by id

Every function that takes split rules (`groupInstancesBySplitRules`,
`splitImageIdsBySplitRules`) takes a `SplitRuleSet`: the rules keyed by id, each
with a `priority`. `createDisplaySetSplitRules` takes the same shape in data form
and returns one. There is no array form.

```ts
import type { SplitRuleSet } from '@cornerstonejs/metadata';

const ruleSet: SplitRuleSet = {
  // The key is the rule id.
  ctScout: { priority: -1, matches: (i) => i.InstanceNumber === 1 },
  volume3d: { priority: 80, groupBy: ['SeriesInstanceUID'] },
  // `null` excludes the rule.
  unwanted: { priority: null },
};
```

A rule set is usually merged from layers — the defaults, then an application's
overrides. A key cannot occur twice, so a layer replaces a rule, moves it (a new
`priority`), or excludes it (`priority: null`) by its id, and never adds a
second copy.

### Priority and order

- Rules run in ascending `priority`. The first rule that matches an instance
  claims it.
- A priority is any finite number, fractions included. `null` excludes the rule.
- Two rules with the same priority run in the order of their ids, compared as
  strings by UTF-16 code unit (the JavaScript `<` operator, so `'Z'` sorts
  before `'a'`). It is not the order the keys were added in, and not a locale
  order, so the result never depends on how the rule set was built.
- `resolveSplitRuleSet` returns the included rules in this order, each with its
  key as its `id`.

### Where your rule runs among the defaults

The defaults use the priorities `10` to `160`, in steps of 10, and the
catch-all `unsupported` runs last, at `Number.MAX_SAFE_INTEGER` (see
[The default rules](#the-default-rules)). To place a rule of your own:

| You want the rule to run…                            | Give it a priority                                                                             |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| before every default rule                            | below `10`, for example `-1` or `0`                                                            |
| between two default rules                            | a number between theirs that is not a multiple of 10, for example `85` to run after `volume3d` |
| as a fallback, on what the other default rules leave | above `DEFAULT_SPLIT_RULE_PRIORITY_LIMIT` (`10000`), for example `20000`                       |

A fallback rule runs after every other default rule and before `unsupported`,
so it sees the instances that no other default claims. A later release may add
default rules with priorities up to `10000`, so do not depend on the gap
between `160` and `10000` staying empty. A new default rule takes a multiple of
10, so a rule of your own at a number that is not a multiple of 10 keeps its
place among the defaults. To replace the catch-all, exclude it
with `unsupported: { ...compiledDisplaySetRules.unsupported, priority: null }`.

An entry that states an `id` different from its key, or that has a priority
that is missing, or neither `null` nor a finite number, is an error.
`createDisplaySetSplitRules` and `resolveSplitRuleSet` run that check.

A `SplitRule` has up to six parts:

| Field              | Purpose                                                                                                                                                                                                                                                                                                                               |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `matches`          | Returns true if an instance belongs to this rule. Omit to match everything.                                                                                                                                                                                                                                                           |
| `groupBy`          | Keys (tag names or functions) that partition matched instances into separate display sets.                                                                                                                                                                                                                                            |
| `series`           | Optional, code form only. Runs once per split and **returns** facts that extend the series context every code rule reads as `context.series`. The first rule that computes a name wins. A rule in data form does not use this hook: it reads the [display set context](#the-display-set-context), where each name has one definition. |
| `customAttributes` | Returns extra attributes spread flat onto the display set (e.g. `isClip`, `numImageFrames`).                                                                                                                                                                                                                                          |
| `handler`          | The generic handler name of a non-image object. It decides the display set class and `isDisplayable` (see [Handlers](#handlers)).                                                                                                                                                                                                     |
| `viewportTypes`    | Optional strings for the host's own use. CS3D copies them to the display set unchanged, and does not read them. No default rule sets them.                                                                                                                                                                                            |

A rule's `id` is its key in the rule set, so an entry does not repeat it. Most
rules only need `matches` and `groupBy`, plus the entry's `priority`:

```ts
{
  video: {
    priority: 10,
    matches: (instance) => isVideoInstance(instance),
    groupBy: ['SOPInstanceUID'],
  },
}
```

In code, use `series` only when a rule needs a value computed from the
**whole series** and reused by `matches`, `groupBy` or `compareInstances`. A
rule in data form reads such a value as a series entry of the
[display set context](#the-display-set-context). It is
optional, runs **once per split operation**, and returns facts — it should
**not** mutate `context.series`. A fact can be any value: a boolean, a number,
or a summary such as a map from `SOPInstanceUID` to a slice index.

The facts of all rules form one **series context**. The engine runs the hooks
in priority order; each hook gets the facts so far as `context.series`, and a
name that an earlier rule already computed keeps the earlier value. So two
rules that both need the slice geometry can each declare it, and it is computed
once. The DWI fix is the worked example: `series` decides
whether the series mixes b-value and non-b-value frames, and `groupBy` then
separates them into two display sets:

```ts
import type { SplitRuleSetEntry } from '@cornerstonejs/metadata';

// Keyed as `mixedDimensionalityBValue` in the rule set.
const mixedDimensionalityBValue: SplitRuleSetEntry = {
  priority: 70,
  // Computed once over the whole series; returned, not mutated onto shared state.
  series: ({ instances }) => ({
    mixedBValue:
      instances[0]?.Modality === 'MR' &&
      instances.some((i) => i.DiffusionBValue !== undefined) &&
      instances.some((i) => i.DiffusionBValue === undefined),
  }),
  // Reads the series context.
  matches: (_instance, { series }) => series.mixedBValue,
  // Two display sets: undefined-b-value frames split off from the rest.
  groupBy: [
    'SeriesInstanceUID',
    (instance) => instance.DiffusionBValue === undefined,
  ],
};
```

To customize splitting, merge your own rules over the defaults by key — a new id
adds a rule, an existing id replaces one — and pass the result as `splitRules`:

```ts
const splitRules: SplitRuleSet = {
  ...compiledDisplaySetRules,
  // Runs before every default rule.
  ctScout: {
    priority: -1,
    matches: (i) => /localizer|scout/i.test(String(i.SeriesDescription ?? '')),
  },
  // Turns a default rule off without removing its key.
  singleImageModality: {
    ...compiledDisplaySetRules.singleImageModality,
    priority: null,
  },
};
```

Prefer authoring them as data — see
[Sharing rules between applications](#sharing-rules-between-applications-the-display-set-rules)
— so the same rules can also be used outside the viewer.
`customAttributes` may set any attribute, but
the resolved data fields a display set is built from — `imageIds`,
`underlyingImageIds`, `instances`, and `displaySetId` — are reserved and cannot
be overwritten, so the underlying-vs-frame image id invariant the viewports rely
on always holds. The split identity — `splitKey`, `splitRuleId` and
`splitGroupId` — is reserved too, so a rule cannot rename the display set.

The `handler` of the rule decides the display set class and `isDisplayable`
(see [Handlers](#handlers)). `handler` and `isDisplayable` are reserved too, so
custom attributes cannot make them disagree with the class.

A few engine guarantees worth knowing when writing rules:

- **Buckets are namespaced by rule.** Two different rules can never merge into
  one display set even if their `groupBy` values coincide.
- **Keys come from the rule id, not the rule's position.** Moving a rule, or
  adding one with a lower priority, leaves the other rules' `splitKey`s
  unchanged.
- **Keys do not depend on how a host naturalizes a value.** No value (absent,
  `null`, `''`, `[]`) gives one key part, `5`, `'5'` and `[5]` give one key
  part, and `'05'` stays text. So a server and a viewer get the same keys.
- **The split sorts its input first.** `groupInstancesBySplitRules` sorts a
  copy of the instances one time with `sortByInstanceNumber` (`InstanceNumber`,
  then `SOPInstanceUID`), before the `series` hooks and the series functions
  run. The caller's array does not change. The package exports the comparator
  chain (`compare`, `compareInstanceNumber`, `compareSOPInstanceUID`,
  `sortByInstanceNumber`, `instancesSortCriteria`) and `sortInstancesCopy`, so
  a host can sort in the same order. A host gives its own order of each display
  set with its own comparator chain (`GroupInstancesOptions.compareInstances`)
  or a whole-list sort (`GroupInstancesOptions.sortInstances`).
- **Group order is deterministic.** Groups come back sorted by rule priority,
  then by a stable, rule-namespaced split key, so a series' display sets —
  and any id derived from their position — are stable
  regardless of the order the image ids were passed in.
- **A key follows the series values that the rule reads.** For one set of
  instances, the keys do not depend on the arrival order. When the series
  grows, the key of a display set stays the same, unless the rule reads a
  series value in `matches` or `groupBy`, and the new instances change that
  value. This is the intended behaviour: the display sets describe the series
  as it is now. Which values a rule reads depends on the rule:
  - A series value in `matches` decides which rule claims an instance. With one
    CT instance, `seriesInstanceCount > 1` is false, so `defaultImageRule`
    claims it; with two, `volume3d` claims both. `mixedDimensionalityBValue`
    starts to match when the first instance with no b-value arrives.
  - A series value in `groupBy` is part of the key. `sweepStart` is the start
    time of a time cluster, so an instance with an earlier time moves the
    start, and an instance in the gap between two clusters joins them.
  - A rule that reads only instance values (for example
    `groupBy: ['SeriesInstanceUID', 'SOPInstanceUID']`) keeps every key.

  A host that keeps the display sets of a growing series splits the series
  again, and matches the old and the new display sets by `splitKey`. A display
  set whose key is gone is now part of another display set.

- **Each group carries the series context.** `InstanceGroup.series` holds
  the facts the `series` hooks computed over _all_ the instances
  passed to the split, not only the group's. Those can differ: a "mixed b-value"
  fact is true for the series and false for each half. See
  [Who decides instance order](#who-decides-instance-order) for why that
  matters when a group is ordered again later.
- **The default rules test each instance.** `multiFrame` and `volume3d` read
  `NumberOfFrames` and `Modality` of each instance, and not of the first
  instance of the series. A series value, such as `seriesInstanceCount` or the
  b-value mix of `mixedDimensionalityBValue`, is computed over all the
  instances of the series.
- **`series` is shared, and the first name wins.** Every rule reads one series
  context. The compiled data-form rules keep the values of the display set context
  there, under the fact `displaySetContext`. A rule in code that adds its own
  fact must give a name that no other rule gives with a different meaning,
  because the later rule does not compute it.
- **Nothing is dropped by the defaults.** The `unsupported` rule, which runs
  last, claims whatever the other rules did not — see
  [Objects nothing can render](#objects-nothing-can-render). A _custom_ rule set
  without a catch-all does drop unmatched instances; pass `onUnmatchedInstance`
  to `splitImageIdsBySplitRules` to observe them.
- **`buildSeriesInfo` is safe on an empty instance list** — it returns zeroed
  counts. It aggregates series statistics only and is independent of split rules.

## Objects nothing can render

The image rules and the object rules (`segmentation` to `chart`) claim only
their SOP classes, so a series can contain objects no rule claims: an RT Plan,
a presentation state, raw data, MR spectroscopy.

Dropping those is the wrong answer. A dropped instance produces no display set,
which leaves **no trace that the object was in the study at all** — the
application cannot list it, cannot explain it, and cannot tell "we don't support
this" apart from "this isn't here".

So the `unsupported` rule of the default rules, which runs last at
`Number.MAX_SAFE_INTEGER`, is a catch-all that claims everything left and marks
the result **not displayable**:

```ts
const displaySet = createDisplaySetFromGroup(group);

displaySet.isDisplayable; // false
displaySet.imageIds; // [] — there is nothing to render
displaySet.underlyingImageIds; // ['wadors:/…'] — still resolvable by imageId
displaySet.sopClassUids; // ['1.2.840.10008.5.1.4.1.1.11.1'] — *what* it is
displaySet.handler; // 'unsupported'
displaySet.instances; // the full instances, e.g. for Modality / description
```

Points worth knowing:

- **`isDisplayable` is required and derived**, not optional. It is false
  exactly for the handler `unsupported`, and stored as a plain field, so it
  spreads and serializes like every other attribute. Check it before mounting a
  display set:

  ```ts
  if (!displaySet.isDisplayable) {
    // list it in the study browser, don't hand it to a viewport
    return;
  }
  await viewport.setDisplaySets({ displaySetId: displaySet.displaySetId });
  ```

- **One display set per series**, not per object. A series of 300 presentation
  states is one entry, and `sopClassUids` lists the distinct SOP classes in it.
  An application that supports a format adds its own rule (see below), and can
  group by `SOPInstanceUID` there.
- **`imageIds` is empty** for these. Code that ignores `isDisplayable` renders
  nothing rather than treating a document as a one-frame image stack.

### Supporting one of these formats

Add your own rule with a priority _below_ the catch-all's, with its own
`handler`. This is the other half of the user's choice: either take the
non-displayable display set and present it, or teach the rules how to render
the format.

```ts
const splitRules = createDisplaySetSplitRules({
  ...displaySetRules,
  presentationState: {
    // Below 0: runs before every default rule.
    priority: -1,
    handler: 'presentationState',
    matches: { Modality: 'PR' },
    groupBy: ['SeriesInstanceUID', 'SOPInstanceUID'],
  },
});
```

Priority matters: the catch-all has no `matches`, so it claims everything that
reaches it. It runs at `Number.MAX_SAFE_INTEGER`, so every other rule runs
before it. A rule meant only for what the other default rules leave takes a
priority above `DEFAULT_SPLIT_RULE_PRIORITY_LIMIT`, for example `20000`. To
replace the catch-all instead, exclude it with
`unsupported: { ...displaySetRules.unsupported, priority: null }`.

## Sharing rules between applications (the display set rules)

A display set is not only a client-side idea. A server that indexes a study —
static-dicomweb building its metadata tree, say — wants to know what display sets
that study contains, and it has to agree with the viewer that later loads it. If
each side implements the rules itself, they drift, and the display sets the server
advertises stop being the ones the client builds.

So the rules are data, and one shared compiler turns them into functions:

- `displaySetRules` — the default rules as pure JSON, keyed by rule id (see
  [The default rules](#the-default-rules)). No functions, no imports of
  application state.
- `createDisplaySetSplitRules(rules, options)` — turns that JSON, and the
  context entries of `options.context`, into the `SplitRuleSet`
  the split engine executes, with the same keys and priorities.
  An excluded entry (`priority: null`) is compiled and kept, so a later layer
  can include it again by giving it a priority.

`compiledDisplaySetRules` is literally `createDisplaySetSplitRules(displaySetRules)`,
so the data form is never a second-class path: if it could not express a default
rule, the package would not build.

```js
import {
  createDisplaySetSplitRules,
  displaySetRules,
  splitImageIdsBySplitRules,
} from '@cornerstonejs/metadata';

// A server can ship its rules to the client verbatim...
const rulesJson = JSON.stringify(displaySetRules);

// ...and the client compiles the identical rules from it.
const splitRules = createDisplaySetSplitRules(JSON.parse(rulesJson));
const groups = splitImageIdsBySplitRules(imageIds, {
  getNaturalizedInstance,
  splitRules,
});
```

### What a rule is built from

Each name in a rule is one of two kinds:

- A **tag keyword** is a keyword of the DICOM dictionary of dcmjs, for example
  `Modality`. The value comes from the instance.
- A **context name** starts with a lowercase letter, and an entry of the
  [display set context](#the-display-set-context) defines it, for example
  `isImage` or `seriesInstanceCount`.

The compile checks each name: the keys of `matches`, the entries of `groupBy`
and `sortBy`, the strings of `attributes`, the placeholders of a template, and
each name in an expression. A name must match a keyword or a declared context
name with the same case. An unknown name is a compile error that gives the
rule, the place and the name. So `BodyPartExamind` and `sweepStrat` fail when
the rules load. When a known name differs only in case, the error names it:
`unknown name 'modality'; did you mean 'Modality'?`. Operators are also case
sensitive.

The tests and the values inside a rule are the general
[safe function](../safe-functions.md) vocabulary. **See
[Safe Functions](../safe-functions.md) for the full reference of the tests,
the operators and the expression language**, and for the DICOM meaning of an
absent value and an empty value.

| Rule field   | Holds                                                                                      | Compiled to                                        |
| ------------ | ------------------------------------------------------------------------------------------ | -------------------------------------------------- |
| `context`    | context entries for this rule only (see [The `context` of a rule](#the-context-of-a-rule)) | (compile only)                                     |
| `matches`    | a map of name to test; every entry must hold                                               | `(instance, context) => boolean`                   |
| `groupBy`    | names; instances whose values are all equal form one group                                 | each entry: `(instance, context) => value`         |
| `sortBy`     | names (ascending), and `{ "sortFunction": "name" }`                                        | `compareInstances: (a, b, context) => number`      |
| `attributes` | the attributes of the display set, keyed by attribute name                                 | `customAttributes: (attributes, options) => {...}` |

The other fields are data: `id` (optional, must equal the key), `groupId`,
`priority`, `description`, `handler` (see [Handlers](#handlers)) and
`viewportTypes` (copied to the display set, and not read by CS3D).

```jsonc
"dwiByBValue": {
  "priority": -1,
  "context": {
    "bValue": "Number(DiffusionBValue)",
    "isDiffusion": "series.instances.max(bValue) > 0"
  },
  "matches": {
    "Modality": "MR",
    "isDiffusion": true,
    "isImage": true,
    "DiffusionBValue": { "notNull": true }
  },
  "groupBy": ["SeriesInstanceUID", "bValue"],
  "sortBy": ["SliceLocation"],
  "attributes": {
    "SeriesDescription": { "template": "{SeriesDescription} b={DiffusionBValue}" }
  }
}
```

`isDiffusion` needs a b-value above 0 in the series. Some scanners write
`DiffusionBValue` = 0 into every MR series, also into T2 and STIR series. With
`series.instances.count(DiffusionBValue) > 0`, the rule would claim those
series too, because `count(x)` counts a value of `0`. `max` skips an instance
with no b-value, so a series with no b-value gives no value, and the test is
`false`.

#### `matches`

`matches` is one map. Every entry must hold. The map has no `all`, `any` or
`not`:

- `false` on a named boolean gives "not": `"isMultiFrame": false` holds when
  `NumberOfFrames` is absent, because `NumberOfFrames > 1` gives `false`.
- An "or" goes in a context entry, and the rule reads the name of the entry.
- A test without an operator is `includes`, in both forms:
  `"ImageType": "LOCALIZER"` and `"ImageType": ["LOCALIZER"]` both hold for
  `['ORIGINAL', 'LOCALIZER']`, and `"Modality": ["MR", "CT"]` holds for `'MR'`.
  For a whole-value test, use `{ "equals": ["ORIGINAL", "LOCALIZER"] }`.
- In an expression, `Modality == ['MR', 'CT']` is a compile error that names
  `in`; write `Modality in ['MR', 'CT']`.

```jsonc
"context": {
  "isBreastImage": "Modality == 'MG' || (Modality == 'CT' && lower(BodyPartExamined) == 'breast')",
  "pixelCount": "Rows * Columns"
},
"matches": {
  "isImage": true,
  "isBreastImage": true,
  "isMultiFrame": false,
  "pixelCount": { "greaterThan": 4000000 }
}
```

A site changes one entry of a shared rule by its name, and does not copy
expression text into a `$merge`: `"isBreastImage": { "$set": "..." }` replaces
the breast test, and `"pixelCount": { "greaterThan": { "$set": 2000000 } }`
changes the threshold.

#### `sortBy`

- A string is a tag keyword or a context name, which reads the series, or a
  `displaySet.<name>`, which reads the display set (see
  [The series and the display set](#the-series-and-the-display-set)). The order
  is ascending: numeric when both values are finite numbers, else by text. An
  instance with no value goes after the instances with a value.
- `{ "sortFunction": "name" }` is a named comparator of
  `options.sortFunctions`. An unknown name is a compile error.
- A function passes through as is.

#### `attributes`

| Value                             | Gives                                                                                              |
| --------------------------------- | -------------------------------------------------------------------------------------------------- |
| a name                            | a tag keyword reads the first instance of the sorted display set; a context name reads the series  |
| `"displaySet.<name>"`             | the value of a context name over the instances of the display set                                  |
| `"splitNumber"`, `"sopClassUids"` | the values of the display set; only `attributes` can read them                                     |
| a number, a boolean, `null`       | the fixed value                                                                                    |
| `{ "template": "..." }`           | text; `{ "template": "SCOUT" }` is fixed text                                                      |
| `{ "expression": "..." }`         | `displaySet.instances.max(x)` runs over the display set; `series.instances.max(x)` over the series |
| a function `(instances, values)`  | in code only                                                                                       |

`"label": "SCOUT"` is a compile error, because `SCOUT` is not a name. The
message names the template form.

#### The series and the display set

A bare name always means the value of the series. A value of the display set
uses the `displaySet.` prefix, and only `sortBy` and `attributes` accept it:

- In `context`, `matches` and `groupBy`, every series function runs over all
  the instances of the series. The prefix is a compile error there.
- In `sortBy` and `attributes`, `sliceSpacing` is the lattice of the series,
  and `displaySet.sliceSpacing` is the lattice of the instances of the display
  set. The prefix reads a context name, or one field of a group:
  `displaySet.planeGeometry.spacing`. A template reads
  `{displaySet.sliceSpacing}`, and an expression reads
  `displaySet.instances.min(displaySet.sliceDistance)`.
- `series.instances.*(...)` runs over the series in every place, so
  `seriesInstanceCount` is the count of the series also in `attributes`.

```jsonc
"matches": { "sliceSpacing": 1 },                    // the series
"sortBy": ["displaySet.sliceDistance"],              // the display set
"attributes": {
  "spacing": "displaySet.sliceSpacing",              // the display set
  "seriesSpacing": "sliceSpacing"                    // the series
}
```

```jsonc
"attributes": {
  "isClip": true,
  "numImageFrames": { "expression": "Number(NumberOfFrames)" },
  "maxFrames": { "expression": "displaySet.instances.max(NumberOfFrames)" },
  "label": { "template": "{SeriesDescription} #{splitNumber}" }
}
```

`groupId` names a group of rules that describe one kind of display set, and it
defaults to the rule id. A study can hold breast tomosynthesis, legacy
mammography that mixes views in one series, and mammography that the modality
already split. Three rules split those three forms, and all three can use
`groupId: 'mammo'`. A reader such as a hanging protocol then finds every
mammography display set by the group id, whichever rule made it. The group id
does not change the split: groups and split keys stay per rule id.

### The display set context

`createDisplaySetSplitRules(rules, { context })` takes one map of named
entries, over the entries of `defaultMetadataContext`. OHIF reads the map from
the `metadataContext` customization. Each entry has one of five forms:

| Form                                                     | Meaning                                                                                               |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| a number, a boolean, `null` or an array                  | a fixed value; a site changes it with `$set`                                                          |
| a string                                                 | an expression; a name or a path (`"timeClusters.start"`) is the simplest expression                   |
| `{ "attribute": "00191010", "vr"?, "vm"? }`              | a declaration: reads one attribute of the instance that the dictionary does not hold                  |
| `{ "template": "{SeriesDescription} +{sweepOffset} s" }` | text; each `{name}` gives the value of a name or a path                                               |
| `{ "function": "timeClusters", "args": {...} }`          | a group: one call of a series function; each argument is a fixed value or an expression of the series |

The rules:

- A context name starts with a lowercase letter. A context name cannot be a
  tag keyword, so a context never hides a value of the instance.
- An attribute that the dictionary does not hold is available only through a
  declaration: a private tag (8-digit hex, for now), a vendor attribute, or a
  synthetic attribute such as `imageId`. A rule cannot read a hex tag directly.
  `vr` and `vm` are recorded for a later JSON Schema.
- A rule reads a field of a group by path. Each series function declares its
  result fields, so `timeClusters.cluster` is a compile error. An alias makes a
  field into a top-level name: `"sweepStart": "timeClusters.start"`.
- Entries can read other entries in any order. A loop of entries is a compile
  error.
- The compile infers the scope of each entry. A declaration, a code entry, and
  an entry that reads an instance value outside of a `series.instances.*(...)`
  aggregate have the instance scope. Every other entry has the series scope.
- An aggregate names its receiver. `series.instances.max(NumberOfFrames)` is
  the maximum over the instances of the series, and `series.instances.count()`
  is the number of instances. `displaySet.instances.max(x)` runs over the
  instances of one display set, and only the `{ "expression" }` form of
  `attributes` can use it. A bare `max(x)` is a compile error. `displaySets`
  is reserved for a later change
  ([issue 3000](https://github.com/cornerstonejs/cornerstone3D/issues/3000)).
- The engine computes an entry at the first read, one time for each series, and
  keeps the value in a cache. When the series gets new instances, the next
  split computes the value again.

#### The default context

```jsonc
{
  "timeClustersMaxGap": 30,
  "timeClusters": {
    "function": "timeClusters",
    "args": { "maxGap": "timeClustersMaxGap" },
  },
  "longTimeClusters": { "function": "timeClusters", "args": { "maxGap": 60 } },
  "sweepCount": "timeClusters.clusters",
  "sweepStart": "timeClusters.start",
  "acquisitionSeconds": "timeClusters.time",
  "sweepOffset": "round(sweepStart - timeClusters.first)",

  "planeGeometryTolerance": 0.1,
  "planeGeometry": {
    "function": "planeGeometry",
    "args": { "tolerance": "planeGeometryTolerance" },
  },
  "sliceSpacing": "planeGeometry.spacing",
  "sliceIndex": "planeGeometry.index",
  "sliceDistance": "planeGeometry.distance",

  "revisionChains": { "function": "revisionChains" },
  "revisionChainUid": "revisionChains.active",
  "isActiveRevision": "SOPInstanceUID == revisionChainUid",

  "seriesInstanceCount": "series.instances.count()",
  "isMultiFrame": "NumberOfFrames > 1",

  "imageId": { "attribute": "imageId" },

  // The lists: see "The SOP class lists" below.
  "imageSopClassUids": ["1.2.840.10008.5.1.4.1.1.1", "..."],
  "videoSopClassUids": ["..."],
  "videoTransferSyntaxUids": ["..."],
  "longVideoSopClassUids": ["..."],
  "longVideoMinFrames": 90,
  "ecgSopClassUids": ["..."],
  "wholeSlideSopClassUids": ["..."],
  "segmentationSopClassUids": ["..."],
  "rtStructureSetSopClassUids": ["..."],
  "parametricMapSopClassUids": ["..."],
  "structuredReportSopClassUids": ["..."],
  "encapsulatedDocumentSopClassUids": ["..."],
  "bulkAnnotationSopClassUids": ["..."],
  "chartSopClassUids": [],

  "isImage": "SOPClassUID in imageSopClassUids",
  "transferSyntaxKnown": "AvailableTransferSyntaxUID != null || TransferSyntaxUID != null",
  "isVideo": "SOPClassUID in videoSopClassUids || AvailableTransferSyntaxUID in videoTransferSyntaxUids || TransferSyntaxUID in videoTransferSyntaxUids || (!transferSyntaxKnown && SOPClassUID in longVideoSopClassUids && NumberOfFrames >= longVideoMinFrames)",
  "isEcg": "SOPClassUID in ecgSopClassUids",
  "isWsi": "SOPClassUID in wholeSlideSopClassUids || Modality == 'SM'",
  "isSegmentation": "SOPClassUID in segmentationSopClassUids",
  "isRtStructureSet": "SOPClassUID in rtStructureSetSopClassUids",
  "isParametricMap": "SOPClassUID in parametricMapSopClassUids",
  "isStructuredReport": "SOPClassUID in structuredReportSopClassUids",
  "isEncapsulatedDocument": "SOPClassUID in encapsulatedDocumentSopClassUids",
  "isBulkAnnotation": "SOPClassUID in bulkAnnotationSopClassUids",
  "isChart": "SOPClassUID in chartSopClassUids",
}
```

Every entry is data, so the same JSON overlay works in a viewer and on a
server. See [Instance classifiers](#instance-classifiers) for the code tests
that give the same result.

#### The SOP class lists

Each list is a context entry and a named export of `@cornerstonejs/metadata`,
with the same name. The lists do not overlap, except that `videoSopClassUids`,
`longVideoSopClassUids` and `wholeSlideSopClassUids` are also in
`imageSopClassUids`; the `video` and `wholeslide` rules run first.

| List                               | Holds                                                                                              |
| ---------------------------------- | -------------------------------------------------------------------------------------------------- |
| `imageSopClassUids`                | the image storage SOP classes, also Corneal Topography Map and RT Dose                             |
| `videoSopClassUids`                | Video Endoscopic, Video Microscopic, Video Photographic: video with any transfer syntax            |
| `videoTransferSyntaxUids`          | the MPEG-2, MPEG-4 AVC/H.264 and HEVC/H.265 transfer syntaxes                                      |
| `longVideoSopClassUids`            | the secondary captures that are video at `longVideoMinFrames` (90) frames, when no syntax is known |
| `ecgSopClassUids`                  | the ECG and waveform SOP classes                                                                   |
| `wholeSlideSopClassUids`           | VL Whole Slide Microscopy                                                                          |
| `segmentationSopClassUids`         | Segmentation, Label Map Segmentation                                                               |
| `rtStructureSetSopClassUids`       | RT Structure Set                                                                                   |
| `parametricMapSopClassUids`        | Parametric Map                                                                                     |
| `structuredReportSopClassUids`     | Basic Text, Enhanced, Comprehensive, Comprehensive 3D and X-Ray Radiation Dose SR                  |
| `encapsulatedDocumentSopClassUids` | Encapsulated PDF                                                                                   |
| `bulkAnnotationSopClassUids`       | Microscopy Bulk Simple Annotations                                                                 |
| `chartSopClassUids`                | empty; a host adds its own chart SOP class                                                         |

A site changes a list with one overlay, with the standard `immutability-helper`
commands:

```jsonc
{ "imageSopClassUids": { "$push": ["1.2.3.4"] } }
```

The overlay changes the rules, and the code tests (`isImageInstance` and the
others) when the host also gives it to `setMetadataContext`. The exported
constants stay the read-only defaults.

The series functions:

- `planeGeometry` gives the dominant image plane, the slice spacing, and the
  instances on a regular slice lattice. Series fields: `normal`, `origin`,
  `spacing`, `regularCount`, `irregularCount`, `positions`, `complete`,
  `duplicates`. Instance fields: `distance` (in mm along the normal, from one
  origin for the full series) and `index` (the lattice index of a regular
  instance). `args.tolerance` (default `0.1`) is the fraction of the spacing
  that a slice can be off the lattice.
- `revisionChains` gives the revision chains of `PredecessorDocumentsSequence`.
  Instance field: `active`. See [Revision chains](#revision-chains).
- `timeClusters` gives clusters of contiguous acquisition time. Series fields:
  `first`, `clusters`, `untimedCount`. Instance fields: `time` and `start`. A
  gap of more than `args.maxGap` seconds (default `30`) starts a new cluster.

An instance field is a map keyed by the `SOPInstanceUID` (else the `imageId`),
and a read of the path gives the value of the instance at hand.
`options.seriesFunctions` adds or replaces a series function: a definition
`{ compute, fields }` declares the result fields, and a bare function has fields
that the compile does not check.

#### The `context` of a rule

- A rule `context` has the same forms as the global context (the `context`
  option).
- An entry in the rule `context` replaces the global entry with the same name,
  for this rule only. A rule `context` can also define a new name, and only
  that rule can read it.
- The replacement also applies inside the global entries that the rule reads.
  So the rule can change one argument, or select a different group, and every
  alias follows the change.
- An entry that reads its own name gets the global value:
  `"timeClustersMaxGap": "timeClustersMaxGap * 2"`.
- A group is a value. `"timeClusters": "longTimeClusters"` gives the result of
  `longTimeClusters` to every entry that reads `timeClusters`.
  `"timeClusters": 5` is a compile error, because the aliases read
  `timeClusters.start`.
- The cache key of an entry holds only the replaced names that the entry reads.
  Rules that replace nothing share one computation.
- The logger `cs3d.metadata.displayset.displaySetContext` records each
  replacement at the debug level.

```jsonc
"usTimeClusters": {
  "priority": -1,
  "context": { "timeClustersMaxGap": 20 },
  "matches": {
    "isImage": true,
    "Modality": "US",
    "isMultiFrame": false,
    "sweepCount": { "greaterThan": 1 },
    "sweepStart": { "notNull": true }
  },
  "groupBy": ["SeriesInstanceUID", "sweepStart"],
  "sortBy": ["acquisitionSeconds"],
  "attributes": { "SeriesDescription": { "template": "{SeriesDescription} +{sweepOffset} s" } }
}
```

The gap of 20 seconds applies to this rule only. Other rules keep the default
gap of 30 seconds. `{ "greaterThan": 1 }` is a strict `>`, so a series with one
sweep does not match.

#### Code entries

A split that needs complex logic is best written as a new series function in
code. The context then gives a name to each field of its result, and the rules
stay data.

In code, an entry can be a function `(instance, values) => value`, with the
instance scope. `values` reads every name; each call gets a new `values`. A
series entry in code is a group `{ "function": fn }`: the runtime calls
`fn(instances, { args })` with the instances of the series and the evaluated
arguments, and nothing else. A series code entry reads another context value
only through an argument expression. The `function` of a group can also be a
definition `{ compute, fields }`.

The compile cannot see the names that a code entry reads. So a loop through a
code entry (`first` reads `second`, which reads `first`) gives a
`RuleCompileError` at the first read, and the error names each entry of the
loop. A rule entry in code that reads its own name gets the global entry, as a
data entry does.

`deniedNames` is the deny list of the host, for example
`['PatientName', 'PatientID', 'OtherPatientIDsSequence']`. A rule or a context
entry that names a denied name is a compile error, and the `values` of a code
entry give `undefined` for it. A rule can read a whole sequence as a value, so
deny each sequence that holds a denied attribute too: `OtherPatientIDsSequence`
holds `PatientID`. A code entry also gets the instance itself, so do not register a code
entry that reads a denied attribute from the instance. A split that needs complex logic is a new series
function in code, and the context then gives names to its result fields. A
rule set that reads a code entry is still JSON, but the host that compiles it
must register the same entry.

```js
const splitRules = createDisplaySetSplitRules(myRules, {
  context: {
    // Read from data as "isSiteProtocol": true
    isSiteProtocol: (instance) => instance.ProtocolName?.startsWith('SITE-'),
  },
  sortFunctions: {
    // Read from data as { "sortFunction": "byInstanceNumberDescending" }
    byInstanceNumberDescending: (a, b) => b.InstanceNumber - a.InstanceNumber,
  },
});
```

### The schema of a rule

Every place in a rule, and the forms each place accepts, are one internal
table. `createDisplaySetSplitRules` reads it to check the keys, to select the
form of each fragment, and to build its error messages. The table is not
exported; the field table above and the errors below describe it.

The compiler is **strict**. A wrong rule fails at compile time, and the
compiler never ignores it:

```text
Invalid display set rules: rule 'r': unknown field 'matchs'; allowed: id, groupId, priority, description, viewportTypes, handler, context, matches, groupBy, sortBy, attributes
Invalid display set rules: rule 'r'.matches.BodyPartExamind: unknown name 'BodyPartExamind': it is not a keyword of the DICOM dictionary; a private, vendor or synthetic attribute needs a declaration, e.g. "myValue": { "attribute": "BodyPartExamind" }
Invalid display set rules: rule 'r'.attributes.label: unknown name 'SCOUT': ...; fixed text is { "template": "SCOUT" }
Invalid display set rules: context.first: the context entries form a loop: first -> second -> first
Invalid display set rules: rule 'r'.matches.displaySet.sliceSpacing: the 'displaySet.' prefix is valid only in sortBy and attributes
```

An actual function passes through as is at every function place: a whole
`matches`, the test of one entry of `matches`, a `groupBy` entry, a
`sortBy` entry, a whole `attributes` (the `customAttributes` hook), and one
attribute value. The strictness applies to data only. A rule set with a
function in it is no longer JSON, so it cannot be shared with a server.

### Who decides instance order

Instance order has layers, and each layer defers to the layer below:

1. **The default order**, `sortByInstanceNumber` (`InstanceNumber`, then
   `SOPInstanceUID`), always
   applies first. It is never the order in which the image ids arrived, so the
   result does not depend on that order.
2. **The base sort of the host**, `GroupInstancesOptions.sortInstances`, given
   to `groupInstancesBySplitRules` / `splitImageIdsBySplitRules`. It is a sort
   of the **whole list**, and not a comparator, because a real base order is
   not always pairwise: an order of slices along the scan axis selects a
   reference instance and projects the other instances onto its normal.
3. **Comparators**: the `sortBy` of the rule first, then the
   `GroupInstancesOptions.compareInstances` of the host.

A comparator that **gives 0 has no opinion**. It does not say that the two
instances are interchangeable: the next comparator decides, and if no
comparator has an opinion, the base order applies. A `NaN` is also "no
opinion".

The host gives the base sort, so that the _default_ order is the same for each
system that splits the series. `orderInstancesForRule` gives the whole
composition, so that a host that orders a display set again (after new
instances arrive) gets the same order. Give the series facts of the group when
you do this. A `sortBy` name such as `sliceDistance` reads a value of the whole
split, and a value computed from the group alone can be different
(`displaySet.sliceDistance` reads the group). When the
list holds new instances, `orderInstancesForRule` computes the context values
again over the instances of the split and the new instances, so the new
instances take their correct places:

```ts
const [group] = groupInstancesBySplitRules(instances, splitRules);

const reordered = orderInstancesForRule(
  [...group.instances, ...newInstances],
  group.matchedRule,
  { series: group.series, sortInstances }
);
```

A rule also has a `description`. The explanation is in the rule data, and not
in a code comment, so a UI that lets a user inspect or toggle rules reads it
from the rules. The **Display Set Rules** example
(`packages/core/examples/displaySetRules`) does this. It lists every standard
rule with a checkbox, its priority and its description, it accepts rules as JSON
keyed by id, and it splits the loaded series again at once.

Two rules from the defaults, in raw form:

```js
{
  // Each multi-frame image instance; a cine clip is flagged isClip.
  multiFrame: {
    priority: 50,
    context: { isCineClip: 'SliceLocation != null || ...' },
    matches: { isImage: true, isMultiFrame: true },
    // One display set for each instance, in InstanceNumber order.
    groupBy: ['SeriesInstanceUID', 'InstanceNumber', 'SOPInstanceUID'],
    attributes: {
      isClip: 'isCineClip',
      numImageFrames: { expression: 'Number(NumberOfFrames)' },
    },
  },

  // The DWI fix: split the undefined-b-value frames off the 4D set.
  mixedDimensionalityBValue: {
    priority: 70,
    context: {
      isMixedBValue:
        'series.instances.count(DiffusionBValue) > 0 && ' +
        'series.instances.count(DiffusionBValue) < series.instances.count()',
      hasNoBValue: 'DiffusionBValue == null',
    },
    matches: { Modality: 'MR', isMixedBValue: true, isImage: true, Rows: { notNull: true } },
    groupBy: ['SeriesInstanceUID', 'hasNoBValue'],
  },
}
```

### Optional rules

`@cornerstonejs/metadata` ships rules that are not defaults. A host turns them
on by id. Each one is a JSON file in `rules/optional/<id>.json` of the npm
package, in the format of the `mammoViewSplit.json` example: `name`, `notes`,
`requires`, `displaySetContext` and `rules`. A server reads the files from the
package (`@cornerstonejs/metadata/rules/optional/<id>.json`).
`optionalDisplaySetRules` holds the same data, keyed by id.

| Id                       | What it does                                                                                                                                                         | Priority |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| `dwiByBValue`            | One display set for each `DiffusionBValue` of a DWI series.                                                                                                          | `-1`     |
| `multiEchoByEchoTime`    | One display set for each `EchoTime` of a single-frame MR series.                                                                                                     | `-1`     |
| `singleImageSeriesStack` | One stack for each CR, DX or MG series, sorted by `ImageLaterality`, `ViewPosition`, `InstanceNumber`. CR and DX only up to `singleImageSeriesMaxImages` (9) images. | `-1`     |
| `volumePositionOrder`    | The instances of `volume3d`, with the slices in position order (`sliceDistance`).                                                                                    | `79`     |
| `byAcquisitionTime`      | One display set for each `AcquisitionNumber` of a CT, MR, PT or NM series, in acquisition time order.                                                                | `78`     |
| `usTimeClusters`         | One display set for each ultrasound sweep.                                                                                                                           | `-1`     |
| `regularVolume`          | The regular slices of a series with some irregular images become one volume.                                                                                         | `-2`     |
| `derivedObjectVersions`  | One display set for each SR or SEG instance, in content date order, with `isLatestVersion`.                                                                          | `-1`     |

`withOptionalDisplaySetRules` merges the selected files into the default rules.
It throws when a rule id or a context name of a file is already in the rules,
in the default metadata context, or in an earlier file:

```ts
import {
  createDisplaySetSplitRules,
  withOptionalDisplaySetRules,
} from '@cornerstonejs/metadata';

const { rules, context } = withOptionalDisplaySetRules([
  'dwiByBValue',
  'byAcquisitionTime',
]);
const splitRules = createDisplaySetSplitRules(rules, { context });
```

An optional rule uses a priority below `0`, or a priority between two defaults
that is not a multiple of 10. No optional rule reads a vendor private attribute.

### Extending the display set rules

Derive from the defaults and compile the result. Rules run in ascending
priority, so give a rule a priority below `0` to claim instances before any
default rule sees them:

#### Example: single images by size

The default `singleImageModality` rule gives each CR, DX and MG instance its
own display set. A site that wants one stack for each image size instead loads
this rule. It runs before the default rule, and groups the single images of a
series by a coarse size bucket (OHIF ships it as the module
`split/singleImagesBySize.jsonc`):

```js
const splitRules = createDisplaySetSplitRules({
  ...displaySetRules,
  singleImagesBySize: {
    priority: -1,
    // The `/64` rounding is a fuzzy bucket, and can straddle a boundary
    // (480 -> 8, 544 -> 9).
    context: {
      rowsBucket: 'round(Rows / 64)',
      columnsBucket: 'round(Columns / 64)',
      imageSizeBucket: { template: 'rows={rowsBucket}&cols={columnsBucket}' },
    },
    matches: { Modality: ['CR', 'DX', 'MG'], isImage: true },
    groupBy: ['SeriesInstanceUID', 'imageSizeBucket'],
  },
});
```

A context value that a site can change goes in the global context:

```js
const splitRules = createDisplaySetSplitRules(
  {
    ...displaySetRules,
    dxCrSmallSeries: {
      priority: -1,
      matches: { Modality: ['DX', 'CR'], isImage: true, isSmallSeries: true },
      groupBy: ['SeriesInstanceUID', 'SOPInstanceUID'],
    },
  },
  {
    context: {
      dxCrMaxImages: 9,
      isSmallSeries: 'seriesInstanceCount <= dxCrMaxImages',
    },
  }
);
```

A site changes the limit for all rules with `"dxCrMaxImages": { "$set": 20 }`.
One rule changes the limit for itself with `"context": { "dxCrMaxImages": 20 }`.

The key is the id of the rule, so ids are unique by construction. An id
namespaces the bucket keys that its rule makes. Thus a site can edit a rule set
(move a rule, or insert a rule), and the display set identities of the other
rules do not change.

A rule set can only read the attributes that the host puts on the instance. A
rule that reads an attribute that the host does not supply compiles, and then
groups every instance together. See
[the subject is part of the contract](../safe-functions.md#names-belong-to-the-consumer).

### How an application's customization layer fits

Cornerstone knows nothing about OHIF `customizationService`, or about the
configuration of any other application, and must not. The dependency goes one
way: the application resolves its own overrides and gives
`createDisplaySetSplitRules` plain data. OHIF reads the rules from
`splitRules` of the `useMetadataDisplaySet` customization, and the context
from the standalone `metadataContext` customization.

```js
// In the application, not in cornerstone.
const { splitRules: customRules } =
  customizationService.getCustomization('useMetadataDisplaySet') ?? {};
const context = customizationService.getCustomization('metadataContext');

const splitRules = createDisplaySetSplitRules(
  { ...displaySetRules, ...customRules },
  { context }
);
```

The two sides apply a new instance in different ways. OHIF adds a new instance
to the display sets without a new split: a saved SEG or SR instance goes on the
end of its display set. A server splits the whole series again when an
instance arrives.

The customization value is JSON. So a back end with no customization service can
get the same value: it reads the rules and the context from its
configuration, and compiles them with the same call. Thus the display set rules
of one deployment are the same on both sides of the wire. The OHIF side is in
[Customization Service → Display Set Split Rules](https://docs.ohif.org/platform/services/customization-service/displaySetSplitRules).

### Instance classifiers

The default rules use small SOP-class and modality tests. The context has them
as the expressions `isImage`, `isVideo`, `isEcg` and `isWsi` over the
[SOP class lists](#the-sop-class-lists). The package also exports each test as
code that reads the same exported lists, so you can find the kind of a series
without a second copy of the UID lists:

- `isImageInstance(instance)`: the SOP class is in `imageSopClassUids`.
- `isVideoInstance(instance)`: the SOP class is in `videoSopClassUids`; else
  any available transfer syntax is in `videoTransferSyntaxUids`; else, with no
  known transfer syntax, a secondary capture of `longVideoSopClassUids` with at
  least `longVideoMinFrames` frames.
- `isEcgInstance(instance)`: the SOP class is in `ecgSopClassUids`.
- `isWsiInstance(instance)`: the SOP class is in `wholeSlideSopClassUids`, or
  the modality is `SM`.

Each function reads its context entry (`isImage`, `isVideo`, `isEcg`,
`isWsi`), so the functions and the rules give the same answer. Each takes an
optional second argument, the context; without it, the function reads the
**active metadata context**:

```js
import {
  setMetadataContext,
  getMetadataContext,
  getContextValue,
  isImageInstance,
} from '@cornerstonejs/metadata';

// The host gives the same context to the rules and to the code tests.
setMetadataContext(context); // undefined goes back to defaultMetadataContext
const splitRules = createDisplaySetSplitRules(rules, { context });

isImageInstance(instance); // reads the active context
isImageInstance(instance, otherContext); // reads otherContext
getContextValue('isMultiFrame', instance); // any instance-scope name
```

- `setMetadataContext(context)` sets the entries over `defaultMetadataContext`
  that the functions read. `getMetadataContext()` returns it. The default is
  `defaultMetadataContext`.
- Each context object compiles one time; the cache is keyed by the object. A
  new object gives a new compile.
- `getContextValue(name, instance, context?)` reads one context name for one
  instance, with no rules. A series-scope entry (for example
  `seriesInstanceCount`) is an error, because one instance is not a series.
- `createDisplaySetSplitRules` with no series functions and no deny list uses
  the same cache, so a split and the code tests share one compile of the same
  context object.

## Display set attributes (`IDisplaySet`)

A display set implements `IDisplaySet`, which declares the **common attributes**
read from a display set as plain data — not accessor methods — so it behaves
like the OHIF display set object:

```ts
const displaySet = createDisplaySetFromGroup(group);

displaySet.displaySetId; // positional within one split; not a stable identity
displaySet.splitKey; // the rule id and the groupBy values: the stable identity
displaySet.splitRuleId; // the rule that made the display set
displaySet.splitGroupId; // the rule's groupId, else the rule id
displaySet.handler; // the rule's handler name, e.g. 'segmentation'; absent for an image
displaySet.isDisplayable; // false for objects nothing can render — check before mounting
displaySet.instances; // readonly NaturalizedInstance[]
displaySet.imageIds; // frame-level, renderable image ids
displaySet.underlyingImageIds; // SOP-level image ids (one per instance)
```

### Adding new display set attributes

- **Shared / common attributes** belong on `IDisplaySet` directly. Declare them
  optional unless every display set populates them. Many are produced by a split
  rule's `customAttributes` callback and spread flat onto the display set in
  `createDisplaySetFromGroup` (for example `isMultiFrame`, `isClip`,
  `numImageFrames`, `splitNumber`). `createDisplaySetFromGroup` also sets
  `isReconstructable` on each image display set.
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

## Related docs

- [Cornerstone Metadata](./index.md)
- [Metadata Providers](../cornerstone-core/metadataProvider.md)
