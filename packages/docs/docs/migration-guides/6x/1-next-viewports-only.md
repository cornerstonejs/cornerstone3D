---
id: next-viewports-only
title: Next viewports only
summary: 6.0 removes the legacy viewport classes, the compatibility adapters and the legacy viewport API. This page lists what is removed and what replaces each call
---

# Next viewports only

**State: decided, not in the code yet.**

5.x has two families of viewports. The legacy ones (`StackViewport`,
`VolumeViewport`, `VolumeViewport3D`, and the legacy video, whole slide and ECG
viewports) and the Generic ("next") ones. With `rendering.useGenericViewport`,
5.x also runs the legacy API on the next viewports through compatibility
adapters. The [5.x guide](../5x/2-generic-viewport.md) says that those adapters
are temporary.

6.0 keeps the next viewports and their API, and nothing else.

## What is removed

- **The legacy viewport classes:** `Viewport`, `StackViewport`,
  `BaseVolumeViewport`, `VolumeViewport`, `VolumeViewport3D`, and the legacy
  `VideoViewport`, `WSIViewport` and `ECGViewport`.
- **The compatibility adapters** that 5.x creates for a legacy viewport type
  when `rendering.useGenericViewport` is on.
- **`rendering.useGenericViewport`.** There is nothing to switch.
- **The legacy viewport types:** `ViewportType.STACK`,
  `ViewportType.ORTHOGRAPHIC` and `ViewportType.PERSPECTIVE`.
- **The word "next" in the type names.** The five types that remain get plain
  names. See [The viewport types](#the-viewport-types).
- **The legacy viewport API:** `setStack`, `setVolumes`, `addVolumes`,
  `setProperties`, `getProperties`, `getCamera`, `setCamera`, `resetCamera`,
  `getViewPresentation`, `setViewPresentation`, and the actor methods of the
  legacy planar viewports. The table below gives the replacement of each.
- **Helpers that exist for the legacy API:** `setVolumesForViewports`,
  `addVolumesToViewports`, `utilities.convertStackToVolumeViewport`,
  `utilities.convertVolumeToStackViewport`, and the guards
  `utilities.viewportSupportsStackCompatibility` and
  `utilities.viewportSupportsVolumeCompatibility`.
- **The legacy types:** `Types.IStackViewport`, `Types.IVolumeViewport` and
  `Types.IBaseVolumeViewport`. `Types.IViewport` describes a next viewport.
- **Settings that only the legacy viewports read:**
  `rendering.useCPURendering` with `setUseCPURendering`,
  `resetUseCPURendering` and `getShouldUseCPURendering`, and
  `rendering.useLegacyCameraFOV`.

## The viewport types

| 5.x                             | 6.0                        |
| ------------------------------- | -------------------------- |
| `ViewportType.STACK`            | `ViewportType.PLANAR`      |
| `ViewportType.ORTHOGRAPHIC`     | `ViewportType.PLANAR`      |
| `ViewportType.PERSPECTIVE`      | `ViewportType.VOLUME_3D`   |
| `ViewportType.PLANAR_NEXT`      | `ViewportType.PLANAR`      |
| `ViewportType.VOLUME_3D_NEXT`   | `ViewportType.VOLUME_3D`   |
| `ViewportType.VIDEO_NEXT`       | `ViewportType.VIDEO`       |
| `ViewportType.WHOLE_SLIDE_NEXT` | `ViewportType.WHOLE_SLIDE` |
| `ViewportType.ECG_NEXT`         | `ViewportType.ECG`         |

`VOLUME_3D`, `VIDEO`, `WHOLE_SLIDE` and `ECG` keep their names and now mean the
next viewport of that family. The rename is the last step of the removal.
Until it lands, the code on this page uses the `_NEXT` names.

A `PERSPECTIVE` viewport becomes a 3D viewport with
`parallelProjection: false` in its options. See
[3D viewports](./2-rendering-changes.md#3d-viewports) for what the legacy type
drew.

## One planar viewport for stacks and volumes

A stack viewport and an orthographic viewport become one type. What the
viewport shows decides how it behaves, not its type:

```ts
renderingEngine.enableElement({
  viewportId,
  element,
  type: Enums.ViewportType.PLANAR_NEXT,
});

const viewport = renderingEngine.getViewport<PlanarViewport>(viewportId);

viewport.getCurrentMode();
```

`getCurrentMode()` returns `'stack'`, `'volume'` or `'empty'` for a planar
viewport. `utilities.getViewportContentMode(viewport)` gives the same answer
for any viewport. Use them where the code asked
`viewport instanceof StackViewport` or `viewport.type === ViewportType.STACK`.

## From each legacy call to the next API

The pages under
[Generic Viewport](../../concepts/cornerstone-core/generic-viewport/migration.md)
show each of these with code before and after.

| Legacy                                                              | Next                                                                                                                                       |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `ViewportType.STACK`, `ViewportType.ORTHOGRAPHIC`                   | `ViewportType.PLANAR_NEXT`                                                                                                                 |
| `ViewportType.VOLUME_3D`, `VIDEO`, `WHOLE_SLIDE`, `ECG`             | `VOLUME_3D_NEXT`, `VIDEO_NEXT`, `WHOLE_SLIDE_NEXT`, `ECG_NEXT`                                                                             |
| `viewport.setStack(imageIds, index)`                                | Register a display set with `imageIds` and `initialImageIdIndex`, then `viewport.setDisplaySets({ displaySetId })`                         |
| `viewport.setVolumes([{ volumeId }])`, `setVolumesForViewports`     | Register a display set with `imageIds` and `volumeId`, then `viewport.setDisplaySets({ displaySetId, options: { orientation } })`          |
| `viewport.addVolumes(...)`, a fusion                                | Several entries in `setDisplaySets(...)`, or `viewport.addDisplaySet(displaySetId, options)`                                               |
| `viewport.setVideo(...)`, `setEcg(...)`, `setWSI(...)`              | Register a display set of kind `'video'`, `'ecg'` or `'wsi'`, then `viewport.setDisplaySets({ displaySetId })`                             |
| `viewport.setProperties({ voiRange, colormap, invert })`            | `viewport.setDisplaySetPresentation(displaySetId, { voiRange, colormap, invert })`                                                         |
| `viewport.getProperties()`                                          | `viewport.getDisplaySetPresentation(displaySetId)`                                                                                         |
| `viewport.setDefaultProperties(...)`, `resetToDefaultProperties()`  | No twin. Keep the default in the application and set it with `setDisplaySetPresentation`                                                   |
| A `callback` on a volume input that edits the actor                 | `setDisplaySetPresentation` with `voiRange`, `colormap`, `opacity`, `invert`, `blendMode` or `preset`                                      |
| An `actorUID` on a volume input, then `viewport.getActor(actorUID)` | `viewport.getActors()` and the `referencedId` of each entry                                                                                |
| `viewport.setBlendMode(...)`, `viewport.setSlabThickness(...)`      | `setDisplaySetPresentation(displaySetId, { blendMode, slabThickness })`                                                                    |
| `viewport.getCamera()`                                              | `viewport.getViewState()` for the state, `viewport.getResolvedView()?.toICamera()` for a camera in the old shape                           |
| `viewport.setCamera({ ... })`                                       | `viewport.setViewState({ ... })` or `viewport.updateViewState(...)`. For a place in space: `viewport.setViewReference(...)`                |
| `viewport.resetCamera()`                                            | `viewport.resetViewState()`                                                                                                                |
| `viewport.getViewPresentation()`, `viewport.setViewPresentation()`  | `viewportProjection.getPresentation(viewport, { selector })`, and `viewportProjection.withPresentation(viewport, ...)` with `setViewState` |
| `viewport.flip(...)`, a rotation set through the camera             | `viewport.setViewState({ rotation, flipHorizontal, flipVertical })`                                                                        |
| `rendering.useCPURendering`, `setUseCPURendering(true)`             | Nothing to set. The router picks the path for each layer. `viewport.getRenderPlan()` tells which one and why                               |
| `Types.IStackViewport`, `Types.IVolumeViewport`                     | `PlanarViewport`, or `Types.IGenericViewport` where any next viewport will do                                                              |
| `viewport instanceof StackViewport`, `viewport.type === STACK`      | `viewport.getCurrentMode() === 'stack'`, or `utilities.getViewportContentMode(viewport)`                                                   |

These keep their names on a planar viewport: `getImageIds`,
`getCurrentImageId`, `getCurrentImageIdIndex`, `setImageIdIndex`, `scroll`,
`setOrientation`, `getZoom`, `setZoom`, `getPan`, `setPan`,
`getViewReference`, `setViewReference`, `canvasToWorld`, `worldToCanvas`,
`getFrameOfReferenceUID`, `getImageData` and `render`.

So do these, which only the adapter had in 5.x: `jumpToWorld`,
`isInAcquisitionPlane`, `getBounds`, `getIntensityFromWorld`,
`getSliceViewInfo`, `getCurrentSlicePixelData`, `getSlicesClippingPlanes`,
`getSlicePlaneCoordinates`, `getCornerstoneImage`, `scaling`,
`stackActorReInitialized`, `isDisabled`, `isOrientationChangeable` and
`getAllVolumeIds`.

A display set is registered once, under an id that the application chooses:

```ts
utilities.genericViewportDisplaySetMetadataProvider.add(displaySetId, {
  kind: 'planar',
  imageIds,
  initialImageIdIndex: 0,
  volumeId,
});

await viewport.setDisplaySets({ displaySetId });
```

Leave `volumeId` out for a stack.

## What comes over and what does not

The new viewports do not rebuild the legacy API. A feature comes over when it
fits the new shape: a key of a presentation or of the view state.

Carried over, in the new shape:

- the sharpening and smoothing of the stack and volume viewports, as the
  `sharpening` and `smoothing` keys of a presentation;
- a perspective camera, on a 3D viewport with `parallelProjection: false`;
- vtk.js actors of the application in a 3D viewport.

Not carried over:

- default properties (`setDefaultProperties` and its family);
- a preset on a slice viewport;
- a display area and an aspect ratio on a 3D viewport;
- vtk.js actors of the application in a slice viewport;
- a labelmap over a video, which the legacy video viewport did not have
  either.

[What draws differently](./2-rendering-changes.md) has the call for each one.

## Find the code to change

```sh
rg "ViewportType\.(STACK|ORTHOGRAPHIC|PERSPECTIVE)"
rg "\.(setStack|setVolumes|addVolumes|setProperties|getProperties)\("
rg "\.(getCamera|setCamera|resetCamera|getViewPresentation|setViewPresentation)\("
rg "setVolumesForViewports|addVolumesToViewports|useGenericViewport|useCPURendering"
rg "IStackViewport|IVolumeViewport|IBaseVolumeViewport"
```
