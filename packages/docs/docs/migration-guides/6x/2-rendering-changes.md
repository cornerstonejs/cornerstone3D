---
id: rendering-changes
title: Rendering changes
summary: What a 6.0 viewport draws and answers differently from 5.x - slice first, the render plan, the CPU picture, orientation, slabs, appearance, events, labelmap fill, image defaults, and the whole slide, ECG, 3D and video viewports
---

# Rendering changes

**State: in the code.** Everything on this page is about the next viewports
(the Generic viewports that 5.x had as an opt-in), which are the only
viewports of 6.0. The legacy viewports
that the page compares with are those of 5.x, which 6.0 no longer has, see
[Next viewports only](./1-next-viewports-only.md).

This page says what differs. For the call that replaces a legacy call, see
[Every legacy call and what replaces it](./3-api-map.md).

The samples type the event in the listener so that the detail reads
clearly. On a DOM element in a TypeScript project with `strict`, pass such a
listener as `((evt: Types.EventTypes.NewImageEvent) => { ... }) as EventListener`,
as the examples of this repository do: the DOM types the parameter of a
listener as `Event`.

## Slice first is on by default

A planar viewport that shows one slice of a volume no longer puts the whole
volume in a 3D texture. The CPU cuts the slice out of the frames it already
holds, and the GPU draws that 2D image. The 3D texture is made only when a
layer asks for a slab (a MIP, for example) or for 3D.

What changes for an application:

- **GPU memory is much smaller** for plain slices, and a volume that is too
  large for a 3D texture on the device still shows.
- **A plain volume slice is a CPU slice drawn on the GPU.** Its layer in
  `viewport.getRenderPlan()` has `slice: 'cpu'` and `draw: 'gpu'`; a slab
  has `slice: 'gpuVolume'`. The render plan is the one public way to ask how
  a layer is drawn: the render mode names (`ActorRenderMode`, the
  `actorMapper` of an actor entry) are gone, see
  [The render plan](#the-render-plan).
- **The edge pixels of a slice can differ between the two GPU paths.** The
  GPU volume path leaves an edge pixel whose centre lies outside the volume
  with the background, and shows a pixel that the slice covers in part with
  a part of its value. The CPU slice, drawn on the GPU and on the canvas, clips a
  tilted slice at the pixel centre, and shows an edge pixel of a slice along
  a volume axis with the share of it that the slice covers (the CPU takes the
  4 samples of a 4x multisampled GPU picture, so a GPU without multisampling
  can differ from it there by one pixel).
- **Float data stays float on devices that cannot filter float textures.**
  `canRenderFloatTextures()` returns true while slice first is on, so a PET
  volume keeps its float values there. Where such a layer does go to a float
  3D texture (a slab, or 3D), it is drawn with nearest filtering.

`rendering.planar.sliceFirst: false`, or `setSliceFirst(false)` at run time,
turns it off. The `sliceFirst` option of one display set wins over both.

### How the CPU cuts the slice of a volume

The rule follows the axes of the volume itself, the frame axis (the axis
along which the frames, the images of the series, are stacked) and the two
axes of a frame, whatever the orientation of the patient: an axial view of
a sagittal series is a plane across its frames, a sagittal view of it is its
acquisition plane.

- **The acquisition plane** (the view normal along the frame axis, on a
  frame) is the frame as the volume holds it: nothing is sampled and nothing
  is copied; the GPU uploads the array of the frame. While the volume loads,
  each arriving frame of the plane is shown the same way. One copy, a gather
  of the frame, is still made when the frame is seen from its back (its rows
  then run the other way) and when the frame is held in another array type
  than the volume's. A frame decoded at a lower resolution (a sub-resolution
  decode) is scaled to the grid once, when it arrives, and that copy is
  shown.
- **The two other planes of the grid** (the normal along one axis of a frame)
  are gathered from the frames, one row of the slice per frame: a row is a
  run of the frame (`TypedArray.set` of a part of it) where the plane runs
  along the rows of the frame, and a column of the frame where it runs along
  its columns. Only the rows of the frames that have arrived are gathered;
  the frames that have not are not read, and their rows hold zeros. While the
  volume loads, a frame that arrives changes its one row: that row is
  written, and only that row of the texture is uploaded.
- **A plane none of whose frames has arrived** (the mount of a pane before
  the first frame of a streaming volume, or a plane whose frames come later)
  is not read, nothing is allocated for it and nothing is uploaded: the layer
  shows nothing, only the background of the pane, until the first frame of
  the plane arrives, which is drawn at the next animation frame. The pane
  reports its render and fires its events as before (`IMAGE_RENDERED`,
  `NEW_IMAGE`, `DISPLAY_SETS_CHANGED`, `CAMERA_MODIFIED`), and its camera is
  the same. 5.x and the earlier 6.0 betas showed a slice of zeros through the
  window of the layer there, a grey square for a CT. This holds for the GPU
  backend; the CPU backend draws a volume once it holds a frame, and draws
  zeros for the frames that have not arrived.
- **The first frame of such a plane only uploads its slice**: after the
  first picture of the pane, in a task of background priority, the engine
  draws the pane once into its WebGL context, without showing it and without
  an event, with each layer that has no slice yet as an image of one texel
  that covers no pixel. vtk.js then compiles the programs of the layers,
  makes their colour and opacity textures and, for a translucent overlay, the
  buffers of its pass, which it did in the frame of the first slice before.
  A first frame that comes before that task builds them in its own frame,
  as before. The update of a load and the render that it asks for are one
  animation frame (the engine runs the update at the start of its frame),
  where the render came one frame after the update before; this holds for the
  volume slice path of the 3D texture too. A layer of this path that has no
  opacity ramp has an opacity function of 1
  (`actor.getProperty().getScalarOpacity(0)`), where it had none: vtk.js
  keeps one opacity texture per function, and made a new one at every slice
  of a layer with none. The pixels are the same.
- **NEAREST and LINEAR give the same values on the grid**: the interpolation
  type does not choose another path for these planes; the GPU filters the
  texture when it enlarges it.
- **An overlay on another volume's plane** (a PET over a CT) keeps its own
  grid in its plane, as a texture that the GPU scales; along the normal it is
  the mix of its two planes of voxels on either side of the plane (LINEAR) or
  the nearest one (NEAREST), a mix of two gathered planes.
- **Only an oblique plane, a volume whose axes do not follow the view, or a
  slab** goes through the general sampler (`utilities.sampleVolumeSlice`).

What this costs for one 512 x 512 x 135 CT: the acquisition plane copies 0
bytes per arriving frame and reads its 262,144 values once for their range;
a sagittal or coronal plane writes and uploads 1 kB (one row of 512 values)
per arriving frame, where it gathered and uploaded the whole 512 x 135 slice
at each update before; a pane mounted before the first frame reads and
allocates nothing, where it allocated, wrote and uploaded a slice of zeros
(1 MB for the axial plane). In the ten panes of OHIF's TMTV layout (a page
bundled as OHIF bundles Cornerstone, Apple M2 Ultra), the first content of
the CT panes comes 104 ms after the mounts (134 ms when the first slice still
built them, 65 ms in 5.18.3, which builds its 3D textures and programs in its
mounts and shows its first picture 16 ms later), 22 ms after the first CT
frame (54 ms).

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
handles set `slabThickness` in the appearance of the other viewports, and
the slab lines show it. With `autoPan` it pans a viewport whose centre would
leave the canvas. Against the legacy volume viewport:

- The tool sets no blend mode. Set `blendMode` in the appearance of each
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

## The slice grid of a volume view

The slices of a view of a volume lie on one grid along the view normal: the
scroll, the snap, the reported index, `getNumberOfSlices()`, the default
slice, a view reference and the cut of a surface all use it. The
[volume slice navigation specification](../../specs/core/volume-slice-navigation/implementation.md)
defines it. In short, with `n` the view normal and `min` and `max` the
smallest and the largest projection of the centres of the corner voxels:

- the step `s` is the thickness of one voxel along `n` (the default of
  `rendering.sliceStepMeasure`, `'l1'`);
- the view has `M + 1` slices, `M = round((max - min) / s)`;
- slice `k` lies at `start + k * s`, `start = min + (max - min - M * s) / 2`,
  so the grid is centred on the volume;
- a view that asks for no slice opens on slice `floor((M + 1) / 2)`, the
  middle slice counted along the view.

So a one-step traversal shows each voxel on exactly one slice, in every
orientation, and a brush fill on one oblique slice no longer shows on the
next and the previous slice
([#2912](https://github.com/cornerstonejs/cornerstone3D/issues/2912)).

What changes for an application:

- **A view along a volume axis keeps its slices.** An axial, sagittal or
  coronal view of an axial series has one slice for each plane of voxels, at
  the voxel centres, as before: the positions and `getNumberOfSlices()` do
  not change.
- **A view with an even number of slices opens one slice further, where its
  normal points against the volume axis.** The default slice is
  `floor(N / 2)` in view order, where 6.0.0-beta.2 and the legacy
  `resetCamera` took `floor(N / 2)` in volume order. A coronal view of a
  512 x 512 x N axial CT (normal `[0, -1, 0]`) opens on index 256, at
  `j = 255`, where it opened on index 255 (`j = 256`); an axial view of an
  even number of slices (normal `[0, 0, -1]`) and the acquisition view of an
  even count move the same way. A sagittal view and every view of an odd
  count open where they did. The OHIF `'middle'` preset and the default now
  agree. `resetViewState()` keeps the slice, as before.

  ```ts
  // Before (6.0.0-beta.2): a coronal view of 512 slices opened on 255
  // After: it opens on 256, the middle slice in view order
  const middle = Math.floor(viewport.getNumberOfSlices() / 2);
  viewport.getCurrentImageIdIndex() === middle; // true after a mount
  ```

- **An oblique view has fewer slices, on another grid.** The step was the
  length of the projected spacing (`'l2'`), which is shorter than one voxel
  for an oblique normal; the step is now the voxel thickness. A view tilted by
  45 degrees between two axes of 1 mm has a step of 1.41 mm where it had 1 mm,
  so about 30 % fewer slices, and its slices lie on the grid centred on the
  volume. A slice index of an oblique view that an application stored names
  another position now. Store a view reference with its point instead
  (`viewport.getViewReference()`, which has `cameraFocalPoint` and
  `viewPlaneNormal`), and give it to `setViewReference` later. To convert a
  stored index `k` of the old grid, take its point `min + k * l2` along the
  normal, with `l2 = utilities.getSpacingInNormalDirection(volume, normal)`
  and `min` the smallest projection of the corner voxel centres, and go to
  that point:

  ```ts
  // Before: an index stored for an oblique view
  viewport.setImageIdIndex(storedIndex);

  // After: a point stored for the view
  viewport.setViewReference({
    FrameOfReferenceUID: viewport.getFrameOfReferenceUID(),
    viewPlaneNormal: stored.viewPlaneNormal,
    cameraFocalPoint: stored.cameraFocalPoint,
  });
  ```

- **`rendering.sliceStepMeasure` is `'l1'` by default.** `'l1'` steps by the
  thickness of one voxel along the normal; `'l2'` by the length of the
  projected spacing, the step of 5.x and of the 6.0 betas. Both give the same
  slices along a volume axis. `'l2'` stays an option: an oblique view then
  has the old count and step, on the centred grid, and two adjacent oblique
  slices show some of the same voxels.

  ```ts
  init({ rendering: { sliceStepMeasure: 'l2' } }); // the step of 5.x
  ```

- **`utilities.snapFocalPointToSlice` snaps to the centred grid** of the range
  and the step it is given: for a range that is not a whole number of steps
  its first frame lies `(range - M * step) / 2` past `min`, where it lay at
  `min`. `scrollSlabs` and the scroll by another volume step on that grid.
- **`utilities.getTargetVolumeAndSpacingInNormalDir` gives the voxel
  thickness** along an oblique normal, so an annotation of the tools shows on
  an oblique slice when it lies within half a voxel thickness of it, one
  slice only.
- **`getSlicesClippingPlanes` gives one entry for each slice of the grid,**
  so the cut of a surface (a contour segmentation on an MPR view) is the cut
  of the slice on display, also for an oblique view.
- **`utilities.getVolumeSliceGrid` gives the grid of a view before a
  mount.** For a volume (`volumeId` of a volume in the cache, or `imageIds`,
  whose `imagePlaneModule` metadata gives the geometry: no pixel is loaded)
  and an orientation (`ACQUISITION`, `AXIAL`, `SAGITTAL`, `CORONAL` or view
  vectors) it gives `numberOfSlices`, `step`, `defaultSliceIndex`,
  `defaultSliceWorldPoint`, `viewPlaneNormal`, `viewUp`,
  `getSliceWorldPoint(k)`, `getSliceIndex(point)` and
  `getViewReference(k)`. It runs the slice basis and the grid of the
  viewport, so its answers are what a viewport reports after a mount with no
  start: `getNumberOfSlices()`, `getSliceIndex()`, the camera focal point.
  `getViewReference(k)` names the point and the plane of slice k and no
  volume or slice index, so a mount of any volume of the frame of reference
  takes it as `initialViewReference` and starts on its slice nearest to that
  point. The grid and the slice step were internal before (no public way to
  know them before a mount).

  ```ts
  const grid = utilities.getVolumeSliceGrid({
    volumeId: ctVolumeId,
    orientation: Enums.OrientationAxis.CORONAL,
  });

  grid.numberOfSlices; // 512 for a 512 x 512 x N axial CT
  grid.defaultSliceIndex; // 256
  ```

### A series tilted less than half a slice

A request for a standard orientation (`OrientationAxis.AXIAL`, `SAGITTAL` or
`CORONAL`) shows the acquired images when the series is tilted from that
orientation so little that the plane of an image moves by less than half a
slice across the image (`utilities.isAcquisitionPlaneNormal` on the frame
geometry: rows, columns, the pixel spacing, `spacingBetweenSlices` or
`sliceThickness`). 6.0.0-beta.2 showed the acquired images only for an
exact alignment and reformatted a tilt of 0.2 degrees. A larger tilt, such as
a sagittal MR tilted by 13 degrees, shows the true axis, reformatted, as
before and as the legacy volume viewport did. Images that cannot form a
volume stay on the image path for any standard orientation. To see the
acquired images of a tilted series, ask for `OrientationAxis.ACQUISITION` or
give no orientation.

## Orientation of a volume

- **A requested axis is the true axis.** A viewport asked for `AXIAL`,
  `SAGITTAL` or `CORONAL` shows that plane, also on a series that was acquired
  tilted, as the legacy volume viewport does. `ACQUISITION` shows the plane of
  the acquisition. The next viewport of 5.x opened a tilted series on its
  acquisition plane when the closest axis was asked for. A series that is not
  tilted is not affected: there the axis is a slice of the acquisition.
- **A requested axis has the camera of its name.** `AXIAL`, `SAGITTAL` or
  `CORONAL` at the mount of a volume gives the camera of `MPR_CAMERA_VALUES`,
  also on a series whose images face another way (rows or columns that run
  against the patient axis, slices in the other direction), as the legacy
  volume viewport does. The next viewport of 5.x gave the acquisition camera
  when the axis was the axis of the acquisition, so such a series showed
  mirrored or turned. Where the two cameras are the same,
  `getViewState().orientation` is `acquisition` after the mount, as in 5.x;
  otherwise it keeps the name. A stack shows its images in their own plane
  whatever the name, as the legacy stack viewport does.
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
- **A stack has one orientation.** A display set mounted without a mode
  shows as a stack in its acquisition plane, with or without a `volumeId`.
  Mounted with another orientation, the viewport shows the images as a volume
  when they form one, and the mount throws when they do not. After the mount, `setOrientation` and
  `setViewState({ orientation })` change nothing on a stack and do not throw,
  and the view state keeps its orientation.
  `canRenderOrientation(orientation)` tells before the call: for a mounted
  stack it is false for every orientation but the acquisition.
- **A flip is a flag of the view state.** The legacy volume viewport flipped
  by moving its camera to the other side of the slice, so its view plane
  normal turned around. A next viewport keeps `flipHorizontal` and
  `flipVertical` in the view state and mirrors the picture.
- **A flip comes before the rotation, as on the legacy viewports.** A view
  with a rotation and a flip shows the image flipped, then turned by the
  rotation, clockwise on the screen. So
  `setViewState({ rotation: 30, flipHorizontal: true })` gives the view up
  `[0.5, -0.866, 0]` of the legacy
  `setViewPresentation({ rotation: 30, flipHorizontal: true })` on an axial
  view, and reads back rotation 30. A flip written alone, by `setViewState`
  or by `viewportProjection.withFraming`, mirrors the picture on the
  screen, as the legacy `flip`, `setCamera` and `setViewPresentation` did:
  on a turned view the rotation becomes 360 minus the rotation for each flip
  that changes, so rotation 30 and then `flipHorizontal: true` reads
  rotation 330. In 5.x a next viewport turned first and flipped after, and
  kept the rotation on a flip: a view state with a rotation and one flip now
  shows the picture turned the other way. To show such a stored view state
  as 5.x did, write `360 - rotation` with it.

## Slabs and scrolling

- **A slab thickness draws the same slab as on a legacy volume viewport.**
  Measured with a maximum intensity and an average slab: the same number
  reaches as far on both.
- **A slab with the composite blend mode draws as an average.** The legacy
  volume viewport casts rays through the slab, so voxels in front hide what
  lies behind them.
- **Scrolling by slabs is an option.** `viewport.scroll(1)` on a legacy volume
  viewport with a slab steps by the slab thickness. On a planar viewport it
  steps by one slice. Pass `scrollSlabs: true` to `utilities.scroll` or to
  `viewport.scroll(delta, { scrollSlabs: true })` to step by the slab.
  `getCurrentImageIdIndex()` and `getNumberOfSlices()` take no arguments and
  count slices. No member counts the slab steps; the detail of
  `SCROLL_OUT_OF_BOUNDS` does (see
  [Scroll and its event](#scroll-and-its-event)).
- **A slab is set for each display set.** `slabThickness` and `blendMode` are
  keys of the appearance of one display set. The legacy `setSlabThickness`
  set all actors. A change of `slabThickness` fires
  `DISPLAY_SET_APPEARANCE_CHANGED` with `slabThickness` in `changedKeys`, and
  no `CAMERA_MODIFIED`, where the legacy member fired `CAMERA_MODIFIED`. No
  appearance change fires a camera event.
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
  `slabThickness` of the appearance of the source display set, as the
  legacy `getProperties().slabThickness` was. In 5.x a next viewport gave the
  spacing of the volume. Without a `volumeId` (`targetId` undefined), the
  volume is still the one with the finest spacing, and `useSlabThickness`
  gives the slab as well. In 5.x that call gave the spacing of the volume on
  every viewport, the legacy volume viewport too.
- **An average slab shows in the fidelity.** An average slab in the
  appearance of the source display set sets the display resolution of
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
- **`jumpToSlice` with a `volumeId` counts the slices of that volume.**
  `utilities.jumpToSlice(element, { imageIndex, volumeId })`, with the id of
  another volume that the viewport shows in volume mode, goes to slice
  `imageIndex` of that volume along the view, and clips the index to its
  slices. In 5.x the index counted the slices of the source volume while
  each step went by the spacing of the named volume, so the jump landed
  elsewhere.

## Scroll and its event

- **One scroll.** `utilities.scroll(viewport, options)`,
  `viewport.scroll(delta, options)` of a planar viewport and
  `viewport.scroll(delta, debounceLoading, loop)` of a video viewport go
  through one function, so one request gives the same position and the same
  event by each of them. A planar viewport takes the options of
  `utilities.scroll`: `loop`, `scrollSlabs` and `volumeId`. In 6.0.0-beta.2
  `viewport.scroll` took the delta only, stopped at an end and fired nothing.
- **`SCROLL_OUT_OF_BOUNDS` fires when a scroll stops at an end.** A scroll
  without `loop` that stops at the first or the last position, short of the
  position it asked for, fires it once on the element of the viewport and
  once on `eventTarget`, after the viewport moved. A position is an image of
  a stack, a slice of a volume along the view in any orientation, a slab with
  `scrollSlabs` while the source has one, a slice of the volume that
  `volumeId` names, or a frame of a video, which a step of its `scrollStep`
  moves by. An event of the core does not bubble: a listener added on the
  element and a listener added on `eventTarget` both hear it, so a 5.x
  listener on `eventTarget` keeps working once its event has the new name.
  `StackScrollTool`, cine and `utilities.jumpToSlice` scroll through the same
  function; cine and a jump never ask past an end, so they fire nothing.
- **Nothing fires for a scroll inside the range, or with `loop`.** With
  `loop` the scroll wraps around. `CAMERA_MODIFIED` fires when a position is
  asked for and `NEW_IMAGE` when it shows. A viewport of one position, a
  stack of one image or a volume of one slice, fires `SCROLL_OUT_OF_BOUNDS`
  on each scroll.
- **The detail** has `viewportId`, `renderingEngineId`, `displaySetId`,
  `volumeId`, `sliceIndex`, `numberOfSlices`, `delta`, `direction` and
  `imageId`. `sliceIndex` is the position the scroll stopped at, `0` or
  `numberOfSlices - 1`, counted in the positions above, with the names of the
  detail of `NEW_IMAGE`.
  `delta` is the delta asked for, `direction` is `-1` toward the first
  position and `1` toward the last. `displaySetId` is the source display set.
  `volumeId` is the volume of the steps in volume mode: the `volumeId` of the
  scroll, else the volume on display. `imageId` is the image on display,
  undefined for an oblique cut or a reformat.
- **What 6.0.0-beta.2 and 5.x did.** `STACK_SCROLL_OUT_OF_BOUNDS` fired on
  `eventTarget` from `utilities.scroll` in stack mode and on a video, with
  `loop` too, before the scroll, with `{ imageIdIndex, direction }`: the
  image before the scroll and the delta. In volume mode `utilities.scroll`
  fired `VOLUME_VIEWPORT_SCROLL` after each scroll, and
  `VOLUME_VIEWPORT_SCROLL_OUT_OF_BOUNDS` in its place past an end in the
  acquisition plane only, with `volumeId`, `viewport`, `delta`,
  `desiredStepIndex`, `currentStepIndex`, `numScrollSteps` and
  `currentImageId`. A volume of one slice fired nothing, and
  `viewport.scroll` fired nothing.
- **A video scroll lands on a frame.** A video viewport pauses and goes to
  the start of the frame `delta` steps away; with `loop` it wraps by frames.
  6.0.0-beta.2 moved the time by the step and kept the offset inside the
  frame, and with `loop` it took one more step at the last frame before it
  wrapped.

Before, in 6.0.0-beta.2 and 5.x:

```ts
eventTarget.addEventListener(
  Enums.Events.STACK_SCROLL_OUT_OF_BOUNDS,
  (evt: Types.EventTypes.StackScrollOutOfBoundsEvent) => {
    if (evt.detail.direction > 0) {
      showNextSeries();
    }
  }
);
eventTarget.addEventListener(
  Enums.Events.VOLUME_VIEWPORT_SCROLL_OUT_OF_BOUNDS,
  (evt: Types.EventTypes.VolumeScrollOutOfBoundsEvent) => {
    const { viewport, currentStepIndex, numScrollSteps } = evt.detail;

    loadMoreSlices(viewport.id, currentStepIndex === numScrollSteps);
  }
);
```

After, in 6.0:

```ts
eventTarget.addEventListener(
  Enums.Events.SCROLL_OUT_OF_BOUNDS,
  (evt: Types.EventTypes.ScrollOutOfBoundsEvent) => {
    const { viewportId, sliceIndex, numberOfSlices, direction } = evt.detail;

    if (direction > 0) {
      showNextSeries();
    }

    loadMoreSlices(viewportId, sliceIndex === numberOfSlices - 1);
  }
);
```

## Sharpening and smoothing

- **`sharpening` and `smoothing` are keys of the appearance** of the source
  display set of a planar or a 3D viewport, with the numbers that the legacy
  `setProperties` takes:
  `viewport.setDisplaySetAppearance(displaySetId, { sharpening: 1 })`. The
  picture is the picture of the legacy viewport. In 5.x the next viewports had
  neither.
- **A viewport that draws on the CPU sharpens and smooths too.** The legacy CPU
  path ignored both numbers.
- **With both above 0 the picture shows the sharpening only,** as on the legacy
  viewport: vtk.js draws each pass of a view on its own, and the last one wins.
- **With the tiled rendering engine neither is drawn on the GPU,** on the
  legacy viewports and on the next ones alike: that engine does not ask a
  viewport for its render passes.

## The appearance of a display set

- **A sigmoid window on a volume is drawn.**
  `setDisplaySetAppearance(displaySetId, { voiLUTFunction })` with
  `SAMPLED_SIGMOID` draws the sigmoid on every path of a planar viewport, on
  the GPU and on the CPU. In 5.x a next planar viewport stored the key and drew
  a linear window for a volume.
- **The key is `voiLUTFunction`** on the planar and on the 3D appearance. The
  legacy properties and the detail of the legacy `VOI_MODIFIED` spell it
  `VOILUTFunction`.
- **A colormap update keeps what it does not name.**
  `{ colormap: { threshold: 100 } }` keeps the stored name and opacity
  mapping, and `{ colormap: { name } }` keeps the stored threshold and opacity
  mapping, as the legacy `setProperties`, on a planar and on a 3D viewport. A
  field given as `undefined` is removed. In 5.x a next planar viewport
  replaced the whole colormap, so the name was lost, and in 6.0.0-beta.2 a 3D
  viewport stored the colormap as it was given. `DISPLAY_SET_APPEARANCE_CHANGED`
  carries the whole colormap.
- **One opacity.** `colormap.opacity` is gone: the opacity of a display set is
  the `opacity` of its appearance, and the colormap has `opacityMapping` and
  `threshold`, whose values are values of the data. See
  [One opacity](#one-opacity).
- **No default properties.** `setDefaultProperties`, `getDefaultProperties`,
  `clearDefaultProperties` and `resetToDefaultProperties` have no twin. An
  application keeps its own default and sets it with
  `setDisplaySetAppearance`. `resetDisplaySetAppearance(displaySetId)`
  goes back to the look of the data.
- **An appearance is what was set; what is drawn has its own getter.**
  `getDisplaySetAppearance(displaySetId)` gives the overrides: the keys that
  a caller set, and nothing else. A key that was never set is undefined.
  `getEffectiveDisplaySetAppearance(displaySetId)` gives what is drawn, the
  defaults included, as the legacy `getProperties()` did. See
  [The appearance event and the two getters](#the-appearance-event-and-the-two-getters).
- **A reset of the appearance does not move the camera.**
  `resetDisplaySetAppearance(displaySetId)` also clears the slab, the blend
  mode, the opacity and the visibility. `resetViewState()` resets the view.
- **A reset of the appearance clears the overrides.** After
  `resetDisplaySetAppearance(displaySetId)`,
  `getDisplaySetAppearance(displaySetId)` gives `{}`, and a hidden display
  set shows again. `resetDisplaySetAppearance(displaySetId, ['voiRange'])`
  resets the window alone. To keep a display set hidden, set
  `{ visible: false }` again after the reset.
- **An edit of an actor does not last.** The next appearance update writes
  the look of the actor again. Set the look through the appearance.
- **No preset on a slice.** A preset is a look of a 3D viewport. For a slice,
  register a colormap and set `colormap: { name, opacityMapping }`.
- **No `callback` on a display set.** These appearances draw what the
  callbacks of the examples drew on a slice viewport:

  | The callback set                             | Appearance                                                                 |
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

## The appearance event and the two getters

`Events.DISPLAY_SET_APPEARANCE_CHANGED` replaces `VOI_MODIFIED` and
`COLORMAP_MODIFIED`, which are gone. It fires on the element of the viewport,
once for each change of the appearance of one display set, for every key of
the appearance of the family: the window (`voiRange`), `voiLUTFunction`,
`invert`, `colormap`, `opacity`, `visible`, `blendMode`, `slabThickness`,
`interpolationType`, `sharpening` and `smoothing` of a planar viewport, also
`preset`, `color` and `sampleDistanceMultiplier` of a 3D viewport, the
playback keys of a video, the line and grid keys of an ECG and the window of
a whole slide. It fires on every viewport family.

### Why it changed

The detail of `VOI_MODIFIED` named a volume and no display set, and it could
not tell a window that a caller set from a window that the data has. The
VOI synchronizer therefore wrote the window of every mount into the other
viewports as an explicit setting, and an application that stored the
appearance stored computed windows: OHIF guessed with `isComputedVOI`, by
comparing the stored window with the default window, which also threw away
a window that the user had set to the default. A window level drag fired
`VOI_MODIFIED` and a colormap change of a 3D viewport fired both events. A
slab change fired a made-up `CAMERA_MODIFIED`.

### The cause

Each event says why the appearance changed, in `detail.cause`:

| Cause       | When it fires                                                                                                                                                                                                                                                                                                                               |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `'mount'`   | The display set was mounted and has its first appearance: the defaults of its data and of its family, with the overrides set before the mount. Once per mount, after the display set is bound. `changedKeys` holds every key that has a value                                                                                               |
| `'edit'`    | A call of `setDisplaySetAppearance` changed an override, and with it maybe the value on display. A call that changes nothing fires nothing                                                                                                                                                                                                  |
| `'reset'`   | A call of `resetDisplaySetAppearance` removed overrides: the keys are back to their defaults                                                                                                                                                                                                                                                |
| `'default'` | A value on display changed and no call made it: the default of a key without an override changed. A scroll of a stack to an image with another default window, invert (MONOCHROME1) or VOI LUT function fires it once, with each such key; so does a remount on another render path with another default window. The overrides are the same |

In 6.0.0-beta.2 a scroll fired `'default'` for the window only: the invert
of a stack that mixes MONOCHROME1 and MONOCHROME2 images, and the VOI LUT
function of the image, changed on display without an event, and the
effective appearance had no `voiLUTFunction`. A readout that followed them
on `NEW_IMAGE` can listen to the appearance event:

```js
// Before
element.addEventListener(Enums.Events.NEW_IMAGE, () => {
  showInvert(viewport.getEffectiveDisplaySetAppearance()?.invert);
});

// After
element.addEventListener(
  Enums.Events.DISPLAY_SET_APPEARANCE_CHANGED,
  ({ detail }) => {
    if (detail.changedKeys.includes('invert')) {
      showInvert(detail.effective.invert);
    }
  }
);
```

### The detail

| Key                 | What it is                                                                                                                                |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `viewportId`        | The viewport                                                                                                                              |
| `renderingEngineId` | Its rendering engine                                                                                                                      |
| `displaySetId`      | The display set whose appearance changed                                                                                                  |
| `role`              | `'source'` or `'overlay'`                                                                                                                 |
| `volumeId`          | The volume that the display set draws; undefined for a display set drawn as images                                                        |
| `cause`             | `'mount'`, `'edit'`, `'reset'` or `'default'`                                                                                             |
| `changedKeys`       | The keys whose override or value on display changed                                                                                       |
| `overrides`         | What `getDisplaySetAppearance(displaySetId)` gives after the change: what a caller set. Copy and store this                               |
| `effective`         | What `getEffectiveDisplaySetAppearance(displaySetId)` gives after the change: what is drawn, the defaults included. Show and compare this |

The type is `Types.EventTypes.DisplaySetAppearanceChangedEvent` (and
`...EventDetail`), with the appearance of the family as its type parameter,
`PlanarDisplaySetAppearance` when none is given. The appearance types
`PlanarDisplaySetAppearance`, `Volume3DDisplaySetAppearance`,
`VideoDisplaySetAppearance`, `WSIDisplaySetAppearance` and
`ECGDisplaySetAppearance` are exported from `@cornerstonejs/core`.

### What does not fire

- The labelmap of a segmentation on a planar viewport, and a segmentation
  volume or surface on a 3D viewport: the segmentation style owns their
  look. The legacy viewports fired no VOI event for a labelmap either.
- A display set that is not mounted. Its overrides are stored and the mount
  fires them.
- A viewport made with `suppressEvents`.
- A scroll to an image without a window (a range whose upper end is below
  its lower end).

A display set that is drawn as images over the source of a stack fires now,
with its own `displaySetId` and `role: 'overlay'`. The legacy event was
silent for it, because its detail would have read as the window of the
source.

### Overrides and the values on display

- `getDisplaySetAppearance(displaySetId?)` gives the overrides only, so
  `setDisplaySetAppearance(id, getDisplaySetAppearance(id))` changes nothing
  and fires nothing, on every family. A window that a caller set stays an
  override also when it equals the default window of the image on display:
  nothing compares numbers. Without an id it reads the source display set.
  It gives `{}` for a mounted display set without overrides.
- `getEffectiveDisplaySetAppearance(displaySetId?)` gives what is drawn: on a
  planar viewport the overrides over `visible: true`, `opacity: 1`, the
  default window of the image or the volume on display, the default invert
  of the image (true for MONOCHROME1) and the VOI LUT function of the
  metadata of the image (`voiLUTFunction`, which a volume and an image
  without one do not have: they are drawn linear); on a 3D viewport over
  `visible: true`, `opacity: 1` and the default window of the volume; on a
  video, an ECG and a whole slide over the defaults that the mount sets
  (`playbackRate: 1`, `loop: true`, `muted: true`, `objectFit: 'contain'`,
  `lineWidth: 1`, `showGrid: true`). Undefined for a display set that is not
  mounted.
- `setDisplaySetAppearance(id, { key: undefined })` removes the override of
  that key.
- `resetDisplaySetAppearance(displaySetId?, keys?)` removes all the
  overrides, or those of the keys given.
- A 3D reset goes back to the defaults. In 6.0.0-beta.2 it went back to the
  appearance after the mount, with the overrides set before the mount.

Code that copies an appearance to another viewport or stores it reads the
overrides. Code that shows a value or compares it (a readout, a toggle such
as invert, a tool that starts from the current window) reads the effective
values. In the tools, the magnifier loupe and the viewport capture copy the
overrides; the window level tools, the livewire, the grow cut and the
colorbar read the effective values.

### Synchronizers

The VOI synchronizer (`synchronizers.createVOISynchronizer`) acts on
`'edit'` and `'reset'` only, and on the keys that it synchronises: the
window, the invert with `syncInvertState`, and the colormap and the opacity
with `syncColormap`. An edit copies the overrides of those keys that changed; a
key whose override the edit removed is reset in the target. A reset resets
the same keys in the target, which goes back to its own defaults: it does
not take the effective values of the source, which are defaults of the
source. A mount and a default write nothing into the other viewports, so an
application that stores the appearance stores only what a user set.

The slab thickness synchronizer listens to this event too, and acts when
`changedKeys` holds `slabThickness` on the source display set, for every
cause but `'default'`. A slab change fires no `CAMERA_MODIFIED`.

### Before and after

A window level readout. Before, the readout listened to `VOI_MODIFIED` and
read the default window at the mount itself:

```ts
import { Enums, type Types } from '@cornerstonejs/core';

showWindowLevel(
  viewport.getDisplaySetAppearance()?.voiRange ?? viewport.getDefaultVOIRange()
);

element.addEventListener(
  Enums.Events.VOI_MODIFIED,
  (evt: Types.EventTypes.VoiModifiedEvent) => {
    if (evt.detail.volumeId && evt.detail.volumeId !== shownVolumeId) {
      return;
    }

    showWindowLevel(evt.detail.range);
  }
);
```

After, the mount fires the event with the default window, and the readout
takes the window on display of the source:

```ts
import { Enums, type Types } from '@cornerstonejs/core';

element.addEventListener(
  Enums.Events.DISPLAY_SET_APPEARANCE_CHANGED,
  (evt: Types.EventTypes.DisplaySetAppearanceChangedEvent) => {
    const { role, changedKeys, effective } = evt.detail;

    if (role === 'source' && changedKeys.includes('voiRange')) {
      showWindowLevel(effective.voiRange);
    }
  }
);

showWindowLevel(viewport.getEffectiveDisplaySetAppearance()?.voiRange);
```

A synchronizer of two viewports that an application wrote. Before, it
copied every window, also the window of a mount and of a scroll, as an
explicit setting:

```ts
first.element.addEventListener(
  Enums.Events.VOI_MODIFIED,
  (evt: Types.EventTypes.VoiModifiedEvent) => {
    second.setDisplaySetAppearance({
      voiRange: evt.detail.range,
      invert: evt.detail.invert,
    });
  }
);
```

After, it copies what a caller set or reset, and nothing else. A key given as
`undefined` removes the override in the second viewport:

```ts
first.element.addEventListener(
  Enums.Events.DISPLAY_SET_APPEARANCE_CHANGED,
  (evt: Types.EventTypes.DisplaySetAppearanceChangedEvent) => {
    const { cause, changedKeys, overrides, displaySetId } = evt.detail;
    const keys = changedKeys.filter(
      (key) => key === 'voiRange' || key === 'invert'
    );

    if (!keys.length) {
      return;
    }

    if (cause === 'edit') {
      second.setDisplaySetAppearance(
        displaySetId,
        Object.fromEntries(keys.map((key) => [key, overrides[key]]))
      );
    } else if (cause === 'reset') {
      second.resetDisplaySetAppearance(displaySetId, keys);
    }
  }
);
```

`synchronizers.createVOISynchronizer` of the tools does this, with the
target display set found by id, by volume or as the source of the target.

A colormap listener. Before:

```ts
element.addEventListener(
  Enums.Events.COLORMAP_MODIFIED,
  (evt: Types.EventTypes.ColormapModifiedEvent) => {
    const { volumeId, colormap } = evt.detail;

    if (volumeId === ptVolumeId) {
      updateLegend(colormap.name, colormap.threshold);
    }
  }
);
```

After, the listener tests the key, and the mount of a PET with a colormap
fires it too:

```ts
element.addEventListener(
  Enums.Events.DISPLAY_SET_APPEARANCE_CHANGED,
  (evt: Types.EventTypes.DisplaySetAppearanceChangedEvent) => {
    const { volumeId, changedKeys, effective } = evt.detail;

    if (volumeId === ptVolumeId && changedKeys.includes('colormap')) {
      updateLegend(effective.colormap?.name, effective.colormap?.threshold);
    }
  }
);
```

### What the codemod does

The step `api-names` renames `Events.VOI_MODIFIED`,
`Events.COLORMAP_MODIFIED` and the four detail types, and reports each site
for review with the text: "DISPLAY_SET_APPEARANCE_CHANGED fires once for
every change of the appearance of a display set, also at its mount and when
a scroll shows an image with another default window: test detail.cause and
detail.changedKeys; the window is detail.effective.voiRange, the colormap
detail.effective.colormap, what a caller set detail.overrides". In a
listener that `addEventListener` gets as a function of the file, it rewrites
the reads of the detail: `range` becomes `effective.voiRange`,
`VOILUTFunction` `effective.voiLUTFunction`, `invert` `effective.invert`,
`colormap` `effective.colormap`, also in a destructuring pattern;
`viewportId` and `volumeId` stay. It reports a listener that is not a
function of the file, a detail that goes on as a whole, and
`invertStateChanged`, which has no place. It reports for review a read of
`getDisplaySetAppearance` whose value is shown or compared (a comparison, a
`!`, a template string, JSX), with the text "it gives the overrides only,
what a caller set, and here the value is shown or compared: use
getEffectiveDisplaySetAppearance for what is drawn, the defaults included".

## One opacity

`colormap.opacity` is gone. A display set has one opacity, the `opacity` of
its appearance, from 0 to 1. Its colormap has `name`, `opacityMapping` and
`threshold` (`Types.AppearanceColormap`). Every render path draws the alpha of
a pixel as `opacity * ramp(value)`, and 0 below `threshold`, where `ramp` is
the `opacityMapping`: linear between two points, constant past the first and
the last, and 1 everywhere without a mapping. The values of the mapping and
the threshold are values of the data (a pixel value, a Hounsfield unit, an
SUV), as on the legacy volume viewport, so a change of the window keeps them.
The opacity function of the volume of a 3D viewport follows the same rule.

### Why it changed

In 6.0.0-beta.2 `colormap.opacity` held a number or a list, `opacity` held a
number, and each render path read the two its own way. A number and a list
in `colormap.opacity` shared one key, so one replaced the other. Measured on
the bands 0 to 224 of one series with `opacity: 0.6`, the mapping 0 to 0,
128 to 1, 224 to 0.5 and the threshold 48:

| Render path                                                               | 6.0.0-beta.2                                                                                                                                                                                                                                      | 6.0       |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| A stack on the GPU, its canvas frame, and the acquired frames of a volume | The mapping and the threshold were not drawn: 0.6 on every band. `colormap.opacity` was not drawn either                                                                                                                                          | The rule  |
| A volume slice cut on the GPU or on the CPU, and its canvas slice         | `opacity` and `colormap.opacity` multiplied. A threshold without a mapping drew the opacity twice (0.36 for 0.6). A threshold with a mapping rose from 0 at the threshold to the next point of the mapping (0.12 in place of 0.3 at the value 64) | The rule  |
| A colour volume (three components) cut on the GPU                         | `opacity` was not drawn                                                                                                                                                                                                                           | `opacity` |
| The volume of a 3D viewport                                               | `colormap.opacity` and `opacity` overwrote each other; a threshold rose to the next point of the mapping; `threshold: null` left the threshold                                                                                                    | The rule  |
| The colour table of the CPU fallback (`utilities.renderToCanvasCPU`)      | It read `colormap.opacity` and not `opacityMapping`                                                                                                                                                                                               | The rule  |

### Before and after

A colormap with an opacity:

```ts
// Before (6.0.0-beta.2)
viewport.setDisplaySetAppearance(ptDisplaySetId, {
  colormap: { name: 'hsv', opacity: 0.5 },
});

// After
viewport.setDisplaySetAppearance(ptDisplaySetId, {
  colormap: { name: 'hsv' },
  opacity: 0.5,
});
```

Opacities by value of the data, such as the PET of a fusion:

```ts
// Before (6.0.0-beta.2)
viewport.setDisplaySetAppearance(ptDisplaySetId, {
  colormap: {
    name: 'hsv',
    opacity: [
      { value: 0, opacity: 0 },
      { value: 0.1, opacity: 0.8 },
      { value: 1, opacity: 0.9 },
    ],
  },
});

// After
viewport.setDisplaySetAppearance(ptDisplaySetId, {
  colormap: {
    name: 'hsv',
    opacityMapping: [
      { value: 0, opacity: 0 },
      { value: 0.1, opacity: 0.8 },
      { value: 1, opacity: 0.9 },
    ],
  },
});
```

An opacity slider over those points. The opacity scales them, so the slider
keeps no copy of them:

```ts
// Before (6.0.0-beta.2): a number in colormap.opacity replaced the points
const { opacity: stored, ...colormap } =
  viewport.getDisplaySetAppearance(ptDisplaySetId)?.colormap ?? {};

viewport.setDisplaySetAppearance(ptDisplaySetId, {
  colormap: {
    ...colormap,
    opacityMapping: Array.isArray(stored) ? stored : colormap.opacityMapping,
    opacity: sliderValue,
  },
});

// After
viewport.setDisplaySetAppearance(ptDisplaySetId, { opacity: sliderValue });
```

The opacity on display:

```ts
// Before (6.0.0-beta.2): a number, a list, or undefined
const opacity =
  viewport.getDisplaySetAppearance(ptDisplaySetId)?.colormap?.opacity;

// After: 1 unless a caller set another
const opacity =
  viewport.getEffectiveDisplaySetAppearance(ptDisplaySetId)?.opacity;
```

### Notes

- **A threshold keeps the mapping above it.** Below the threshold the alpha
  is 0, from the threshold on it is `opacity * ramp(value)`. The legacy
  volume viewport of 5.x, and 6.0.0-beta.2, rose from 0 at the threshold to
  the next point of the mapping, so the values just above the threshold drew
  weaker than the mapping gives. This is not copied.
- **A colour layer has no value for a ramp.** An RGB image or volume is drawn
  with `opacity`; its `opacityMapping` and `threshold` do nothing.
- **The opacity without the ramp of a colormap:** `{ colormap: { opacityMapping: [] }, opacity }`
  draws the opacity alone; `opacityMapping: undefined` removes the mapping
  from the stored colormap too.
- **A removed opacity is 1 again.** `{ opacity: undefined }` and
  `resetDisplaySetAppearance(displaySetId, ['opacity'])` draw the opacity 1
  on a planar viewport; 6.0.0-beta.2 kept drawing the opacity set before.
- **Synchronizers.** `createVOISynchronizer(name, { syncColormap: true })`
  copies the opacity with the colormap.
- **The legacy look of a numeric opacity is not copied.** The legacy volume
  viewport drew an opacity `a` as `1 - (1 - a) ** f` (see
  [a labelmap fill is drawn with the configured alpha](#a-labelmap-fill-is-drawn-with-the-configured-alpha)).
  A next viewport draws `a`.

### What the codemod does

`npx codemod @cornerstonejs/cornerstone3d-6-api-names` rewrites, in an
appearance literal that the file shows to reach `setDisplaySetAppearance`
(also under its 6.0.0-beta.2 name `setDisplaySetPresentation`), the
`appearance` of a mount entry, or a value typed `PlanarDisplaySetAppearance`
or `Volume3DDisplaySetAppearance`:

- `colormap: { opacity: <number> }` to `opacity: <number>` beside the
  colormap, the number given as a literal or by a `const`;
- `colormap: { opacity: [...] }` to `colormap: { opacityMapping: [...] }`,
  also in a `const` that the appearance names, and in a value typed
  `Types.AppearanceColormap`;
- `Types.ColormapPublic` to `Types.AppearanceColormap`.

The `viewport-members` step writes the same form for the 5.x
`setProperties({ colormap })`. Each site that a step cannot rewrite is
reported in `cornerstone3d-6-manual` with
`colormap.opacity is gone: a number is the opacity of the appearance (opacity beside the colormap), a list of { value, opacity } points is colormap.opacityMapping`:
a number when the appearance has an `opacity` too (choose one), a value that
is not a number or a list that the file shows, a number in a colormap that a
`const` holds, a colormap with an `opacity` that the file does not show to
reach Cornerstone (a hanging protocol, a store of the application), a spread
into a colormap whose type has an `opacity`, and each read of
`colormap.opacity`.

## Display area and stretch

- **The display area lives only in the view state.**
  `viewport.setViewState({ displayArea })` sets it,
  `viewport.getViewState().displayArea` reads it, and
  `viewport.setViewState({ displayArea: undefined })` clears it. A planar
  viewport has no `setDisplayArea()`, `getDisplayArea()`, `options`,
  `setOptions()` or `reset()` any more, and `Events.DISPLAY_AREA_MODIFIED` is
  gone: a change of the display area fires `CAMERA_MODIFIED` when the picture
  moves, and a listener reads `viewport.getViewState().displayArea`. The
  codemod rewrites the two calls.

  ```js
  // Before
  viewport.setDisplayArea(displayArea);
  const shown = viewport.getDisplayArea();
  element.addEventListener(Events.DISPLAY_AREA_MODIFIED, onArea);

  // After
  viewport.setViewState({ displayArea });
  const shown = viewport.getViewState().displayArea;
  element.addEventListener(Events.CAMERA_MODIFIED, () =>
    onArea(viewport.getViewState().displayArea)
  );
  ```

- **A display area shows as it is.** A patch with a display area and none of
  `scale`, `scaleMode`, `anchorWorld` and `anchorCanvas` sets `scale: [1, 1]`,
  `scaleMode: displayArea.scaleMode ?? 'fit'`, `anchorWorld: undefined` and
  `anchorCanvas: [0.5, 0.5]`, as `setDisplayArea` did. A key of the patch
  wins: `setViewState({ displayArea, scale: [2, 2] })` shows the display area
  twice as large. Before this change `setViewState({ displayArea })` merged,
  and a scale that the view state already had multiplied the display area.
- **The display area of the options is the first display area of the view
  state.** `defaultOptions.displayArea` of `enableElement` shows from the
  first draw, and `viewport.getViewState().displayArea` gives it. Before this
  change the option was not applied, as a 5.x stack viewport did not apply it
  at `setStack`, and code called
  `viewport.setDisplayArea(viewport.defaultOptions.displayArea)` after the
  mount; that call can go.
- **`storeAsInitialCamera: true` makes the display area the one of a
  reset.** `resetViewState()` (with `resetPan` and `resetZoom`) shows the
  last display area given with `storeAsInitialCamera: true`, in
  `defaultOptions` or in `setViewState`, and clears any other display area,
  as the legacy `resetCamera` applied the display area of the options. Zoom 1
  and pan `[0, 0]` are still the fit, not the display area.

  ```js
  renderingEngine.enableElement({
    viewportId,
    type: ViewportType.PLANAR,
    element,
    defaultOptions: {
      displayArea: { imageArea: [0.5, 0.5], storeAsInitialCamera: true },
    },
  });
  // After a zoom and a pan of the user:
  viewport.resetViewState(); // shows the display area again
  ```

- **A display area of `type: 'SCALE'` reads its `scale` against the fit.** A
  scale of 1 is the fit of the picture. On a legacy viewport 1 meant one
  image pixel on one screen pixel. The scale of the view state multiplies
  it, as it multiplies any other display area, so a `zoom` or a `scale` next
  to it in a patch is the zoom that you read back. Before this change the
  `scale` of the display area won, and
  `withFraming(viewport, { displayArea, zoom: 3 })` read back the
  scale of the display area.
- **A pan or a zoom through `viewportProjection` takes the display area
  away.** `viewport.setViewState(viewportProjection.withFraming(viewport, { pan }))`,
  and the same with `zoom` or `scale`, starts from the picture that the
  display area gave and moves or grows it. A zoom with no `anchorCanvas` is
  about the centre of the canvas. After it `viewport.getViewState().displayArea`
  is undefined. The pan tool, the zoom tool and a zoom and pan synchronizer
  work this way, in stack mode and in volume mode. Before this change the
  display area stayed: a pan did nothing and a zoom was multiplied by the
  zoom of the display area. To set a display area again, call
  `viewport.setViewState({ displayArea })`. `setPan(pan)` and `setZoom(zoom)`
  of a planar viewport work the same way, so `setPan(getPan())` and
  `setZoom(getZoom())` keep the picture, as on a legacy viewport. Before this
  change `setPan` dropped the zoom back to the fit and `setZoom` lost the pan.
- **A display area in a framing decides where the picture is.** In
  `viewport.setViewFraming({ displayArea, pan })` the display area places the
  picture and the pan is not used; after it
  `viewport.getViewState().displayArea` is the display area. Before this
  change the pan won and the display area was dropped, so a framing that was
  read with its display area lost the display area when it was written back.
  A `zoom` or a `scale` next to the display area is measured against the
  fit, as `getViewFraming` reads them. A patch with a display area and no
  `zoom`, `scale` or `fitScale` shows the display area as it is.
- **The framing keeps how the view fits.** The framing of a planar viewport
  has `scaleMode` and `fitScale`: the scale mode and the scale of the view
  state, which is measured against the display area when there is one,
  against the fit of the stretched picture for `scaleMode: 'fitAspect'`, and
  against the fit otherwise. `zoom`, `scale` and `pan` stay those of the
  picture against the fit, as tools read them. A `fitScale` in a patch wins
  over `scale` and `zoom`. So `viewport.setViewFraming(viewport.getViewFraming())`
  changes no pixel, in every scale mode and with a stretch, also after a
  resize, and the framing of one viewport gives another viewport of another
  size the same fit: a display area that fits the width fits the width there.
  Before this change the framing had no scale mode, its writer set
  `scaleMode: 'fit'`, and its `scale` was taken against the fit of the
  viewport it was written to.

  ```js
  // Before: kept the keys of the view state to restore a view
  const saved = pick(viewport.getViewState(), [
    'displayArea',
    'anchorWorld',
    'anchorCanvas',
    'scale',
    'scaleMode',
    'rotation',
    'flipHorizontal',
    'flipVertical',
  ]);
  other.setViewState({ displayArea: undefined, ...saved });

  // After
  const framing = viewport.getViewFraming();
  other.setViewFraming(framing);
  ```

- **A framing carried to another size keeps the world point at the
  centre.** The `zoom` of a framing is measured against the fit of the
  canvas it is written to, and its `pan` is in canvas pixels at zoom 1, as
  `getPan()` and the tools read it. Every framing also has `worldPan`, the
  same shift in world units (millimetres on a planar or 3D viewport, pixels
  of the video, the units of the slide, and of the trace layout on an ECG
  viewport), and `setViewFraming` takes it in place of `pan`. So a framing
  read on one pane and written to a pane of another size shows the same
  world point at the centre at the same zoom against the fit, a resize,
  which keeps the camera, keeps `worldPan`, and a view that goes to a pane
  of another size and back, by framings, by resizes or by a mix of the two,
  comes back as it was. Before this change the pan in canvas pixels was
  kept: a 3D or planar view resized into a pane of half the size and
  written back to a pane of the first size by its framing came back with
  half its pan. A resize keeps the parallel scale, as in 5.x, so where the
  fit changes with the shape of the pane (a pane taller than the picture),
  a framing written back after a resize has the zoom of the resized pane; a
  whole slide viewport keeps the resolution of its map through a resize, as
  in 5.x, so there it has it at any change of size. The view framing synchronizer copies `worldPan` too when it has no
  selector. To change the pan of a framing that was read, drop its
  `worldPan`:

  ```ts
  // Before: pan [40, 20] on a pane of 400 by 300 pixels
  const framing = viewport.getViewFraming();
  smallPane.setViewFraming(framing); // pan [40, 20], another world point

  // After
  smallPane.setViewFraming(framing); // pan [20, 10] on 200 by 150, same point
  viewport.setViewFraming({ ...framing, worldPan: undefined, pan: [0, 0] });
  ```

- **The framing of a 3D viewport goes to a viewport of another size.** Its
  `camera` gives the direction, its `zoom` is applied against the fit of the
  viewport it is written to, for that direction, and its `worldPan` keeps
  the world point at the centre. On the same viewport
  `setViewFraming(getViewFraming())` changes no pixel. Before this change
  the camera was applied as it was, so on a viewport of another size the
  zoom against the fit changed. A framing without its `camera` keeps the
  direction of the view and applies its `zoom`, `pan` and `rotation`, as a
  partial framing does on a planar viewport; before, its `position` and
  `scale` were taken as camera fields and the view lost its direction.
- **A framing can be read and written while the element has no size.** While
  the element of a viewport is hidden (`display: none`), detached from the
  document (a pane that unmounts) or of zero width or height, every family
  frames the view at the last size its canvas had: `getViewFraming()`,
  `getZoom()` and `getPan()` give the view as it was last drawn, and
  `setViewFraming(framing)` sets it, so a framing stored when a pane unmounts
  restores its pan, also on a 3D viewport. A framing written without a size
  is shown as written when the element gets its size back; when the element
  comes back at another size, the next `renderingEngine.resize()` sets the
  framing that the viewport read back after the write again, against the fit
  of that size and with the same world point at the centre, as
  `setViewFraming(framing)` of that framing does on a viewport of that size. A view that was set while the element had a size
  follows the resize as any resize does. Before this change a 3D, video,
  whole slide or ECG viewport read its size at the moment: a framing read
  without a size had a pan of `[0, 0]` on a 3D viewport, a wrong pan on a
  video or an ECG viewport and no zoom on a whole slide viewport, and a
  planar viewport lost its pan after a `renderingEngine.resize()` of the
  tiled engine while it was hidden.
- **The framing has no slab thickness and no window.** `slabThickness` of
  `ViewFraming` and `slabThickness`, `windowLevel` and `paletteLut` of
  `ViewFramingSelector` are gone; nothing read them. The slab thickness and
  the window are the appearance of a display set
  (`viewport.getDisplaySetAppearance(displaySetId)`).
- **The framing has no aspect ratio.** `aspectRatio` of `ViewFraming` and of
  `ViewFramingSelector` is gone: no viewport gave it or applied it, so
  `setViewFraming({ aspectRatio: [2, 1] })` changed nothing. The 5.x
  `setViewPresentation` stretched the view by it. The stretch of a planar
  view is the scale pair of its framing:

  ```ts
  // Before
  viewport.setViewPresentation({ aspectRatio: [2, 1] });
  const [x, y] = viewport.getViewPresentation().aspectRatio;

  // After
  viewport.setViewFraming({ scale: [2, 1] });
  const [x, y] = viewport.getViewFraming({ scale: true }).scale;
  ```

- **`getViewFraming` has the framing of the family.** On a planar viewport it
  takes a `PlanarViewFramingSelector` and gives a `PlanarViewFraming`, so
  `viewport.getViewFraming({ scale: true })?.scale` needs no cast; on a 3D
  viewport it gives the `Volume3DProjectionFraming` with its `camera`.
  `Types.IViewport` takes the framing as type parameters and gives the
  general `ViewFraming` without them.
- **A turn after a pan turns the picture about its own centre.** A pan set
  through `viewportProjection.withFraming(viewport, { zoom, pan })` stays
  through a later rotation, so the picture turns about its own centre. The
  legacy `setCamera({ focalPoint, position, parallelScale })` kept a world
  point at the centre of the canvas, so a later rotation turned the picture
  about the centre of the canvas.
- **No stored initial camera.** Zoom 1 and pan `[0, 0]` are always the fit.
  `storeAsInitialCamera` of a display area only makes it the display area of
  `resetViewState()`. A display area does not change the interpolation
  either.
- **A stretch is the scale pair of the view state.**
  `viewport.setViewState({ scale: [x, y] })` stretches the picture, in stack
  mode and in volume mode, on the GPU and on the CPU.
  `viewportProjection.getFraming(viewport, { selector: { scale: true } })`
  returns the pair in its `scale`. A planar viewport has no `setAspectRatio()`,
  and the `aspectRatio` option is not applied.
- **A stretched picture can fit the canvas.** With `scaleMode: 'fitAspect'`
  the pair is measured against the fit of the stretched picture:
  `viewport.setViewState({ scale: [w / h, 1], scaleMode: 'fitAspect' })` is
  the legacy `setAspectRatio([w, h], { fit: true })`, and the fit follows a
  resize. Without the fit, `setAspectRatio([w, h])` kept the horizontal
  scale: `setViewState({ scale: [x, (x * h) / w], scaleMode: 'fit' })`, with
  `x` the first number of the `scale` that `viewportProjection` gives.
- **`getAspectRatio()` follows the scale pair.** A planar viewport answers
  the pair divided by its smaller number: `[2, 1]` after
  `viewport.setViewState({ scale: [2, 1] })`, as the legacy stack viewport
  answered after `setAspectRatio([2, 1])`. The other families do not stretch
  and answer `[1, 1]`.

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

Steps 2 and 3 go through `viewportProjection.withFraming`. In step 1 the
focal point of the view reference is the centre of the slice that the source
draws (see "getViewReference() in volume mode names the image of the slice
on display"), so a target of a finer grid goes to that centre, up to half a
slice of the source away from the point that the source shows. To give the
target the point of the source, write a reference of a point and a plane:
`{ FrameOfReferenceUID, viewPlaneNormal, cameraFocalPoint }` with the focal
point of `sViewport.getResolvedView()?.toICamera()`.

The camera position synchronizer does all of it between two planar
viewports: the same parallel scale and the same world point at the centre of
the canvas, whatever the extents of the two volumes, as the 5.x `setCamera`
gave. See "The camera position synchronizer keeps one scale, one centre and
moves a slice only with a move along the normal" below. 6.0.0-beta.2 copied
the view reference, the zoom and the pan against the fit as they were, so
between viewports of other data it gave another size.

## The time point of a dynamic volume

5.19.0 put the time point of a dynamic (4D) volume into the view reference of
the legacy volume viewport. A planar viewport that shows a dynamic volume
does the same:

- **`getViewReference()` has `dimensionGroupNumber`,** the time point on
  display, from 1. With `{ volumeId }` it is the time point of that volume,
  for example the PET overlay of a fusion. A static volume gives none.
- **`isReferenceViewable(viewRef)` is false for another time point.** With
  `{ withNavigation: true }` it is true when the volume has that time point.
- **`setViewReference(viewRef)` selects the time point of the reference**
  on the dynamic volume that the reference names, else on the volume on
  display, as `volume.dimensionGroupNumber = viewRef.dimensionGroupNumber`
  does. As in 5.19, the reference must be in the frame of reference of the
  viewport and its time point one of the volume; else the time point stays.
- **A viewport whose data has no time point takes a reference with a time
  point as if it had none,** with or without navigation (a static volume,
  a stack, a whole slide or an ECG), as the legacy viewports of 5.19
  did. A dynamic volume of one time point counts as a static volume, as
  in 5.19: its view reference has no time point.

The labelmap of a 4D series follows the time point as the 5.x guide says
under "Labelmaps of a 4D series follow the time point". Read its stack
viewport as a planar viewport in stack mode, and its volume viewport as a
planar viewport in volume mode: an edit in stack mode first selects the time
point of the image on display.

## Events and image loading of a planar viewport

- **One event for new data: `DISPLAY_SETS_CHANGED`.** It replaces
  `VIEWPORT_NEW_IMAGE_SET` and `VOLUME_VIEWPORT_NEW_VOLUME`, which are gone
  from `Enums.Events`. Every viewport family fires it on its element: a
  planar, a 3D, a video, an ECG and a whole slide viewport. It fires once for
  each `setDisplaySets`, `addDisplaySet` and `removeDisplaySet` that commits,
  that is when the data of the call is loaded and bound and the getters of
  the viewport (`getDisplaySets()`, `getImageIds()`, `getActors()`,
  `getCurrentImageIdIndex()`) answer for the new display sets. A call that a
  newer `setDisplaySets` supersedes fires nothing, and so does a call that
  rejects. A `removeDisplaySet` of an id that the viewport does not show
  fires nothing. On a mount it fires after the first `NEW_IMAGE`, where the
  two old events fired. The detail has `displaySets` (each
  `{ displaySetId, role }`, as `getDisplaySets()` gives them),
  `sourceDisplaySetId`, `added`, `removed` and `sourceChanged`.
- **`DISPLAY_SETS_CHANGED` also fires for an overlay.** The two old events
  fired only when the source was mounted. The new event fires when a labelmap
  or another overlay is added or removed too, with `detail.sourceChanged`
  false. A listener that cares only for the source returns early then, or a
  cine stops each time a segmentation is shown. `sourceChanged` is true when
  the source is another display set, or when the call mounted it again, as
  each `setDisplaySets` does. A viewport that shows only overlays has no
  source: `detail.sourceDisplaySetId` is undefined.

  Before:

  ```ts
  element.addEventListener(Enums.Events.VIEWPORT_NEW_IMAGE_SET, restartCine);
  element.addEventListener(
    Enums.Events.VOLUME_VIEWPORT_NEW_VOLUME,
    restartCine
  );
  ```

  After:

  ```ts
  element.addEventListener(
    Enums.Events.DISPLAY_SETS_CHANGED,
    (evt: Types.EventTypes.DisplaySetsChangedEvent) => {
      if (!evt.detail.sourceChanged) {
        return;
      }

      restartCine();
    }
  );
  ```

  A listener that shows each layer, such as a histogram for each display
  set, reads `detail.displaySets` and needs no event of its own for the
  layers of a viewport.

- **The labelmap of a stack follows the slice without an event.** The tools
  draw the labelmap of a stack as one display set for each labelmap layer,
  whose image is the labelmap image of the slice on display. A scroll gives
  that display set the image of the new slice and fires no
  `DISPLAY_SETS_CHANGED`: its id stays the same in `getDisplaySets()`, and
  the actor entry of `getActors()` names the labelmap image of the slice
  (`referencedId`). In 6.0.0-beta.2 the labelmap image of the old slice was
  removed and the one of the new slice added at each scroll, two events for
  each image, with a new display set id each time. The event fires when the
  labelmap is added or removed, and when a layer has no image on the new
  slice. `getVolumeIds()` lists no volume for it, with or without
  `includeSegmentations`: a stack draws its labelmap as images. Behind it,
  `viewport.addImages([{ displaySetId, imageId }])` with the id of a display
  set that the viewport shows replaces the image of that display set and
  fires nothing; a new id fires the event once, as before.

  A listener of the layers runs when a layer comes or goes, and no longer at
  each scroll:

  ```ts
  element.addEventListener(Enums.Events.DISPLAY_SETS_CHANGED, (evt) => {
    updateLayers(evt.detail.displaySets);
  });
  ```

  In 6.0.0-beta.2 it ran twice at each image of a stack with a labelmap. A
  listener that followed the labelmap image of the slice through this event
  listens to `NEW_IMAGE` and reads `getActors()`.

- **One event for a new image: `NEW_IMAGE`.** It replaces `STACK_NEW_IMAGE`
  and `VOLUME_NEW_IMAGE`. No next viewport fires those two. `NEW_IMAGE` fires
  after another image of a stack shows, after another slice of a volume
  shows, and for each frame of a video. A listener for stacks and a listener
  for volumes become one listener. `detail.imageIndex` of `VOLUME_NEW_IMAGE`
  is `detail.sliceIndex` now. A listener that came from `STACK_NEW_IMAGE`
  and reads `detail.image` also runs for a volume, where there is no image:
  check `detail.image`, or `viewport.getCurrentMode()`. It fires for the
  source display set only: an overlay such as a labelmap fires nothing. The
  detail has the same keys in every mode:
  - `viewportId` and `renderingEngineId`.
  - `displaySetId` is the source display set, whose image shows.
  - `sliceIndex` is the index of what is on display, which is what
    `viewport.getSliceIndex()` and `viewport.getCurrentImageIdIndex()` give:
    the index of the image in a stack, the slice index of the view of a
    volume, the index of the frame of a video. The slice index of a volume
    counts along the view, in any orientation, and can run against the order
    of the image ids. It was `imageIdIndex` in 6.0.0-beta.2; only the key of
    the detail changes, `setImageIdIndex` and `initialImageIdIndex` keep
    their names.
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
- **One scroll event, `SCROLL_OUT_OF_BOUNDS`, when a scroll stops at an
  end.** `STACK_SCROLL_OUT_OF_BOUNDS`, `VOLUME_VIEWPORT_SCROLL` and
  `VOLUME_VIEWPORT_SCROLL_OUT_OF_BOUNDS` are gone. See
  [Scroll and its event](#scroll-and-its-event).
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
  that is drawn. Before the first image of a mount is drawn it is undefined,
  also between `setDisplaySets()` and the first `NEW_IMAGE`, where the
  legacy stack viewport gave the image id of the index at once. The tools
  render on a viewport that shows nothing yet, so a tool that reads the
  image there waits for it: the ultrasound pleura and B-line tool finds no
  fan until the first image is drawn (`getFanShapeGeometryParameters()`
  gives false) and derives it at the next render. 6.0.0-beta.2 threw
  `getImage: imageId must not be undefined` there.
- **A stack follows the image retrieve configuration.** Staged and
  progressive loading that is registered for `'stack'` with
  `imageRetrieveMetadataProvider` works with `setDisplaySets`. Without a
  configuration an image is requested as on the legacy stack viewport: as an
  interaction request with priority 5. In 5.x a next viewport requested it as
  a prefetch.
- **One appearance event in place of `VOI_MODIFIED` and
  `COLORMAP_MODIFIED`.** `DISPLAY_SET_APPEARANCE_CHANGED` fires once for each
  change, in stack mode and in volume mode, on the GPU and on the CPU, with
  `cause` and `changedKeys`; a call that changes nothing fires none, also in
  volume mode, where the legacy volume viewport fired for each call. A window
  set equal to the one on display fires one, because it becomes an override.
  A scroll to an image with another window of its own fires it with cause
  `'default'`, on the GPU and on the CPU; while a window is set a scroll
  fires none. A labelmap fires none. Its `volumeId` is the volume that the
  display set draws, none for a display set drawn as images, and stays the
  volume that the mount drew when the registration names another volume
  while the mount loads. See
  [The appearance event and the two getters](#the-appearance-event-and-the-two-getters).
- **`suppressEvents` in the options of a planar viewport is honoured.** No
  call takes a `suppressEvents` argument.
- **`isReferenceViewable` honours `asOverlay`,** so a labelmap image that is
  not in the stack but lies on the geometry of the image on display shows.
  With `asNearbyProjection` a reference by a focal point only shows in stack
  mode when the point lies within half a slice of the image on display: half
  the distance to the next image of the stack (see "The half slice of a
  stack is half the distance to the next image" below).
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
  images.** A next view reference names its display set (`displaySetId`). A planar
  viewport of another display set that has the image that the reference
  names takes it, as the legacy stack and volume viewports did:
  `isReferenceViewable(viewRef, { withNavigation: true })` is true, and
  `setViewReference(viewRef)` shows that image. The slice index and the
  volume of such a reference count in the other display set and are not
  asked. A reference of other images, or of a plane that the viewport does
  not show, is not viewable. Without the option the answer is true when the
  viewport shows that image; the legacy volume viewport compared the slice
  index of the stack with its own there, and answered false.
- **The slice index of a reference counts in the mode of the reference.** A
  stack counts its slices in the order of its image ids, a volume in the
  order of its view, sorted by position. A reference of the other mode, where
  the reference names a `volumeId` and the viewport shows no volume or the
  other way round, is checked by the image that it names and by its plane
  restriction, not by its slice index. This is the case of one display set
  shown as a stack in one viewport and as a volume in another, and of a
  reference that names no display set, as the annotations of the legacy stack
  viewport keep: `volume.isReferenceViewable(stack.getViewReference())` is
  true when the volume shows the image of the stack, in whatever order the
  stack holds its images. The legacy volume viewport, and an earlier build of
  6.0, compared the slice index of the stack with the slice of the volume and
  answered false when the two orders differ. A display set in stack mode
  gives no `volumeId` to the check, though its data keeps the id that its
  images would get as a volume. A reference that has only a slice index, as
  `{ sliceIndex }`, is still checked by it. `setViewReference` on a volume
  uses a slice index only with the `volumeId` of the volume, as before.
- **A reference of data that is no longer registered is taken by its image or
  its plane.** The check does not read the display set that a reference names
  in `displaySetRegistry`, nor its volume in the cache, so an application can
  remove the display set of a viewport that it closes while annotations keep
  references to it. A reference that names an image is viewable on a planar
  viewport that has that image, as on the legacy stack and volume viewports.
  A reference that names no image, as that of a sagittal slice, is viewable
  by its plane on a viewport in volume mode of its frame of reference, and on
  a 3D viewport: with navigation in that plane, without it on the slice of
  its point, as the legacy volume viewports took it with navigation. A
  viewport in stack mode takes such a reference only with `asVolume`. A
  reference that names neither an image nor a plane, as
  `{ displaySetId, volumeId }`, is viewable only on a viewport that shows that
  display set or that volume. An earlier build of
  6.0 refused a reference of a display set that was not registered, or of a
  volume that was not in the cache, with every option, and a reference of
  another display set that names no image. `setViewReference` already moved
  to such a reference. Before, an application kept the registration while a
  reference to it could be shown; now it can remove it:

  ```js
  renderingEngine.disableElement(stackViewportId);
  displaySetRegistry.remove(stackDisplaySetId);

  if (
    volumeViewport.isReferenceViewable(annotation.metadata, {
      withNavigation: true,
    })
  ) {
    volumeViewport.setViewReference(annotation.metadata);
  }
  ```

- **A stack stays where it is for a reference of other images.** In stack
  mode, `setViewReference` with a reference that names an image the stack
  does not hold moves nothing, whatever slice index or focal point comes
  with it, as on the legacy stack viewport. In 5.x the next stack went to the
  slice index of such a reference, which counts in the other series. In
  volume mode a reference of another series in the same frame of reference
  still moves the view to its plane, as on the legacy volume viewport.
- **A stack stays where it is for a reference of a volume that names no
  image.** A sagittal or a coronal slice of a volume, as the camera
  position synchronizer of 6.0.0-beta.2 copied from a volume viewport to a
  stack, gives a
  `volumeId`, no image, and a slice index that counts in the slices of that
  view. In stack mode `setViewReference` moves nothing for it, as
  `isReferenceViewable(viewRef, { withNavigation: true })` answers false: a
  stack shows only the planes of its images and takes such a reference only
  with `asVolume`. The legacy stack viewport, and 6.0.0-beta.2, went to the
  image of the stack at that slice index (a sagittal slice 16 put a stack of
  8 images on its last image). A stack that shows that volume as an overlay
  still goes to the image at the point of the reference. To show the
  reference, the application mounts the display set in volume mode:

  ```js
  // Before: the stack went to the image at viewRef.sliceIndex
  stackViewport.setViewReference(sagittalViewport.getViewReference());

  // After
  const viewRef = sagittalViewport.getViewReference();

  if (stackViewport.isReferenceViewable(viewRef, { withNavigation: true })) {
    stackViewport.setViewReference(viewRef);
  } else if (stackViewport.isReferenceViewable(viewRef, { asVolume: true })) {
    await stackViewport.setDisplaySets({
      displaySetId,
      options: { mode: 'volume' },
    });
    stackViewport.setViewReference(viewRef);
  }
  ```

- **A stack decides a reference of one of its images by the image.** In
  stack mode `isReferenceViewable(viewRef, { withNavigation: true })` is
  true for a reference that names an image of the stack whatever plane it
  names, as on the legacy stack viewport, because the stack shows each image
  in its own plane. So a stack of images in several orientations takes a
  reference of an image of another orientation, also with the
  `viewPlaneNormal` or the `planeRestriction` of that image. In 5.x the next
  planar viewport checked that plane against the plane on display and
  answered false. A reference whose `referencedImageId` is the image on
  display is viewable with no options at all, whatever plane it names, as
  on the legacy stack viewport.
- **A stack takes a reference of a frame of reference, a plane or points
  only as a volume or as a nearby projection.** A reference that names no
  image, no volume, no display set, no slice index, no range and no plane
  restriction, as a 3D point annotation or
  `{ FrameOfReferenceUID, viewPlaneNormal, cameraFocalPoint }`, is viewable
  in stack mode only with `asVolume`, or with `asNearbyProjection` when its
  point lies within half a slice of the image on display (the next bullet),
  as on the legacy stack viewport of 5.18.3. 6.0.0-beta.2 showed it on every
  image of the stack, also far from its point. `setViewReference` with such a reference
  moves a stack nowhere, as on the legacy stack viewport, so the setter and
  `isReferenceViewable(viewRef, { withNavigation: true })` agree. To move a
  stack to a point, give the index of the nearest image:

  ```ts
  // Before: the stack went to the image nearest to the point
  stackViewport.setViewReference({ cameraFocalPoint: point });

  // After
  const index = utilities.getClosestStackImageIndexForPoint(
    point,
    stackViewport
  );
  stackViewport.setViewReference({ sliceIndex: index });
  ```

  `navigatePlanarViewportToPoint` of the tools does this for a stack, and
  `ReferenceCursors` uses it; `jumpToFocalPoint` moves only a volume view.

- **The half slice of a stack is half the distance to the next image.**
  With `asNearbyProjection` a stack takes a point that belongs to the image
  on display: the image of the stack nearest to the point along the normal
  of the image. Towards a neighbour image the image reaches half the
  distance to that neighbour (on each side its own neighbour, so a stack of
  uneven spacing has an uneven half slice); beyond the first or the last
  image, half the distance to its one neighbour. A volume view has the same
  half slice, half its slice spacing. The legacy stack viewport of 5.x and
  the 6.0 betas measured half the z spacing of the image data of a stack,
  which is 0.001 mm, so they took a point only within 0.0005 mm of the
  image: a 3D point annotation 0.2 mm from the image did not show.

  ```ts
  // A stack of images 1 mm apart, on the image at z = 10
  viewport.isReferenceViewable(
    { FrameOfReferenceUID, cameraFocalPoint: [x, y, 10.3] },
    { asNearbyProjection: true }
  );
  // Before: false (within 0.0005 mm only)
  // After: true (within 0.5 mm, half the distance to the next image)
  ```

  The neighbours are the images before and after the image on display in
  the stack, with a position and an orientation in their image plane
  metadata, in a plane parallel to the image and not on it. A stack of one
  image, or one whose neighbours have no position, lie in another plane or
  at the same position (the frames of a multiframe image without a
  position of each frame), takes half the `spacingBetweenSlices` of the
  image on display, else half its `sliceThickness`, and without either keeps
  the half slice of 5.x (0.0005 mm). The z spacing of the image data of a
  stack (`getImageData().spacing[2]`) stays 0.001 mm; other code reads it.

  What changes with it: `isReferenceViewable` and
  `getReferenceViewableCheck()` with `asNearbyProjection` in stack mode, and
  `filterAnnotationsForDisplay(viewport, annotations, { asNearbyProjection:
true })`. The tools draw their annotations without that option, so the
  annotations that a stack draws do not change. `setViewReference` with a
  reference of only a point moves a stack nowhere, as before. Volume mode is
  unchanged.

- **A stack takes a slice index only of its own display set.** In stack
  mode `setViewReference({ displaySetId: 'other', sliceIndex: 3 })` moves
  nothing, where 6.0.0-beta.2 went to image 3; a slice index past the last
  image or between two images moves nothing either. A slice index with no
  display set, or with the display set of the stack, goes to that image.
- **The referenced image of a volume view is the image of the slice on
  display.** `getViewReference()` in volume mode names the image of the slice
  whose centre is its `cameraFocalPoint`, where 6.0.0-beta.2 looked from the
  point of the view state and named none when that point lay half a slice
  between two images. A slice that lies on no image, as a slice of an
  oblique view, names none.
- **A volume goes where the legacy volume went for a part of a reference.**
  In volume mode, `setViewReference` uses a `sliceIndex` only with the
  `volumeId` of the volume and a `viewPlaneNormal`; a slice index without
  them moves nothing. In the acquisition plane a named image goes before a
  `cameraFocalPoint`, and an image of another series of the frame of
  reference moves the view to the plane of its image position. In 5.x the
  next viewport went to a bare slice index in the order of the view, and to
  the focal point before the image. For a reference of another frame of
  reference, or of none, the legacy volume viewport threw "Incompatible view
  refs"; a planar viewport moves nothing and does not throw, except for a
  reference that names an image of the volume (next line). A
  `cameraFocalPoint` without a frame of reference still moves it.
- **In volume mode a reference of an image needs a frame of reference to be
  viewable.** A reference that names an image (`referencedImageId` or
  `referencedImageURI`) and no `FrameOfReferenceUID` is not viewable in
  volume mode with any option, as on the legacy volume viewport. Add the
  frame of reference of the viewport to have it viewable. Only `asOverlay`,
  which the legacy volume viewport did not read, still takes an image that
  lies on the slice on display. In 5.x the next planar viewport took such a
  reference with navigation. `setViewReference` with such a reference still
  goes to the image when the volume has it, where the legacy volume viewport
  threw "Incompatible view refs". In stack mode the image decides,
  as on the legacy stack viewport. Without `withNavigation` a volume decides
  a reference of an image by that image: it is viewable when the slice on
  display shows it. The legacy volume viewport did not read the image there,
  and answered true for any image of its frame of reference when the
  reference had no `sliceIndex`.
- **A reference with a value that is not finite moves nothing.** A view
  reference whose `cameraFocalPoint`, `viewPlaneNormal`, `viewUp`, plane
  restriction or `sliceIndex` holds NaN or an infinity, as the centre of an
  empty segment gives, is not viewable with any option, and
  `setViewReference` moves nothing and does not throw, in both modes. The
  legacy volume viewport threw "Incompatible view refs" for a focal point of
  NaN and stayed. In 5.x the next planar viewport went to slice NaN and drew
  nothing.
- **A reference of a sagittal or a coronal slice is viewable with navigation
  on every slice of that view.** Its slice index counts in the slices along
  the view, as on the legacy volume viewport. In 5.x the next planar
  viewport counted it against the number of images, so
  `isReferenceViewable(viewRef, { withNavigation: true })` answered false for
  most sagittal and coronal slices of a CT, and a viewport that copied
  another only after that check stayed on its slice. With
  `{ withOrientation: true, withNavigation: true }` a reference of another
  plane of the volume with a point (its focal point, as `getViewReference()`
  gives it, or the point of its plane restriction) is viewable whatever its
  slice index, which counts in the slices of its own plane, and
  `setViewReference` turns the view and goes to that point. In 5.x the next
  planar viewport checked it against the slices of the view, so an axial
  view of 8 slices refused a sagittal reference at slice 16.
- **A slice index of another plane without a point is no slice of the
  view.** A reference with a slice index and a plane that is not the plane
  of the view (its view plane normal, or the plane of its plane
  restriction), and no point, names a slice of the grid of that plane, which
  the view does not have: `isReferenceViewable` refuses it with every
  option and `setViewReference` moves nothing. 6.0.0-beta.2 took it with
  orientation and navigation, and `setViewReference` turned the view and
  read the slice index in the slices of the view on display, so it showed
  another slice; the legacy volume viewport turned the view and did not read
  the slice index.

  ```js
  // An axial view of a volume of 64 x 48 x 20 voxels
  const sagittal40 = {
    FrameOfReferenceUID,
    volumeId,
    viewPlaneNormal: [1, 0, 0],
    sliceIndex: 40,
  };

  viewport.isReferenceViewable(sagittal40, {
    withOrientation: true,
    withNavigation: true,
  });
  viewport.setViewReference(sagittal40);

  // 6.0.0-beta.2: true, then a sagittal view on slice 32
  // Now: false, and the view stays axial on its slice. Give a point
  // (cameraFocalPoint) to go there, or use getVolumeSliceGrid to turn a
  // slice index of that plane into its point:
  const grid = utilities.getVolumeSliceGrid({
    volumeId,
    orientation: Enums.OrientationAxis.SAGITTAL,
  });

  viewport.setViewReference(grid.getViewReference(40));
  ```

- **A reference of a volume is viewable on every display set of that
  volume.** Two display sets that register the same `volumeId` show the same
  voxels, so a viewport of one takes a reference that names the other as its
  `displaySetId` and that volume as its `volumeId` as its own reference: its plane
  and its slice index count, as on the legacy volume viewport, which had no
  display set id. In 5.x the next viewports refused such a reference that
  names no image (a sagittal or a coronal one) with every option.
- **A reference of an overlay moves the view and keeps the source.** When the
  display set that a reference names (by `displaySetId`, `volumeId` or image) is
  an overlay of a planar viewport, as the PET of a fusion,
  `setViewReference` moves the view to the plane and the point of the
  reference, and the source and the order of the layers stay, as on the
  legacy volume viewport. The slice index of such a reference counts in the
  overlay and is not used; a stack goes to its image at the point of the
  reference. In 5.x the next planar viewport made the overlay its source.
  A reference that names the source, or a display set that the viewport
  does not show, does what it did; the time point of a dynamic overlay is
  selected as before.
- **No view reference changes the source.** `setViewReference` moves the
  view and never makes the display set that it names the source. This holds
  also while `addDisplaySet(displaySetId, { role: 'source' })` mounts its
  display set: a reference of the old source that comes before the new layer
  is in place, as from a synchronizer, moves the view and leaves the new
  source. An earlier build of 6.0 made the old source the source again there:
  after the mount `getSourceDisplaySetId()` named the old display set and
  `getRenderPlan()` put it first, while the layers gave the role of the
  source to the new one. To change the source, mount the display set with
  `role: 'source'`.
- **`IMAGE_SPACING_CALIBRATED` fires from `calibrateSpacing(imageId)`,** and
  its detail has `worldToIndex` and `scale`. It does not fire by itself when
  a newly shown image has another calibration, as it did on the legacy stack
  viewport. `utilities.calibrateImageSpacing` of the tools makes the call. An
  application that writes a calibration into the metadata itself makes the
  call too, or the annotations of that image are not worked out again.
- **`getFrameOfReferenceUID()` always returns a string.** It takes no slice
  index. For images without a frame of reference it is a name made from the
  set of their images, `noFrameOfReference-<number of images>-<digest>`, where
  the legacy viewport returned undefined. The digest is the SHA-256 of the
  sorted URIs of the images (`utilities.imageIdToURI`) as a JSON array, read
  as UTF-16 code units of two bytes, the high byte first, in 64 hexadecimal
  digits, so two different sets of images do not get one name.
  `utilities.getImagesFrameOfReferenceUID(imageIds)` gives that name, and a
  surface that polySeg converts from a labelmap of such images takes it, so
  `SegmentationIntersectionTool` draws its cut on the planar viewports of
  the images. So every planar viewport and every display set of the same
  images has the same frame of reference, as on the legacy viewports: each
  takes the view references of the others, and an annotation drawn on one of
  them is in the group of the others and shows on each viewport of its
  image. Other images
  without a frame of reference have another one: their annotations are in
  another group, where the legacy viewports put the annotations of all such
  images in one group (`undefined`), and `getAnnotations(toolName, element)`
  gave them all. In 5.x the next planar viewport made up a frame of
  reference for each viewport, so two viewports of the same images did not
  share annotations or view references. Only a viewport with no data still
  gives the 5.x name made of the type and the id of the viewport
  (`planarNext-viewport-<viewportId>`). An earlier build of 6.0 made the name
  with a 32-bit hash in place of the digest (the FNV-1a hash of the sorted
  URIs joined by new lines, `utilities.fnv1aHash`). A view reference saved
  with that earlier name still restores: `setViewReference` and
  `isReferenceViewable` take it in place of the new name, at the top of the
  reference and in its plane restriction, when it names one of the images of
  the viewport, and `getViewReference` gives the new name.
- **Stored annotations of images without a frame of reference take the new
  name.** An annotation stored from 5.x, or from a 5.x next viewport, holds
  `undefined` or `planarNext-viewport-<viewportId>` in
  `metadata.FrameOfReferenceUID`, and in `metadata.planeRestriction` when
  it has one. An annotation stored from an earlier build of 6.0 may hold the
  earlier name of the images, which is not the name of their group either. `annotation.state.addAnnotation(annotation, element)` puts it
  in the group of the viewport, but its metadata keeps the old name, which
  `viewport.isReferenceViewable` compares with the frame of reference of
  the viewport, so the annotation tools can leave it out. The earlier name of
  6.0 passes that check when the annotation names one of the images of the
  viewport; the 5.x names do not. Show the images of
  the annotation (its `metadata.referencedImageId`) on the viewport first,
  then write the frame of reference of the viewport into both places and
  add it:

  ```ts
  import type { PlanarViewport } from '@cornerstonejs/core';
  import { annotation, type Types } from '@cornerstonejs/tools';

  function restoreAnnotation(
    stored: Types.Annotation,
    viewport: PlanarViewport
  ): void {
    const frameOfReferenceUID = viewport.getFrameOfReferenceUID();
    const { metadata } = stored;

    if (metadata) {
      metadata.FrameOfReferenceUID = frameOfReferenceUID;

      if (metadata.planeRestriction) {
        metadata.planeRestriction.FrameOfReferenceUID = frameOfReferenceUID;
      }
    }

    annotation.state.addAnnotation(stored, viewport.element);
  }
  ```

- **`getImageData()` of a stack gives a plain object as `imageData`,** not a
  vtk.js image data. It has `getDirection`, `getDimensions`, `getSpacing`,
  `getBounds`, `worldToIndex` and `indexToWorld`, on the GPU and on the CPU.
  So the bounds and the value at a world point are read in one way for a
  stack and for a volume, see the rows `getBounds()` and
  `getIntensityFromWorld()` of
  [the map](./3-api-map.md#members-of-the-volume-viewport-only).
- **`getDefaultImageData()` of a planar viewport answers on the CPU too.** For
  a volume drawn on the CPU it gives the vtk.js image data of the volume, as
  for a CPU slice drawn on the GPU. For a stack drawn on the CPU it gives the `imageData`
  of `getImageData()`, the plain object above. The 5.x next planar viewport
  gave undefined for both, so the ONNX segmentation controller of
  `@cornerstonejs/ai` threw on a CPU viewport.

### An overlay of a streaming volume shows no copy of another slice

A volume that loads with the interleaved retrieve stages
(`ProgressiveRetrieveImages.coarseInterleavedRetrieveStages`, the default of
OHIF) first fills each frame that has not arrived with a copy of the image of a
loaded frame near it, up to 32 frames away. A source shows those copies: they
are its coarse preview, and that stays. In 5.x and in 6.0.0-beta.2 an overlay
drew them too, so a PET over a CT showed another slice of the PET (in OHIF, a
copy of the frame 27 slices away, then of a neighbour) until the frame on the
plane of the CT arrived.

In 6.0 an overlay draws nothing where its plane reads a frame that holds no data
of its own position (a copy, or nothing yet), until that frame arrives at any
quality (`SUBRESOLUTION` and up). In the acquisition plane that is the frame on
the plane; between two frames the nearest one, within half a slice, is enough
for the sampled slice paths, which then read it alone; a slab needs every frame
of the slab, and a sagittal, coronal or oblique plane every frame that it
crosses, so such an overlay shows once the frames that it crosses have loaded.
The application changes nothing; a labelmap is not a streaming volume and
draws as before.

```ts
viewport.setDisplaySets(
  { displaySetId: 'ct', options: { mode: 'volume', initialImageIdIndex: 40 } },
  { displaySetId: 'pt', options: { mode: 'volume', role: 'overlay' } }
);
// Before: the PET layer showed copies of other PET slices while it loaded.
// Now: the PET layer is empty on slice 40 until its frame there arrives.
```

### One IMAGE_VOLUME_MODIFIED for an image and its copies

A streaming volume fired `IMAGE_VOLUME_MODIFIED` once for each frame that a
delivery changed. The interleaved retrieve stages copy each image that arrives
into the empty frames near it, in the same task, so the 135 images of a PET
fired 518 events, and every listener ran 518 times. In 6.0 the volume fires one
event for the deliveries of one task (an image and its copies, or one batch of
the images that the cache already held): 135 events for that PET. The event
fires in a microtask after the deliveries, before any render, and the last one
before `IMAGE_VOLUME_LOADING_COMPLETED`. Its detail is as before
(`volumeId`, `numberOfFrames`, `framesProcessed`, `FrameOfReferenceUID`), with
the numbers of the last delivery.

```ts
eventTarget.addEventListener(Events.IMAGE_VOLUME_MODIFIED, onModified);
volume.load();
// Before: onModified ran once for each frame that a delivery changed (518).
// Now: once for each image and the copies of it (135), never after
// IMAGE_VOLUME_LOADING_COMPLETED.
```

A listener that counted the events to follow the load reads
`detail.framesProcessed` or `volume.getImageQuality(index)` instead. While a
volume loads, the sampled slice paths of a planar viewport draw again only when
a frame that their plane reads changed, so a copy into a frame that the view
does not show costs no sample of the slice. Both backends follow that rule: on
the CPU (`renderBackend: 'cpu'`) a change of a frame of the plane draws at the
next animation frame, where 6.0.0-beta.2 sampled again at each event and drew
at most once per `rendering.planar.cpuVolume.volumeModifiedThrottleMs`
(5000 ms by default). That throttle still holds for a plane that reads more
than four frames (a sagittal, coronal or oblique view of an axial series, a
thick slab) and for an edit of the voxels of a loaded volume.

### The default window of a streaming volume

A volume whose metadata gives no window takes the range of its middle image
(`floor(N / 2)`), as before. That image came from a second request, made after
the volume had queued every request of its retrieve stages, so the mount of
the volume (`setDisplaySets`) waited for the whole load. In 6.0 the window of
a streaming volume reads the image that the volume itself loads: the image of
the cache once the volume has that frame, else the pending request of the
volume for it. A volume that does not stream loads the image as before. The stages ask for that image first: a
position between 0 and 1 of a stage is rounded to the nearest image, so
position 0.5 is image `floor(N / 2)` for an even count too (it was
`floor((N - 1) / 2)`). A PT volume scaled to SUV takes the window 0 to 5 at
once, as it did after loading the image. The mount settles once the middle
image is there.

```ts
await viewport.setDisplaySets({
  displaySetId: 'pt',
  options: { mode: 'volume' },
});
// Before: resolved after every image of a PET without a window had loaded.
// Now: resolves after its middle image, the first request of the stages.
```

### When a pane draws while a volume loads

A streaming volume asked every rendering engine to render each viewport that
showed it at every 2% of its deliveries (`utilities.autoLoad`), and once more
at the end of its load. In 6.0 the volume asks for no render while it loads:
the render path of each layer that shows it follows `IMAGE_VOLUME_MODIFIED`
and `IMAGE_VOLUME_LOADING_COMPLETED` and draws its pane only when its own
picture can have changed, at most once per animation frame:

- a plane that reads a few frames (the acquisition plane of the volume, a thin
  slab along it) draws at the next animation frame when one of its frames
  changed, and nothing for a delivery into another frame;
- a plane that reads most frames (the other planes of the grid, an oblique
  plane, a slab such as a MIP over the whole volume, on the sampled slice
  paths and on the slab path of the 3D texture) draws at the ticks of one
  clock that every loading picture shares, every 100 ms, so the layers and
  the panes that a load changes draw in the same animation frame; the first
  delivery that gives such a pane something to show is drawn at the next
  animation frame, and the ticks pace only the updates after it (the
  sagittal and coronal panes of OHIF's TMTV layout showed their first rows up
  to 100 ms after they arrived);
- an overlay that draws nothing yet (its frames hold no data of its plane)
  draws no frame until it has something to draw;
- the end of the load draws at once.

In the TMTV layout of OHIF (ten panes, a CT and a PET streaming) the panes
drew 263 frames during the load in a page without OHIF, and 5.18.3 drew 274;
they draw 31 now, and the pictures at the end are the same. `utilities.autoLoad(volumeId)`
is unchanged: an application that calls it still renders every viewport that
shows the volume. The protected fields `autoRenderOnLoad`, `reRenderFraction`
and `reRenderTarget` of the streaming volume are gone.

```ts
document.addEventListener('CORNERSTONE_IMAGE_RENDERED', countFrames, true);
await viewport.setDisplaySets({
  displaySetId: 'pt',
  options: { mode: 'volume' },
});
// Before: every pane that shows the PET fired IMAGE_RENDERED at every 2% of
// its deliveries, whether its picture changed or not.
// Now: a pane fires IMAGE_RENDERED when its picture changed: about 10 times a
// second for a pane across the frames, once per arriving frame of its plane
// for the acquisition plane.
```

An application that drew something of its own on each render of a pane during
a load (a progress overlay that listens to `IMAGE_RENDERED`) listens to
`IMAGE_VOLUME_MODIFIED` and reads `detail.framesProcessed` instead.

### A volume whose requests the application queued loads once

`getImageLoadRequests()` hands out the requests of the images of a streaming
volume, for an application that orders the requests of several volumes itself
(OHIF's `interleaveTopToBottom`: one request of the CT, one of the PET, in
turn). The volume did not know that its requests were out, and the mount of a
6.0 planar or 3D viewport loads its volume (`volume.load()`): a second load
started with the retrieve stages, which copied each image that it delivered
into the frames near it, delivered about half of the frames twice, and took
request slots beside the application's requests. In 6.0 the volume counts as
loading once it has handed out its requests: a later `load` joins that load,
starts no second one, and its callback is called when the load ends (a `load`
during a load dropped its callback before).

```ts
const requests = [...ct.getImageLoadRequests(0), ...pt.getImageLoadRequests(0)];
requests.forEach(queueInYourOrder);
await viewport.setDisplaySets({
  displaySetId: 'ct',
  options: { mode: 'volume' },
});
// Before: the mount started the retrieve stages of the CT beside these
// requests (372 copies into empty frames, 69 frames delivered twice).
// Now: the mount joins the load of these requests; each frame is delivered once.
```

### setDisplaySets and addDisplaySet take effect in call order

On every viewport family (planar, 3D, video, ECG and whole slide) the calls of
`setDisplaySets` and `addDisplaySet` of one viewport take effect in the order
they were made. An `addDisplaySet` made while a `setDisplaySets` still loads
waits for it and adds to its result; before, it mounted at once, and the
`setDisplaySets` then removed it (planar, 3D) or mounted beside it (an ECG
viewport could bind two waveforms). A later `setDisplaySets`, or a `destroy`,
ends both: they resolve at once, bind nothing and fire no
`DISPLAY_SETS_CHANGED`. On an ECG viewport the add of a second waveform is
refused with its message once the `setDisplaySets` has settled. The 3D and the
whole slide viewport had no queue at all; they follow the rule now too.

```ts
viewport.setDisplaySets({ displaySetId: 'ct', options: { mode: 'volume' } });
viewport.addDisplaySet('labelmap', { role: 'overlay' });
// Before: the labelmap mounted first and the CT replaced it.
// Now: the CT mounts, then the labelmap over it; DISPLAY_SETS_CHANGED fires
// for each, in that order.
```

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
- **A surface is cut by all the slices of a plane in one pass.** The worker
  of polySeg gives each triangle to the planes that it crosses, so cutting
  the 31 structures of an RTSTRUCT (2,265 contours) by the 512 slices of a
  sagittal pane takes about 2 s where a vtkCutter run per plane took about
  48 s. Points of a surface at one position count as one point, so a loop
  that crosses a place where the surface repeats a point is one closed path;
  the per-plane run split such loops into open pieces (the skin of that
  RTSTRUCT gave 10 paths on a sagittal slice, now 2: its outer and inner
  boundaries). Each contour of the result of
  `clipAndCacheSurfacesForViewport` has the `sliceIndex` of its slice. The
  points of a contour are the same, in another order.
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
it, the render backend that draws it, and why.

```ts
viewport.getRenderPlan();
```

```ts
[
  {
    displaySetId: 'ct',
    role: 'source',
    slice: 'cpu',
    draw: 'gpu',
    backend: 'gpu',
    reason: 'slice',
  },
];
```

`slice` says how the slice is made: `frame` (the acquired frame is the image),
`cpu` (the CPU cuts the slice out of the volume) or `gpuVolume` (the GPU cuts
it out of a 3D texture of the volume). `draw` is `gpu` or `cpu` (a 2D
canvas). `backend` is the render backend that draws the layer, as
`setRenderBackend()`, the `renderBackend` mount option and
`registerRenderBackend()` name it: `'gpu'`, `'cpu'` or the id of an extension
backend, never `'auto'`. `reason` says why the layer is on this path:
`frame`, `slice`, `slab`, `sliceFirstOff`, `notSampled`, `floatFilter`,
`textureSize`, `textureReduced`, `textureFailed`, `slabTooLarge`, `pinned`,
`noWebGL` or `contextLost`.

`getRenderPlan()`, `Events.RENDER_PLAN_CHANGED` and their types
(`RenderPlanLayer`, `RenderPlanSlice`, `RenderPlanDraw`, `RenderPlanReason`,
`RenderPlanChangedEventDetail`) are stable API. `Events.RENDER_PLAN_CHANGED`
fires on the element and on the `eventTarget` when the plan of a layer
changes. Cornerstone changes the path of a layer by itself only when the new
path draws the same pixels. `retryGpu()` lets the layers that left the GPU
try it again.

The plan is the one public description of a render path. The 5.x names of the
paths are gone from the public API: `ActorRenderMode`, `ActorMapperProxy`,
`ActorEntry.actorMapper`, the `renderMode` of a layer and the `renderMode`
option of a 3D mount. An actor entry names its layer by `displaySetId`:

```ts
// Before
const isImageSlice =
  entry.actorMapper?.renderMode === ActorRenderMode.VTK_IMAGE;
const mapper = entry.actorMapper.mapper;

// After
const layer = viewport
  .getRenderPlan()
  .find((planLayer) => planLayer.displaySetId === entry.displaySetId);
const isImageSlice = layer?.slice === 'frame' && layer.draw === 'gpu';
const mapper = entry.actor.getMapper();
```

| 5.x render mode   | `slice`     | `draw` |
| ----------------- | ----------- | ------ |
| `vtkImage`        | `frame`     | `gpu`  |
| `vtkSampledSlice` | `cpu`       | `gpu`  |
| `vtkVolumeSlice`  | `gpuVolume` | `gpu`  |
| `cpuImage`        | `frame`     | `cpu`  |
| `cpuVolume`       | `cpu`       | `cpu`  |

`viewport.getCurrentMode()` gives `stack` or `volume` for the content, and
`entry.actor.isA('vtkImageSlice')` tells an image slice actor from a canvas
actor (`CanvasActor`) or a volume actor.

An extension backend registers one render mode for each way of making the
slice, in the slots of the same words as `slice`:

```ts
// Before
registerRenderBackend({
  backend: 'myOrg:webgpu',
  renderModes: {
    image: { id: 'myOrg:webgpuImage', createDefinition },
    volume: { id: 'myOrg:webgpuVolume', createDefinition },
  },
});

// After
registerRenderBackend({
  backend: 'myOrg:webgpu',
  renderModes: {
    frame: { id: 'myOrg:webgpuImage', createDefinition },
    gpuVolume: { id: 'myOrg:webgpuVolume', createDefinition },
  },
});
```

`frame` is required, `cpu` and `gpuVolume` are optional. `image` is `frame`
and `sampledVolume` is `cpu`; `volume` is `cpu` on a backend with
`surface: 'cpu'` (the built-in CPU backend filed its CPU slicer there) and
`gpuVolume` on any other.

## Viewport queries

A planar and a 3D viewport answer five questions that an application asked
of the cache, of a vtk mapper or of the actor list before. The answers come
from the data, so they are the same on every render path.

### The volumes on display

```ts
// Before
const volumeIds = [
  ...new Set(
    viewport
      .getActors()
      .map((entry) => entry.referencedId)
      .filter((id) => viewport.hasVolumeId(id))
  ),
];

// After
const volumeIds = viewport.getVolumeIds();
```

`getVolumeIds()` gives each volume once, the source first, then the overlays
in mount order. It leaves out the labelmap of a segmentation, an overlay
whose descriptor has a `reference` of kind `'segmentation'` as the tools
mount it, so a window level panel with a row for each volume gets no row for
a hydrated SEG. `getVolumeIds({ includeSegmentations: true })` lists the
labelmaps too. In stack mode the list is empty. A labelmap that the tools draw
as images beside a slice cut on the CPU is not a volume of the viewport, and
is in neither list.

### The display set of a volume

```ts
// Before (6.0.0-beta.2)
const displaySetId = viewport.findDataIdByVolumeId(volumeId);

// After
const displaySetId = viewport.getDisplaySetIdForVolumeId(volumeId);
```

A planar and a 3D viewport have it. When two mounted display sets share the
volume, the answer is the source when it is one of them, else the first in
mount order; to change one of them, keep its id from `getDisplaySets()`. The
codemod renames the call.

### The range of the values

```ts
// Before
const volume = cache.getVolume(volumeId);
const range = volume
  ? volume.voxelManager.getRange()
  : actor.getMapper().getInputData().getPointData().getScalars().getRange();

// After
const range = viewport.getScalarRange(displaySetId);
```

`getScalarRange(displaySetId)` gives `[min, max]` of the data of a display
set, of the source without an id:

- A display set drawn as a volume, and the volume of a 3D viewport: the range
  of the whole volume, as `voxelManager.getRange()` gives it from the pixel
  values that the loader gave for each image. While the volume loads it is
  the range of the images that have arrived: read it again at
  `IMAGE_VOLUME_MODIFIED`. A dynamic volume gives the range of its time point
  on display.
- A display set drawn as images (a stack): the range of the image on display,
  its `minPixelValue` and `maxPixelValue`. Read it again at `NEW_IMAGE`.

It is undefined before the data arrives, for a surface and for a display set
that is not mounted. A video, a whole slide and an ECG viewport have no window
and no such member.

`ViewportColorbar` of the tools takes its image range from it. On a viewport
drawn on the CPU (a stack, or a volume with `renderBackend: 'cpu'`) the
colorbar showed `[-1000, 1000]`, its default; it shows the range of the data
now. For a stack on the GPU it read the pixels of the image, which gives the
same numbers where the loader's values are those of the pixels.

### The acquisition plane

```ts
// Before (6.0.0-beta.2)
const volume = cache.getVolume(viewport.getVolumeId());
const inAcquisitionPlane = utilities.isAcquisitionPlaneNormal(
  volume,
  viewport.getViewReference().viewPlaneNormal
);

// After
const inAcquisitionPlane = viewport.isInAcquisitionPlane();
```

A stack is always in its acquisition plane. A volume is when the view plane
normal is the scan axis of the source volume, by
`utilities.isAcquisitionPlaneNormal`: an axial view of an axial series is, a
sagittal reformat or an oblique plane of it is not. The same rule (a tilt
that moves the plane by less than half a slice across the image) decides
which standard orientation shows the acquired images, see
[A series tilted less than half a slice](#a-series-tilted-less-than-half-a-slice). With nothing mounted the
answer is false. `utilities.isInAcquisitionPlane(viewport)` stays: it calls
the member of a planar viewport, gives true for a video and a whole slide
viewport, and false for a 3D viewport, which has no plane of its own, and for
an ECG viewport.

### A 3D viewport that shows a surface

```ts
// Before: a 3D viewport whose source is a surface
viewport.getCurrentMode() === 'unknown';

// After
viewport.getCurrentMode() === 'geometry3d';
```

`getCurrentMode()` of a 3D viewport is `'volume3d'` when its source is a
volume and `'geometry3d'` when its source is a surface, where it was
`'unknown'`. `utilities.getViewportContentMode(viewport)` gives the same, and
`utilities.viewportIsInVolumeMode(viewport)` is false for it. A test of the
content such as `mode !== 'empty' && mode !== 'unknown'` now counts a 3D
viewport with surfaces as one that shows something.

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
- **The canvas that shows keeps its pixels in memory.** The CPU draw step
  reads that canvas back at each draw that blends a translucent layer over
  what is below it (a fusion), composes labelmaps that overlap, or sharpens
  or smooths the picture, so its 2D context is made with
  `willReadFrequently: true`. Chrome no longer warns "Canvas2D: Multiple
  readback operations using getImageData are faster with the
  willReadFrequently attribute set to true", which 6.0.0-beta.2 gave on the
  CPU at the first images of a fusion, of an MPR that shows the faces of the
  volume (their edge pixels are blended), and of a stack whose images have
  two sizes. `viewport.getCanvas().getContext('2d')` gives that
  context: what an application draws on it is drawn on the CPU, and a read
  of it (`getImageData`) is a copy from memory. Chrome moved such a canvas
  off the GPU itself after its second read; a canvas that was never read
  now starts there too, and a draw of a stack on the CPU took the same time
  (on a Mac, 1.4 ms at 512 by 512 pixels and 4.7 ms at 1024 by 1024, with
  and without the attribute). The canvas into which the CPU draw step
  writes the pixels of an image is no longer read back at all, and the
  overlay layer of a video viewport, which composes its labelmaps the same
  way, keeps its pixels in memory too.
- **The canvas that shows has the size of the GPU canvas.** A planar
  viewport sizes its CPU canvas as the rendering engines size the canvas of
  a pane, at the first frame and at each resize: the CSS size of the box of
  the pane (`getBoundingClientRect()`) times the device pixel ratio,
  rounded. 5.x and the 6.0 betas sized the CPU canvas by `clientWidth` and
  `clientHeight`, which are rounded CSS sizes, so a pane whose CSS size
  times the device pixel ratio is not a whole number had a CPU canvas one
  device pixel off its GPU canvas: a pane of 333.3 by 250.7 CSS pixels at a
  ratio of 1.25 had a CPU canvas of 416 by 314 pixels and a GPU canvas of
  417 by 313. Code that sizes a canvas of its own to match the one that
  shows reads it from the canvas:

  ```ts
  // Before: the size of the CPU canvas, which could be a pixel off the GPU one
  const width = Math.round(element.clientWidth * window.devicePixelRatio);

  // After: the size of the canvas that shows, on the CPU and on the GPU
  const { width, height } = viewport.getCanvas();
  ```

- **The VOI lookup table and the modality lookup table of an image are not
  applied.** The GPU path never applied them, and the CPU path of 5.x did. The
  window of the image is applied as before.
- **A linear image is drawn once more, exactly, when the view rests.**
- **A mount draws once on the CPU.** The renders that `setDisplaySets` asks
  for while it mounts wait, and the viewport draws once when the mount ends,
  before `DISPLAY_SETS_CHANGED`, so a mount fires one `IMAGE_RENDERED`, as
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

- **A labelmap is drawn with its outline.** The CPU draws the outline as the
  GPU does, in screen pixels: the outline width of the style, wider for the
  active segment by `activeSegmentOutlineWidthDelta`, the inactive styles
  (`outlineWidthInactive`, `fillAlphaInactive`, `outlineOpacityInactive`),
  and the outline and fill alphas. The labelmap of a volume gets an outline at
  the faces of the volume, as on the GPU; the labelmap of a stack none at the
  edges of the image. The legacy CPU stack viewport drew no labelmap at all,
  so a segmentation now looks the same after a move to the CPU. On the CPU a
  labelmap is read with nearest, as on the GPU, also when its display set has
  a linear interpolation. With a slab, the GPU volume path measures the
  outline in voxels; the CPU stays in screen pixels.
- **Labelmaps that overlap blend as on the GPU.** The GPU blends the
  translucent layers of a view without an order (vtk.js order independent
  translucency): where two labelmaps overlap, the colour is the mean of their
  colours weighted by their alphas, and it covers the image with the alpha
  `1 - (1 - a1) (1 - a2)`. The CPU now does the same, so the order in which
  the segmentation representations were added does not change the picture on
  either path. In 5.x a next viewport on the CPU drew the labelmap added last
  on top.

Not equal yet: a slab through the whole volume is not drawn on the CPU.

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
get the old look, give the CT `opacity: 0.925` in its appearance (`0.726`
for the other bounds); with it a fusion matched the legacy picture within two
levels of 255.

## Image defaults

- **A MONOCHROME1 image starts inverted.** The photometric interpretation of
  the metadata decides, and each image of a mixed stack follows its own until
  the application sets `invert`.
- **An image without a window starts at its pixel range.** It was 0 to 255.
- **A volume without window metadata** starts at the window its layer draws
  with.
- **`invert` inverts a colour (RGB) volume.** The legacy volume viewport
  inverted the transfer function of an RGB volume, which vtk.js ignores for
  three dependent components, so `invert: true` left its colours as they
  were. In 6.0 the colours are inverted, as for a grey volume; leave `invert`
  out to keep the 5.x picture.

## The array type of a volume

- **A volume takes the array type that its series can hold.** The type is
  read from the metadata of the series: the bits allocated, the bits stored,
  the pixel representation, and the modality LUT and the scaling of the
  first, the middle and the last image. A 12 bit MR is a `Uint16Array`
  volume, a 16 bit series with 8 bits stored and a modality LUT that keeps
  it below 256 is a `Uint8Array` volume, and an 8 bit series stays a
  `Uint8Array` volume, so a series that truly is 8 bits costs no more memory.
  In 5.x and in 6.0.0-beta.2 a volume made while its first, middle and last
  images were in the cache took the array of those images, and the image
  loader gives an image of a stack the smallest array that holds its own
  values. A 12 bit MR whose outer slices and middle slice held values below
  256 became a `Uint8Array` volume whose other slices were cut at 255
  (`getCompleteScalarDataArray()`, the GPU texture and the picture of an
  MPR), while `voxelManager.getRange()` gave the true range, `[0, 943]` for
  the MR of OHIF M65. The voxel manager of a volume also answers
  `getConstructor()` with the type of the volume, where it gave the array of
  its first image.

  ```ts
  await Promise.all(imageIds.map((id) => imageLoader.loadAndCacheImage(id)));

  const volume = volumeLoader.createAndCacheVolumeFromImagesSync(
    volumeId,
    imageIds
  );
  const values = volume.voxelManager.getCompleteScalarDataArray();
  ```

  Before, `values` of that MR was a `Uint8Array` whose values stopped at 255;
  after, it is a `Uint16Array` with every value.

  A volume of derived or local images (`createAndCacheDerivedImages`,
  `createAndCacheLocalImage`) keeps the array of its images: their pixel
  module says it, and an `Int16Array` image now says that it is signed.

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
  framing and for `getRotation()`, which now gives the rotation of the
  view state and no longer always 0.
- **The slide starts at the view that the microscopy viewer fits to the
  canvas,** as on the legacy viewport. The next viewport of 5.x wrote zoom 1,
  one fixed level of the pyramid, which is another view on a slide that is not
  square or on a canvas of another size. `getViewState().zoom` is undefined
  until a slide is mounted. A slide mounted in place of another one starts at
  its own fit and keeps the rotation.
- **Pan.** A framing carries `pan`:
  `viewportProjection.withFraming(viewport, { pan })` returns the view
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
- **`viewportStatus` is `'rendered'` once the map has drawn the tiles of its
  view.** The map of the microscopy viewer draws in frames of its own and
  loads its tiles after them. `IMAGE_RENDERED` fires for each frame of the
  map, also while tiles load, as on the legacy viewport; the status becomes
  `'rendered'` when the map has drawn every tile of the view at its
  resolution (its `rendercomplete`), and again after each later complete
  draw, such as when the tiles of a zoom have come. A pass of the rendering
  engine only asks the map to draw, so after one the status is
  `'needsRender'` until the map has drawn. In 6.0.0-beta.2 the status
  stayed `'preRender'`, so code that waited for `'rendered'` waited for
  ever. The legacy viewport was `'rendered'` after the first pass of the
  rendering engine, before any tile had come.
- **`addDisplaySet` mounts a slide.**
  `viewport.addDisplaySet(displaySetId, options)` takes the
  `WSIMountOptions` of an entry of `setDisplaySets`, mounts what that entry
  mounts, and leaves the slides on display as they are. Without a `role`
  the slide is the source of a viewport that shows nothing, else an
  overlay: a microscopy viewer of its own over the slides on display, with
  the view of the source. In 6.0.0-beta.2 the call threw
  `No render path for wsi/wsi/undefined`.
- **The slide that the viewport is about is its source.** With two slides,
  the calls without a display set id (`setDisplaySetAppearance(props)`,
  `getDisplaySetAppearance()`), the frame of reference, `getImageData()`,
  `getCurrentImageId()`, `getViewReference()`, the transforms and the view
  that the viewport reads back from the map follow the source, as on every
  family. In 6.0.0-beta.2 they followed the last entry of `setDisplaySets`,
  an overlay. The window of a slide (`voiRange`, `averageWhite`) is drawn on
  that slide, also on an overlay: in 6.0.0-beta.2 only the window of the
  last slide was drawn.

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
- **A resize keeps the camera and the layout of the traces.** Without a
  sensitivity the traces fill the height of the canvas at the mount and at
  a reset of the pan and the zoom (`resetViewState()`, the toolbar reset,
  `renderingEngine.resize()` with `keepCamera` false). A resize keeps that
  layout and the camera, as a planar viewport keeps its own: the time and
  the amplitude at the centre of the canvas stay at the centre, and the
  height of the canvas in units of the traces stays. Across a change of the
  width the traces keep their size in pixels and show more or less time;
  across a change of the height they scale with the canvas. A pane of
  another shape shows the same traces with room above and below them, or
  on the sides; `getContentDimensions()` stays. In 6.0.0-beta.2 the layout
  filled the height of the new shape and the zoom against the fit stayed,
  so the traces moved up or down and a framing read after the resize did
  not give back the view:

  ```ts
  // On a pane of 400 by 300 pixels
  viewport.setViewFraming({ pan: [40, 20], zoom: 1.5 });
  element.style.width = '600px';
  renderingEngine.resize(true);
  viewport.getViewFraming();
  // Before (6.0.0-beta.2): { zoom: 1.5, pan: [60, -45] }, the traces moved up
  // After: { zoom: 1.5, pan: [40, 20] }, the traces where they were
  ```

- **An ECG viewport shows one waveform.**
  `viewport.addDisplaySet(displaySetId, options)` takes the
  `ECGMountOptions` of an entry of `setDisplaySets` and mounts what that
  entry mounts: the waveform, with the view state of its full record. In
  6.0.0-beta.2 the call threw `No render path for ecg/ecg/undefined`. A call
  that would show two waveforms rejects and changes nothing:
  `setDisplaySets` with two display sets, and `addDisplaySet` of another
  display set on a viewport that shows a waveform. In 6.0.0-beta.2 the
  second waveform was mounted and never drawn, while the time window came
  from it. Show a second waveform in a second ECG viewport, or in place of
  the first with `setDisplaySets`:

  ```text
  [ECGViewport] An ECG viewport shows one waveform, and addDisplaySet("ecg:second") would show 2: "ecg:first", "ecg:second". Mount one with setDisplaySets({ displaySetId }), which shows it in place of the waveform on display, and show the others in other ECG viewports.
  ```

## 3D viewports

- **A reset fits like the first mount.** `resetViewState()` zoomed out further
  than the first picture.
- **The first mount fits the camera in the orientation of the options,** also
  when a camera was written while the viewport showed nothing, as the reset
  of `TrackballRotateTool` on a resize does. In 5.x the next 3D viewport put
  that camera back after the fit, so it kept the default camera of vtk.js
  until `resetViewState()`, and that reset kept the wrong orientation. The
  legacy 3D viewport reset the camera at `setVolumes` in the same way.
- **A mount fires `CAMERA_MODIFIED`, as a planar mount does.** It fires once
  for the call, after the display sets are bound and before
  `DISPLAY_SETS_CHANGED`, with the camera that the view opens with as its
  `camera` and as its `previousCamera`: at the first mount, and at a
  `setDisplaySets` (or an `addDisplaySet` on a viewport that shows nothing)
  whose fit changed the camera on display, for other data or for a camera
  that was turned or zoomed since the last fit. A mount that leaves the
  camera as it was fires none: the same data again on an untouched camera,
  or an overlay added with `addDisplaySet`. With `suppressEvents` it fires
  none. 6.0.0-beta.2 fired none at a 3D mount, so a camera position group,
  `OrientationControllerTool` and `VolumeCroppingTool` saw the fit only at
  the next change of the camera; the legacy 3D viewport fired one at each
  `setVolumes`, through its reset. The mount still draws in one frame.

  ```js
  viewport3D.element.addEventListener(Events.CAMERA_MODIFIED, onCamera);
  await viewport3D.setDisplaySets({ displaySetId: 'ct' });

  // 6.0.0-beta.2: onCamera is not called until the camera changes
  // Now: onCamera is called once, before DISPLAY_SETS_CHANGED, and
  // detail.previousCamera is the camera of detail.camera
  ```

- **A 3D viewport turns to the orientation of its options when it is made,**
  as the legacy 3D viewport did, so a surface or a prop of a tool that shows
  before any volume is seen from that side, and `resetViewState()` fits it
  there. In 5.x a next 3D viewport kept the camera of vtk.js until a volume
  was mounted; only the adapter turned it. The acquisition orientation, which
  needs a volume, and no orientation keep the camera of vtk.js, as on the
  legacy viewport.
- **`setViewReference()` moves the camera.** It did nothing, so a camera
  synchronizer between two 3D viewports did nothing.
- **A preset is a key of the appearance, and it stays.**
  `setDisplaySetAppearance(displaySetId, { preset: 'CT-Bone' })` applies a
  preset. A later change of the window, of
  `invert` or of the opacity rescales the colours that are there. In 5.x each
  appearance update rebuilt a grey ramp, so a preset was lost at the next
  change of the window.
- **The colour keys of the legacy `setProperties` are appearance keys:**
  `voiLUTFunction` (the legacy `VOILUTFunction`), `colormap` (with `name`,
  `opacityMapping` and `threshold`), `blendMode`, `sharpening` and
  `smoothing`.
- **`resetDisplaySetAppearance(displaySetId)`** removes the overrides and
  goes back to the defaults of the volume; the transfer functions are built
  anew. It does not move the camera: `resetViewState()` does.
- **Events.** `DISPLAY_SET_APPEARANCE_CHANGED` fires from a 3D viewport, once
  for each change and once when a display set is mounted, and
  `DISPLAY_SETS_CHANGED` fires on each mount and removal. None of them fired
  in 5.x. A
  colormap change fires one event, where 6.0.0-beta.2 fired `VOI_MODIFIED`
  and `COLORMAP_MODIFIED`. `PRESET_MODIFIED` does not fire, nothing listened
  to it: a preset change fires `DISPLAY_SET_APPEARANCE_CHANGED` with
  `changedKeys: ['preset']`. Read the preset with
  `getDisplaySetAppearance(displaySetId)?.preset`.
- **A surface is a display set.**
  `viewport.addDisplaySet(geometryId)` mounts
  the surface of a geometry of the cache, `viewport.removeDisplaySet(geometryId)`
  removes it, and its colour, opacity and visibility are its appearance.
  `geometryId` is the key that was given to
  `geometryLoader.loadAndCacheGeometry`, not `geometry.id`: for a mesh loaded
  from a URL the two differ, and `addDisplaySet(geometry.id)` throws. A
  3D viewport has no `addActor`, `addActors`, `setActors`, `removeActors` and
  `getActor`, and `ACTORS_CHANGED` is gone. `getActors()` stays and
  gives the actors of the display sets.
  [The 3D viewport](./3-api-map.md#the-3d-viewport) has the call for each
  member.
- **A 3D mount has no option `renderMode`.** What a display set shows
  follows from its descriptor: image ids give a volume, a geometry id (or the
  id of a geometry of the cache, with no registration) a surface.

  ```ts
  // Before
  await viewport.addDisplaySet(geometryId, { renderMode: 'vtkGeometry3d' });

  // After
  await viewport.addDisplaySet(geometryId);
  ```

  The codemod removes the key where its value is `'vtkVolume3d'` or
  `'vtkGeometry3d'`, and `'auto'` on a viewport typed as a 3D viewport.

- **A geometry display set needs no image ids.** Register it as
  `{ geometryId, reference }` with
  `displaySetRegistry.add`, and
  `addDisplaySet(displaySetId)` mounts the geometry `geometryId`, with the
  representation UID of the reference on its actor entry. In 5.x such a
  registration needed `imageIds: []`: without it the mount loaded the display
  set id as a geometry id and rejected.
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
  display set, and the colour is its appearance. On the legacy viewport the
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
  read and written through `viewportProjection`, as on every next viewport.
  A 3D viewport also has `getZoom`, `setZoom`, `getPan` and `setPan`, as the
  legacy 3D viewport had. They call `viewportProjection`: `getZoom()` is the
  zoom of the framing, `getPan()` is its pan in canvas pixels on the
  screen (`pan * zoom`), and `setZoom(zoom, canvasPoint)` and `setPan(pan)`
  are one view state change each. The second argument of `setZoom` is a
  canvas point that the picture stays under, not `storeAsInitialCamera`. The
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
  and appearance events, as on the legacy viewport.
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
  `callback` that edited the actor. The appearance of the display set says
  how the data looks. These give the picture of the callbacks that the
  examples used:

  | The callback set                                            | Appearance                                                                               |
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
  gives: `displaySetId` is the video, `sliceIndex` the 0-based index of the
  frame, `numberOfSlices` the number of frames and `imageId` the image id of
  the frame. `image` is
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
- **`addDisplaySet` mounts a video.**
  `viewport.addDisplaySet(displaySetId, options)` takes the
  `VideoMountOptions` of an entry of `setDisplaySets`, mounts what that
  entry mounts, and leaves the videos on display as they are. In
  6.0.0-beta.2 the call threw `No render path for video/video/undefined`.
  Without a `role` the video is the source of a viewport that shows
  nothing: it sets the view up, shows `options.frameNumber` and fires
  `NEW_IMAGE`. On any other viewport it is an overlay: a video element over
  the videos on display, in their view (zoom, pan, rotation) and on the
  time that the view shows, with no `NEW_IMAGE`. The second entry of
  `setDisplaySets` mounts in the same way; in 6.0.0-beta.2 it set the view
  up again and sought the element of the first video to the first frame of
  the second. A labelmap over a video is not a display set: the
  segmentation tools draw it with `addImages`. `addDisplaySet` of a
  labelmap display set rejects, as `setDisplaySets` does, with
  `The display set "…" has no imageId, which a VideoViewport needs to show it`.
- **The calls without a display set id follow the source,** also when the
  source is not the first display set, as after a mount with
  `role: 'source'`: playback, the frame, `NEW_IMAGE`, the image data, the
  image ids, the view reference and `setDisplaySetAppearance(props)`. In
  6.0.0-beta.2 they followed the first display set.
- **`voiRange` and `averageWhite` of the appearance are applied.**
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
  `pause()` are on the viewport, and there is no `togglePlayPause()`:
  `viewport.isPlaying()` tells whether the video plays, also after a tool
  started it or the video ended. In 5.x `isPlaying` was a private field of
  the legacy viewport; code that read it as a field gets a method now. The
  frame range is the view
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
- **`invert`** of the appearance is applied.
- **`canvas`** is a canvas of the size of the viewport. It is a plain field
  that holds no pixels of the frame, and there is no `getCanvas()`. The
  pixels of the frame come from `getImageData()`.
- **A video opens on its first frame,** or on `options.frameNumber`, and
  does not play to get there. In 5.x it could open on the second frame.
  Safari on iOS loads only the metadata of a video that has not played, so
  when the network of a video stays stopped with no frame for 250 ms the
  viewport plays the video muted and pauses it at once to get the frame (its
  element fires one `play` and one `pause` at mount); a video's own `muted`
  comes back after. The play can show a later frame before the pause, so the
  viewport then seeks one frame on and back, and the mount ends on the frame
  it asked for (two `seeked` events at mount). Chrome stops for a moment
  after the metadata too and then loads the frame by itself: there the video
  does not play.
- **A video that does not load rejects the mount.** When the element of the
  video fires `error` before its first frame (a URL that answers with an HTML
  page or a 404, a file that the browser cannot decode), `setDisplaySets`
  rejects with an error that names the display set, the URL and the media
  error: its code, as `MEDIA_ERR_SRC_NOT_SUPPORTED`, and the message of the
  browser. Its `cause` is the `MediaError` of the element. As for a planar
  mount that rejects, `DISPLAY_SETS_CHANGED` does not fire. The video is
  unbound and its element removed, its appearance overrides are those from
  before the call, and the next `setDisplaySets` mounts as on a new
  viewport; the videos shown before went when the call started, as they do
  for a mount that loads. A video that fails after its metadata, before its
  first frame, has fired `DISPLAY_SET_APPEARANCE_CHANGED` with cause
  `'mount'` already, as its appearance applies when it is bound. A call that
  a newer `setDisplaySets` supersedes ends at once, as on a planar viewport:
  it resolves and fires nothing, and the video that it waits for, before or
  after its metadata, stops its load (its `src` is removed and `load()`
  drops the request) and goes with its listeners, also when its server
  never answers. A later error of that video changes nothing. In
  6.0.0-beta.2 the empty `<video>` element and its request stayed until the
  browser ended the load. A video that the viewport removes
  (`removeDisplaySet`, a new `setDisplaySets`, `destroy()`) drops its
  request too. An error after the first frame, as a
  network that goes while the video plays, does not fail the mount. There is
  no time limit: `stalled` says that the data is slow and `abort` that the
  load starts again, so the call waits until the browser gives the frame or
  an error, as a planar mount waits for its image. To give up after a time,
  race the promise with a timer and mount again: the newer call supersedes
  the waiting one. In 5.x `setVideo()` waited for ever, and so did
  `setDisplaySets` of 6.0.0-beta.2.

  Before, in 6.0.0-beta.2, a URL that is not a video:

  ```ts
  // never settles, and DISPLAY_SETS_CHANGED never fires
  await viewport.setDisplaySets({ displaySetId: 'v' });
  ```

  After, in 6.0:

  ```ts
  try {
    await viewport.setDisplaySets({ displaySetId: 'v' });
  } catch (error) {
    // [VideoViewport] The display set "v" did not load its video
    // https://host/index.mp4: MEDIA_ERR_SRC_NOT_SUPPORTED (MEDIA_ELEMENT_ERROR: Format error)
    showLoadError(error.message);
  }
  ```

- **`getPan()` and `setPan()` are in canvas pixels on the screen,** `[0, 0]` at
  the fit, as on the other next viewports, and a drag of the pan tool moves
  the picture with the mouse at any rotation.
- **A resize keeps the camera,** as on a planar viewport: the height of the
  canvas in pixels of the video and the point of the video at the centre of
  the canvas stay. Across a change of the width the video keeps its size in
  pixels and its distance from the centre; across a change of the height it
  scales with the canvas. The zoom against the fit (`getZoom()`,
  `getViewFraming().zoom`) and `getPan()` read after it are those of the new
  size; the world pan stays. One `CAMERA_MODIFIED` fires. With the object fit
  `fill` the video has no one scale and fills the new size. 6.0.0-beta.2
  kept the zoom against the fit, so the video shrank or grew with the fit.
  Write the framing read before the resize back after it to keep the zoom
  against the fit:

  ```ts
  // A video of 4 by 3 on a pane of 400 by 300 pixels at zoom 1.5
  element.style.width = '250px';
  renderingEngine.resize(true);
  viewport.getViewFraming().zoom;
  // Before (6.0.0-beta.2): 1.5, the video drawn smaller
  // After: 2.4, the video at the size in pixels that it had

  const framing = viewport.getViewFraming();
  element.style.width = '250px';
  renderingEngine.resize(true);
  viewport.setViewFraming(framing);
  // Both: 1.5 against the fit of the new size
  ```

- **A framing patch with a new rotation turns first.**
  `viewportProjection.withFraming(viewport, { rotation, zoom, pan })` on
  a video applies the rotation, then the zoom, then the pan, so the pan
  reads back as written, as with two patches. In 5.x the pan of such a patch
  was measured at the old rotation and read back turned.
- **`suppressEvents`** in the options silences `CAMERA_MODIFIED` and
  `CAMERA_RESET`.
- **A labelmap over a video.** A video viewport shows a labelmap segmentation,
  and the brush, the eraser and the threshold brush paint into it. No 5.x
  release showed one, from 5.0.0 to 5.18.2. The labelmap is a stack labelmap
  with one labelmap image for each frame of the video, derived from the image
  ids of the frames (`.../frames/1`, `.../frames/2`, and so on):

  ```js
  const labelmapImageIds = imageLoader
    .createAndCacheDerivedLabelmapImages(viewport.getImageIds(), {
      voxelRepresentation: Enums.VoxelManagerEnum.RLE,
    })
    .map((image) => image.imageId);

  segmentation.addSegmentations([
    {
      segmentationId,
      representation: {
        type: csToolsEnums.SegmentationRepresentations.Labelmap,
        data: { imageIds: labelmapImageIds },
      },
    },
  ]);
  segmentation.addSegmentationRepresentations(viewport.id, [
    { segmentationId, type: csToolsEnums.SegmentationRepresentations.Labelmap },
  ]);
  ```

  The RLE representation keeps a long video small: a frame without labels
  takes almost no memory, where a full buffer takes one byte per pixel of
  each frame. The labelmap image of the frame on display is drawn over the
  video, in the pixels of the video, with the zoom, the pan and the rotation
  of the view, and it changes with the frame, also while the video plays. It
  is drawn as the planar viewport draws a labelmap on the CPU: the segment
  colours, the fill alpha, the outline and the visibility of the segmentation
  style apply, with the GPU or the CPU setting alike. Undo takes a brush
  stroke back, `SEGMENTATION_DATA_MODIFIED` and `SEGMENTATION_RENDERED` fire
  as on a planar viewport, and `getSegmentIndexAtWorldPoint` reads the
  labelmap of the frame on display. `utilities.segmentation.getStatistics`
  gives the statistics of the frame on display of the video viewport that
  shows the segmentation: the pixels of that frame under its labelmap image,
  red, green and blue apart (`mean.value` is `[r, g, b]`), as for a colour
  image of a stack, and `frameNumber` in the result names the frame. The
  other frames are not read, as the video element gives the pixels of the
  frame on display only: show a frame (`setFrameNumber`) to get its
  statistics. Without a video viewport that shows the segmentation,
  `getStatistics` rejects with an error that says so; a frame without a
  labelmap image rejects too. A video has no flip, so there is none to
  follow.

  ```ts
  // 6.0.0-beta.2: threw in its worker for a labelmap over a video
  // 6.0: the statistics of frame 12, the frame on display
  videoViewport.setFrameNumber(12);
  const stats = await cornerstoneTools.utilities.segmentation.getStatistics({
    segmentationId,
    segmentIndices: 1,
  });
  const { frameNumber } = stats;
  const [meanRed, meanGreen, meanBlue] = stats.mean.value;
  ```

- **`getActors()` and `addImages()`** are on the video viewport again, as on
  the legacy one. `getActors()` lists the images drawn over the video (the
  labelmap image of the frame on display), and
  `addImages([{ imageId, displaySetId }])` draws an image of the cache over the
  video as a labelmap; `removeDisplaySet(displaySetId)` takes it away. The labelmap
  display of the tools calls them. The id of an image is its `displaySetId`, else
  its `representationUID`, else its image id, as on a planar viewport; an
  `actorUID` is not read.
- **Annotations draw over the video.** The video element sits in the layer
  of the viewport canvas, just above the canvas: the canvas background shows
  around the video, and the labelmap and the SVG layer of the tools draw over
  it. Before, the video element was the last child of the viewport element
  and covered the SVG layer, so an annotation, a contour segmentation and the
  brush cursor did not show over a video (measured: a contour drawn on the
  `videoContourSegmentation` example changed no pixel on the screen).
- **`getImageIds()` gives the same array** while the video stays the same, as
  a planar viewport gives the same array for its stack. With a new array on
  each call, a reference check of each labelmap image worked out the ids of
  every frame again, so a frame change of a video of 3,360 frames with its
  labelmap took 2.4 s; with the same array, and with the labelmap display
  not scanning every labelmap image on a video, it takes 2 ms. Do not change
  the array that it gives.

## Tools on the next viewports

- **The slab thickness synchronizer reads the appearance.** It listens to
  `DISPLAY_SET_APPEARANCE_CHANGED` with `slabThickness` in `changedKeys`,
  where the legacy synchronizer listened to the `CAMERA_MODIFIED` of a slab
  change, and gives the slab of the source display set of the source viewport
  to every display set of each target. A source that shows a stack
  gives no slab, as the legacy synchronizer took none from a stack viewport,
  and each viewport is read from its own rendering engine.
- **The camera position synchronizer keeps one scale, one centre and moves
  a slice only with a move along the normal.** Between two planar viewports
  it gives the target, in one write of its view state, what the 5.x
  `setCamera` gave it:
  - the parallel scale of the source, so the panes of a group show the same
    world height in the canvas: the same millimetres per canvas pixel on
    panes of one size, and on panes of other sizes the same parallel scale,
    as 5.x. The zoom that each pane reports against its own fit (`getZoom()`)
    then differs between panes of volumes of other extents, a CT and a PET:
    that is right, zoom 1 is the fit of each pane;
  - the world point at the centre of the canvas of the source, whatever the
    extent and the centre of each volume;
  - the view up and the view plane normal of the source, through the
    rotation and the flips of its framing. Two viewports with the same view
    before their rotation get the same rotation and flips;
  - a slice only when the event moved the source along its normal (a
    scroll, a jump, a move of the crosshairs, a reset): the slice of the
    target's own grid nearest to the position of the source, with the
    position itself as the point of the view state, so the target reads it
    back without moving. A target that shows that slice already (within
    half a slice, a point half way between two slices keeps the slice on
    display; 5.18.3 put the target one slice lower on such a tie) is not
    written for it. A zoom, a pan, a rotation in the plane,
    a flip or a resize of the source never moves a target along its normal,
    and a write that comes back from a target never moves the source.

  A camera event that changes no camera, the mount of the source (it fires
  the camera that it opens with) or a resize (it keeps the camera), moves no
  pane along its normal and writes no other pane: the source takes the
  scale, the centre and the view up of the first other pane of the group in
  step with it, in the order the viewports were added to the synchronizer,
  and keeps its slice. So a pane that joins a group at its mount takes the
  scale and the centre of the group, where 5.x and 6.0.0-beta.2 gave the
  group the first view of the pane (its slice too). The slice that a joining
  pane opens on stays its own: an application that puts it on the slice of
  the group moves it there (`setViewReference` with a point and a plane),
  and that move along the normal moves the others only where they are not
  on their nearest slice. A pane that was placed while it was alone in the
  group (no camera event of it reached another pane), or the one pane of the
  group that shows data when the synchronizer was made after its mount, is
  the group for a pane that joins it. When several panes show data and none
  is in step yet (the synchronizer was made after their mounts), the first
  event drives the scale and the centre of the group. A target of another
  plane in the frame of reference of the source turns to its plane and view
  up with a view reference of the plane and the point (a second write, the
  first time only), and its rotation is then counted from that view up: 0
  for a sagittal target of an axial source turned by 45, where 5.x read 90,
  the angle from the view up of its first plane. A stack of another plane
  takes nothing. A target of another frame of reference takes the parallel
  scale only. A pane joins a group at its mount only when it is in the
  group at that time: add it to the synchronizer before its
  `setDisplaySets`, before or after it is enabled (see "A synchronizer takes
  a viewport before it is enabled").

  A 3D viewport of a group takes the camera of a 3D source, as the 5.x
  `setCamera` gave it: the direction, the view up and the focal point, and
  the half height of the view at the focal point (the parallel scale of a
  parallel camera, the distance times the tangent of half the view angle of
  a perspective one). A parallel target takes it as its parallel scale, and
  the distance of the source; a perspective target takes the view angle of
  a perspective source and the distance that gives that height, so two
  perspective views have one camera, and keeps its own view angle for a
  parallel source. The projection of each pane stays, as 5.x did not copy
  it. Between a planar and a 3D viewport the target turns to the plane and
  the view up of the source, as the 5.x camera copy turned it, and takes the
  world point at the centre and the scale; a 3D target keeps its depth
  along the normal, as the slice of a planar view means nothing to a 3D
  camera, so a scroll of the planar pane writes no 3D pane. Each target is
  written once, not when it has the view already, and nothing comes back.
  A 3D mount fires a camera event as a planar mount does (see
  [3D viewports](#3d-viewports)), so a 3D pane that joins a group takes the
  camera of the group at its mount. 6.0.0-beta.2 gave a 3D
  target the view reference of the source and its zoom and pan against its
  own fit, so two 3D panes of volumes of other extents showed other sizes.
  A pair of other families (a video, a whole slide, an ECG viewport) takes
  the view reference of the source and its zoom and pan against the fit, as
  in 6.0.0-beta.2.

  The camera position synchronizer has no option for the other behaviour,
  each pane at the same zoom against its own fit. The zoom and pan
  synchronizer (`createZoomPanSynchronizer`) and the view framing
  synchronizer give the same zoom and pan against the fit of each pane, and
  no slice; with a camera position synchronizer on the same panes the two
  write the scale in turn.

  The time point of a dynamic (4D) volume does not travel with the camera
  position synchronizer, as in 5.18.3: a target keeps its time point. The
  6.0 betas gave the target the view reference of the source, with its
  `dimensionGroupNumber`, so a target that showed another dynamic volume
  of the frame of reference took the time point of the source. Panes that
  show one dynamic volume show one time point, the time point of the
  volume. To give the panes of another volume the time point of a source,
  set it on them:

  ```ts
  const { dimensionGroupNumber } = source.getViewReference();

  target.setViewReference({
    ...target.getViewReference(),
    dimensionGroupNumber,
  });
  ```

- **The zoom and pan synchronizer and the view framing synchronizer give a
  pane that mounts the zoom and the pan of its group.** They read a camera
  event that changes no camera (a mount fires the camera that the view opens
  with, a resize keeps the camera) as the camera position synchronizer
  reads it: it is not a change of the group. The pane that fired it writes
  no other pane and takes the zoom and the pan (the framing that the view
  framing synchronizer copies) of the first other pane of the group in step
  with it, in the order the viewports were added; a pane is in step once a
  change of it reached the group or the group wrote it. When none is in
  step and one other pane alone shows data (it was placed while it was
  alone in the group, or mounted before the synchronizer was made), that
  pane is the group. With no such pane, or with several none of which is in
  step, the pane keeps its own zoom and pan and writes nothing; the next
  change of a pane drives the group. This holds for planar panes in stack
  and in volume mode and for 3D panes. A change of a camera (a zoom, a pan,
  a scroll, a reset) still gives every other pane the zoom and the pan of
  the pane that changed.

  5.x and the 6.0 betas gave the whole group the fit (zoom 1, pan 0) of a
  pane that mounted in it, also a 3D pane since its mount fires a camera
  event: a group at a zoom of 2 went back to its fit when a pane got new
  data. A resize of a pane in a group now gives that pane the zoom and the
  pan of the group against its new size; before, it gave the group the zoom
  that the kept camera had against the new fit of the resized pane.

  ```ts
  const synchronizer = synchronizers.createZoomPanSynchronizer('zoomPan');

  synchronizer.add({ renderingEngineId, viewportId: 'ct' });
  synchronizer.add({ renderingEngineId, viewportId: 'pt' });
  // The ct pane is at a zoom of 2; the pt pane mounts new data
  await ptViewport.setDisplaySets({ displaySetId: 'pt2' });
  // Before: both panes at zoom 1, the fit of the pt pane
  // After: both panes at zoom 2, the zoom of the group
  ```

  The camera position synchronizer differs in one case: when several panes
  show data and none is in step (the synchronizer was made after their
  mounts), the event of a mount there drives the scale and the centre of
  the group.

  ```js
  // The petCt example: a CT pane (512 x 512, 0.977 mm) and a PET pane
  // (128 x 128, 4.69 mm), sagittal, in one camera position synchronizer
  await utilities.jumpToSlice(ct.element, { imageIndex: 256 });
  pt.setZoom(pt.getZoom() * 1.5);

  // 6.0.0-beta.2: ct.getSliceIndex() 254, the centre of the PET slice;
  // parallel scale 147.15 on the CT, 173.68 on the PET (the body smaller)
  // Now: ct.getSliceIndex() 256; parallel scale 147.15 on both panes;
  // ct.getZoom() 1.5, pt.getZoom() 1.77
  ```

- **A synchronizer takes a viewport before it is enabled.** A synchronizer
  knows a viewport by its rendering engine id and its viewport id, so
  `add`, `addSource` and `addTarget` take one that is not enabled yet, as an
  application that names the panes of its groups before they exist does:
  the viewport becomes a source when it is enabled (`ELEMENT_ENABLED`), and
  a target at once. 6.0.0-beta.2 warned `No viewport` and left it out of the
  sources for good, so the pane followed its group and never drove it; 5.x
  did the same. A viewport that is disabled still leaves the synchronizer,
  so one that is enabled again under the same id is added again, before or
  after that enable. The synchronizer listens to `ELEMENT_ENABLED` only while
  one of its sources is not enabled yet, and the removal of one that never
  came leaves no listener.

  ```js
  const sync = synchronizers.createCameraPositionSynchronizer('axial');

  sync.add({ renderingEngineId, viewportId: 'ctAxial' });
  renderingEngine.setViewports(viewportInputs);

  // 6.0.0-beta.2: a camera change of ctAxial moves no other pane
  // Now: ctAxial is a source from its enable on
  ```

- **The crosshairs set up moves no viewport.** `CrosshairsTool` set active,
  passive or enabled, a mount of a viewport of its tool group and the add of
  a viewport work out the centre where the slices that the views draw meet
  (as before) and write no viewport whose slice holds that centre already,
  so the set up fires no `CAMERA_MODIFIED` on such a viewport.
  `setToolCenter` moves only the viewports whose slice does not hold the
  centre. 6.0.0-beta.2 wrote every viewport with a view reference of its
  own slice, which put a pane that shows a point between two slices of its
  grid (a camera position group gives a PET pane the point of its CT pane)
  on the centre of its nearest slice, and that move along the normal moved
  the CT pane of the group: the `tmtv` example opened its CT sagittal pane
  on slice 254 for 256. `resetCrosshairs` still puts each view on the centre
  of the slice it draws after its reset, as the legacy volume viewport did.

- **`SEGMENTATION_REPRESENTATION_ADDED` fires.** `addSegmentationRepresentations`
  and the add functions of each representation type fire it on the
  `eventTarget` once for each representation that is new to the viewport,
  with the detail `{ segmentationId, type, viewportId }`, before
  `SEGMENTATION_REPRESENTATION_MODIFIED`, which still fires for each call. A
  representation that the viewport already has fires no second one. 5.x
  declared the event and listened to it, but never fired it.
- **A contour of a contour set has the plane of its points.** The Contour
  representation makes an annotation for each contour of a contour set
  (`PlanarFreehandContourSegmentationTool`). Its `metadata.viewPlaneNormal`
  is now the normal of the plane of the points of that contour, and its
  `referencedImageId` the image nearest along that normal. The sign follows
  the nearest of the axial (`[0, 0, -1]`), sagittal (`[1, 0, 0]`) and
  coronal (`[0, -1, 0]`) view plane normals, and a contour that lies in one
  of those planes takes that normal as it is. In 5.x every annotation of a
  contour set had the view plane normal of the viewport that drew the set
  first: the first one that was given the representation, when the
  viewports had not drawn their frame yet. So the contours of an RTSTRUCT,
  which lie in axial planes, showed only in the sagittal pane of an MPR when
  the RTSTRUCT was added there first. A contour whose points span no plane
  still takes the normal of that viewport.
- **A contour set shows its cut on a viewport of another plane.** A planar
  viewport whose plane is not the plane of the contours of a segment (the
  sagittal and coronal panes of an MPR over the axial contours of an
  RTSTRUCT, an oblique plane, a stack whose images lie in another plane)
  draws the cut of that segment by the slice on display. It needs the polySeg
  add-on, `cornerstoneTools.init({ addons: { polySeg } })` with
  `@cornerstonejs/polymorphic-segmentation`; without it the viewport draws
  nothing of that segment and one warning says so. What happens:
  - The contours of each segment are made into a surface once, in the worker
    of polySeg, and again after each `SEGMENTATION_DATA_MODIFIED` of the
    segmentation, however many viewports, planes or representations ask for
    it and whenever they ask: a conversion that runs is shared. A
    segmentation that has a Surface representation is cut with that surface
    and not converted. The segments whose contours reach the slice on display
    are converted first, and in each group the ones with fewer contour points
    first.
  - Each surface is cut by every slice of the plane as soon as it is made
    (with the surfaces made while the cut before it ran), in one task of the
    worker, and its contours are added to the slice on display: the panes
    fill in segment by segment, and no cut annotation is taken away while
    they fill. A viewport cuts again when its plane changes (a rotation,
    another orientation, another volume, 150 ms after the last change).
    Viewports of one plane share the cut.
  - A scroll shows the cut of the next slice from that cut, with no new task:
    the cut of a slice is a set of locked `PlanarFreehandContourSegmentationTool`
    annotations with the view reference of that slice, which exist while a
    viewport shows that slice. They are not in the `annotationUIDsMap` of the
    Contour representation, which holds the contours of the segmentation
    only.
  - The contours of a segment that lie in the plane of the viewport are drawn
    as they are and not cut, so a pane never draws a cut over them. A 3D
    viewport is not cut.
  - A segment that cannot be converted (contours on planes that are not
    parallel, no closed contour of three points or more, a conversion that
    fails or gives no surface) gets no cut and one warning on the logger
    `cs3d.tools.tools.displayTools.Contour.contourCuts` that names the
    segmentation, the segment and the reason, once for each version of the
    contours.
  - `Events.SEGMENTATION_CONTOUR_CUTS_COMPLETED` (new) fires on the
    `eventTarget` when the cuts of a segmentation on a viewport are all drawn
    for its plane: every segment that needs a cut is cut or has failed, and
    the contours of the slice on display are drawn. Its detail has the
    `viewportId`, the `segmentationId`, the `segmentIndices` that are cut and
    the `failedSegmentIndices`. It fires once per viewport and segmentation
    each time the cuts become complete: after the first conversion, and again
    after a change of the contours or of the plane, never while a conversion
    or a cut for that viewport is pending. A scroll needs no new cut, so it
    fires nothing. A viewport in the plane of the contours needs no cut: it
    is complete when the representation has rendered on it, and fires once
    then with no segment index.
    `segmentation.getContourCutsState(viewportId, segmentationId)` (new)
    gives `'pending'` or `'complete'` at any time, so a caller that
    subscribes late asks it first. `SEGMENTATION_RENDERED`
    fires before the cuts, as before, and `ANNOTATION_RENDERED` after each
    batch of them, with nothing that marks the last.

  A wait for the cuts of a pane:

  ```ts
  function waitForContourCuts(viewportId, segmentationId) {
    if (
      segmentation.getContourCutsState(viewportId, segmentationId) ===
      'complete'
    ) {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      const onCompleted = (evt) => {
        const { detail } = evt;

        if (
          detail.viewportId === viewportId &&
          detail.segmentationId === segmentationId
        ) {
          eventTarget.removeEventListener(
            Enums.Events.SEGMENTATION_CONTOUR_CUTS_COMPLETED,
            onCompleted
          );
          resolve(detail);
        }
      };

      eventTarget.addEventListener(
        Enums.Events.SEGMENTATION_CONTOUR_CUTS_COMPLETED,
        onCompleted
      );
    });
  }
  ```

  The contours of an RTSTRUCT of 31 structures (2,265 contours) show their
  first cut in the sagittal and coronal panes about 1.8 s after the
  representation is added and their last about 16 s after, with the one
  polySeg worker of the default, in Chrome on a recent Mac; before, the cut
  came for every structure at once after 18.6 s.

  In 5.x the cut was tried only when the viewport had status `RENDERED` at the
  draw of the representation, which a next planar viewport never has at that
  moment, and the conversion read the contours from annotations that the
  first viewport to draw the set had not made yet: no cut and no message. On
  a viewport where it ran, the annotations of the cut of every slice replaced
  the contours of the segment in `annotationUIDsMap`:

  ```ts
  // 5.x: after a cut, the set of a segment could hold the cut annotations of a
  // sagittal pane in place of the contours of the RTSTRUCT
  const { annotationUIDsMap } = segmentation.representationData.Contour;
  annotationUIDsMap.get(segmentIndex);

  // 6.0: the set holds the contours of the segment; the cut on a viewport is
  // its annotations of the segmentation with the view plane normal of the
  // viewport
  annotation.state
    .getAnnotations('PlanarFreehandContourSegmentationTool', viewport.element)
    .filter(
      (contour) =>
        contour.data.segmentation.segmentationId === segmentationId &&
        Math.abs(
          vec3.dot(
            contour.metadata.viewPlaneNormal,
            viewport.getViewReference().viewPlaneNormal
          )
        ) > 0.999
    );
  ```

- **polySeg converts in one instance of its worker by default, and an
  application can ask for more.** `registerPolySegWorker`, which the polySeg
  add-on calls at its first use, registers one instance, as in 5.x, and
  takes `maxWorkerInstances` from `init` of the add-on. An instance is made
  at the first task that needs it and ends after 2 s without a task; each
  loads the 5.6 MB wasm of the conversions with its first task and holds
  about 400 MB more at the peak of a large RTSTRUCT. polySeg sends one task
  to each instance at a time, and the cut of a surface goes before the
  conversions that wait. Measured on the RTSTRUCT above, from the moment the
  representation is added:

  | Workers | First cut shown | Last cut shown | Memory at the peak (browser total) |
  | ------- | --------------- | -------------- | ---------------------------------- |
  | 1       | 1.8 s           | 16 s           | 2.2 GB                             |
  | 2       | 1.8 to 3 s      | 12 to 13 s     | 2.6 GB                             |
  | 4       | 2 s             | 11 to 12 s     | 3.2 GB                             |

  Four do little better than two there, as its largest structure alone
  takes 7 s. To choose the number, call `init` of the add-on before its
  first conversion:

  ```ts
  import * as polySeg from '@cornerstonejs/polymorphic-segmentation';

  // 5.x and 6.0: one instance, unless set
  polySeg.init({ maxWorkerInstances: 2 });
  cornerstoneTools.init({ addons: { polySeg } });
  ```

  `@icr/polyseg-wasm` prints `icrPlanarContourToClosedSurfaceConversion ...
GetSpacingBetweenLines: Contour spacing is not consistent` for a structure
  whose contours have a gap along their normal: a structure of two parts,
  such as a PTV that holds two targets. It is noise. The surface goes through
  every contour of both parts and does not cross the gap; the conversion
  takes the mean spacing of the contours, so the surface of each part ends
  half that mean spacing beyond its last contour (0.7 to 1.5 mm for the five
  such structures of the RTSTRUCT above) instead of half the spacing of its
  contours (0.5 mm).

- **`ANNOTATION_RENDERED` fires after a draw of contours that are not being
  edited.** The annotation rendering engine fires it once for each draw of a
  viewport in which a tool drew, and the freehand contour tool, which the
  contour segmentation tool extends, now says that it drew whenever it drew
  a contour, with `calculateStats` on or off. 5.x and 6.0.0-beta.2 said so
  only while a contour was drawn or edited, so a pane that showed only the
  contours of an RTSTRUCT, or finished freehand contours, never fired the
  event. A draw that draws nothing, as a slice with no contour, fires none.
  The spline and livewire contour tools already said so.

  ```ts
  // 5.x: never fired on a pane with only the contours of an RTSTRUCT
  // 6.0: fires once for each draw of the pane that drew a contour or its cut
  element.addEventListener(
    cornerstoneTools.Enums.Events.ANNOTATION_RENDERED,
    (evt) => updateOverlay(evt.detail.viewportId)
  );
  ```

- **The contours of a contour segmentation show only on a viewport that has
  its contour representation, in stack and in volume mode.** The filter of
  the freehand contour tools (`filterInteractableAnnotationsForElement` of
  `PlanarFreehandROITool`, which `PlanarFreehandContourSegmentationTool`
  inherits) gives the annotations that the viewport shows and, of a contour
  segmentation, those of a segmentation with a Contour representation on the
  viewport; a hidden segment or a hidden representation draws nothing on any
  viewport. The cut of a contour set on a viewport of another plane follows
  the same rule. 5.x kept that rule in volume mode only; in stack mode a
  viewport drew the contours of every segmentation of its frame of reference
  on its image once one annotation of the tool passed the rule, and
  6.0.0-beta.2 did so in both modes.
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
  that viewport id. The view framing synchronizer reads the source
  viewport from its own rendering engine; in 5.x it read it from the
  rendering engine of the target.
- **`utilities.calculateViewportsSpatialRegistration` adds a registration.**
  It reads the image plane of the image on display of each viewport
  (`getCurrentImageId()`) and adds the translation from one to the other.
  So the image slice synchronizer, which calculates it at its first move
  for a target in another frame of reference that has no registration,
  keeps the offset that the two viewports had then. 5.19.1 reads the image
  on display too. Before 5.19.1 it read the slice index of each viewport as
  an image id, found no image plane and added nothing: such a target did
  not move unless the application had added a registration. The
  orientation of an image is its
  `imageOrientationPatient`, else its `rowCosines` and `columnCosines`; an
  image with no orientation or no position gives no registration, and the
  call does not throw.
- **A calculated registration holds for the frames of reference it was
  calculated for.** `utilities.spatialRegistrationMetadataProvider` gives
  the registration of `calculateViewportsSpatialRegistration` only while
  both viewports are there and show the frame of reference that they
  showed then. After a viewport gets the data of another study, the image
  slice synchronizer takes the identity for two viewports of one frame of
  reference, or calculates the registration again. Once a viewport is
  disabled, or its rendering engine destroyed, the registration is gone,
  also for `get` with the viewport ids alone. A registration that the
  application added with `add` stays until the application replaces it,
  also when its matrix is one that `get` gave for a calculated registration.
  Before 5.19.1 a calculated registration stayed with the viewport ids for
  good. From 5.19.1 the image slice synchronizer removes a registration
  that it calculated, with
  `spatialRegistrationMetadataProvider.add([viewportId1, viewportId2], undefined)`,
  once a viewport shows another frame of reference. In 6.0 the provider
  drops it for every caller, and the synchronizer makes no such call.
- **A registration replaces the one of the other direction.**
  `spatialRegistrationMetadataProvider.add([viewportId1, viewportId2, ...], matrix)`
  removes the registration from `viewportId2` to `viewportId1` added with
  the same kind of query, so `get` gives `matrix` one way and its inverse
  the other way. A query that is its own reverse, such as two viewports of
  the same id, keeps its registration. In 5.x a direct registration went
  before the inverse of a newer one of the other direction.
- **`utilities.getImageLegacy(element)` of the core is gone.** Use
  `cache.getImage(viewport.getCurrentImageId())`.
- **`AdvancedMagnifyTool` resets on a stack of images of several sizes.** It
  compares the rows, the columns and the number of components of the image
  of `NEW_IMAGE` with the image before.
- **The magnifying glasses show their viewport as it is drawn.** The loupe
  of `MagnifyTool` and each glass of `AdvancedMagnifyTool` are next planar
  viewports with the display sets of their viewport, overlays too, each
  with its appearance, and with the slice, the orientation, the rotation
  and the flips of the view. A glass also shows the labelmaps. The zoom and
  the place are as before: the loupe spans `1 / magnifySize` of the world
  height of the viewport, and a glass `1 / zoomFactor` of the width of the
  viewport over its own width. Differs: the legacy glass did not turn and
  flip with its viewport (measured on a legacy stack viewport turned and
  flipped, it showed the image unturned and unflipped; on a legacy volume
  viewport it took the rotation and not the flips), and it gave the
  appearance of the first volume only (read in the code). The legacy loupe
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
- **A dynamic threshold brush on a CPU viewport takes its range over the
  whole stroke.** On the CPU (and with `segmentation.overwriteMode` set) the
  brush fills a stroke in one call at mouse up. The range of the dynamic
  threshold is now the one a stroke on the GPU reaches at its end: the values
  around the first drag point, within `dynamicRadius`, and the value under
  every later point. In 5.x, on the legacy CPU stack viewport as on a next
  viewport, it was the range around the last point only, so a stroke that
  crossed into tissue of other values filled less on the CPU than on the GPU
  (6,848 pixels in place of 15,323 for the stroke of the stack labelmap
  example). The GPU fills each step of the stroke with the range reached at
  that step, so early steps can leave holes that the CPU fills: the same
  stroke now fills 16,004 pixels on the CPU.
- **`utilities.AnnotationMultiSlice` of the tools** sets a range of images
  of a stack, a range of slices of a volume in its acquisition orientation
  or in another orientation, and a range of frames of a video, on the next
  viewports. An annotation over a range of images of a stack shows on every
  image of the range, as on the legacy stack viewport.
- **A range of slices also counts in volume mode.** An annotation with a
  range (a `multiSliceReference` in its metadata, which `AnnotationMultiSlice`
  sets, or a view reference made with `rangeEndSliceIndex`) shows on the
  slices of its range and not on the others, in volume mode as in stack mode.
  A range of images shows on the slices that show those images, in a stack or
  in a volume of the series. A range of slices of a volume in another plane
  names no images: it counts in the slices of that plane of that volume, so
  it shows on those slices of a viewport that shows the volume in that plane,
  and in no other plane. The viewport decides such an annotation by its
  reference, as in stack mode, so it needs the frame of reference of the
  viewport. An annotation without a range is still drawn on a volume by where
  it lies. In 5.x the tools drew every annotation on a volume by where it
  lies, on the legacy volume viewport as on a next viewport in volume mode,
  so a range did not spread it over the slices: it showed only on the slice
  where it lies.
- **The zoom and pan tools go through `viewportProjection`** on a next
  viewport. On a 3D viewport the zoom limits of the zoom tool apply and the
  zoom goes to the mouse, the zoom and pan synchronizer moves a 3D target,
  and the VOI synchronizer reaches a 3D target, which it finds by display set
  id, by volume or as its source. On a whole slide viewport the limits are factors against the fit
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
  `getCamera` or `setCamera`). The view framing, camera position and
  zoom and pan synchronizers read and write only through
  `viewportProjection` (no `getViewPresentation` or `setViewPresentation`).
  The slab thickness synchronizer reads and writes only the appearance of
  display sets (no `getSlabThickness` or `setSlabThickness`). A labelmap on
  a viewport that shows a volume is mounted only as an overlay display set
  (no `addVolumes`, and edge projection no longer puts the labelmap into the
  volume actor as a second component), and an old labelmap actor goes with
  `removeDisplaySet` (no `removeActors`). Every 6.0 viewport already took these
  paths. A viewport class of the application, registered with
  `registerViewportType`, that has only the legacy members gets nothing
  from these tools.
- **`SegmentationIntersectionTool` draws its lines.** On each planar
  viewport of its tool group it draws the closed lines where the surfaces of
  segmentations cut the slice on display, filled with its `opacity`, in the
  colour of each segment, and the lines follow a scroll. The lines of a
  segment are one SVG path filled with the even-odd rule, so the cavity of a
  hollow segment is not filled. The surfaces are those of the frame of
  reference of the planar viewport that a viewport shows as its Surface
  representation, such as a 3D viewport beside the planar viewports of an
  MPR, of a visible representation and segment. A surface is of the frame
  of reference of its geometry (`frameOfReferenceUID` of
  `cache.getGeometry(geometryId).data`), or, when the geometry has none, of
  the viewport that shows it; a surface of another frame of reference is
  not cut. A tool group whose viewports have several frames of reference
  gets lines in each of them (one annotation of the tool for each frame).
  The cut of a plane is made on its first draw and made again when a
  surface gets other points or polys arrays, or arrays of another length.
  It is kept by the plane (its normal and its position along the normal),
  so a viewport that shows another series of the same frame of reference
  at the same slice index gets the cut of its own plane. When a viewport
  draws a Surface representation, as after new surface data or a change of
  its visibility, the viewports of the tool group draw their lines again,
  with no other draw request. They do the same when a Surface
  representation is removed from a viewport, so the lines of a surface that
  no viewport shows any more go, and the tool drops the cuts it kept for
  it. Once no tool group has the tool enabled, it drops every cut it kept,
  and cuts again when it is enabled. A 3D viewport of the tool group gets no
  line. A camera change of a viewport of the group (a pan, a zoom, an orbit
  of a 3D viewport) draws that viewport again and not the others, whose
  lines follow their own slices; 5.x asked every viewport of the group for
  a draw on each camera change. In 5.x the tool read
  `clippingFilter` of each actor entry, which nothing set, and drew no line.
  The example `surfaceRendering` shows it.

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

if (utilities.viewportSupportsDisplaySetAppearance(viewport)) {
  const displaySetId = viewport.getSourceDisplaySetId();
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
as it did in 5.x. The 5.x guard of a next viewport is gone: every viewport
is one, see [Functions of the core package](./3-api-map.md#functions-of-the-core-package).

## Smaller changes

- **`cache.setPartialImage` keeps the better image.** It never replaces the
  image of a cache entry by one of a worse `ImageQualityStatus` (an image
  without one counts as full resolution). A copy of another frame
  (`FAR_REPLICATE`, `ADJACENT_REPLICATE`) is worse than any data of the frame
  itself, and replaces only a worse image; data of the frame itself also
  replaces an image of its own quality, as a decode again. A refused image
  leaves the entry as it was. It answers whether it took the image; 5.x and
  6.0.0-beta.2 replaced the image whatever the qualities and answered
  nothing, so a caller checked first:

  ```ts
  // Before
  if ((cache.getImageQuality(imageId) ?? 0) < copy.imageQualityStatus) {
    cache.setPartialImage(imageId, copy);
    deliver(imageId, copy);
  }

  // After
  if (cache.setPartialImage(imageId, copy)) {
    deliver(imageId, copy);
  }
  ```

- **A planar viewport that draws on the CPU is drawn in its resize.** On a
  device with WebGL, a planar viewport whose display sets are drawn on the
  CPU (`renderBackend: 'cpu'`) draws them again in `renderingEngine.resize()`
  when its canvas changed size, which clears it, so no frame shows the
  cleared canvas. 6.0.0-beta.2 left the canvas blank until the next draw of
  the view (a pan, a scroll, a framing written back), as the rendering
  engine does not draw such a viewport in its frame. A resize draws once,
  also when a listener of its `CAMERA_MODIFIED` draws the view (the sync of
  a stack labelmap). The fine sample of a volume at rest comes 100 ms after
  the last resize of a drag, as after a pan. The example `cpuResizeFlash`
  shows the time that the canvas stays blank.
- **The web worker manager makes an instance of a worker when a task needs
  it.** `registerWorker(name, workerFn, { maxWorkerInstances })` makes no
  worker; `executeTask` makes an instance when no instance is idle and fewer
  than `maxWorkerInstances` exist, and makes again an instance that ended on
  idle. A task goes to the instance with the fewest tasks in flight, read by
  the index of each instance (an instance after one that had ended was read
  with the load of another), and among instances with none to one that
  exists before one to make. `workerRegistry[name].instances` holds `null`
  for an instance that does not exist. 5.x made every instance at
  registration and gave a tie to the first instance. The option
  `createInstances` of `registerWorker` says when the instances are made:
  `'onFirstTask'` (the default), `'atRegistration'` (as 5.x), or
  `'whenIdle'`, at the first idle period of the main thread after the
  registration, so that they start before their first task without adding
  to the start-up of the page; a task that comes first makes the instance
  it needs at once. The decode workers of the DICOM image loader are made
  when idle: made at the first image, they started with the first frames of
  the first load, which reached the cache about 80 ms later than on 5.18.3
  in OHIF's TMTV mode.

  ```ts
  getWebWorkerManager().registerWorker('myDecoder', () => new Worker(url), {
    maxWorkerInstances: 3,
    createInstances: 'whenIdle',
  });
  ```

- **The capability profile measures what only a draw needs at its first
  use.** `init()` opens one WebGL2 context for `getRenderingCapabilities()`
  (WebGL2, the size limits, the renderer string) and releases it. The texture
  formats (`norm16`, `float`, `halfFloat` and their linear filtering), unless
  they are stored for the renderer from an earlier page load, and
  `webglCanvasCopy` are measured at the first read of any of them, or in the
  first idle periods after `init()`, once, each on a context of its own. The
  answers are the same. `init()` took 15 to 20 ms on a first visit, most of
  it in those probes; it takes about 6 ms. `detectRenderingCapabilities()`
  returns a profile measured the same way, so code that counts probe runs or
  reads the stored formats right after it reads a format answer first.

- **A scroll of a stack with a labelmap no longer checks every labelmap
  image.** The labelmap images of each image of the stack come from a map
  that is made once for the image ids of the stack and of the labelmap, and
  made again when one of them changes (another stack, a labelmap image added
  to or taken from a layer, the segmentation removed); a scroll looks its
  image up. The display no longer calls
  `segmentation.state.updateLabelmapSegmentationImageReferences` at each
  image, and that function, which gives the same answer, finds the labelmap
  images on the plane of the image without checking the others. With a
  labelmap of 300 images, a step of a scroll read the metadata 4,503 times
  and checked 300 references; it reads 18 times and checks one, as with a
  labelmap of 10 images. A scroll of a stack of 300 images of 512 by 512
  with a labelmap of 300 images takes 18.6 ms from the scroll to the draw
  instead of 26 ms in Chrome on a recent Mac, and 18.5 ms instead of 43 ms
  when a read of the metadata costs 2 µs.
- **Destroying a tool group disables its tools.**
  `ToolGroupManager.destroyToolGroup` (and `ToolGroupManager.destroy`) calls
  `onSetToolDisabled` of each tool of the group that is enabled, passive or
  active, without the mode event and the render of `setToolDisabled`. A tool
  removes its listeners there, so a tool group made again under the same id
  no longer reaches the tools of the old one: the crosshairs, the trackball,
  the cropping, the orientation controller and the orientation marker kept
  one or two listeners on `eventTarget` for each tool group that was
  destroyed, and the orientation marker kept its markers drawn. A disable
  that throws, as one that restores the view of a viewport whose volume the
  cache no longer holds, is logged, and the destroy goes on.
- **A synchronizer has one `ELEMENT_DISABLED` listener**, on `eventTarget`,
  while it has viewports. It added one more at each `add` and `remove`, on
  the element or on `eventTarget` (after five layout rounds of OHIF, 85 on
  `eventTarget` and 58 on the element of one pane), and none of them took a
  viewport out. A viewport that is only a target is now taken out when its
  element is disabled, and `destroy()` removes the listeners of every
  viewport, where it skipped every other one.
- **A stack prefetch goes with its element.** When the element of a viewport
  is disabled, by `renderingEngine.disableElement` or by the destroy of its
  rendering engine, `stackPrefetch` and `stackContextPrefetch` drop the
  listeners, the timer, the state and the queued requests that they keep for
  it, so an application no longer calls `disable(element)` before it
  destroys a viewport (a call after it does nothing), and
  `stackPrefetch.disable(element)` takes out the queued requests of that
  element only, where it cleared every prefetch request of the pool, the
  loads of the volumes with them.
- **`viewport.type` is the plain string.** A planar viewport has the type
  `'planar'` where a 5.x next viewport had `'planarNext'`, and the other
  families have `'volume3d'`, `'video'`, `'wholeSlide'` and `'ecg'` in place
  of `'volume3dNext'`, `'videoNext'`, `'wholeSlideNext'` and `'ecgNext'`. A
  comparison with `ViewportType.PLANAR` holds. Code that compares
  `viewport.type` with the string `'planarNext'`, or stores it and reads it
  back, changes to `'planar'`: 6.0 takes no 5.x type string. The `viewportType` of a projection snapshot is the same plain
  string. See [Viewport types](./3-api-map.md#viewport-types).
- **No `setOptions()` and no `reset()`** on the 3D, video, whole slide and ECG
  viewports. The options that a viewport was made with are in
  `defaultOptions`, and they do not change. Change the view through the view
  state, and the look through the appearance. A planar viewport has none of
  them either: `viewport.setViewState({ displayArea })` sets a display area,
  and `resetViewState()` goes back to the one given with
  `storeAsInitialCamera: true`.
- **`isDestroyed` in place of `isDisabled`.** `viewport.isDestroyed` is true
  after `disableElement`, on every family, and it is read only. A next
  viewport has no `isDisabled`.
- **`suppressEvents` is an option.** `viewport.defaultOptions.suppressEvents`
  holds it. A planar and a 3D viewport also keep the field. A video, a whole
  slide and an ECG viewport do not.
- **The slice questions answer for a stack and for a volume.** The slice on
  display, the planes of the slices and a jump to a world point are functions
  that take the viewport, and the acquisition plane is
  `viewport.isInAcquisitionPlane()`; each works in both modes. See
  [the map](./3-api-map.md#members-of-the-volume-viewport-only).
- **A resize keeps the view** of a video and an ECG viewport. The legacy
  viewports fitted the picture again.
- **`renderingEngine.resize(immediate, keepCamera)` reads `keepCamera` for
  the planar and the 3D viewports.** With `keepCamera` false each of them
  fits its view to its new size (`resetViewStateForResize()`), as the
  legacy viewports did; in 5.x the next viewports kept their view. A planar
  viewport resets as `resetViewState()` does and keeps its slice: the
  legacy volume viewport also went to its middle slice and kept its
  rotation. With `keepCamera` true, the default, a 3D viewport keeps its
  camera and its parallel scale, as the legacy 3D viewport did, and a
  planar viewport keeps its parallel scale and its focal point, as the
  legacy stack and volume viewports did: across a change of the width the
  image keeps its size in pixels and its distance from the centre, across a
  change of the height it scales with the canvas, and the zoom and the pan
  read after the resize are against the fit of the new size. The 5.x next
  viewports kept their zoom against the fit and their pan as a share of the
  canvas instead. A planar view with a display area, or with a scale mode
  other than `fit` (`fitAspect`), fits the new size again, as the legacy
  viewports applied their display area again. A planar viewport fires one
  `CAMERA_MODIFIED` for a resize that changes its zoom or its pan; the
  legacy viewports fired several for each resize.
- **`isReferenceViewable` takes the points of an annotation** in the option
  `points`, and the annotation filter of the tools passes the handle points
  of each annotation. A viewport that shows a part of its world in several
  places uses them.
- **The annotation filter of the tools asks the viewport one check for all
  the annotations of a draw.** `viewport.getReferenceViewableCheck()` gives
  a function (`Types.ReferenceViewableCheck`) that answers
  `isReferenceViewable(viewReference, options)` for the view as it is when
  the check is made. It reads the facts of the view (the drawn image or
  slice, its plane and its frame of reference) once, so a filter of 2,000
  annotations reads them once and not 2,000 times, and calls the metadata
  provider a number of times that does not depend on the annotations.
  `isReferenceViewable` is that check for one reference. A check does not
  follow the view: make a new one after a scroll. A viewport class that
  decides references in its own way overrides `getReferenceViewableCheck`;
  one that overrides only `isReferenceViewable` changes a single call and
  not what the tools draw:

  ```ts
  // Before (6.0.0-beta.2)
  class MyViewport extends PlanarViewport {
    isReferenceViewable(viewRef, options) {
      return isMine(viewRef) && super.isReferenceViewable(viewRef, options);
    }
  }

  // After
  class MyViewport extends PlanarViewport {
    getReferenceViewableCheck() {
      const isViewable = super.getReferenceViewableCheck();

      return (viewRef, options) =>
        isMine(viewRef) && isViewable(viewRef, options);
    }
  }
  ```

  In 6.0.0-beta.2 the filter of a stack asked `isReferenceViewable` for each
  annotation, and each call resolved the view and read the metadata of the
  drawn image again: 2,265 contours of an RTSTRUCT on a stack of 262 images
  made about 64,000 metadata calls at each draw and drew 150 to 200 ms after
  a scroll. The legacy stack viewport of 5.x decided an annotation by its
  image id, with no metadata.

- **16-bit textures:** a scale error of up to one grey level at a normal
  window is fixed on GPUs with 16-bit normalised textures.
- **`AnnotationMultiSlice.setViewportFrameRange`** sets the range. It passed
  two numbers where the viewport takes an array.
- **`rendering.planar.cpuVolume.useViewportSamplingForLinear`** has no effect.
  There is one sampler for the CPU and the GPU.
- **A segment without voxels does not stop the first surface conversion.**
  polySeg makes the surface of each segment of a labelmap that has voxels,
  and none for a listed segment without voxels: no geometry and no entry in
  the geometry map of the Surface representation. Its surface comes at the
  update after it gets voxels. In 5.x one such segment made the whole
  conversion reject ("Surface must have non-empty points array"), so no
  segment showed a surface.
- **`utilities.segmentation.getUniqueSegmentIndices` of the tools reads the
  voxels of a labelmap.** For a labelmap segmentation it gives the segments
  that have at least one voxel, in every labelmap of the segmentation, for a
  stack and for a volume labelmap. A 4D labelmap gives the segments of the
  time point on display. In 5.x it gave the segment list
  (`segmentation.segments`): a segment stayed after an undo, an erase or
  `clearSegmentValue` took its last voxel, a segment came as soon as it was
  made active, and a labelmap added without a segment list gave none. A 5.x
  application that read a segment from this call after an undo now finds it
  gone; read `segmentation.segments` for the list. The voxels of a brush
  preview (index 255) are left out unless the segmentation has a segment 255,
  as in 5.x. Each call reads
  the voxels, also after a write that fired no `SEGMENTATION_DATA_MODIFIED`:
  about 20 ms for a labelmap of 512 x 512 x 300 voxels, where 5.x kept the
  answer until the next `SEGMENTATION_DATA_MODIFIED`. Keep the answer for a
  loop rather than calling it on each step. A brush stroke costs what it
  did.
- **A surface that polySeg converts has the frame of reference of the
  series.** A surface converted from a labelmap gets the frame of reference
  of the labelmap: of its volume or its images, or of the images that it
  was made from (the images of the volume that it or its labelmap volume
  references, its `referencedImageIds`, or the `referencedImageId` of each
  of its images), or, when those images have none, the name that
  `utilities.getImagesFrameOfReferenceUID` makes up for them. The surface of
  a segment converted from contours gets the frame of reference of the
  annotations of that segment. It is the frame of reference of
  the representation that polySeg converts: a segmentation with contours
  and a labelmap has its surfaces converted from the contours, so they take
  the frame of reference of the contours, and a surface that the update
  after an edit of the labelmap adds takes the one of the labelmap. The
  `frameOfReferenceUID` of the
  surface (`cache.getGeometry(geometryId).data`) names it. A 3D viewport
  that shows only such surfaces takes it, so it matches the planar
  viewports of the series, and `SegmentationIntersectionTool` cuts its
  surfaces. In 5.x every converted surface had the frame of reference
  `'test-frameOfReferenceUID'`.
- **A Surface representation works without polySeg.** Without the polySeg
  add-on, a change of the data of a segmentation that has a Surface
  representation with surfaces of the application leaves those surfaces as
  they are. In 5.x it threw an uncaught `TypeError` about 300 ms after
  `SEGMENTATION_DATA_MODIFIED`.
- **`cache.purgeCache()` keeps the geometries, as in 5.x.** It removes the
  images and the volumes. A surface or a contour geometry stays until
  `cache.removeGeometryLoadObject(geometryId)` removes it, which fires
  `GEOMETRY_CACHE_GEOMETRY_REMOVED`. No member lists the geometries of the
  cache. The `geometryIds` of the Surface and Contour data of a segmentation
  name those that it uses.
- **A planar viewport whose volume left the cache gives its frame of
  reference.** The cache deletes the image data of a volume that it removes
  (`cache.purgeCache()`, `cache.removeVolumeLoadObject(volumeId)`). A
  planar viewport in volume mode that still shows such a volume resolves no
  view, so `getFrameOfReferenceUID()` gives the frame of reference of its
  data and draws nothing, until the volume is mounted again. In the 6.0
  betas it threw `TypeError: Cannot read properties of undefined (reading
'1')` from the deleted image data, so a tool group with `CrosshairsTool`
  destroyed after a purge of the cache warned "The tool Crosshairs failed to
  disable while its tool group was destroyed" and kept its crosshairs
  annotations. An application that purges the cache before it destroys its
  tool groups needs no change.
- **`segmentation.getLabelmapImageIds(segmentationId)` is typed
  `string[] | undefined`,** what it gives: the labelmap image ids, or
  undefined for a segmentation without a labelmap. In 5.x it was declared
  `string | undefined` and gave the array too, so code that typed the result
  as a string compiles no more and needs no other change.
- **`init` takes only the keys that the application sets, in TypeScript.**
  `debug` is optional in the configuration type, so
  `init({ rendering: { planar: { renderBackend: 'cpu' } } })` compiles. In
  5.x the type required `debug`, and such a call did not compile.
- **New:** `utilities.runDrawSelfTest()` draws a known image and reads it
  back, to tell whether the device draws 16-bit data right.
