---
id: next-viewports-only
title: Next viewports only
summary: 6.0 removes the legacy viewport classes, the compatibility adapters and the legacy viewport API. This page says what is removed, how a next viewport is made and filled, and what comes over
---

# Next viewports only

**State: decided, not in the code yet.** The next viewports and their API are
in the code. The legacy classes, the adapters and the legacy names are still
there too, and they are deleted in a later step.

5.x has two families of viewports. The legacy ones (`StackViewport`,
`VolumeViewport`, `VolumeViewport3D`, and the legacy video, whole slide and ECG
viewports) and the Generic ("next") ones. With `rendering.useGenericViewport`,
5.x also runs the legacy API on the next viewports through compatibility
adapters. The [5.x guide](../5x/2-generic-viewport.md) says that those adapters
are temporary.

6.0 keeps the next viewports and their API, and nothing else.

- For the call that replaces one legacy call, see
  [Every legacy call and what replaces it](./3-api-map.md).
- For the order of the work, see
  [The upgrade, step by step](./4-upgrade-step-by-step.md).

## What is removed

- **The legacy viewport classes:** `Viewport`, `StackViewport`,
  `BaseVolumeViewport`, `VolumeViewport`, `VolumeViewport3D`, and the legacy
  `VideoViewport`, `WSIViewport` and `ECGViewport`.
- **The compatibility adapters** that 5.x creates for a legacy viewport type
  when `rendering.useGenericViewport` is on.
- **`rendering.useGenericViewport`.** There is nothing to switch.
- **The legacy viewport types:** `ViewportType.STACK`,
  `ViewportType.ORTHOGRAPHIC` and `ViewportType.PERSPECTIVE`, with their
  strings `'stack'`, `'orthographic'` and `'perspective'`. This part is in the
  code. `enableElement` and `setViewports` throw an `Error` for each of the
  three strings, before the engine changes anything, and the message names
  the type to use, for example
  `ViewportType 'stack' was removed in Cornerstone3D 6.0: use ViewportType.PLANAR_NEXT (a planar viewport shows a stack or a volume)`.
  A saved layout or hanging protocol that stores one of these strings fails
  at load with that message: store the planar type instead (with an
  orientation in `defaultOptions` for `'orthographic'`), or the 3D type with
  `parallelProjection: false` for `'perspective'`. `viewport.requestedType`
  is gone with them: `viewport.type` is the type of the viewport.
- **The word "next" in the type names.** The five types that remain get plain
  names. See [The viewport types](#the-viewport-types).
- **The legacy viewport API:** `setStack`, `setVolumes`, `addVolumes`,
  `setProperties`, `getProperties`, `getCamera`, `setCamera`, `resetCamera`,
  `getViewPresentation`, `setViewPresentation`, and the actor methods of the
  legacy planar viewports. [The map](./3-api-map.md) gives the replacement of
  each member.
- **Helpers that exist for the legacy API.** They are gone from the core:
  `setVolumesForViewports` and `addVolumesToViewports` (call
  `viewport.setDisplaySets` or `viewport.addDisplaySet` on each viewport),
  `utilities.convertStackToVolumeViewport` and
  `utilities.convertVolumeToStackViewport` (show the display set again, with
  or without a `volumeId`), the guards
  `utilities.viewportSupportsStackCompatibility` and
  `utilities.viewportSupportsVolumeCompatibility` with their types
  `StackCompatibilityViewport` and `VolumeCompatibilityViewport` (ask
  `utilities.getViewportContentMode(viewport)`),
  `utilities.getVolumeViewportScrollInfo`,
  `utilities.getImageSliceDataForVolumeViewport` and
  `utilities.getVolumeSliceRangeInfo` (ask `viewport.getNumberOfSlices()` and
  `viewport.getCurrentImageIdIndex()`), `scrollVolume` of
  `@cornerstonejs/core/utilities/scroll` (call `utilities.scroll`), and
  `utilities.getImageLegacy` (read
  `cache.getImage(viewport.getCurrentImageId())`). The legacy member
  `getVtkDisplayCoords` of a volume viewport is the function
  `utilities.getVtkDisplayCoords(viewport, canvasPoint)`.
- **The legacy types:** `Types.IStackViewport`, `Types.IVolumeViewport` and
  `Types.IBaseVolumeViewport`. The interface of a next viewport is
  `Types.IGenericViewport`. `Types.IViewport` describes a legacy viewport
  today, and it is not decided whether the name stays.
- **The CPU rendering setting:** `rendering.useCPURendering` with
  `setUseCPURendering`, `resetUseCPURendering` and
  `getShouldUseCPURendering`. This part is in the code. The render plan picks
  the CPU path by itself. The detection of a device without WebGL at `init()`
  is internal now: on such a device the rendering engines make no WebGL
  context and `'auto'` draws on the CPU. To force the CPU on the planar
  viewports, set `rendering.planar.renderBackend` to `'cpu'`, or call
  `setRenderBackend('cpu')`. In place of `getShouldUseCPURendering()` read
  `getEffectiveRenderBackend() === 'cpu'`, or `draw` in
  `viewport.getRenderPlan()`. In place of `setUseCPURendering(false)` and
  `resetUseCPURendering()` call `setRenderBackend('auto')`.
  `setUseCPURendering()` also marked the library initialized, so code that
  called it in place of `init()` must call `init()`: `setRenderBackend()`
  does not mark it. `rendering.useLegacyCameraFOV` stays: the 3D viewport
  reads it.

## The viewport types

A stack viewport and an orthographic viewport become the planar type. The
other families keep one type each.
[Viewport types](./3-api-map.md#viewport-types) has the table from each 5.x
type to its 6.0 type.

`VOLUME_3D`, `VIDEO`, `WHOLE_SLIDE` and `ECG` keep their names and now mean the
next viewport of that family. This is in the code: each gives the same
viewport as its `_NEXT` name, and the `viewport.type` of that viewport is the
`_NEXT` type. The rename is the last step of the removal. Until it lands, the
code of these pages uses the `_NEXT` names.

The context pool rendering engine of 5.x spread the stack viewports over its
WebGL contexts (`rendering.webGlContextCount`). In 6.0 every planar and 3D
viewport draws through the first context of the pool: a planar viewport can
show a volume at any time after it is enabled, and the texture of a volume
is shared by every viewport that shows it: drawn from two contexts, it is
uploaded again at every switch between them.

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
  defaultOptions: { orientation: Enums.OrientationAxis.AXIAL },
});

const viewport = renderingEngine.getViewport<PlanarViewport>(viewportId);

viewport.getCurrentMode();
```

`getCurrentMode()` returns `'stack'`, `'volume'` or `'empty'` for a planar
viewport. A 3D viewport says `'volume3d'`, a video viewport `'video'`, a
whole slide viewport `'wholeSlide'` and an ECG viewport `'ecg'`, and each
says `'empty'` with nothing mounted.
`utilities.getViewportContentMode(viewport)` gives the same answer for any
viewport. Use them where the code asked
`viewport instanceof StackViewport` or `viewport.type === ViewportType.STACK`.

Every call of the API answers in both modes. Where the answer differs between
a stack and a volume, [the map](./3-api-map.md) says so in its last column.

Pass the orientation for a volume. A legacy `ORTHOGRAPHIC` viewport without
options opened in `AXIAL`. A planar viewport without an orientation opens a
volume in its acquisition plane. For a stack, leave the orientation out.

## A display set is registered once

A next viewport shows display sets. A display set is registered once, under
an id that the application chooses, and then shown by its id:

```ts
utilities.genericViewportDisplaySetMetadataProvider.add(displaySetId, {
  kind: 'planar',
  imageIds,
  initialImageIdIndex: 0,
  volumeId,
});

await viewport.setDisplaySets({ displaySetId });
```

- **With a `volumeId`** the display set shows as a volume, in every
  orientation.
- **Without a `volumeId`** it shows as a stack, in its acquisition plane. Leave
  `volumeId` out for a stack.

What is registered for each family:

| Viewport      | Registered display set                                                                                     |
| ------------- | ---------------------------------------------------------------------------------------------------------- |
| Planar        | `{ kind: 'planar', imageIds, initialImageIdIndex, volumeId }`                                              |
| 3D            | `{ imageIds, volumeId }`                                                                                   |
| 3D, a surface | Nothing. The `displaySetId` is the id of a geometry of the cache, shown with `renderMode: 'vtkGeometry3d'` |
| Video         | `{ kind: 'video', sourceDataId: imageId }`, or pass the image id as `displaySetId`                         |
| ECG           | `{ kind: 'ecg', sourceDataId: imageId }`, or pass the image id as `displaySetId`                           |
| Whole slide   | `{ kind: 'wsi', imageIds, options: { webClient } }`                                                        |

The first entry of `setDisplaySets` is the source. The others are overlays:

```ts
await viewport.setDisplaySets(
  { displaySetId: ctId, options: { orientation } },
  { displaySetId: ptId }
);

viewport.setDisplaySetPresentation(ptId, {
  colormap: { name: 'hsv', opacity: 0.4 },
});
```

`viewport.addDisplaySet(displaySetId, { role: 'overlay' })` adds one overlay,
and `viewport.removeData(displaySetId)` removes a display set.

The pages under
[Generic Viewport](../../concepts/cornerstone-core/generic-viewport/migration.md)
show these with code before and after.

## Four things on a viewport

A next viewport holds four things. Each legacy call maps to one of them.

| What            | Calls                                                                                   | Replaces                                                 |
| --------------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Display sets    | `setDisplaySets`, `addDisplaySet`, `removeData`, `getDisplaySets`                       | `setStack`, `setVolumes`, `addVolumes`, `setVideo`       |
| A presentation  | `setDisplaySetPresentation`, `getDisplaySetPresentation`, `resetDisplaySetPresentation` | `setProperties`, `getProperties`, `resetProperties`      |
| A view state    | `setViewState`, `updateViewState`, `getViewState`, `resetViewState`                     | `setCamera`, `getCamera`, `resetCamera`, `flip`          |
| View references | `getViewReference`, `setViewReference`, `isReferenceViewable`                           | A camera focal point that was set to move through slices |

Zoom and pan are read and written through `viewportProjection`, in one form
for every family. A question that the state and the data can answer is a
function of `utilities`, not a member of the viewport.

## What comes over and what does not

The new viewports do not rebuild the legacy API. A feature comes over when it
fits the new shape: a key of a presentation or of the view state.

Carried over, in the new shape:

- the sharpening and smoothing of the stack and volume viewports, as the
  `sharpening` and `smoothing` keys of a presentation;
- a preset, a colormap and a blend mode of a 3D viewport, as keys of its
  presentation;
- a perspective camera, on a 3D viewport with `parallelProjection: false`;
- a surface in a 3D viewport, as a display set;
- vtk.js actors and widgets of the application in a slice viewport, as props
  of `viewport.getRenderer()` and through `viewport.addWidget()`, as on a 3D
  viewport;
- a stretched picture, as the scale pair of the view state of a planar
  viewport;
- the frame range of a video, as a key of its view state.

Not carried over:

- default properties (`setDefaultProperties` and its family);
- a `callback` and an `actorUID` on a volume or stack input;
- a preset on a slice viewport;
- a display area and an aspect ratio on a 3D viewport;
- options that change after creation (`setOptions`, `reset`) on the 3D, video,
  whole slide and ECG viewports;
- a stored initial camera (`storeAsInitialCamera`);
- a labelmap over a video, which the legacy video viewport did not have
  either.

[Rendering changes](./2-rendering-changes.md) has the call for each one.
