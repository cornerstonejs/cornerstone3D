---
id: upgrade-step-by-step
title: The upgrade, step by step
summary: The ordered steps from Cornerstone3D 5.x to 6.0 - what to search for, what to change, how to check each step and what can go wrong, then the changes that need a decision by a person and the rules for a coding agent
---

# The upgrade, step by step

Follow this page from top to bottom on one application. Each step finds one
kind of legacy code, changes it and ends with a check.

- The call that replaces one legacy name is in
  [Every legacy call and what replaces it](./3-api-map.md). This page gives
  the order and the checks, and each step links to its table.
- What looks or answers differently is in
  [Rendering changes](./2-rendering-changes.md).
- A coding agent reads [For a coding agent](#for-a-coding-agent) first.

**State.** The steps use calls that are in the code. A line marked
**Decided, not in the code yet** names what 6.0 will have, and says what to do
today. The viewport types have their `_NEXT` names until the rename lands, see
[Viewport types](./3-api-map.md#viewport-types).

## Before you start

### Versions

- Go to the latest 5.x first, and finish the
  [5.x migration guides](../5x/index.md). This page starts from there.
- All `@cornerstonejs` packages carry one version number. Upgrade them
  together.

### What to read

1. [Next viewports only](./1-next-viewports-only.md): the model of a next
   viewport.
2. [Changes that need a decision by a person](#changes-that-need-a-decision-by-a-person)
   on this page.
3. Keep [the map](./3-api-map.md) open while you work. Search it for the name
   that your code uses.

### What works on 5.x and what needs 6.0

Most of the work can be done on 5.x, before the version changes. 5.x has both
families of viewports, and one rendering engine can hold legacy viewports and
next viewports side by side.

| What                                                                                                                                               | On 5.x                 | On 6.0  |
| -------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- | ------- |
| The legacy viewport types and the legacy API                                                                                                       | Work                   | Removed |
| `rendering.useGenericViewport: true`: the legacy API on next viewports, through adapters                                                           | Works                  | Removed |
| The next viewport types with `setDisplaySets`, `setDisplaySetPresentation`, `setViewState`, `viewportProjection` and view references               | Work                   | Work    |
| `viewport.getRenderPlan()`, `viewport.isDestroyed`, `viewport.findDataIdByVolumeId()`, and `viewport.calibrateSpacing()` on a next planar viewport | Not there              | Work    |
| `utilities.getSlicesClippingPlanes()`, `utilities.isInAcquisitionPlane()`, `utilities.navigatePlanarViewportToPoint()` of the tools                | Not there              | Work    |
| `utilities.getCurrentVolumeViewportSlice()` for a stack on a next viewport                                                                         | Not there              | Works   |
| The presentation keys `sharpening` and `smoothing`                                                                                                 | Not on a next viewport | Work    |
| Slice first, `setSliceFirst()`, `retryGpu()`, `RENDER_PLAN_CHANGED`                                                                                | Not there              | Work    |
| The events `VIEWPORT_NEW_IMAGE_SET` and `VOLUME_VIEWPORT_NEW_VOLUME` from a viewport that was made with a next type                                | Do not fire            | Fire    |

So the upgrade has three stages.

1. **A first look, on 5.x.** Set `rendering.useGenericViewport: true` in
   `init`. The application keeps its legacy code and runs on next viewports
   through adapters. Look at every screen. This stage is optional. It is a
   first look and not the final picture: a next viewport of 5.x differs from
   one of 6.0 in each place where
   [Rendering changes](./2-rendering-changes.md) says "In 5.x".
2. **Screen by screen, on 5.x.** Do steps 1 to 11 for one screen, or for one
   viewport, at a time. A screen that is not moved yet keeps running on its
   legacy viewports. A screen that needs a call of the lower rows of the table
   waits for stage 3.
3. **The version.** When no legacy name is left, step 12 changes the version
   to 6.0 and removes the settings.

Do not mix the two APIs on one viewport. A viewport is made with a next type
and uses the next API only, or it is a legacy viewport and uses the legacy API
only.

An application that cannot ship in between does all steps on a branch on 6.0.
There the type checker lists every legacy name as an error.

### List what the application uses

The commands of this page are for `rg` (ripgrep). `src` stands for the folders
of your code. This one counts the main legacy calls in each file:

```sh
rg -c "ViewportType\.(STACK|ORTHOGRAPHIC|PERSPECTIVE)|\.(setStack|setVolumes|addVolumes|setProperties|getProperties|getCamera|setCamera|resetCamera)\(|setVolumesForViewports|instanceof (Stack|Volume)Viewport" src
```

Keep the list. It tells which screens there are, and which one is the
smallest to start with.

## Step 1. The viewport types

**Search**

```sh
rg -n "ViewportType\.(STACK|ORTHOGRAPHIC|PERSPECTIVE|VOLUME_3D|VIDEO|WHOLE_SLIDE|ECG)\b" src
rg -n "type: *['\"](stack|orthographic|perspective|volume3d|video|wholeSlide|ecg)['\"]" src
```

**Change.** Each legacy type has one next type.
[Viewport types](./3-api-map.md#viewport-types) has the table.

Before:

```ts
renderingEngine.enableElement({
  viewportId,
  element,
  type: Enums.ViewportType.ORTHOGRAPHIC,
});
```

After:

```ts
renderingEngine.enableElement({
  viewportId,
  element,
  type: Enums.ViewportType.PLANAR_NEXT,
  defaultOptions: { orientation: Enums.OrientationAxis.AXIAL },
});
```

**Check.** `viewport.type` is `'planarNext'`, and `viewport.getCurrentMode()`
is `'empty'` until step 3 shows data.

**What can go wrong**

- A legacy `ORTHOGRAPHIC` viewport without options opened in `AXIAL`. A planar
  viewport without an orientation opens a volume in its acquisition plane. So
  pass the orientation, as above.
- A viewport for a stack gets no orientation.
- `PERSPECTIVE` becomes `VOLUME_3D_NEXT` with
  `defaultOptions: { parallelProjection: false }`. The legacy type drew a
  slice, and the new one draws the volume in 3D. This needs
  [a decision](#changes-that-need-a-decision-by-a-person).
- A viewport of a next type has no legacy members. Its screen runs again when
  steps 2 to 8 are done for it.

## Step 2. Class checks and TypeScript types

**Search**

```sh
rg -n "instanceof (StackViewport|VolumeViewport|BaseVolumeViewport|VolumeViewport3D|VideoViewport|WSIViewport|ECGViewport)\b" src
rg -n "\b(IStackViewport|IVolumeViewport|IBaseVolumeViewport|IVideoViewport|IWSIViewport|IECGViewport)\b" src
rg -n "\.type *[!=]==? *(Enums\.)?ViewportType\." src
rg -n "viewportSupports(Stack|Volume)Compatibility|requestedType" src
```

**Change.** Ask what the viewport shows, not which class it is.

Before:

```ts
if (viewport instanceof StackViewport) {
  showStackControls();
}
```

After:

```ts
const viewport = renderingEngine.getViewport<PlanarViewport>(viewportId);

if (viewport.getCurrentMode() === 'stack') {
  showStackControls();
}
```

For a viewport of any family, `utilities.getViewportContentMode(viewport)`
returns `'stack'`, `'volume'`, `'volume3d'`, `'video'`, `'wholeSlide'`, `'ecg'`
or `'empty'`. `utilities.isGenericViewport(viewport)` narrows a viewport to
`Types.IGenericViewport`.

Type a planar viewport as `PlanarViewport`.
[Classes and TypeScript types](./3-api-map.md#classes-and-typescript-types)
has the other families.

**Check.** Run the type checker. With the viewport typed as `PlanarViewport`,
each legacy member that the code still calls on it is an error. These errors
are the work list of steps 3 to 8.

**What can go wrong**

- A planar viewport can change its mode. `setDisplaySets` with another display
  set turns a stack into a volume. Ask for the mode when you need it, and do
  not store it.
- `utilities.viewportIsInVolumeMode(viewport)` is true for a 3D viewport too.
- The guards `utilities.viewportSupportsImageSlices`,
  `utilities.viewportSupportsVolumeId` and the like test which members a
  viewport has. A planar viewport has them all in both modes, so they do not
  tell a stack from a volume.
- A function of the library that works on a next viewport, such as
  `utilities.scroll`, takes a variable typed as `PlanarViewport`, as the
  class of another next family or as `Types.IGenericViewport`. No cast is
  needed. `getEnabledElement(element).viewport` is still typed as a legacy
  viewport:
  [Types that still describe a legacy viewport](./3-api-map.md#types-that-still-describe-a-legacy-viewport)
  says what to write.

## Step 3. The data

**Search**

```sh
rg -n "\.(setStack|setVolumes|addVolumes|removeVolumeActors|addImages|setVideo|setWSI|setEcg|setDataIds|setDataList)\(" src
rg -n "setVolumesForViewports|addVolumesToViewports|convertStackToVolumeViewport|convertVolumeToStackViewport" src
```

**Change.** Register each series once as a display set, under an id that the
application chooses. Then show it by its id.
[A display set is registered once](./1-next-viewports-only.md#a-display-set-is-registered-once)
says what each family registers, and how a fusion is shown.

For a stack.

Before:

```ts
await viewport.setStack(imageIds, 0);
```

After:

```ts
utilities.genericViewportDisplaySetMetadataProvider.add(displaySetId, {
  kind: 'planar',
  imageIds,
  initialImageIdIndex: 0,
});

await viewport.setDisplaySets({ displaySetId });
```

For a volume.

Before:

```ts
await viewport.setVolumes([{ volumeId }]);
```

After:

```ts
utilities.genericViewportDisplaySetMetadataProvider.add(displaySetId, {
  kind: 'planar',
  imageIds,
  volumeId,
});

await viewport.setDisplaySets({
  displaySetId,
  options: { orientation: Enums.OrientationAxis.AXIAL },
});
```

The viewport takes the volume from the cache. When the volume is not there,
the viewport makes it from the image ids and starts its load.

`setVolumesForViewports` becomes a loop over the viewports:

```ts
await Promise.all(
  viewportIds.map((viewportId) =>
    renderingEngine
      .getViewport<PlanarViewport>(viewportId)
      .setDisplaySets({ displaySetId })
  )
);
```

**Check.** `viewport.getCurrentMode()` is `'stack'` or `'volume'`.
`viewport.getDisplaySets()` lists the ids, the source first. The picture
shows. On 6.0 `VIEWPORT_NEW_IMAGE_SET` fires for a stack and
`VOLUME_VIEWPORT_NEW_VOLUME` for a volume.

**What can go wrong**

- A display set with a `volumeId` shows as a volume. Without it the same
  images show as a stack. Leave `volumeId` out for a stack.
- A stack that is asked for an orientation other than its acquisition plane
  shows as a volume when its images form one. The mount throws when they do
  not. Ask `viewport.canRenderOrientation(orientation)` first.
- `setDisplaySets` replaces everything that the viewport shows.
  `viewport.addDisplaySet(displaySetId, { role: 'overlay' })` adds one display
  set, and `viewport.removeData(displaySetId)` removes one.
- An input of the legacy calls could carry a `callback`, an `actorUID`, a
  `blendMode`, a `slabThickness` and a `visibility`. A display set has none of
  them. They are keys of the presentation, which is step 4.
- `addVolumes` hid the added volume unless its `visibility` was true. An added
  display set is visible.
- `setVolumes` threw when the volumes did not share a frame of reference.
  `setDisplaySets` does not check it.

## Step 4. The look of the data

**Search**

```sh
rg -n "\.(setProperties|getProperties|resetProperties|setDefaultProperties|getDefaultProperties|clearDefaultProperties|resetToDefaultProperties)\(" src
rg -n "\.(setBlendMode|getBlendMode|setSlabThickness|getSlabThickness|resetSlabThickness|setSampleDistanceMultiplier|setVOI|setWindowLevel|setAverageWhite|unsetColormap)\(" src
rg -n "VOILUTFunction|isComputedVOI|callback:|actorUID" src
```

**Change.** The look of one display set is its presentation.
[The keys of setProperties](./3-api-map.md#the-keys-of-setproperties) has the
key for each legacy key.

Before:

```ts
viewport.setProperties({
  voiRange: { lower: -160, upper: 240 },
  invert: true,
});

const { voiRange } = viewport.getProperties();

viewport.setSlabThickness(10);
```

After:

```ts
viewport.setDisplaySetPresentation(displaySetId, {
  voiRange: { lower: -160, upper: 240 },
  invert: true,
});

const voiRange =
  viewport.getDisplaySetPresentation(displaySetId)?.voiRange ??
  viewport.getDefaultVOIRange(displaySetId);

viewport.setDisplaySetPresentation(displaySetId, { slabThickness: 10 });
```

**Check.** `VOI_MODIFIED` fires on the element when the window or the invert
changes. `viewport.getDisplaySetPresentation(displaySetId)` returns the keys
that were set.

**What can go wrong**

- A presentation is what was set. A key that was never set is undefined, where
  `getProperties()` read the value back from the actor. The window that the
  data starts with is `viewport.getDefaultVOIRange(displaySetId)`.
- The key is `voiLUTFunction`, with a lower case `voi`. The legacy key and the
  detail of `VOI_MODIFIED` spell it `VOILUTFunction`.
- There are no default properties. The application keeps its own default and
  sets it.
- `resetDisplaySetPresentation(displaySetId)` does not move the camera, and it
  also clears the slab, the blend mode, the opacity and the visibility.
- A slab is set for each display set. The legacy `setSlabThickness` set all
  actors, so a fusion needs one call for each display set.
- A preset is a look of a 3D viewport. On a slice use
  `colormap: { name, opacityMapping }`.
- Do not edit an actor to set a look. The next presentation update writes the
  look of the actor again.

## Step 5. The view

**Search**

```sh
rg -n "\.(getCamera|setCamera|resetCamera|getViewPresentation|setViewPresentation|flip)\(" src
rg -n "\.(getZoom|setZoom|getPan|setPan|setDisplayArea|getDisplayArea|setAspectRatio|getAspectRatio|setOptions)\(" src
rg -n "storeAsInitialCamera|resetToCenter|resetAspectRatio|parallelScale" src
```

**Change.** A change of the look of the view is a view state change. Zoom and
pan are read and written through `viewportProjection`.

Before:

```ts
viewport.setZoom(viewport.getZoom() * 1.2);
viewport.setCamera({ flipHorizontal: true });
viewport.resetCamera();
```

After:

```ts
const presentation = viewportProjection.getPresentation(viewport, {
  selector: { zoom: true, pan: true },
});
const zoomed = viewportProjection.withPresentation(viewport, {
  zoom: (presentation?.zoom ?? 1) * 1.2,
});

if (zoomed) {
  viewport.setViewState(zoomed);
}

viewport.setViewState({ flipHorizontal: true });
viewport.resetViewState();
```

To read a camera in the legacy shape, use
`viewport.getResolvedView()?.toICamera()`. It is for reading only.

**Check.** `CAMERA_MODIFIED` fires on each change. After `resetViewState()`
the presentation gives zoom 1 and pan `[0, 0]`.

**What can go wrong**

- `withPresentation` returns undefined while the viewport has no data. Check
  the result before `setViewState`.
- Zoom 1 and pan `[0, 0]` are always the fit. There is no stored initial
  camera, so `storeAsInitialCamera` and `resetToCenter` have no twin.
- A planar, a video and an ECG viewport still have `getZoom`, `setZoom`,
  `getPan` and `setPan` from 5.x. The second argument of `setZoom` is a canvas
  point there, not `storeAsInitialCamera`. New code uses `viewportProjection`.
- A 3D viewport: the projection service is **Decided, not in the code yet**.
  Today use `viewport.getZoom()`, `viewport.setZoom(zoom)`,
  `viewport.getPan()` and `viewport.setPan(pan)` on a 3D viewport, and change
  them when the service lands.
- `resetViewState()` keeps the slice. It takes
  `{ resetPan, resetZoom, resetOrientation, resetFlip }`, and each defaults
  to true.
- A camera that was set to move through slices is step 6.
- A display area in the options of a viewport is not applied by itself. Call
  `viewport.setViewState({ displayArea })` after the mount.
- A stretch is `viewport.setViewState({ scale: [x, y] })`. Do not read it from
  `getAspectRatio()`, which always returns `[1, 1]`.

## Step 6. Slices, orientation and references

**Search**

```sh
rg -n "\.(jumpToWorld|setOrientation|setBestOrentation|setViewPlane|setImageIdIndex|scroll|getTargetImageIdIndex|getSliceIndexForImage)\(" src
rg -n "utilities\.(scroll|jumpToSlice)|debounceLoading|scrollSlabs|focalPoint" src
```

**Change.** A move to a place in space is a view reference. A move by index
is `setImageIdIndex` or `scroll`.

Before:

```ts
volumeViewport.setCamera({ focalPoint, position });
volumeViewport.jumpToWorld(point);
```

After:

```ts
viewport.setViewReference({ cameraFocalPoint: point });
```

That call is for a volume. For code that can meet a stack and a volume, the
tools have one call for both modes:

```ts
import { utilities as csToolsUtilities } from '@cornerstonejs/tools';

csToolsUtilities.navigatePlanarViewportToPoint(viewport, point);
```

These calls keep their names and work in both modes:
`viewport.setImageIdIndex(index)`, `viewport.scroll(delta)`,
`viewport.getCurrentImageIdIndex()`, `viewport.getNumberOfSlices()`,
`utilities.scroll(viewport, { delta })` and
`utilities.jumpToSlice(element, { imageIndex })`.

**Check.** `viewport.getCurrentImageIdIndex()` gives the new index.
`STACK_NEW_IMAGE` fires after another image or slice shows, and
`VOLUME_NEW_IMAGE` for a volume.

**What can go wrong**

- A volume shows whole slices. After a jump to a world point the focal point
  can differ from the point by up to half a slice spacing. See
  [A volume slice sits on a slice centre](./2-rendering-changes.md#a-volume-slice-sits-on-a-slice-centre).
- `setOrientation` keeps the point in view, the pan and the zoom. The legacy
  volume viewport reset its camera. Give both vectors when you pass vectors.
- A stack has one orientation. Ask
  `viewport.canRenderOrientation(orientation)` before the call.
- `viewport.scroll(1)` steps by one slice, also with a slab. Pass
  `scrollSlabs: true` to `utilities.scroll` to step by the slab.
- `setImageIdIndex` clamps an index that is out of range. It does not throw.
- `getCurrentImageId()` takes no index: use `viewport.getImageIds()[index]`.
  For a volume it is undefined on a plane that is not the acquisition plane.
- `getTargetImageIdIndex()` is gone. `getCurrentImageIdIndex()` gives the
  requested index at once.

## Step 7. Questions about the data

**Search**

```sh
rg -n "\.(getBounds|getIntensityFromWorld|getSliceViewInfo|getSliceInfo|getCurrentSlicePixelData|getSlicesClippingPlanes|getSlicePlaneCoordinates|isInAcquisitionPlane|getCornerstoneImage|getAllVolumeIds|getImageDataMetadata|getImagePlaneReferenceData|isOrientationChangeable)\(" src
rg -n "\.(modality|scaling|isDisabled|stackActorReInitialized|useCPURendering|suppressEvents)\b" src
rg -n "getImageLegacy" src
```

**Change.** A question that the state and the data can answer is a function
that takes the viewport, or a read of `viewport.getImageData()`. Each one
answers for a stack and for a volume. The rows are in
[Members of the stack and the volume viewport](./3-api-map.md#members-of-the-stack-and-the-volume-viewport),
[Members of the stack viewport only](./3-api-map.md#members-of-the-stack-viewport-only)
and
[Members of the volume viewport only](./3-api-map.md#members-of-the-volume-viewport-only).

Before:

```ts
const bounds = viewport.getBounds();
const value = viewport.getIntensityFromWorld(point);
const inPlane = viewport.isInAcquisitionPlane();
const image = viewport.getCornerstoneImage();
```

After:

```ts
const { imageData, voxelManager } = viewport.getImageData();
const bounds = imageData.getBounds();
const value = voxelManager?.getAtIJKPoint(
  utilities.transformWorldToIndex(imageData, point)
);
const inPlane = utilities.isInAcquisitionPlane(viewport);
const imageId = viewport.getCurrentImageId();
const image = imageId ? cache.getImage(imageId) : undefined;
```

**Check.** Show the same series once as a stack and once as a volume in its
acquisition orientation, on the same slice. Both give the same value at a
point of that slice.

**What can go wrong**

- `getImageData()` returns undefined while nothing is shown. Guard it before
  you read `imageData`.
- `getImageData().imageData` of a stack is a plain object, not a vtk.js image
  data. It has `getBounds`, `getDimensions`, `getSpacing`, `getDirection`,
  `worldToIndex` and `indexToWorld`.
- `utilities.getCurrentVolumeViewportSlice(viewport)` throws for an oblique
  and for a rotated view.
- `cache.getImage(viewport.getCurrentImageId())` gives an image for a volume
  only in its acquisition orientation.
- The search for `.modality` and `.scaling` also finds display sets and
  images of the application. Change only the reads on a viewport.

## Step 8. Actors, the renderer and widgets

**Search**

```sh
rg -n "\.(getActor|getActorByIndex|getActorUIDs|getActorUIDByIndex|getImageActor|getDefaultActor|getActors|addActor|addActors|setActors|removeActors|removeAllActors|getRenderer|addWidget|getWidget|getWidgets|removeWidgets)\(" src
rg -n "_actors" src
```

**Change.** Most code that reads an actor wants to set a look. Set the look
through the presentation.

Before:

```ts
const { actor } = viewport.getDefaultActor();

actor.getProperty().setInterpolationTypeToNearest();
```

After:

```ts
viewport.setDisplaySetPresentation(displaySetId, {
  interpolationType: Enums.InterpolationType.NEAREST,
});
```

`viewport.getActors()` still lists the actor entries of a planar and a 3D
viewport, and each entry names its data in `referencedId`.

**Check.** The look stays after a change of the window.

**What can go wrong**

- On a slice the actors are image slice actors, not vtk.js volumes. Code that
  calls methods of a volume mapper on them fails.
- A planar viewport has no `getRenderer()` and takes no actors of the
  application, in either mode. A feature that drew its own vtk.js actors in a
  slice viewport needs [a decision](#changes-that-need-a-decision-by-a-person).
- A 3D viewport has `getRenderer()`. A prop of a tool goes into the scene with
  `viewport.getRenderer().addActor(actor)`, and the tool removes it itself.
- A surface in a 3D viewport as a display set is **Decided, not in the code
  yet**. Today a 3D viewport has `addActor`, `addActors`, `setActors`,
  `removeActors` and `getActor`.
- Widgets are on a 3D viewport only. No next viewport has `getWidget`: keep
  your own reference to a widget that you add.

## Step 9. Events

**Search**

```sh
rg -n "PRE_STACK_NEW_IMAGE|STACK_VIEWPORT_SCROLL|VOLUME_VIEWPORT_SCROLL|IMAGE_LOAD_ERROR|PRESET_MODIFIED|ACTORS_CHANGED|CLIPPING_PLANES_UPDATED" src
rg -n "STACK_NEW_IMAGE|VOLUME_NEW_IMAGE|CAMERA_MODIFIED|CAMERA_RESET|VOI_MODIFIED|IMAGE_SPACING_CALIBRATED|STACK_SCROLL_OUT_OF_BOUNDS" src
rg -n "invertStateChanged|previousCamera" src
```

**Change.** The first command finds events that a next viewport does not
fire, or will not fire in 6.0. [Events](./3-api-map.md#events) names the
event to listen to in place of each. The second command finds events that
stay and fire at other times. Read each listener.

Before:

```ts
element.addEventListener(Enums.Events.STACK_NEW_IMAGE, onNewImage);
element.addEventListener(Enums.Events.IMAGE_LOAD_ERROR, onLoadError);
```

After:

```ts
element.addEventListener(Enums.Events.STACK_NEW_IMAGE, (evt) => {
  if (viewport.getCurrentMode() === 'stack') {
    onNewImage(evt);
  }
});

eventTarget.addEventListener(Enums.Events.IMAGE_LOAD_FAILED, (evt) => {
  const { imageId, error } = evt.detail;

  onLoadError(imageId, error);
});
```

**Check.** Log each event that the application listens to, on a stack and on
a volume: scroll, change the window, reset. Compare with the table.

**What can go wrong**

- `STACK_NEW_IMAGE` fires for a volume too, on each slice change. A listener
  for stacks now also runs on volumes.
- `CAMERA_MODIFIED` fires on each new image of a stack and once after the
  source mounts. `detail.previousCamera` can be undefined.
- `CAMERA_RESET` fires in stack mode too, and only from `resetViewState()`.
- A change of the slab fires no `CAMERA_MODIFIED`. Code that listened to it
  to follow the slab reads the presentation.
- `detail.invertStateChanged` of `VOI_MODIFIED` is not set by a planar
  viewport. Compare `detail.invert` with the last value.
- `IMAGE_LOAD_FAILED` fires on the `eventTarget`, not on the element. It has
  no viewport id.

## Step 10. Video, whole slide and ECG viewports

**Search**

```sh
rg -n "\.(setVideo|setWSI|setEcg|togglePlayPause|setScrollSpeed|setTime|setFrameRange|getFrameRange|setPlaybackRate|setChannelVisibility|getMiddleSliceData)\(" src
```

**Change.** The rows are in [The video viewport](./3-api-map.md#the-video-viewport),
[The whole slide viewport](./3-api-map.md#the-whole-slide-viewport) and
[The ECG viewport](./3-api-map.md#the-ecg-viewport).

Before:

```ts
await viewport.setVideo(imageId, 1);
viewport.togglePlayPause();
```

After:

```ts
await viewport.setDisplaySets({
  displaySetId: imageId,
  options: { frameNumber: 1 },
});

if (playing) {
  viewport.pause();
} else {
  viewport.play();
}

playing = !playing;
```

A whole slide is registered with its web client:

```ts
utilities.genericViewportDisplaySetMetadataProvider.add(displaySetId, {
  kind: 'wsi',
  imageIds,
  options: { webClient },
});

await viewport.setDisplaySets({ displaySetId });
```

**Check.** The video opens on its first frame and does not play by itself.
The slide opens at the view that fits the canvas. The ECG shows its trace.

**What can go wrong**

- `setPlaybackRate()` sets the rate only. It does not start playback.
- The frame range of a video as a view state key is **Decided, not in the
  code yet**. Today use `viewport.setFrameRange([5, 10])` and
  `viewport.getFrameRange()`.
- The rotation of a whole slide viewport is in degrees.
- `scroll()` of a whole slide viewport and `getNumberOfSlices()` of an ECG
  viewport leave: **Decided, not in the code yet**. Do not write new code on
  them.
- The default trace layout of an ECG differs from the legacy viewport. Set
  `traceLayout` for the layout that you want.
- See [Whole slide viewports](./2-rendering-changes.md#whole-slide-viewports),
  [ECG viewports](./2-rendering-changes.md#ecg-viewports) and
  [Video viewports](./2-rendering-changes.md#video-viewports) for what
  answers differently.

## Step 11. Tools and synchronizers

**Search**

```sh
rg -n "CrosshairsTool|createSlabThicknessSynchronizer|fillAlpha" src
```

**Change.** The tools work on the next viewports, and most code that adds
tools to a tool group needs no change.
[What changes in the tools package](./3-api-map.md#what-changes-in-the-tools-package)
has the rows. Three need work:

- **Crosshairs.** `WorldCrosshairTool` with `SliceIntersectionTool` is the
  crosshair for the next viewports. `CrosshairsTool` still moves through the
  slices, and its rotation handles and its slab handles do nothing on a next
  viewport.
- **The slab thickness synchronizer** does nothing on next viewports. Set
  `slabThickness` in the presentation of each viewport.
- **The fill of a labelmap** is drawn with the configured alpha, so it looks
  stronger than on a legacy volume viewport.

**Check.** Draw each annotation tool that the application offers on a stack
and on a volume, scroll away and back, and compare the measurement with 5.x.
Paint a labelmap and look at the fill.

**What can go wrong**

- A tool that the application wrote itself and that calls legacy members of
  a viewport is application code. Take it through steps 2 to 9.
- `utilities.getImageLegacy(element)` of the core throws for a next viewport.

## Step 12. The version and the settings

**Search**

```sh
rg -n "useGenericViewport|useCPURendering|setUseCPURendering|resetUseCPURendering|getShouldUseCPURendering|useLegacyCameraFOV|useViewportSamplingForLinear" src
rg -n "ViewportType\.(STACK|ORTHOGRAPHIC|PERSPECTIVE)\b|\.(setStack|setVolumes|addVolumes|setProperties|getProperties|resetProperties|getCamera|setCamera|resetCamera|getViewPresentation|setViewPresentation)\(|setVolumesForViewports|addVolumesToViewports" src
```

**Change.** The second command must print nothing before the version
changes. Then set every `@cornerstonejs` package to 6.0, and remove the
settings that the first command finds. [Settings](./3-api-map.md#settings) has
the row for each.

Before:

```ts
init({ rendering: { useGenericViewport: true, useCPURendering: true } });
```

After:

```ts
init();
setRenderBackend('cpu');
```

`setRenderBackend('cpu')` pins the planar viewports to the CPU. The key
`rendering.planar.renderBackend` of the configuration of `init` does the
same. Leave both out unless the application has to pin the viewports.
Without them a router picks the path for each layer, and a device without
WebGL draws on the CPU by itself.

The rename of the viewport types is **Decided, not in the code yet**. When
it lands, replace `PLANAR_NEXT`, `VOLUME_3D_NEXT`, `VIDEO_NEXT`,
`WHOLE_SLIDE_NEXT` and `ECG_NEXT` with `PLANAR`, `VOLUME_3D`, `VIDEO`,
`WHOLE_SLIDE` and `ECG`.

**Check.** The type checker passes. `viewport.getRenderPlan()` of a planar
viewport says for each layer what draws it and why. Go through every screen
once more, with the list of
[changes that need a decision](#changes-that-need-a-decision-by-a-person).

**What can go wrong**

- Slice first is on by default in 6.0. See
  [Slice first is on by default](./2-rendering-changes.md#slice-first-is-on-by-default)
  for what it changes, and `setSliceFirst(false)` turns it off.
- A next viewport of 5.x and one of 6.0 differ. A screen that was checked on
  5.x is checked again.

## Changes that need a decision by a person

At these the code compiles and runs, and the picture or the result differs
from 5.x. Each one has more than one right answer, and the application
decides. A coding agent stops here and asks.

| Change                                               | What differs                                                                                                                                              | The choice                                                                                                                                              |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The orientation of a volume without an option        | A legacy `ORTHOGRAPHIC` viewport without options opened in `AXIAL`. A planar viewport opens a volume in its acquisition plane                             | Which orientation each viewport opens in. See [Orientation of a volume](./2-rendering-changes.md#orientation-of-a-volume)                               |
| A tilted series                                      | `AXIAL`, `SAGITTAL` and `CORONAL` show the true axis. `ACQUISITION` shows the plane of the acquisition                                                    | Whether a viewport shows the true axis or the acquired plane                                                                                            |
| `setOrientation` keeps the view                      | The legacy volume viewport reset its camera and showed the middle of the volume. A next viewport keeps the point in view, the pan and the zoom            | Keep the view, or call `resetViewState()` after the change                                                                                              |
| A jump lands on a slice centre                       | The focal point after a jump can differ from the requested point by up to half a slice spacing                                                            | What code that stores or compares focal points does. See [the section](./2-rendering-changes.md#a-volume-slice-sits-on-a-slice-centre)                  |
| The fill of a labelmap                               | A `fillAlpha` of 0.5 looked like 0.26 on a legacy volume viewport. Now it is drawn as 0.5                                                                 | Keep the stronger fill, or lower `fillAlpha` and `fillAlphaInactive`                                                                                    |
| The opacity of a fusion layer                        | A numeric opacity of a colour layer is applied as given. The legacy viewport drew it weaker                                                               | Keep the value, or lower it                                                                                                                             |
| A list of opacities in `colormap.opacity`            | It is read over the window. The legacy volume viewport read its values as values of the data                                                              | Give the list as `colormap.opacityMapping`, or keep the new reading                                                                                     |
| A slab with the composite blend mode                 | It draws as an average. The legacy viewport cast rays, so voxels in front hid what lies behind                                                            | Which blend mode the slab gets                                                                                                                          |
| A scroll with a slab                                 | `viewport.scroll(1)` steps by one slice. The legacy volume viewport stepped by the slab thickness                                                         | Step by slices, or pass `scrollSlabs: true` to `utilities.scroll`                                                                                       |
| Default properties                                   | `setDefaultProperties` and its family have no twin                                                                                                        | Where the application keeps its default, and when it sets it: for each display set, or for each image in a listener of `STACK_NEW_IMAGE`                |
| Image defaults                                       | A MONOCHROME1 image starts inverted. An image without a window starts at its pixel range, not at 0 to 255                                                 | Whether the application sets its own window or invert on top. See [Image defaults](./2-rendering-changes.md#image-defaults)                             |
| A display area of `type: 'SCALE'`                    | A scale of 1 is the fit of the picture. On a legacy viewport 1 meant one image pixel on one screen pixel                                                  | The scale that gives the size the application wants                                                                                                     |
| Listeners of `STACK_NEW_IMAGE` and `CAMERA_MODIFIED` | `STACK_NEW_IMAGE` fires for volumes too. `CAMERA_MODIFIED` fires on each new image of a stack. A slab change fires no camera event                        | What each listener does in each mode                                                                                                                    |
| A viewport on the CPU                                | The VOI lookup table and the modality lookup table of an image are not applied, as on the GPU. The area around the image has the background colour        | Whether the application relied on the lookup tables on the CPU. See [the section](./2-rendering-changes.md#a-viewport-on-the-cpu-shows-the-gpu-picture) |
| The crosshair                                        | The rotation handles and the slab handles of `CrosshairsTool` do nothing on a next viewport                                                               | Move to `WorldCrosshairTool` with `SliceIntersectionTool`, or keep `CrosshairsTool` without the handles                                                 |
| vtk.js actors of the application in a slice viewport | A planar viewport has no `addActor` and no `getRenderer`                                                                                                  | Show the data as a display set or as a segmentation, draw it as an annotation, or show it in a 3D viewport                                              |
| `ViewportType.PERSPECTIVE`                           | The legacy type drew a thin slab of the volume. A 3D viewport with `parallelProjection: false` draws the volume in 3D                                     | What the screen shows                                                                                                                                   |
| The zoom and the pan of a video and an ECG viewport  | `getPan()` gives canvas pixels from the fit. The legacy viewport gave world units                                                                         | What code that stores a pan does with stored values                                                                                                     |
| Playback of a video                                  | `setPlaybackRate()` does not start or pause playback                                                                                                      | Where the application calls `play()` and `pause()`                                                                                                      |
| World points of a whole slide viewport               | World points follow the coordinate system of the slide, and the rotation is in degrees. Points saved from a next whole slide viewport of 5.x show shifted | What happens to saved points and rotations                                                                                                              |
| The trace layout of an ECG                           | The legacy viewport drew twelve rows of one lead. The next viewport picks a layout by the record                                                          | Which `traceLayout` the application sets                                                                                                                |

Rows that say "Differs" in [the map](./3-api-map.md) and are not in this table
change an answer in a way that has one right fix. The row gives it.

## For a coding agent

Rules for doing this upgrade mechanically.

1. **Follow the order.** Do the steps from 1 to 12, for one screen at a
   time. Finish the check of a step before the next step.
2. **Never guess a replacement.** Search
   [the map](./3-api-map.md) for the legacy name. Use the call in the column
   "Use instead" of its row, as it is written. A name that has no row is not
   a viewport API of Cornerstone3D, or it is missing from the map: stop and
   report it.
3. **Read the last column of the row.** It says what the call does on a stack
   and on a volume. Where the code can meet both, use the call that answers
   in both modes, and do not add a branch on the mode that the row does not
   ask for.
4. **Do not use a call that is not built.** A row or a line marked
   **Decided, not in the code yet** gives the call of 6.0 and says what the
   code does today. Use what works today, and list each such place in your
   report. The marks are in the text of the four pages: search them for the
   words of the mark. They cover zoom and pan of a 3D viewport and the pan of
   a whole slide viewport, surfaces and actors of a 3D viewport, small
   members of the 3D, the whole slide and the ECG viewport, the frame range
   of a video and the lookup of a video by the URI of one frame, the options
   of `utilities.scroll`, the orientation input, six events, the settings,
   the rename of the viewport types and the removal of the legacy names.
5. **Do not import a private name.** A cell with `-` means that no call takes
   the place of the legacy name. Do not import from a path inside a package,
   such as `@cornerstonejs/core/dist`, and do not use a `LegacyAdapter` class
   or `rendering.useGenericViewport` as the end state.
6. **Do not keep a legacy call behind a cast.** No `as any` and no check for
   the presence of a legacy member to keep an old path alive.
7. **Do not edit actors to set a look.** Use the presentation.
8. **Verify after each step.** The type checker passes. The tests of the
   application pass. The search of the step prints nothing, or only lines
   that you list with the reason. Then do the check of the step.
9. **Stop and ask** at each row of
   [Changes that need a decision by a person](#changes-that-need-a-decision-by-a-person)
   that the code touches. Say what you found, where, and what the choices
   are. Do not change a value to make a picture look as before, such as
   `fillAlpha`, unless the person chose that.
10. **Report.** For each step: the files you changed, the result of its
    search before and after, the result of its check, each place that waits
    for a call that is not built, and each decision that is open.
