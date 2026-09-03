---
id: display-sets
title: Display Sets
summary: Framework-agnostic display-set splitting in @cornerstonejs/metadata — the split/create/consume pipeline, split rules, and the IDisplaySet data model
---

# Display Sets

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
  defaultDisplaySetSplitRules,
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
  splitRules: defaultDisplaySetSplitRules,
});

const displaySets: IDisplaySet[] = groups.map((group) =>
  createDisplaySetFromGroup(group)
);
```

## Driving a viewport from a display set

Each display set exposes the viewport type(s) it can be shown in
(`viewportTypes`, with `preferredViewportType` being the first). A viewport's
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

const HINT_TO_VIEWPORT_TYPE: Record<string, Enums.ViewportType> = {
  stack: ViewportType.STACK,
  volume: ViewportType.ORTHOGRAPHIC,
  volume3d: ViewportType.VOLUME_3D,
  video: ViewportType.VIDEO,
  wholeslide: ViewportType.WHOLE_SLIDE,
  ecg: ViewportType.ECG,
};

const displaySetId = displaySet.displaySetId;

// 1. Register the renderable data so the viewport can resolve `displaySetId`.
//    stack/volume use { imageIds }; video/ecg use { kind, sourceDataId };
//    wsi uses { kind: 'wsi', imageIds, options: { webClient } }.
utilities.genericViewportDisplaySetMetadataProvider.add(displaySetId, {
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

`getDisplaySets()` is available on both the legacy `Viewport` and the generic
viewport, so mounted display sets can be read uniformly across either hierarchy.

The runnable end-to-end version (all five viewport families, plus a dropdown to
switch a display set among its allowed viewport types) is the **Display Sets**
example under `packages/core/examples/displaySets`.

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

Split rules decide how a series' instances are grouped into display sets and
which viewport types each group supports. `defaultDisplaySetSplitRules` covers
the common DICOM cases (video, ECG, whole-slide, single-image modalities,
multi-frame clips, mixed-b-value DWI, volumetric series, and a fallback image
rule). Rules are evaluated **in order, first match wins per instance**.

A `SplitRule` has up to five parts:

| Field              | Purpose                                                                                                                       |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| `matches`          | Returns true if an instance belongs to this rule. Omit to match everything.                                                   |
| `groupBy`          | Keys (tag names or functions) that partition matched instances into separate display sets.                                    |
| `series`           | Optional. Runs once per rule per split and **returns** that rule's derived facts; `matches`/`groupBy` read them via `series`. |
| `viewportTypes`    | Allowed viewport types for the produced display sets; index `0` is preferred.                                                 |
| `customAttributes` | Returns extra attributes spread flat onto the display set (e.g. `isClip`, `numImageFrames`).                                  |

Most rules only need `matches` and `groupBy`:

```ts
{
  matches: (instance) => isVideoInstance(instance),
  groupBy: ['SOPInstanceUID'],
}
```

Reach for `series` only when a rule needs a value computed from the **whole
series** and reused by `matches` or `groupBy`. It is optional, runs **once per
rule per split operation**, and returns derived facts for that rule — it should
**not** mutate shared state. The DWI fix is the worked example: `series` decides
whether the series mixes b-value and non-b-value frames, and `groupBy` then
separates them into two display sets:

```ts
import type { SplitRule } from '@cornerstonejs/metadata';

const mixedDimensionalityBValue: SplitRule = {
  id: 'mixedDimensionalityBValue',
  viewportTypes: ['volume', 'volume3d', 'stack'],
  // Computed once over the whole series; returned, not mutated onto shared state.
  series: ({ instances }) => ({
    mixedBValue:
      instances[0]?.Modality === 'MR' &&
      instances.some((i) => i.DiffusionBValue !== undefined) &&
      instances.some((i) => i.DiffusionBValue === undefined),
  }),
  // Reads this rule's own derived facts.
  matches: (_instance, { series }) => series.mixedBValue,
  // Two display sets: undefined-b-value frames split off from the rest.
  groupBy: [
    'SeriesInstanceUID',
    (instance) => instance.DiffusionBValue === undefined,
  ],
};
```

To customize splitting, prepend your own rules to (or replace) the defaults and
pass the result as `splitRules`. Prefer authoring them as data — see
[Sharing rules between applications](#sharing-rules-between-applications-the-raw-selector)
— so the same rules can also be used outside the viewer.
`customAttributes` may set any attribute, but
the resolved data fields a display set is built from — `imageIds`,
`underlyingImageIds`, `instances`, and `displaySetId` — are reserved and cannot
be overwritten, so the underlying-vs-frame image id invariant the viewports rely
on always holds.

A few engine guarantees worth knowing when writing rules:

- **Buckets are namespaced by rule.** Two different rules can never merge into
  one display set even if their `groupBy` values coincide.
- **Group order is deterministic.** Groups come back sorted by a stable,
  rule-namespaced key, so a series' display sets — and any id derived from their
  position — are stable regardless of the order the image ids were passed in.
- **`series` samples `instances[0]`** for some facts (e.g. multi-frame,
  volumetric), so those rules assume a homogeneous series. A heterogeneous series
  needs a dedicated rule (as `mixedDimensionalityBValue` does for DWI) to
  separate it.
- **`series` is scoped to its own rule.** A rule only ever sees the facts its own
  `series` hook returned; it cannot read another rule's facts, and it must not
  mutate shared state.
- **Nothing is dropped by the defaults.** The final `unsupported` rule claims
  whatever the image rules did not — see
  [Objects nothing can render](#objects-nothing-can-render). A _custom_ rule set
  without a catch-all does drop unmatched instances; pass `onUnmatchedInstance`
  to `splitImageIdsBySplitRules` to observe them.
- **`buildSeriesInfo` is safe on an empty instance list** — it returns zeroed
  counts. It aggregates series statistics only and is independent of split rules.

## Objects nothing can render

Every image rule requires a renderable image, so a series can contain objects no
rule claims: a SEG, RTSTRUCT, RTDOSE, RTPLAN, SR, encapsulated PDF, presentation
state — or an image whose `Rows` have not loaded yet.

Dropping those is the wrong answer. A dropped instance produces no display set,
which leaves **no trace that the object was in the study at all** — the
application cannot list it, cannot explain it, and cannot tell "we don't support
this" apart from "this isn't here".

So the last rule in the default selector is a catch-all that claims everything
left and marks the result **not displayable**:

```ts
const displaySet = createDisplaySetFromGroup(group);

displaySet.isDisplayable; // false
displaySet.viewportTypes; // ['none']  — the NO_VIEWPORT_TYPE sentinel
displaySet.preferredViewportType; // 'none', not a misleading 'stack'
displaySet.imageIds; // [] — there is nothing to render
displaySet.underlyingImageIds; // ['wadors:/…'] — still resolvable by imageId
displaySet.sopClassUids; // ['1.2.840.10008.5.1.4.1.1.66.4'] — *what* it is
displaySet.instances; // the full instances, e.g. for Modality / description
```

Points worth knowing:

- **`isDisplayable` is required and derived**, not optional. It is computed from
  `viewportTypes` (false exactly when they contain `NO_VIEWPORT_TYPE`) and stored
  as a plain field, so it spreads and serializes like every other attribute and
  can never disagree with the viewport types. Check it before mounting a display
  set:

  ```ts
  if (!displaySet.isDisplayable) {
    // list it in the study browser, don't hand it to a viewport
    return;
  }
  await viewport.setDisplaySets({ displaySetId: displaySet.displaySetId });
  ```

- **`'none'` is a sentinel, not an empty list.** An absent or empty
  `viewportTypes` falls back to `['stack']`, so "empty" cannot mean "not
  renderable" — that fallback would quietly turn a structured report into a stack.
- **One display set per object**, not per series: each of these is a document in
  its own right (one SEG, one SR), so a series' worth of them does not collapse
  into one display set.
- **`imageIds` is empty** for these. Code that ignores `isDisplayable` renders
  nothing rather than treating a document as a one-frame image stack.

### Supporting one of these formats

Add your own rule _before_ the catch-all, with real viewport types. This is the
other half of the user's choice: either take the non-displayable display set and
present it, or teach the selector how to render the format.

```ts
const splitRules = createDisplaySetSplitRules([
  {
    id: 'seg',
    viewportTypes: ['stack', 'volume'],
    matches: { attribute: 'Modality', equals: 'SEG' },
    groupBy: ['SeriesInstanceUID', 'SOPInstanceUID'],
  },
  ...rawDisplaySetSelector, // 'unsupported' stays last
]);
```

Order matters: the catch-all has no `matches`, so it claims everything and any
rule placed after it is dead code.

## Sharing rules between applications (the raw selector)

A display set is not only a client-side idea. A server that indexes a study —
static-dicomweb building its metadata tree, say — wants to know what display sets
that study contains, and it has to agree with the viewer that later loads it. If
each side implements the rules itself, they drift, and the display sets the server
advertises stop being the ones the client builds.

So the rules are authored **as data** and compiled into functions by one shared
compiler. `rawDisplaySetSelector.js` holds both:

- `rawDisplaySetSelector` — the default rules as pure JSON. No functions, no
  imports of application state.
- `createDisplaySetSplitRules(selector, options)` — turns that JSON into the
  `SplitRule[]` the split engine executes.

`defaultDisplaySetSplitRules` is literally `createDisplaySetSplitRules(rawDisplaySetSelector)`,
so the data form is never a second-class path: if it could not express a default
rule, the package would not build.

```js
import {
  createDisplaySetSplitRules,
  rawDisplaySetSelector,
  splitImageIdsBySplitRules,
} from '@cornerstonejs/metadata';

// A server can ship its selector to the client verbatim...
const selectorJson = JSON.stringify(rawDisplaySetSelector);

// ...and the client compiles the identical rules from it.
const splitRules = createDisplaySetSplitRules(JSON.parse(selectorJson));
const groups = splitImageIdsBySplitRules(imageIds, {
  getNaturalizedInstance,
  splitRules,
});
```

### What a rule is built from

The conditions and values inside a rule — `{ attribute: 'Modality', in: [...] }`,
`{ classifier: 'video' }`, `{ attribute: 'Rows', bucket: 64 }`,
`{ template: '...' }` — are not defined by this module. They are the general
[safe function](../safe-functions.md) vocabulary: a closed set of JSON forms
compiled into predicates without `eval`, deliberately independent of display
sets so hanging protocols and anything else that would otherwise hand-write
matching code can share it. **See [Safe Functions](../safe-functions.md) for the
full condition and value reference**, the named-classifier extension point, and
why a malformed definition throws eagerly with the offending fragment inlined.

What this module contributes is the _rule shape_ those conditions and values sit
in — `matches`, `groupBy`, `runBy`, `series` facts, `compareInstances`,
`customAttributes` — plus the built-in instance classifiers (`image`, `video`,
`ecg`, `wsi`) and the default selector.

| Rule field         | Built from                                                                                  |
| ------------------ | ------------------------------------------------------------------------------------------- |
| `matches`          | one condition — which instances this rule claims                                            |
| `groupBy`          | a list of values — the bucket key each instance contributes                                 |
| `runBy`            | one value — a change starts a new run within a bucket                                       |
| `series`           | `{ name, scope, when, gate }` — a fact over the whole series, read back as `{ seriesFact }` |
| `compareInstances` | `{ attribute, number, descending }` — instance order within a group                         |
| `customAttributes` | literals, values read from the first instance, or a named preset                            |

A rule also carries a `description`: the explanation lives in the rule data, not in
a code comment, so a UI that lets a user inspect or toggle rules reads it from the
selector rather than keeping its own copy. The **Display Set Rules** example
(`packages/core/examples/displaySetRules`) does exactly that — it lists every
standard rule with a checkbox and its description, lets you paste a new rule as
JSON, and re-splits the loaded series live.

Two rules from the defaults, in raw form:

```js
// "Which instances are a multi-frame clip?" — a fact over the series, read back
// per instance.
{
  id: 'multiFrame',
  viewportTypes: ['stack'],
  series: [{
    name: 'isMultiFrame',
    scope: 'first',
    when: { all: [
      { attribute: 'NumberOfFrames', greaterThan: 1 },
      { attribute: 'SliceLocation', exists: true },
    ] },
  }],
  matches: { all: [{ seriesFact: 'isMultiFrame' }, { classifier: 'image' }] },
  groupBy: ['SeriesInstanceUID', 'InstanceNumber'],
  customAttributes: {
    set: { isClip: true },
    fromFirstInstance: {
      numImageFrames: { attribute: 'NumberOfFrames', number: true },
    },
    fromOptions: ['splitNumber'],
    fromContext: ['isMultiFrame'],
  },
}

// The DWI fix: split the undefined-b-value frames off the 4D set.
{
  id: 'mixedDimensionalityBValue',
  viewportTypes: ['volume', 'volume3d', 'stack'],
  series: [{
    name: 'mixedBValue',
    gate: { attribute: 'Modality', equals: 'MR' },
    scope: 'mixed',
    when: { attribute: 'DiffusionBValue', exists: true },
  }],
  matches: { all: [{ seriesFact: 'mixedBValue' }, { classifier: 'image' }] },
  groupBy: ['SeriesInstanceUID', { attribute: 'DiffusionBValue', absent: true }],
}
```

### Extending a selector

Derive from the defaults and compile the result. Rules are evaluated in order, so
prepend to claim instances before a default rule sees them:

```js
const splitRules = createDisplaySetSplitRules([
  {
    id: 'usInterleaved',
    matches: { attribute: 'Modality', equals: 'US' },
    // Interleaved singles and clips become one display set per run.
    runBy: { condition: { attribute: 'NumberOfFrames', greaterThan: 1 } },
  },
  ...rawDisplaySetSelector,
]);
```

Every rule needs an `id`, and ids must be unique: an id namespaces the bucket keys
its rule produces, so naming rules is what lets a selector be edited — reordered,
or a rule inserted — without changing the other rules' display set identities.

When a classification genuinely cannot be expressed as data, register it by name
rather than reaching for a function in the selector — the
[named extension](../safe-functions.md#named-extensions) point. This keeps the
selector itself serializable. `createDisplaySetSplitRules` takes two registries:
`classifiers`, which is the safe-function one, and `customAttributePresets`,
which is specific to display sets because a preset returns display set
attributes:

```js
const splitRules = createDisplaySetSplitRules(mySelector, {
  classifiers: {
    // Referenced from data as { classifier: 'siteProtocol' }
    siteProtocol: (instance) => instance.ProtocolName?.startsWith('SITE-'),
  },
  // Referenced from data as customAttributes: { preset: 'siteLabel' }
  customAttributePresets: {
    siteLabel: (instances) => ({ siteLabel: instances[0]?.ProtocolName }),
  },
});
```

A selector that uses named extensions is still shareable, but the _names_ become
part of the contract: whatever compiles it must register the same names, or
compilation throws. So does the _shape of the instance_ the host feeds the
splitter — a rule can only key on attributes that are actually there, and one
that references a missing attribute compiles cleanly and silently groups
everything together. See
[the subject is part of the contract](../safe-functions.md#the-subject-is-part-of-the-contract-too).

### How an application's customization layer fits

Cornerstone deliberately knows nothing about OHIF's `customizationService` — or any
other application's configuration mechanism — and must not. The dependency runs
one way: the application resolves its own overrides and hands
`createDisplaySetSplitRules` plain data.

```js
// In the application, not in cornerstone.
const selector =
  customizationService.getCustomization('displaySetSelector') ??
  rawDisplaySetSelector;

const splitRules = createDisplaySetSplitRules(selector, {
  classifiers: customizationService.getCustomization('displaySetClassifiers'),
});
```

Because the customization value is JSON, the same value can be served to a
back end that has no customization service at all — it reads the selector from
config and compiles it with the same call. That is the property that lets one
deployment's display set rules hold on both sides of the wire. OHIF's side of this
is documented under
[Customization Service → Display Set Split Rules](https://docs.ohif.org/platform/services/customization-service/displaySetSplitRules).

### Instance classifiers

The default rules rely on small SOP-class/modality heuristics that are also
exported for reuse, so you can detect a series' kind without re-hardcoding UID
lists:

- `isImageInstance(instance)` — the SOP class carries renderable pixel data.
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

displaySet.displaySetId;
displaySet.viewportTypes; // readonly ViewportTypeHint[]
displaySet.preferredViewportType; // viewportTypes[0]
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

## Related docs

- [Cornerstone Metadata](./index.md)
- [Metadata Providers](../cornerstone-core/metadataProvider.md)
