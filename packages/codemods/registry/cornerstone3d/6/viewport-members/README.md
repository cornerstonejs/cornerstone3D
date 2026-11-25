# Cornerstone3D 6.0 Viewport Members Migration

Rewrites the members of the legacy viewports that have a fixed 6.0 call, and
reports the others. Steps 4 to 8 and 10 of the
[upgrade](https://www.cornerstonejs.org/docs/migration-guides/6x/upgrade-step-by-step#step-4-the-look-of-the-data).

## Usage

```sh
npx codemod @cornerstonejs/cornerstone3d-6-viewport-members
```

## Changes

Only on a viewport that the file shows to come from Cornerstone: a call of
`getViewport` on a rendering engine made with `new RenderingEngine` or got
with `getRenderingEngine`, the `viewport` of `getEnabledElement`, a cast or
annotation whose top type is a Cornerstone viewport type, or a `const` (or a
parameter that the file never writes) that holds one of these. A legacy
member on a name such as `viewport` alone, a `let` or a `var` is reported by
its name, and so is a legacy member in brackets
(`viewport['getProperties']()`). A `renderer.resetCamera()` of vtk.js stays.

- `resetCamera()` and `resetCamera({ resetPan, resetZoom, resetOrientation })`
  become `resetViewState(...)`.
- `setProperties({ ... })` with one object of appearance keys becomes
  `setDisplaySetAppearance({ ... })`, which sets the source display set;
  `VOILUTFunction` becomes `voiLUTFunction`, also as a quoted key, which
  keeps its quotes. `preset` and
  `sampleDistanceMultiplier` count only on a viewport typed as a 3D viewport.
  An ECG `setProperties` of view keys becomes `setViewState` (`layoutType`
  becomes `traceLayout`). In its `colormap` literal a number in `opacity`
  becomes the `opacity` of the appearance beside the colormap, and a list in
  `opacity` becomes `opacityMapping` (6.0 has one opacity).
- `resetCameraForResize()` becomes `resetViewStateForResize()`,
  `getTargetImageIdIndex()` `getCurrentImageIdIndex()`.
- `getViewPresentation(selector)` and `setViewPresentation(presentation)`
  become `getViewFraming(selector)` and `setViewFraming(framing)`, each listed
  for review: zoom and pan of the framing are against the fit, the framing
  has no slab thickness and no window (they are keys of
  `setDisplaySetAppearance`), and `getViewFraming` gives undefined while the
  viewport shows nothing. On a receiver that the file gives a type of the
  application (a cast such as `viewport as unknown as LegacyViewport`, or a
  name declared with such a type) they are reported: that type declares
  them.
- `getActorUIDs()`, `getActorByIndex(i)` and `getActorUIDByIndex(i)`
  become reads of `getActors()`; `getAllVolumeIds()` becomes
  `getVolumeIds({ includeSegmentations: true })`, which lists the labelmap
  volumes too, as 5.x did; `getBounds()`
  becomes `getImageData()?.imageData.getBounds?.()`, which passes
  `strictNullChecks` and gives undefined while the viewport shows nothing.
- `isInAcquisitionPlane()`, `getSlicesClippingPlanes()`,
  `getVtkDisplayCoords(point)` and `getCurrentSlicePixelData()` become
  functions of the core `utilities`; `getCornerstoneImage()` becomes
  `cache.getImage(viewport.getCurrentImageId())`; `isOrientationChangeable()`
  the test of the map.
- Reads of `modality`, `isDisabled`, `uid`, `fps` and `numberOfFrames` become
  `utilities.getViewportModality(viewport)`, `isDestroyed`, `id`,
  `getFrameRate()` and `getNumberOfFrames()`.
- `setFrameRange(range)` and `setAverageWhite(value)` become `setViewState`
  and `setDisplaySetAppearance`.
- `setDisplaySetAppearance` sets the display set that the viewport shows,
  and does nothing before the first mount, where 5.x kept the properties.
  So `setProperties` of appearance keys and `setAverageWhite` change only
  on a viewport that is a name whose binding holds one value (a `const`, an
  unwritten parameter), after a statement of the same function that awaits
  a mount on that binding (`await viewport.setDisplaySets(...)`,
  `await viewport.setStack(...)` and their kin), with no mount on it after
  the call or before it without `await`. A mount under an `if` or in
  another function proves nothing.
- On a viewport typed as a planar viewport (or created in the same function
  by an input of type `STACK`, `ORTHOGRAPHIC` or `PLANAR`):
  `setCamera({ flipHorizontal })` becomes `setViewState(...)`, and a
  `getCamera()` read for its flip only (`const { flipHorizontal } =
viewport.getCamera()`, `viewport.getCamera().flipVertical`) becomes
  `getViewState()`. Any other `getCamera()` is reported.

## Reported

- On a viewport that the file shows to be of one family (a cast, a type, or
  an input of that type in the same function), the members that family lost
  while the other families keep them, with the 6.0 call: on a 3D viewport
  `setOrientation`, `getImageActor`, `hasImageURI`, `getRotation` and the
  slice members (`getCurrentImageIdIndex`, `getSliceIndex`,
  `getCurrentImageId`, `getNumberOfSlices`, `scroll`); on a video viewport
  `end` and `hasImageURI`; on an ECG viewport `getNumberOfSlices`. A
  receiver known by its name only is left: the name is right on the other
  families.

All manual, with the rule name: `setProperties` with a second argument, a
variable, a spread, or a key without a twin (`slabThickness`, `preset`,
`isComputedVOI` and the others), or before the viewport shows its data;
`setProperties` whose `colormap.opacity` is not a number or a list that the
file shows, or whose colormap has `opacityMapping` too;
`setAverageWhite` before the viewport shows its data;
`resetCamera` with `resetToCenter` or `storeAsInitialCamera`; `getCamera`,
`setCamera` of other keys, `getProperties`, `resetProperties`, the default
properties, the actor members, `getSliceViewInfo`,
`getIntensityFromWorld`, `jumpToWorld`, `flip`, `setBlendMode`,
`setSlabThickness`, `togglePlayPause`, `setChannelVisibility`,
`getSliceIndexForImage` (5.x took a view reference too and gave `undefined`
for a missing image, where `getImageIds().indexOf(imageId)` gives -1), writes
of a
renamed property, the properties `requestedType`, `scaling` and
the others of the map (`options`, `setOptions` and `reset` are reported by
the `api-names` step, with the text of the guide), and the removed helpers of the core
(`viewportSupportsStackCompatibility`, `getImageLegacy`, `scrollVolume`,
`getVolumeViewportScrollInfo` and the others), also in an
`export { ... } from '@cornerstonejs/core'`, and
`renderFrameOfReference` on a rendering engine (also in brackets): call
`renderViewports` with the ids of the viewports of that frame of reference.

## Review

The rewrite of `getAllVolumeIds()` is listed for review: `getVolumeIds`
gives the source first (5.x gave the order in which the volumes were
added), `[]` while the viewport shows a stack, and leaves out a labelmap
that the tools draw as images beside a slice cut on the CPU, which shows
no volume. Without the labelmaps of segmentations, call
`viewport.getVolumeIds()`.

The rewrites of `getViewPresentation` and `setViewPresentation` are listed
for review, with what the framing of 6.0 does differently.

- Manual, at line 1: `the file was not analysed:` with the reason, for a
  file whose names cannot be looked up (the tool cannot read it, or a name
  is declared twice in one scope). The file stays as it is. See the README
  of `@cornerstonejs/cornerstone3d-6`.

## Development

From `packages/codemods`:

```sh
yarn test
npx codemod workflow validate -w registry/cornerstone3d/6/viewport-members
```

The fixtures of `.ts` files are in `tests/typescript` (parsed as TypeScript),
the others in `tests/tsx`. Each `metrics.json` holds the sites that a fixture
reports.
