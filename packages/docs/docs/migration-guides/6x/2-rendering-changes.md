---
id: rendering-changes
title: Rendering changes
summary: What a 6.0 viewport draws differently from 5.x - slice first, the render plan, the CPU picture, labelmap fill, image defaults, and the whole slide, 3D and video viewports
---

# Rendering changes

**State: in the code.** Everything on this page is about the Generic ("next")
viewports, which are the only viewports of 6.0.

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

`WorldCrosshairTool` does the second. It keeps one world point for a tool
group, which no camera owns. Each linked viewport shows its closest slice, and
the marker counts as off the slice only beyond half the slice spacing.
`SliceIntersectionTool` draws the lines of the other planes, and moves, turns
and thickens them. Together they are the crosshair for the next viewports.
`CrosshairsTool` keeps working, with its centre on a slice centre.

## Orientation of a volume

- **A requested axis is the true axis.** A viewport asked for `AXIAL`,
  `SAGITTAL` or `CORONAL` shows that plane, also on a series that was acquired
  tilted, as the legacy volume viewport does. `ACQUISITION` shows the plane of
  the acquisition. The next viewport of 5.x opened a tilted series on its
  acquisition plane when the closest axis was asked for. A series that is not
  tilted is not affected: there the axis is a slice of the acquisition.
- **The reformat names work in the options of a viewport.** `axial_reformat`,
  `sagittal_reformat`, `coronal_reformat` and `reformat` given at creation
  give what `setOrientation` gives for the same name.
- **`setOrientation` with vectors follows the legacy viewport.** Without a
  `viewUp` it keeps the current one when that is orthogonal to the new normal,
  and otherwise takes `[0, 0, 1]` for a normal along x or y and `[0, -1, 0]`
  for a normal along z. A `viewUp` that is not orthogonal to the normal is
  made orthogonal. The next viewport of 5.x took the view up of the
  acquisition in the first case and threw in the second.
- **`setOrientation` keeps the point in view, the pan and the zoom.** The
  legacy volume viewport resets its camera on `setOrientation` and shows the
  middle of the volume. `resetViewState()` goes back to the orientation of the
  viewport options.

## Slabs

- **A slab thickness draws the same slab as on a legacy volume viewport.**
  Measured with a maximum intensity and an average slab: the same number
  reaches as far on both.
- **A slab with the composite blend mode draws as an average.** The legacy
  volume viewport casts rays through the slab, so voxels in front hide what
  lies behind them.
- **Scrolling by slabs is an option.** `viewport.scroll(1)` on a legacy volume
  viewport with a slab steps by the slab thickness. On a planar viewport it
  steps by one slice. Pass `scrollSlabs: true` to `utilities.scroll` to step
  by the slab. `getCurrentImageIdIndex(undefined, true)` and
  `getNumberOfSlices(undefined, true)` count those steps.

## Events and image loading of a planar viewport

- **The events of the legacy viewports fire.** `VOLUME_VIEWPORT_NEW_VOLUME`
  when a volume is shown and `VIEWPORT_NEW_IMAGE_SET` when a stack is shown,
  on every `setDisplaySets`. `PRE_STACK_NEW_IMAGE` before the image of a stack
  changes, and `STACK_VIEWPORT_SCROLL` on a scroll. In 5.x only the adapter
  fired them.
- **A failed image load is reported.** `IMAGE_LOAD_ERROR` fires with the image
  id and its index, and the same index can be asked for again. In 5.x the
  failure was an unhandled rejection and the index was never loaded again.
  `loadAndCacheImage` no longer leaves an unhandled rejection either: its own
  promise still rejects.
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
- **`VOI_MODIFIED` carries `invertStateChanged`,** so the VOI synchronizer
  syncs an invert from a planar viewport. It also fires for a change of the
  invert or of the VOI function when no window was set yet.
- **`suppressEvents` in the options of a planar viewport is honoured.**
- **`isReferenceViewable` honours `asOverlay` and `asNearbyProjection`,** so a
  labelmap image that is not in the stack but lies on the geometry of the
  image on display shows.
- **`displayArea` and `aspectRatio` in the options are applied** at the mount
  and again by `resetViewState()`. `setAspectRatio()` exists, and
  `getAspectRatio()` gives the real ratio, with the vertical part as 1:
  `[1, 2]` reads back as `[0.5, 1]`.
- **`IMAGE_SPACING_CALIBRATED` fires when a newly shown image has another
  calibration,** and its detail has `worldToIndex` and `scale`.

## Several volumes in one planar viewport

- **The volume helpers answer for every volume shown.** `hasVolumeId`,
  `hasVolumeURI`, `hasImageURI` and `getAllVolumeIds` look at each volume of a
  fusion. In 5.x a next viewport looked at the first one only.
- **`getVolumeId({ volumeId })` gives undefined for a volume that is not
  shown,** and `getImageIds(volumeId)` throws for one, as on the legacy
  viewport. In 5.x both fell back to the first volume, which hid a wrong id.
- **A surface shows as contours.** The conversion of a Surface representation
  to contours did nothing on a next planar viewport, because the planes of its
  slices were missing.

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
- **The VOI lookup table and the modality lookup table of an image are not
  applied.** The GPU path never applied them, and the CPU path of 5.x did. The
  window of the image is applied as before.
- **A linear image is drawn once more, exactly, when the view rests.**

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
- **Pan.** `getPan()` and `setPan()` exist on the viewport, in canvas pixels
  from the view at mount, and a view presentation carries `pan`.
- **Annotations saved on a legacy whole slide viewport show.** Their
  references carry a view plane normal and a plane restriction, which the next
  viewport of 5.x rejected.
- **`canvas` and `getCanvas()`** exist on the viewport, for code that reads
  the size. The microscopy viewer draws the slide, so the canvas holds no
  pixels of it.
- **The web client** of a slide falls back to the `WADO_WEB_CLIENT` metadata
  of its first image when the display set names none, as on the legacy
  viewport.
- **`scroll()` zooms,** by a factor of 1.1 for each step, as on the legacy
  viewport. In 5.x it did nothing on the next viewport.

## ECG viewports

- **Annotations saved on a legacy ECG viewport show.** Their references carry
  a view plane normal and a plane restriction, which the next viewport of 5.x
  rejected.
- **`getNumberOfSlices()`** exists and gives 1.
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

## 3D viewports

- **A reset fits like the first mount.** `resetViewState()` zoomed out further
  than the first picture.
- **`setViewReference()` moves the camera.** It did nothing, so a camera
  synchronizer between two 3D viewports did nothing.
- **A preset is a key of the presentation, and it stays.**
  `setDisplaySetPresentation(displaySetId, { preset: 'CT-Bone' })` applies a
  preset and fires `PRESET_MODIFIED`. A later change of the window, of
  `invert` or of the opacity rescales the colours that are there. In 5.x each
  presentation update rebuilt a grey ramp, so a preset was lost at the next
  change of the window.
- **The colour keys of the legacy `setProperties` are presentation keys:**
  `VOILUTFunction`, `colormap` (with `name`, `opacityMapping` and
  `threshold`), `blendMode`, `sharpening` and `smoothing`.
- **`resetDisplaySetPresentation(displaySetId)`** goes back to what the volume
  showed after its mount. It does not move the camera: `resetViewState()`
  does.
- **Events.** `VOI_MODIFIED`, `COLORMAP_MODIFIED` and `PRESET_MODIFIED` fire
  from a 3D viewport, `VOI_MODIFIED` also when a volume is mounted, and
  `VOLUME_VIEWPORT_NEW_VOLUME` fires on a mount. None of them fired in 5.x.
- **Actors of the application.** `addActor`, `addActors`, `setActors`,
  `removeActors` and `getActor` are on the viewport, the actors are part of
  the fit of a reset, and `ACTORS_CHANGED` fires. The Surface representation
  and the sphere handles of the cropping tool need them and threw in 5.x.
- **Widgets.** `addWidget`, `getWidget` and `getWidgets` are on every next
  viewport, and the orientation marker shows on a 3D viewport.
- **A labelmap shows in 3D.** In 5.x a Labelmap representation drew nothing
  on a next 3D viewport.
- **Zoom and pan.** `getZoom`, `setZoom`, `getPan` and `setPan` are on the
  viewport. Zoom 1 and pan `[0, 0]` are the fit of a reset.
- **`suppressEvents`** in the options of a 3D viewport silences its camera
  and presentation events, as on the legacy viewport.
- **Small ones.** `hasImageURI` and `getIntensityFromWorld` are on the
  viewport. `getVolumeId`, `getImageIds` and `getImageData` answer for the
  volume that is asked for. `isOrientationChangeable()` is on every next
  viewport and is true on a 3D viewport.

## Video viewports

- **View references carry the view plane normal and the camera,** so
  annotations on a video get their statistics.
- **`STACK_NEW_IMAGE` fires for each frame while the video plays.**
- **`options.frameNumber` of `setDisplaySets` is honoured.**
- **`voiRange` and `averageWhite` of the presentation are applied.**
- **`IMAGE_RENDERED` fires.** A next video viewport fires it when what it shows
  changes: a new frame, a seek, a pan, a zoom, a resize or a call of
  `render()`, at most once for each animation frame. It never fired in 5.x, so
  an annotation did not follow a pan or a zoom. The legacy viewport fires one
  on every animation frame while a video plays.
- **The pixels of the frame.** `getImageData()` gives the pixels of the frame
  on display, as on the legacy viewport, so a probe and the ROI tools give
  statistics. `modality`, `getImageDataMetadata()` and `hasImageURI()` are on
  the viewport too.
- **Frame range and playback.** `setFrameRange()`, `getFrameRange()` and
  `togglePlayPause()` are on the viewport. Frame numbers start at 1.
- **An annotation over a range of frames shows on every frame of the range.**
  In 5.x it showed on its first frame only. `getViewReference()` gives a range
  while a video plays inside a frame range.
- **Rotation.** The video turns about the centre of the canvas, and
  `canvasToWorld` and `worldToCanvas` follow the rotation. In 5.x the video
  turned about its top left corner and the two transforms ignored the
  rotation, so annotations landed beside the picture.
- **`invert`** of the presentation is applied.
- **`canvas` and `getCanvas()`** give a canvas of the size of the viewport with
  the frame on display. It is drawn when it is read.
- **A video opens on its first frame,** or on `options.frameNumber`, and
  does not play to get there. In 5.x it could open on the second frame.
- **`getPan()` and `setPan()` are in canvas pixels on the screen,** `[0, 0]` at
  the fit, as on the other next viewports, and a drag of the pan tool moves
  the picture with the mouse at any rotation.
- **A labelmap over a video** is not available. It is not available on the
  legacy viewport either: both throw. Contour segmentations show.

## Smaller changes

- **`options`, `setOptions()` and `reset()`** are on every next viewport. A
  changed option takes effect where the family honours it at creation: the
  `background` on a video viewport, the `traceLayout` on an ECG viewport, and
  the `background`, `parallelProjection`, `orientation` and `suppressEvents`
  on a 3D viewport.
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
