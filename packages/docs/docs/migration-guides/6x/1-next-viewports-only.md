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
- **The legacy types:** `Types.IStackViewport`, `Types.IVolumeViewport`,
  `Types.IBaseVolumeViewport`, `Types.IVideoViewport`, `Types.IWSIViewport`,
  `Types.IECGViewport` and the `*ViewportProperties` types.
  `Types.IViewport` is the interface of a viewport of any family, under
  its 5.x next name too: see
  [Classes and TypeScript types](./3-api-map.md#classes-and-typescript-types).
- **Events that no viewport fires:** `STACK_NEW_IMAGE` and `VOLUME_NEW_IMAGE`
  (listen to `NEW_IMAGE`), `PRE_STACK_NEW_IMAGE` and `STACK_VIEWPORT_SCROLL`
  (listen to `CAMERA_MODIFIED`), and `PRESET_MODIFIED` (read the `preset` key
  of the appearance), with their detail types.
  [Events](./3-api-map.md#events) has the row of each.
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

A next viewport shows display sets. A display set is registered once, in
`displaySetRegistry`, under an id that the application chooses, and then
shown by its id:

```ts
import { displaySetRegistry } from '@cornerstonejs/core';

displaySetRegistry.add(displaySetId, {
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

The registered object is a `DisplaySetDescriptor`. It has no `kind`: the
viewport family that mounts the display set and the fields of the descriptor
decide how its data is loaded. What each family reads:

| Viewport      | Registered descriptor                                                                                                              |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Planar        | `{ imageIds, initialImageIdIndex, volumeId }`                                                                                      |
| 3D            | `{ imageIds, volumeId }`                                                                                                           |
| 3D, a surface | `{ geometryId }`, or nothing: the `displaySetId` is then the id of a geometry of the cache, shown as a surface                     |
| Video         | `{ imageId }`, or pass the image id as `displaySetId`                                                                              |
| ECG           | `{ imageId }`, or pass the image id as `displaySetId`                                                                              |
| Whole slide   | `{ imageIds, options: { webClient } }`, or `{ imageIds, webClient }`, or `{ imageIds }` with a `WADO_WEB_CLIENT` metadata provider |

- **One registration serves a planar and a 3D viewport.** A volume that both
  show is registered once, with `imageIds` and `volumeId`.
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

### From 6.0.0-beta.2

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

The first entry of `setDisplaySets` is the source. The others are overlays:

```ts
await viewport.setDisplaySets(
  { displaySetId: ctId, options: { orientation } },
  { displaySetId: ptId }
);

viewport.setDisplaySetAppearance(ptId, {
  colormap: { name: 'hsv', opacity: 0.4 },
});
```

`viewport.addDisplaySet(displaySetId, { role: 'overlay' })` adds one overlay,
and `viewport.removeDisplaySet(displaySetId)` removes a display set.

The pages under
[Generic Viewport](../../concepts/cornerstone-core/generic-viewport/migration.md)
show these with code before and after.

## Four things on a viewport

A next viewport holds four things. Each legacy call maps to one of them.

| What            | Calls                                                                             | Replaces                                                 |
| --------------- | --------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Display sets    | `setDisplaySets`, `addDisplaySet`, `removeDisplaySet`, `getDisplaySets`           | `setStack`, `setVolumes`, `addVolumes`, `setVideo`       |
| An appearance   | `setDisplaySetAppearance`, `getDisplaySetAppearance`, `resetDisplaySetAppearance` | `setProperties`, `getProperties`, `resetProperties`      |
| A view state    | `setViewState`, `updateViewState`, `getViewState`, `resetViewState`               | `setCamera`, `getCamera`, `resetCamera`, `flip`          |
| View references | `getViewReference`, `setViewReference`, `isReferenceViewable`                     | A camera focal point that was set to move through slices |

Zoom and pan are read and written as the framing of the view, in one form
for every family. A question that the state and the data can answer is a
function of `utilities`, not a member of the viewport.

### View state, framing and appearance

Three words name what a viewport keeps of a view. The **view state**
(`getViewState`, `setViewState`) is the navigation and the layout in the terms
of the family: the slice, the orientation, the anchors, the scale, the rotation
and the flips. The **framing** (`getViewFraming`, `setViewFraming`, and
`viewportProjection.getFraming` and `withFraming`) is the camera part of the
view that another viewport of any size can take: pan, zoom, rotation, flips and
display area, against the fit; setting it writes the view state. The
**appearance** (`setDisplaySetAppearance`, `getDisplaySetAppearance`,
`resetDisplaySetAppearance`) is the look of one display set in one viewport:
the window, the colormap, the opacity, the slab, the interpolation, the
visibility. 6.0.0-beta.2 called the last two the view presentation and the
presentation of a display set; see
[Appearance and framing of 6.0.0-beta.2](./3-api-map.md#appearance-and-framing-of-600-beta2).

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
