# 5.x Migration Reference Notes

This page tracks smaller migration-impacting behavior changes that are useful
as reference during 4.x -> 5.x upgrades.

## `disableScale` and `imageFrame.preScale`

## What Changed

In 5.x, when `disableScale` is `true`, Cornerstone3D no longer sets
`imageFrame.preScale` and preserves the original pixel min/max range
(`minAfterScale = minBeforeScale`, `maxAfterScale = maxBeforeScale`).

This is intentional for cases where scaling is identity
(for example slope/intercept being 1/0).

## Why This Matters

In 4.x, some workflows implicitly relied on `imageFrame.preScale` always being
present. In 5.x, that object may be `undefined` when scaling is disabled.

## Migration Guidance

- Treat `imageFrame.preScale` as optional and guard access accordingly.
- If your downstream logic requires a pre-scale descriptor, create one in your
  application code when `disableScale` is enabled.
- If you only need pixel statistics, use `minPixelValue`/`maxPixelValue` from
  the image frame values directly instead of assuming post-scale values.

## `instance` data object model in metadata modules

### What Changed

In 5.x, this is primarily a documentation clarification rather than a new
runtime behavior change: `instance` data should be understood as a single
per-frame object that includes computed per-frame values merged into one object.

This object can use inheritance to compose values from multiple metadata levels.
Because of that, consumers should not assume all attributes are directly
iterable/enumerable on the object itself.

### 4.x vs 5.x interpretation

- **4.x:** this shape/behavior existed in practice, but was not clearly documented.
- **5.x:** the same model is now explicitly documented so integrations can rely
  on the intended contract.

### Migration Guidance

- Do not rely on object enumeration (`Object.keys`, `for...in`) to discover all
  available attributes on instance data.
- Access known attributes explicitly, or use module utilities that understand the
  composed/inherited object structure.
- When building instance data from naturalized metadata, prefer the
  `combineFramesInstance` utility so downstream modules receive the expected
  base object shape.

## SEG adapter: `createFromDICOMSegBuffer` deprecated in favor of `createFromDicomSegImageId`

### What Changed

A new `adaptersSEG.Cornerstone3D.Segmentation.createFromDicomSegImageId` entry
point has been added. Its second argument is a SEG instance `imageId` (with
pixels sourced from the provided per-frame `imageId`s / decoder) — it does
**not** accept a Part 10 `ArrayBuffer`, despite the older name implying a
buffer.

`createFromDICOMSegBuffer` is **not removed**. It remains exported as a
deprecated alias that preserves its original 4.x contract (a Part 10
`ArrayBuffer` as the second argument) by delegating to
`createLabelmapsFromDICOMBuffer`. Existing buffer-based callers continue to work
unchanged; no major version bump is required to upgrade. New code should migrate
to `createFromDicomSegImageId` (for the per-frame `imageId` path) or
`createLabelmapsFromDICOMBuffer` (for the buffer path).

```ts
// 4.x
const results =
  await adaptersSEG.Cornerstone3D.Segmentation.createFromDICOMSegBuffer(
    referencedImageIds,
    arrayBuffer, // <-- ArrayBuffer
    { metadataProvider }
  );

// 5.x
const results =
  await adaptersSEG.Cornerstone3D.Segmentation.createFromDicomSegImageId(
    referencedImageIds,
    segImageId, // <-- SEG instance imageId
    { metadataProvider, frameImageIds }
  );
```

### Why This Matters

The new name exists because the per-frame `imageId` path changed the second
argument contract entirely (`ArrayBuffer` -> `imageId`). Rather than silently
repurpose the same-named function with an incompatible contract, the new
behavior lives under the new name `createFromDicomSegImageId`. The original
`createFromDICOMSegBuffer` is retained as a deprecated alias that keeps its old
`ArrayBuffer` contract, so existing callers keep working without code changes
and the upgrade does not require a major version bump.

### The `frameImageIds` option (optional)

`frameImageIds` is **optional** and most integrations never need to set it.

It is the list of loadable imageIds — one per SEG frame — that the adapter
passes to the image loader to read pixel data. In other words, it is the set of
frames the segmentation contains, exactly as produced when the segmentation
object is loaded. It exists because of a change in how pixels are obtained: the
old buffer-based path decoded the entire SEG from a single Part 10 `ArrayBuffer`
held in memory, so individual frames never needed their own imageIds, whereas
the new path loads each frame's pixels through the image loader and therefore
needs one addressable imageId **per frame**.

You only need to pass it for **data sources whose imageIds do not follow the
DICOMweb (WADO-RS) or WADO-URI conventions.** When the SEG `imageId` uses a
frame-addressing scheme the adapter recognizes, the per-frame list is derived
automatically and `frameImageIds` can be omitted:

- **WADO-RS / DICOMweb** — frames are separate resources (`.../frames/1`,
  `.../frames/2`, …), so the list is derived by substituting the frame number.
- **WADO-URI** — frames are selected with a query parameter (`?frame=1`,
  `&frame=2`, …), so the list is derived by appending the frame query.

For any other imageId form (custom schemes, blob/object URLs that are not
WADO-URI, application-specific loaders, etc.) there is no general rule for
turning a base `imageId` into per-frame imageIds, so the adapter cannot
auto-generate the list. In those cases pass `frameImageIds` explicitly (or a
`getFrameImageId(segImageId, frameNumber)` callback). If you omit it for an
unrecognized multi-frame `imageId`, every frame falls back to the same base
`imageId` and decodes identical pixels.

```ts
// Single-frame SEG, WADO-RS, and WADO-URI imageIds: frameImageIds is not needed.
const results =
  await adaptersSEG.Cornerstone3D.Segmentation.createFromDicomSegImageId(
    referencedImageIds,
    segImageId,
    { metadataProvider }
  );

// Non-WADO scheme only: provide the per-frame imageIds from loading the SEG.
const results =
  await adaptersSEG.Cornerstone3D.Segmentation.createFromDicomSegImageId(
    referencedImageIds,
    segImageId,
    {
      metadataProvider,
      frameImageIds, // one loadable imageId per SEG frame
    }
  );

// Or supply a builder instead of the full list:
//   getFrameImageId: (segImageId, frameNumber) => `${segImageId}?frame=${frameNumber}`
```

### Migration Guidance

- If you load a SEG via per-frame `imageId`s (the OHIF / imageLoader path),
  switch the call to `createFromDicomSegImageId` and pass the SEG instance
  `imageId` as the second argument.
- If you still have a Part 10 `ArrayBuffer`, use `createLabelmapsFromDICOMBuffer`
  (`(referencedImageIds, arrayBuffer, metadataProvider, options)`) or
  `generateToolState`, which retain the buffer-based entry point.
- Existing `createFromDICOMSegBuffer(referencedImageIds, arrayBuffer, { metadataProvider })`
  calls keep working unchanged — the function is now a deprecated alias for the
  buffer path. Migrate at your own pace to `createLabelmapsFromDICOMBuffer`.

## ESM packaging and TypeScript `moduleResolution`

### What Changed

The published `@cornerstonejs/*` packages now declare themselves as ESM
(`"type": "module"`) and emit relative imports with explicit `.js` extensions in
both the runtime `.js` files and the `.d.ts` declarations. This makes the
packages resolve correctly under **native Node ESM** (server-side rendering,
Node test runners, packaging linters, and Node 25+ which hard-fails on missing
extensions), not just inside bundlers.

### Why This Matters

- **Bundler consumers are unaffected.** webpack, Vite, Next, and similar tools
  resolve `./foo` and `./foo.js` identically, so applications such as OHIF
  require no changes.
- **Native Node now works.** Importing a package on a Node code path no longer
  fails with `ERR_MODULE_NOT_FOUND` due to extensionless specifiers.
- **CommonJS `require()` is not a supported package entry path.** Consume
  `@cornerstonejs/*` packages with ESM `import`, dynamic `import()`, or a bundler
  that resolves the ESM export map.

### Migration Guidance

Use a modern TypeScript module resolution mode — `"bundler"`, `"node16"`, or
`"nodenext"` — which is the default for current toolchains and understands the
`.js`-extensioned imports inside the shipped `.d.ts` files.

The legacy `moduleResolution: "node"` (a.k.a. `node10`) does **not** map a
`.js` specifier in a declaration back to its `.d.ts`, and it ignores the package
`exports` map entirely. On that setting some deep re-exported types may resolve
as `any` or fail to resolve. This is a **type-resolution** concern only —
runtime behavior is unaffected — but if you see missing types, switch to
`"bundler"`/`"node16"`/`"nodenext"`.

## Oblique brush fills use the shared voxel slab iterator

### What Changed

The circle, sphere and rectangle brush fills no longer walk the axis-aligned IJK
bounding box around the brush. They describe the brush as a plane-anchored shape
and enumerate its voxels with `csUtils.voxelSlab.iterateVoxelsInShape` — the same
iterator, the same shapes and the same membership rule (Rule M) that the area
annotation tools measure with.

Three things follow for a rotated or oblique viewport:

- A circle, a sphere and a rectangle brush paint the shape the user drew, at any
  orientation.
- A flat brush paints one oblique layer of voxels in a thin view, and every layer
  through the slab in a full-thickness view. It no longer bleeds into the
  neighbouring slices.
- `csUtils.voxelSlab.createUnionShape` is new. It merges the runs of several
  shapes into a disjoint sequence, which is how a brush stroke paints the union
  of one disc per sample without writing a voxel twice.

`operationData.isInObject` and `operationData.isInObjectBoundsIJK` are unchanged,
and `regionFill` still uses them when a strategy builds no fill.

### Why This Matters

The box walk tested `O(N³)` voxels to fill an `O(N²)` sheet, and it needed a
depth tolerance to reject the off-plane voxels it should never have visited. No
single tolerance is right for every orientation: too small a value left holes in
the sheet, and too large a value bled the fill into the neighbouring slices. The
slab bound of the shared iterator is exact for every orientation, so no tolerance
is needed.

### Migration Guidance

- No action is required for an application that uses the built-in brush tools.
- A custom brush strategy keeps working through `isInObject` and
  `isInObjectBoundsIJK`. To opt into the iterator, set
  `operationData.brushVoxelSlabFill` in your `Initialize` callback; the builders
  in `strategies/utils/brushVoxelSlab.ts` show how.
- See
  [Planar Fill Iteration](../../concepts/cornerstone-tools/segmentation/planar-fill-iteration.md)
  for the fill contract, and
  [Voxel Statistics](../../concepts/cornerstone-tools/annotation/voxel-statistics.md)
  for Rule M itself.

## Viewport elements set `touch-action: none`

### What Changed

The rendering engine now sets `touch-action: none` on every element it enables
as a viewport, and restores the element's prior inline value when the viewport
is disabled. Previously this was left to the application.

### Why This Matters

Without `touch-action: none`, the browser claims viewport gestures before
Cornerstone sees them: a one-finger drag scrolls the page instead of running the
active tool, a two-finger pinch zooms the document rather than the image, and a
double-tap triggers the browser's own zoom. Touch tools cannot work on an
element the browser is still handling, which is why this is applied
unconditionally rather than behind a configuration flag — there is no
useful behavior to preserve on the other side of the switch.

The visible consequence is that **dragging on a viewport no longer scrolls the
page** on touch devices. Applications that relied on a viewport being a valid
place to start a page scroll need to provide scrollable area around the
viewport instead.

Two notes on scope:

- Only viewport elements are affected. The rest of your layout is untouched.
- The value is applied inline, so it overrides a `touch-action` coming from a
  CSS class for the duration that the viewport is enabled. On disable the
  element's original inline value is restored, and any CSS-supplied value takes
  effect again.

### Migration Guidance

- **Remove application-level workarounds.** If you set `touch-action: none` (or
  attached `preventDefault` touch listeners) on viewport elements to get touch
  tools working, that code is now redundant and can be deleted.
- **Check your scroll affordances on small screens.** If a page relied on
  viewport drags to scroll, add padding, a scroll container, or a gutter outside
  the viewport elements so the page remains scrollable on a phone or tablet.

## Prescaled PT volumes ignore the window in the metadata

### What Changed

A volume viewport that shows a **prescaled PT series** (`isPreScaled` with an
`suvbw` scaling factor) now always starts with a default VOI range of 0 to 5.
This is correct also when the series has a Window Center and a Window Width.

Before, this default range was applicable only when the viewport found no
window. The viewport used the range 0 to 5 only after it calculated the minimum
and the maximum of the middle slice. Thus a PT series that had a window used
that window.

### Why This Matters

A prescaled PT volume contains SUV values, but the Window Center and the Window
Width of the file are in the unscaled counts. The window has the incorrect
units. Applied to SUV values, it gives a very large range, and the volume is
almost black.

Thus the series that had a window were the series with the incorrect display.
These volumes also did not agree with the stack viewport, which always uses its
own PT range. **After the upgrade, PET volumes look different and correct.**

Unscaled PT volumes do not change. They continue to use the window in the
metadata.

### Migration Guidance

- **Usually, you do not have to do an operation.** The new default range agrees
  with the stack viewport and with other viewers.
- **If your application needs the initial behavior**, set the range with
  `viewport.setProperties({ voiRange })` after the volume loads, or give your
  own VOI when you configure the viewport. The default is applicable only when
  the application does not set a range.
- **If your tests compare volume and stack displays**, change the PT values that
  you calculated from the metadata window to the range 0 to 5.

## Volume viewports apply the VOI LUT Function and the VOI LUT Sequence

### What Changed

A volume viewport now reads the VOI LUT Function (0028,1056) and the VOI LUT
Sequence (0028,3010) of the file, as the stack viewport does:

- A series that has the function SIGMOID gets a sigmoid transfer function. Before
  this, the viewport calculated the range from the function but always made a
  linear transfer function.
- A series that has a VOI LUT Sequence gets the curve of the sequence. The range
  is the input domain of the curve, and window level stretches the curve over the
  new range.
- The generic viewports (`PLANAR_NEXT`) do the same on their volume paths, on the
  GPU and on the CPU.
- `setProperties({ VOILUTFunction })` on a volume viewport now normalizes the
  value, thus a padded value, a lower case value or a single element array also
  works. The property is also applied before the transfer function is made. Before
  this, a request for SIGMOID had no effect until the next change of the VOI.

Two other changes make all the viewport types agree:

- A colormap stops the curve of a VOI LUT Sequence and the curve of a sigmoid on
  the GPU. A colormap fills the transfer function with its own colors. Before
  this, a stack viewport removed the colormap on the next window level operation
  of an image that has a sequence.
- The CPU path stretches the curve of a sequence over the window. Before this,
  window level did nothing on the CPU and worked on the GPU, for the same file.

### Why This Matters

CR, DX and MG images frequently carry a VOI LUT Sequence, and their curves are
strongly non linear. The same file thus had two displays: the correct curve on a
stack viewport, and a flat linear window on a volume viewport or an MPR.

### Migration Guidance

- **Usually, you do not have to do an operation.** The display of these series
  agrees with the stack viewport and with other viewers.
- **To ignore the curve of the file**, use
  `setProperties({ useVOILUTSequence: false })`. This property is now available on
  the volume viewports and on the generic viewports also.
- **If your application draws a colorbar**, read the new field
  `voiLUTSequenceApplied` of the `VOI_MODIFIED` event. A ramp that you calculate
  from the range and the function is not the curve that the viewport shows.

## Volume viewports report the real window for a sigmoid

### What Changed

Three paths that give the VOI of a volume viewport back to an application now
give the window of the DICOM attributes, and not a value derived from the nodes
of the transfer function.

- **`detail.range` of the `VOI_MODIFIED` event.** A sampled sigmoid holds its
  curve in the nodes of the transfer function, so the mapping range of that
  function is the whole node domain, `[c - 1.733w, c + 1.560w]`. That is about
  3.3 times the window width, and it is not centered on the window. The event
  carried that domain. It now carries the window, which is the value that
  `getProperties` already gave.
- **`getProperties().voiRange`.** The conversion from the recovered window width
  and center to a range used `c ± w/2`, which is the LINEAR_EXACT convention
  (C.11.2.1.3.2), while the sigmoid transfer function is built from the range
  through the LINEAR convention of note 4 of C.11.2.1.2.1. The two differ by one,
  so each read and write of the properties widened the window by one, and two
  rounding operations moved it a further half unit in each direction. The
  conversion is now the exact inverse of the one that builds the curve, thus a
  range survives any number of round trips.
- **`getProperties().voiRange` when the actor does not hold a sigmoid.** A
  colormap and a VOI LUT Sequence each replace the curve, and the value SIGMOID
  of (0028,1056) stays in effect over both. The colormap ramp or the curve of the
  sequence was solved for a window regardless. A colormap ramp gave an infinite
  width and a range of NaN, and the viewport then rejected every later window
  level operation. Only a sigmoid on the actor is solved for a window now.

A volume viewport also keeps its inversion when the VOI needs a new transfer
function. Before this, the first window level operation on an inverted volume
that shows a sigmoid or a VOI LUT Sequence removed the inversion.

A linear volume viewport does not change. The vtk.js `getRange` is the mapping
range, which is the value that a linear read back already gave.

### Why This Matters

`voiSyncCallback` copies `detail.range` into `setProperties({ voiRange })` of
each target viewport, and `ViewportColorbar` reads the same field. A
synchronized viewport or a colorbar of a sigmoid volume thus showed
`WW 3293 / WC -387` for a window of `WW 1000 / WC -300`.

An application that reads the properties and writes them again widened the
window on each cycle, and `WindowLevelTool` does exactly that on each mouse
move. A drag on a SIGMOID series thus widened the window beyond the movement of
the pointer.

### Migration Guidance

- **Usually, you do not have to do an operation.** These values are the values
  that your application asked for.
- **Remove a correction of your own.** An application that scaled
  `detail.range` of a sigmoid viewport, or that rounded a window to conceal the
  drift, now receives a correct value and must not correct it again.
- **A presentation state that your application stored for a sigmoid volume can
  hold a widened window.** The window grew by one on each read and write cycle,
  so a stored value can be several units wider than the window of the file.
  Nothing reads such a value incorrectly now, but it is not the window that the
  file gives.

## Stack viewports show the VOI LUT Sequence on the GPU

### What Changed

A stack viewport on the GPU now applies the VOI LUT Sequence (0028,3010) of the
image by default. CR, DX and MG files frequently carry a sequence with a strongly
non linear curve. **These images look very different after the upgrade.** The
sequence stops when the application sets a different VOI LUT Function, when
`useVOILUTSequence` is `false`, or when a colormap is applied.

### Migration Guidance

- To keep the window display, call `setProperties({ useVOILUTSequence: false })`.
- Read `voiLUTSequenceApplied` of the `VOI_MODIFIED` event before you show a
  window level value or a colorbar. A window does not describe a sequence curve.

## Color images get no window, no rescale and no VOI LUT

### What Changed

`createImage` of the DICOM image loader no longer gives a color image the
Window Center, the Window Width, the Rescale Slope and Intercept, the VOI LUT
Function or the VOI LUT Sequence of the file. The slope is 1 and the intercept
is 0. The loader also does not prescale a color image, even when the
application requests `preScale`.

### Migration Guidance

- Do not read a grayscale window or a rescale from the `IImage` of a color
  image. The values of a color image are the 0 to 255 values of the samples.

## `toWindowLevel` and `toLowHighRange` accept LINEAR_EXACT

### What Changed

- `utilities.windowLevel.toWindowLevel(low, high, 'LINEAR_EXACT')` uses the exact
  formula of C.11.2.1.3.2: `width = high - low` and `center = (low + high) / 2`.
  Without the function, the LINEAR formula gives a width that is one larger and
  a center that is 0.5 larger.
- `toLowHighRange` no longer throws `Invalid VOI LUT function`. A function that
  is not known gives the LINEAR range.

### Migration Guidance

- Pass the VOI LUT Function in effect to both functions. A LINEAR_EXACT series
  that you convert without the function shows `W 401 / C 40.5` for a window of
  `W 400 / C 40`.

## `StackViewport.getProperties()` reports the VOI LUT Function in effect

### What Changed

- `getProperties().VOILUTFunction` is now the resolved function: the function
  that the application set, or the function of the image. It is never
  `undefined`. An image without (0028,1056) gives `LINEAR`.
- `getProperties()` also returns `voiLUTFunctionSetByUser` and
  `useVOILUTSequence`.

### Migration Guidance

- Code that tested `VOILUTFunction === undefined` to find "no function" must use
  `voiLUTFunctionSetByUser`.
- Code that copies the properties to another viewport now also copies the
  function. A function that is equal to the function of the image does not stop
  the VOI LUT Sequence.

## `setVOILUTFunction` works on the CPU path

### What Changed

`setProperties({ VOILUTFunction })` on a stack viewport that uses CPU rendering
no longer throws. The CPU path applies the function, and it removes the VOI LUT
Sequence, as the GPU path does.

### Migration Guidance

- Remove a `try`/`catch` or a CPU test that you added around this call.

## `getLUTs` reads LUT Data as unsigned and reads 8 bit entries

### What Changed

The `getLUTs` function of the WADO-URI metadata provider now reads LUT Data
(0028,3006) as unsigned values, whatever the Pixel Representation is. An entry
above 32767 was negative before. It also reads a LUT that declares 8 bits for
each entry and stores one entry in each byte. Before, the loader read that LUT
as 16 bit words. A number of entries of 0 in the LUT Descriptor (0028,3002)
now means 65536 entries.

### Migration Guidance

- **Files that the old code read incorrectly now look different.** No change to
  the application is necessary.

## A VOI LUT Function that the application sets stays active across frames

### What Changed

A VOI LUT Function that the application sets with
`setProperties({ VOILUTFunction })` on a stack viewport stays active when the
user scrolls to a different frame or image of the stack. This is the same rule
as for `voiRange`. Before, the result depended on the image size: the function
stayed active for an image of the same size and changed back to the function of
the file for an image of a different size. The function clears on `setStack`
and on `resetProperties`.

### Migration Guidance

- An application that set the function again after each scroll can remove that
  code.
- To go back to the function of each file, call `resetProperties()`.

## Generic viewports report the VOI LUT Function in effect

### What Changed

The generic viewports (`PLANAR_NEXT` and the compatibility controller) report
the VOI LUT Function in effect, as the stack and the volume viewports do:

- `getProperties().VOILUTFunction` is the function that the application set,
  or the function of the file. Before, it was `undefined` unless the application
  set a function.
- The `VOI_MODIFIED` event carries `VOILUTFunction` and
  `voiLUTSequenceApplied`.

### Migration Guidance

- An application that shows a window level value must call
  `toWindowLevel(lower, upper, VOILUTFunction)` with the function from the event
  or from `getProperties()`. Without the function, a LINEAR_EXACT series shows
  `W 401 / C 40.5` for a window of `W 400 / C 40`.
- When `voiLUTSequenceApplied` is `true`, show the range or a "VOI LUT" label.
  A window does not describe the curve.

## The CPU path follows the GPU for a colormap and for prescaled PT

### What Changed

- A colormap on a CPU stack viewport now replaces the curve of the VOI LUT
  Sequence and the curve of a sigmoid, as on the GPU. The colormap maps the
  window with a linear ramp. Before, the CPU path applied the sequence or the
  sigmoid and then the colormap.
- A prescaled PT image on the CPU path without a colormap now uses the VOI LUT
  Function: a SIGMOID series shows a sigmoid and not a linear ramp.

### Migration Guidance

- **Usually, you do not have to do an operation.** The CPU display agrees with
  the GPU display.

## Progressive loading: split chunk sizes, decode throttle, full resolution partial HTJ2K decode

### What Changed

Progressive retrieval now separates the first decode from the ones that follow,
and paces decoding on a clock:

- **`initialChunkSize`** (new, default 32kb) is how much data the first decode
  waits for. On a byte range retrieve it is the range fetched at `rangeIndex` 0. On a streaming retrieve it is how much of the response accumulates before
  the first decode, where the whole 128kb `chunkSize` was needed before.
- **`chunkSize`** (default 128kb) is now the size of each range _after_ the
  first, and for a streaming retrieve how much new data has to arrive before
  the partial codestream is decoded again. It previously meant the initial
  range, and defaulted to 64kb.
- **`msBetweenDecode`** (new, default 500) is the minimum time between two
  decodes of the same partial image. A completed image is always decoded, so
  this only ever delays intermediate versions. It applies to a streaming
  retrieve only: a byte range stage decodes once, when its range arrives, so
  there is no second decode for the clock to hold back.

Range boundaries follow from the first two: the end of range `n` is at
`initialChunkSize + n * chunkSize`, where it used to be `chunkSize * (n + 1)`.

The first stage of a frame fixes both sizes for that frame. A byte range
retrieve reads `initialChunkSize` and `chunkSize` on the stage that fetches the
first bytes, and every later stage of the same frame reuses those values,
because the ranges of one frame have to agree on where their boundaries fall.

Separately, setting `decodeLevel: 0` on a partial retrieve now means "decode at
full resolution from whatever bytes have arrived" rather than picking a reduced
level from how much of the frame is present. The resulting image is reported as
`LOSSY` instead of `SUBRESOLUTION`, since it is full size and only the
codestream is incomplete. This rests on `@cornerstonejs/codec-openjph` 2.4.10,
which decodes a truncated HTJ2K codestream instead of throwing on it. The codec
is a pinned dependency of `@cornerstonejs/dicom-image-loader`, so a normal
install already gets it.

### Why This Matters

**The rename is the breaking part.** A configuration that sets `chunkSize` to
size its _first_ range still compiles and still runs, but now sizes every range
after the first instead, leaving the initial range at the 32kb default. If you
had `chunkSize: 256000` to get a large first fetch, you now get 32kb first and
256kb increments after it.

The two sizes differ because they buy different things: the first range is
buying time to first image, where 32kb of HTJ2K is enough for a usable full
resolution decode, and later ranges are buying refinement, where small steps
only mean more requests for the same result.

For a non-HTJ2K transfer syntax the effect is on round trips rather than on
quality. Only HTJ2K decodes an incomplete buffer at all — see
[Partial decoding is HTJ2K only](#partial-decoding-is-htj2k-only) — so every
other syntax simply waits until a range completes the frame before decoding it
once. A smaller first range means it may take one more request to get there.

`msBetweenDecode` exists because chunk size alone does not bound decoding cost.
On a fast connection 128kb arrives in a few milliseconds, so a large frame would
decode dozens of times on its way to complete — work that costs far more than
the receive it is keeping up with, and that no display can show.

**A `chunkSize` set on a later stage is ignored**, because the first stage of a
frame fixes both sizes. A configuration that reads naturally — a small
`initialChunkSize` on the first stage and a large `chunkSize` on the stage after
it — therefore gets the 128kb default for its later ranges rather than the value
it asked for, and fetches to a nearer boundary than intended. Set both sizes on
the stage that retrieves `rangeIndex` 0.

**A streaming retrieve now shows its first image sooner.** The first decode
waits for `initialChunkSize`, 32kb by default, where it previously waited for
the full 128kb threshold. Set `initialChunkSize` on a streaming retrieve to get
the old behaviour back.

The codec floor is not optional. A consumer who dedupes `codec-openjph` to a
version older than 2.4.10 — via an override, a resolution, or a hoisted older
copy — will get throwing decodes on truncated codestreams.

How far that degrades depends on whether another stage covers the same image.
`ProgressiveRetrieveImages` chains stages through `next` per image ID, so a
failed decode only retries when a _later stage selects that same image_:

- `sequentialRetrieveStages` and `interleavedRetrieveStages` both cover every
  image again — the latter through its final catch-all `errorRetrieve` stage —
  so a failure there costs a slower load rather than a lost frame.
- `singleRetrieveStages`, which is the default when a configuration sets no
  `stages`, has one stage and its `errorRetrieve` fallback commented out. There
  is no `next`, so the frame is reported failed.
- A hand-written multi-stage configuration whose stages select disjoint images
  (by `decimate`/`offset`/`positions`) behaves like the single-stage case for
  any image only one stage covers.

A lost frame surfaces as a permanent `errorCallback` on the loader's listener
rather than an uncaught error, so it is reported rather than silent.

### Migration Guidance

- **Rename `chunkSize` to `initialChunkSize`** anywhere it was sizing the first
  range — which is what it always meant before this change.
- **Set `chunkSize` explicitly** if you want the later ranges at something other
  than 128kb, particularly for non-HTJ2K syntaxes.
- **Put both sizes on the first stage** of a byte range configuration. A later
  stage cannot change them.
- **Raise or zero `msBetweenDecode`** if 500ms is not the refresh rate you want;
  0 decodes on every chunk, as before. It applies to streaming retrieves only.
- **Check for a pinned older openjph.** If your lockfile resolves
  `@cornerstonejs/codec-openjph` below 2.4.10, remove the pin or raise it.
- **Prefer `decodeLevel: 0` for HTJ2K partial retrieves,** and keep
  sub-resolution levels for genuinely small renditions such as JLS thumbnails.

## Encapsulated Uncompressed and Deflated Image Frame Compression, and the JPEG XL UIDs

### What Changed

Two transfer syntaxes now decode:

- **Encapsulated Uncompressed Explicit VR Little Endian**
  (`1.2.840.10008.1.2.1.98`). Nothing is compressed; the syntax exists so that
  uncompressed pixel data can use the encapsulated format, one frame per
  fragment, which makes a single frame addressable without reading the whole
  Pixel Data element (PS3.5 A.4.11).
- **Deflated Image Frame Compression** (`1.2.840.10008.1.2.8.1`). Each frame is
  separately compressed with raw Deflate per RFC 1951 - no zlib header or
  Adler-32 trailer - and encapsulated as one fragment (PS3.5 A.4.13). This is
  per frame, unlike Deflated Explicit VR Little Endian
  (`1.2.840.10008.1.2.1.99`), which deflates the whole data set and is inflated
  by dicomParser before a frame is ever decoded.

Separately, the `image/jxl` media type mapping was **corrected**. It previously
resolved to `1.2.840.10008.1.2.4.140`, which is not a JPEG XL UID. JPEG XL was
ratified in Supplement 232 as:

| UID                       | Name                       |
| ------------------------- | -------------------------- |
| `1.2.840.10008.1.2.4.110` | JPEG XL Lossless           |
| `1.2.840.10008.1.2.4.111` | JPEG XL JPEG Recompression |
| `1.2.840.10008.1.2.4.112` | JPEG XL                    |

`image/jxl` now resolves to `1.2.840.10008.1.2.4.110`, which PS3.18
Table 8.7.3-5 gives as the default when a response carries no
`transfer-syntax` parameter to disambiguate. `application/x-deflate` was added
for Deflated Image Frame Compression from the same table.

All three JPEG XL syntaxes now **decode**, through
`@cornerstonejs/codec-libjxl`. They share one decoder: the difference between
them is what the encoder was allowed to do, not how the codestream is read.

Two limits worth knowing:

- **Signedness comes from `PixelRepresentation`, not the codestream.** JPEG XL
  has no signed sample type, so its decoder always reports unsigned and the
  loader applies `PixelRepresentation` itself - the same arrangement JPEG-LS
  uses. A JPEG XL frame whose metadata says signed is read correctly; a frame
  with no metadata is read as unsigned.
- **Partial decoding is not supported.** The codec rejects a truncated
  codestream rather than decoding what arrived, so JPEG XL is deliberately not
  in `streamableTransferSyntaxes` and byte range or streaming retrieves of it
  decode once, when the frame is complete. The format does support progressive
  decoding; this codec build does not use it yet.

### Why This Matters

Both new syntaxes reach the decoder as one fragment per frame, and both pad:
encapsulated fragments are padded to an even length, and Deflated Image Frame
Compression appends a NULL when the deflated stream is odd. The decoders trim
that padding to the frame's native pixel length, and treat a frame _shorter_
than its pixel data as an error rather than rendering it partially.

This release also fixes a latent bug in encapsulated frame extraction: a single
frame image has no `NumberOfFrames` element, which the fragment reader compared
against the fragment count and concluded the frames were fragmented, falling
back to a scan for JPEG SOI markers. That scan finds nothing in a syntax that
is not JPEG. `NumberOfFrames` now defaults to 1, so a conformant single frame
image of any encapsulated syntax takes the direct fragment path.

### Migration Guidance

- No action is required to read the two new syntaxes; they are decoded like any
  other.
- If you special-cased `1.2.840.10008.1.2.4.140` as JPEG XL anywhere in your own
  code, change it to the `.110`/`.111`/`.112` block.

## Volume textures: lossy downsampling is a configuration choice

### What Changed

`rendering.lossyDownsampling` of the `init` configuration states which lossy
downsampling the viewer may use:

| Kind                 | Default | What it does                                                                                 |
| -------------------- | ------- | -------------------------------------------------------------------------------------------- |
| `final`              | `false` | Reduces a volume texture that exceeds the GPU settings preset. The image stays reduced.      |
| `interactive`        | `true`  | Lowers the detail during an interaction, for example the sample distance of a 3D rotation.   |
| `interleavedLoading` | `true`  | Fills the frames that have not loaded yet with copies of the nearby frames, during the load. |

With the defaults, a volume renders as in 4.x: the volume texture has the full
dimensions of the volume, no GPU settings preset applies, and a 3D render uses
the sample distance of 4.x. The `interactive` and `interleavedLoading` kinds
keep the behaviour of 4.x.

With `final: true`, a volume texture comes from a GPU settings preset. A preset
is a named set of values (`low-tablet`, `low`, `medium`, `high`), and nothing
probes the device to choose it. When an application selects no preset, `high`
applies, and it limits each edge of a 3D texture to 2048 voxels. A volume with a
longer axis then draws from a box-average reduction of that axis. For example, a
CT of 512 × 512 × 2464 draws with a factor of 2 along k, also on a device that
supports a 4096 texture edge.

### Why This Matters

Each kind of lossy downsampling shows pixels that differ from the source data.
An application turns on a kind only when it also tells the user that the image
is lossy.

The reported `MAX_3D_TEXTURE_SIZE` is not a reliable limit, so no preset reads
it. Some Android devices report 2048 or more, but render only 256 per axis. No
tested device renders beyond 2048. Without final downsampling, such a device can
show a uniform gray image or lose its WebGL context.

### Migration Guidance

- **With the default settings, the volume pixels are the same as in 4.x, but
  the API and some behaviour changed.** Items 1 to 7 and 9 to 11 of
  [Changes that a 4.x application must check](#changes-that-a-4x-application-must-check)
  apply with the default settings. Item 8 applies only with
  `rendering.lossyDownsampling.final` on.
- **To fit the texture to a weak device,** set
  `rendering.lossyDownsampling.final` to `true` in the `init` configuration, or
  call `setLossyDownsampling({ final: true })` before a viewport adds its
  actors. Then call `setGpuSettingsPreset`. Use `low` or `low-tablet` for a
  device that renders only 256 per axis.
- **To show no lossy pixels at all,** set `interactive` and
  `interleavedLoading` to `false` as well.
- **For a full-resolution long axis with final downsampling on,** the only
  preset with a larger edge is `high-texture-4096`. That preset is internal: it
  is a control for comparison, and no device is tested at that edge. Use it only
  on hardware that you have tested.
- **The quality record of a reduced volume during a load** (`getGridQuality`)
  now counts only the empty boxes as missing. A box that holds some arrived
  frames is the average of those frames, and it holds data.

### Changes that a 4.x application must check

Each item states when it applies, the 4.x code that breaks or behaves
differently, and the 5.x code to use.

1. **`RenderingCapabilities.webgl2` is removed.** Default settings. The field
   `webgl` now means that the browser can make a WebGL2 context.

   ```js
   // 4.x
   if (getRenderingCapabilities().webgl2) { ... }
   // 5.x
   if (getRenderingCapabilities().webgl) { ... }
   ```

2. **`ImageVolume.vtkOpenGLTexture` is a getter with no setter.** Default
   settings. The texture store holds the textures of a volume in named sets.
   The getter returns the texture of the full-resolution set, and it returns
   `undefined` until something provisions that set, and after the store evicts
   it. An assignment to the field has no effect.

   ```js
   // 4.x: this can throw in 5.x
   volume.vtkOpenGLTexture.setUpdatedFrame(i);
   // 5.x: marks the frame in every texture of the volume
   volume.markFrameModified(i);
   // 5.x: when you need the texture, this provisions it if necessary
   const texture = volume.getFullResolutionTexture(); // can be undefined
   ```

3. **The voxel manager types changed.** Default settings.
   - `IVoxelManager<T>` is a structural interface, and not an alias of the
     class `VoxelManager<T>`. A type that needs the class must name the class.
   - `getRange` is optional. `createScalarVolumeVoxelManager` and
     `createImageVoxelManager` do not install it, so a call can throw a
     `TypeError`. A volume voxel manager has it: use the type
     `IVolumeVoxelManager` for that case.
   - `createHistoryVoxelManager`, `createRLEHistoryVoxelManager` and
     `createRLEImageVoxelManager` return `IVoxelManager<T>`, and not
     `VoxelManager<T>`.
   - `rows` and `columns` of `ImageLoadRequests.options.targetBuffer` are
     optional.

   ```ts
   // 4.x
   const [min, max] = voxelManager.getRange();
   // 5.x
   const range = voxelManager.getRange?.();
   ```

4. **A cached image of a streaming volume keeps the size from the decoder.**
   Default settings. The volume loader sends a `targetBuffer` with a type and
   no size. A sub-resolution decode (HTJ2K, a JLS thumbnail) therefore gives a
   cached image with fewer pixels than one slice of the volume. The voxel
   manager of the volume scales that image when it reads the slice, so a read
   of the volume gives the same values as in 4.x. Code that reads
   `image.getPixelData()` of such an image directly must use `image.rows` and
   `image.columns`, and not the dimensions of the volume.

   ```js
   // 4.x: the image always had the slice size of the volume
   const pixels = cache.getImage(imageId).getPixelData();
   // 5.x: read the slice through the volume
   const slice = volume.voxelManager.getSliceData({
     sliceIndex,
     slicePlane: 2,
   });
   ```

5. **The fidelity indicator is on by default.** Default settings. The viewport
   shows a label (`Low Fidelity` or `Transient Low Fidelity`) whenever it shows
   lossy data. Lossy data includes a lossy or sub-resolution delivery, a
   reduced texture, and the coarser sample distance of a 3D interaction. 4.x
   showed lossy data with no indicator. That behaviour was a defect, and it can
   be unsafe, because a user cannot tell a lossy image from a lossless image.
   5.x corrects the defect. Keep the indicator on. An application that shows
   its own indicator from `Events.VIEWPORT_FIDELITY_CHANGED` (or from
   `viewport.getFidelityState()`) can remove the built-in indicator:

   ```js
   // 5.x, only for an application with its own indicator
   await init({ dangerouslyDisableFidelityIndicator: true });
   element.addEventListener(Events.VIEWPORT_FIDELITY_CHANGED, (evt) => {
     showMyIndicator(evt.detail);
   });
   ```

6. **`texture.modified()` does not mark the frames for an upload.** Default
   settings. In 4.x, `modified()` of the streaming texture marked each frame.
   In 5.x, only `setUpdatedFrame()` and `markAllFramesUpdated()` mark frames.
   Code that writes voxels and then calls `modified()` on the texture shows a
   stale image.

   ```js
   // 4.x
   volume.voxelManager.setAtIndex(index, value);
   volume.vtkOpenGLTexture.modified();
   // 5.x: one frame, or every frame
   volume.markFrameModified(frameIndex);
   volume.modified();
   ```

7. **`volume.modified()` marks each slice of each texture for a new upload.**
   Default settings. The volume can hold more than one texture, and the call
   marks all of them. The next render uploads the full volume again. Call
   `volume.markFrameModified(i)` for each changed frame when only some frames
   changed.

8. **The generic `PlanarViewport` draws the original frame in the acquisition
   plane.** Only with `rendering.lossyDownsampling.final` on, and only when the
   final downsampling reduces the texture. In the acquisition plane, the source
   of the viewport draws the loaded image of the nearest frame in place of the
   reduced slice. The limits are:
   - The frame has no interpolation between frames.
   - The reduced slice shows until the frame loads.
   - `viewport.getActors()` has one more entry for the frame. That entry has no
     `referencedId`.
   - The legacy viewports (`StackViewport`, `VolumeViewport`) keep the reduced
     slice.

   ```js
   // 4.x: one actor for each data set
   const [entry] = viewport.getActors();
   // 5.x: select the entry by referencedId
   const entry = viewport.getActors().find((a) => a.referencedId === volumeId);
   ```

   See
   [Volume Render Strategy](../../concepts/cornerstone-core/volumeRenderStrategy.md#the-frames-of-the-acquisition-plane).

9. **A progressive volume load removes the stack prefetch of the same images.**
   Default settings, when a volume loads with a progressive retrieve
   configuration. When the load starts, the volume removes the queued
   prefetch requests of another loader for its images. `stackPrefetch` and
   `stackContextPrefetch` do not start while
   `volume.isLoadingProgressively()` is true. An application that relied on
   the stack prefetch to fill the cache during a volume load gets the images
   from the volume load in its own order. When the volume cancels its load, it
   fires `Events.IMAGE_VOLUME_LOADING_CANCELLED`, and `stackPrefetch` queues
   the prefetch of the stack again.

10. **A legacy volume viewport renders when its volume changes.** Default
    settings. After the load of a volume, `BaseVolumeViewport` calls
    `mapper.modified()` and `render()` on each `Events.IMAGE_VOLUME_MODIFIED`
    of a volume that it shows. During the load, the loader renders, as in 4.x.
    An application that rendered on that event itself can remove its call.

    ```js
    // 4.x: not necessary in 5.x for a legacy volume viewport
    eventTarget.addEventListener(Events.IMAGE_VOLUME_MODIFIED, () =>
      viewport.render()
    );
    ```

11. **A volume that leaves the cache loses its textures.** Default settings.
    On `Events.VOLUME_CACHE_VOLUME_REMOVED`, the texture store deletes every
    texture of that volume, also when a viewport still shows it. In 4.x, that
    viewport kept its image. Remove the volume from each viewport before you
    remove it from the cache, or load the volume again.

    ```js
    // 4.x: the viewport kept its image
    cache.removeVolumeLoadObject(volumeId);
    // 5.x
    viewport.removeVolumeActors([actorUID]); // the volume id, by default
    cache.removeVolumeLoadObject(volumeId);
    ```

12. **A streaming load fires fewer `VIEWPORT_FIDELITY_CHANGED` events.** Default
    settings, after 5.17.0. A volume viewport sends the fidelity state for
    `Events.IMAGE_VOLUME_MODIFIED` at most once in each animation frame, and not
    once for each image. The last state is the same. A render, and
    `Events.IMAGE_VOLUME_LOADING_COMPLETED`, still send the state at once. In a
    hidden tab, the browser does not run animation frames, so the state of a
    load comes at the end of the load, or when the tab shows again. An
    application that counts the events during a load must read the state, not
    count the events.

13. **A large volume can show a blank first frame.** Default settings, after
    5.17.0, with WebGL2, for a volume texture of 256 MB or more. The browser
    clears new texture storage before its first use. For a large texture, that
    clear took seconds and stopped the page. The texture now waits for the
    clear and does not stop the page. The viewport then draws nothing for about
    0.3 s (at most 3 s). For a frame in which no actor of the viewport drew, the
    engine fires no `Events.IMAGE_RENDERED` and no
    `Events.VIEWPORT_FIDELITY_CHANGED`. The first `IMAGE_RENDERED` comes with
    the first frame that shows the volume. A viewport with another actor that
    drew, for example a small PET over a large CT, fires the event as before.
    A smaller volume behaves as in 5.17.0.

    ```js
    // Code that captures the first frame needs no change: wait for the event.
    element.addEventListener(Events.IMAGE_RENDERED, capture, { once: true });
    ```

## Locked segments stop the brush, and do not cause an overlap

### What Changed

Earlier 5.x releases moved the painted segment to a new private labelmap layer
when a stroke touched a segment that the brush could not overwrite. This
occurred for a locked segment, and for a segment that `overwriteMode` (`'none'`
or `'visible'`) protects. The painted segment then overlapped the locked
segment.

Now the brush, the threshold brush and the scissors skip the voxels of a locked
segment on any layer of the segmentation, and a locked segment never causes a
new layer. This is the 4.x behavior for locked segments.

A protected segment that is not locked still causes the move to a new layer, as
before. The move and the stroke are one undo step.

An application can also move a segment before a stroke with
`segmentation.helpers.moveSegmentToPrivateLabelmap(segmentationId, segmentIndex, { recordHistory })`.
See
[Segment Locking](../../concepts/cornerstone-tools/segmentation/locking.md#overlapping-segments).

The SEG adapter now reads `labelmap3D.labelToSegmentIndex`, so a private layer
that stores a segment under a different label value exports under the correct
segment number. `segmentation.helpers.getLabelToSegmentIndex(segmentation, labelmapId)`
gives that map for one layer.

### Migration Guidance

- If your application relied on a locked segment to create an overlap, unlock
  the segment, or call `segmentation.helpers.moveSegmentToPrivateLabelmap` for
  the painted segment first.
- `beginLabelmapEditTransaction` accepts `segmentsLocked`. A locked segment in
  that list does not cause a move.
- If you export SEG from a multi-layer labelmap, set `labelToSegmentIndex` on
  each `labelmap3D` instead of a remap of the voxel values in your own code.

## Adapters name the writer in SR, SEG and RTSTRUCT

### What Changed

The SR, SEG and RTSTRUCT writers of `@cornerstonejs/adapters` now write
`Manufacturer`, `ManufacturerModelName` and `SoftwareVersions`. The defaults
are `CornerstoneJS`, `@cornerstonejs/adapters` and the adapters version. A
value in `options` wins over the default. Before this change, the SR and the
SEG wrote `Unspecified`, `Unspecified` and `0`. See
[The writer of the object](../../concepts/cornerstone-tools/segmentation/saving.md#the-writer-of-the-object).

Two changes can change the output of an existing application:

1. The RTSTRUCT ignores the writer values of a custom provider. Before this
   change, an application that returned `Manufacturer`,
   `ManufacturerModelName` or `SoftwareVersions` from its own
   `NewInstanceData` or `RtssInstanceData` provider got that value in the
   RTSTRUCT. Now the RTSTRUCT gets the value from `options`, or else the
   adapters default. The SR and the SEG never read the writer from a provider.
2. `MetadataModules.NEW_INSTANCE_DATA` (`'NewInstanceData'`) now gives
   `Manufacturer: 'CornerstoneJS'` in place of `'cs3d'`. The module also gives
   `ManufacturerModelName` and `SoftwareVersions`.

### Migration Guidance

- If your provider sets the writer of the RTSTRUCT, pass the values in the
  `options` of `generateRTSSFromRepresentation`, or of the other
  `generateRTSSFrom*` functions.
- If your code compares `Manufacturer` with `'cs3d'`, compare it with
  `utilities.DEFAULT_WRITER_HEADER.Manufacturer`.

## Labelmaps of a 4D series follow the time point

### What Changed

A labelmap that references a 4D (dynamic) series is now one volume of one
time point. The volume follows the time point of the dynamic image volume.
Before this change, the tools made one volume from the labelmap images of
every time point, and that volume had the wrong depth.

`SEGMENTATION_DATA_MODIFIED` changes in three ways:

1. The event detail has a new field, `dimensionGroupNumber`. For a
   segmentation of a 4D series that has a dynamic labelmap volume, the
   field gives the time point of the modified data, from 1. An undo or a
   redo gives the time point of the edit, which can be different from the
   time point on display. For a segmentation of a 3D series, and for a 4D
   segmentation with overlapping segments (one static volume), an edit does
   not set the field.
2. A change of time point (`DYNAMIC_VOLUME_DIMENSION_GROUP_CHANGED`) now fires
   `SEGMENTATION_DATA_MODIFIED` for each segmentation with a 4D labelmap, with
   the new `dimensionGroupNumber`.
3. A change of time point also fires the event for a 3D labelmap that
   references the images of the dynamic volume, with `voxelsUnchanged: true`.
   The voxels of that labelmap do not change, but its statistics now use the
   time point on display.

Other changes:

- One time point is active for each 4D labelmap, and all viewports share it.
  An edit in a stack viewport first selects the time point of the image on
  display.
- The view reference of a volume viewport that shows a dynamic volume has
  `dimensionGroupNumber`. `isReferenceViewable` without navigation returns
  false for a different time point. `setViewReference` selects the time point
  of the reference.
- `convertStackToVolumeLabelmap` ignores `options.volumeId` for a 4D labelmap.
  `convertVolumeToStackLabelmap` keeps the labelmap images of every time
  point.
- A 4D labelmap can cover only some time points of the series. When the image
  shows a time point that the labelmap does not cover, the labelmap keeps its
  last covered time point, and a stack or volume overlay can show the labels
  of that time point. An edit on an uncovered time point changes nothing. The
  change of time point fires no `SEGMENTATION_DATA_MODIFIED` for that
  labelmap.
- For a 4D labelmap that covers only some time points, `dimensionGroupNumber`
  is not consistent: a change of time point gives the time point of the
  series, and an edit or an undo gives the index among the covered time
  points. The two numbers are equal when the labelmap covers every time point.
  [#3090](https://github.com/cornerstonejs/cornerstone3D/issues/3090) tracks
  one number for both. Until that fix, do not use `dimensionGroupNumber` as
  a key for the data of each time point of such a labelmap, because two time
  points can give the same number.
- A 4D labelmap with more than one labelmap image for one referenced image
  (overlapping segments) stays one static volume of every time point, as
  before this change.
- `getCompleteScalarDataArray`, `setCompleteScalarDataArray` and
  `invalidateCache` of a 4D labelmap act on the active time point of the
  labelmap. That is the time point on display, except when the labelmap does
  not cover the time point on display: then it is the last covered time
  point. Labelmap interpolation and grow cut edit only the active time point.
  Grow cut discards its result when the time point changes during the
  computation.

### Migration Guidance

- A listener of `SEGMENTATION_DATA_MODIFIED` that does slow work, for example
  the statistics or a contour conversion, now also runs on each change of
  time point. Debounce the work, or skip an event with `voxelsUnchanged` when
  the work does not depend on the image values.
- A listener that keeps data for each time point must read
  `dimensionGroupNumber`, and not the time point on display.
