---
id: viewport-fidelity
title: Viewport fidelity
summary: How the user learns that a viewport shows a lossy image - replicated, sub-resolution or lossy data, a decimation, a box average under magnification, or a sample distance larger than at full quality - and the events and queries that report it
---

# Viewport fidelity

## Scope

The indicator exists so that the user does not read a lossy image as a
lossless image. Only a viewport that shows a lossy image shows the indicator.

The user requirements apply to every viewport type. Today the code implements
them for the stack viewports and the volume viewports only. A different
viewport type obeys the user requirements when it can show a lossy image. The
stack implementation reads the per-image summary `ImageQualityStatus`. It does
not use `compareVoxelQuality()`.

The "user" of the user requirements is the clinician who reads the image. The
implementation requirements are for the developer who builds an application on
Cornerstone3D, or who adds a viewport type.

Change rule:

- A user requirement changes in two cases only: the requirement describes the
  behaviour wrongly, or the intended user-facing behaviour itself changes. An
  implementation that is inconvenient is never a reason to change a user
  requirement.
- An implementation requirement changes freely when a better approach appears.

The OHIF viewport fidelity indicator specification (VF) owns the user
requirements of the fidelity. The user requirements of this specification
follow VF. When the two disagree, VF is correct and this specification
changes.

Related documents:

- The fidelity state component: [cornerstone3D#2902](https://github.com/cornerstonejs/cornerstone3D/issues/2902).
- The quality record and the comparison function:
  [Composite voxel manager](../../concepts/cornerstone-core/compositeVoxelManager.md).
- The placement of fidelity code in a generic viewport:
  [Generic Viewport code design](./generic-viewport-code-design.md), group
  GENVIEW-FIDELITY.

## Description

A viewport can show an image that is worse than the stored data, and the image
itself gives the user no clue. A volume that the code decimated to fit a
texture limit can look the same as a small lesion.

**Lossy image.** The displayed image is lossy when it differs from a display of
the full stored data at the current display resolution. These causes make the
displayed image lossy:

- The viewport shows replicated, sub-resolution or lossy data that the loader
  delivered.
- The data is a decimation. A decimation aliases, so it is lossy at every
  magnification.
- The data is a box average, and one data voxel covers more than one display
  pixel.
- The render samples the data more coarsely than at full quality. The sample
  distance is larger than at full quality, during an interaction or after it.

While the load continues, data that has not arrived does not make the image
lossy when the viewport shows no other data in its place. An ordinary load
delivers only full-quality frames, and it does not make the displayed image
lossy while it continues. After the load ended, data that did not arrive (for
example, a frame that failed) makes the image lossy.

## User requirements

These requirements follow VF (see Scope). The VF names of the lossiness
states map to the states of this specification: transiently lossy is
`loading` or `lod`, and terminally lossy is `lossy`. A formerly lossy view is
`done`, and shows no indicator (FIDELITY-UI-4).

### The user knows when the image is lossy (FIDELITY-USER)

- **FIDELITY-USER-1** The user can determine when the displayed image is lossy,
  as the Description defines it. This holds while the user interacts with the
  viewport, and in the steady state.
- **FIDELITY-USER-2** The user can rely on the absence of a lossy indication. A
  viewport that shows a lossless image does not show a lossy indication.

### What the user sees (FIDELITY-STATE, FIDELITY-UI)

- **FIDELITY-STATE-2** A viewport that shows no data shows no indicator. A
  volume that has no delivered data is no data. A viewport that shows a
  lossless image shows no indicator. A load that delivers only full-quality frames shows no
  indicator while the load continues. While the load continues, data that has
  not arrived is not `loading` and not `lossy` by itself. After the load ended,
  data that did not arrive is lossy, and the viewport shows `lossy`: for
  example, a load that ended with a failed frame. This serves FIDELITY-USER-1
  and FIDELITY-USER-2.
- **FIDELITY-STATE-3** The user can tell a load that continues from a load that
  completed at a lossy quality. A progressive load shows `loading` until its
  last stage, also when a stage fills every slot with replicated, sub-resolution
  or lossy data, and also for a stack image whose later stage is still to come.
  The change from `loading` to `lossy` at the end of a lossy load is visible.
  This serves FIDELITY-USER-1.
- **FIDELITY-STATE-4** A reduction that ends with an interaction shows as `lod`
  while the interaction continues, with no delay. A reduction that stays after
  the interaction is a standing reduction and shows as `lossy`: for example, a
  sample distance multiplier above 1 when no interaction runs. A standing
  reduction is not hidden under `loading` or `lod`. The user can therefore
  determine whether waiting is expected to improve the image, and whether a
  lossless image is reachable at all. This serves FIDELITY-USER-1.
- **FIDELITY-STATE-12** A view that shows more than one data set shows the
  state of the worst data set (FIDELITY-STATE-7). A mixed view with any lossy
  data set shows `lossy`, with the `Low Fidelity` label, also while another
  data set still loads. Example: a CT that loads next to a decimated PET shows
  `lossy`. The hover details then state that other data still loads. This
  serves FIDELITY-USER-1.
- **FIDELITY-STATE-6** A box average is lossless when the data spacing on each
  axis is no coarser than the display spacing of FIDELITY-RECORD-2. This serves
  FIDELITY-USER-1 and FIDELITY-USER-2 (MR-U-5 of #2931).
  - In the view plane, one data voxel then covers no more than one display
    pixel. Example: the code loads the data at 1/2 in-plane resolution by a box
    average. The viewport displays the data at 1/2 resolution. The view then
    shows no indicator. When the user zooms in, the view becomes `lossy`.
  - In a slice view, a box average on the axis normal to the view plane is
    lossy at every zoom, unless an average slab covers the reduced spacing.
    That axis compares with the source slice spacing `S` (FIDELITY-RECORD-2),
    not the device pixel size. Reason: the reduced axis is the view normal, so
    each displayed slice is the mean of more than one source slice. Example: a
    progressive volume binds a shared 1×1×2 box-average texture. In the
    acquisition orientation the reduced axis `k` is the slice normal; spacing
    is `2S`, so the view is `lossy` at every zoom.
  - In sagittal and coronal views of the same 1×1×2 texture, the reduced axis
    `k` lies in the view plane. The check compares the `k` spacing with the
    device pixel size `p`. When `p ≥ 2S`, each device pixel covers at least two
    source slices along `k`, so the view is lossless. When the user zooms in
    further, the view becomes `lossy`.
  - A decimation of the same data, at the same display, still shows `lossy`. A
    decimation aliases at every magnification.

  Testing note (shared 1×1×2 texture): on the volume path the acquisition
  plane shows `lossy` at every zoom. When the volume slice path of a source draws the
  acquired frames (#3018), the acquisition plane shows `lossy` until the frame of the plane
  loads. When the frame shows, the indicator reports the quality of the frame, so a
  full-resolution frame shows no indicator. Sagittal
  and coronal show no indicator while the `k` extent uses no more device
  pixels than half of the source slice count (`p ≥ 2S`). After more zoom,
  sagittal and coronal show `lossy`.

- **FIDELITY-UI-2** The indicator sits in the top-right corner of the viewport.
  The user does not need to hover over the viewport, and the viewport does not
  need to be the active viewport. The indicator has the same form in every
  viewport type. While the view is lossy, a permanent text label is the
  indicator: `Low Fidelity` for a standing reduction (`lossy`), or
  `Transient Low Fidelity` for `loading` and `lod`. This serves
  FIDELITY-USER-1.
- **FIDELITY-UI-4** When the view becomes lossless (`done`), the label and its
  hover details disappear at once. Nothing stays over the image after the
  recovery, because a mark on the image can hide a finding. This serves
  FIDELITY-USER-2. The difference from VF is in Known deviations.

## Implementation requirements

### The decision of the state (FIDELITY-STATE)

`shownStateOf()`, `lineKind()` and `dataKindOf()` hold this decision.

- **FIDELITY-STATE-1** The viewport reports its fidelity in one of five states.
  This serves FIDELITY-USER-1.

| State     | What it means                                                                                                      | Expected to improve |
| --------- | ------------------------------------------------------------------------------------------------------------------ | ------------------- |
| `loading` | The viewport shows replicated, sub-resolution or lossy data that a later delivery replaces.                        | Yes                 |
| `lod`     | An interaction samples the data more coarsely than when no interaction runs.                                       | When it stops       |
| `lossy`   | A standing reduction: the data is reduced, decimated or lossy, or sampled coarsely, and this is the final quality. | No                  |
| `done`    | The viewport shows a lossless image.                                                                               | Not applicable      |
| `hidden`  | The viewport shows no image data yet.                                                                              | Not applicable      |

- **FIDELITY-STATE-5** Each viewport reports its own fidelity. Two viewports
  that show one volume can report a different state at one time.
- **FIDELITY-STATE-7** WHERE more than one cause applies, the viewport shows
  one indicator. The indicator shows the most urgent state, in this order:
  `lossy`, `loading`, `lod`, `done`. A standing reduction comes first, so that
  a transient state never hides it (FIDELITY-STATE-4). Inside one line, the
  same order applies: a decimated or reduced grid is `lossy` also while the
  load or an interaction continues. When a standing reduction shows and
  another line still loads, the hover details say so (FIDELITY-STATE-12).
  `fidelityDetailsTextOf()` adds "Other data is still loading." for a state
  that is not transient when a line with data is `loading`. VF owns the user
  rule of the mixed view.
- **FIDELITY-STATE-8** A stack viewport reports the fidelity of the image that
  it shows now, and not the worst image of the stack.
  `ProgressiveRetrieveImages` sets `IImage.imageQualityPending` while the same
  request or a later stage still replaces the image, and clears it when no
  stage follows. A pending `SUBRESOLUTION` or `LOSSY` image is `loading`.
  The generic stack render paths read `imageQualityPending` of the image that
  they draw, and draw again when `IMAGE_LOADED` gives a better stage of that
  image.
- **FIDELITY-STATE-9** A viewport reports the fidelity of its source data. The
  fidelity of an overlay, for example a reduced segmentation labelmap, is out
  of scope, with one exception. When the viewport shows the original acquired
  frame of the source, and a labelmap with a reduced resolution draws over that
  frame, the viewport reports the labelmap as reduced. The labelmap can then
  show a contour of a nearby slice on the frame. A labelmap at full resolution
  adds nothing. Over a reduced source image, the source already reports the
  reduction, and the labelmap adds nothing.
- **FIDELITY-STATE-10** A drawn grid that is coarser than the full volume, and
  that has no record, gives `lossy`. The indicator does not hide it. Only a
  legacy volume viewport makes such a line. A generic render path always sets
  a record with its grid.
- **FIDELITY-STATE-11** A volume line states `qualityPending` while the load of
  its volume continues (`loadStatus.loading`), and `reductionCause` from the
  strategy that chose the bound grid. Lossy deliveries with `qualityPending`
  give `loading`, also with no missing voxels. A reduced grid that is lossy at
  the display gives `lossy`, also while the load continues. No code makes an
  interim grid of a load yet (for example a progressive 1×1×2 texture), so no
  rule gives such a grid `loading`. The rule returns with the code that makes
  the interim grid. A record with `lowest` undefined has no
  delivered data, and the line has no data (FIDELITY-STATE-2).
  A volume line also states `qualityPending` while slices of its bound texture
  wait for the budgeted fill (`isFillPending()`), because those slices show 0.
  Pending data with no missing voxels gives `loading`, also with only
  full-resolution deliveries. The line reads the texture at each read of the
  fidelity after a draw, so the draw that fills the last slice ends `loading`.
  A volume line with `record.missing` above 0 and no `qualityPending` gives
  `lossy`, because the load ended and the missing voxels stay missing
  (FIDELITY-STATE-2).

### The record and the verdict (FIDELITY-RECORD)

- **FIDELITY-RECORD-1** The fidelity of a volume region is an absolute record,
  `VoxelQualityRecord`. The record states no verdict. The record states these
  items:
  - the grid;
  - the kind of the reduction;
  - the source;
  - the number of voxels that have not arrived (`missing`);
  - the lowest delivered quality (`lowest`);
  - the comparable summary (`status`).
- **FIDELITY-RECORD-2** A verdict comes from the pure function
  `utilities.voxelGrid.compareVoxelQuality(record, requirement)`. The
  requirement of a viewport holds `displaySpacing` on each index axis of the
  record grid. FIDELITY-STATE-5 and FIDELITY-STATE-6 depend on that function.
  `displaySpacingForGrid()` supplies the display spacing. A legacy viewport
  calls it through `displaySpacingOfViewport()`:
  - An axis in the view plane gets the world size of one display pixel.
  - In a slice view, the axis normal to the view plane gets the slice spacing
    of the source volume. An average slab gets `max(S, slab thickness)`,
    because the slab averages along the normal. A MIP or a MinIP slab keeps
    `S`.
  - In a 3D view, every axis gets the size of one display pixel.
  - A perspective camera has no single pixel size. The viewport then gives no
    display spacing, and the reduction factors decide without the
    magnification rule.
  - An oblique axis gets the finer of the two samplings along it:
    `min(p / sqrt(1 - c²), S / c)`, with `c` the cosine to the view plane
    normal.
  - No axis gets a value finer than the source spacing on that axis, because a
    view is lossy only against the full stored data.
  - The pixel size is the world size of one device pixel. A legacy viewport
    reads it from `parallelScale` and the canvas height in device pixels. A
    generic viewport reads it from the resolved view with `canvasToWorld()`,
    and divides by `devicePixelRatio`.
- **FIDELITY-RECORD-3** The render that drew the frame composes the record,
  because only the render knows which texture it bound. A reader gets the
  record of the bound grid with `imageVolume.getGridQuality(grid, statistic)`,
  and the record of the full volume with `imageVolume.getVoxelQuality()`. A
  generic path takes `statistic` from the binding it drew. A legacy path takes
  it from the bound streaming texture when present, otherwise from
  `volume.reductionStatistic`.
- **FIDELITY-RECORD-4** `utilities.voxelGrid.isAliasingReduction(reduction)`
  decides whether a reduction is a decimation for FIDELITY-STATE-6.
- **FIDELITY-RECORD-5** A stack image keeps its per-image summary,
  `ImageQualityStatus`. A reader gets it with `cache.getImageQuality(imageId)`,
  or from `IImage.imageQualityStatus`. The enum and its consumers stay as they
  are.
- **FIDELITY-RECORD-6** The sample reduction of a 3D render has two ratios to
  the sample distance at a multiplier of 1 (`sampleDistanceRatiosOf()`):
  `sampleDistanceLod`, the current ratio, and `sampleDistanceIdle`, the ratio
  when no interaction runs. The idle multiplier of a mapper is the last one
  that a viewport set (`setIdleSampleDistanceMultiplier()`), else
  `sampleDistanceMultiplier` of the configuration. An idle ratio above 1 is a
  standing reduction (`lossy`, cause `performanceTarget`, not transient).
  The part of the current ratio above the idle ratio is `lod`: for example
  `rotateSampleDistanceFactor` of `TrackballRotateTool` and
  `VolumeCroppingTool` during an interaction. A line that states no idle ratio
  counts its whole ratio as standing, so it promises no recovery: a ratio
  above 1 gives `lossy`, also during an interaction. A custom render path
  reports the idle ratio in `RenderingFidelity.sampleDistanceIdle`. A slice view
  samples no ray, so a slice line has ratios of 1 on the legacy and the
  generic paths.
- **FIDELITY-RECORD-7** `record.lowest` decides whether delivered data is lossy.
  A value below `ImageQualityStatus.FULL_RESOLUTION` is replicated,
  sub-resolution or lossy data. While the load continues (FIDELITY-STATE-11),
  that data gives `loading`. When the load ended, that data gives `lossy`, and
  `missing` above 0 also gives `lossy` (FIDELITY-STATE-2).

### The events and the queries (FIDELITY-EVENT)

- **FIDELITY-EVENT-1** Before `VIEWPORT_FIDELITY_CHANGED` existed, a consumer
  built the state from the events and the queries below. Those sources remain
  valid inputs for the viewport that derives the state.

| Event or query                                | Target        | What it tells a fidelity consumer                                                                                     |
| --------------------------------------------- | ------------- | --------------------------------------------------------------------------------------------------------------------- |
| `Events.IMAGE_RENDERED`                       | element       | A frame was drawn. Read the state again. Covers a change of the bound texture and of the interactive sample distance. |
| `Events.IMAGE_VOLUME_MODIFIED`                | `eventTarget` | A frame arrived in the volume `detail.volumeId`. The `missing` count of the record changed.                           |
| `Events.IMAGE_VOLUME_LOADING_COMPLETED`       | `eventTarget` | The load of a volume completed. A `loading` state becomes `done` or `lossy`, which FIDELITY-STATE-3 needs.            |
| `Events.IMAGE_LOADED`                         | `eventTarget` | One image arrived. The event can fire more than once for one image during a progressive load.                         |
| `Events.IMAGE_RETRIEVAL_STAGE`                | `eventTarget` | A progressive retrieval stage completed. The detail holds no fidelity field.                                          |
| `Events.STACK_NEW_IMAGE`                      | element       | A stack viewport shows a different image. Read the per-image summary for FIDELITY-STATE-8.                            |
| `Events.ELEMENT_DISABLED`                     | `eventTarget` | The viewport is gone. Remove the listeners of the consumer.                                                           |
| `imageVolume.getGridQuality(grid, statistic)` | query         | The record of the grid that the render bound.                                                                         |
| `utilities.voxelGrid.compareVoxelQuality()`   | query         | The verdict of one viewport for one record.                                                                           |
| `cache.getImageQuality(imageId)`              | query         | The per-image summary of a stack image.                                                                               |

- **FIDELITY-EVENT-2** The event `Events.VIEWPORT_FIDELITY_CHANGED` replaces
  the composition of FIDELITY-EVENT-1 for a consumer. See
  [cornerstone3D#2902](https://github.com/cornerstonejs/cornerstone3D/issues/2902).
- **FIDELITY-EVENT-3** The viewport fires `VIEWPORT_FIDELITY_CHANGED` on its
  element, as it fires `CAMERA_MODIFIED`, because the fidelity belongs to one
  viewport. The detail holds `viewportId` and the new state.
- **FIDELITY-EVENT-4** The viewport fires the event when the derived state
  changes, and not on each render. The change key holds `shownState`, `lossy`
  and the fields of the record. The key holds `progressive` only while the
  view is lossy, so an ordinary load fires no event on each frame. The key
  does not hold the display spacing. Thus a zoom, a pan or a resize that keeps
  the verdict fires no event. A zoom that changes a box-average verdict fires the event. The event
  has no debounce, so an interactive reduction reaches the consumer on the
  first frame (FIDELITY-STATE-4).
- **FIDELITY-EVENT-5** A consumer can also read the state when it asks, with
  `viewport.getFidelityState()`. It needs no event and no user interface. A test
  and a measurement harness read the state this way. The state holds
  `displayResolution`.
- **FIDELITY-EVENT-6** IF the state holds a reduction kind or a source that the
  consumer does not know, THEN the consumer shows a generic lossy state. The
  consumer does not hide the state, and the consumer does not throw. The kinds
  of reduction and the sources are extensible through
  `VoxelReductionRegistry` and `VoxelDataSourceRegistry`.
- **FIDELITY-EVENT-7** The code calls `notifyFidelityStateChanged()` once
  after each draw, after `IMAGE_RENDERED`:
  - The rendering engines call it after a draw in the engine loop.
  - `PlanarViewport.render()` calls it when a render path drew the frame
    itself and marked it with `markRendered()`. The CPU paths do that.
  - A volume viewport also calls it on `IMAGE_VOLUME_MODIFIED` and
    `IMAGE_VOLUME_LOADING_COMPLETED`, because no render can follow such an
    event. A generic render path requests a render on each volume event.
  - The `Viewport` class and the `GenericViewport` class use one shared
    helper, `helpers/fidelityIndicator/notifyFidelityStateChanged.ts`. The
    helper obeys `suppressEvents`.
  - A viewport whose `canReportFidelity()` is false returns at once. It
    reads no fidelity lines and fires no event.
- **FIDELITY-EVENT-8** The state gives the result directly, so that an
  application indicator can obey FIDELITY-USER-1 and FIDELITY-USER-2:
  - `shownState` is the state of FIDELITY-STATE-1, or `hidden` when there is
    no data. The built-in indicator uses the same decision.
  - `lossy` is true when `shownState` is `loading`, `lod` or `lossy`.
  - `progressive.lowest` is the lowest delivered quality (FIDELITY-RECORD-7).
    `progressive.status` falls to a replicate value while voxels have not
    arrived, also in an ordinary load. Thus `status` alone does not tell an
    ordinary load from a lossy load.
  - `cause` is `incompleteLoad`, and `transient` is true, only while the
    shown state is `loading`. An ordinary load gives no cause. A load that
    ended with missing voxels gives `lossy`, cause `missingFrames`, and
    `transient` false, unless a spatial reduction gives its own cause.
    `progressive.missing` and `progressive.loadedFraction` still show its
    progress.
  - `transient` is true only for `loading` and `lod`. A standing reduction
    anywhere in the view gives `lossy` and `transient` false.
  - `cause`, `magnitude` and `transient` are undefined when `shownState` is
    `done` or `hidden`.
  - A spatial reduction takes `cause` from the strategy that chose the grid
    (`IVolumeRenderStrategy.reductionCause`, `reductionCauseOf()`):
    `deviceTextureLimit` when the edge limit of the GPU settings alone reduces
    the volume, `memoryBudget` when only the texture memory does. A reduction
    that no strategy explains gives no cause. `lod` and an idle sample distance multiplier give
    `performanceTarget`.
  - `shownState` and `lossy` come from every volume of the viewport. The other
    fields describe the worst volume, the volume that decides `shownState`.
    Thus `cause` agrees with `lossy` when the viewport shows several volumes.
  - `done` is the state of every lossless view. The built-in indicator shows
    nothing for `done` (FIDELITY-UI-4).

### The built-in indicator (FIDELITY-UI)

`packages/core/src/RenderingEngine/helpers/fidelityIndicator/`

- **FIDELITY-UI-1** The rendering engine attaches the indicator when it enables a
  viewport, with `maybeAttachFidelityIndicator()`, and it removes the indicator
  with `detachFidelityIndicator()`. An application can call
  `attachFidelityIndicator(viewport)` itself, and that call returns the cleanup
  function. The indicator attaches only when `canReportFidelity()` is true. A
  generic family that can show lossy data returns true before it mounts data.
  The indicator then stays `hidden` until the viewport draws such data.
- **FIDELITY-UI-9** The indicator of FIDELITY-UI-2 is a DOM element in the
  top-right corner of the viewport element. `fidelityLabelOf()` takes the
  label from the shown state alone. The label uses a bright red foreground on
  a black background. The indicator is text only, with no icon. `.fi-root`
  has `data-state` (`loading`, `lod` or `lossy`) only while the label shows,
  and `data-hover` while the hover details show. When the label goes, the
  indicator clears `data-hover`, so no details stay with no label. The styles
  go into `document.head` once.
- **FIDELITY-UI-3** `shownStateOf()`, `lineKind()`, `fidelityLabelOf()` and
  `fidelityDetailsTextOf()` hold the decision of the state and the copy, and
  the decision has no DOM. A unit test checks the decision without a user
  interface.
- **FIDELITY-UI-5** A hover over the indicator shows clinician details, built
  by `fidelityDetailsTextOf()` from the absolute `ViewportFidelityState`: why
  the image is degraded (the cause), how much (percentage arrived, reduction
  `x/2, y/2, z/4`), and whether waiting should improve the image. The text of
  the cause `missingFrames` is `Missing frame(s)`. The copy avoids GPU, texture and retrieval jargon. The
  debug badge (`fidelityIndicatorDebug`) keeps a separate developer dump.
- **FIDELITY-UI-6** A consumer reads the derived state with
  `viewport.getFidelityState()` (FIDELITY-EVENT-5), and observes changes with
  `Events.VIEWPORT_FIDELITY_CHANGED` on the viewport element (FIDELITY-EVENT-2
  to FIDELITY-EVENT-4).
- **FIDELITY-UI-7** The indicator and its details are read-only. The user does
  not select the resolution, and the user does not configure the fidelity.
- **FIDELITY-UI-8** The indicator does not fire `VIEWPORT_FIDELITY_CHANGED`.
  It reads the fidelity lines when it attaches, on the event, and when the
  volume data changes without a render. Only the debug badge also reads the
  lines after each render. The label writes to the DOM only when its text or
  its state changes. A hover reads the lines when the details open.
- **FIDELITY-UI-10** The built-in indicator is a backup. It prevents a case
  where an application turns on multi-resolution and gives no indicator of its
  own. The indicator has English text only. An application that needs
  localized text, accessibility or touch support disables the built-in
  indicator (FIDELITY-CONF-1), and builds its own from
  `VIEWPORT_FIDELITY_CHANGED`.

### The configuration (FIDELITY-CONF)

- **FIDELITY-CONF-1** `init({ dangerouslyDisableFidelityIndicator: true })`
  removes the built-in indicator. The expected user is an application that
  shows its own indicator, for example OHIF. The configuration does not stop
  the record, the events or the queries, so the indicator of the application
  still works.
- **FIDELITY-CONF-2** `init({ debug: { fidelityIndicatorDebug: true } })` adds a
  text badge in the top-left corner, for a developer. The badge is not for a
  clinician.
- **FIDELITY-CONF-3** The configuration of the fidelity is global
  configuration. It is not view state, and it is not data presentation,
  because it moves no world point and it changes the look of no data.
- **FIDELITY-CONF-4** The documentation of `dangerouslyDisableFidelityIndicator`
  states the consequence. The user then sees lossy pixels with no disclosure,
  unless the application shows its own indicator. The name starts with
  `dangerously` for this reason. This serves FIDELITY-USER-1.

## Known deviations

### A display spacing on an oblique axis is an estimate

`displaySpacingForGrid()` gives an axis that is oblique to the view plane the
finer of two samplings: `p / sqrt(1 - c²)` and `S / c` (FIDELITY-RECORD-2).
The value is exact for an axis in the plane and for an axis normal to the
plane. Between the two, the value can ask for more than the display shows. The
error can show an indicator that is not necessary. The error never hides a
lossy view.

### The interim CS3D indicator shows no recovered state

The built-in indicator is an interim indicator until the application shows its
own (FIDELITY-CONF-1). It shows nothing for `done`. VF §5.4 suggests a short
recovery mark, and VF-VIS-1d requires that the recovered state is
re-revealable on demand.

The OHIF indicator follows VF.

## Past defects

No entry yet.
