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

| Change                                                                                                                                                                                                                                                                                                              | What the application does                                                                                                         | Codemod                                                                               | Details                                                                                                                                                         |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The registry is `displaySetRegistry`, a top-level export of `@cornerstonejs/core` (and of `@cornerstonejs/metadata`), in place of `utilities.genericViewportDisplaySetMetadataProvider`. `get` takes the id only, a descriptor has no `kind` and is an object                                                       | `displaySetRegistry.add(displaySetId, { imageIds })`, `displaySetRegistry.get(displaySetId)`                                      | Rewrites; reports a descriptor that is not a literal                                  | [Display set names](./3-api-map.md#display-set-names)                                                                                                           |
| `dataId` is `displaySetId` in a view reference, a render plan layer, an event detail, a stack input and a projection; `removeData` is `removeDisplaySet`; `getSourceDataId` is `getSourceDisplaySetId`; the video and ECG key `sourceDataId` is `imageId`                                                           | Rename; a view reference stored by a beta carries `dataId`, which 6.0 does not read: rename the key when the application loads it | Rewrites where the file shows the object; reports the others                          | [The names of 6.0.0-beta.2](./1-next-viewports-only.md#the-names-of-600-beta2)                                                                                  |
| A `volumeId` names a volume and no longer makes a planar viewport show one. A mount without `mode` shows a stack in the acquisition plane                                                                                                                                                                           | Mount with `options: { mode: 'volume' }` where the viewport shows a volume                                                        | Rewrites a mount of the same file; reports a registration whose mount it does not see | [A volume id names a volume](./1-next-viewports-only.md#a-volume-id-names-a-volume-the-mount-chooses-the-mode)                                                  |
| `setDisplaySetPresentation`, `getDisplaySetPresentation`, `resetDisplaySetPresentation` and the `*DataPresentation` types are `setDisplaySetAppearance`, `getDisplaySetAppearance`, `resetDisplaySetAppearance` and `*DisplaySetAppearance`                                                                         | Rename                                                                                                                            | Rewrites; reports a viewport known by its name only                                   | [Appearance names](./3-api-map.md#appearance-names)                                                                                                             |
| `VOI_MODIFIED` and `COLORMAP_MODIFIED` are one event, `DISPLAY_SET_APPEARANCE_CHANGED`, with `cause`, `changedKeys`, `overrides` and `effective`. It also fires at the mount and when a scroll shows an image with another default window                                                                           | Test `detail.cause` and `detail.changedKeys` in each listener                                                                     | Rewrites the name and the reads of the detail; reports each listener for review       | [The appearance event](./2-rendering-changes.md#the-appearance-event-and-the-two-getters)                                                                       |
| `getDisplaySetAppearance` gives the overrides only, what a caller set; `getEffectiveDisplaySetAppearance` gives what is drawn                                                                                                                                                                                       | Read the effective appearance to show or compare a value, the overrides to copy or store                                          | Reports a read whose value is shown or compared                                       | [Overrides and the values on display](./2-rendering-changes.md#overrides-and-the-values-on-display)                                                             |
| `VIEWPORT_NEW_IMAGE_SET` and `VOLUME_VIEWPORT_NEW_VOLUME` are one event, `DISPLAY_SETS_CHANGED`, of every viewport family. It also fires when an overlay such as a labelmap comes or goes                                                                                                                           | Return early when `!evt.detail.sourceChanged` in a listener that cares for the source                                             | Rewrites the name; reports each listener for review                                   | [Events and image loading](./2-rendering-changes.md#events-and-image-loading-of-a-planar-viewport)                                                              |
| `detail.imageIdIndex` of `NEW_IMAGE` is `detail.sliceIndex`, and the detail has `displaySetId`. `NEW_IMAGE` fires for the source only                                                                                                                                                                               | Rename the key                                                                                                                    | Rewrites in a listener of the file; reports the others                                | [Display set and image events](./3-api-map.md#display-set-and-image-events)                                                                                     |
| `initialImageIdIndex` is a mount option. A planar mount of a descriptor that has it fails                                                                                                                                                                                                                           | `setDisplaySets({ displaySetId, options: { initialImageIdIndex } })`                                                              | Moves it to the planar mounts of the same file; reports the others                    | [Mount options](./3-api-map.md#mount-options)                                                                                                                   |
| `ViewPresentation` is `ViewFraming`: `viewportProjection.getFraming` and `withFraming`, and the new `viewport.getViewFraming()` and `setViewFraming()`                                                                                                                                                              | Rename                                                                                                                            | Rewrites                                                                              | [Framing names](./3-api-map.md#framing-names)                                                                                                                   |
| `colormap.opacity` is gone: a number is the `opacity` of the appearance, a list of points is `colormap.opacityMapping`. `Types.ColormapPublic` is `Types.AppearanceColormap`. Every render path draws `opacity * ramp(value)`, and 0 below `threshold`                                                              | Move the key; check a fusion with a threshold                                                                                     | Rewrites a literal; reports the others                                                | [One opacity](./2-rendering-changes.md#one-opacity)                                                                                                             |
| `setDisplayArea`, `getDisplayArea`, `options`, `setOptions`, `reset` and `DISPLAY_AREA_MODIFIED` of a planar viewport are gone. `setViewState({ displayArea })` shows the area at scale `[1, 1]`, and `defaultOptions.displayArea` is applied                                                                       | `setViewState({ displayArea })`, `getViewState().displayArea`, `CAMERA_MODIFIED`                                                  | Rewrites the two calls; reports the others                                            | [The display area and the framing](./3-api-map.md#the-display-area-and-the-framing)                                                                             |
| `STACK_SCROLL_OUT_OF_BOUNDS` and `VOLUME_VIEWPORT_SCROLL_OUT_OF_BOUNDS` are `SCROLL_OUT_OF_BOUNDS`, which fires only when a scroll stops at an end, also from `viewport.scroll`. `VOLUME_VIEWPORT_SCROLL` is gone                                                                                                   | Read `delta`, `sliceIndex` and `numberOfSlices` of the new detail                                                                 | Rewrites the name and the keys with one new key; reports the others                   | [Scroll](./3-api-map.md#scroll)                                                                                                                                 |
| The render modes are private: `ActorRenderMode`, `ActorEntry.actorMapper`, the `renderMode` of a render plan layer and of a 3D mount. The slots of `registerRenderBackend` are `frame`, `cpu` and `gpuVolume`                                                                                                       | Read `slice`, `draw` and `backend` of `viewport.getRenderPlan()`; `entry.actor.getMapper()`                                       | Rewrites the mapper, the slots and the 3D option; reports each test of a mode         | [The render plan](./3-api-map.md#the-render-plan)                                                                                                               |
| `GenericViewport` is `BaseViewport`; the deprecated aliases (`*_NEXT`, `GenericVolumeViewport3D` and its kin, `Types.IGenericViewport`) are gone; the strings `'planarNext'` and their kin throw                                                                                                                    | Rename                                                                                                                            | `api-names` rewrites the names; `viewport-types` the strings                          | [Viewport types](./3-api-map.md#viewport-types)                                                                                                                 |
| `findDataIdByVolumeId` is `getDisplaySetIdForVolumeId`. New: `getVolumeIds()`, `getScalarRange()`, `isInAcquisitionPlane()`, and `'geometry3d'` for a 3D viewport that shows a surface, where it said `'unknown'`                                                                                                   | Rename; use the new members in place of reads of the cache and the mapper                                                         | Rewrites the rename                                                                   | [Viewport queries](./2-rendering-changes.md#viewport-queries)                                                                                                   |
| One store: `displaySetRegistry` is the `DISPLAY_SET` module of `@cornerstonejs/metadata`. A value written into the module with `setCacheData` is not a registration; `utilities.clearCacheData()` removes every registration                                                                                        | Register each display set once with `displaySetRegistry.add`                                                                      | Nothing                                                                               | [One store for display sets](./1-next-viewports-only.md#one-store-for-display-sets)                                                                             |
| A mount reads the registration once; `getDisplaySets()` gives the options of each mount; the mount option `appearance` draws the first picture with its appearance and fires one event                                                                                                                              | Pass the look on the mount where it was set right after it                                                                        | Nothing                                                                               | [What one viewport wants is said on its mount](./1-next-viewports-only.md#what-one-viewport-wants-is-said-on-its-mount)                                         |
| No view reference changes the source; a reference is judged by its image or its plane, also when its display set is no longer registered; a stack moves nothing for a reference of a volume that names no image                                                                                                     | Mount with `role: 'source'` to change the source                                                                                  | Nothing                                                                               | [View references](./3-api-map.md#view-references)                                                                                                               |
| A 3D viewport without a `volumeId` loads `utilities.getDefaultVolumeId(imageIds)`, where it loaded `cornerstoneStreamingImageVolume:<displaySetId>`                                                                                                                                                                 | Give the old id as `volumeId` where the application reads the volume by it                                                        | Nothing                                                                               | [A volume id names a volume](./1-next-viewports-only.md#a-volume-id-names-a-volume-the-mount-chooses-the-mode)                                                  |
| A reset of the appearance of a 3D viewport goes back to the defaults; `{ key: undefined }` removes an override; a removed opacity draws 1 again                                                                                                                                                                     | Nothing, unless the application relied on the old reset                                                                           | Nothing                                                                               | [The appearance event and the getters](./3-api-map.md#the-appearance-event-and-the-two-getters)                                                                 |
| A resize of a planar viewport keeps its parallel scale and its focal point, as the legacy viewports did; a view reference of an overlay keeps the source; a reference with a value that is not finite moves nothing; a window level drag in volume mode takes its multiplier from the volume on display, as 5.x did | Nothing                                                                                                                           | Nothing                                                                               | [Smaller changes](./2-rendering-changes.md#smaller-changes), [Events and image loading](./2-rendering-changes.md#events-and-image-loading-of-a-planar-viewport) |
| A video scroll lands on a frame, and with `loop` it wraps by frames                                                                                                                                                                                                                                                 | Nothing                                                                                                                           | Nothing                                                                               | [Scroll and its event](./2-rendering-changes.md#scroll-and-its-event)                                                                                           |
| A video that does not load rejects `setDisplaySets` with the display set, the URL and the media error, and fires nothing; the mount of the beta never settled                                                                                                                                                       | Catch the rejection where the mount is awaited                                                                                    | Nothing                                                                               | [Video viewports](./2-rendering-changes.md#video-viewports)                                                                                                     |
| The effective appearance has the `voiLUTFunction` of the image, and a scroll of a stack fires cause `'default'` for the invert and the VOI LUT function too                                                                                                                                                         | Read the event, not `NEW_IMAGE`, for a readout of the invert                                                                      | Nothing                                                                               | [The cause](./2-rendering-changes.md#the-cause)                                                                                                                 |
| `PlanarMountOptions` and `Volume3DMountOptions` are exported types; the appearance types (`PlanarDisplaySetAppearance` and its kin) and `Types.OpacityMapping` are exported                                                                                                                                         | Type the options of a mount with them                                                                                             | Nothing: the old names were not exported                                              | [Mount options](./3-api-map.md#mount-options)                                                                                                                   |

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
