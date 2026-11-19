# Cornerstone3D 6.0 Viewport Members Migration

Rewrites the members of the legacy viewports that have a fixed 6.0 call, and
reports the others. Steps 4 to 8 and 10 of the
[upgrade](https://www.cornerstonejs.org/docs/migration-guides/6x/upgrade-step-by-step#step-4-the-look-of-the-data).

## Usage

```sh
npx codemod @cornerstonejs/cornerstone3d-6-viewport-members
```

## Changes

Only on a viewport: a name such as `viewport` or `ctViewport`, a call of
`getViewport`, or a variable typed as or holding one. A `renderer.resetCamera()`
of vtk.js stays.

- `resetCamera()` and `resetCamera({ resetPan, resetZoom, resetOrientation })`
  become `resetViewState(...)`.
- `setProperties({ ... })` with one object of presentation keys becomes
  `setDisplaySetPresentation({ ... })`, which sets the source display set;
  `VOILUTFunction` becomes `voiLUTFunction`. `preset` and
  `sampleDistanceMultiplier` count only on a viewport typed as a 3D viewport.
  An ECG `setProperties` of view keys becomes `setViewState` (`layoutType`
  becomes `traceLayout`).
- `resetCameraForResize()` becomes `resetViewStateForResize()`,
  `getTargetImageIdIndex()` `getCurrentImageIdIndex()`.
- `getActorUIDs()`, `getAllVolumeIds()`, `getActorByIndex(i)` and
  `getActorUIDByIndex(i)` become reads of `getActors()`; `getBounds()`
  becomes `getImageData().imageData.getBounds()`.
- `isInAcquisitionPlane()`, `getSlicesClippingPlanes()`,
  `getVtkDisplayCoords(point)` and `getCurrentSlicePixelData()` become
  functions of the core `utilities`; `getCornerstoneImage()` becomes
  `cache.getImage(viewport.getCurrentImageId())`; `isOrientationChangeable()`
  the test of the map.
- Reads of `modality`, `isDisabled`, `uid`, `fps` and `numberOfFrames` become
  `utilities.getViewportModality(viewport)`, `isDestroyed`, `id`,
  `getFrameRate()` and `getNumberOfFrames()`.
- `setFrameRange(range)` and `setAverageWhite(value)` become `setViewState`
  and `setDisplaySetPresentation`.
- On a viewport typed as a planar viewport: `setCamera({ flipHorizontal })`
  becomes `setViewState(...)`, `getSliceIndexForImage(imageId)`
  `getImageIds().indexOf(imageId)`.

## Reported

All manual, with the rule name: `setProperties` with a second argument, a
variable, a spread, or a key without a twin (`slabThickness`, `preset`,
`isComputedVOI` and the others), or before the viewport shows its data;
`resetCamera` with `resetToCenter` or `storeAsInitialCamera`; `getCamera`,
`setCamera` of other keys, `getProperties`, `resetProperties`, the default
properties, the view presentation, the actor members, `getSliceViewInfo`,
`getIntensityFromWorld`, `jumpToWorld`, `flip`, `setBlendMode`,
`setSlabThickness`, `togglePlayPause`, `setChannelVisibility`, writes of a
renamed property, the properties `requestedType`, `options`, `scaling` and
the others of the map, and the removed helpers of the core
(`viewportSupportsStackCompatibility`, `getImageLegacy`, `scrollVolume`,
`getVolumeViewportScrollInfo` and the others).

## Development

From `packages/codemods`:

```sh
yarn test
npx codemod workflow validate -w registry/cornerstone3d/6/viewport-members
```

The fixtures of `.ts` files are in `tests/typescript` (parsed as TypeScript),
the others in `tests/tsx`. Each `metrics.json` holds the sites that a fixture
reports.
