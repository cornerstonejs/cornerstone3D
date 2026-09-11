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

## Progressive loading: split chunk sizes, decode throttle, full resolution partial HTJ2K decode

### What Changed

Progressive retrieval now separates the first range from the ones that follow,
and paces decoding on a clock:

- **`initialChunkSize`** (new, default 32kb) is the byte range fetched for the
  first decode, at `rangeIndex` 0.
- **`chunkSize`** (default 128kb) is now the size of each range _after_ the
  first, and for a streaming retrieve how much new data has to arrive before
  the partial codestream is decoded again. It previously meant the initial
  range, and defaulted to 64kb.
- **`msBetweenDecode`** (new, default 500) is the minimum time between two
  decodes of the same partial image. A completed image is always decoded, so
  this only ever delays intermediate versions.

Range boundaries follow from the first two: the end of range `n` is at
`initialChunkSize + n * chunkSize`, where it used to be `chunkSize * (n + 1)`.

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
- **Raise or zero `msBetweenDecode`** if 500ms is not the refresh rate you want;
  0 decodes on every chunk, as before.
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
