---
id: from-a-6-beta
title: From a 6.0 beta to 6.0
summary: For an application that already runs on 6.0.0-beta.1 or 6.0.0-beta.2 - every change since 6.0.0-beta.2 in one table, the codemod step that makes the renames, and the changes that the codemod cannot make
---

# From a 6.0 beta to 6.0

This page is for an application that already runs on 6.0.0-beta.1 or
6.0.0-beta.2 (6.0.0-beta.2 renamed nothing of 6.0.0-beta.1). It has every
change since 6.0.0-beta.2 in one table, the command that makes the renames,
and the changes that the codemod cannot make for the application. An
application on 5.x follows
[The upgrade, step by step](./4-upgrade-step-by-step.md) instead: its codemod
ends with the same step.

## Run the codemod step

The step `@cornerstonejs/cornerstone3d-6-api-names` rewrites the names that
changed after 6.0.0-beta.2. It needs no step before it. Run it on a clean
branch, first without writing:

```sh
npx codemod @cornerstonejs/cornerstone3d-6-api-names --dry-run
npx codemod @cornerstonejs/cornerstone3d-6-api-names
```

6.0.0-beta.2 still took the 5.x viewport type strings (`'planarNext'`,
`'volume3dNext'` and their kin) as deprecated aliases, and 6.0 throws for
them. The `viewport-types` step rewrites them in a viewport input and reports
them elsewhere, also on code of a 6.0 beta. An application that stores or
compares such a string runs it too:

```sh
npx codemod @cornerstonejs/cornerstone3d-6-viewport-types
```

At the end each step prints two lists: `cornerstone3d-6-manual`, the sites
that it left to you, and `cornerstone3d-6-review`, the sites that it rewrote
where a person should look. Then run the type checker: a name that the
codemod did not reach is a compile error. The rows of each name are in
[Names changed since 6.0.0-beta.2](./3-api-map.md#names-changed-since-600-beta2).

## Every change since 6.0.0-beta.2

The rows are in the order in which an application is likely to meet them. The
column "Codemod" says what the step above does: **Rewrites** where it needs no
knowledge of the application, **Reports** where it lists the site for a
person, and **Nothing** where the code stays the same and its result changes.

| Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | What the application does                                                                                                                    | Codemod                                                                               | Details                                                                                                                                                         |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The registry is `displaySetRegistry`, a top-level export of `@cornerstonejs/core` (and of `@cornerstonejs/metadata`), in place of `utilities.genericViewportDisplaySetMetadataProvider`. `get` takes the id only, a descriptor has no `kind` and is an object                                                                                                                                                                                                                                                               | `displaySetRegistry.add(displaySetId, { imageIds })`, `displaySetRegistry.get(displaySetId)`                                                 | Rewrites; reports a descriptor that is not a literal                                  | [Display set names](./3-api-map.md#display-set-names)                                                                                                           |
| `dataId` is `displaySetId` in a view reference, a render plan layer, an event detail, a stack input and a projection; `removeData` is `removeDisplaySet`; `getSourceDataId` is `getSourceDisplaySetId`; the video and ECG key `sourceDataId` is `imageId`                                                                                                                                                                                                                                                                   | Rename; a view reference stored by a beta carries `dataId`, which 6.0 does not read: rename the key when the application loads it            | Rewrites where the file shows the object; reports the others                          | [The names of 6.0.0-beta.2](./1-next-viewports-only.md#the-names-of-600-beta2)                                                                                  |
| A `volumeId` names a volume and no longer makes a planar viewport show one. A mount without `mode` shows a stack in the acquisition plane                                                                                                                                                                                                                                                                                                                                                                                   | Mount with `options: { mode: 'volume' }` where the viewport shows a volume                                                                   | Rewrites a mount of the same file; reports a registration whose mount it does not see | [A volume id names a volume](./1-next-viewports-only.md#a-volume-id-names-a-volume-the-mount-chooses-the-mode)                                                  |
| `setDisplaySetPresentation`, `getDisplaySetPresentation`, `resetDisplaySetPresentation` and the `*DataPresentation` types are `setDisplaySetAppearance`, `getDisplaySetAppearance`, `resetDisplaySetAppearance` and `*DisplaySetAppearance`                                                                                                                                                                                                                                                                                 | Rename                                                                                                                                       | Rewrites; reports a viewport known by its name only                                   | [Appearance names](./3-api-map.md#appearance-names)                                                                                                             |
| `VOI_MODIFIED` and `COLORMAP_MODIFIED` are one event, `DISPLAY_SET_APPEARANCE_CHANGED`, with `cause`, `changedKeys`, `overrides` and `effective`. It also fires at the mount and when a scroll shows an image with another default window                                                                                                                                                                                                                                                                                   | Test `detail.cause` and `detail.changedKeys` in each listener                                                                                | Rewrites the name and the reads of the detail; reports each listener for review       | [The appearance event](./2-rendering-changes.md#the-appearance-event-and-the-two-getters)                                                                       |
| `getDisplaySetAppearance` gives the overrides only, what a caller set; `getEffectiveDisplaySetAppearance` gives what is drawn                                                                                                                                                                                                                                                                                                                                                                                               | Read the effective appearance to show or compare a value, the overrides to copy or store                                                     | Reports a read whose value is shown or compared                                       | [Overrides and the values on display](./2-rendering-changes.md#overrides-and-the-values-on-display)                                                             |
| `VIEWPORT_NEW_IMAGE_SET` and `VOLUME_VIEWPORT_NEW_VOLUME` are one event, `DISPLAY_SETS_CHANGED`, of every viewport family. It also fires when an overlay such as a labelmap comes or goes                                                                                                                                                                                                                                                                                                                                   | Return early when `!evt.detail.sourceChanged` in a listener that cares for the source                                                        | Rewrites the name; reports each listener for review                                   | [Events and image loading](./2-rendering-changes.md#events-and-image-loading-of-a-planar-viewport)                                                              |
| `detail.imageIdIndex` of `NEW_IMAGE` is `detail.sliceIndex`, and the detail has `displaySetId`. `NEW_IMAGE` fires for the source only                                                                                                                                                                                                                                                                                                                                                                                       | Rename the key                                                                                                                               | Rewrites in a listener of the file; reports the others                                | [Display set and image events](./3-api-map.md#display-set-and-image-events)                                                                                     |
| `initialImageIdIndex` is a mount option. A planar mount of a descriptor that has it fails                                                                                                                                                                                                                                                                                                                                                                                                                                   | `setDisplaySets({ displaySetId, options: { initialImageIdIndex } })`                                                                         | Moves it to the planar mounts of the same file; reports the others                    | [Mount options](./3-api-map.md#mount-options)                                                                                                                   |
| `ViewPresentation` is `ViewFraming`: `viewportProjection.getFraming` and `withFraming`, and the new `viewport.getViewFraming()` and `setViewFraming()`                                                                                                                                                                                                                                                                                                                                                                      | Rename                                                                                                                                       | Rewrites                                                                              | [Framing names](./3-api-map.md#framing-names)                                                                                                                   |
| `colormap.opacity` is gone: a number is the `opacity` of the appearance, a list of points is `colormap.opacityMapping`. `Types.ColormapPublic` is `Types.AppearanceColormap`. Every render path draws `opacity * ramp(value)`, and 0 below `threshold`                                                                                                                                                                                                                                                                      | Move the key; check a fusion with a threshold                                                                                                | Rewrites a literal; reports the others                                                | [One opacity](./2-rendering-changes.md#one-opacity)                                                                                                             |
| `setDisplayArea`, `getDisplayArea`, `options`, `setOptions`, `reset` and `DISPLAY_AREA_MODIFIED` of a planar viewport are gone. `setViewState({ displayArea })` shows the area at scale `[1, 1]`, and `defaultOptions.displayArea` is applied                                                                                                                                                                                                                                                                               | `setViewState({ displayArea })`, `getViewState().displayArea`, `CAMERA_MODIFIED`                                                             | Rewrites the two calls; reports the others                                            | [The display area and the framing](./3-api-map.md#the-display-area-and-the-framing)                                                                             |
| `STACK_SCROLL_OUT_OF_BOUNDS` and `VOLUME_VIEWPORT_SCROLL_OUT_OF_BOUNDS` are `SCROLL_OUT_OF_BOUNDS`, which fires only when a scroll stops at an end, also from `viewport.scroll`. `VOLUME_VIEWPORT_SCROLL` is gone                                                                                                                                                                                                                                                                                                           | Read `delta`, `sliceIndex` and `numberOfSlices` of the new detail                                                                            | Rewrites the name and the keys with one new key; reports the others                   | [Scroll](./3-api-map.md#scroll)                                                                                                                                 |
| The render modes are private: `ActorRenderMode`, `ActorEntry.actorMapper`, the `renderMode` of a render plan layer and of a 3D mount. The slots of `registerRenderBackend` are `frame`, `cpu` and `gpuVolume`                                                                                                                                                                                                                                                                                                               | Read `slice`, `draw` and `backend` of `viewport.getRenderPlan()`; `entry.actor.getMapper()`                                                  | Rewrites the mapper, the slots and the 3D option; reports each test of a mode         | [The render plan](./3-api-map.md#the-render-plan)                                                                                                               |
| `GenericViewport` is `BaseViewport`; the deprecated aliases (`*_NEXT`, `GenericVolumeViewport3D` and its kin, `Types.IGenericViewport`) are gone; the strings `'planarNext'` and their kin throw                                                                                                                                                                                                                                                                                                                            | Rename                                                                                                                                       | `api-names` rewrites the names; `viewport-types` the strings                          | [Viewport types](./3-api-map.md#viewport-types)                                                                                                                 |
| `findDataIdByVolumeId` is `getDisplaySetIdForVolumeId`. New: `getVolumeIds()`, `getScalarRange()`, `isInAcquisitionPlane()`, and `'geometry3d'` for a 3D viewport that shows a surface, where it said `'unknown'`                                                                                                                                                                                                                                                                                                           | Rename; use the new members in place of reads of the cache and the mapper                                                                    | Rewrites the rename                                                                   | [Viewport queries](./2-rendering-changes.md#viewport-queries)                                                                                                   |
| One store: `displaySetRegistry` is the `DISPLAY_SET` module of `@cornerstonejs/metadata`. A value written into the module with `setCacheData` is not a registration; `utilities.clearCacheData()` removes every registration                                                                                                                                                                                                                                                                                                | Register each display set once with `displaySetRegistry.add`                                                                                 | Nothing                                                                               | [One store for display sets](./1-next-viewports-only.md#one-store-for-display-sets)                                                                             |
| A mount reads the registration once; `getDisplaySets()` gives the options of each mount; the mount option `appearance` draws the first picture with its appearance and fires one event                                                                                                                                                                                                                                                                                                                                      | Pass the look on the mount where it was set right after it                                                                                   | Nothing                                                                               | [What one viewport wants is said on its mount](./1-next-viewports-only.md#what-one-viewport-wants-is-said-on-its-mount)                                         |
| No view reference changes the source; a reference is judged by its image or its plane, also when its display set is no longer registered; a stack moves nothing for a reference of a volume that names no image                                                                                                                                                                                                                                                                                                             | Mount with `role: 'source'` to change the source                                                                                             | Nothing                                                                               | [View references](./3-api-map.md#view-references)                                                                                                               |
| A 3D viewport without a `volumeId` loads `utilities.getDefaultVolumeId(imageIds)`, where it loaded `cornerstoneStreamingImageVolume:<displaySetId>`                                                                                                                                                                                                                                                                                                                                                                         | Give the old id as `volumeId` where the application reads the volume by it                                                                   | Nothing                                                                               | [A volume id names a volume](./1-next-viewports-only.md#a-volume-id-names-a-volume-the-mount-chooses-the-mode)                                                  |
| A reset of the appearance of a 3D viewport goes back to the defaults; `{ key: undefined }` removes an override; a removed opacity draws 1 again                                                                                                                                                                                                                                                                                                                                                                             | Nothing, unless the application relied on the old reset                                                                                      | Nothing                                                                               | [The appearance event and the getters](./3-api-map.md#the-appearance-event-and-the-two-getters)                                                                 |
| A resize of a planar viewport keeps its parallel scale and its focal point, as the legacy viewports did; a view reference of an overlay keeps the source; a reference with a value that is not finite moves nothing; a window level drag in volume mode takes its multiplier from the volume on display, as 5.x did                                                                                                                                                                                                         | Nothing                                                                                                                                      | Nothing                                                                               | [Smaller changes](./2-rendering-changes.md#smaller-changes), [Events and image loading](./2-rendering-changes.md#events-and-image-loading-of-a-planar-viewport) |
| A video scroll lands on a frame, and with `loop` it wraps by frames                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Nothing                                                                                                                                      | Nothing                                                                               | [Scroll and its event](./2-rendering-changes.md#scroll-and-its-event)                                                                                           |
| A video that does not load rejects `setDisplaySets` with the display set, the URL and the media error, and fires nothing; the mount of the beta never settled                                                                                                                                                                                                                                                                                                                                                               | Catch the rejection where the mount is awaited                                                                                               | Nothing                                                                               | [Video viewports](./2-rendering-changes.md#video-viewports)                                                                                                     |
| The effective appearance has the `voiLUTFunction` of the image, and a scroll of a stack fires cause `'default'` for the invert and the VOI LUT function too                                                                                                                                                                                                                                                                                                                                                                 | Read the event, not `NEW_IMAGE`, for a readout of the invert                                                                                 | Nothing                                                                               | [The cause](./2-rendering-changes.md#the-cause)                                                                                                                 |
| `PlanarMountOptions` and `Volume3DMountOptions` are exported types; the appearance types (`PlanarDisplaySetAppearance` and its kin) and `Types.OpacityMapping` are exported                                                                                                                                                                                                                                                                                                                                                 | Type the options of a mount with them                                                                                                        | Nothing: the old names were not exported                                              | [Mount options](./3-api-map.md#mount-options)                                                                                                                   |
| `getDisplaySets()` of a 3D, a video, an ECG and a whole slide viewport gives the options of each mount, resolved (3D: the `volumeId` that it shows), as a planar viewport does; their mounts take `role`; `VideoMountOptions`, `ECGMountOptions` and `WSIMountOptions` are exported                                                                                                                                                                                                                                         | Copy a viewport with `other.setDisplaySets(...viewport.getDisplaySets())` and `getDisplaySetAppearance(id)`                                  | Nothing                                                                               | [Mount options](./1-next-viewports-only.md#what-one-viewport-wants-is-said-on-its-mount)                                                                        |
| The labelmap of a stack is one display set for each labelmap layer whose image follows the slice: a scroll fires no `DISPLAY_SETS_CHANGED`. `addImages` with the id of a mounted image replaces its image and fires nothing                                                                                                                                                                                                                                                                                                 | A listener that followed the labelmap image through the event listens to `NEW_IMAGE`                                                         | Nothing                                                                               | [Events and image loading](./2-rendering-changes.md#events-and-image-loading-of-a-planar-viewport)                                                              |
| A volume takes the array type that its series can hold (its metadata), not the array of the images that a stack loaded before; its voxel manager answers `getConstructor()` with that type                                                                                                                                                                                                                                                                                                                                  | Nothing; a 12 bit series is a `Uint16Array` volume where it could be a `Uint8Array` cut at 255                                               | Nothing                                                                               | [The array type of a volume](./2-rendering-changes.md#the-array-type-of-a-volume)                                                                               |
| When the source goes and other display sets remain, the first of them becomes the source on every viewport family, where a 3D, video, whole slide and ECG viewport kept them as overlays with no source. `addDisplaySet` without a `role` mounts the source on a viewport that shows nothing                                                                                                                                                                                                                                | Pass `role: 'overlay'` where a display set mounted alone is to stay an overlay                                                               | Nothing                                                                               | [What the codemod cannot do](#what-the-codemod-cannot-do), item 11                                                                                              |
| A resize keeps the camera of a planar view, as it kept that of a 3D view, and of a video and an ECG view, where they kept the zoom against the fit; so the zoom read against the fit changes where the fit changes; a framing keeps the zoom against the fit. An ECG viewport without a sensitivity keeps the layout of its traces through a resize                                                                                                                                                                         | Read `getViewFraming()` before `renderingEngine.resize()` and write it after it where the zoom against the fit is to stay                    | Nothing                                                                               | [What the codemod cannot do](#what-the-codemod-cannot-do), item 12                                                                                              |
| `addDisplaySet` mounts on a video, an ECG and a whole slide viewport as an entry of `setDisplaySets` does, where it threw; an ECG viewport rejects a second waveform; on a video and a whole slide viewport the calls without an id follow the source                                                                                                                                                                                                                                                                       | Mount a second waveform in another ECG viewport                                                                                              | Nothing                                                                               | [What the codemod cannot do](#what-the-codemod-cannot-do), item 13                                                                                              |
| A video `setDisplaySets` that a newer one supersedes resolves at once and fires nothing, as on a planar viewport; its video element goes with its listeners and its request, also when its server never answers. A removed video drops its request                                                                                                                                                                                                                                                                          | Do not wait for an error of the video of a superseded call                                                                                   | Nothing                                                                               | [What the codemod cannot do](#what-the-codemod-cannot-do), item 14                                                                                              |
| A planar viewport that draws on the CPU on a device with WebGL draws again in `renderingEngine.resize()` when its canvas changed size, where the canvas stayed blank until the next draw of the view                                                                                                                                                                                                                                                                                                                        | Nothing                                                                                                                                      | Nothing                                                                               | [Smaller changes](./2-rendering-changes.md#smaller-changes)                                                                                                     |
| `ANNOTATION_RENDERED` fires after a draw of freehand contours that are not being edited, as the contours of an RTSTRUCT, with `calculateStats` on or off                                                                                                                                                                                                                                                                                                                                                                    | Nothing; a listener of the event now hears panes that show only contours                                                                     | Nothing                                                                               | [Tools on the next viewports](./2-rendering-changes.md#tools-on-the-next-viewports)                                                                             |
| `utilities.segmentation.getStatistics` gives the statistics of a labelmap over a video, for the frame on display, red, green and blue apart, with `frameNumber`; it threw in its worker                                                                                                                                                                                                                                                                                                                                     | Show the frame to measure                                                                                                                    | Nothing                                                                               | [Video viewports](./2-rendering-changes.md#video-viewports)                                                                                                     |
| `registerWorker` of the web worker manager makes no instance; a task makes one when none is idle; `workerRegistry[name].instances` holds `null` for an instance not made                                                                                                                                                                                                                                                                                                                                                    | Nothing                                                                                                                                      | Nothing                                                                               | [Smaller changes](./2-rendering-changes.md#smaller-changes)                                                                                                     |
| A volume view opens on the middle slice in view order, `floor(N / 2)`: one slice further for an even count with the normal against the volume axis (a coronal view of an axial series, an axial or acquisition view of an even count)                                                                                                                                                                                                                                                                                       | Nothing; a test or a picture that pinned the old slice changes                                                                               | Nothing                                                                               | [What the codemod cannot do](#what-the-codemod-cannot-do), item 15                                                                                              |
| `rendering.sliceStepMeasure` is `'l1'` by default: an oblique view steps by one voxel thickness and has fewer slices, on a grid centred on the volume; `snapFocalPointToSlice`, `getSlicesClippingPlanes` and `getTargetVolumeAndSpacingInNormalDir` use that grid                                                                                                                                                                                                                                                          | Store a view reference with a point in place of an oblique slice index; `init({ rendering: { sliceStepMeasure: 'l2' } })` keeps the old step | Nothing                                                                               | [What the codemod cannot do](#what-the-codemod-cannot-do), item 15                                                                                              |
| A series tilted from a standard orientation by less than half a slice across the image shows its acquired images for that orientation                                                                                                                                                                                                                                                                                                                                                                                       | Ask for `OrientationAxis.ACQUISITION` to see the acquired images of a series tilted further                                                  | Nothing                                                                               | [A series tilted less than half a slice](./2-rendering-changes.md#a-series-tilted-less-than-half-a-slice)                                                       |
| In stack mode a reference that names only a frame of reference, a plane or points is viewable only with `asVolume` or `asNearbyProjection`, and `setViewReference` moves a stack for it nowhere; a slice index of another display set moves a stack nowhere                                                                                                                                                                                                                                                                 | Move a stack to a point by `{ sliceIndex: utilities.getClosestStackImageIndexForPoint(point, viewport) }`                                    | Nothing                                                                               | [What the codemod cannot do](#what-the-codemod-cannot-do), item 16                                                                                              |
| `getViewReference()` in volume mode names the image of the slice on display, also when the point of the view state lies between two slices                                                                                                                                                                                                                                                                                                                                                                                  | Nothing                                                                                                                                      | Nothing                                                                               | [Events and image loading of a planar viewport](./2-rendering-changes.md#events-and-image-loading-of-a-planar-viewport)                                         |
| On the tiled engine the first frame of a planar viewport is the frame that a resize keeps: the canvas takes one size rule and the tile its offset                                                                                                                                                                                                                                                                                                                                                                           | Nothing                                                                                                                                      | Nothing                                                                               |                                                                                                                                                                 |
| New: the planar mount option `initialViewReference` starts the source at a view reference in any orientation (a `referencedImageId`, a point with a plane, a slice index of the view), before its first draw and its first `NEW_IMAGE`; `initialImageIdIndex` still starts only a stack and a volume in its acquisition plane                                                                                                                                                                                               | `setDisplaySets({ displaySetId, options: { orientation, initialViewReference } })`                                                           | Nothing                                                                               | [Mount options](./3-api-map.md#mount-options)                                                                                                                   |
| An overlay of a streaming volume draws nothing where its plane reads a frame that holds a copy of another frame (the interleaved retrieve stages fill the frames that have not loaded with copies of loaded ones), until the frame of its own position arrives; the source keeps the copies as its coarse preview                                                                                                                                                                                                           | Nothing to change                                                                                                                            | Nothing                                                                               | [Rendering changes](./2-rendering-changes.md#an-overlay-of-a-streaming-volume-shows-no-copy-of-another-slice)                                                   |
| A `setDisplaySets` and a `destroy` (and `disableElement`) end a pending `addDisplaySet`: it resolves at once, binds nothing and fires nothing. `addDisplaySet` calls that race on one viewport mount in call order, so an ECG viewport refuses the second waveform. `destroy` ends a pending `setDisplaySets` too                                                                                                                                                                                                           | Nothing to change                                                                                                                            | Nothing                                                                               |                                                                                                                                                                 |
| An `addDisplaySet` made while a `setDisplaySets` of the same viewport loads waits for it and adds to its result, on every viewport family; a later `setDisplaySets` or a `destroy` ends both. The 3D and whole slide viewports queue their `addDisplaySet` calls too, and a 3D `setDisplaySets` ends a pending add                                                                                                                                                                                                          | Nothing to change; code that called `addDisplaySet` right after `setDisplaySets` gets both now                                               | Nothing                                                                               | [The order](./2-rendering-changes.md#setdisplaysets-and-adddisplayset-take-effect-in-call-order)                                                                |
| A streaming volume fires one `IMAGE_VOLUME_MODIFIED` for an image and the copies of it that the interleaved stages put into the frames near it (one for the deliveries of one task), in a microtask, the last before `IMAGE_VOLUME_LOADING_COMPLETED`                                                                                                                                                                                                                                                                       | A listener that counted the events reads `detail.framesProcessed`                                                                            | Nothing                                                                               | [One event](./2-rendering-changes.md#one-image_volume_modified-for-an-image-and-its-copies)                                                                     |
| The default window of a streaming volume without a window in its metadata reads the image that the volume loads, and the stages ask for that image first (a stage position is rounded to the nearest image: 0.5 is `floor(N / 2)`); the mount settles once it is there, where it waited for the whole load. `imageLoader.createAndCacheLocalImage` without `scalarData` makes an empty image of `dimensions` and `targetBuffer.type`. On the context pool engine the first frame of a pane is the frame that a resize keeps | Nothing to change                                                                                                                            | Nothing                                                                               | [The default window](./2-rendering-changes.md#the-default-window-of-a-streaming-volume)                                                                         |
| A video with the object fit `fill` maps each axis with its own ratio (`canvasToWorld`, `worldToCanvas`, the annotations, the place of its element); the ECG viewport sizes its canvas once on a screen with a device pixel ratio other than 1                                                                                                                                                                                                                                                                               | Nothing to change                                                                                                                            | Nothing                                                                               |                                                                                                                                                                 |
| `utilities.segmentation.getStatistics` of a stack labelmap whose images reference no image reads the image of the viewports that show it on the plane of each labelmap image, or says which labelmap image has none; it threw `getImage: imageId must not be undefined`. The perimeter of a closed freehand contour counts its closing segment                                                                                                                                                                              | Nothing to change                                                                                                                            | Nothing                                                                               |                                                                                                                                                                 |
| The camera position synchronizer gives every planar pane of a group the parallel scale and the centre of the source, whatever the extents of the volumes, as 5.x did; a pane takes a slice only when the source moved along its normal, so a zoom or a resize of a PET pane moves no CT pane; a mount takes the scale and the centre of the group                                                                                                                                                                           | Nothing to change                                                                                                                            | Nothing                                                                               | [Tools on the next viewports](./2-rendering-changes.md#tools-on-the-next-viewports)                                                                             |
| New: `utilities.getVolumeSliceGrid` gives the slice grid of a view of a volume before a mount (the number of slices, the step, the default slice and its point, the point of each slice, a view reference of a slice), from the volume in the cache or the `imagePlaneModule` metadata of its images, by the code of the viewport                                                                                                                                                                                           | `utilities.getVolumeSliceGrid({ imageIds, orientation }).getViewReference()` as `initialViewReference`                                       | Nothing                                                                               | [The slice grid of a volume view](./2-rendering-changes.md#the-slice-grid-of-a-volume-view)                                                                     |
| New: `Events.SEGMENTATION_CONTOUR_CUTS_COMPLETED` fires when the cuts of a contour segmentation on a viewport of another plane are all drawn (again after a change of the contours or of the plane), and `segmentation.getContourCutsState(viewportId, segmentationId)` gives `'pending'` or `'complete'`                                                                                                                                                                                                                   | Wait on the state and the event in place of fixed times                                                                                      | Nothing                                                                               | [Tools on the next viewports](./2-rendering-changes.md#tools-on-the-next-viewports)                                                                             |

## What the codemod cannot do

These changes keep the code as it is and change what it does. The codemod
lists some of their sites, but each needs a person who knows what the
application wants.

1. **A `volumeId` no longer makes a volume.** A planar mount without `mode`
   shows a stack in the acquisition plane. The codemod writes
   `mode: 'volume'` only on a mount that it sees in the file of the
   registration, and only where the registration is on the beta registry
   (`utilities.genericViewportDisplaySetMetadataProvider`): it reads a
   registration on `displaySetRegistry` as 6.0 code, so run it before
   renaming the registry by hand. Find the other mounts of each display set registered with a
   `volumeId`, and add the mode where the viewport shows a volume. Nothing
   fails: a screen shows a stack where it showed a volume. See
   [A volume id names a volume, the mount chooses the mode](./1-next-viewports-only.md#a-volume-id-names-a-volume-the-mount-chooses-the-mode).
2. **`getDisplaySetAppearance` gives overrides.** A key that no caller set is
   undefined, and the defaults that a mount stored (`visible: true` and the
   defaults of the 3D, video, ECG and whole slide families) are not in it. A
   readout, a toggle or a tool that starts from the value on display reads
   `getEffectiveDisplaySetAppearance`. See
   [Overrides and the values on display](./2-rendering-changes.md#overrides-and-the-values-on-display).
3. **The appearance event fires at the mount.** A listener of the renamed
   event also runs with cause `'mount'`, and with cause `'default'` when a
   scroll shows an image with another default window. A listener that copies
   the window to other viewports or stores it acts on `'edit'` and
   `'reset'` only, or it writes defaults as settings. See
   [The cause](./2-rendering-changes.md#the-cause).
4. **`initialImageIdIndex` in a descriptor fails the mount.** The codemod
   moves it from a literal to the planar mounts of the same file. A
   descriptor that the application builds elsewhere, such as a display set
   of a viewer, must lose the key, and each mount gets the index it wants.
   See [What one viewport wants is said on its mount](./1-next-viewports-only.md#what-one-viewport-wants-is-said-on-its-mount).
5. **One opacity rule and the threshold.** Every render path draws
   `opacity * ramp(value)`. A stack on the GPU now draws its
   `opacityMapping` and `threshold`, a volume slice no longer multiplies two
   opacities, and from a threshold on the alpha is the mapping, where
   6.0.0-beta.2 rose from 0 at the threshold to the next point. A fusion can
   look different: compare it. See [One opacity](./2-rendering-changes.md#one-opacity).
6. **A view reference never changes the source.** Code that showed an
   overlay as the source by a view reference, as a synchronizer of a fusion
   did, mounts it with `role: 'source'`. See
   [Events and image loading of a planar viewport](./2-rendering-changes.md#events-and-image-loading-of-a-planar-viewport).
7. **`NEW_IMAGE` is for the source only.** A listener that waited for the
   event of an overlay, such as the second volume of a fusion, gets none.
   See [Events and image loading of a planar viewport](./2-rendering-changes.md#events-and-image-loading-of-a-planar-viewport).
8. **The mount event fires for overlays too.** `DISPLAY_SETS_CHANGED` fires
   when a labelmap or another overlay is added or removed, with
   `detail.sourceChanged` false. A listener that restarts a cine, a prefetch
   or a synchronizer for a new series returns early then, as the sample of
   [Events and image loading of a planar viewport](./2-rendering-changes.md#events-and-image-loading-of-a-planar-viewport)
   shows.
9. **The display area shows as it is.** `setViewState({ displayArea })`
   without a scale shows the area at scale `[1, 1]`, where 6.0.0-beta.2
   merged it with the scale of the view state, and `defaultOptions.displayArea`
   now shows from the first draw. Code that called `setDisplayArea` after
   the mount to apply the option can drop the call. See
   [Display area and stretch](./2-rendering-changes.md#display-area-and-stretch).
10. **The scroll event fires at the end, after the move.**
    `SCROLL_OUT_OF_BOUNDS` fires when a scroll stops at an end, not with
    `loop`, and `sliceIndex` is where the scroll stopped, where the old
    events gave the index before the scroll. See
    [Scroll and its event](./2-rendering-changes.md#scroll-and-its-event).
11. **When the source goes, the first display set left is the source.**
    `removeDisplaySet` of the source makes the first display set that
    remains the source, on every viewport family: `getDisplaySets()`, the
    `DISPLAY_SETS_CHANGED` of the removal (`sourceChanged: true` and its
    `sourceDisplaySetId`) and the viewport name it. 6.0.0-beta.2 did so on a
    planar viewport only; a 3D, video, whole slide and ECG viewport kept the
    others as overlays and its event gave no source. In the same way
    `addDisplaySet` without a `role` mounts the source on a viewport that
    shows nothing, as the first entry of `setDisplaySets` does, and an
    overlay on any other; a display set mounted again keeps its role. A
    mount with an explicit `role: 'overlay'` on an empty viewport, as a
    segmentation shown without its background, stays a viewport of overlays
    only: no removal makes one of them the source, and `addDisplaySet`
    without a role adds an overlay to it.

    ```ts
    await viewport3D.setDisplaySets(
      { displaySetId: 'ct' },
      { displaySetId: 'lungSurface' }
    );
    viewport3D.removeDisplaySet('ct');
    viewport3D.getDisplaySets();
    // Before: [{ displaySetId: 'lungSurface', options: { role: 'overlay' } }]
    // After:  [{ displaySetId: 'lungSurface', options: { role: 'source' } }]
    ```

    The display set that becomes the source keeps its look: its appearance
    overrides and defaults (a 3D viewport keeps its transfer function and
    opacity, a planar viewport its window), and nothing fires
    `DISPLAY_SET_APPEARANCE_CHANGED` for the change; the events after it
    give `role: 'source'`, and `setDisplaySetAppearance(props)` without an
    id goes to it. A planar viewport keeps its view state and shows the
    images of the new source (`getCurrentImageId()`), `NEW_IMAGE` follows
    its slice, and
    `getRenderPlan()` gives it the role `source` at once, without a
    `RENDER_PLAN_CHANGED`; how it is drawn (its render backend) was decided
    at its mount and stays. Code that mounted one display set alone as an
    overlay with `addDisplaySet` says so:

    ```ts
    // Before: an overlay in 6.0.0-beta.2, the source in 6.0
    await viewport.addDisplaySet('seg');

    // After
    await viewport.addDisplaySet('seg', { role: 'overlay' });
    ```

12. **A resize keeps the camera.** `renderingEngine.resize()` keeps the
    parallel scale and the focal point of a planar view (in the scale mode
    `fit` without a display area) and the camera of a 3D view, as 5.x did:
    the picture keeps its scale, and the zoom read against the fit
    (`getViewFraming().zoom`, `getZoom()`) changes where the fit changes. A
    pane of 400 by 300 pixels at zoom 1.5 reads 1.8 after a resize to 250 by
    300, and 1.98 after a further resize to 250 by 330. A framing written to
    a pane of another size keeps the zoom against the fit and the world
    point at the centre instead. So an application that stores a framing at
    one size and restores it at another, or that wants the zoom against the
    fit kept through a change of the layout, reads `getViewFraming()` before
    the resize and writes it with `setViewFraming()` after it, as OHIF's
    `performResize` does:

    ```ts
    // Keeps the camera: the zoom read after it follows the new fit
    element.style.width = '250px';
    renderingEngine.resize(true);

    // Keeps the zoom against the fit and the world point at the centre
    const framing = viewport.getViewFraming();
    element.style.width = '250px';
    renderingEngine.resize(true);
    viewport.setViewFraming(framing);
    ```

    A video and an ECG viewport keep their camera too, where 6.0.0-beta.2
    kept their zoom against the fit. Their camera is as that of a planar
    view: the height of the canvas in units of the picture (pixels of the
    video; units of the trace layout of the ECG) and the point of the
    picture at the centre of the canvas. Across a change of the width the
    picture keeps its size in pixels and its distance from the centre;
    across a change of the height it scales with the canvas. A video with
    the object fit `fill` has no one scale and fills the new size. An ECG
    viewport without a sensitivity lays its traces out to fill the height
    of the canvas at the mount and at a reset of the pan and the zoom
    (`resetViewState()`, `keepCamera` false); a resize keeps that layout,
    so a pane of another shape shows the same traces, with room around
    them, and the time and the amplitude at the centre stay there:

    ```ts
    // A video of 4 by 3 on a pane of 400 by 300 pixels, resized to 250 by 300
    viewport.setViewFraming({ zoom: 1.5 });
    element.style.width = '250px';
    renderingEngine.resize(true);
    // 6.0.0-beta.2: getViewFraming().zoom is 1.5 and the video shrinks
    // 6.0: the video keeps its size in pixels; getViewFraming().zoom is 2.4

    // An ECG without a sensitivity on 400 by 300 pixels, resized to 600 by 300
    viewport.setViewFraming({ pan: [40, 20], zoom: 1.5 });
    element.style.width = '600px';
    renderingEngine.resize(true);
    // 6.0.0-beta.2: the traces move up; getViewFraming().pan is [60, -45]
    // 6.0: the traces stay; getViewFraming() is { zoom: 1.5, pan: [40, 20] }
    ```

    A planar view with a display area or a scale mode other than `fit`
    keeps the zoom against the fit through a resize, and `keepCamera` false
    fits the view to the new size on every family but the whole slide
    viewport, which keeps the resolution of its map in both cases. See
    [A framing carried to another size](./2-rendering-changes.md#display-area-and-stretch).

13. **`addDisplaySet` on a video, an ECG and a whole slide viewport.** It
    takes the mount options of the family (`VideoMountOptions`,
    `ECGMountOptions`, `WSIMountOptions`) and mounts what the same entry of
    `setDisplaySets` mounts, with the role rule of item 11, and leaves the
    display sets on display as they are. 6.0.0-beta.2 threw
    `No render path for video/video/undefined` (and the same for `ecg` and
    `wsi`) unless the call passed a private render mode. A second video or
    slide shows over the first, in the view of the source. An ECG viewport
    shows one waveform: `setDisplaySets` with two display sets and
    `addDisplaySet` of a second one reject and change nothing, where
    6.0.0-beta.2 mounted the second waveform and never drew it.

14. **A superseded video mount ends at once.** A `setDisplaySets` of a
    video viewport that a newer `setDisplaySets` supersedes resolves at once
    and fires nothing, as a superseded call of a planar viewport does. The
    video that it waits for, before or after its metadata, stops its load
    (its `src` is removed and `load()` drops the request) and goes with its
    listeners, also when its server never answers. 6.0.0-beta.2 left the
    empty `<video>` element and its request in the viewport until the
    browser ended the load, and the call settled then, or rejected when that
    video failed later. A video that `removeDisplaySet`, a new
    `setDisplaySets` or `destroy()` removes drops its request too.

    ```ts
    const older = viewport.setDisplaySets({ displaySetId: 'slowVideo' });
    await viewport.setDisplaySets({ displaySetId: 'otherVideo' });

    // 6.0.0-beta.2: `older` settles when the browser ends the load of
    // 'slowVideo', or never; its <video> stays in the viewport until then
    // 6.0: `older` has resolved; the <video> of 'slowVideo' and its request
    // are gone
    await older;
    ```

    ```ts
    // Before: threw, so an application mounted again with setDisplaySets
    await videoViewport.setDisplaySets(...videoViewport.getDisplaySets(), {
      displaySetId: 'secondVideo',
    });

    // After
    await videoViewport.addDisplaySet('secondVideo', {
      appearance: { opacity: 0.5 },
    });

    // An ECG viewport: one waveform, in place of the one on display
    await ecgViewport.setDisplaySets({ displaySetId: 'otherEcg' });
    ```

    The calls without a display set id (`setDisplaySetAppearance(props)`,
    `getDisplaySetAppearance()`, the image, the frame of reference, the view
    reference, playback and `NEW_IMAGE` of a video) follow the source of a
    video and of a whole slide viewport, also when the source is not the
    first display set. They followed the first video, and the last slide of
    `setDisplaySets` even when it was an overlay. The window of each slide is
    drawn on that slide, where only the window of the last slide was drawn.
    See [Video viewports](./2-rendering-changes.md#video-viewports),
    [ECG viewports](./2-rendering-changes.md#ecg-viewports) and
    [Whole slide viewports](./2-rendering-changes.md#whole-slide-viewports).

15. **The slices of a volume view.** A view opens on the middle slice counted
    along the view, `floor(N / 2)`: a view with an even number of slices whose
    normal points against the volume axis, such as a coronal view of an axial
    series, opens one slice further than in 6.0.0-beta.2. The step of every
    view is the thickness of one voxel along the normal
    (`rendering.sliceStepMeasure: 'l1'`, the new default), so an oblique view
    has fewer slices, on a grid centred on the volume, and a slice index of an
    oblique view that the application stored names another position. A view
    along a volume axis keeps its slices. Store a view reference with its
    point (`getViewReference()`) to come back to a plane, and set
    `sliceStepMeasure: 'l2'` to keep the step of the betas. See
    [The slice grid of a volume view](./2-rendering-changes.md#the-slice-grid-of-a-volume-view).

    ```ts
    // Before: an index of an oblique view, stored with 6.0.0-beta.2
    viewport.setImageIdIndex(stored.sliceIndex);

    // After: the point and the orientation of the view
    viewport.setViewReference({
      FrameOfReferenceUID: viewport.getFrameOfReferenceUID(),
      viewPlaneNormal: stored.viewPlaneNormal,
      cameraFocalPoint: stored.cameraFocalPoint,
    });
    ```

16. **A stack and a reference of a point.** A reference that names only a
    frame of reference, a plane or points, as a 3D point annotation, shows on
    no image of a stack without `asVolume` or `asNearbyProjection`, where
    6.0.0-beta.2 showed it on every image, and `setViewReference` moves a
    stack for it nowhere, where 6.0.0-beta.2 went to the image nearest to its
    point. A slice index of another display set moves a stack nowhere either.
    Code that moves a stack to a point gives it the index of the nearest
    image:

    ```ts
    // Before
    stackViewport.setViewReference({ cameraFocalPoint: point });

    // After
    stackViewport.setViewReference({
      sliceIndex: utilities.getClosestStackImageIndexForPoint(
        point,
        stackViewport
      ),
    });
    ```

    See [Events and image loading of a planar viewport](./2-rendering-changes.md#events-and-image-loading-of-a-planar-viewport).

17. **One scale and one centre in a camera position group.** Between two
    planar viewports the camera position synchronizer gives the target the
    parallel scale of the source and the world point at the centre of its
    canvas, where 6.0.0-beta.2 gave it the zoom and the pan against its own
    fit and the view reference of the source. A PET pane next to a CT pane
    of the same group now draws the body at the size of the CT pane, and the
    zoom that each pane reports differs between them. A target takes a slice
    only when the source moved along its normal, the slice of its own grid
    nearest to the position of the source; 6.0.0-beta.2 gave it the centre
    of the slice of the source at every camera event, so a zoom, a pan or a
    resize of a PET pane moved the CT panes of its group by up to half a PET
    slice. A pane whose camera event changes no camera, its mount or a
    resize, takes the scale, the centre and the view up of the group and
    keeps its slice, where it gave the group its own view. Code that gave a
    joining pane the scale of its group after its mount, or that wrote the
    zoom and the pan of each pane back after a resize, can go; code that
    puts a joining pane on the slice of its group stays, and needs no hold
    of the synchronizer, since a mount no longer moves the group:

    ```ts
    // Before: after the mount of a pane of a group, with the pane taken
    // out of the sources of the synchronizer during the mount
    viewport.setViewReference(groupViewport.getViewReference());
    viewport.setViewFraming(scaledFramingOf(groupViewport));

    // After: the mount fires CAMERA_MODIFIED and the pane takes the scale and
    // the centre of the group; a point and a plane put it on the slice
    const { focalPoint, viewPlaneNormal } = groupViewport
      .getResolvedView()
      .toICamera();
    viewport.setViewReference({
      FrameOfReferenceUID: groupViewport.getFrameOfReferenceUID(),
      viewPlaneNormal,
      cameraFocalPoint: focalPoint,
    });
    ```

    See [Tools on the next viewports](./2-rendering-changes.md#tools-on-the-next-viewports).
