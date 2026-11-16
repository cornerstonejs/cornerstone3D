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
| `ViewportType.PLANAR_NEXT`      | `ViewportType.PLANAR`      |
| `ViewportType.VOLUME_3D_NEXT`   | `ViewportType.VOLUME_3D`   |
| `ViewportType.VIDEO_NEXT`       | `ViewportType.VIDEO`       |
| `ViewportType.WHOLE_SLIDE_NEXT` | `ViewportType.WHOLE_SLIDE` |
| `ViewportType.ECG_NEXT`         | `ViewportType.ECG`         |

`VOLUME_3D`, `VIDEO`, `WHOLE_SLIDE` and `ECG` keep their names and now mean the
next viewport of that family. The rename is the last step of the removal.
Until it lands, the code on this page uses the `_NEXT` names.

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

| Legacy                                                             | Next                                                                                                                                       |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `ViewportType.STACK`, `ViewportType.ORTHOGRAPHIC`                  | `ViewportType.PLANAR_NEXT`                                                                                                                 |
| `ViewportType.VOLUME_3D`, `VIDEO`, `WHOLE_SLIDE`, `ECG`            | `VOLUME_3D_NEXT`, `VIDEO_NEXT`, `WHOLE_SLIDE_NEXT`, `ECG_NEXT`                                                                             |
| `viewport.setStack(imageIds, index)`                               | Register a display set with `imageIds` and `initialImageIdIndex`, then `viewport.setDisplaySets({ displaySetId })`                         |
| `viewport.setVolumes([{ volumeId }])`, `setVolumesForViewports`    | Register a display set with `imageIds` and `volumeId`, then `viewport.setDisplaySets({ displaySetId, options: { orientation } })`          |
| `viewport.addVolumes(...)`, a fusion                               | Several entries in `setDisplaySets(...)`, or `viewport.addDisplaySet(displaySetId, options)`                                               |
| `viewport.setVideo(...)`, `setEcg(...)`, `setWSI(...)`             | Register a display set of kind `'video'`, `'ecg'` or `'wsi'`, then `viewport.setDisplaySets({ displaySetId })`                             |
| `viewport.setProperties({ voiRange, colormap, invert })`           | `viewport.setDisplaySetPresentation(displaySetId, { voiRange, colormap, invert })`                                                         |
| `viewport.getProperties()`                                         | `viewport.getDisplaySetPresentation(displaySetId)`                                                                                         |
| A `callback` on a volume input that edits the actor                | `setDisplaySetPresentation` with `voiRange`, `colormap` and `opacity`                                                                      |
| `viewport.setBlendMode(...)`, `viewport.setSlabThickness(...)`     | `setDisplaySetPresentation(displaySetId, { blendMode, slabThickness })`                                                                    |
| `viewport.getCamera()`                                             | `viewport.getViewState()` for the state, `viewport.getResolvedView()?.toICamera()` for a camera in the old shape                           |
| `viewport.setCamera({ ... })`                                      | `viewport.setViewState({ ... })` or `viewport.updateViewState(...)`. For a place in space: `viewport.setViewReference(...)`                |
| `viewport.resetCamera()`                                           | `viewport.resetViewState()`                                                                                                                |
| `viewport.getViewPresentation()`, `viewport.setViewPresentation()` | `viewportProjection.getPresentation(viewport, { selector })`, and `viewportProjection.withPresentation(viewport, ...)` with `setViewState` |
| `viewport.flip(...)`, a rotation set through the camera            | `viewport.setViewState({ rotation, flipHorizontal, flipVertical })`                                                                        |
| `rendering.useCPURendering`, `setUseCPURendering(true)`            | Nothing to set. The router picks the path for each layer. `viewport.getRenderPlan()` tells which one and why                               |
| `Types.IStackViewport`, `Types.IVolumeViewport`                    | `PlanarViewport`, or `Types.IGenericViewport` where any next viewport will do                                                              |
| `viewport instanceof StackViewport`, `viewport.type === STACK`     | `viewport.getCurrentMode() === 'stack'`, or `utilities.getViewportContentMode(viewport)`                                                   |

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

## No feature is lost

Everything a legacy viewport can do comes to the next viewports before the
legacy viewports are removed. These exist only on the legacy viewports in 5.x
and are being added to the next ones:

- the sharpening and smoothing of the stack and volume viewports;
- a perspective camera for a volume viewport (`ViewportType.PERSPECTIVE`);
- vtk.js actors and widgets of the application in a planar viewport
  (`addActor`, `setActors`, `getRenderer`, `addWidget`);
- `setAspectRatio`;
- a labelmap over a video.

This page gets the next call for each one when it lands.

## Find the code to change

```sh
rg "ViewportType\.(STACK|ORTHOGRAPHIC|PERSPECTIVE)"
rg "\.(setStack|setVolumes|addVolumes|setProperties|getProperties)\("
rg "\.(getCamera|setCamera|resetCamera|getViewPresentation|setViewPresentation)\("
rg "setVolumesForViewports|addVolumesToViewports|useGenericViewport|useCPURendering"
rg "IStackViewport|IVolumeViewport|IBaseVolumeViewport"
```
