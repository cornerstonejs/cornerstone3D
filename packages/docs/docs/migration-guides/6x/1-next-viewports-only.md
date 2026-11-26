---
id: next-viewports-only
title: Next viewports only
summary: 6.0 removes the legacy viewport classes, the compatibility adapters and the legacy viewport API. This page says what is removed, how a next viewport is made and filled, and what comes over
---

# Next viewports only

**State: in the code.** The legacy classes, the adapters, the legacy types
and the legacy settings are deleted. The next viewports and their API are
what 6.0 has.

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
  `BaseVolumeViewport`, `VolumeViewport`, the legacy `VolumeViewport3D` (also
  exported as `LegacyVolumeViewport3D` in 5.x), and the legacy
  `VideoViewport`, `WSIViewport` and `ECGViewport`. The names
  `VolumeViewport3D`, `VideoViewport`, `WSIViewport` and `ECGViewport` stay,
  for the next classes: see [The viewport types](#the-viewport-types).
- **The compatibility adapters** that 5.x creates for a legacy viewport type
  when `rendering.useGenericViewport` is on.
- **`rendering.useGenericViewport` and `getUseGenericViewport()`.** There is
  nothing to switch. A configuration that still sets the key is ignored.
- **The legacy viewport types:** `ViewportType.STACK`,
  `ViewportType.ORTHOGRAPHIC` and `ViewportType.PERSPECTIVE`, with their
  strings `'stack'`, `'orthographic'` and `'perspective'`.
  `enableElement` and `setViewports` throw an `Error` for each of the
  three strings, before the engine changes anything, and the message names
  the type to use, for example
  `ViewportType 'stack' was removed in Cornerstone3D 6.0: use ViewportType.PLANAR (a planar viewport shows a stack or a volume)`.
  A saved layout or hanging protocol that stores one of these strings fails
  at load with that message: store the planar type instead (with an
  orientation in `defaultOptions` for `'orthographic'`), or the 3D type with
  `parallelProjection: false` for `'perspective'`. `viewport.requestedType`
  is gone with them: `viewport.type` is the type of the viewport. A
  `resolveClass` given to `registerViewportType` gets `{ type }`, without
  `requestedType`.
- **The word "next" in the type names.** The five types that remain get plain
  names; the 5.x `_NEXT` names and `*Next` strings are gone. See
  [The viewport types](#the-viewport-types).
- **The legacy viewport API:** `setStack`, `setVolumes`, `addVolumes`,
  `setProperties`, `getProperties`, `getCamera`, `setCamera`, `resetCamera`,
  `getViewPresentation`, `setViewPresentation`, and the actor methods of the
  legacy planar viewports. [The map](./3-api-map.md) gives the replacement of
  each member.
- **Helpers that exist for the legacy API.** They are gone from the core:
  `setVolumesForViewports` and `addVolumesToViewports` (call
  `viewport.setDisplaySets` or `viewport.addDisplaySet` on each viewport),
  `utilities.convertStackToVolumeViewport` and
  `utilities.convertVolumeToStackViewport` (show the display set again with
  `mode: 'volume'` or `mode: 'stack'` in the options of the mount), the guards
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
- **The legacy types:** `Types.IStackViewport`, `Types.IVolumeViewport`,
  `Types.IBaseVolumeViewport`, `Types.IVideoViewport`, `Types.IWSIViewport`,
  `Types.IECGViewport` and the `*ViewportProperties` types.
  `Types.IViewport` is the interface of a viewport of any family, and its
  5.x next name `Types.IGenericViewport` is gone: see
  [Classes and TypeScript types](./3-api-map.md#classes-and-typescript-types).
- **Events that 6.0 replaced or removed:** `STACK_NEW_IMAGE` and
  `VOLUME_NEW_IMAGE` (listen to `NEW_IMAGE`), `VIEWPORT_NEW_IMAGE_SET` and
  `VOLUME_VIEWPORT_NEW_VOLUME` (listen to `DISPLAY_SETS_CHANGED`),
  `VOI_MODIFIED` and `COLORMAP_MODIFIED` (listen to
  `DISPLAY_SET_APPEARANCE_CHANGED`), `STACK_SCROLL_OUT_OF_BOUNDS` and
  `VOLUME_VIEWPORT_SCROLL_OUT_OF_BOUNDS` (listen to `SCROLL_OUT_OF_BOUNDS`),
  `PRE_STACK_NEW_IMAGE`, `STACK_VIEWPORT_SCROLL`, `VOLUME_VIEWPORT_SCROLL` and
  `DISPLAY_AREA_MODIFIED` (listen to `CAMERA_MODIFIED`, and to `NEW_IMAGE` for
  the image that shows), and `PRESET_MODIFIED` (read the `preset` key of the
  appearance), with their detail types. [Events](./3-api-map.md#events) has
  the row of each.
- **The CPU rendering setting:** `rendering.useCPURendering` with
  `setUseCPURendering`, `resetUseCPURendering` and
  `getShouldUseCPURendering`. The render plan picks
  the CPU path by itself. The detection of a device without WebGL at `init()`
  is internal now: on such a device the rendering engines make no WebGL
  context and `'auto'` draws on the CPU. A planar viewport then draws itself,
  and its `getUseCustomRenderingPipeline()` gives `true`, as the 5.x stack
  viewport did on such a device. A 3D viewport needs WebGL: its
  `enableElement` throws there. To force the CPU on the planar
  viewports, set `rendering.planar.renderBackend` to `'cpu'`, or call
  `setRenderBackend('cpu')`. In place of `getShouldUseCPURendering()` read
  `getEffectiveRenderBackend() === 'cpu'`, or `draw` in
  `viewport.getRenderPlan()`. In place of `setUseCPURendering(false)` and
  `resetUseCPURendering()` call `setRenderBackend('auto')`.
  `setUseCPURendering(true)` turned off the GPU settings presets
  (`gpuSettingsForRender()` gave `undefined`); `setRenderBackend('cpu')`
  does not, because a 3D viewport and a layer pinned to the GPU still draw
  on the GPU. Only a device without WebGL renders with no preset.
  `setUseCPURendering()` also marked the library initialized, so code that
  called it in place of `init()` must call `init()`: `setRenderBackend()`
  does not mark it. `rendering.useLegacyCameraFOV` stays: the 3D viewport
  reads it.

## The viewport types

A stack viewport and an orthographic viewport become the planar type. The
other families keep one type each.
[Viewport types](./3-api-map.md#viewport-types) has the table from each 5.x
type to its 6.0 type.

The types have plain names, and this is in the code: `PLANAR` (`'planar'`),
`VOLUME_3D` (`'volume3d'`), `VIDEO` (`'video'`), `WHOLE_SLIDE`
(`'wholeSlide'`) and `ECG` (`'ecg'`). `VOLUME_3D`, `VIDEO`, `WHOLE_SLIDE` and
`ECG` keep their 5.x names and strings and now mean the next viewport of
that family. `viewport.type` is the plain string.

The 5.x next names of the types and of the classes are gone in 6.0, with
no alias: [Viewport types](./3-api-map.md#viewport-types) and
[Classes and TypeScript types](./3-api-map.md#classes-and-typescript-types)
name each one and its plain name, and the codemod renames them. A stored 5.x
type string given to `enableElement` or `setViewports` throws a message that
names the plain type. The classes have their plain names: `VolumeViewport3D`,
`VideoViewport`, `WSIViewport` and `ECGViewport`, and their base class is
`BaseViewport`.

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
  type: Enums.ViewportType.PLANAR,
  defaultOptions: { orientation: Enums.OrientationAxis.AXIAL },
});

const viewport = renderingEngine.getViewport<PlanarViewport>(viewportId);

viewport.getCurrentMode();
```

`getCurrentMode()` returns `'stack'`, `'volume'` or `'empty'` for a planar
viewport. A 3D viewport says `'volume3d'`, or `'geometry3d'` when its source
is a surface, a video viewport `'video'`, a whole slide viewport
`'wholeSlide'` and an ECG viewport `'ecg'`, and each says `'empty'` with
nothing mounted.
`utilities.getViewportContentMode(viewport)` gives the same answer for any
viewport. Use them where the code asked
`viewport instanceof StackViewport` or `viewport.type === ViewportType.STACK`.

Every call of the API answers in both modes. Where the answer differs between
a stack and a volume, [the map](./3-api-map.md) says so in its last column.

Ask for a volume with `mode: 'volume'` and pass its orientation. A legacy
`ORTHOGRAPHIC` viewport without options opened in `AXIAL`. A planar viewport
without an orientation opens a volume in its acquisition plane. For a stack,
leave the mode and the orientation out.

## A display set is registered once

A next viewport shows display sets. A display set is registered once, in
`displaySetRegistry`, under an id that the application chooses, and then
shown by its id:

```ts
import { displaySetRegistry } from '@cornerstonejs/core';

displaySetRegistry.add(displaySetId, {
  imageIds,
});

await stackViewport.setDisplaySets({
  displaySetId,
  options: { initialImageIdIndex: 0 },
});
await mprViewport.setDisplaySets({
  displaySetId,
  options: { mode: 'volume', orientation: Enums.OrientationAxis.SAGITTAL },
});
```

- **With `mode: 'volume'` on the mount** a planar viewport shows the display
  set as a volume, in every orientation.
- **Without a mode** it shows as a stack in its acquisition plane, and as a
  volume in another orientation or for a slab of the mount when its images
  form one. A `volumeId` names the volume and does not choose; see
  [A volume id names a volume, the mount chooses the mode](#a-volume-id-names-a-volume-the-mount-chooses-the-mode).

The registered object is a `DisplaySetDescriptor`. It has no `kind`: the
viewport family that mounts the display set and the fields of the descriptor
decide how its data is loaded. What each family reads:

| Viewport      | Registered descriptor                                                                                                              |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Planar        | `{ imageIds }`, with a `volumeId` to name the volume; `{ volumeId }` for a volume of the cache                                     |
| 3D            | `{ imageIds }`, with a `volumeId` to name the volume; `{ volumeId }` for a volume of the cache                                     |
| 3D, a surface | `{ geometryId }`, or nothing: the `displaySetId` is then the id of a geometry of the cache, shown as a surface                     |
| Video         | `{ imageId }`, or pass the image id as `displaySetId`                                                                              |
| ECG           | `{ imageId }`, or pass the image id as `displaySetId`                                                                              |
| Whole slide   | `{ imageIds, options: { webClient } }`, or `{ imageIds, webClient }`, or `{ imageIds }` with a `WADO_WEB_CLIENT` metadata provider |

- **One registration serves a planar and a 3D viewport.** A volume that both
  show is registered once, with its `imageIds`: a planar viewport in volume
  mode and a 3D viewport make the same volume id from them
  (`utilities.getDefaultVolumeId(imageIds)`), so they share one volume of the
  cache. A `volumeId` in the registration names the volume instead.
- **A descriptor that a family cannot read fails the mount** with a message
  that names what the family needs, such as
  `[VideoViewport] The display set "ct" has no imageId, which a VideoViewport needs to show it`.
  An id that nothing is registered under fails a planar, 3D volume or whole
  slide mount with
  `[PlanarViewport] No display set is registered under "ct": register it with displaySetRegistry.add(displaySetId, descriptor)`.
- **The id of a surface** is the key that was given to
  `geometryLoader.loadAndCacheGeometry`, not `geometry.id`. For a mesh loaded
  from a URL `geometry.id` is the URL without its scheme, and
  `addDisplaySet(geometry.id, ...)` throws.
- **Data that is not known at the start**, such as a file that the user
  drops or a series picked from a list, is registered when it is loaded,
  under a new id for each load. `add` under an id that is registered
  replaces the entry. `displaySetRegistry.get(displaySetId)`,
  `has(displaySetId)`, `remove(displaySetId)` and `clear()` read and drop
  entries.

The first entry of `setDisplaySets` is the source. The others are overlays:

```ts
await viewport.setDisplaySets(
  { displaySetId: ctId, options: { mode: 'volume', orientation } },
  { displaySetId: ptId, options: { mode: 'volume' } }
);

viewport.setDisplaySetAppearance(ptId, {
  colormap: { name: 'hsv' },
  opacity: 0.4,
});
```

`viewport.addDisplaySet(displaySetId, { role: 'overlay' })` adds one overlay,
and `viewport.removeDisplaySet(displaySetId)` removes a display set. Each of
these calls fires `DISPLAY_SETS_CHANGED` once when it commits, see
[Events and image loading of a planar viewport](./2-rendering-changes.md#events-and-image-loading-of-a-planar-viewport).

The pages under
[Viewport Architecture](../../concepts/cornerstone-core/generic-viewport/migration.md)
show these with code before and after.

The code of 6.0.0-beta.2 in the "Before" blocks of the sections below has the
names of 6.0, as the codemod leaves it: each section is about what still
differs after the renames. The renames are in
[The names of 6.0.0-beta.2](#the-names-of-600-beta2).

### What one viewport wants is said on its mount

What is true of the data is registered once, in `displaySetRegistry`: its
image ids, its volume id. What one viewport wants of it is said on the mount:
`mode`, `role`, `orientation`, `renderBackend`, `sliceFirst`, `volumeId`,
`initialImageIdIndex`, `initialViewReference` and `appearance`
(`PlanarMountOptions`;
`Volume3DMountOptions` takes `role`, `volumeId` and `appearance`). So one
display set shows as a stack in one pane and as a volume in another under one
id, each at its own image, and a view reference made in one pane is viewable
in the other and goes to the same image.

A slab pane that opens on slice 40 with its own window. Before, in
6.0.0-beta.2:

```ts
displaySetRegistry.add('ct', { imageIds, volumeId, initialImageIdIndex: 40 });

await viewport.setDisplaySets({ displaySetId: 'ct' });
viewport.setDisplaySetAppearance('ct', {
  voiRange: { lower: -160, upper: 240 },
  slabThickness: 20,
});
```

After:

```ts
displaySetRegistry.add('ct', { imageIds, volumeId });

await viewport.setDisplaySets({
  displaySetId: 'ct',
  options: {
    mode: 'volume',
    initialImageIdIndex: 40,
    appearance: { voiRange: { lower: -160, upper: 240 }, slabThickness: 20 },
  },
});
```

One series as a stack in one pane and as a volume in another. Before, in
6.0.0-beta.2, the `volumeId` of the registration chose the volume, so the two
panes needed two registrations of the same images under two ids, and each
viewport opened on the index of its registration:

```ts
displaySetRegistry.add('ct-stack', { imageIds, initialImageIdIndex: 40 });
displaySetRegistry.add('ct-volume', { imageIds, volumeId });

await stackViewport.setDisplaySets({ displaySetId: 'ct-stack' });
await mprViewport.setDisplaySets({
  displaySetId: 'ct-volume',
  options: { orientation: Enums.OrientationAxis.SAGITTAL },
});
```

After, one registration and one id; each mount says what its viewport shows:

```ts
displaySetRegistry.add('ct', { imageIds });

await stackViewport.setDisplaySets({
  displaySetId: 'ct',
  options: { initialImageIdIndex: 40 },
});
await mprViewport.setDisplaySets({
  displaySetId: 'ct',
  options: { mode: 'volume', orientation: Enums.OrientationAxis.SAGITTAL },
});
```

The two viewports take the view references of each other by image and by
plane, see
[Events and image loading of a planar viewport](./2-rendering-changes.md#events-and-image-loading-of-a-planar-viewport).

- **`initialImageIdIndex` is a mount option.** It indexes the registered
  image ids: the image of a stack, the slice of a volume in its acquisition
  plane. A planar mount of a descriptor that still has it fails with
  `[PlanarViewport] The display set "ct" is registered with initialImageIdIndex, which is a mount option: remove it from the descriptor and pass it on the mount, setDisplaySets({ displaySetId, options: { initialImageIdIndex } })`.
  It fails, and does not warn, because a descriptor is shared by every
  viewport: an index left in it would open each viewport on another image
  than the one the application asked for, and nothing else would show it.
- **`appearance` is the appearance from the first draw.** It merges over the
  overrides set before the mount (a `colormap` one level deep, as
  `setDisplaySetAppearance` merges it). The mount draws once with it and
  fires `DISPLAY_SET_APPEARANCE_CHANGED` once, with cause `'mount'` and the
  overrides of the mount. With `setDisplaySetAppearance` after the mount the
  viewport drew twice, fired a second event with cause `'edit'`, and a slab
  remounted the render path. A slab in `appearance` chooses the render path
  of the first draw, and a mount without `mode` shows a volume for it. A 3D,
  a video, an ECG and a whole slide viewport take `appearance` on their
  mounts too, each with the keys of its own appearance (a video its
  `playbackRate`, `loop`, `muted`, `objectFit`; an ECG its `lineWidth`,
  `showGrid`; a slide its `voiRange` and `averageWhite`).
- **A mount reads the registration once.** The image ids, the volume id, the
  mode and whether the display set is the labelmap of a segmentation are read
  at the mount and kept with it. A display set that is registered again or
  removed after the mount does not change a viewport that shows it, also
  through a switch of the render backend, a slab and an orientation check,
  until the viewport mounts it again. The next mount reads the registration
  as it is then.
- **`getDisplaySets()` gives the options of each mount**, not only the role,
  on every viewport family: for each mounted display set, in mount order, its
  id, its role and the options that it is mounted with, resolved, so that
  `other.setDisplaySets(...viewport.getDisplaySets())` on a viewport of the
  same family shows the same layers of the same data, with
  `getDisplaySetAppearance(displaySetId)` for the look. `appearance` is not
  among the options: the mount applied it once.
  - Planar (`PlanarMountOptions`): the options that the mount was given, with
    the role that the display set has now, the mode that the mount chose
    (`'stack'` or `'volume'`, never `'auto'`) and, in volume mode, the id of
    the volume that it shows. The loupe of the magnify tools mounts its source
    so.
  - 3D (`Volume3DMountOptions`): the role and, for a volume, the `volumeId`
    of the volume that it shows (the volume of the mount option, else of the
    registration, else the default id of its images). A copy loads no volume
    a second time. A surface has no `volumeId`.
  - Video (`VideoMountOptions`): the role and the `frameNumber` that the
    mount was given. The images drawn over a video (`addImages`) are not
    display sets: `getActors()` lists them.
  - ECG (`ECGMountOptions`): the role and the `multiplexGroupIndex` that the
    waveform shows, the default group of the instance when the mount named
    none.
  - Whole slide (`WSIMountOptions`): the role.

  The mounts of the video, ECG and whole slide viewports take `role` now, as
  the planar and 3D mounts do: without it the first entry is the source and
  the others overlays, as before.

  ```ts
  const layers = viewport.getDisplaySets().map(({ displaySetId, options }) => ({
    displaySetId,
    options: {
      ...options,
      appearance: viewport.getDisplaySetAppearance(displaySetId),
    },
  }));

  await capture.setDisplaySets(...layers);
  ```

- **A `setDisplaySets` that mounts the source again keeps the labelmaps of a
  segmentation only when the source and its mode stay the same.** The same
  display set mounted in the other mode drops them, as another source does.
- **A mount that has no data names it.** An id that nothing is registered
  under fails with
  `[PlanarViewport] No display set is registered under "ct": register it with displaySetRegistry.add(displaySetId, descriptor)`,
  and a display set registered with a `volumeId` and no image ids whose
  volume is not in the cache with
  `[PlanarViewport] The display set "pmap" names the volume "<volumeId>" and no imageIds, and the cache does not hold that volume: create the volume before the mount, or register the imageIds`.
- `npx codemod @cornerstonejs/cornerstone3d-6-api-names` moves
  `initialImageIdIndex` from a registered literal to the options of every
  planar mount of the display set in the same file, and reports the
  registration as manual when it cannot:
  `initialImageIdIndex is a mount option in 6.0, and a planar viewport refuses a descriptor that has it: remove it from the descriptor and pass it on each planar mount, setDisplaySets({ displaySetId, options: { initialImageIdIndex } }) or addDisplaySet(displaySetId, { initialImageIdIndex })`.
  The step from 5.x writes `setStack(imageIds, index)` as a registration of
  the image ids and a mount with `initialImageIdIndex`.

### A volume id names a volume, the mount chooses the mode

In 6.0.0-beta.2 a display set registered with a `volumeId` showed as a volume
on every planar viewport, and one without it as a stack. In 6.0 the
`volumeId` names the volume and does nothing more: the mount says whether a
planar viewport shows a stack or a volume.

Before:

```ts
displaySetRegistry.add('ct', { imageIds, volumeId });

await axialViewport.setDisplaySets({
  displaySetId: 'ct',
  options: { orientation: Enums.OrientationAxis.AXIAL },
});
```

After:

```ts
displaySetRegistry.add('ct', { imageIds, volumeId });

await axialViewport.setDisplaySets({
  displaySetId: 'ct',
  options: { orientation: Enums.OrientationAxis.AXIAL, mode: 'volume' },
});
```

- **Code that is not changed shows a stack where it showed a volume.** An
  axial view of an axial series, the pane of an MPR in the plane of the
  images and a fusion in that plane show the images as a stack:
  `getCurrentMode()` says `'stack'`, a scroll steps through the images, and
  a slab or an MIP that is set after the mount is not drawn. Nothing fails or
  warns. A view in another orientation than the acquisition plane still
  shows a volume when the images form one, and so does a mount whose
  `appearance` asks for a slab, and a display set whose volume is a dynamic
  (4D) volume of the cache.
- **The mode of the mount.** `mode: 'stack'` shows the images in their
  acquisition plane, and the mount fails for another orientation and for a
  display set with no image ids. `mode: 'volume'` shows slices of the volume
  in every orientation, and the mount fails when the images form no volume.
  `mode: 'auto'`, the default, shows a volume when the images form one and
  the mount asks for another orientation than the acquisition plane or for a
  slab (`appearance: { slabThickness }`), or the volume of the display set is
  a dynamic (4D) volume of the cache, and for a display set with a `volumeId`
  and no image ids; else a stack. A 3D viewport has no mode.
- **Two volumes of one display set.** The mount options take a `volumeId`
  too. It wins over the one of the registration, so two panes can show a
  reduced and the full volume of one display set:

  ```ts
  await fullViewport.setDisplaySets({
    displaySetId: 'ct',
    options: { mode: 'volume' },
  });
  await reducedViewport.setDisplaySets({
    displaySetId: 'ct',
    options: { mode: 'volume', volumeId: reducedVolumeId },
  });
  ```

  The order is: the `volumeId` of the mount, then of the registration, then
  `utilities.getDefaultVolumeId(imageIds)`. A stack ignores the `volumeId`
  of the mount. A 3D viewport takes it the same way
  (`volumeViewport3D.setDisplaySets({ displaySetId, options: { volumeId } })`).

- **One default id.** Without a `volumeId` a planar viewport in volume mode, a
  3D viewport and the segmentation tools take
  `utilities.getDefaultVolumeId(imageIds)`, so they find one volume in the
  cache. A 3D viewport made `cornerstoneStreamingImageVolume:<displaySetId>`
  in 6.0.0-beta.2: give that id as the `volumeId` where the application reads
  the volume by it.
- **A volume with no image ids.** `displaySetRegistry.add(displaySetId, { volumeId })`
  mounts a volume of the cache, such as a parametric map or a labelmap
  volume, on a planar viewport (as a volume) and on a 3D viewport. The
  volume must be in the cache at the mount.
- **Other volume loaders and other schemes keep working.** Give the id of a
  dynamic volume (`cornerstoneStreamingDynamicImageVolume:...`), of a NIfTI
  volume or of a scheme of the application, such as
  `${volumeLoaderSchema}:${displaySetInstanceUID}`, at registration or on
  the mount, with `mode: 'volume'` on a planar mount.
- `npx codemod @cornerstonejs/cornerstone3d-6-api-names` writes
  `mode: 'volume'` on each planar mount of a display set registered on the
  beta registry (`utilities.genericViewportDisplaySetMetadataProvider`) with
  a `volumeId` and image ids in the same file, and reports the registration
  when the file shows no such mount. It reads a registration on
  `displaySetRegistry` as 6.0 code and leaves its mounts as they are, so run
  it before renaming the registry by hand. The report: `a volumeId no longer makes a planar viewport show a volume: the viewport shows this display set as a stack in its acquisition plane unless its mount asks for mode: 'volume' (setDisplaySets({ displaySetId, options: { mode: 'volume' } }) or addDisplaySet(displaySetId, { mode: 'volume' })); a 3D viewport shows it as before`.

### One store for display sets

`displaySetRegistry` keeps the display sets in the `DISPLAY_SET` module of
the metadata cache of `@cornerstonejs/metadata`. `@cornerstonejs/core`
exports the same object, so an application that has no other use for core,
such as the display set service of a viewer, adds its display sets from
`@cornerstonejs/metadata`. The metadata cache and the viewports then read the
same object: `stored` below is `displaySet`.

```ts
import { displaySetRegistry, Enums, metaData } from '@cornerstonejs/metadata';

displaySetRegistry.add(displaySet.displaySetInstanceUID, displaySet);

const stored = metaData.getTyped(
  Enums.MetadataModules.DISPLAY_SET,
  displaySet.displaySetInstanceUID
);

await viewport.setDisplaySets({
  displaySetId: displaySet.displaySetInstanceUID,
});
```

- **The registry keeps the object itself.** It does not copy it and does not
  change it: an OHIF display set keeps its `displaySetInstanceUID` and gets no
  `displaySetId`. A change that the application makes to the object is seen
  by the next mount. A second `add` under the id replaces the object.
- **`displaySetId` of a descriptor must be its id.**
  `displaySetRegistry.add('a', { displaySetId: 'b' })` throws.
- **Only an added id is a display set id.** A value that the application
  writes into the `DISPLAY_SET` module with `utilities.setCacheData` or
  `metaData.addTyped` is not a registration, and a viewport does not mount
  it.
- **`registerDisplaySetMetadata(imageIds, displaySet)`** registers an
  `IDisplaySet` under its `displaySetId`, and stores it under its image ids
  too, so that `metaData.get(MetadataModules.DISPLAY_SET, imageId)` finds it.
  `displaySetRegistry.get(imageId)` and `has(imageId)` give nothing for such
  an image id, and `setDisplaySets({ displaySetId: imageId })` fails.
  `displaySetRegistry.remove(displaySetId)` and `clear()` remove these image
  id entries with the display set.
- **A video or an ECG viewport shows** the `imageId` of the descriptor, else
  the `imageId` of its `instance` (an OHIF display set), else the first of
  its `underlyingImageIds` (an `IDisplaySet`).
- **`cache.purgeCache()` keeps the registrations.** It removes the images
  and the volumes; a mount after it loads them again.
- **`utilities.clearCacheData()` of `@cornerstonejs/metadata` removes every
  registration**, as it clears the whole metadata cache. The DICOM image
  loader's `init` calls it: register display sets after that `init`.

Before, in 6.0.0-beta.2, a viewer kept its display set in the metadata cache
and registered it a second time for the viewport, under the same id or
under an id of its own:

```ts
import { utilities as metadataUtilities, Enums } from '@cornerstonejs/metadata';
import { utilities } from '@cornerstonejs/core';

metadataUtilities.setCacheData(
  Enums.MetadataModules.DISPLAY_SET,
  displaySet.displaySetInstanceUID,
  displaySet
);

utilities.genericViewportDisplaySetMetadataProvider.add(
  displaySet.displaySetInstanceUID,
  { kind: 'planar', imageIds: displaySet.imageIds }
);
```

After, it registers the display set once:

```ts
import { displaySetRegistry } from '@cornerstonejs/metadata';

displaySetRegistry.add(displaySet.displaySetInstanceUID, displaySet);
```

A second `add` under the id would now replace the display set itself with
the descriptor, for the viewer and for the viewports.

### The names of 6.0.0-beta.2

In 6.0.0-beta.2 the registry was `utilities.genericViewportDisplaySetMetadataProvider`,
a metadata provider, and a descriptor named its family with `kind`. Before:

```ts
import { utilities } from '@cornerstonejs/core';

const provider = utilities.genericViewportDisplaySetMetadataProvider;

provider.add('ct', { kind: 'planar', imageIds, volumeId });
provider.add('video', { kind: 'video', sourceDataId: videoImageId });

const ct = provider.get(provider.VIEWPORT_V2_DISPLAY_SET, 'ct');
const shown = viewport.getViewReference().dataId;

viewport.removeData('video');
```

After:

```ts
import { displaySetRegistry } from '@cornerstonejs/core';

displaySetRegistry.add('ct', { imageIds, volumeId });
displaySetRegistry.add('video', { imageId: videoImageId });

const ct = displaySetRegistry.get('ct');
const shown = viewport.getViewReference().displaySetId;

viewport.removeDisplaySet('video');
```

- **The registry is not a metadata provider.**
  `metaData.get('genericViewportDisplaySet', displaySetId)` gives undefined;
  call `displaySetRegistry.get(displaySetId)`.
- **A descriptor is an object.** `add(displaySetId, imageId)` becomes
  `add(displaySetId, { imageId })`, and `add(displaySetId, imageIds)` becomes
  `add(displaySetId, { imageIds })`.
- **The id of a display set is `displaySetId` everywhere**: in a view
  reference, a render plan layer, the detail of `RENDER_PLAN_CHANGED` and of
  `RENDER_PATH_ERROR`, the `rendering` of the whole slide viewport's
  `IMAGE_RENDERED`, a stack input of `addImages`, and a projection request
  and snapshot. `viewport.getSourceDataId()` is
  `viewport.getSourceDisplaySetId()`.
- **A stored view reference is not read under its old key.** A view
  reference that 6.0.0-beta.2 wrote into an annotation (its `metadata`) or
  into a state that the application saved carries `dataId`; 6.0 reads
  `displaySetId` only. Rename the key when the application loads such data.
- `npx codemod @cornerstonejs/cornerstone3d-6-api-names` makes these changes
  and reports each site it cannot see, such as a descriptor that is not a
  literal or a `dataId` of an object that the file does not show to be
  Cornerstone's.

## Four things on a viewport

A next viewport holds four things. Each legacy call maps to one of them.

| What            | Calls                                                                                                                 | Replaces                                                 |
| --------------- | --------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Display sets    | `setDisplaySets`, `addDisplaySet`, `removeDisplaySet`, `getDisplaySets`                                               | `setStack`, `setVolumes`, `addVolumes`, `setVideo`       |
| An appearance   | `setDisplaySetAppearance`, `getDisplaySetAppearance`, `getEffectiveDisplaySetAppearance`, `resetDisplaySetAppearance` | `setProperties`, `getProperties`, `resetProperties`      |
| A view state    | `setViewState`, `updateViewState`, `getViewState`, `resetViewState`                                                   | `setCamera`, `getCamera`, `resetCamera`, `flip`          |
| View references | `getViewReference`, `setViewReference`, `isReferenceViewable`                                                         | A camera focal point that was set to move through slices |

Zoom and pan are read and written as the framing of the view, in one form
for every family. A question about the data on display is a member of a
planar and a 3D viewport where the viewport answers it from what it mounted
(`getVolumeIds`, `getScalarRange`, `getDisplaySetIdForVolumeId`,
`isInAcquisitionPlane`, see
[Viewport queries](./2-rendering-changes.md#viewport-queries)), and a function
of `utilities` that takes the viewport otherwise, such as
`utilities.getCurrentVolumeViewportSlice(viewport)`.

### View state, framing and appearance

Three words name what a viewport keeps of a view. The **view state**
(`getViewState`, `setViewState`) is the navigation and the layout in the terms
of the family: the slice, the orientation, the anchors, the scale, the rotation
and the flips. The **framing** (`getViewFraming`, `setViewFraming`, and
`viewportProjection.getFraming` and `withFraming`) is the camera part of the
view that another viewport of any size can take: pan, zoom, rotation, flips and
display area, against the fit, and on a planar viewport the scale mode and the
scale of the fit (`scaleMode`, `fitScale`); setting it writes the view state.
The **appearance** (`setDisplaySetAppearance`, `resetDisplaySetAppearance`) is
the look of one display set in one viewport: the window, the colormap, the
opacity, the slab, the interpolation, the visibility.
`getDisplaySetAppearance` gives what a caller set, and
`getEffectiveDisplaySetAppearance` what is drawn, the defaults of the data
included. 6.0.0-beta.2 called the framing the view presentation and the
appearance the presentation of a display set; see
[Framing names](./3-api-map.md#framing-names) and
[Appearance names](./3-api-map.md#appearance-names).

## What comes over and what does not

The new viewports do not rebuild the legacy API. A feature comes over when it
fits the new shape: a key of an appearance or of the view state.

Carried over, in the new shape:

- the sharpening and smoothing of the stack and volume viewports, as the
  `sharpening` and `smoothing` keys of an appearance;
- a preset, a colormap and a blend mode of a 3D viewport, as keys of its
  appearance;
- a perspective camera, on a 3D viewport with `parallelProjection: false`;
- a surface in a 3D viewport, as a display set;
- vtk.js actors and widgets of the application in a slice viewport, as props
  of `viewport.getRenderer()` and through `viewport.addWidget()`, as on a 3D
  viewport;
- a stretched picture, as the scale pair of the view state of a planar
  viewport;
- the frame range of a video, as a key of its view state;
- the images over a video (`addImages`), which now draw a labelmap over the
  video, frame by frame: no 5.x release showed one.

Not carried over:

- default properties (`setDefaultProperties` and its family);
- a `callback` and an `actorUID` on a volume or stack input;
- a preset on a slice viewport;
- a display area and an aspect ratio on a 3D viewport;
- options that change after creation (`options`, `setOptions`, `reset`) on
  every viewport;
- a stored initial camera: `storeAsInitialCamera` of a display area only
  names the display area that `resetViewState()` shows.

[Rendering changes](./2-rendering-changes.md) has the call for each one.
