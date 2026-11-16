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

## ECG viewports

- **Annotations saved on a legacy ECG viewport show.** Their references carry
  a view plane normal and a plane restriction, which the next viewport of 5.x
  rejected.
- **`getNumberOfSlices()`** exists and gives 1.
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

## Video viewports

- **View references carry the view plane normal and the camera,** so
  annotations on a video get their statistics.
- **`STACK_NEW_IMAGE` fires for each frame while the video plays.**
- **`options.frameNumber` of `setDisplaySets` is honoured.**
- **`voiRange` and `averageWhite` of the presentation are applied.**

## Smaller changes

- **16-bit textures:** a scale error of up to one grey level at a normal
  window is fixed on GPUs with 16-bit normalised textures.
- **`AnnotationMultiSlice.setViewportFrameRange`** sets the range. It passed
  two numbers where the viewport takes an array.
- **`rendering.planar.cpuVolume.useViewportSamplingForLinear`** has no effect.
  There is one sampler for the CPU and the GPU.
- **New:** `utilities.runDrawSelfTest()` draws a known image and reads it
  back, to tell whether the device draws 16-bit data right.
