# Cornerstone3D 6.0 Names after 6.0.0-beta.2

Rewrites the names of Cornerstone3D that changed after 6.0.0-beta.2. It is
the last step of `@cornerstonejs/cornerstone3d-6`. It needs no step before
it: it reads the names of a 6.0 beta as they stand, also where code of the
opt-in next viewports of 5.x uses them.

## Usage

On code that is on a 6.0 beta already:

```sh
npx codemod @cornerstonejs/cornerstone3d-6-api-names
```

From 5.x, with or without the opt-in next viewports, run the whole
migration, which ends with this step:

```sh
npx codemod @cornerstonejs/cornerstone3d-6
```

## Changes

The step has one file of rules per family, in `scripts/families`. A family
that has no entry yet changes nothing.

### Generic names

- `GenericViewport` becomes `BaseViewport`; `GenericVolumeViewport3D`,
  `VideoGenericViewport`, `WSIGenericViewport` and `ECGGenericViewport`
  become `VolumeViewport3D`, `VideoViewport`, `WSIViewport` and
  `ECGViewport`, in the import and in every use. A re-export keeps its
  public name (`export { BaseViewport as GenericViewport }`).
- `Types.IGenericViewport` becomes `Types.IViewport`.
- `utilities.resolveGenericViewportVolumeId` becomes
  `utilities.resolveViewportVolumeId`.
- `ViewportType.PLANAR_NEXT`, `VOLUME_3D_NEXT`, `VIDEO_NEXT`,
  `WHOLE_SLIDE_NEXT` and `ECG_NEXT`, of `Enums.ViewportType` and of
  `Enums.ViewportTypes`, become `PLANAR`, `VOLUME_3D`, `VIDEO`,
  `WHOLE_SLIDE` and `ECG`. The 5.x strings `'planarNext'` and its kin are
  the work of the `viewport-types` step, which rewrites them on code of a
  6.0 beta too.
- The modules of the entry points `@cornerstonejs/core/utilities/*`,
  `@cornerstonejs/tools/utilities/*` and `@cornerstonejs/tools/tools/*` that
  6.0 renamed: `resolveGenericViewportVolumeId` becomes
  `resolveViewportVolumeId`, `genericViewportToolHelpers` becomes
  `viewportToolHelpers`, and
  `displayTools/Labelmap/labelmapRenderPlan/planarGenericVolumeLabelmap`
  becomes `planarVolumeLabelmap`. A renamed name in such an import keeps its
  local name (`import { resolveViewportVolumeId as resolveGenericViewportVolumeId }`).
  The module `displayTools/Labelmap/labelmapRenderPlan/volume3DNextLabelmap`
  becomes `volume3DLabelmap` (`addLabelmapToVolume3DNextViewport` and
  `isVolume3DNextViewport` become `addLabelmapToVolume3DViewport` and
  `isVolume3DViewport`), and `isPlanarNextVolumeViewport` and
  `PlanarNextVolumeViewport` of `planarGenericVolumeLabelmap` become
  `isPlanarVolumeViewport` and `PlanarVolumeViewport`.
- Reported, manual: `utilities.isGenericViewport(...)` (true for every
  viewport in 6.0: delete the test and the branch for the other case),
  `renderingEngineExportsV2` (import each class and function by its own
  name), and `IGenericViewport`, `isGenericViewport` and
  `resolveGenericViewportVolumeId` imported from the subpaths
  `@cornerstonejs/core/types` and `@cornerstonejs/core/utilities`, an import
  of the deleted module `@cornerstonejs/core/types/IGenericViewport`, and a
  namespace import of a renamed module whose names changed.

### Display sets

- `utilities.genericViewportDisplaySetMetadataProvider` becomes
  `displaySetRegistry`, a top-level export of the core: each access, also
  through an alias, a namespace or `const { genericViewportDisplaySetMetadataProvider } = utilities`,
  and its import, which the step drops from `utilities` when nothing else
  uses it.
- `get(type, displaySetId)` of the registry becomes `get(displaySetId)`
  where the type is `VIEWPORT_V2_DISPLAY_SET` or `'genericViewportDisplaySet'`.
- In a literal that reaches `add` (also through a `const` that holds it):
  `kind` is deleted and `sourceDataId` becomes `imageId`. A string or an
  array of image ids as the descriptor becomes `{ imageId }` or
  `{ imageIds }`.
- `viewport.removeData(displaySetId)` becomes `removeDisplaySet`, and
  `viewport.getSourceDataId()` becomes `getSourceDisplaySetId()`, on a
  viewport that the file shows.
- `dataId` becomes `displaySetId` where the file shows the object: the
  value of `viewport.getViewReference()`, a value typed `ViewReference`,
  `RenderPlanLayer`, `ActorEntry`, `IStackInput`,
  `RenderPlanChangedEventDetail`, `ProjectionRequest` or
  `ProjectionSnapshot`, an entry of `viewport.getRenderPlan()` (an index, a
  `find`, a `for...of`, the first parameter of a callback), the detail of a
  listener of `RENDER_PLAN_CHANGED` or `RENDER_PATH_ERROR` (and the
  `rendering` of `IMAGE_RENDERED`), the argument of `addImages`,
  `isReferenceViewable` and `setViewReference`, and the request and the
  result of `viewportProjection.get`. A shorthand keeps its value:
  `{ dataId }` becomes `{ displaySetId: dataId }`. Local names stay.
- `mode: 'volume'` is written in the options of a planar mount of a display
  set that a literal (or a `const` that holds one) registers on the beta
  registry (`utilities.genericViewportDisplaySetMetadataProvider`, by any
  path) with a `volumeId` and image ids: an entry of `setDisplaySets` (also of an array
  that the call spreads, built of literals and `push`) or an `addDisplaySet`,
  in the same file, with the same id (a string, the same binding, or the same
  chain of property reads). A `volumeId` made a planar viewport show a volume;
  in 6.0 only the mount does. The mount is on a viewport that the file shows
  to be Cornerstone's and not of another family than planar: a
  `getViewport<PlanarViewport>` (also on an engine that the file does not
  show), a cast or an annotation, a `let` whose every value is one of these,
  a function of the file declared to give a planar viewport, or, with no
  type, a viewport of the core of any family (a 3D viewport ignores the
  option at run time and `IViewport.setDisplaySets` takes options of any
  type), a name in a JavaScript file, or a parameter without a type. Options
  that are an object literal get the key at the end, or first when they
  spread another object, so a `mode` of that object still wins. A mount that
  says `mode` already, a mount with `renderMode` (a 3D viewport) and a
  viewport of another family (by its type, or by the input that creates it
  in the same function) are left. A registration with a `volumeId` and no
  image ids is left: it shows a volume without a mode.
- A registration on `displaySetRegistry` is 6.0 code: no released
  Cornerstone had the name (5.19.4 and 6.0.0-beta.2 have the beta registry),
  and the 5.x steps write it with `mode: 'volume'` on every mount that the
  file does not show to be 3D. Its mounts mean what they say, a stack where
  they ask for nothing, so the step writes and reports nothing about their
  mode, and a second run of the workflow changes nothing (the step renames
  the registry and writes the mode in one run). An application that renamed
  the registry by hand before the run adds the mode itself.
- `initialImageIdIndex` of a registration moves to the options of every
  planar mount of the display set in the file, found as for `mode: 'volume'`
  (both keys go into one edit of a mount): 6.0 reads it from the mount, and a
  planar viewport refuses a descriptor that has it. A shorthand stays a
  shorthand. It moves only when it can move to every planar mount, and when
  its value reads the same at each of them: literals, names, property reads,
  arithmetic and calls of `Math`, each name a global or a `const`, an import
  or an unwritten parameter whose scope holds the mount. A mount that names
  `initialImageIdIndex` keeps its own; the key still leaves the
  registration.
- Reported, manual: such a registration whose key cannot move: the file shows
  no planar mount of the display set, the descriptor is a `const` that the
  file reads elsewhere too, a mount cannot be written (its options are not a
  literal, its viewport is known by its name only, of a type of the
  application or of several families), or the value cannot be read at every
  mount. The text is that of the guide row: `initialImageIdIndex is a mount
option in 6.0, and a planar viewport refuses a descriptor that has it: ...`.
- Reported, review: such a registration whose planar mount the file does not
  show (the text of the guide row: `a volumeId no longer makes a planar
viewport show a volume: ...`), and such a mount whose options are not a
  literal (a name, also as `{ displaySetId, options }`), on a viewport known
  by its name only, of a type of the application, or of several families
  (`PlanarViewport | VolumeViewport3D`).
- Reported, review: such a registration on the beta registry by a name that
  the file binds nowhere, as in a code block of a page whose import is in
  another block (`utilities.genericViewportDisplaySetMetadataProvider.add(displaySetId, { imageIds, volumeId })`
  and its mount in one block, with no import): each mount of the display set
  in the file that does not say `mode`, has no literal 3D `renderMode` and is
  not shown to be of another family, with the text
  `setDisplaySets: the file does not bind utilities; if it is Cornerstone's and the viewport is planar, write mode: 'volume' in its options to show the volume, a volumeId no longer makes a planar viewport show one`,
  or the registration when the file shows no mount of it. The ids match as
  above, or as one name that the file declares nowhere. Nothing is written:
  the file does not show that the registry and the viewport are
  Cornerstone's. The docs author adds `mode: 'volume'` to the mount, or
  `mode: 'stack'` where the stack is meant. A block on `displaySetRegistry`
  is 6.0 code, as in a file.
- Reported, manual: a descriptor of `add` that is not a literal (`kind` and
  `sourceDataId` may be in it), a registry in a name that the file writes,
  a `get` with other arguments or handed on as a metadata provider,
  `VIEWPORT_V2_DISPLAY_SET` and the string `'genericViewportDisplaySet'`
  (as in `metaData.get('genericViewportDisplaySet', id)`), an import of
  the registry from `@cornerstonejs/core/utilities` or of its deleted
  module, `getActiveDataId()` (never public), `removeData` and
  `getSourceDataId` on a receiver known by its name only, each other
  `dataId` of an object in a file that imports Cornerstone, and a member
  `getSourceDataId`, `removeData`, `getActiveDataId` or `dataId` that a type
  of the application declares on top of a Cornerstone type (an object type
  in an intersection with `Types.IViewport`, an interface that extends
  `Types.ViewReference`): the step renames the uses, the declaration is the
  application's.

### Appearance and framing

The look of one display set in one viewport is its appearance; the camera
part of a view that another viewport can take is its framing.

- `setDisplaySetPresentation`, `getDisplaySetPresentation` and
  `resetDisplaySetPresentation` become `setDisplaySetAppearance`,
  `getDisplaySetAppearance` and `resetDisplaySetAppearance` on a viewport
  that the file shows, also in brackets, in an `in` test, in a destructuring
  pattern (which keeps the local name) and as the key of an indexed type of
  a viewport type (`PlanarViewport['getDisplaySetPresentation']`). For these
  three methods the step also takes the types of the file as evidence: a
  name declared with a viewport type (also a `let` or a parameter that the
  file writes), `getViewport<PlanarViewport>(...)`, a `getViewport` of a name
  declared `RenderingEngine`, and a function of the file declared to give a
  viewport type.
- `utilities.viewportSupportsDisplaySetPresentation` becomes
  `utilities.viewportSupportsDisplaySetAppearance`.
- The types `ProjectionPresentation`, `ProjectionPresentationForKind`,
  `ProjectionPresentationForViewport`, `ProjectionPresentationForViewportType`,
  `PlanarProjectionPresentation`, `Volume3DProjectionPresentation`,
  `VideoProjectionPresentation`, `ECGProjectionPresentation`,
  `WSIProjectionPresentation`, `PlanarViewPresentation` and
  `PlanarViewPresentationSelector` become `ProjectionFraming`,
  `ProjectionFramingForKind`, `ProjectionFramingForViewport`,
  `ProjectionFramingForViewportType`, `PlanarProjectionFraming`,
  `Volume3DProjectionFraming`, `VideoProjectionFraming`,
  `ECGProjectionFraming`, `WSIProjectionFraming`, `PlanarViewFraming` and
  `PlanarViewFramingSelector`; `Types.ViewPresentation` and
  `Types.ViewPresentationSelector` become `Types.ViewFraming` and
  `Types.ViewFramingSelector`.
- `viewportProjection.getPresentation` and `withPresentation` become
  `getFraming` and `withFraming`, also on the `adapter` of `planarProjection`,
  `volume3DProjection`, `videoProjection`, `ecgProjection` and
  `wsiProjection`, and as keys of an adapter given to
  `viewportProjection.register` or typed `ViewportProjectionAdapter`;
  `planarProjection.derivePresentation` becomes `deriveFraming`.
- `presentation` of a projection snapshot becomes `framing`: on a value
  typed with a snapshot type, and on the result of `viewportProjection.get`
  or of the `getSnapshot` of a projection namespace (the call, or a name
  whose every value is one). `{ presentation }` becomes
  `{ framing: presentation }`. `presentationScale` of a value typed
  `PlanarResolvedICamera` becomes `framingScale`.
- The option `viewPresentation` of `utilities.loadImageToCanvas` becomes
  `viewFraming`.
- `synchronizers.createPresentationViewSynchronizer` of the tools becomes
  `createViewFramingSynchronizer`; the module
  `@cornerstonejs/tools/utilities/viewportPresentation` becomes
  `@cornerstonejs/tools/utilities/viewportFraming`, where
  `getViewportPresentation` and `applyViewportPresentation` become
  `getViewportFraming` and `applyViewportFraming` (an import keeps its local
  name through `as`).
- The `viewport-members` step rewrites the 5.x `getViewPresentation` and
  `setViewPresentation` to `getViewFraming` and `setViewFraming`, and
  `setProperties` to `setDisplaySetAppearance`.
- The display area lives only in the view state (lane VS1).
  `viewport.setDisplayArea(area)` becomes
  `viewport.setViewState({ displayArea: area })` (`{ displayArea }` when the
  argument is a name `displayArea`), and `viewport.getDisplayArea()` becomes
  `viewport.getViewState().displayArea`, on a viewport that the file shows,
  also by its type. A `setDisplayArea` whose area is not an object literal
  is listed for review: the setter did nothing with an undefined area, and
  `setViewState({ displayArea: undefined })` clears the area. The keys
  `slabThickness`, `windowLevel`, `paletteLut` and `aspectRatio`, which
  nothing read, are deleted from a selector given to
  `viewport.getViewFraming`, to `viewportProjection.getFraming` (its
  `selector`) or typed `ViewFramingSelector`, and `slabThickness` and
  `aspectRatio` from a framing given to `viewport.setViewFraming` or typed
  `ViewFraming`, also under their names of 6.0.0-beta.2, which the same run
  renames (`viewportProjection.getPresentation`, `ViewPresentationSelector`,
  `ViewPresentation`); a deleted `aspectRatio` of a framing is listed for review,
  because the 5.x `setViewPresentation` stretched the view by it (the
  stretch is `scale` of a planar framing). The 5.x steps leave
  `setDisplayArea` and `getDisplayArea` to this step, and since this step
  reports `options`, `setOptions` and `reset`, the `viewport-members` step
  no longer does.
- Reported, manual, with the text of the guide: `setDisplayArea` with a
  second argument (`suppressEvents`) or a spread, and on a receiver known by
  its name only; `getDisplayArea` with an argument or on such a receiver;
  either in brackets or in a destructuring pattern; `setOptions`, `reset`
  and `options` of a viewport; `Enums.Events.DISPLAY_AREA_MODIFIED` (also
  through `EVENTS` and as the string `'CORNERSTONE_DISPLAY_AREA_MODIFIED'`),
  `Types.EventTypes.DisplayAreaModifiedEvent` and
  `DisplayAreaModifiedEventDetail`. Review: each `setViewState` whose literal
  patch has `displayArea`, which shows the area at scale `[1, 1]` now when
  the patch has no `scale`, `scaleMode`, `anchorWorld` or `anchorCanvas`.
- The pan of a framing patch that spreads another framing: a framing that
  `getViewFraming` gives has `worldPan`, which a patch takes in place of
  `pan`, so `viewport.setViewFraming({ ...framing, pan })` and
  `viewportProjection.withFraming(viewport, { ...framing, pan })` get
  `worldPan: undefined` before the `pan` and keep the pan that they set. A
  patch with `worldPan`, or whose `pan` comes before its last spread, is
  left. Review: the same patch on a viewport known by its name only.
- One opacity: in an appearance literal that reaches
  `setDisplaySetAppearance` (or `setDisplaySetPresentation`), the
  `appearance` of a mount entry, or a value typed
  `PlanarDisplaySetAppearance` or `Volume3DDisplaySetAppearance`,
  `colormap: { opacity: <number> }` becomes `opacity: <number>` beside the
  colormap, and `colormap: { opacity: [...] }` becomes
  `colormap: { opacityMapping: [...] }` (also in a `const` that the
  appearance names, and in a value typed `Types.AppearanceColormap`).
  `Types.ColormapPublic` becomes `Types.AppearanceColormap`. Reported,
  manual: a number when the appearance has an `opacity` too, a value that is
  not a number or a list that the file shows, a number in a colormap that a
  `const` holds, a colormap with both `opacity` and `opacityMapping`, a
  receiver known by its name only, and, in a file that imports Cornerstone,
  a colormap with `opacity` that the file does not show to reach Cornerstone
  (a key `colormap`, a `const` whose name ends in `colormap`), a spread into a
  colormap whose type has `opacity`, each read of `colormap.opacity`, and
  `ColormapPublic` imported from `@cornerstonejs/core/types`.
- Reported, manual: a method of the look on a receiver known by its name
  only, on a receiver that the file gives a type of the application (a cast
  such as `viewport as unknown as { setDisplaySetPresentation(): void }`, or
  a name declared with such a type: that type declares the method), or on an
  object that the file does not show to be a viewport in a file that imports
  Cornerstone; another string that names one of the three
  methods (`jest.spyOn(viewport, 'setDisplaySetPresentation')`); a key of an
  object literal that names one of them, or
  `viewportSupportsDisplaySetPresentation`, in a file that imports
  Cornerstone (a mock of a viewport, or of `utilities` outside a module mock
  of the package, whose keys are renamed); a member `setDisplaySetPresentation`,
  `getDisplaySetPresentation` or `resetDisplaySetPresentation` that a type of
  the application declares on top of a viewport type; the key `presentation`
  in the options of a `setDisplaySets` entry or of `addDisplaySet`
  (Cornerstone never had such a mount option, so the key did nothing; the
  report names the mount option `appearance` and the step does not move the
  value there, which would draw a look the application never had); a
  projection adapter of the
  application (its snapshots carry `framing`); `ViewPresentation`,
  `ViewPresentationSelector` and `viewportSupportsDisplaySetPresentation`
  imported from `@cornerstonejs/core/types` or `@cornerstonejs/core/utilities`,
  and a namespace import of the renamed tools module.
- Left: names of the application, such as OHIF's `PositionPresentation`,
  `LutPresentation`, `SegmentationPresentation`, `presentationIds`,
  `usePositionPresentationStore`, `getPresentations` and `setPresentations`,
  a `getPresentation` of its own services, a type named `ViewPresentation`
  that it declares, and an object with a `presentation` key that is not a
  mount entry.

### Events

- `VIEWPORT_NEW_IMAGE_SET` and `VOLUME_VIEWPORT_NEW_VOLUME` of
  `Enums.Events` (also `EVENTS`, destructured, quoted or in brackets)
  become `DISPLAY_SETS_CHANGED`, and each site is reported for review: the
  new event also fires when an overlay such as a labelmap is added or
  removed, so a listener that cares only for the source adds
  `if (!evt.detail.sourceChanged) return`; its detail has no `imageIds`,
  `currentImageIdIndex` or `volumeActors`. A string
  `'CORNERSTONE_VIEWPORT_NEW_IMAGE_SET'` or
  `'CORNERSTONE_VOLUME_VIEWPORT_NEW_VOLUME'` is reported.
- `Types.EventTypes.StackViewportNewStackEvent` and its `Detail` become
  `DisplaySetsChangedEvent` and `DisplaySetsChangedEventDetail`, for review.
- `imageIdIndex` of the detail of `NEW_IMAGE` becomes `sliceIndex`: in
  `evt.detail.imageIdIndex`, `evt.detail?.imageIdIndex`,
  `evt.detail['imageIdIndex']`, `detail.imageIdIndex` of
  `const { detail } = evt` or of a `({ detail })` parameter, and in a
  pattern of the detail (`const { imageIdIndex } = evt.detail`,
  `{ imageIdIndex = 0 }`, `{ imageIdIndex: index }`, `{ 'imageIdIndex': i }`,
  `({ detail: { imageIdIndex } }) => ...`). A shorthand takes the new name
  with its uses when the name is free and each use is a plain name, and
  becomes `sliceIndex: imageIdIndex` otherwise. It does so where the file
  shows the event: the listener is given to `addEventListener` of
  `Enums.Events.NEW_IMAGE` or of `'CORNERSTONE_NEW_IMAGE'` (inline, by its
  name, or as `this.listener` of its class), or its event is typed
  `Types.EventTypes.NewImageEvent` (its detail `NewImageEventDetail`). A
  listener of another core event, such as `IMAGE_RENDERED`,
  stays. A `detail.imageIdIndex` whose event the file does not show, or of
  a listener given to `NEW_IMAGE` and to another event, is reported with
  the text that the key is `sliceIndex` if it is the detail of `NEW_IMAGE`.
  Every other `imageIdIndex` (`setImageIdIndex`,
  `initialImageIdIndex`, `getCurrentImageIdIndex`) stays.
- `STACK_SCROLL_OUT_OF_BOUNDS` and `VOLUME_VIEWPORT_SCROLL_OUT_OF_BOUNDS` of
  `Enums.Events` (also `EVENTS`, destructured, quoted or in brackets) become
  `SCROLL_OUT_OF_BOUNDS`; `Types.EventTypes.StackScrollOutOfBoundsEvent`,
  `VolumeScrollOutOfBoundsEvent` and their `Detail` types become
  `ScrollOutOfBoundsEvent` and `ScrollOutOfBoundsEventDetail`, for review.
  In a listener that the file shows (given to `addEventListener` of the
  event, inline, by its name, or as `this.listener`, or with its event or
  detail typed with one of these types), the keys of the old detail that
  have one key in the new one are rewritten, in the same forms as
  `imageIdIndex` above: `direction` of the stack event becomes `delta` and
  `currentImageId` of the volume event `imageId`. A read of `imageIdIndex`,
  `currentStepIndex` (both are `sliceIndex`, but where the scroll stopped,
  not where it started), `desiredStepIndex`, `numScrollSteps`
  (`numberOfSlices - 1`) or `viewport` (read
  `getEnabledElementByIds(viewportId, renderingEngineId).viewport`) is
  reported for review with what to read.
  An `addEventListener` of one of the two events is reported for review
  when the listener is not in the file, when the file does not show that it
  hears that event only, and when the file listened to both events, which
  are one event now. Two shorthands of one pattern of `Enums.Events` that
  become `SCROLL_OUT_OF_BOUNDS` keep one name: the second becomes
  `SCROLL_OUT_OF_BOUNDS: VOLUME_VIEWPORT_SCROLL_OUT_OF_BOUNDS`. A string of
  an old event is reported.
- `VOLUME_VIEWPORT_SCROLL` is reported at each site: no event fires for
  each scroll; listen to `NEW_IMAGE` for the slice that shows and to
  `CAMERA_MODIFIED` for the camera. A listener added on `eventTarget` and
  one added on an element both hear `SCROLL_OUT_OF_BOUNDS`, which fires on
  both.

### Render modes

The render plan of a planar viewport (`viewport.getRenderPlan()`) is the one
public description of how a display set is drawn; the render modes are
private.

- `entry.actorMapper.mapper` becomes `entry.actor.getMapper()`, and
  `entry.actorMapper.actor` becomes `entry.actor`, where the file shows that
  the entry is an actor entry: a value typed `ActorEntry`, the result of
  `getDefaultActor()` or `getActor()`, or an entry of `getActors()` (an
  index, a `find`, a `for...of`, the first parameter of a callback). An
  optional chain keeps its `?.` on the entry.
- The slots of a literal given to `registerRenderBackend` take the words of
  `RenderPlanLayer.slice`: `image` becomes `frame`, `sampledVolume` becomes
  `cpu`, and `volume` becomes `cpu` on a backend with `surface: 'cpu'` and
  `gpuVolume` on any other.
- `renderMode` goes from a literal mount option of `addDisplaySet` and of
  the `options` of a `setDisplaySets` entry where its value is
  `'vtkVolume3d'` or `'vtkGeometry3d'` (these values name the 3D viewport, so
  this also runs in a file that imports no Cornerstone package, such as a
  fragment of a page), and where it is `'auto'` on a viewport that the file
  types as a 3D viewport. An option object that held nothing else goes with
  it.
- Reported, manual: each use of `ActorRenderMode` and
  `Types.ActorRenderMode`, a member with the test of the render plan that
  stands for it (`VTK_IMAGE` is `slice 'frame'` and `draw 'gpu'`,
  `VTK_SAMPLED_SLICE` `'cpu'` and `'gpu'`, `VTK_VOLUME_SLICE` `'gpuVolume'`,
  `CPU_IMAGE` `'frame'` and `'cpu'`, `CPU_VOLUME` `'cpu'` and `'cpu'`;
  `VTK_VOLUME` was never drawn); `entry.actorMapper.renderMode` and
  `renderMode` of a render plan layer (an entry of `getRenderPlan()`, a value
  typed `RenderPlanLayer`, the `previous` and `current` of the detail of
  `RENDER_PLAN_CHANGED`), once at a comparison with a mode or an old mode
  string, with the test for that mode; `Types.ActorMapperProxy`; any other
  `actorMapper`, also of an object that the file does not show, in a file
  that imports Cornerstone; a `registerRenderBackend` whose definition or
  `renderModes` is not a literal, or whose slots would meet in one; and a
  `renderMode` mount option of a 3D viewport that is not a literal.
- Left: `renderMode` of an object that is not a render plan layer (such as
  the mount option of a custom viewport family on `BaseViewport`), the
  strings `'vtkVolume'` and the other mode values outside a comparison with
  a Cornerstone mode, and the slots that are final already.

### Viewport members and queries

A planar and a 3D viewport answer `getVolumeIds()`, `getScalarRange()`,
`getDisplaySetIdForVolumeId()` and, on a planar viewport,
`isInAcquisitionPlane()`; a 3D viewport whose source is a surface has the
content mode `'geometry3d'`. Only the reverse lookup of a volume had a name
before.

- `findDataIdByVolumeId` becomes `getDisplaySetIdForVolumeId` on a viewport
  that the file proves (a cast or a type of a viewport class, the viewport of
  `getEnabledElement`, `getViewport` of a rendering engine): a call, an
  optional call, a string in brackets, an `in` test and a destructured key.
- Reported, manual: the same member on a receiver that only its name shows
  to be a viewport, and a member `findDataIdByVolumeId` that a type of the
  application declares on top of a Cornerstone viewport type (an
  intersection with it, an interface that extends it).
- Left: a member of that name on an object that is no viewport, such as a
  class or an object literal of the application. The other queries are new:
  nothing to rewrite.

## Reported

- Manual: each site of a removed name, and each site of a renamed name
  that the step cannot rewrite, with the reason: a receiver that only its
  name shows to be a viewport, a name imported from a path under the
  package, a moved name in brackets or in a destructuring pattern, a key
  whose value runs code where the key goes, another rewrite that overlaps
  the site. A computed key and a rest element of a destructuring pattern of
  an object whose members a rule renames. A string that holds the value of
  a renamed enum member (a listener of it compiles and never runs).
- Review: each rewritten site of a rule that names a decision of the
  guide, and two operands that the renames make the same, such as two
  events of one `||` that are one event now.
- Manual, a key of a module mock of the package (see How the step decides)
  whose name moves (`utilities.genericViewportDisplaySetMetadataProvider: a key of the mock of @cornerstonejs/core, moves to displaySetRegistry: give the mock that path`),
  is reported, or would repeat a key that the object has
  (`Events.COLORMAP_MODIFIED: a key of the mock of @cornerstonejs/core, which has DISPLAY_SET_APPEARANCE_CHANGED already`).
- Manual, a renamed or removed name on a namespace that the file binds
  nowhere, as in a code block of a page that imports it in another block:
  `utilities.genericViewportDisplaySetMetadataProvider: the file does not bind utilities; if it is Cornerstone's, its name in 6.0 is displaySetRegistry, a top-level export`.
- Manual, on a receiver that the file gives a type of the application (a
  cast such as `target as NativeViewport` or `viewport as unknown as { ... }`,
  a `getViewport<NativeViewport>(...)`, a name declared with such a type),
  also when the type is an intersection with a Cornerstone type: that type
  declares the member, so the rule says
  `the object has a type of the application, which declares the member: change it there and here`
  with the 6.0 name.
- Manual, at line 1: `the file was not analysed:` with the reason, for a
  file whose names cannot be looked up. See the README of
  `@cornerstonejs/cornerstone3d-6`.

## How the step decides

It follows the rules of the other 6.0 steps: it changes a site only where
the file shows that it is Cornerstone's. A name is Cornerstone's when it is
bound to an import of the package, to its namespace import, or to a `const`
that holds one of those (`const { Events } = Enums`); `EVENTS` of the core is
`Enums.Events`; so is a name destructured from the namespace import
(`const { Enums } = cornerstone3D`). A receiver is a viewport, an engine or
a typed value as `lib.ts` shows it (`viewportEvidence`, `isRenderingEngine`,
the annotation or cast of a binding that holds one value). The outermost
cast or annotation decides: a type of the application there makes the
receiver one known by its name only, whatever Cornerstone value is under
it (`hasApplicationType`). The family of a viewport is that of its type, of
the type argument of `getViewport<T>` (also after an `await`), or of an
input in the same function that creates it: an object with the same
`viewportId` and a `type` or `viewportType` that is a member of the core
`ViewportType` (`enableElement`, `setViewports`, a helper of the
application). An object literal reaches
Cornerstone when it is an argument of a proven call, an entry of an array
argument, or the value of a `const` passed there.

A module mock is Cornerstone's when it names the package: the keys of the
object that the factory of `jest.mock`, `jest.doMock`, `vi.mock` or
`vi.doMock` of `@cornerstonejs/core` or `@cornerstonejs/tools` gives (the
body of an arrow function or each `return` of the factory, with or without
`...jest.requireActual(...)` or `...(await importOriginal())` spread in, or
a `const` that holds the object), and the keys of the object literals under
a key that names an exported object of a rule (`utilities: { ... }`,
`viewportProjection: { ... }`, `Enums: { Events: { ... } }`, `EVENTS`), are
the exports themselves. Each takes what the step does with the name: a
renamed name is renamed (`getPresentation: jest.fn()` becomes
`getFraming: jest.fn()`, a shorthand `getPresentation` becomes
`getFraming: getPresentation`), and a moved or reported name is reported
with `a key of the mock of <package>`. A key whose new name the object has
already (two events that 6.0 merges into one) is reported. The tests that
read the mock then find the names that the step wrote in their reads. A
mock of a module of the application, an object outside a mock factory, and
a computed key stay as they are.

## Contributing

A lane that changes a public name adds its rule here, in the file of its
family, and its fixtures. Lanes that work in parallel edit different files:

| Family                       | File                                         | Lanes                                                              |
| ---------------------------- | -------------------------------------------- | ------------------------------------------------------------------ |
| Generic names                | `scripts/families/generic-names.ts`          | N1                                                                 |
| Display sets                 | `scripts/families/display-sets.ts`           | N2, DS1 to DS3                                                     |
| Appearance and framing       | `scripts/families/appearance-and-framing.ts` | N3; AP1, AP2 in the table `appearance`; VS1 in the table `framing` |
| Events                       | `scripts/families/events.ts`                 | EV1, EV2                                                           |
| Render modes                 | `scripts/families/render-modes.ts`           | RM1                                                                |
| Viewport members and queries | `scripts/families/viewport-members.ts`       | RM2                                                                |

Do not edit `scripts/lib.ts`: it is an equal copy in every 6.0 step, and
`yarn validate:registry` fails when the copies differ. Do not edit
`scripts/rules.ts` for one rule; a helper that one family needs goes in its
family file.

### 1. Add the rule

A family file exports `rules`, three tables, and `rewrite(run)`. Most rules
are one line of a table. `scripts/rules.ts` documents every field. The
entries below show the shape of each kind; they are not rules of the step,
and the new names in them are not decided by this README.

```ts
export const rules: Rules = {
  exports: [
    // a top-level export, its import, its uses and its re-exports
    { name: 'GenericViewport', to: 'BaseViewport' },
    // a member of an exported object, namespace or enum
    { namespace: 'Types', name: 'IGenericViewport', to: 'IViewport' },
    {
      namespace: 'Enums.Events',
      name: 'VOI_MODIFIED',
      to: 'DISPLAY_SET_APPEARANCE_CHANGED',
      review: 'the detail has a cause',
      value: 'CORNERSTONE_VOI_MODIFIED',
    },
    // a name that moves to another object, with the import it needs
    {
      namespace: 'utilities',
      name: 'genericViewportDisplaySetMetadataProvider',
      moveTo: 'displaySetRegistry',
    },
    // a removed name: each site is reported
    { name: 'oldHelper', manual: 'call newHelper(viewport)' },
  ],
  members: [
    // a member of a viewport, an engine, a typed value or a returned value
    { receiver: 'viewport', name: 'getViewPresentation', to: 'getViewFraming' },
    {
      receiver: { returnOf: 'getViewReference' },
      name: 'dataId',
      to: 'displaySetId',
    },
  ],
  keys: [
    // a key of an object literal that reaches a Cornerstone call
    {
      in: { receiver: 'viewport', method: 'setDisplaySets', argument: 0 },
      key: 'dataId',
      to: 'displaySetId',
    },
    {
      in: { call: 'displaySetRegistry.add', argument: 1 },
      key: 'kind',
      remove: true,
    },
    {
      in: { type: 'PublicViewportInput' },
      key: 'defaultOptions.orientation',
      manual: 'read the guide',
    },
  ],
};
```

What each entry does:

- `to` renames the site; `moveTo` (exports of the core only) replaces the
  whole access with a path from the top of the core and adds its import;
  `remove` (keys) deletes the key where its value runs no code.
- An entry without `to`, `moveTo` or `remove` reports each site:
  `manual: 'text'` in `cornerstone3d-6-manual`, or `review: 'text'` alone in
  `cornerstone3d-6-review` for a name that stays and does something else.
- On a rewriting entry, `review: 'text'` puts each rewrite in the review
  list, and `manual: 'text'` is the reason of each site that it cannot
  rewrite.
- `label` replaces the name of the site in a report. The report reads
  `label` or `label: text`; without `label` it is the path of the name
  (`Events.VOI_MODIFIED`, `Types.IGenericViewport`), the member name, or
  `setDisplaySets: the key dataId`.
- `package` names another package than `@cornerstonejs/core`, such as
  `@cornerstonejs/tools`.
- Two names that become one name (two events into one) need nothing more:
  the step reports two operands that the renames make the same.

What a table cannot say goes in `rewrite(run)` of the family. It runs before
the tables of every family. Use the helpers of `rules.ts` (`pathOf`,
`importOf`, `receiverEvidence`, `report`, `noteRewritten`) and of `lib.ts`;
add edits with `run.edits.add(...)` and core imports with
`run.imports.ensure(...)`, never by editing an import statement of the core
directly. Put the start of each node you rewrite or report in
`run.handled` (`report` and `noteRewritten` do it), so that the tables leave
it.

A rename must not lead to a name that another entry renames again: the step
runs once, and the idempotency check runs it on its own output.

### 2. Add four fixtures

Each fixture is a folder with `input.<ext>`, `expected.<ext>` and, when the
step reports a site, `metrics.json`. Name the folders after the family, so
that two lanes never add the same folder:

| Fixture                  | Folder                                       | What it shows                                                                                                                                                 |
| ------------------------ | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| One that rewrites        | `tests/typescript/<family>-<rule>`           | every shape the rule rewrites, with its report entries                                                                                                        |
| One that must not change | `tests/typescript/<family>-<rule>-negative`  | the same names on objects that are not Cornerstone's, such as OHIF's `DisplaySetService.EVENTS` or its own `LutPresentation`: `expected.ts` equals `input.ts` |
| An edge case             | `tests/typescript/<family>-<rule>-edge`      | a shape between the two: a name bound by a `let`, a shadowing name, a quoted or bracketed key, a re-export, a name taken already                              |
| A `.js` file with JSX    | `tests/tsx/<family>-<rule>-jsx-in-a-js-file` | `input.js` with JSX: the step looks its names up on the syntax tree there                                                                                     |

The fixtures of `.ts` files are parsed as TypeScript; put `.tsx`, `.js`,
`.jsx`, `.mjs` and `.cjs` fixtures in `tests/tsx`. Write `input` by hand,
then let the tool write `expected` and `metrics.json`, and read both:

```sh
cd packages/codemods/registry/cornerstone3d/6/api-names
npx codemod jssg test -l typescript -u --filter <family>-<rule> scripts/api-names.ts tests/typescript
npx codemod jssg test -l tsx -u --filter <family>-<rule> scripts/api-names.ts tests/tsx
```

### 3. Run only your fixtures

From `packages/codemods`:

```sh
node scripts/test-registry-packages.mjs --package 6/api-names --filter <family>-<rule>
```

It runs the fixtures whose name holds the filter, then runs the step on
their `expected` files, which must not change. Without `--filter` it runs
every fixture of the package, with the self-test of the table engine
(`tests/self-test`, made-up names, run with `scripts/self-test.ts`).

### 4. Run the rule on real code

From `packages/codemods`, run the step on this repository's examples and
tests, and on the code blocks of the docs (`--markdown`), without writing
anything (`--dry-run`), and read what it rewrote and reported, per rule and
per file:

```sh
node scripts/run-registry.mjs --dry-run --steps api-names --diff /tmp/api-names.diff \
  ../*/examples ../*/test
node scripts/run-registry.mjs --dry-run --steps api-names --markdown \
  ../docs/docs/concepts ../docs/docs/how-to-guides ../docs/docs/tutorials \
  ../docs/docs/getting-started ../docs/docs/contribute ../docs/docs/examples.md
```

The runner leaves the pages of `docs/migration-guides` out by itself: their
code shows the old names on purpose. A site that the rule should rewrite or
report and does not is a new
fixture, not a hand edit. Without `--dry-run` the runner writes the changed
files back. The README of `packages/codemods` describes the runner and the
measure of the whole migration.

## Development

From `packages/codemods`:

```sh
node scripts/test-registry-packages.mjs --package 6/api-names
npx codemod workflow validate -w registry/cornerstone3d/6/api-names
```
