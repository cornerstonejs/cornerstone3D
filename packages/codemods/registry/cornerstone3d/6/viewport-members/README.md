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
  becomes `traceLayout`).
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
- `getActorUIDs()`, `getAllVolumeIds()`, `getActorByIndex(i)` and
  `getActorUIDByIndex(i)` become reads of `getActors()`; `getBounds()`
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
- On a viewport typed as a planar viewport: `setCamera({ flipHorizontal })`
  becomes `setViewState(...)`.

## Reported

All manual, with the rule name: `setProperties` with a second argument, a
variable, a spread, or a key without a twin (`slabThickness`, `preset`,
`isComputedVOI` and the others), or before the viewport shows its data;
`setAverageWhite` before the viewport shows its data;
`resetCamera` with `resetToCenter` or `storeAsInitialCamera`; `getCamera`,
`setCamera` of other keys, `getProperties`, `resetProperties`, the default
properties, the actor members, `getSliceViewInfo`,
`getIntensityFromWorld`, `jumpToWorld`, `flip`, `setBlendMode`,
`setSlabThickness`, `togglePlayPause`, `setChannelVisibility`,
`getSliceIndexForImage` (5.x took a view reference too and gave `undefined`
for a missing image, where `getImageIds().indexOf(imageId)` gives -1), writes
of a
renamed property, the properties `requestedType`, `options`, `scaling` and
the others of the map, and the removed helpers of the core
(`viewportSupportsStackCompatibility`, `getImageLegacy`, `scrollVolume`,
`getVolumeViewportScrollInfo` and the others), also in an
`export { ... } from '@cornerstonejs/core'`, and
`renderFrameOfReference` on a rendering engine (also in brackets): call
`renderViewports` with the ids of the viewports of that frame of reference.

## Review

The rewrite of `getAllVolumeIds()` is listed for review: `getActors()` also
lists the actors of labelmaps, surfaces and the images of a stack, whose
`referencedId` is not a volume id or is undefined. Keep the ids that
`viewport.hasVolumeId(id)` takes where only the volumes count.

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
