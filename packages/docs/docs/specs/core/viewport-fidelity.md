---
id: viewport-fidelity
title: Viewport fidelity
summary: How the user learns that a viewport shows degraded data - a load that is not complete, a reduced or decimated texture, or a reduced interactive quality - and the events and queries that report it
---

# Viewport fidelity

## Scope

This specification describes how a viewport tells the user that the image is
not a faithful rendering of the stored pixel data. The causes include a load
that is not complete, a texture that the code reduced to fit the device, a
decimation, and a reduced quality during an interaction.

The user requirements apply to every viewport type. Today the code implements
them for the stack viewports and the volume viewports only. A different
viewport type obeys the user requirements when it can show degraded data.

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

- The OHIF specification of the fidelity indicator (prefix `VF`) states the
  full requirements for the application. This page holds the part that
  Cornerstone3D owns. See [OHIF#6256](https://github.com/OHIF/Viewers/issues/6256).
- The fidelity state component: [cornerstone3D#2902](https://github.com/cornerstonejs/cornerstone3D/issues/2902).
- The quality record and the comparison function:
  [Composite voxel manager](../../concepts/cornerstone-core/compositeVoxelManager.md).
- The placement of fidelity code in a generic viewport:
  [Generic Viewport code design](./generic-viewport-code-design.md), group
  GENVIEW-FIDELITY.

## Description

A viewport can show data that is worse than the stored data, and the image
itself gives the user no clue. A progressive load that stops at a lossy stage
looks the same as a load that continues. A volume that the code decimated to
fit a texture limit looks the same as a small lesion.

The viewport therefore reports its fidelity in one of four states:

| State     | Meaning to the user                                              | Expected to improve |
| --------- | ---------------------------------------------------------------- | ------------------- |
| `loading` | Some of the data has not arrived.                                | Yes                 |
| `lod`     | The render samples the data more coarsely than at full quality.  | When it stops       |
| `lossy`   | The data is reduced or decimated, and this is the final quality. | No                  |
| `done`    | The viewport shows the full data.                                | Not applicable      |

A viewport with no data has no state, and it shows no indicator.

## User requirements

### Notification (FIDELITY-NOTIFY)

- **FIDELITY-NOTIFY-1** WHILE a viewport shows degraded data, the viewport shows
  a fidelity indicator. The user does not need to hover over the viewport, and
  the viewport does not need to be the active viewport.
- **FIDELITY-NOTIFY-2** A viewport that shows no data shows no indicator. A
  viewport that loads directly to the full data shows no indicator that stays.
- **FIDELITY-NOTIFY-3** WHEN the viewport stops showing degraded data, the
  indicator shows the recovered state for a short time, and then the indicator
  goes away. The indicator does not stay over the image after the recovery,
  because a mark on the image can hide a finding.
- **FIDELITY-NOTIFY-4** The user can tell a load that continues from a load that
  completed at a lossy quality. The change from `loading` to `lossy` is visible.
- **FIDELITY-NOTIFY-5** A reduced quality during an interaction shows on the
  indicator while the interaction continues, with no delay. When the
  interaction stops and the full quality returns, the indicator shows the
  recovery.
- **FIDELITY-NOTIFY-6** Each viewport reports its own fidelity. Two viewports
  that show one volume can report a different state at one time.
- **FIDELITY-NOTIFY-7** A viewport that shows reduced data at a magnification
  where the reduction is not visible reports the view as full fidelity. The
  user does not get a warning that is not necessary. A decimation is the
  exception: a decimation aliases, so the viewport reports it at every
  magnification.
- **FIDELITY-NOTIFY-8** WHERE more than one cause of degradation applies, the
  viewport shows one indicator. The indicator shows the state that is most
  urgent, in this order: `loading`, `lod`, `lossy`, `done`.

### Discovery (FIDELITY-DISCOVER)

- **FIDELITY-DISCOVER-1** The user can open the details of the indicator. The
  details state why the image is degraded: a load that is not complete, a
  reduction, a decimation, or an interactive reduction.
- **FIDELITY-DISCOVER-2** The details state the amount of the degradation as a
  number. Examples: a reduction factor for each axis (`2×2×4`), a percentage of
  the data that has arrived, a factor of the sample distance.
- **FIDELITY-DISCOVER-3** The details state whether a wait is expected to
  improve the image.
- **FIDELITY-DISCOVER-4** The details use words that a clinician understands
  without knowledge of textures, GPUs or retrieval stages.
- **FIDELITY-DISCOVER-5** The indicator and its details are read-only. The user
  does not select the resolution, and the user does not configure the
  fidelity. The software selects the resolution.

### Coverage (FIDELITY-SCOPE)

- **FIDELITY-SCOPE-1** The user gets the same indicator, in the same place and
  in the same form, in every viewport type that can show degraded data.
- **FIDELITY-SCOPE-2** A stack viewport reports the fidelity of the image that
  it shows now, and not the worst image of the stack.
- **FIDELITY-SCOPE-3** A viewport reports the fidelity of its source data. The
  fidelity of an overlay, for example a reduced segmentation labelmap, is out
  of scope.

### Removal (FIDELITY-REMOVE)

- **FIDELITY-REMOVE-1** A deployment can remove the built-in indicator by
  configuration, for example to show the indicator of the application.
- **FIDELITY-REMOVE-2** The documentation of that configuration states the
  consequence: the user then sees degraded pixels with no disclosure, unless
  the application shows its own indicator.

## Implementation requirements

### The record and the verdict (FIDELITY-RECORD)

- **FIDELITY-RECORD-1** The fidelity of a volume region is an absolute record,
  `VoxelQualityRecord`. The record states the grid, the kind of the reduction,
  the source, the missing voxels and the comparable summary. The record states
  no verdict.
- **FIDELITY-RECORD-2** A verdict comes from the pure function
  `utilities.voxelGrid.compareVoxelQuality(record, requirement)`. The
  requirement of a viewport holds `displaySpacing`, the world distance that one
  display pixel covers on each axis. FIDELITY-NOTIFY-6 and FIDELITY-NOTIFY-7
  depend on that function.
- **FIDELITY-RECORD-3** The render that drew the frame composes the record,
  because only the render knows which texture it bound. A reader gets the
  record of the bound grid with `imageVolume.getGridQuality(grid, statistic)`,
  and the record of the full volume with `imageVolume.getVoxelQuality()`.
- **FIDELITY-RECORD-4** `utilities.voxelGrid.isAliasingReduction(reduction)`
  decides whether a reduction is a decimation for FIDELITY-NOTIFY-7.
- **FIDELITY-RECORD-5** A stack image keeps its per-image summary,
  `ImageQualityStatus`. A reader gets it with `cache.getImageQuality(imageId)`,
  or from `IImage.imageQualityStatus`. The enum and its consumers stay as they
  are.
- **FIDELITY-RECORD-6** A reduced sampling of a render is the ratio of the
  current sample distance of the mapper to the sample distance at a multiplier
  of 1. A ratio above 1 is the `lod` state. Every source of the ratio counts:
  `rotateSampleDistanceFactor` of `TrackballRotateTool` and
  `VolumeCroppingTool` during an interaction, and a `sampleDistanceMultiplier`
  above 1 from the configuration, a preset or a viewport property. A
  multiplier above 1 that stays after the interaction is a standing reduction,
  and the indicator stays in the `lod` state.

### The events and the queries (FIDELITY-EVENT)

- **FIDELITY-EVENT-1** Before `VIEWPORT_FIDELITY_CHANGED` landed, a consumer
  built the state from the events and the queries below. Those sources remain
  valid inputs for the viewport that derives the state.

| Event or query                                | Target        | What it tells a fidelity consumer                                                                                     |
| --------------------------------------------- | ------------- | --------------------------------------------------------------------------------------------------------------------- |
| `Events.IMAGE_RENDERED`                       | element       | A frame was drawn. Read the state again. Covers a change of the bound texture and of the interactive sample distance. |
| `Events.IMAGE_VOLUME_MODIFIED`                | `eventTarget` | A frame arrived in the volume `detail.volumeId`. The `missing` count of the record changed.                           |
| `Events.IMAGE_VOLUME_LOADING_COMPLETED`       | `eventTarget` | The load of a volume completed. A `loading` state becomes `done` or `lossy`, which FIDELITY-NOTIFY-4 needs.           |
| `Events.IMAGE_LOADED`                         | `eventTarget` | One image arrived. The event can fire more than once for one image during a progressive load.                         |
| `Events.IMAGE_RETRIEVAL_STAGE`                | `eventTarget` | A progressive retrieval stage completed. The detail holds no fidelity field.                                          |
| `Events.STACK_NEW_IMAGE`                      | element       | A stack viewport shows a different image. Read the per-image summary for FIDELITY-SCOPE-2.                            |
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
  changes, and not on each render. The event has no debounce, so an
  interactive reduction reaches the consumer on the first frame
  (FIDELITY-NOTIFY-5).
- **FIDELITY-EVENT-5** A consumer can also read the state on demand, without the
  event and without a user interface. A test and a measurement harness read the
  state this way.
- **FIDELITY-EVENT-6** IF the state holds a reduction kind or a source that the
  consumer does not know, THEN the consumer shows a generic degraded state. The
  consumer does not hide the state, and the consumer does not throw. The kinds
  of reduction and the sources are extensible through
  `VoxelReductionRegistry` and `VoxelDataSourceRegistry`.

### The built-in indicator (FIDELITY-UI)

`packages/core/src/RenderingEngine/helpers/fidelityIndicator/`

- **FIDELITY-UI-1** The rendering engine attaches the indicator when it enables a
  viewport, with `maybeAttachFidelityIndicator()`, and it removes the indicator
  with `detachFidelityIndicator()`. An application can call
  `attachFidelityIndicator(viewport)` itself, and that call returns the cleanup
  function.
- **FIDELITY-UI-2** The indicator is a DOM element in the top-right corner of the
  viewport element. The state is on the `data-state`, `data-from` and
  `data-shown` attributes of `.fi-root`. The styles go into `document.head`
  once.
- **FIDELITY-UI-3** `svgStateOf()` and `lineKind()` hold the decision of the
  state, and the decision has no DOM. A unit test checks the decision without a
  user interface.
- **FIDELITY-UI-4** The `done` state shows for 1 second and then fades
  (FIDELITY-NOTIFY-3). A hover over the corner does not show the `done` state
  again after the fade.
- **FIDELITY-UI-5** A hover over the indicator shows the details
  (FIDELITY-DISCOVER-1 and FIDELITY-DISCOVER-2): the status, the delivery
  quality, the grid, the missing percentage, the source, the reduction and the
  sample distance. That text is a developer view of the record. An application
  indicator that needs clinician words (FIDELITY-DISCOVER-4) builds them from
  `getFidelityState()` or `VIEWPORT_FIDELITY_CHANGED`, and does not reuse the
  built-in hover string.
- **FIDELITY-UI-6** A consumer reads the derived state with
  `viewport.getFidelityState()` (FIDELITY-EVENT-5), and observes changes with
  `Events.VIEWPORT_FIDELITY_CHANGED` on the viewport element (FIDELITY-EVENT-2
  to FIDELITY-EVENT-4).

### The configuration (FIDELITY-CONF)

- **FIDELITY-CONF-1** `init({ dangerouslyDisableFidelityIndicator: true })`
  removes the built-in indicator (FIDELITY-REMOVE-1). The name starts with
  `dangerously` because of FIDELITY-REMOVE-2. The configuration does not stop
  the record, the events or the queries, so an application indicator still
  works.
- **FIDELITY-CONF-2** `init({ debug: { fidelityIndicatorDebug: true } })` adds a
  text badge in the top-left corner, for a developer. The badge is not for a
  clinician.
- **FIDELITY-CONF-3** The configuration of the fidelity is global
  configuration. It is not view state, and it is not data presentation,
  because it moves no world point and it changes the look of no data.

## Known deviations

### The built-in hover text uses developer words

The built-in indicator hover text states `grid`, `delivery`, `source` and
`sample distance`, and it is not translated. The text is a developer view of
the record. The documentation of the indicator states that an application
indicator supplies clinician-facing words from `getFidelityState()` /
`VIEWPORT_FIDELITY_CHANGED` (FIDELITY-DISCOVER-4).

This is intentional for the built-in UI. An application indicator meets
FIDELITY-DISCOVER-4 from the same state.

## Past defects

| Defect                                                 | Fixed in                   | Requirement                          |
| ------------------------------------------------------ | -------------------------- | ------------------------------------ |
| No `VIEWPORT_FIDELITY_CHANGED` / no `getFidelityState` | follow-up to #2978 / #2902 | FIDELITY-EVENT-2..5                  |
| Stack viewport had no indicator                        | follow-up to #2978         | FIDELITY-SCOPE-1/2                   |
| Verdict ignored magnification                          | follow-up to #2978         | FIDELITY-NOTIFY-7, FIDELITY-RECORD-2 |
| Indicator read actors/mappers                          | follow-up to #2978         | GENVIEW-FIDELITY-2                   |
