---
id: volume-slice-navigation-implementation
title: Volume slice navigation implementation
summary: The slice grid of a volume view - its range, step, count, positions, default slice and index - the code that reads it, what each API reports, the acquisition plane rule, and the behaviour changes against 5.x and the 6.0 betas
---

# Volume slice navigation implementation

## Scope

This specification gives the design that meets the
[volume slice navigation requirements](./requirements.md) (VSN-U-1 to
VSN-U-11) in a planar viewport in volume mode. It is for the developer who
builds an application on Cornerstone3D or changes the slice code. A planar
viewport in stack mode shows its images; it has no slice grid.

Change rule: change this document when the design changes. The requirements
change only by their own rule.

## The slice grid

The slices of a view of a volume are one grid along the view plane normal.
Every slice position, index and count of the view comes from it.

- **VSN-I-1 The range.** `n` is the unit view plane normal. `min` and `max`
  are the smallest and the largest projection `n · c` of the centres `c` of
  the eight corner voxels of the volume (index 0 and `d - 1` on each axis).
  The range is `max - min`. The range is measured between voxel centres, not
  voxel edges: a view along an axis of `N` voxels has the range
  `(N - 1) * s`, not `N * s`.
- **VSN-I-2 The step.** `s` is the thickness of one voxel along the normal,
  `Σᵢ |n · aᵢ| · sᵢ` for the unit axes `aᵢ` and the spacing `sᵢ` of the
  volume (`getVoxelThicknessAlongNormal`, the L1 measure), when
  `rendering.sliceStepMeasure` is `'l1'`, the default. With `'l2'` it is the
  length of the projected spacing, `sqrt(Σᵢ (n · aᵢ · sᵢ)²)`
  (`getSpacingInNormalDirection`), the step of 5.x and of the 6.0 betas. The
  two are equal for a normal along an axis. For an oblique normal the L2 step
  is shorter than a voxel.
- **VSN-I-3 The count and the positions.** `M = round(range / s)`, or 0 for a
  range of 0. The view has `M + 1` slices. Slice `k` (`0 ≤ k ≤ M`) lies at the
  projection `p_k = start + k * s` with `start = min + (range - M * s) / 2`:
  the grid is centred on the range, so `p_0 - min = max - p_M`, and
  `|p_0 - min| ≤ s / 4`, inside the corner voxel. For a view along an axis of
  `N` voxels, `M = N - 1` and `start = min`: the slices are the voxel centres,
  `N` of them, as before. Slice 0 is the slice of the smallest projection, so
  the index counts along the normal.
- **VSN-I-4 The index of a point.** The index of a point `x` is
  `round((n · x - start) / s)`, kept between 0 and `M`: the nearest slice of
  the grid.
- **VSN-I-5 The default slice.** A view that asks for no slice and no point
  opens on slice `floor((M + 1) / 2)`, at its grid position. For an odd count
  this is the middle slice for both directions of the normal. For an even
  count it is the upper of the two middle slices in view order: for an axial
  view (normal `[0, 0, -1]`) of 6 slices, slice 3, which is the third voxel
  plane from the bottom (`k = 2`).

The grid lives in `utilities/volumeSliceGrid.ts` (`getSliceGrid`,
`getGridSliceIndex`, `getGridSliceProjection`, `getDefaultGridSliceIndex`,
`getSliceStepAlongNormal`) and, for a volume and a normal,
`getPlanarVolumeSliceGrid` of `planarSliceBasis.ts`. Both are internal; the
public way to read the grid is `utilities.getVolumeSliceGrid` (VSN-I-9).

- **VSN-I-9 The grid before a mount** (VSN-U-10).
  `utilities.getVolumeSliceGrid({ volumeId | imageIds, orientation })` gives
  the grid of a view with the code of the viewport: the orientation as a
  mount resolves it (`normalizePlanarOrientation` with the acquisition
  orientation of the images, so a standard orientation within the tilt of
  VSN-I-6 is the acquisition view), the view vectors
  (`getPlanarViewStateVectors`), the slice basis
  (`createPlanarVolumeSliceBasis`) and the grid
  (`getPlanarVolumeSliceGrid`). It gives `numberOfSlices` (`M + 1`), `step`
  (`s`), `defaultSliceIndex` (VSN-I-5), `defaultSliceWorldPoint` (the focal
  point of a mount with no start), `viewPlaneNormal`, `viewUp`,
  `getSliceWorldPoint(k)` (the focal point of slice `k` with no pan),
  `getSliceIndex(point)` (VSN-I-4) and `getViewReference(k)`. The volume is
  one of the cache, whose pixels need not be loaded, or the images of a
  series: the geometry comes then from their `imagePlaneModule`
  (`imageOrientationPatient`, `pixelSpacing`, `rows`, `columns` and
  `frameOfReferenceUID` of the first image, `imagePositionPatient` of each
  image), by the code that makes the geometry of a volume of the images
  (`getVolumeGeometryFromImageIds`, used by
  `generateVolumePropsFromImageIds`). A reformat name is refused: its
  vectors depend on the view on display. `getViewReference(k)` names the
  frame of reference, the focal point of slice `k`, the normal and the view
  up, and no volume and no slice index: a mount of any volume of the frame
  of reference takes it as `initialViewReference` and opens on its slice
  nearest to the point (VSN-I-4), with the focal point at the depth of the
  point.
- **VSN-I-10 A start at a view reference reads the view of the mount**
  (VSN-U-11). The mount option `initialViewReference` is checked and applied
  after the view state of the mount (its orientation and its default slice)
  is in place and before the first draw. The slice count and the slice on
  display that the check reads come from the view of that view state (its
  slice basis), not from the render path, which holds the count of the
  acquired images until its first draw. So the check gives the answer that
  `isReferenceViewable(ref, { withNavigation: true })` gives on the mounted
  viewport, and the start goes where `setViewReference(ref)` goes on it.

### Why VSN-U-1 holds

A plane at projection `p` cuts the voxel with centre projection `c` when
`-t / 2 ≤ c - p < t / 2`, with `t` the thickness of the voxel along the
normal (the L1 measure), the half-open rule that the brush uses for the
voxels of a plane (`isVoxelCenterInSlab`, `'centerInside'`). With `s = t` the
planes `p_k` cut the voxel for exactly one `k`: `k = floor((c - start) / s +
1/2)`. That `k` lies in `[0, M]` because every centre lies in `[min, max]`
and `|start - min| ≤ s / 4`. With the L2 step `s < t` for an oblique normal,
and some voxels are cut by two planes: the brush fill of one oblique slice
shows on the next and the previous slice
(https://github.com/cornerstonejs/cornerstone3D/issues/2912). A labelmap is
drawn on a slice by nearest sampling, whose cell is the voxel box, so a voxel
shows on a slice exactly when the slice plane cuts it.

## What reads the grid

| Reader                                                                                                      | What it takes from the grid                                                                   |
| ----------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| The slice basis of a planar volume view (`createPlanarVolumeSliceBasis`)                                    | The position of slice `k`, the default slice, the index of a point, `maxImageIdIndex = M`     |
| `getCurrentImageIdIndex()`, `getSliceIndex()`, `getNumberOfSlices()`                                        | The index of the slice on display and `M + 1`                                                 |
| `setImageIdIndex(k)`, `viewport.scroll`, `utilities.scroll`, `utilities.jumpToSlice`                        | The position of slice `k`                                                                     |
| `scrollSlabs` and the scroll by another volume (`countPlanarVolumeScrollSteps`, `snapFocalPointToSlice`)    | The grid of the range with the slab thickness or the step of the other volume as its step     |
| `utilities.snapFocalPointToSlice`                                                                           | The grid of the range and the step that the caller gives                                      |
| `utilities.getSlicesClippingPlanes` (the surface cuts of a contour segmentation)                            | One entry for each slice of the grid, at its position                                         |
| `utilities.getTargetVolumeAndSpacingInNormalDir` (the annotation filter and the line of sight of the tools) | The step `s` of the measure: an annotation shows on a slice when it lies within `s / 2` of it |
| The brush of the tools                                                                                      | The voxels of a plane by the L1 thickness: one slice of the grid                              |

The crosshairs and the reference lines move the view to a point, whose slice
is VSN-I-4, and read the index and the count above. The stack prefetch reads
the image indices of a stack, which has no grid.

`resetViewState()` keeps the slice (a 6.0 rule), so the slice of a view after
a reset is the slice it showed; a new mount opens on the default slice.

## What each API reports

| API                                                                  | Volume mode                                                                                                                                                                                                                                                              |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `getNumberOfSlices()`                                                | `M + 1`                                                                                                                                                                                                                                                                  |
| `getCurrentImageIdIndex()`, `getSliceIndex()`                        | The index of the slice on display (VSN-I-4)                                                                                                                                                                                                                              |
| `getViewReference().sliceIndex`                                      | The same index                                                                                                                                                                                                                                                           |
| `getViewReference().cameraFocalPoint`                                | The centre of the slice on display                                                                                                                                                                                                                                       |
| `getViewReference().referencedImageId`                               | The image that lies within half a slice of the slice on display along its scan axis: the image of the slice for a view in the acquisition plane; none for a slice that lies on no image, such as a slice of an oblique view or of a sagittal reformat of an axial series |
| `getTargetVolumeAndSpacingInNormalDir(...).spacingInNormalDirection` | The step `s` (or the slab thickness with `useSlabThickness`)                                                                                                                                                                                                             |

### The panes of a 512 x 512 x 135 CT

An axial CT of 512 x 512 x 135 voxels of 0.976562 x 0.976562 x 3.27 mm at
origin `[-250, -250, -360.18]` (the CT of the TMTV test study):

| Pane     | Normal       | Slices | Opens on (0-based, view order) | World position       | 5.18.3 opened on       |
| -------- | ------------ | ------ | ------------------------------ | -------------------- | ---------------------- |
| Axial    | `[0, 0, -1]` | 135    | 67                             | z = -141.09 (k = 67) | 67, the same           |
| Sagittal | `[1, 0, 0]`  | 512    | 256                            | x = 0.0 (i = 256)    | 256, the same          |
| Coronal  | `[0, -1, 0]` | 512    | 256                            | y = -0.977 (j = 255) | 255 (j = 256, y = 0.0) |

5.18.3 opened a view on the middle in volume order (`getVolumeCenterIJK`,
`floor(d / 2)` on the axis of the normal), so a view whose normal points
against the volume axis with an even count opened one slice before the
middle in view order. The OHIF 'middle' preset (`floor(N / 2)` in view order)
and the 6.0 default agree.

## The acquisition plane

- **VSN-I-6 One rule for "this plane is the acquisition plane".** A view
  plane normal is in the acquisition plane of a volume when
  `isAcquisitionPlaneNormal` accepts it: the tilt of the normal from the scan
  axis moves the plane by less than half a slice (`spacing[2] / 2`) across
  the half diagonal of the in-plane extent. Either direction of the scan axis
  counts. It decides:
  - which standard orientation the acquired frames show
    (`getPlanarAcquisitionOrientation`, from the frame geometry of
    `imagePlaneModule`: rows, columns, the pixel spacing and
    `spacingBetweenSlices` or `sliceThickness`, 1 where one is missing), so
    a request for that orientation shows the acquisition (VSN-U-8);
  - whether the camera of a standard orientation is the acquisition camera
    of a volume (`normalizePlanarOrientation`): its normal passes the rule
    and faces the same way, and its view up, laid into the acquisition
    plane, is the view up of the acquisition;
  - `isInAcquisitionPlane()` and whether the volume path of a reduced volume
    draws the acquired frames.
- **VSN-I-7 Images that cannot form a volume** keep the nearest standard
  orientation as their acquisition orientation, so a request for any
  standard orientation stays on the image path (VSN-U-9).
- **VSN-I-8 The sampling of a slice keeps the exact rule.** Whether a slice
  of a volume is a plain copy of one plane of voxels or is sampled on its own
  plane (`getExactSliceAxis`: the CPU slice, the labelmap slice, the CPU cost
  estimate) asks whether the plane is a plane of voxels, not whether it is
  the acquisition plane. A copy of a plane of voxels for a plane that is
  tilted within the tolerance would show voxels up to one slice away from the
  plane at the edges. A view in the acquisition plane by VSN-I-6 has the scan
  axis as its normal exactly, so it is copied; a view that the user tilts by
  less than the tolerance is sampled on its plane, except on the GPU volume
  path of a reduced volume, which draws the acquired frame (the full
  resolution image) by VSN-I-6.

## Behaviour changes

Against 6.0.0-beta.2 and the legacy volume viewport of 5.x:

- A view along an axis of the volume keeps its positions and its count.
- The default slice of a view with an even count and the normal against the
  volume axis (a coronal view of an axial series, an axial view whose
  normal is `[0, 0, -1]`, the acquisition view) moves one slice forward in
  view order, to `floor(N / 2)`.
- An oblique view has fewer slices: `round(range / t) + 1` with the L1 step
  `t`, where the L2 step gave `round(range / l2) + 1`. Its slices lie on the
  centred grid. A slice index of an oblique view stored with 6.0.0-beta.2 or
  5.x names another position.
- `snapFocalPointToSlice` snaps to the centred grid of the range it is given:
  for a range that is not a whole number of steps the first frame is not at
  `min`.
- A series tilted by less than half a slice across the image shows its
  acquired images for its standard orientation, where 6.0.0-beta.2 reformatted
  any tilt.
