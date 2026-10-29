---
id: viewport-fidelity
title: Viewport fidelity
summary: How the user learns that a viewport shows a lossy image - replicated, sub-resolution or lossy data, a decimation, a standing box average of a coarser grid, or a sample distance larger than at full quality - and the events and queries that report it
---

# Viewport fidelity

## Scope

The indicator exists so that the user does not read a lossy image as a
lossless image. Only a viewport that shows a lossy image shows the indicator.
There is one exception: after a lossy state ends, the indicator shows the
recovered state `done` for a short time (FIDELITY-UI-4).

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
- The data is a standing box average of a coarser grid. The render samples the
  averaged texture, not the full source, so the image can differ from a display
  of the full data at every magnification (for example a one-slice-thick
  structure at half contrast). A box average along the slice normal (for
  example a shared progressive texture at 1×1×2 in the acquisition orientation)
  is lossy on every slice and at every zoom. Visiting or loading the source
  instances does not remove the indication: the viewport still samples the
  box-averaged texture. Only a bind of a texture at the full resolution removes
  it.
- The render samples the data more coarsely than at full quality. The sample
  distance is larger than at full quality, during an interaction or after it.

Data that has not arrived does not make the image lossy when the viewport shows
no other data in its place. An ordinary load delivers only full-quality frames,
and it does not make the displayed image lossy.

## User requirements

### The user knows when the image is lossy (FIDELITY-USER)

- **FIDELITY-USER-1** The user can determine when the displayed image is lossy,
  as the Description defines it. This holds while the user interacts with the
  viewport, and in the steady state.
- **FIDELITY-USER-2** The user can rely on the absence of a lossy indication. A
  viewport that shows a lossless image does not show a lossy indication.

## Implementation requirements

### The decision of the state (FIDELITY-STATE)

`svgStateOf()`, `lineKind()` and `dataKindOf()` hold this decision.

- **FIDELITY-STATE-1** The viewport reports its fidelity in one of four states.
  This serves FIDELITY-USER-1.

| State     | What it means                                                                                                               | Expected to improve |
| --------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| `loading` | The viewport shows replicated, sub-resolution or lossy data in place of data that has not arrived. Better data comes later. | Yes                 |
| `lod`     | The render samples the data more coarsely than at full quality.                                                             | When it stops       |
| `lossy`   | The data is reduced, decimated or lossy, and this is the final quality.                                                     | No                  |
| `done`    | The viewport shows a lossless image.                                                                                        | Not applicable      |

- **FIDELITY-STATE-2** A viewport that shows no data shows no indicator. A
  viewport that shows a lossless image shows no indicator, except the short
  recovery mark of FIDELITY-UI-4. A load that delivers only full-quality frames
  shows no indicator while the load continues. Data that has not arrived is not
  `loading` by itself. This serves FIDELITY-USER-2.
- **FIDELITY-STATE-3** The user can tell a load that continues from a load that
  completed at a lossy quality. The change from `loading` to `lossy` is
  visible. This serves FIDELITY-USER-1.
- **FIDELITY-STATE-4** A reduced quality during an interaction shows as `lod`
  while the interaction continues, with no delay. A sample distance multiplier
  above 1 that stays after the interaction also stays `lod`. This serves
  FIDELITY-USER-1.
- **FIDELITY-STATE-5** Each viewport reports its own fidelity. Two viewports
  that show one volume can report a different state at one time.
- **FIDELITY-STATE-6** A standing box average of a grid coarser than the full
  volume is `lossy` at every magnification. This serves FIDELITY-USER-1 and
  FIDELITY-USER-2: the absence of an indication must not hide a texture that is
  not the full stored data.
  - Example: a progressive volume binds a shared 1×1×2 box-average texture. In
    the acquisition orientation the reduced axis is the slice normal; each
    displayed slice is the mean of two source slices. The viewport shows
    `lossy` on every slice and at every zoom. Loading the source instances does
    not clear the indication. Only a bind of the full-resolution texture does.
  - In the other MPR orientations the same texture puts the reduced axis in the
    view plane. The viewport still shows `lossy` at the default zoom, not only
    after the user zooms in.
  - In a slice view, display spacing on the view-normal axis still uses the
    source slice spacing (FIDELITY-RECORD-2), so a through-plane-only reduction
    stays visible even before the standing-box rule above.
  - A decimation of reduced data also shows `lossy` at every magnification. A
    decimation aliases; a standing box average does not alias in the voxel
    quality registry, but the indicator treats both as standing lossy data.
- **FIDELITY-STATE-7** WHERE more than one cause applies, the viewport shows
  one indicator. The indicator shows the most urgent state, in this order:
  `loading`, `lod`, `lossy`, `done`.
- **FIDELITY-STATE-8** A stack viewport reports the fidelity of the image that
  it shows now, and not the worst image of the stack.
- **FIDELITY-STATE-9** A viewport reports the fidelity of its source data. The
  fidelity of an overlay, for example a reduced segmentation labelmap, is out
  of scope.
- **FIDELITY-STATE-10** A drawn grid that is coarser than the full volume, and
  that has no record, gives `lossy`. The indicator does not hide it. Only a
  legacy volume viewport makes such a line. A generic render path always sets
  a record with its grid.

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
    of the source volume.
  - In a 3D view, every axis gets the size of one display pixel.
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
- **FIDELITY-RECORD-6** The sample reduction of a render is the ratio of the
  current sample distance of the mapper to the sample distance at a multiplier
  of 1. A ratio above 1 is the `lod` state. Every source of the ratio counts:
  `rotateSampleDistanceFactor` of `TrackballRotateTool` and
  `VolumeCroppingTool` during an interaction, and a `sampleDistanceMultiplier`
  above 1 from the configuration, a preset or a viewport property.
- **FIDELITY-RECORD-7** `record.lowest` decides whether delivered data is lossy.
  A value below `ImageQualityStatus.FULL_RESOLUTION` is replicated,
  sub-resolution or lossy data. When some voxels have not arrived, that data
  gives `loading`. When all voxels have arrived, that data gives `lossy`.

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
  and the fields of the record. The key does not hold the display
  spacing. Thus a zoom, a pan or a resize that keeps the verdict fires no
  event. A zoom that changes a box-average verdict fires the event. The event
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
  - The `Viewport` class and the `GenericViewport` class use one shared
    helper, `helpers/fidelityIndicator/notifyFidelityStateChanged.ts`. The
    helper obeys `suppressEvents`.
- **FIDELITY-EVENT-8** The state gives the result directly, so that an
  application indicator can obey FIDELITY-USER-1 and FIDELITY-USER-2:
  - `shownState` is the state of FIDELITY-STATE-1, or `hidden` when there is
    no data. The built-in indicator uses the same decision.
  - `lossy` is true when `shownState` is `loading`, `lod` or `lossy`.
  - `progressive.lowest` is the lowest delivered quality (FIDELITY-RECORD-7).
    `progressive.status` falls to a replicate value while voxels have not
    arrived, also in an ordinary load. Thus `status` alone does not tell an
    ordinary load from a lossy load.
  - `cause` is `incompleteLoad`, and `transient` is true, only while
    replicated, sub-resolution or lossy data shows in place of data that has
    not arrived. An ordinary load gives no cause. `progressive.missing` and
    `progressive.loadedFraction` still show its progress.
  - `shownState` and `lossy` come from every volume of the viewport. The other
    fields describe the worst volume, the volume that decides `shownState`.
    Thus `cause` agrees with `lossy` when the viewport shows several volumes.
  - `done` is the state of every lossless view. An application shows `done`
    only as the recovery mark of FIDELITY-UI-4.

### The built-in indicator (FIDELITY-UI)

`packages/core/src/RenderingEngine/helpers/fidelityIndicator/`

- **FIDELITY-UI-1** The rendering engine attaches the indicator when it enables a
  viewport, with `maybeAttachFidelityIndicator()`, and it removes the indicator
  with `detachFidelityIndicator()`. An application can call
  `attachFidelityIndicator(viewport)` itself, and that call returns the cleanup
  function. The indicator attaches only when `canReportFidelity()` is true. A
  generic family that can show lossy data returns true before it mounts data.
  The indicator then stays `hidden` until the viewport draws such data.
- **FIDELITY-UI-2** The indicator is a DOM element in the top-right corner of the
  viewport element. The user does not need to hover over the viewport, and the
  viewport does not need to be the active viewport. The indicator has the same
  form in every viewport type. While the view is degraded, a permanent text
  label sits beside the icon: `Low Fidelity` for a standing reduction, or
  `Transient Low Fidelity` for a load or interactive reduction. The label uses
  a bright red foreground on a black background. The state is on the
  `data-state`, `data-from`, `data-shown` and `data-label` attributes of
  `.fi-root`. The styles go into `document.head` once. This serves
  FIDELITY-USER-1 / FIDELITY-NOTIFY-1.
- **FIDELITY-UI-3** `svgStateOf()`, `lineKind()`, `fidelityLabelOf()` and
  `fidelityDetailsTextOf()` hold the decision of the state and the copy, and
  the decision has no DOM. A unit test checks the decision without a user
  interface.
- **FIDELITY-UI-4** The `done` state shows only as a recovery from `loading`,
  `lod` or `lossy`. A change from no indicator to `done` shows nothing. The
  `done` state shows for `DONE_HOLD_MS` (3 seconds) and then fades. The
  permanent Low Fidelity label is hidden during `done` and after the fade. The
  indicator does not stay over the image after the recovery, because a mark on
  the image can hide a finding. A hover over the corner does not show the
  `done` state again after the fade. This serves FIDELITY-USER-2.
- **FIDELITY-UI-5** A hover over the indicator shows clinician details
  (FIDELITY-DISCOVER-1..4), built by `fidelityDetailsTextOf()` from the
  absolute `ViewportFidelityState`: why the image is degraded, how much
  (percentage arrived, reduction `x/2, y/2, z/4`), and whether waiting should
  improve the image. The copy avoids GPU, texture and retrieval jargon. The
  debug badge (`fidelityIndicatorDebug`) keeps a separate developer dump.
- **FIDELITY-UI-6** A consumer reads the derived state with
  `viewport.getFidelityState()` (FIDELITY-EVENT-5), and observes changes with
  `Events.VIEWPORT_FIDELITY_CHANGED` on the viewport element (FIDELITY-EVENT-2
  to FIDELITY-EVENT-4).
- **FIDELITY-UI-7** The indicator and its details are read-only. The user does
  not select the resolution, and the user does not configure the fidelity.
- **FIDELITY-UI-8** The indicator does not fire `VIEWPORT_FIDELITY_CHANGED`.
  It reads the fidelity lines when it attaches, after each render, on the
  event, and when the volume data changes without a render.

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

### A generic stack image does not show a progressive upgrade

The generic image render paths draw the image that `loadAndCacheImage()`
returns. They do not redraw when a later retrieval stage replaces that image.
The viewport reports the quality of the image that it draws
(FIDELITY-STATE-8), so the report is correct. The view itself stays at the
first quality until the next image change.

### Replicated data in every slot shows `lossy`, not `loading`

An interleaved load can fill every slot with replicated data before the
better data arrives. The record then has no missing voxels, and its lowest
delivered quality is below `FULL_RESOLUTION`. The indicator shows `lossy`, and
not `loading`, while the better data still comes. The user still sees a lossy
indication, so FIDELITY-USER-1 holds. The state name is wrong, against
FIDELITY-STATE-3: the user cannot tell this load from a load that completed at
a lossy quality.

## Past defects

No entry yet.
