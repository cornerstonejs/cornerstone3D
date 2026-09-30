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
which viewport types each group supports. Rules are evaluated in **ascending
priority, first match wins per instance**.

### The default rules

`defaultDisplaySetSplitRules` is the rule set you get without writing any rules.
It is the compiled form of `rawDisplaySetSelector`, the same rules as JSON data
(see [Sharing rules between applications](#sharing-rules-between-applications-the-raw-selector)).
It has nine rules, with the priorities `1` to `9`:

| Priority | Id                          | Viewport types                | Claims                                                                                                      |
| -------- | --------------------------- | ----------------------------- | ----------------------------------------------------------------------------------------------------------- |
| 1        | `video`                     | `video`                       | Video transfer syntaxes and SOP classes, and long multi-frame secondary captures.                           |
| 2        | `ecg`                       | `ecg`                         | ECG and waveform SOP classes.                                                                               |
| 3        | `wholeslide`                | `wholeslide`                  | VL Whole Slide Microscopy (modality SM); all pyramid levels form one display set.                           |
| 4        | `singleImageModality`       | `stack`                       | CR, DX and MG, split by a coarse image-size bucket.                                                         |
| 5        | `multiFrame`                | `stack`                       | Multi-frame instances with a slice location (cine clips); one display set per instance.                     |
| 6        | `mixedDimensionalityBValue` | `volume`, `volume3d`, `stack` | Diffusion MR that mixes b-value frames with frames that have none; the two parts split.                     |
| 7        | `volume3d`                  | `volume`, `volume3d`, `stack` | Multi-slice CT, MR, PT and NM that reconstruct into a volume.                                               |
| 8        | `defaultImageRule`          | `stack`, `volume`, `volume3d` | Any other renderable image, one display set per series.                                                     |
| 9        | `unsupported`               | `none`                        | Everything else (SEG, RTSTRUCT, SR, PDF, …); see [Objects nothing can render](#objects-nothing-can-render). |

Each raw rule also has a `description` that a UI can show. The next sections
explain how your own rules combine with these.

### Viewport types are hints

`viewportTypes` names the kind of view a display set supports, not a viewport
class. `stack` means the images are shown one at a time and are not
reconstructed into a volume. With the legacy viewports `stack` maps to
`ViewportType.STACK`; with the next-generation viewports it maps to the planar
viewport (`ViewportType.PLANAR_NEXT`). So the same rules work with both
viewport families. `volume` and `volume3d` mean the display set can be
reconstructed for MPR and 3D. See
[Driving a viewport from a display set](#driving-a-viewport-from-a-display-set)
for the mapping in code.

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
  volume3d: { priority: 1, groupBy: ['SeriesInstanceUID'] },
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

The defaults use the priorities `1` to `9` (see
[The default rules](#the-default-rules)). To place a rule of your own:

| You want the rule to run…                    | Give it a priority                                                          |
| -------------------------------------------- | --------------------------------------------------------------------------- |
| before every default rule                    | below `1`, for example `-1` or `0`                                          |
| between two default rules                    | a number between theirs, for example `7.5` to run after `volume3d`          |
| as a fallback, on what the image rules leave | between `defaultImageRule` (`8`) and `unsupported` (`9`), for example `8.5` |
| after every default rule                     | above `DEFAULT_SPLIT_RULE_PRIORITY_LIMIT` (`10000`)                         |

`unsupported` claims every instance that reaches it, so a rule with a priority
above `9` sees nothing unless you also exclude `unsupported`
(`unsupported: { ...defaultDisplaySetSplitRules.unsupported, priority: null }`).
A later release may add default rules with priorities up to `10000`, so do not
depend on the gap between `9` and `10000` staying empty.

An entry that states an `id` different from its key, or that has a priority
that is missing, or neither `null` nor a finite number, is an error.
`validateSplitRuleSetEntry(id, entry)` runs that check on one entry, and returns
`false` for an excluded one.

A `SplitRule` has up to five parts:

| Field              | Purpose                                                                                                                       |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| `matches`          | Returns true if an instance belongs to this rule. Omit to match everything.                                                   |
| `groupBy`          | Keys (tag names or functions) that partition matched instances into separate display sets.                                    |
| `series`           | Optional. Runs once per rule per split and **returns** that rule's derived facts; `matches`/`groupBy` read them via `series`. |
| `viewportTypes`    | Allowed viewport types for the produced display sets; index `0` is preferred.                                                 |
| `customAttributes` | Returns extra attributes spread flat onto the display set (e.g. `isClip`, `numImageFrames`).                                  |

A rule's `id` is its key in the rule set, so an entry does not repeat it. Most
rules only need `matches` and `groupBy`, plus the entry's `priority`:

```ts
{
  video: {
    priority: 1,
    matches: (instance) => isVideoInstance(instance),
    groupBy: ['SOPInstanceUID'],
  },
}
```

Reach for `series` only when a rule needs a value computed from the **whole
series** and reused by `matches` or `groupBy`. It is optional, runs **once per
rule per split operation**, and returns derived facts for that rule — it should
**not** mutate shared state. The DWI fix is the worked example: `series` decides
whether the series mixes b-value and non-b-value frames, and `groupBy` then
separates them into two display sets:

```ts
import type { SplitRuleSetEntry } from '@cornerstonejs/metadata';

// Keyed as `mixedDimensionalityBValue` in the rule set.
const mixedDimensionalityBValue: SplitRuleSetEntry = {
  priority: 6,
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

To customize splitting, merge your own rules over the defaults by key — a new id
adds a rule, an existing id replaces one — and pass the result as `splitRules`:

```ts
const splitRules: SplitRuleSet = {
  ...defaultDisplaySetSplitRules,
  // Runs before every default rule.
  ctScout: {
    priority: -1,
    matches: (i) => /localizer|scout/i.test(String(i.SeriesDescription ?? '')),
  },
  // Turns a default rule off without removing its key.
  singleImageModality: {
    ...defaultDisplaySetSplitRules.singleImageModality,
    priority: null,
  },
};
```

Prefer authoring them as data — see
[Sharing rules between applications](#sharing-rules-between-applications-the-raw-selector)
— so the same rules can also be used outside the viewer.
`customAttributes` may set any attribute, but
the resolved data fields a display set is built from — `imageIds`,
`underlyingImageIds`, `instances`, and `displaySetId` — are reserved and cannot
be overwritten, so the underlying-vs-frame image id invariant the viewports rely
on always holds.

A `viewportTypes` key in the returned attributes replaces the rule's viewport
types, and it does so **before** the display set is built:
`createDisplaySetFromGroup` runs `customAttributes` first, resolves the
effective viewport types, chooses the display set class from them (an image
stack, a base display set, or the non-displayable shape with empty `imageIds`),
and then applies the other attributes. So custom attributes that turn a
displayable group into `['none']` get the non-displayable shape, and the
reverse. `isDisplayable` and `preferredViewportType` are always derived from
the effective viewport types; custom attributes cannot set them to disagree.

A few engine guarantees worth knowing when writing rules:

- **Buckets are namespaced by rule.** Two different rules can never merge into
  one display set even if their `groupBy` values coincide.
- **Keys come from the rule id, not the rule's position.** Moving a rule, or
  adding one with a lower priority, leaves the other rules' `splitKey`s
  unchanged.
- **Group order is deterministic.** Groups come back sorted by rule priority,
  then by a stable, rule-namespaced bucket key, then by run position, so a
  series' display sets — and any id derived from their position — are stable
  regardless of the order the image ids were passed in.
- **Each group carries its rule's series facts.** `InstanceGroup.series` holds
  the facts the matched rule's `series` hook computed over _all_ the instances
  passed to the split, not only the group's. Those can differ: a "mixed b-value"
  fact is true for the series and false for each half. See
  [Who decides instance order](#who-decides-instance-order) for why that
  matters when a group is ordered again later.
- **`series` samples `instances[0]`** for some facts (e.g. multi-frame,
  volumetric), so those rules assume a homogeneous series. A heterogeneous series
  needs a dedicated rule (as `mixedDimensionalityBValue` does for DWI) to
  separate it.
- **`series` is scoped to its own rule.** A rule only ever sees the facts its own
  `series` hook returned; it cannot read another rule's facts, and it must not
  mutate shared state.
- **Nothing is dropped by the defaults.** The `unsupported` rule, at the
  highest default priority, claims whatever the image rules did not — see
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

So the default selector's `unsupported` rule, at the highest default priority,
is a catch-all that claims everything left and marks the result **not
displayable**:

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

Add your own rule with a priority _below_ the catch-all's, with real viewport
types. This is the other half of the user's choice: either take the
non-displayable display set and present it, or teach the selector how to render
the format.

```ts
const splitRules = createDisplaySetSplitRules({
  ...rawDisplaySetSelector,
  seg: {
    // Below 0: runs before every default rule.
    priority: -1,
    viewportTypes: ['stack', 'volume'],
    matches: { attribute: 'Modality', equals: 'SEG' },
    groupBy: ['SeriesInstanceUID', 'SOPInstanceUID'],
  },
});
```

Priority matters: the catch-all has no `matches`, so it claims everything, and
a rule with a higher priority than `unsupported` (`9`) never sees an instance.
A rule meant only for what the image rules leave goes between
`defaultImageRule` (`8`) and `unsupported`, for example at `8.5`. To replace the
catch-all instead, exclude it with
`unsupported: { ...rawDisplaySetSelector.unsupported, priority: null }`.

## Sharing rules between applications (the raw selector)

A display set is not only a client-side idea. A server that indexes a study —
static-dicomweb building its metadata tree, say — wants to know what display sets
that study contains, and it has to agree with the viewer that later loads it. If
each side implements the rules itself, they drift, and the display sets the server
advertises stop being the ones the client builds.

So the rules are authored **as data** and compiled into functions by one shared
compiler. `rawDisplaySetSelector.js` holds both:

- `rawDisplaySetSelector` — the default rules as pure JSON, keyed by rule id:
  `video` (priority `1`), `ecg` (`2`), `wholeslide` (`3`),
  `singleImageModality` (`4`), `multiFrame` (`5`), `mixedDimensionalityBValue`
  (`6`), `volume3d` (`7`), `defaultImageRule` (`8`) and `unsupported` (`9`). No
  functions, no imports of application state.
- `createDisplaySetSplitRules(selector, options)` — turns that JSON into the
  `SplitRuleSet` the split engine executes, with the same keys and priorities.
  An excluded entry (`priority: null`) is compiled and kept, so a later layer
  can include it again by giving it a priority.

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

| Rule field         | Built from                                                                                                      | Compiled to                                        |
| ------------------ | --------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `matches`          | one condition — which instances this rule claims                                                                | `(instance, context) => boolean`                   |
| `groupBy`          | a list of values — the bucket key each instance contributes                                                     | each entry: `(instance, context) => value`         |
| `runBy`            | one value — a change starts a new run within a bucket                                                           | `(instance, context) => value`                     |
| `series`           | a list of `{ name, scope, when, gate?, minInstances? }` — facts over the whole series, read as `{ seriesFact }` | `({ instances }) => facts`                         |
| `compareInstances` | `{ attribute, number?, descending? }` or `{ expression }` — instance order within a group                       | `(a, b, context) => number`                        |
| `customAttributes` | `{ set?, fromFirstInstance?, fromContext?, fromOptions?, preset? }`                                             | `(attributes, options) => Record<string, unknown>` |

The other fields are data: `id` (optional, must equal the key), `groupId`,
`priority`, `description` and `viewportTypes`.

`groupId` names a group of rules that describe one kind of display set, and it
defaults to the rule id. A study can hold breast tomosynthesis, legacy
mammography that mixes views in one series, and mammography that the modality
already split. Three rules split those three forms, and all three can use
`groupId: 'mammo'`. A reader such as a hanging protocol then finds every
mammography display set by the group id, whichever rule made it. The group id
does not change the split: groups and split keys stay per rule id.

### The schema of a rule

Every place in a rule, and the forms each place accepts, are one table:
`splitRuleSchema`, exported from `@cornerstonejs/metadata`.
`createDisplaySetSplitRules` reads it — to select the form of each fragment, to
check its keys, to take the expression variables of each place, and to build
its error messages — so the table cannot drift from what compiles. It is keyed
by shape: `rule` (the rule itself), `seriesFact`, `comparator`,
`customAttributes`, and the generic `condition` and `value` shapes from
[Safe Functions](../safe-functions.md#the-schema-one-table-strict-keys).

Each rule field says what it holds and, for a place that becomes a function, how
the function is called:

```js
// splitRuleSchema.rule.forms.rule.keys, abridged
{
  matches: {
    kind: 'condition',
    call: '(instance, context) => boolean',
    expression: { params: ['instance', 'context'], implicitScope: 'instance' },
    optional: true,
  },
  compareInstances: {
    kind: 'comparator',
    call: '(a, b, context) => number',
    optional: true,
  },
  customAttributes: {
    kind: 'customAttributes',
    function: true, // a whole callback is accepted
    call: '(attributes, options) => Record<string, unknown>',
    optional: true,
  },
}

// splitRuleSchema.customAttributes.forms.recipe.keys, abridged
{
  set: { kind: 'record', keys: { '*': { kind: 'literal' } } },
  fromFirstInstance: {
    kind: 'record',
    keys: { '*': { kind: 'value', call: '(firstInstance, context) => value' } },
  },
  fromContext: { kind: 'string', list: true, oneOf: ['isMultiFrame', 'sopClassUids', 'viewportTypes'] },
  fromOptions: { kind: 'string', list: true, oneOf: ['splitNumber', 'descriptionName'] },
  preset: { kind: 'string' },
}
```

The compiler is **strict**. A wrong rule fails at compile time; it is never
silently ignored:

- **An unknown key is an error, anywhere in a rule.** A typo such as `matchs`
  would otherwise leave the rule with no `matches`, so it would claim every
  instance. The message names the rule, the path and the allowed keys:

  ```
  Invalid raw display set selector: rule 'r': unknown field 'matchs'; allowed: id, priority, description, viewportTypes, series, matches, groupBy, runBy, compareInstances, customAttributes
  Invalid raw display set selector: rule 'r'.customAttributes: unknown key 'fromFirstInstnce'; allowed: set, fromFirstInstance, fromContext, fromOptions, preset
  Invalid raw display set selector: rule 'r'.customAttributes.fromContext[0]: unknown fromContext "isMultiFrme"; allowed: isMultiFrame, sopClassUids, viewportTypes
  Invalid raw display set selector: rule 'r'.matches: 'ignoreCase' applies only with contains, containsAny: {...}
  ```

- **A form the place does not accept is an error**, and the message lists the
  accepted forms and the call signature:

  ```
  Invalid raw display set selector: rule 'r'.compareInstances: unrecognized comparator; expected { attribute, number?, descending? }, { expression } called with (a, b, context), or a function (a, b, context) => number: {"atribute":"SliceLocation"}
  ```

- **Wildcard keys.** `'*'` in the table allows any key. `customAttributes.set.*`
  keeps each value as a literal; `customAttributes.fromFirstInstance.*` compiles
  each value as a value read from the first instance of the group.
- **An actual function passes through as is** at every function place — a whole
  `matches`, a `groupBy` entry, `runBy`, `compareInstances`, a whole `series`
  hook, a whole `customAttributes` — and wherever a nested condition or value is
  expected, e.g. inside `all: [...]` or as a `fromFirstInstance` value. The
  strictness applies to data only. A selector with a function in it is no longer
  JSON, so it cannot be shared with a server.

### Comparators as data

`compareInstances` takes one of three forms, each compiled to
`(a, b, context) => number`:

```js
// Ascending by a numeric attribute; `descending: true` reverses it.
compareInstances: { attribute: 'SliceLocation', number: true },

// An expression over a, b and context.
compareInstances: { expression: 'a.SliceLocation - b.SliceLocation' },

// An actual function, as is.
compareInstances: (a, b) => a.SliceLocation - b.SliceLocation,
```

A comparator expression has **no implicit scope**: the only names it can read
are `a`, `b` and `context`. So `'SliceLocation - b.SliceLocation'` is a compile
error, rather than silently reading `a.SliceLocation`. The result is coerced to a
number; a result of `0` or `NaN` (a missing tag on one side) is "no opinion",
and the next comparator decides — see [Who decides instance order](#who-decides-instance-order).

### Who decides instance order

Instance order is layered, each layer deferring to the one below:

1. **Acquisition order** (`InstanceNumber`, then `SOPInstanceUID`), always applied
   first — never the order the imageIds arrived in, so nothing about the result
   depends on that.
2. **The host's base sort**, `GroupInstancesOptions.sortInstances`, passed to
   `groupInstancesBySplitRules` / `splitImageIdsBySplitRules`. A **whole-list**
   sort, not a comparator, because a real base order is not always pairwise:
   ordering slices along the scan axis means picking a reference instance and
   projecting the rest onto its normal, which no `(a, b)` function can express.
3. **Comparators** — the rule's own `compareInstances` first, then the host's
   `GroupInstancesOptions.compareInstances`.

A comparator **returning 0 declines to have an opinion** rather than asserting the
two instances are interchangeable: the next comparator is consulted, and if none
has one, the base order stands. So a rule can say "order by this one thing, leave
the rest alone" without restating the default. A `NaN` — which arithmetic on a tag
one instance is missing produces — counts as no opinion too.

The base sort is host-supplied rather than only rule-declared for the same reason
the rules themselves are data: the _default_ order has to be settable once, the
same way, by whatever is doing the splitting. If only rules could set it, two
consumers of one selector could order the same display set differently while both
appearing correct — a viewer sorting by position and a server by instance number,
say. `orderInstancesForRule` exposes the whole composition so a host that has to
re-order outside a split (after new instances arrive, for instance) reproduces the
same order rather than applying its own sort a second time and discarding the
rule's.

Pass the group's series facts when you do. A comparator can read
`context.series`, and those facts came from the whole split, not from the
group — so `orderInstancesForRule` recomputing them from the group's instances
alone can give a comparator different facts and a different order:

```ts
const [group] = groupInstancesBySplitRules(instances, splitRules);

const reordered = orderInstancesForRule(
  [...group.instances, ...newInstances],
  group.matchedRule,
  { series: group.series, sortInstances }
);
```

A later revision is expected to let a selector carry its sort as data; it will
compile to these same hooks, so ordering does not change owner again.

A rule also carries a `description`: the explanation lives in the rule data, not in
a code comment, so a UI that lets a user inspect or toggle rules reads it from the
selector rather than keeping its own copy. The **Display Set Rules** example
(`packages/core/examples/displaySetRules`) does exactly that — it lists every
standard rule with a checkbox, its priority and its description, lets you paste
rules as JSON keyed by id, and re-splits the loaded series live.

Two rules from the defaults, in raw form:

```js
{
  // "Which instances are a multi-frame clip?" — a fact over the series, read
  // back per instance.
  multiFrame: {
    priority: 5,
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
  },

  // The DWI fix: split the undefined-b-value frames off the 4D set.
  mixedDimensionalityBValue: {
    priority: 6,
    viewportTypes: ['volume', 'volume3d', 'stack'],
    series: [{
      name: 'mixedBValue',
      gate: { attribute: 'Modality', equals: 'MR' },
      scope: 'mixed',
      when: { attribute: 'DiffusionBValue', exists: true },
    }],
    matches: { all: [{ seriesFact: 'mixedBValue' }, { classifier: 'image' }] },
    groupBy: ['SeriesInstanceUID', { attribute: 'DiffusionBValue', absent: true }],
  },
}
```

### Extending a selector

Derive from the defaults and compile the result. Rules are evaluated in
ascending priority, so give a rule a priority below `0` to claim instances
before any default rule sees them:

```js
const splitRules = createDisplaySetSplitRules({
  ...rawDisplaySetSelector,
  usInterleaved: {
    priority: -1,
    matches: { attribute: 'Modality', equals: 'US' },
    // Interleaved singles and clips become one display set per run.
    runBy: { condition: { attribute: 'NumberOfFrames', greaterThan: 1 } },
  },
});
```

The key is the rule's id, so ids are unique by construction. An id namespaces
the bucket keys its rule produces, so keying rules is what lets a selector be
edited — a rule moved, or a rule inserted — without changing the other rules'
display set identities.

When a classification genuinely cannot be expressed as data, register it by name
rather than reaching for a function in the selector — the
[named extension](../safe-functions.md#named-extensions) point. A function in the
selector compiles (see [the schema of a rule](#the-schema-of-a-rule)), but a
named extension keeps the selector itself serializable. `createDisplaySetSplitRules` takes two registries:
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
