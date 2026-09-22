---
id: generic-viewport-code-design
title: Generic Viewport code design
summary: Which part of a generic viewport family owns which responsibility - the base class, the family viewport class, the resolved view, the render path, the data provider, the projection adapter, and the legacy adapter
---

# Generic Viewport code design

## Scope

This specification describes the code design of the Generic Viewport
architecture. It says where each part of a viewport family must live. It covers
the base class `GenericViewport`, the family viewport class, the resolved view,
the render path, the render path resolver, the data provider, the projection
adapter, and the legacy adapter.

This specification does not describe what a clinician sees. It does not replace
the concept pages in
[`concepts/cornerstone-core/generic-viewport`](../../concepts/cornerstone-core/generic-viewport/index.md),
which explain why the architecture exists. This page states the rules that a
contributor must follow, and a reviewer must check.

The "user" of this specification is the developer who writes application code
against the Generic Viewport API, or who adds a new viewport family. The
§ User requirements section states what that developer can rely on. The
§ Implementation requirements section states how the code delivers it.

Change rule:

- A user requirement changes in two cases only: the requirement describes the
  behaviour wrongly, or the intended developer-facing behaviour itself changes.
  An implementation that is inconvenient is never a reason to change a user
  requirement.
- An implementation requirement changes freely when a better approach appears.

Source: pull request
[2666 "cornerstone3d redo viewports"](https://github.com/cornerstonejs/cornerstone3D/pull/2666),
which introduced the architecture, and the code in
`packages/core/src/RenderingEngine/GenericViewport/`.

## How to use this specification in a review

Read this page before you review a change that touches
`packages/core/src/RenderingEngine/GenericViewport/`, or a tool that reads the
geometry of a viewport, or a module under `packages/core/src/utilities/` that
names one viewport family.

A review follows four steps:

1. **Name the part that each hunk belongs to.** Use the table in
   § GENVIEW-PLACE. The first question that answers yes names the owner.
2. **Check the hunk against the group of that part.** Each group holds the rules
   for one part, and each rule has an identifier.
3. **Report a deviation with the identifier.** Write "breaks GENVIEW-STATE-1",
   and not "this looks wrong". The identifier tells the author which rule
   applies, and it tells a later reader whether the rule changed.
4. **Check the § Known deviations list first.** A deviation that the list already
   holds is not a new finding. A change that makes an existing deviation worse
   is a finding, and the report says which one.

The three questions that find the most defects, in order:

- Does a new option change the world geometry, and does it sit in the data
  presentation? See GENVIEW-STATE-1 and GENVIEW-STATE-3.
- Does a second module compute geometry that the resolved view already owns? See
  GENVIEW-VIEW-6 and GENVIEW-PATH-2.
- Does the code answer "what is this viewport" with `instanceof`, or with a list
  of viewport types? See GENVIEW-API-6 and GENVIEW-FAMILY-5.

## Description

A generic viewport family is a set of files in one directory under
`packages/core/src/RenderingEngine/GenericViewport/`. Today the repository holds
five families: `Planar`, `Video`, `ECG`, `WSI` and `Volume3D`.

Each family divides one viewport into seven parts. The parts form a chain from a
logical identifier to a drawn frame:

```text
display set id
  -> DataProvider          loads the logical data
  -> RenderPathResolver    picks the runtime implementation
  -> RenderPath            mounts the data and returns a binding
  -> ViewportDataBinding   one mounted data set
  -> ResolvedView          derives the world geometry and the transforms
  -> renderer command      the drawn frame
```

Four records hold the state, and each record has one owner and one purpose. The
contract in
[ViewportArchitectureTypes.ts:10-22](https://github.com/cornerstonejs/cornerstone3D/blob/main/packages/core/src/RenderingEngine/GenericViewport/ViewportArchitectureTypes.ts#L10-L22)
states the contract, and this specification repeats it:

| Record             | Owner                                    | Holds                                                                     | Persisted                              |
| ------------------ | ---------------------------------------- | ------------------------------------------------------------------------- | -------------------------------------- |
| `ViewState`        | The family viewport class                | The navigation and the layout                                             | No, but a presentation derives from it |
| `ViewPresentation` | The projection adapter                   | The pan, the zoom or the scale, the rotation, the flips, the display area | Yes                                    |
| `ViewReference`    | The family viewport class                | The frame of reference, the data identity, the slice locator              | Yes                                    |
| `DataPresentation` | One binding                              | The VOI, the opacity, the colormap, the interpolation, the visibility     | Yes                                    |
| `ResolvedView`     | The family viewport class, for one frame | The world geometry and the world/canvas transforms                        | Never                                  |

## User requirements

### The public API of a viewport (GENVIEW-API)

- **GENVIEW-API-1** The developer mounts data with `setDisplaySets()` and
  `addDisplaySet()`, and the developer names a display set identifier only. The
  developer does not name a render path, and the developer does not name CPU or
  GPU.
- **GENVIEW-API-2** The developer reads and writes the navigation through
  `getViewState()`, `setViewState()` and `updateViewState()`. The developer
  reads and writes the persistable look state through `viewportProjection`.
- **GENVIEW-API-3** The developer reads and writes the appearance of one mounted
  data set through `getDisplaySetPresentation()` and
  `setDisplaySetPresentation()`. A change of the appearance of an overlay does
  not change the source, and does not move the view.
- **GENVIEW-API-4** The developer converts between canvas space and world space
  with `canvasToWorld()` and `worldToCanvas()`. The two methods answer with the
  geometry of the current state, and not with the geometry of the previous
  frame. The two methods answer correctly after `setDisplaySets()` resolves, and
  before the first render.
- **GENVIEW-API-5** A change of the layout, of the scale, of the pan or of the
  rotation fires `CAMERA_MODIFIED`. A tool that listens to that event sees every
  change that moves a world point on the canvas.
- **GENVIEW-API-6** The developer asks a viewport what it shows with
  `getCurrentMode()`. The answer names the content, for example `stack`,
  `volume`, `ecg` or `empty`. The developer does not need an `instanceof` test,
  and the developer does not need a test of the method list.
- **GENVIEW-API-7** An application that used a legacy viewport type keeps its
  API. `ViewportType.ECG`, `STACK`, `ORTHOGRAPHIC`, `VIDEO`, `WHOLE_SLIDE` and
  `VOLUME_3D` each resolve to a legacy adapter that carries the old methods.
- **GENVIEW-API-8** A direct generic viewport type, for example
  `ViewportType.ECG_NEXT`, carries the clean API only. The developer reads the
  list of clean methods, and the developer knows which methods survive the
  removal of the legacy adapters.

### The extension points of the architecture (GENVIEW-EXT)

- **GENVIEW-EXT-1** The developer adds a render path to an existing family, and
  the developer changes no viewport class. The new path declares which data it
  draws, and the resolver selects it.
- **GENVIEW-EXT-2** The developer supplies a different data provider or a
  different render path resolver through the viewport constructor arguments. The
  default of each one stays available.
- **GENVIEW-EXT-3** The developer adds a new viewport family, and the developer
  changes no code of another family.
- **GENVIEW-EXT-4** The developer registers a new viewport type with
  `registerViewportType()`, and the developer does not edit
  `viewportTypeToViewportClass.ts`.

## Implementation requirements

### The base class (GENVIEW-BASE)

`packages/core/src/RenderingEngine/GenericViewport/GenericViewport.ts`

- **GENVIEW-BASE-1** The base class owns the bindings, the data presentation
  map, the view state field, the destroy lifecycle and the events. The base
  class holds no knowledge of CPU, of VTK, of DOM, of an image, of a volume or
  of a medium.
- **GENVIEW-BASE-2** The base class holds no code that names one family. A
  `switch` on the render context type, or a test of `type === 'ecg'`, belongs to
  the family.
- **GENVIEW-BASE-3** The base class declares `getResolvedView()` abstract, and
  it implements `canvasToWorld()`, `worldToCanvas()`, `getFrameOfReferenceUID()`
  and `getCameraForEvent()` on top of that one method. A family does not
  override the four methods.
- **GENVIEW-BASE-4** A new method goes on the base class when two or more
  families need the same behaviour. One family that needs a method puts the
  method on the family class.
- **GENVIEW-BASE-5** A method that the base class provides for a family to
  override is `protected`, for example `normalizeViewState()`,
  `getReferenceViewContexts()` and `onDestroy()`.

### The family viewport class (GENVIEW-FAMILY)

For example `ECG/ECGViewport.ts`, `Planar/PlanarViewport.ts`.

- **GENVIEW-FAMILY-1** The family class stays thin. It supplies the render
  context, the data provider, the render path resolver, the default view state,
  and the public API of that family.
- **GENVIEW-FAMILY-2** The family class owns the view state. It is the one
  source of truth for the navigation and for the layout. No render path and no
  binding keeps a second copy.
- **GENVIEW-FAMILY-3** The family class builds the resolved view in
  `getResolvedView()`, from the data, the canvas geometry, the view state and
  the data presentation. The method builds a new instance for each call, or it
  caches one instance for each state. The method never reads a value that a
  render path wrote during a draw.
- **GENVIEW-FAMILY-4** The family class holds no drawing code. A call to
  `CanvasRenderingContext2D`, to a VTK mapper or to a DOM media element belongs
  to a render path.
- **GENVIEW-FAMILY-5** The family class overrides `getCurrentMode()` and returns
  the content mode of that family. The base answer `'unknown'` is a defect of
  the family, and not a valid answer.
- **GENVIEW-FAMILY-6** The family class exposes the semantic API of the family:
  `getZoom()`, `setZoom()`, `getPan()`, `setPan()`, `getRotation()`,
  `getViewState()` and `resetViewState()`. The family class does not expose
  `getCamera()` or `setCamera()`. See GENVIEW-LEGACY-2.
- **GENVIEW-FAMILY-7** The family class creates the canvas or the DOM element of
  the family in the constructor, and it puts the element on the render context.
  A render path receives the element, and it does not create one.

### The view state, and the data presentation (GENVIEW-STATE)

For example `ECG/ECGViewportTypes.ts`.

- **GENVIEW-STATE-1** An option that changes the world geometry, or that changes
  the world/canvas transform of any point, belongs to the view state. A slice
  position, a reformat orientation, a cell layout, a time window and an
  amplitude scale each change the geometry, so each one is view state.
- **GENVIEW-STATE-2** An option that changes the appearance only belongs to the
  data presentation: the VOI, the opacity, the colormap, the blend mode, the
  interpolation, the visibility, the line width.
- **GENVIEW-STATE-3** The test for GENVIEW-STATE-1 is one question. Does a
  change of the option move a world point on the canvas? An answer of yes puts
  the option in the view state, because the view state path fires
  `CAMERA_MODIFIED`, and the presentation path does not.
- **GENVIEW-STATE-4** The view state extends `ViewportCameraBase`. The family
  adds only the fields that the family needs.
- **GENVIEW-STATE-5** The family declares the four records in one file,
  `<Family>ViewportTypes.ts`: the view state, the data presentation, the render
  context and the mounted rendering. A second declaration of the same shape in
  another file is a defect. A shared shape becomes a type alias, and not a copy.

### The resolved view (GENVIEW-VIEW)

For example `ECG/ECGResolvedView.ts`. Each one extends `ResolvedViewportView`.

- **GENVIEW-VIEW-1** The resolved view owns the world geometry of one frame and
  the transforms between world space and canvas space.
- **GENVIEW-VIEW-2** The resolved view derives every value from three inputs:
  the loaded data, the canvas geometry, and the view state with the data
  presentation. It reads no value that a render path produced.
- **GENVIEW-VIEW-3** The resolved view is immutable. The constructor freezes the
  state. A derived value is cached inside the instance, because one instance
  describes one frame.
- **GENVIEW-VIEW-4** The resolved view is never persisted, and it never appears
  in a presentation or in a reference.
- **GENVIEW-VIEW-5** The resolved view implements `buildICamera()`, which gives
  the legacy `ICamera` shape for the tools that still need it. The `ICamera`
  shape is an output of the resolved view, and it is not an input.
- **GENVIEW-VIEW-6** A render path that needs the geometry reads it from the
  resolved view, through the render context. A render path does not compute the
  geometry a second time.

### The render path (GENVIEW-PATH)

For example `ECG/CanvasECGRenderPath.ts`, `Planar/VtkImageMapperRenderPath.ts`.

- **GENVIEW-PATH-1** A render path owns the drawing and the runtime resources of
  one data shape in one render mode. It owns the mount, the draw, the resize and
  the cleanup.
- **GENVIEW-PATH-2** A render path owns no navigation truth. `applyViewState()`
  is a projection from the semantic state to a runtime command, and it stores
  nothing that the viewport already holds.
- **GENVIEW-PATH-3** A render path returns the cleanup of every resource that it
  created, through `removeData()` on the attachment.
- **GENVIEW-PATH-4** `matches()` tests the data type and the render mode only.
  It does not test the binding role. A source and an overlay of the same shape
  use the same render path.
- **GENVIEW-PATH-5** A render path reaches the viewport through the render
  context only. It holds no reference to the viewport class.
- **GENVIEW-PATH-6** The source binding writes the active resolved view of the
  viewport. An overlay binding reads that view to align itself, and it does not
  replace it.

### The render path resolver (GENVIEW-RESOLVER)

For example `ECG/ECGRenderPathResolver.ts`.

- **GENVIEW-RESOLVER-1** Each family exports two functions:
  `createDefault<Family>RenderPaths()`, which returns the catalogue, and
  `create<Family>RenderPathResolver()`, which returns a resolver over that
  catalogue.
- **GENVIEW-RESOLVER-2** A family uses `DefaultRenderPathResolver` unless the
  family needs a different selection rule. A family that needs a decision before
  the catalogue search puts that decision in a separate decision service, as
  `Planar/PlanarRenderPathDecisionService.ts` does.
- **GENVIEW-RESOLVER-3** The catalogue is explicit. A render path that is absent
  from the catalogue never runs in production.

### The data provider (GENVIEW-DATA)

For example `ECG/DefaultECGDataProvider.ts`.

- **GENVIEW-DATA-1** The data provider turns a display set identifier into a
  `LoadedData` payload. It performs the input and the output, and the decode.
- **GENVIEW-DATA-2** The data provider holds no render decision, no geometry and
  no view state.
- **GENVIEW-DATA-3** The payload carries the logical data only. It carries no
  canvas, no actor and no mapper.

### The projection adapter (GENVIEW-PROJ)

Each family holds four files:
`<family>ProjectionAdapter.ts`, `<Family>ProjectionTypes.ts`,
`<family>ProjectionSnapshot.ts` and `<family>ProjectionPresentation.ts`.

- **GENVIEW-PROJ-1** The snapshot file reads the viewport and returns a
  `ProjectionSnapshot`. The snapshot declares the spaces that the family
  supports, and it omits a space that the family does not support. A no-op
  transform in place of an omitted space is a defect.
- **GENVIEW-PROJ-2** The presentation file converts between the snapshot and the
  public presentation shape of the family. `withPresentation()` returns the next
  view state, and it does not mutate the viewport.
- **GENVIEW-PROJ-3** The adapter file joins the two, declares the identifier and
  the viewport types, and exports one constant.
- **GENVIEW-PROJ-4** The adapter declares the scale and the position with a
  tagged shape from `ProjectionScale` and `ProjectionPosition`. A family that
  has no single zoom value does not invent one.
- **GENVIEW-PROJ-5** `viewportProjection.ts` registers every built-in adapter at
  the end of the file. A family adds one line there, and the family adds nothing
  else to that file.

### The legacy adapter (GENVIEW-LEGACY)

For example `ECG/ECGViewportLegacyAdapter.ts`.

- **GENVIEW-LEGACY-1** The legacy adapter extends the family viewport class, and
  it adds the methods of the viewport class that the family replaces.
- **GENVIEW-LEGACY-2** `getCamera()`, `setCamera()`, `resetCamera()`,
  `getViewPresentation()`, `setViewPresentation()`, `setProperties()`,
  `getProperties()` and `resetProperties()` live on the legacy adapter, and not
  on the family class.
- **GENVIEW-LEGACY-3** A legacy method is a translation to the clean API. It
  holds no geometry of its own. A conversion between world space and canvas
  space goes through the resolved view of the family.
- **GENVIEW-LEGACY-4** `viewportTypeToViewportClass.ts` maps the legacy viewport
  type to the adapter through `resolveClass`, and it maps the `_NEXT` type to
  the family class.
- **GENVIEW-LEGACY-5** The legacy adapter is temporary. A new feature goes on the
  family class, and the adapter translates to it.

### The file layout of a family (GENVIEW-FILE)

- **GENVIEW-FILE-1** Every file of one family lives in one directory,
  `GenericViewport/<Family>/`. The directory holds the drawing code of the
  family.
- **GENVIEW-FILE-2** The directory exports one `index.ts`. That file exports the
  viewport class as the default, the render path factories, the data provider,
  the projection namespace and the public types. `GenericViewport/index.ts`
  re-exports those names, and nothing else reaches outside.
- **GENVIEW-FILE-3** The file names follow the pattern of the family:
  `<Family>Viewport.ts`, `<Family>ViewportTypes.ts`, `<Family>ResolvedView.ts`,
  `<Family>RenderPathResolver.ts`, `Default<Family>DataProvider.ts`,
  `<Family>ViewportLegacyAdapter.ts`, and one file for each render path.
- **GENVIEW-FILE-4** Code that two or more families share lives in
  `GenericViewport/`, and not in `packages/core/src/utilities/`. Today
  `viewportProjection.ts`, `genericViewportReferenceCompatibility.ts` and
  `genericViewportDisplaySetAccess.ts` are examples.
- **GENVIEW-FILE-5** A module in `packages/core/src/utilities/` must not serve
  one family alone. A family-specific module there is a defect, because a
  reader of the family directory does not see it, and because a second consumer
  of that module can force a compromise on the shape of the API.

### Where a new piece of code goes (GENVIEW-PLACE)

- **GENVIEW-PLACE-1** A reviewer answers the questions below in order, and the
  first answer of yes gives the owner.

| Question                                                                             | Owner                                                    |
| ------------------------------------------------------------------------------------ | -------------------------------------------------------- |
| Does the code load the data?                                                         | The data provider                                        |
| Does the code choose which implementation draws the data?                            | The render path resolver, or a decision service          |
| Does the code call a drawing API?                                                    | The render path                                          |
| Does the code convert between world space and canvas space, or compute a world size? | The resolved view                                        |
| Does the code change what the user navigates to?                                     | The view state, on the family class                      |
| Does the code change how a mounted data set looks?                                   | The data presentation, on the binding                    |
| Does the code persist or restore the look of the view?                               | The projection adapter                                   |
| Does the code exist for an application that has not migrated?                        | The legacy adapter                                       |
| Do two or more families need the same code?                                          | The base class, or a shared module in `GenericViewport/` |

## Known deviations

The rules above describe the intended design. The code on `main` deviates in the
places below. Each item names the requirement that the deviation breaks.

A review uses this section in two ways. A deviation that this section already
holds is not a new finding. A change that makes one of these deviations worse is
a finding, and the report names the deviation.

### The resolved view of the ECG family reads render-path output

`CanvasECGRenderPath.addData` creates a `metrics` object on the mounted
rendering, and `drawFrame` overwrites that object on each draw.
`ECGViewport.getResolvedView` passes the same object into `ECGResolvedView`, and
the resolved view divides by `metrics.ecgWidth` and `metrics.channelScale` in
`canvasToWorld`.

The world/canvas transform is therefore one frame old after any change of the
canvas size or of the time window. Before the first draw, the transform uses the
placeholder values that `addData` wrote, which are all ones.

Breaks GENVIEW-VIEW-2, GENVIEW-PATH-2 and GENVIEW-API-4.

### `amplitudeScale` scales the drawn trace and not the transform

`ECGDataPresentation` holds `amplitudeScale`. `drawECGTraces` multiplies each
sample by `channelScale * amplitudeScale`, and `ECGResolvedView.canvasToWorld`
divides by `channelScale` only.

An `amplitudeScale` other than 1 therefore moves the trace on the canvas, and it
does not move the coordinate transform. An annotation no longer sits on the
feature that the user placed it on, and no `CAMERA_MODIFIED` event reports the
change.

Breaks GENVIEW-STATE-1 and GENVIEW-API-5. `amplitudeScale` belongs in
`ECGViewState`, because it changes where a world point lands on the canvas.

### `sweepSpeed` is declared and never read

`ECGProperties` declares `sweepSpeed`, and no code in the ECG family or in
`utilities/ECGUtilities.ts` reads it. `computeECGRenderMetrics` uses the constant
`ECG_SECONDS_WIDTH` for the horizontal scale.

The option is dead. When a change makes it live, the option goes into
`ECGViewState` and not into `ECGDataPresentation`, for the reason above.

### `utilities/ECGUtilities.ts` serves two viewport classes

The module holds the ECG layout code, the ECG metric code and the ECG drawing
code. Two classes import it: the ECG family, and the deprecated
`packages/core/src/RenderingEngine/ECGViewport.ts`.

The Video family and the WSI family have no equivalent module. Their drawing
code lives inside the family directory.

Breaks GENVIEW-FILE-1 and GENVIEW-FILE-5. The fix moves the code into
`GenericViewport/ECG/` and leaves a re-export for the deprecated class.

### Three declarations of the ECG layout, and two of the render metrics

| Declaration           | File                                      | State                                                |
| --------------------- | ----------------------------------------- | ---------------------------------------------------- |
| `ChannelLayout`       | `GenericViewport/ECG/ECGViewportTypes.ts` | Exported, and no file imports it                     |
| `ChannelLayout`       | `RenderingEngine/ECGViewport.ts`          | A second local declaration                           |
| `ECGChannelLayout`    | `utilities/ECGUtilities.ts`               | The one that the code uses                           |
| `RenderWindowMetrics` | `GenericViewport/ECG/ECGViewportTypes.ts` | Structurally the same as `ECGRenderMetrics`          |
| `ECGRenderMetrics`    | `utilities/ECGUtilities.ts`               | `CanvasECGRenderPath` casts to `RenderWindowMetrics` |

Breaks GENVIEW-STATE-5. The dead declaration goes, and the duplicate becomes a
type alias, so a future change to one shape cannot silently pass the cast.

### Only the Planar family answers `getCurrentMode()`

`PlanarViewport` overrides `getCurrentMode()`. The ECG family, the Video family,
the WSI family and the Volume3D family do not, so each one answers `'unknown'`
whenever data is mounted.

`UltrasoundDirectionalTool` shows the cost. Its guard reads:

```ts
if (!(viewport instanceof StackViewport) && !(viewport instanceof ECGViewport)) {
```

An `instanceof` test names one class. It does not extend to a viewport type that
an application registers, and it cannot tell a planar viewport that shows a
stack from one that shows a volume.

Breaks GENVIEW-FAMILY-5 and GENVIEW-API-6.

## Past defects

This section records the defects that the requirements above prevent. A new
defect of the same kind gets a new line here, with the pull request that fixed
it and the requirement that covers it.

No entry yet. The § Known deviations section holds what is open.
