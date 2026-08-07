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

## In-plane voxel iteration and oblique in-plane spacing

### What Changed

5.x adds two core utilities for enumerating voxels on an annotation plane rather
than over the full 3D bounding box:

- `csUtils.getInPlaneSpacingAndXYDirections(imageData, viewRight, viewUp)` —
  returns the in-plane voxel spacing (`[xSpacing, ySpacing]`) and the world-space
  x/y directions for a plane. It keeps an exact fast path when an in-plane axis is
  parallel to a volume axis, and projects the volume spacing onto the axis
  otherwise.
- `csUtils.iterateOverPlane(volume, options)` — walks the voxels on an oriented
  plane (or thin slab, via `normalExtent`) at voxel spacing, de-duplicating
  visited voxels. This is `O(N²)` in the in-plane area instead of `O(N³)` over the
  axis-aligned box, which matters for oblique planar fills.

The planar freehand spacing helper
(`getSubPixelSpacingAndXYDirections`) was refactored to delegate its geometry to
the shared core utility. As part of that, the shared in-plane spacing path **no
longer throws `'No support yet for oblique plane planar contours'`** — oblique
planes now resolve to a projected voxel spacing.

### Why This Matters

- Oblique planar fills no longer pay the cost of testing the mostly-empty 3D
  bounding box, and the off-plane depth-tolerance fudge is no longer needed.
- Code that previously caught/relied on the oblique throw from the shared spacing
  path will no longer see that exception.

### Migration Guidance

- These are additive core utilities; no action is required to keep existing
  behavior.
- If you implemented a custom planar fill strategy, you can opt into
  `iterateOverPlane` by providing the plane descriptor on `operationData`;
  `regionFill` falls back to the classic 3D-box iterator when it is absent.
- If you depended on the oblique `throw` as a guard, gate on your own orientation
  check instead.
- See the
  [Planar Fill Iteration](../../concepts/cornerstone-tools/segmentation/planar-fill-iteration.md)
  concept page for the full design and the per-strategy contract.
