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

## SEG adapter: `createFromDICOMSegBuffer` renamed to `createFromDicomSegImageId`

### What Changed

`adaptersSEG.Cornerstone3D.Segmentation.createFromDICOMSegBuffer` has been
renamed to `createFromDicomSegImageId`. Its second argument is a SEG instance
`imageId` (with pixels sourced from the provided per-frame `imageId`s /
decoder) — it does **not** accept a Part 10 `ArrayBuffer`, despite the previous
name implying a buffer.

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

The rename was deliberate: the second argument changed contract entirely
(`ArrayBuffer` -> `imageId`) while keeping the same position. Renaming turns
what would have been a silent runtime failure (an `ArrayBuffer` passed where an
`imageId` is expected) into an immediate, obvious error, rather than shipping a
same-named function with an incompatible contract and no deprecation path.

### The `frameImageIds` option

`frameImageIds` is the list of loadable imageIds — one per SEG frame — that the
adapter passes to the image loader to read pixel data. It exists because of the
underlying change in how pixels are obtained.

The old buffer-based path decoded the entire SEG from a single Part 10
`ArrayBuffer` held in memory, so individual frames never needed their own
imageIds. The new path instead loads each frame's pixels through the image
loader, which means it needs one addressable imageId **per frame**.

The adapter can only build that per-frame list itself when the SEG `imageId`
uses a frame-addressing convention it recognizes:

- **WADO-RS / DICOMweb** — frames are separate resources (`.../frames/1`,
  `.../frames/2`, …), so the list is derived by substituting the frame number.
- **WADO-URI** — frames are selected with a query parameter (`?frame=1`,
  `&frame=2`, …), so the list is derived by appending the frame query.

For any other imageId form (custom schemes, blob/object URLs that are not
WADO-URI, application-specific loaders, etc.) there is no general rule for
turning a base `imageId` into per-frame imageIds, so the adapter cannot
auto-generate the list. In those cases you must pass `frameImageIds` explicitly
(or a `getFrameImageId(segImageId, frameNumber)` callback). If you omit it for an
unrecognized multi-frame `imageId`, every frame falls back to the same base
`imageId` and decodes identical pixels.

```ts
// Multi-frame SEG on a non-WADO scheme: provide the per-frame imageIds.
const results =
  await adaptersSEG.Cornerstone3D.Segmentation.createFromDicomSegImageId(
    referencedImageIds,
    segImageId,
    {
      metadataProvider,
      frameImageIds, // one loadable imageId per frame
    }
  );

// Or supply a builder instead of the full list:
//   getFrameImageId: (segImageId, frameNumber) => `${segImageId}?frame=${frameNumber}`
```

Single-frame SEG, WADO-RS, and WADO-URI imageIds do not require `frameImageIds`.

### Migration Guidance

- If you load a SEG via per-frame `imageId`s (the OHIF / imageLoader path),
  switch the call to `createFromDicomSegImageId` and pass the SEG instance
  `imageId` as the second argument.
- If you still have a Part 10 `ArrayBuffer`, use `createLabelmapsFromDICOMBuffer`
  (`(referencedImageIds, arrayBuffer, metadataProvider, options)`) or
  `generateToolState`, which retain the buffer-based entry point.
