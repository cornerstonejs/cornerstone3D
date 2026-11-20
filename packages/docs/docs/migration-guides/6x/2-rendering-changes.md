---
id: rendering-changes
title: Rendering changes
summary: What a 6.0 viewport draws and answers differently from 5.x - slice first, the render plan, the CPU picture, orientation, slabs, presentation, events, labelmap fill, image defaults, and the whole slide, ECG, 3D and video viewports
---

# Rendering changes

**State: in the code.** Everything on this page is about the Generic
("next") viewports, which are the only viewports of 6.0. The legacy viewports
that the page compares with are those of 5.x, which 6.0 no longer has, see
[Next viewports only](./1-next-viewports-only.md).

This page says what differs. For the call that replaces a legacy call, see
[Every legacy call and what replaces it](./3-api-map.md).

## Slice first is on by default

A planar viewport that shows one slice of a volume no longer puts the whole
volume in a 3D texture. The CPU cuts the slice out of the frames it already
holds, and the GPU draws that 2D image. The 3D texture is made only when a
layer asks for a slab (a MIP, for example) or for 3D.

What changes for an application:

- **GPU memory is much smaller** for plain slices, and a volume that is too
  large for a 3D texture on the device still shows.
- **The render mode of a plain volume slice is `vtkSampledSlice`**, not
  `vtkVolumeSlice`. Code that compares render mode names should read
  `viewport.getRenderPlan()` instead.
- **The outline of a tilted slice can differ by one pixel.** The GPU volume
  path paints an edge pixel that the slice only half covers with the
  background. The sampled slice gives it its value.
- **Float data stays float on devices that cannot filter float textures.**
  `canRenderFloatTextures()` returns true while slice first is on, so a PET
  volume keeps its float values there. Where such a layer does go to a float
  3D texture (a slab, or 3D), it is drawn with nearest filtering.

`rendering.planar.sliceFirst: false`, or `setSliceFirst(false)` at run time,
turns it off. The `sliceFirst` option of one display set wins over both.

## A volume slice sits on a slice centre

A planar viewport moves through a volume in whole slices: steps of the spacing
along the view normal, for any orientation. A jump to a world point shows the
slice closest to that point. This holds for `setViewReference` with a
`cameraFocalPoint`, for a scroll and for a crosshair drag.

A legacy volume viewport put its camera on the exact point and sampled the
volume there, between two slices. So in 6.0 the focal point read back after a
jump can differ from the requested point by up to half a slice spacing. A
point asked at 29.97 slices shows slice 30, and the picture is that slice, not
a mix of two.

Code that compares the camera focal point with the point it asked for should
allow half a slice spacing, or keep the point itself.

On an oblique view a jump with `setViewReference({ cameraFocalPoint })` stays
on the point, between two slices: the focal point read back is the point.
`viewport.scroll(0)` after the jump moves the view onto the closest slice, as
the legacy helpers did with `scroll(0)` after `setCamera`.

`WorldCrosshairTool` does the second. It keeps one world point for a tool
group, which no camera owns. Each linked viewport shows its closest slice, and
the marker counts as off the slice only beyond half the slice spacing.
`SliceIntersectionTool` draws the lines of the other planes, and moves, turns
and thickens them. Together they are the crosshair for the next viewports.

`CrosshairsTool` still works on a next planar viewport in volume mode. It moves
through the slices, with its centre on a slice centre. Its rotation handles
turn the planes of the other viewports about the centre, through the
orientation of the view state, and a pixel keeps its size in mm. Its slab
handles set `slabThickness` in the presentation of the other viewports, and
the slab lines show it. With `autoPan` it pans a viewport whose centre would
leave the canvas. Against the legacy volume viewport:

- The tool sets no blend mode. Set `blendMode` in the presentation of each
  display set, for example `Enums.BlendModes.MAXIMUM_INTENSITY_BLEND` for a
  MIP slab. The configuration `slabThicknessBlendMode` is gone.
- A slab handle writes the number that the legacy tool gave
  `setSlabThickness`, and the slab on the screen is the same (see
  [Slabs and scrolling](#slabs-and-scrolling)).
- By default every display set of the viewport gets the slab, as every volume
  did. `filterActorUIDsToSetSlabThickness` limits it to the display sets it
  names, by display set id or by volume id.
- After a turn the centre is worked out from the view references, and a view
  reference puts a turned plane on its closest slice. So the centre can move
  by up to half a slice spacing.
- `resetCrosshairs` resets the views and takes the slabs back to none, as
  before.

## Orientation of a volume

- **A requested axis is the true axis.** A viewport asked for `AXIAL`,
  `SAGITTAL` or `CORONAL` shows that plane, also on a series that was acquired
  tilted, as the legacy volume viewport does. `ACQUISITION` shows the plane of
  the acquisition. The next viewport of 5.x opened a tilted series on its
  acquisition plane when the closest axis was asked for. A series that is not
  tilted is not affected: there the axis is a slice of the acquisition.
- **A planar viewport without an orientation opens a volume in its
  acquisition plane.** A legacy `ORTHOGRAPHIC` viewport without options opened
  in `AXIAL`. Pass the orientation in `defaultOptions` or in the options of
  `setDisplaySets`.
- **The reformat names work in three places.** `axial_reformat`,
  `sagittal_reformat`, `coronal_reformat` and `reformat` give the same view
  in the options of a viewport or of a display set, in `setOrientation` and
  in `setViewState({ orientation })`. A name stands for the axes of the
  images, matched to the patient axis of the name. `reformat` takes the
  patient axis closest to the view on display, or closest to the acquisition
  when it comes with the mount. The view state does not keep the name:
  `getViewState().orientation` gives the view vectors that it stands for.
- **Give both vectors to `setOrientation`.** `setOrientation(input)` is
  `setViewState({ orientation: input })`, so
  `setOrientation({ viewPlaneNormal, viewUp })` and
  `setViewState({ orientation: { viewPlaneNormal, viewUp } })` give the same
  view. No rule fills in or corrects a view up. Without a `viewUp` the view
  takes the view up of the acquisition. The legacy viewport kept the current
  view up when that was orthogonal to the new normal, and otherwise took
  `[0, 0, 1]` for a normal along x or y and `[0, -1, 0]` for a normal along
  z. A `viewUp` that is not orthogonal to the normal throws. The legacy
  viewport made it orthogonal.
- **`setOrientation` keeps the point in view, the pan and the zoom.** The
  legacy volume viewport resets its camera on `setOrientation` and shows the
  middle of the volume. `resetViewState()` goes back to the orientation of the
  viewport options. The zoom that stays is a factor of the fit, and the fit
  is worked out for the new orientation, so the picture can change its size
  on the screen: an oblique view can show smaller than on the legacy
  viewport, with the background at its sides. Set the zoom again after the
  turn for another size.
- **A legacy `setCamera({ viewPlaneNormal, viewUp })` kept the camera
  position** and moved the focal point, so the cut moved too.
  `setViewState({ orientation })` keeps the point in view, so on a thin
  volume the two show cuts that are slices apart.
- **A stack has one orientation.** A display set without a `volumeId` shows
  as a stack in its acquisition plane. Mounted with another orientation, the
  viewport shows the images as a volume when they form one, and the mount
  throws when they do not. After the mount, `setOrientation` and
  `setViewState({ orientation })` change nothing on a stack and do not throw,
  and the view state keeps its orientation.
  `canRenderOrientation(orientation)` tells before the call: for a mounted
  stack it is false for every orientation but the acquisition.
- **A flip is a flag of the view state.** The legacy volume viewport flipped
  by moving its camera to the other side of the slice, so its view plane
  normal turned around. A next viewport keeps `flipHorizontal` and
  `flipVertical` in the view state and mirrors the picture.

## Slabs and scrolling

- **A slab thickness draws the same slab as on a legacy volume viewport.**
  Measured with a maximum intensity and an average slab: the same number
  reaches as far on both.
- **A slab with the composite blend mode draws as an average.** The legacy
  volume viewport casts rays through the slab, so voxels in front hide what
  lies behind them.
- **Scrolling by slabs is an option.** `viewport.scroll(1)` on a legacy volume
  viewport with a slab steps by the slab thickness. On a planar viewport it
  steps by one slice. Pass `scrollSlabs: true` to `utilities.scroll` to step
  by the slab. `viewport.scroll(delta)` takes the delta only, and
  `getCurrentImageIdIndex()` and `getNumberOfSlices()` take no arguments and
  count slices. No member counts the slab steps.
- **A slab is set for each display set.** `slabThickness` and `blendMode` are
  keys of the presentation of one display set. The legacy `setSlabThickness`
  set all actors. A change of `slabThickness` fires `CAMERA_MODIFIED`, as the
  legacy member did. Other presentation changes fire no camera event.
- **A brush and a new annotation take the depth of the slab shown.** A
  `slabThickness` of `T` shows the slices within about `T` of the plane, so
  the depth is `2T`, as on the legacy volume viewport.
  `utilities.getViewSlabDepthOfViewport` of the tools gives it, a circle brush
  fills that depth, and the view reference records it as
  `planeRestriction.referencePlaneThickness`, so the statistics of a new area
  annotation cover it. In 5.x a next viewport gave `T`, and its annotations
  recorded no thickness and measured one slice.
- **A slab is the step of `getTargetVolumeAndSpacingInNormalDir`.** With a
  `volumeId` and `useSlabThickness`, the step that
  `utilities.getTargetVolumeAndSpacingInNormalDir` gives is the
  `slabThickness` of the presentation of the source display set, as the
  legacy `getProperties().slabThickness` was. In 5.x a next viewport gave the
  spacing of the volume. Without a `volumeId` (`targetId` undefined), the
  volume is still the one with the finest spacing, and `useSlabThickness`
  gives the slab as well. In 5.x that call gave the spacing of the volume on
  every viewport, the legacy volume viewport too.
- **An average slab shows in the fidelity.** An average slab in the
  presentation of the source display set sets the display resolution of
  `getFidelityState()` along the view normal to the slab thickness, as the
  slab of the legacy volume viewport did: a reduction along the normal that
  the slab averages away is not reported. A maximum or minimum intensity slab
  picks one sample and changes nothing. In 5.x a next viewport left the slab
  out.
- **`loop` wraps a volume too.**
  `utilities.scroll(viewport, { delta, loop: true })` wraps at both ends in
  stack mode and in volume mode. The legacy volume viewport ignored `loop`.
  `StackScrollTool` passes its `loop` configuration on, so a tool that is set
  to loop wraps a volume too.

## Sharpening and smoothing

- **`sharpening` and `smoothing` are keys of the presentation** of the source
  display set of a planar or a 3D viewport, with the numbers that the legacy
  `setProperties` takes:
  `viewport.setDisplaySetPresentation(displaySetId, { sharpening: 1 })`. The
  picture is the picture of the legacy viewport. In 5.x the next viewports had
  neither.
- **A viewport that draws on the CPU sharpens and smooths too.** The legacy CPU
  path ignored both numbers.
- **With both above 0 the picture shows the sharpening only,** as on the legacy
  viewport: vtk.js draws each pass of a view on its own, and the last one wins.
- **With the tiled rendering engine neither is drawn on the GPU,** on the
  legacy viewports and on the next ones alike: that engine does not ask a
  viewport for its render passes.

## The presentation of a display set

- **A sigmoid window on a volume is drawn.**
  `setDisplaySetPresentation(displaySetId, { voiLUTFunction })` with
  `SAMPLED_SIGMOID` draws the sigmoid on every path of a planar viewport, on
  the GPU and on the CPU. In 5.x a next planar viewport stored the key and drew
  a linear window for a volume.
- **The key is `voiLUTFunction`** on the planar and on the 3D presentation. The
  legacy properties and the detail of `VOI_MODIFIED` spell it `VOILUTFunction`.
- **A colormap update keeps what it does not name.**
  `{ colormap: { opacity: 0.5 } }` keeps the stored name, opacity mapping and
  threshold, and `{ colormap: { name } }` keeps the stored opacity, as the
  legacy `setProperties`. In 5.x a next planar viewport replaced the whole
  colormap, so the name was lost. `COLORMAP_MODIFIED` carries the whole
  colormap. A number in `opacity` after opacity points multiplies the points.
  On a legacy volume viewport `setProperties({ colormap: { opacity } })` threw
  the points of a callback away and kept one opacity, so the same two steps
  give another picture.
- **A list of opacities is read over the window.** A list in
  `colormap.opacity` runs from 0 at the lower end of the window to 1 at its
  upper end on a next planar viewport. The legacy volume viewport read the
  values as values of the data. Give such a list as `colormap.opacityMapping`:
  its values are values of the data, and a change of the window keeps them.
- **No default properties.** `setDefaultProperties`, `getDefaultProperties`,
  `clearDefaultProperties` and `resetToDefaultProperties` have no twin. An
  application keeps its own default and sets it with
  `setDisplaySetPresentation`. `resetDisplaySetPresentation(displaySetId)`
  goes back to the look of the data.
- **A presentation is what was set.** `getDisplaySetPresentation(displaySetId)`
  gives the stored keys. A key that was never set is undefined, where the
  legacy `getProperties()` read the value back from the actor.
  `getDefaultVOIRange(displaySetId)` gives the window that the data starts
  with.
- **A reset of the presentation does not move the camera.**
  `resetDisplaySetPresentation(displaySetId)` also clears the slab, the blend
  mode, the opacity and the visibility. `resetViewState()` resets the view.
- **An edit of an actor does not last.** The next presentation update writes
  the look of the actor again. Set the look through the presentation.
- **No preset on a slice.** A preset is a look of a 3D viewport. For a slice,
  register a colormap and set `colormap: { name, opacityMapping }`.
- **No `callback` on a display set.** These presentations draw what the
  callbacks of the examples drew on a slice viewport:

  | The callback set                             | Presentation                                                               |
  | -------------------------------------------- | -------------------------------------------------------------------------- |
  | A CT window of -160 to 240                   | `{ voiRange: { lower: -160, upper: 240 } }`                                |
  | A PET window of 0 to 5, inverted             | `{ voiRange: { lower: 0, upper: 5 }, invert: true }`                       |
  | A PET colormap with opacities by SUV, fusion | `{ voiRange: { lower: 0, upper: 5 }, colormap: { name, opacityMapping } }` |

  For the last one the opacities between 0 and 1 show as given. The legacy
  viewport drew them weaker, see
  [a labelmap fill is drawn with the configured alpha](#a-labelmap-fill-is-drawn-with-the-configured-alpha).
  `petColorMapPresentation()` of `utils/demo/helpers/volumePresentationRecipes.js`
  gives the weaker points: with it the PET layer of a fusion looks as the
  legacy volume viewport drew it with the callback, within two levels of 255,
  measured on a fusion like the TMTV example. Its second argument gives the
  points for a fusion whose volumes have other bounds.

## Display area and stretch

- **The display area is a key of the view state.**
  `viewport.setViewState({ displayArea })` sets it after the mount.
  `setDisplayArea(displayArea)` does the same and fires
  `DISPLAY_AREA_MODIFIED`.
- **A `displayArea` in the options of a viewport is not applied by itself.**
  The picture follows the view state only, at the mount and after
  `resetViewState()`. `getDisplayArea()` still returns the display area of
  the options while none is set in the view state.
- **A display area of `type: 'SCALE'` reads its `scale` against the fit.** A
  scale of 1 is the fit of the picture. On a legacy viewport 1 meant one
  image pixel on one screen pixel.
- **A pan or a zoom through `viewportProjection` takes the display area
  away.** `viewport.setViewState(viewportProjection.withPresentation(viewport, { pan }))`,
  and the same with `zoom` or `scale`, starts from the picture that the
  display area gave and moves or grows it. A zoom with no `anchorCanvas` is
  about the centre of the canvas. After it `viewport.getViewState().displayArea`
  is undefined. The pan tool, the zoom tool and a zoom and pan synchronizer
  work this way, in stack mode and in volume mode. Before this change the
  display area stayed: a pan did nothing and a zoom was multiplied by the
  zoom of the display area. To set a display area again, call
  `viewport.setDisplayArea(displayArea)`.
- **`setViewState({ displayArea })` merges.** A scale that the view state
  already has stays and multiplies the display area.
  `setDisplayArea(displayArea)` resets the scale first.
- **A turn after a pan turns the picture about its own centre.** A pan set
  through `viewportProjection.withPresentation(viewport, { zoom, pan })` stays
  through a later rotation, so the picture turns about its own centre. The
  legacy `setCamera({ focalPoint, position, parallelScale })` kept a world
  point at the centre of the canvas, so a later rotation turned the picture
  about the centre of the canvas.
- **No `storeAsInitialCamera`.** Zoom 1 and pan `[0, 0]` are always the fit.
  A display area does not change the interpolation either.
- **A stretch is the scale pair of the view state.**
  `viewport.setViewState({ scale: [x, y] })` stretches the picture, in stack
  mode and in volume mode, on the GPU and on the CPU.
  `viewportProjection.getPresentation(viewport, { selector: { scale: true } })`
  returns the pair in its `scale`. A planar viewport has no `setAspectRatio()`,
  and the `aspectRatio` option is not applied.
- **A stretched picture can fit the canvas.** With `scaleMode: 'fitAspect'`
  the pair is measured against the fit of the stretched picture:
  `viewport.setViewState({ scale: [w / h, 1], scaleMode: 'fitAspect' })` is
  the legacy `setAspectRatio([w, h], { fit: true })`, and the fit follows a
  resize. Without the fit, `setAspectRatio([w, h])` kept the horizontal
  scale: `setViewState({ scale: [x, (x * h) / w], scaleMode: 'fit' })`, with
  `x` the first number of the `scale` that `viewportProjection` gives.
- **`getAspectRatio()` always returns `[1, 1]`.** Every next viewport still
  has the member from 5.x. It does not follow the scale pair, so do not read
  the stretch from it.

## A copy of the view between viewports

`tViewport.setCamera(sViewport.getCamera())` copied the focal point and the
parallel scale, so two viewports of other data showed the same place at the
same size. A next viewport has no camera to copy, and zoom 1 is the fit of
each viewport: a zoom and a pan copied between a CT and a PT viewport give
another size and another place. These calls give the legacy picture:

1. `tViewport.setViewReference(sViewport.getViewReference())`.
2. The zoom of the target is
   `sourceZoom * targetParallelScale / sourceParallelScale`, with each
   parallel scale from `viewport.getResolvedView()?.toICamera()` at zoom 1.
3. The pan brings the focal point of the source to the centre of the
   canvas: with `point = tViewport.worldToCanvas(sourceFocalPoint)`, the pan
   is `pan + (centre - point) / zoom`.

Steps 2 and 3 go through `viewportProjection.withPresentation`. The camera
position synchronizer copies the view reference, the zoom and the pan as they
are, so between viewports of other data it gives another size.

## Events and image loading of a planar viewport

- **The events of new data fire.** `VOLUME_VIEWPORT_NEW_VOLUME` when a volume
  is shown and `VIEWPORT_NEW_IMAGE_SET` when a stack is shown, on every
  `setDisplaySets`. In 5.x only the adapter fired them.
- **One event for a new image: `NEW_IMAGE`.** It replaces `STACK_NEW_IMAGE`
  and `VOLUME_NEW_IMAGE`. No next viewport fires those two. `NEW_IMAGE` fires
  after another image of a stack shows, after another slice of a volume
  shows, and for each frame of a video. A listener for stacks and a listener
  for volumes become one listener. `detail.imageIndex` of `VOLUME_NEW_IMAGE`
  is `detail.imageIdIndex` now. A listener that came from `STACK_NEW_IMAGE`
  and reads `detail.image` also runs for a volume, where there is no image:
  check `detail.image`, or `viewport.getCurrentMode()`. The detail has the
  same keys in every mode:
  - `viewportId` and `renderingEngineId`.
  - `imageIdIndex` is the index of what is on display, which is what
    `viewport.getCurrentImageIdIndex()` gives: the index of the image in a
    stack, the slice index of the view of a volume, the index of the frame
    of a video. The slice index of a volume counts along the view, in any
    orientation, and can run against the order of the image ids.
  - `numberOfSlices` is how many there are along the view, which is what
    `viewport.getNumberOfSlices()` gives.
  - `imageId` is the image on display, which is what
    `viewport.getCurrentImageId()` gives. It is undefined for a cut of a
    volume that shows no single image.
  - `image` is the image object in stack mode. It is undefined in volume
    mode and on a video.
- **`NEW_IMAGE` fires once at a mount and once for each change.** At a mount
  it fires once, for what the mount shows: the image of a stack, or the slice
  of a volume. Then it fires once for each change of the image or of the
  slice of the source. A better stage of a progressive load of the image on
  display fires it again, with the better image. A display set that is
  mounted over the source, such as the second volume of a fusion, fires
  none. In 5.x a next viewport fired the old pair twice at the mount of a
  volume, the first time for a slice that it never showed, and once more for
  each display set over the source at a mount and at every scroll. A
  listener that waited for the second event of a mount, or that counted
  events, changes.
- **`CAMERA_MODIFIED` fires on each change of the view state,** a scroll
  included, and once after the source mounts. `CAMERA_RESET` fires from
  `resetViewState()` only, also in stack mode, where the legacy viewport
  never fired it.
- **No `PRE_STACK_NEW_IMAGE` and no `STACK_VIEWPORT_SCROLL`.** Both are gone
  from `Enums.Events`, as are `STACK_NEW_IMAGE` and `VOLUME_NEW_IMAGE`. A
  scroll is a view state change like any other. `CAMERA_MODIFIED` fires at once when an
  index is asked for, before the image loads. `NEW_IMAGE` fires when the
  image or the slice shows.
- **The scroll events are those of the legacy viewport of the mode.** In
  volume mode `utilities.scroll` fires `VOLUME_VIEWPORT_SCROLL` on each
  scroll, and `VOLUME_VIEWPORT_SCROLL_OUT_OF_BOUNDS` in its place when it is
  asked to go past an end while the view is in the acquisition plane, with
  the detail of the legacy volume viewport. In stack mode it fires
  `STACK_SCROLL_OUT_OF_BOUNDS` when it is asked to go past an end, as the
  legacy stack viewport did. `utilities.jumpToSlice` scrolls, so it fires
  them too.
- **No `ACTORS_CHANGED` and no `CLIPPING_PLANES_UPDATED`.** Both are gone
  from `Enums.Events`. No next viewport has a list of actors to change or
  sets slab clipping planes on a vtk mapper. The
  [Events](./3-api-map.md#events) rows say what to listen to.
- **A failed image load is reported, and the index can be asked for again.**
  The image loader fires `IMAGE_LOAD_FAILED` on the `eventTarget` with the
  image id and the error. In 5.x the failure was an unhandled rejection on a
  next viewport and the index was never loaded again. `loadAndCacheImage` no
  longer leaves an unhandled rejection either: its own promise still rejects.
  A planar viewport does not fire the legacy `IMAGE_LOAD_ERROR`. The row of
  the event in [Events](./3-api-map.md#events) says what differs in the
  detail.
- **`setImageIdIndex()` resolves when the image is shown,** as on the legacy
  stack viewport, and `getCurrentImageIdIndex()` gives the requested index at
  once. In 5.x the promise resolved before the load and the index lagged
  behind until the image was drawn. `getCurrentImageId()` gives the image
  that is drawn.
- **A stack follows the image retrieve configuration.** Staged and
  progressive loading that is registered for `'stack'` with
  `imageRetrieveMetadataProvider` works with `setDisplaySets`. Without a
  configuration an image is requested as on the legacy stack viewport: as an
  interaction request with priority 5. In 5.x a next viewport requested it as
  a prefetch.
- **`VOI_MODIFIED` carries `invert`,** so the VOI synchronizer syncs an invert
  from a planar viewport, in stack mode and in volume mode. The event also
  fires for a change of the invert or of the VOI function when no window was
  set yet, and at the mount. The detail of a planar viewport has no
  `invertStateChanged`: a listener compares `detail.invert` with the last
  value.
- **`suppressEvents` in the options of a planar viewport is honoured.** No
  call takes a `suppressEvents` argument.
- **`isReferenceViewable` honours `asOverlay`,** so a labelmap image that is
  not in the stack but lies on the geometry of the image on display shows.
  With `asNearbyProjection` a reference by a focal point only shows in stack
  mode when the point lies within half a slice spacing of the image on
  display, as on the legacy stack viewport.
- **`isReferenceViewable` honours `asVolume` in stack mode,** which asks
  whether the stack could show the reference as a volume. A reference that
  names no image is viewable with it when it names a volume or a frame of
  reference and is in the frame of reference of the stack, in any plane and
  at any slice, as on the legacy stack viewport. A reference that names an
  image by `referencedImageURI` alone is viewable so only when the stack has
  that image. In stack mode `withOrientation` is not read: a reference of
  another plane needs `asVolume`, as on the legacy stack viewport. In 5.x the
  next planar viewport did not read `asVolume`. In volume mode it has no
  effect.
- **A view reference crosses between a stack and a volume of the same
  images.** A next view reference names its display set (`dataId`). A planar
  viewport of another display set that has the image that the reference
  names takes it, as the legacy stack and volume viewports did:
  `isReferenceViewable(viewRef, { withNavigation: true })` is true, and
  `setViewReference(viewRef)` shows that image. The slice index and the
  volume of such a reference count in the other display set and are not
  asked. A reference of other images, or of a plane that the viewport does
  not show, is not viewable. Without the option the answer is true when the
  viewport shows that image; the legacy volume viewport compared the slice
  index of the stack with its own there, and answered false.
- **A stack stays where it is for a reference of other images.** In stack
  mode, `setViewReference` with a reference that names an image the stack
  does not hold moves nothing, whatever slice index or focal point comes
  with it, as on the legacy stack viewport. In 5.x the next stack went to the
  slice index of such a reference, which counts in the other series. In
  volume mode a reference of another series in the same frame of reference
  still moves the view to its plane, as on the legacy volume viewport.
- **A volume goes where the legacy volume went for a part of a reference.**
  In volume mode, `setViewReference` uses a `sliceIndex` only with the
  `volumeId` of the volume and a `viewPlaneNormal`; a slice index without
  them moves nothing. In the acquisition plane a named image goes before a
  `cameraFocalPoint`, and an image of another series of the frame of
  reference moves the view to the plane of its image position. In 5.x the
  next viewport went to a bare slice index in the order of the view, and to
  the focal point before the image. For a reference of another frame of
  reference, or of none, the legacy volume viewport threw "Incompatible view
  refs"; a planar viewport moves nothing and does not throw. A
  `cameraFocalPoint` without a frame of reference still moves it.
- **A reference of a sagittal or a coronal slice is viewable with navigation
  on every slice of that view.** Its slice index counts in the slices along
  the view, as on the legacy volume viewport. In 5.x the next planar
  viewport counted it against the number of images, so
  `isReferenceViewable(viewRef, { withNavigation: true })` answered false for
  most sagittal and coronal slices of a CT, and a viewport that copied
  another only after that check stayed on its slice. With
  `{ withOrientation: true, withNavigation: true }` a reference of another
  plane of the volume is viewable whatever its slice index, which counts in
  the slices of its own plane, as on the legacy volume viewport. In 5.x the
  next planar viewport checked it against the slices of the view, so an axial
  view of 8 slices refused a sagittal reference at slice 16.
- **`IMAGE_SPACING_CALIBRATED` fires from `calibrateSpacing(imageId)`,** and
  its detail has `worldToIndex` and `scale`. It does not fire by itself when
  a newly shown image has another calibration, as it did on the legacy stack
  viewport. `utilities.calibrateImageSpacing` of the tools makes the call. An
  application that writes a calibration into the metadata itself makes the
  call too, or the annotations of that image are not worked out again.
- **`getFrameOfReferenceUID()` always returns a string.** Without a frame of
  reference it is a name made of the type and the id of the viewport, where
  the legacy viewport returned undefined. It takes no slice index.
- **`getImageData()` of a stack gives a plain object as `imageData`,** not a
  vtk.js image data. It has `getDirection`, `getDimensions`, `getSpacing`,
  `getBounds`, `worldToIndex` and `indexToWorld`, on the GPU and on the CPU.
  So the bounds and the value at a world point are read in one way for a
  stack and for a volume, see the rows `getBounds()` and
  `getIntensityFromWorld()` of
  [the map](./3-api-map.md#members-of-the-volume-viewport-only).

## Surfaces in a planar viewport

- **A surface shows as contours.** The conversion of a Surface representation
  to contours did nothing on a next planar viewport, because the planes of its
  slices were missing. `utilities.getSlicesClippingPlanes(viewport)` gives
  them, for a volume and for a stack, and the cut of a surface into the
  contours of each slice uses it in both modes.
- **The contours cut from surfaces are given for each viewport and each
  surface.** `clipAndCacheSurfacesForViewport(surfacesInfo, viewport)` of
  polySeg gives the contours of those surfaces on that viewport only, and
  keeps none of them after the call, so
  `extractContourData` of its result no longer holds the contours that
  other viewports or other segmentations with the same segment index got
  before, which a viewport then showed twice. The id of each surface names
  the surface (its geometry id; for a labelmap, the segmentation and the
  segment index), and the bounding box of a surface is computed again when
  its points or its polys change. In 5.x the result held every contour cut
  before, and a box was kept for good, in two of the paths by the segment
  index.
- **A Surface representation shows as its cut.** On a planar viewport the
  surface of each segment is a prop of the renderer of the viewport. In
  volume mode it is clipped to the slice on display, 0.05 mm on each side, as
  on the legacy volume viewport: a thin outline on a slice that cuts the
  surface, nothing on a slice that does not, and the clipping follows each
  scroll. In stack mode it is drawn whole, as on the legacy stack viewport:
  in front of the image where it stands toward the viewer, hidden by the
  image where it stands behind it. Adding a surface does not move the view.
  The legacy viewport reset its camera, which moved a volume to its centre
  slice. The colour of a segment follows a change, as in 3D.
  `getActors()` does not list the prop. `getSurfaceActorEntry` of
  `@cornerstonejs/tools/segmentation/helpers/getSegmentationActor` finds it,
  as on the legacy viewports: the entry has the prop as `actor` and the
  representation UID of the surface as `representationUID` and as `uid`.
  Differs: the prop draws new points and polys of a surface when they are
  other arrays, also of the same lengths, or the same arrays with another
  length (a face appended in place), and the prop of a segment that the
  labelmap no longer has, the last one too, goes at the next update of the
  surfaces. The legacy viewports kept the old mesh when the lengths were the
  same, and kept the surface of a removed segment. Values changed in place,
  in the same arrays with the same lengths, do not show, as on the legacy
  viewports: give the surface new arrays (`surface.points = movedPoints`)
  before the segmentation modified event.

## vtk.js actors and widgets of the application in a planar viewport

- **A prop goes into the renderer of the viewport.** In stack mode and in
  volume mode, as on a 3D viewport:

  ```ts
  viewport.getRenderer().addActor(actor);
  viewport.render();

  viewport.getRenderer().removeActor(actor);
  viewport.render();
  ```

  It replaces `addActor`, `addActors`, `setActors` and `removeActors` of the
  legacy stack and volume viewports for a prop that is not data. The
  application keeps the prop: `getActors()` does not list it, and the
  `ACTORS_CHANGED` event is gone. The prop is drawn with the slice, in world
  coordinates, so it follows a zoom, a pan and a scroll. The clipping range
  of the camera holds every visible prop, so a prop is not cut by the depth
  of the slice. A prop behind the slice is hidden by the slice where the
  slice covers it, as on the legacy stack viewport. The viewport does not
  clip a prop to its slab: an application that wants the cut sets clipping
  planes on the mapper of its prop. A prop does not move the fit of a reset,
  which is the fit of the display set.

- **Widgets.** `viewport.addWidget(widgetId, widget)`, `getWidgets()` and
  `removeWidgets()` are on the planar viewport as on the 3D viewport. The
  orientation marker of `OrientationMarkerTool` shows on a planar viewport
  and turns with the orientation of the view, in both modes.
- **Nothing of the renderer shows on the CPU.** A slice drawn on the CPU is
  drawn on a 2D canvas, and the vtk.js renderer is not drawn: a prop and a
  widget do not show. The viewport does not throw. It warns once, through
  the logger `cs3d.core.RenderingEngine.PlanarViewport`, with the number of
  props and widgets that do not show, and again after a later draw on the
  GPU and a new switch to the CPU.
- **A view that shows only a prop is a 3D viewport.** A planar viewport takes
  its camera from its display set and draws nothing without one. A view of
  vtk.js props alone, such as the output of `vtkImageCPRMapper`, is a
  `VOLUME_3D` viewport: `getRenderer().addActor(actor)`,
  `setViewState({ viewPlaneNormal, viewUp })`, `resetViewState()`.

## The render plan

Each layer of a planar viewport has a plan: how its slice is made, what draws
it, and why.

```ts
viewport.getRenderPlan();
```

```ts
[
  {
    dataId: 'ct',
    role: 'source',
    slice: 'cpu',
    draw: 'gpu',
    renderMode: 'vtkSampledSlice',
    reason: 'slice',
  },
];
```

`slice` is `frame`, `cpu` or `gpuVolume`. `draw` is `gpu` or `cpu`. `reason`
says why the layer is on this path: `frame`, `slice`, `slab`, `sliceFirstOff`,
`notSampled`, `floatFilter`, `textureSize`, `textureReduced`, `textureFailed`,
`slabTooLarge`, `pinned`, `noWebGL` or `contextLost`.

`Events.RENDER_PLAN_CHANGED` fires on the element and on the `eventTarget`
when the plan of a layer changes. Cornerstone changes the path of a layer by
itself only when the new path draws the same pixels. `retryGpu()` lets the
layers that left the GPU try it again.

## A viewport on the CPU shows the GPU picture

A viewport draws on the CPU when the device has no WebGL2, when a lost context
does not come back, or when the application pins it there. In 5.x that picture
differed from the GPU picture. In 6.0 both stack images and volume slices go
through one CPU draw step that follows the GPU:

- **Same colours and opacity.** It uses the colour tables of the GPU path.
- **The area around the image has the background colour of the viewport.** It
  was black.
- **The canvas that shows has the class `cornerstone-canvas`.** On the CPU a
  planar viewport draws into a second canvas and moves the class to it, as
  the legacy CPU stack viewport drew into the canvas of that class. So code
  that finds the canvas of a viewport by the class reads the picture.
  `viewport.canvas` stays the GPU canvas, and `viewport.getCanvas()` gives
  the canvas that shows. In 5.x a next viewport kept the class on the hidden
  GPU canvas.
- **The VOI lookup table and the modality lookup table of an image are not
  applied.** The GPU path never applied them, and the CPU path of 5.x did. The
  window of the image is applied as before.
- **A linear image is drawn once more, exactly, when the view rests.**
- **A mount draws once on the CPU.** The renders that `setDisplaySets` asks
  for while it mounts wait, and the viewport draws once when the mount ends,
  before `VIEWPORT_NEW_IMAGE_SET`, so a mount fires one `IMAGE_RENDERED`, as
  the legacy CPU stack viewport drew once in the frame of the rendering
  engine. The draw of a linear image at rest fires one more. In 5.x a next
  viewport drew at each render call, so a mount of a stack fired
  `IMAGE_RENDERED` three times.
- **A scroll of a stack draws once on the CPU.** While a stack loads the
  image of a new slice (`setImageIdIndex`, `scroll`, `utilities.scroll`, or
  `setViewState` with a slice), the renders that are asked for wait, and the
  viewport draws once when the image comes, as the legacy CPU stack viewport
  drew once with the new image. The draw of a linear image at rest fires one
  more `IMAGE_RENDERED`. When the load fails the viewport draws once with
  the image shown before. In 5.x a next viewport first drew the image shown
  before, so a scroll fired `IMAGE_RENDERED` up to three times.

Not equal yet: the outline of a labelmap is not drawn on the CPU, and a slab
through the whole volume is not drawn on the CPU.

## A labelmap fill is drawn with the configured alpha

A legacy volume viewport drew a labelmap as a volume, and the fill came out at
about half of the configured alpha: a `fillAlpha` of 0.5 looked like 0.26. The
next viewports draw the fill with the configured value, so segmentations look
stronger than on a legacy volume viewport. To get close to the old look, lower
`fillAlpha` and `fillAlphaInactive` in the labelmap style: 0.26 in place of
0.5.

The same holds for a colour layer with a numeric opacity, such as the PET
layer of a fusion: the opacity is applied as given.

## An opaque slice of a volume is drawn at its window

A legacy volume viewport drew a slice of an opaque volume, such as a CT,
darker than its window: at 92.5% of its grey for the PET and CT studies of
the examples, so white came out as 236 of 255, and at about 72% for volumes
of other bounds (the same weaker opacity as above, applied to an opacity of
1). This held with and without a `callback`. A next viewport draws the grey
of the window, as the legacy stack viewport did, so a CT shown as a volume is
a little brighter than in 5.x, alone and under the PET layer of a fusion. To
get the old look, give the CT `colormap: { opacity: 0.925 }` in its
presentation (`0.726` for the other bounds); with it a fusion matched the
legacy picture within two levels of 255.

## Image defaults

- **A MONOCHROME1 image starts inverted.** The photometric interpretation of
  the metadata decides, and each image of a mixed stack follows its own until
  the application sets `invert`.
- **An image without a window starts at its pixel range.** It was 0 to 255.
- **A volume without window metadata** starts at the window its layer draws
  with.

## Whole slide viewports

- **World points follow the coordinate system of the slide.** The row of a
  pixel was not flipped before the image orientation was applied, so a world
  point landed outside the slide. World points saved from a next whole slide
  viewport of 5.x show shifted in 6.0.
- **Canvas points are in CSS pixels at any device pixel ratio.** On a screen
  with a device pixel ratio of 2, `canvasToWorld` returned the point of
  another place on the slide.
- **The slide keeps the orientation that the microscopy viewer gives it.** The
  next viewport of 5.x set the rotation of the map to 0, so a slide could show
  turned by a quarter against the legacy viewport. The rotation of the view
  state is now a rotation on top of the orientation of the slide: 0 shows the
  slide as the legacy viewport does. `resetViewState()` takes a rotation back
  to 0, keeps the zoom and the centre, and fires `CAMERA_RESET`.
- **The rotation is in degrees,** as on a planar viewport. It was in radians.
  This holds for `setViewState({ rotation })`, for the `rotation` of a view
  presentation and for `getRotation()`, which now gives the rotation of the
  view state and no longer always 0.
- **The slide starts at the view that the microscopy viewer fits to the
  canvas,** as on the legacy viewport. The next viewport of 5.x wrote zoom 1,
  one fixed level of the pyramid, which is another view on a slide that is not
  square or on a canvas of another size. `getViewState().zoom` is undefined
  until a slide is mounted. A slide mounted in place of another one starts at
  its own fit and keeps the rotation.
- **Pan.** A view presentation carries `pan`:
  `viewportProjection.withPresentation(viewport, { pan })` returns the view
  state for a new pan, and `setViewState({ centerIndex })` moves the view in
  pixels of the slide. The viewport has no `getPan()` and no `setPan()`. The
  pan is measured from the centre of the slide: it is `[0, 0]` when the
  centre of the slide is at the centre of the canvas. The legacy viewport
  measured it from the view at mount.
- **Zoom.** In `viewportProjection` the zoom of a whole slide viewport is a
  factor against the fit, as on every family: 1 is the view at which the
  microscopy viewer fits the slide to the canvas at mount, and 2 shows the
  slide twice as large. `getZoom()`, `setZoom()` and `zoom` of the view
  state are the zoom level of the map of the microscopy viewer, which is
  another number: copy a zoom to a viewport of another family through
  `viewportProjection`.
- **Annotations saved on a legacy whole slide viewport show.** Their
  references carry a view plane normal and a plane restriction, which the next
  viewport of 5.x rejected.
- **`canvas`** is on the viewport, for code that reads the size. The
  microscopy viewer draws the slide, so the canvas holds no pixels of it.
  There is no `getCanvas()`.
- **The web client** of a slide falls back to the `WADO_WEB_CLIENT` metadata
  of its first image when the display set names none, as on the legacy
  viewport.
- **No `scroll()`.** A slide has no slices, and a zoom is
  `setZoom(zoom, canvasPoint)`. The legacy `scroll()` zoomed by a factor of
  1.1 for each step. `utilities.scroll` and the stack scroll tool do nothing
  on a whole slide viewport and do not throw, so the wheel of the stack
  scroll tool no longer zooms a slide. Put the zoom tool on the wheel.
- **`suppressEvents`** in the options silences `CAMERA_MODIFIED` and
  `CAMERA_RESET`, as on the legacy viewport.

## ECG viewports

- **Annotations saved on a legacy ECG viewport show.** Their references carry
  a view plane normal and a plane restriction, which the next viewport of 5.x
  rejected.
- **No `getNumberOfSlices()`.** An ECG is one record and has no slices. The
  legacy viewport gave 1. `scroll()` moves the time window, as in 5.x on the
  next viewport. The legacy `scroll()` did nothing.
- **`suppressEvents`** in the options silences `CAMERA_MODIFIED` and
  `CAMERA_RESET`.
- **An annotation is drawn on its own lead.** In a trace layout with several
  columns each lead shows a part of the record, and some leads show twice. A
  point is drawn in a cell of its own lead that shows its sample, and an
  annotation is hidden when no cell shows all of its points. In 5.x such a
  point was drawn in the cell of another lead.
- **The default trace layout differs from the legacy viewport.** The legacy
  viewport draws twelve rows of one lead. The next viewport draws three rows
  of four leads and a rhythm strip for a record of eight leads or more and
  five seconds or more. Set `traceLayout` in the options of the viewport or in
  its view state for another one.
- **`getContentDimensions()` follows the trace.** The size of the content is
  worked out from the sweep speed and the trace layout, so it changes with
  them. The legacy viewport worked it out from the number of samples and the
  sampling frequency alone. Code that sizes its element from it reads it
  again after a change of `sweepSpeed` or `traceLayout`.

## 3D viewports

- **A reset fits like the first mount.** `resetViewState()` zoomed out further
  than the first picture.
- **The first mount fits the camera in the orientation of the options,** also
  when a camera was written while the viewport showed nothing, as the reset
  of `TrackballRotateTool` on a resize does. In 5.x the next 3D viewport put
  that camera back after the fit, so it kept the default camera of vtk.js
  until `resetViewState()`, and that reset kept the wrong orientation. The
  legacy 3D viewport reset the camera at `setVolumes` in the same way.
- **A 3D viewport turns to the orientation of its options when it is made,**
  as the legacy 3D viewport did, so a surface or a prop of a tool that shows
  before any volume is seen from that side, and `resetViewState()` fits it
  there. In 5.x a next 3D viewport kept the camera of vtk.js until a volume
  was mounted; only the adapter turned it. The acquisition orientation, which
  needs a volume, and no orientation keep the camera of vtk.js, as on the
  legacy viewport.
- **`setViewReference()` moves the camera.** It did nothing, so a camera
  synchronizer between two 3D viewports did nothing.
- **A preset is a key of the presentation, and it stays.**
  `setDisplaySetPresentation(displaySetId, { preset: 'CT-Bone' })` applies a
  preset. A later change of the window, of
  `invert` or of the opacity rescales the colours that are there. In 5.x each
  presentation update rebuilt a grey ramp, so a preset was lost at the next
  change of the window.
- **The colour keys of the legacy `setProperties` are presentation keys:**
  `voiLUTFunction` (the legacy `VOILUTFunction`), `colormap` (with `name`,
  `opacityMapping` and `threshold`), `blendMode`, `sharpening` and
  `smoothing`.
- **`resetDisplaySetPresentation(displaySetId)`** goes back to what the volume
  showed after its mount. It does not move the camera: `resetViewState()`
  does.
- **Events.** `VOI_MODIFIED` and `COLORMAP_MODIFIED` fire from a 3D viewport,
  `VOI_MODIFIED` also when a volume is mounted, and
  `VOLUME_VIEWPORT_NEW_VOLUME` fires on a mount. None of them fired in 5.x.
  `PRESET_MODIFIED` does not fire, nothing listened to it. Read the preset
  with `getDisplaySetPresentation(displaySetId)?.preset`. The detail of
  `VOI_MODIFIED` has `invert` and no `invertStateChanged`, as on a planar
  viewport.
- **A surface is a display set.**
  `viewport.addDisplaySet(geometryId, { renderMode: 'vtkGeometry3d' })` mounts
  the surface of a geometry of the cache, `viewport.removeData(geometryId)`
  removes it, and its colour, opacity and visibility are its presentation.
  `geometryId` is the key that was given to
  `geometryLoader.loadAndCacheGeometry`, not `geometry.id`: for a mesh loaded
  from a URL the two differ, and `addDisplaySet(geometry.id)` throws. A
  3D viewport has no `addActor`, `addActors`, `setActors`, `removeActors` and
  `getActor`, and `ACTORS_CHANGED` is gone. `getActors()` stays and
  gives the actors of the display sets.
  [The 3D viewport](./3-api-map.md#the-3d-viewport) has the call for each
  member.
- **A surface shown first is fitted as a reset fits it.** When a surface is
  the first thing that a 3D viewport shows, the mount fits the camera with
  the fit and the view angle of 90 degrees of `resetViewState()`, as the
  legacy `setActors` and `resetCamera` did, so a later reset does not change
  the picture. In 5.x the mount used the fit of vtk.js, with a view angle of
  30 degrees and the bounding radius as the parallel scale, and the first
  `resetViewState()` changed the picture. A parallel scale that was set
  before that mount is lost: set it after the surface is mounted.
- **A reset fits a surface that reaches outside the volume.**
  `resetViewState()`, and the zoom and the pan against the fit, count a
  visible surface. The legacy viewport fitted the volume only, so such a
  surface was cut off. With every surface inside the volume the fit is as
  before.
- **A new colour of a segment shows on its surface.** The Surface
  representation of a segmentation mounts the surface of each segment as a
  display set, and the colour is its presentation. On the legacy viewport the
  colour of a surface that was in the scene did not change.
- **New points and polys of a surface show at the next render.** A 3D
  viewport draws them when they are other arrays, also of the same lengths,
  or the same arrays with another length (a face appended in place). The
  legacy viewport kept the old mesh when the lengths were the same. In 5.x
  the next 3D viewport drew other arrays only, not a face appended in place.
  Values changed in place, in the same arrays with the same lengths, do not
  show, as on the legacy viewport: give the surface new arrays.
- **A viewport that shows only surfaces says `'empty'`.** The tools mount a
  surface as an overlay, and `getCurrentMode()` answers for the source
  display set.
- **A prop of a tool belongs to the tool.** A handle or a line goes into the
  scene with `viewport.getRenderer().addActor(actor)`. The tool keeps the
  actor and removes it itself. `getActors()` does not list it, and a reset
  fits it only when the viewport shows no volume. The handles of
  `VolumeCroppingTool` leave the scene when the tool is disabled and come
  back when it is active again. On the legacy viewport they stayed.
- **Widgets.** The orientation marker shows on a 3D viewport. `addWidget`
  and `getWidgets` are on the 3D viewport and on the planar viewport, the two
  next viewports with a vtk.js renderer. No next viewport has `getWidget`:
  keep your own reference to a widget that you add.
- **One orientation marker for each viewport.** With the tool in two tool
  groups, each tool made a marker for the viewports of both groups. The
  first marker of each viewport stayed in the shared render window and drew
  in the corner of every viewport, so a view could show the marker of
  another view. Each tool now makes the markers of its own tool group only.
- **A labelmap shows in 3D.** In 5.x a Labelmap representation drew nothing
  on a next 3D viewport. A 3D viewport with a mounted volume takes a labelmap
  of its frame of reference, as a planar viewport in volume mode, also one
  derived from another series (a PT labelmap on a CT). Differs: polySeg makes
  a volume labelmap from contours or surfaces on a 3D viewport with a mounted
  volume. In 5.x it made a stack labelmap of the images of the volume there.
- **Zoom and pan.** Zoom 1 and pan `[0, 0]` are the fit of a reset. They are
  read and written through `viewportProjection`, as on every next viewport,
  and a 3D viewport has no `getZoom`, `setZoom`, `getPan` and `setPan`. The
  zoom is measured against the fit for the direction of the camera now. So
  it changes when the camera turns to a side where the content has another
  extent. The legacy members measured against the camera of the last reset.
  `resetViewState()` takes no `storeAsInitialCamera`.
- **The rotation is absolute also when the camera looks along the view up of
  rotation 0.** There that view up gives no direction, so the rotation of
  `viewportProjection` is measured from the view plane normal of the view of
  rotation 0: its opposite when the camera looks along the view up, the
  normal itself when it looks against it. That is where the view up turns to
  when the camera orbits there from the view of rotation 0, so the rotation
  keeps its value on that orbit, and the same rotation twice gives the same
  view.
- **`suppressEvents`** in the options of a 3D viewport silences its camera
  and presentation events, as on the legacy viewport.
- **No display area and no aspect ratio on a 3D viewport.** `setDisplayArea`,
  `getDisplayArea`, `setAspectRatio` and the `displayArea` and `aspectRatio`
  options are not carried over to the 3D viewport. Set the parallel scale and
  the focal point through the view state.
- **Perspective.** `ViewportType.PERSPECTIVE` is removed. A 3D viewport with
  `parallelProjection: false` in its options draws the volume in perspective,
  and `setViewState({ parallelProjection: false })` turns one to it. A
  parallel scale, a dolly, a reset, `canvasToWorld` and `worldToCanvas`
  answer as on a legacy 3D viewport made with that option. A zoom of
  `viewportProjection` moves the camera towards its focal point and keeps the
  focal point and the view angle, so the picture grows. The legacy `setZoom`
  changed the parallel scale, which a perspective picture does not use. The
  legacy `PERSPECTIVE` type was a slice
  viewport: it drew a thin slab from a camera that stood one bounding radius
  away with a view angle of 90 degrees, and `setZoom` did nothing on it.
  Nothing in the library used it.
- **The clipping range is fitted at every camera write,** to the bounds of
  every visible prop of the renderer, as the legacy 3D viewport fitted it at
  `setVolumes`, `setCamera` and `resetCamera`. In 5.x the next 3D viewport
  kept `[-1e6, 1e6]` after a mount and put back the range that came with the
  camera, so a volume or a surface in perspective could disappear after a
  zoom of `viewportProjection`, and a turn to perspective through the view
  state drew nothing until `resetViewState()`. `getViewState().clippingRange`
  gives the fitted range; a `clippingRange` given to `setViewState` is not
  applied.
- **The actor of one display set.** A volume input of the legacy API could
  carry an `actorUID` for `getActor(actorUID)`. A display set has no such
  option. `getActors()` gives the actor entries, and each one names its volume
  in `referencedId`.
- **No `callback` on a display set.** A legacy volume input could carry a
  `callback` that edited the actor. The presentation of the display set says
  how the data looks. These give the picture of the callbacks that the
  examples used:

  | The callback set                                            | Presentation                                                                             |
  | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
  | A CT window of -160 to 240                                  | `{ voiRange: { lower: -160, upper: 240 } }`                                              |
  | A PET window of 0 to 5, inverted, as a MIP                  | `{ voiRange: { lower: 0, upper: 5 }, invert: true, blendMode: MAXIMUM_INTENSITY_BLEND }` |
  | Colour and opacity points of its own, such as label colours | `{ preset, interpolationType }` with a preset object that holds the points               |

  A preset object has the keys of the entries of `CONSTANTS.VIEWPORT_PRESETS`:
  `colorTransfer` and `scalarOpacity` hold the points, and `shade: '0'` turns
  the shading off.

- **Small ones.** `getVolumeId`, `getImageIds` and `getImageData` answer for
  the volume that is asked for. A 3D viewport has no
  `isOrientationChangeable`, no `hasImageURI` and no
  `getIntensityFromWorld`.
  [The 3D viewport](./3-api-map.md#the-3d-viewport) has the calls that
  replace them.
- **`getFrameOfReferenceUID()` always returns a string,** as on a planar
  viewport.

## Video viewports

- **View references carry the view plane normal and the camera,** so
  annotations on a video get their statistics.
- **`NEW_IMAGE` fires for each frame while the video plays,** for the frame
  of a seek, and once at every mount for the frame that the mount shows (the
  first frame, or the frame of `options.frameNumber`), as a planar viewport
  fires it at every mount. The legacy video viewport fired its
  `STACK_NEW_IMAGE` at a mount too, twice, once for each of the two draws of
  the frame that its mount made. Its detail has the keys that a planar viewport
  gives: `imageIdIndex` is the 0-based index of the frame, `numberOfSlices`
  the number of frames and `imageId` the image id of the frame. `image` is
  undefined. The detail has no `time` and no `duration`, which the legacy
  video viewport put into `STACK_NEW_IMAGE`: read
  `viewport.getCurrentTime()`. The length of the media is `detail.duration`
  of `IMAGE_RENDERED` of a video viewport, beside `detail.time`;
  `Types.EventTypes.ImageRenderedEventDetail` does not type the two keys.
  `viewport.getNumberOfFrames() / viewport.getFrameRate()` is the length of
  the frames of the metadata, which can be shorter. The legacy video viewport fired
  `STACK_NEW_IMAGE` with each draw: on each animation frame while the video
  played, and on each render, pan, zoom, reset, resize and seek, also when
  the frame stayed the same. `NEW_IMAGE` does not fire for a pan, a zoom, a
  resize or a render: listen to `CAMERA_MODIFIED` for a pan or a zoom, and to
  `IMAGE_RENDERED` for a draw.
- **`options.frameNumber` of `setDisplaySets` is honoured.**
- **`voiRange` and `averageWhite` of the presentation are applied.**
- **`IMAGE_RENDERED` fires.** A next video viewport fires it when what it shows
  changes: a new frame, a seek, a pan, a zoom, a resize or a call of
  `render()`, at most once for each animation frame. The next video viewport
  of 5.x never fired it, so an annotation did not follow a pan or a zoom
  there. The legacy viewport fires one with every draw, so on every animation
  frame while a video plays.
- **The pixels of the frame.** `getImageData()` gives the pixels of the frame
  on display, as on the legacy viewport, so a probe and the ROI tools give
  statistics.
- **Four small members are gone:** `modality`, `getImageDataMetadata()`,
  `hasImageURI()` and `getSliceIndexForImage()`.
  [The video viewport](./3-api-map.md#the-video-viewport) has the calls that
  replace them.
- **A reference to a video without a frame is viewable on every frame.**
  `isReferenceViewable({ referencedImageURI })` is true for the URI of the
  video without a frame number. The URI of one frame is viewable on that
  frame, and the URI of a frame range on the frames of the range. With
  `{ withNavigation: true }` each of the three is viewable on every frame,
  which is the answer of the legacy `hasImageURI()`.
- **Frame range and playback.** Frame numbers start at 1. `play()` and
  `pause()` are on the viewport, and there is no `togglePlayPause()`: the
  application keeps whether the video plays. The frame range is the view
  state key `frameRange`: `viewport.setViewState({ frameRange: [5, 10] })`.
  Playback stays in the range, and a reset and a mount clear it. There is no
  `setFrameRange()` and no `getFrameRange()`. A change of the range is a view
  state change, so it fires `CAMERA_MODIFIED`.
- **The scroll step is the view state key `scrollStep`:**
  `viewport.setViewState({ scrollStep: { value: 4, unit: Enums.VideoEnums.SpeedUnit.FRAME } })`,
  or `SpeedUnit.SECOND` for seconds, in place of `setScrollSpeed(4)`. Each
  step of `scroll()`, of `utilities.scroll` and of the stack scroll tool
  moves that far, and `getNumberOfSlices()` and `getSliceIndex()` count in
  steps, as with the legacy scroll speed. A reset and a mount keep it. The
  steps divide the number of frames of the metadata; the legacy viewport
  divided the length of the media times the frame rate, which can be a few
  frames more, so a long drag of the stack scroll tool can end one step
  apart.
- **A write of the view state keeps the time of a playing video.**
  `getViewState()`, `getResolvedView()`, `setViewState()` and
  `resetViewState()` read the time of the media first, so a pan, a zoom, a
  new scroll step or a reset while the video plays does not move it back to
  the last time read, as on the legacy viewport. In 5.x such a write could
  set the video back by up to the time since that read, about one animation
  frame while it played.
- **`setPlaybackRate()` sets the rate only.** On the legacy viewport it also
  started playback, and paused below a rate of 0.0625.
- **An annotation over a range of frames shows on every frame of the range.**
  In 5.x it showed on its first frame only. `getViewReference()` gives a range
  while a video plays inside a frame range.
- **Rotation.** The video turns about the centre of the canvas, and
  `canvasToWorld` and `worldToCanvas` follow the rotation. In 5.x the video
  turned about its top left corner and the two transforms ignored the
  rotation, so annotations landed beside the picture.
- **`invert`** of the presentation is applied.
- **`canvas`** is a canvas of the size of the viewport. It is a plain field
  that holds no pixels of the frame, and there is no `getCanvas()`. The
  pixels of the frame come from `getImageData()`.
- **A video opens on its first frame,** or on `options.frameNumber`, and
  does not play to get there. In 5.x it could open on the second frame.
- **`getPan()` and `setPan()` are in canvas pixels on the screen,** `[0, 0]` at
  the fit, as on the other next viewports, and a drag of the pan tool moves
  the picture with the mouse at any rotation.
- **`suppressEvents`** in the options silences `CAMERA_MODIFIED` and
  `CAMERA_RESET`.
- **A labelmap over a video** is not available. It is not available on the
  legacy viewport either: both throw. No 5.x release showed one, from 5.0.0
  to 5.18.2: the legacy video viewport throws when the labelmap is mounted.
  Contour segmentations show.

## Tools on the next viewports

- **The slab thickness synchronizer reads the presentation.** A change of
  `slabThickness` in the presentation of a next planar viewport fires
  `CAMERA_MODIFIED`, as a slab change of the legacy volume viewport did. The
  synchronizer then gives the slab of the source display set of the source
  viewport to every display set of each target. A source that shows a stack
  gives no slab, as the legacy synchronizer took none from a stack viewport,
  and each viewport is read from its own rendering engine.
- **The camera position synchronizer copies a view reference.** On a next
  target it sets the view reference of the source, and its zoom and pan.
- **A synchronizer keeps apart the options of two rendering engines whose
  viewports have the same id.** `setOptions` and `getOptions` of a
  synchronizer take the id of the rendering engine as a last argument,
  which can be left out:
  `synchronizer.setOptions(viewportId, options, renderingEngineId)` and
  `synchronizer.getOptions(viewportId, renderingEngineId)`. Options set
  with it are those of the viewport of that rendering engine and go before
  the options set without it, which are those of the viewport id in every
  rendering engine, as in 5.x. The image slice and the zoom and pan
  synchronizers read the options of a target with its rendering engine id.
  In the same way `utilities.spatialRegistrationMetadataProvider` takes
  the rendering engine ids after the viewport ids: `add(query, matrix)`
  with the query
  `[viewportId1, viewportId2, renderingEngineId1, renderingEngineId2]`
  adds a registration for the viewports of two rendering engines, and
  `get('spatialRegistrationModule', ...query)` gives it before the one
  added for the viewport ids alone. The image slice synchronizer asks so,
  and `utilities.calculateViewportsSpatialRegistration` adds its
  registration with the rendering engine ids only, so a pair of other
  rendering engines does not take it and calculates its own. Asked with the
  viewport ids alone, `get` gives the last registration added for them, with
  or without rendering engine ids, as in 5.x. In 5.x two
  rendering engines whose viewports had the same id shared the options and
  the registrations. A synchronizer with `eventSource: 'eventTarget'` takes
  the source of an event from its `renderingEngineId` and `viewportId`; an
  event with a `viewportId` alone that several rendering engines have is
  ignored. In 5.x such an event came from the first rendering engine with
  that viewport id. The presentation view synchronizer reads the source
  viewport from its own rendering engine; in 5.x it read it from the
  rendering engine of the target.
- **`utilities.getImageLegacy(element)` of the core is gone.** Use
  `cache.getImage(viewport.getCurrentImageId())`.
- **`AdvancedMagnifyTool` resets on a stack of images of several sizes.** It
  compares the rows, the columns and the number of components of the image
  of `NEW_IMAGE` with the image before.
- **The magnifying glasses show their viewport as it is drawn.** The loupe
  of `MagnifyTool` and each glass of `AdvancedMagnifyTool` are next planar
  viewports with the display sets of their viewport, overlays too, each
  with its presentation, and with the slice, the orientation, the rotation
  and the flips of the view. A glass also shows the labelmaps. The zoom and
  the place are as before: the loupe spans `1 / magnifySize` of the world
  height of the viewport, and a glass `1 / zoomFactor` of the width of the
  viewport over its own width. Differs: the legacy glass did not turn and
  flip with its viewport (measured on a legacy stack viewport turned and
  flipped, it showed the image unturned and unflipped; on a legacy volume
  viewport it took the rotation and not the flips), and it gave the
  presentation of the first volume only (read in the code). The legacy loupe
  showed the image of a stack alone, without the overlays of a fusion. The
  loupe and the glasses keep the stretch of their viewport (a `scale` of two
  different values, a `fitAspect` scale mode or a display area that
  stretches): one pixel spans the same world height as before, and its
  world width keeps the ratio of the viewport. The legacy loupe and glass
  dropped it: on a legacy stack viewport with `setAspectRatio([2, 1])` they
  showed the image unstretched.
- **`MIPJumpToClickTool` works in volume mode.** On a stack it finds no
  point, and it does not throw.
- **`CrosshairsTool` and `VolumeCroppingControlTool` leave a viewport that
  reset itself.** On its `CAMERA_RESET` they reset the views of the other
  viewports of their group, and not that one again, so
  `viewport.resetViewState({ resetOrientation: false })` keeps its
  orientation. The legacy tools reset it again with its orientation, and the
  legacy volume viewport did not keep an orientation on that reset anyway.
  `resetCroppingSpheres(element)` takes the element of a viewport that it
  leaves; without one it resets every view, as before.
- **A brush on a stretched view fills a shape that looks round on the
  screen,** in stack mode and in volume mode. The brush strategies read the
  scale pair of the view state.
- **`utilities.AnnotationMultiSlice` of the tools** sets a range of images
  of a stack, a range of slices of a volume in its acquisition orientation,
  and a range of frames of a video, on the next viewports. An annotation over
  a range of images of a stack shows on every image of the range, as on the
  legacy stack viewport. On a volume the tools draw an annotation by where it
  lies, so a range does not spread it over the slices, as on the legacy
  volume viewport.
- **The zoom and pan tools go through `viewportProjection`** on a next
  viewport. On a 3D viewport the zoom limits of the zoom tool apply and the
  zoom goes to the mouse, the zoom and pan synchronizer moves a 3D target,
  and the VOI synchronizer reaches a 3D target when the event names a
  volume. On a whole slide viewport the limits are factors against the fit
  too. On an ECG and on a whole slide viewport a wheel step or a drag of the
  zoom tool zooms by another amount than on the legacy viewports, which the
  tool zoomed through their camera.
- **The `PanTool` options `ignoreX`, `ignoreY`, `ignoreZ` and
  `limitToViewport` work on a next viewport,** as on the legacy viewports.
  With an ignored axis the picture moves by the canvas delta of the world
  delta of the drag with that axis at zero. With `limitToViewport` a drag
  that would take the picture out of the canvas, or uncover the canvas when
  the picture is zoomed in, does not move it. In 5.x the four options did
  nothing on a next viewport. Differs: the limit reads the move with the
  ignored axes at zero, so with `ignoreX` a drag right and down moves a
  picture that touches the right edge down. The legacy viewports read the
  whole drag and did not move it.
- **A zoom keeps a stretch.** On a planar viewport with a scale pair, the
  zoom tool, the zoom and pan synchronizer and the undo of a zoom multiply
  both axes.
- **The tools no longer fall back to the legacy members of a viewport.**
  `ZoomTool` zooms and pans only through `viewportProjection` (no
  `getCamera` or `setCamera`). The presentation view, camera position and
  zoom and pan synchronizers read and write only through
  `viewportProjection` (no `getViewPresentation` or `setViewPresentation`).
  The slab thickness synchronizer reads and writes only the presentation of
  display sets (no `getSlabThickness` or `setSlabThickness`). A labelmap on
  a viewport that shows a volume is mounted only as an overlay display set
  (no `addVolumes`, and edge projection no longer puts the labelmap into the
  volume actor as a second component), and an old labelmap actor goes with
  `removeData` (no `removeActors`). Every 6.0 viewport already took these
  paths. A viewport class of the application, registered with
  `registerViewportType`, that has only the legacy members gets nothing
  from these tools.

## The viewport type that a tool gets

This is for authors of tools outside the repository.
`enabledElement.viewport`, `renderingEngine.getViewport(viewportId)` and
`renderingEngine.getViewports()` give a `Types.IViewport`: the interface of a
viewport of any family, with the members that every family has. In 5.x the
enabled element typed its viewport as `Types.IStackViewport |
Types.IVolumeViewport`, also when it was a 3D, video, whole slide or ECG
viewport. A TypeScript tool that calls a member of one family on it, such as
`getCurrentImageId`, `getImageData`, `getActors` or `canvas`, gets a compile
error. Narrow first:

```ts
const { viewport } = enabledElement;

if (utilities.viewportSupportsDisplaySetPresentation(viewport)) {
  const dataId = viewport.getSourceDataId();
}

if (utilities.viewportSupportsImageSlices(viewport)) {
  const imageId = viewport.getCurrentImageId();
}

if (utilities.getViewportContentMode(viewport) === 'stack') {
  const planar = viewport as PlanarViewport;
}
```

Or ask the rendering engine for the class:
`renderingEngine.getViewport<PlanarViewport>(viewportId)`. A JavaScript tool
behaves as before: a planar member called on a 3D viewport fails at run time,
as it did in 5.x. `utilities.isGenericViewport` is true for every viewport
and is deprecated.

## Smaller changes

- **`viewport.type` is the plain string.** A planar viewport has the type
  `'planar'` where a 5.x next viewport had `'planarNext'`, and the other
  families have `'volume3d'`, `'video'`, `'wholeSlide'` and `'ecg'` in place
  of `'volume3dNext'`, `'videoNext'`, `'wholeSlideNext'` and `'ecgNext'`. A
  comparison with `ViewportType.PLANAR` or `ViewportType.PLANAR_NEXT` holds
  as before, since both are `'planar'`. Code that compares `viewport.type`
  with the string `'planarNext'`, or stores it and reads it back, changes to
  `'planar'`. The `viewportType` of a projection snapshot is the same plain
  string. See [Viewport types](./3-api-map.md#viewport-types).
- **No `setOptions()` and no `reset()`** on the 3D, video, whole slide and ECG
  viewports. The options that a viewport was made with are in
  `defaultOptions`, and they do not change. Change the view through the view
  state, and the look through the presentation. A planar viewport still has
  `options`, `setOptions()` and `reset()` from 5.x. Do not use them in new
  code.
- **`isDestroyed` in place of `isDisabled`.** `viewport.isDestroyed` is true
  after `disableElement`, on every family, and it is read only. A next
  viewport has no `isDisabled`.
- **`suppressEvents` is an option.** `viewport.defaultOptions.suppressEvents`
  holds it. A planar and a 3D viewport also keep the field. A video, a whole
  slide and an ECG viewport do not.
- **The slice questions answer for a stack and for a volume.** The slice on
  display, the planes of the slices, the acquisition plane and a jump to a
  world point are functions that take the viewport, and they work in both
  modes. See [the map](./3-api-map.md#members-of-the-volume-viewport-only).
- **A resize keeps the view** of a video and an ECG viewport. The legacy
  viewports fitted the picture again.
- **`isReferenceViewable` takes the points of an annotation** in the option
  `points`, and the annotation filter of the tools passes the handle points
  of each annotation. A viewport that shows a part of its world in several
  places uses them.
- **16-bit textures:** a scale error of up to one grey level at a normal
  window is fixed on GPUs with 16-bit normalised textures.
- **`AnnotationMultiSlice.setViewportFrameRange`** sets the range. It passed
  two numbers where the viewport takes an array.
- **`rendering.planar.cpuVolume.useViewportSamplingForLinear`** has no effect.
  There is one sampler for the CPU and the GPU.
- **New:** `utilities.runDrawSelfTest()` draws a known image and reads it
  back, to tell whether the device draws 16-bit data right.
