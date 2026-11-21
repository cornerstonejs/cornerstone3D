---
id: upgrade-step-by-step
title: The upgrade, step by step
summary: The ordered steps from Cornerstone3D 5.x to 6.0 - what to search for, what to change, how to check each step and what can go wrong, then the changes that need a decision by a person and the rules for a coding agent
---

# The upgrade, step by step

Follow this page from top to bottom on one application. Each step finds one
kind of legacy code, changes it and ends with a check.

- The call that replaces one legacy name is in
  [Every legacy call and what replaces it](./3-api-map.md). This page gives
  the order and the checks, and each step links to its table.
- What looks or answers differently is in
  [Rendering changes](./2-rendering-changes.md).
- A coding agent reads [For a coding agent](#for-a-coding-agent) first.

**State.** The steps use calls that are in the code, and the removal is in
the code too: on 6.0 the legacy classes, types, settings and helpers are
gone. The viewport types have their plain names, see
[Viewport types](./3-api-map.md#viewport-types).

## Before you start

### Versions

- Go to the latest 5.x first, and finish the
  [5.x migration guides](../5x/index.md). This page starts from there.
- All `@cornerstonejs` packages carry one version number. Upgrade them
  together.

### What to read

1. [Next viewports only](./1-next-viewports-only.md): the model of a next
   viewport.
2. [Changes that need a decision by a person](#changes-that-need-a-decision-by-a-person)
   on this page.
3. Keep [the map](./3-api-map.md) open while you work. Search it for the name
   that your code uses.

### What works on 5.x and what needs 6.0

Most of the work can be done on 5.x, before the version changes. 5.x has both
families of viewports, and one rendering engine can hold legacy viewports and
next viewports side by side.

| What                                                                                                                                               | On 5.x                 | On 6.0  |
| -------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- | ------- |
| The legacy viewport types and the legacy API                                                                                                       | Work                   | Removed |
| `rendering.useGenericViewport: true`: the legacy API on next viewports, through adapters                                                           | Works                  | Removed |
| The next viewport types with `setDisplaySets`, `setDisplaySetPresentation`, `setViewState`, `viewportProjection` and view references               | Work                   | Work    |
| `viewport.getRenderPlan()`, `viewport.isDestroyed`, `viewport.findDataIdByVolumeId()`, and `viewport.calibrateSpacing()` on a next planar viewport | Not there              | Work    |
| `utilities.getSlicesClippingPlanes()`, `utilities.isInAcquisitionPlane()`, `utilities.navigatePlanarViewportToPoint()` of the tools                | Not there              | Work    |
| `utilities.getCurrentVolumeViewportSlice()` for a stack on a next viewport                                                                         | Not there              | Works   |
| The presentation keys `sharpening` and `smoothing`                                                                                                 | Not on a next viewport | Work    |
| Slice first, `setSliceFirst()`, `retryGpu()`, `RENDER_PLAN_CHANGED`                                                                                | Not there              | Work    |
| Zoom and pan of a 3D viewport through `viewportProjection`, and a zoom of a planar viewport about a canvas point with `anchorCanvas`               | Not there              | Work    |
| The view state key `frameRange` of a video viewport, and `loop` of `utilities.scroll` on a next planar viewport                                    | Not there              | Work    |
| The events `VIEWPORT_NEW_IMAGE_SET` and `VOLUME_VIEWPORT_NEW_VOLUME` from a viewport that was made with a next type                                | Do not fire            | Fire    |

So the upgrade has three stages.

1. **A first look, on 5.x.** Set `rendering.useGenericViewport: true` in
   `init`. The application keeps its legacy code and runs on next viewports
   through adapters. Look at every screen. This stage is optional. It is a
   first look and not the final picture: a next viewport of 5.x differs from
   one of 6.0 in each place where
   [Rendering changes](./2-rendering-changes.md) says "In 5.x".
2. **Screen by screen, on 5.x.** Do steps 1 to 11 for one screen, or for one
   viewport, at a time. A screen that is not moved yet keeps running on its
   legacy viewports. A screen that needs a call of the lower rows of the table
   waits for stage 3.
3. **The version.** When no legacy name is left, step 12 changes the version
   to 6.0 and removes the settings.

Do not mix the two APIs on one viewport. A viewport is made with a next type
and uses the next API only, or it is a legacy viewport and uses the legacy API
only.

An application that cannot ship in between does all steps on a branch on 6.0.
There the type checker lists every legacy name as an error.

### List what the application uses

The commands of this page are for `rg` (ripgrep). `src` stands for the folders
of your code. This one counts the main legacy calls in each file:

```sh
rg -c "ViewportType\.(STACK|ORTHOGRAPHIC|PERSPECTIVE)|\.(setStack|setVolumes|addVolumes|setProperties|getProperties|getCamera|setCamera|resetCamera)\(|setVolumesForViewports|instanceof (Stack|Volume)Viewport" src
```

Keep the list. It tells which screens there are, and which one is the
smallest to start with.

### The codemod

The codemod `@cornerstonejs/cornerstone3d-6` does the mechanical part of the
steps below: the renames, and the rewrites that need no knowledge of the
application. Run it from the latest 5.x, on a clean branch, before step 1:

```sh
npx codemod @cornerstonejs/cornerstone3d-6 --dry-run
npx codemod @cornerstonejs/cornerstone3d-6
```

It reads `.ts`, `.tsx` and JavaScript files. It changes code only where the
file shows that it is Cornerstone's: a name bound to an import of
`@cornerstonejs/*`, a viewport got from a rendering engine, an enabled
element or a Cornerstone type, a viewport input or a configuration that
reaches a Cornerstone call. A variable named `viewport` alone puts the site
in the list of what it left. It rewrites a site only when every input has a
shape it fully understands: a viewport or an engine in a `let` or a `var`, a
test of the viewport in another function or of another value, and a member
named in brackets are left to you, in the list. It changes:

- the viewport types (step 1): `STACK` and `ORTHOGRAPHIC` in a viewport input
  become `PLANAR`, with the 5.x default orientation `AXIAL` written out where
  an `ORTHOGRAPHIC` viewport had none, and the `_NEXT` names and `*Next`
  strings get their plain names;
- the types and the class checks (step 2): `Types.IStackViewport` and its kin
  become the class of their family, a cast of `getViewport` becomes its type
  argument, and `instanceof StackViewport` becomes a test of the mode where
  the viewport was mounted before it (an empty viewport has no mode);
- `setStack`, `setVolumes` and `setVolumesForViewports` in their common shape,
  `setVideo` and `setEcg` (step 3): a registered display set and
  `setDisplaySets`, awaited. A call that the code did not wait for is left to
  you: the 5.x call set part of the view before its promise, such as the
  image ids of a stack, and a 6.0 viewport shows nothing before its mount
  ends, so only you know whether the code after it needs `await`;
- `setProperties` of presentation keys after a mount of the same viewport in
  the same function, `resetCamera` and the other members with one fixed call
  (steps 4 to 8 and 10);
- the events that have one event in their place (step 9), the settings
  (step 12) and two moved modules of the tools (step 11).

It writes no comment into the code. At the end it prints two lists. Each
entry names a rule, a file and a line.

- `cornerstone3d-6-manual`: what it left to you, such as a `setVolumes` with a
  `callback`, `getCamera`, a `setProperties` with `slabThickness`, or
  `PERSPECTIVE`. The steps below say what to write.
- `cornerstone3d-6-review`: what it rewrote at a
  [decision by a person](#changes-that-need-a-decision-by-a-person): the
  `AXIAL` orientation it wrote, a `STACK_NEW_IMAGE` listener that now hears
  `NEW_IMAGE` for the slices of a volume too, a `setUseCPURendering` call.

A JavaScript file with JSX is read as a `.jsx` file is, whatever its
extension. The codemod never stops on a file: a file that it cannot analyse
(the tool cannot read it, or a name it looks up is declared twice in one
scope) stays as it is and has one entry in `cornerstone3d-6-manual` at line
1, with a rule that starts with `the file was not analysed:`. Fix the file
and run the codemod again, or do the steps of this page on it by hand.

Two review entries are about a rewrite that is right name by name and still
changes what the code says:

- A rule that starts with
  `ViewportType.PLANAR: one function returned STACK and ORTHOGRAPHIC`. A
  function returned `STACK` on one path and `ORTHOGRAPHIC` on another, and
  returns `PLANAR` on both now. The entry names the line of the function.
  Read its callers. Where the answer is the `type` of a viewport input,
  there is nothing to do. Where the application stores it or compares it to
  tell a stack from a volume, the answer is lost: give the application its
  own values for the shape of its data, and ask `viewport.getCurrentMode()`
  for a live viewport ([step 1](#step-1-the-viewport-types)).
- A rule such as
  `ViewportType.VOLUME_3D: two operands of one || are the same now`, also
  for `&&`, for two `case` labels of one `switch`, for two entries of a list
  used with `includes`, and for a renamed class such as `VolumeViewport3D`.
  Two tests that named a legacy and a next name in 5.x, such as
  `type === VOLUME_3D || type === VOLUME_3D_NEXT`, are one test now. The
  entry names the line of the second one. Where the code meant "any 3D
  viewport", delete one of the two. Where it told a legacy viewport from a
  next one, the test is true for every viewport of that type in 6.0: delete
  the branch for the legacy viewport, and read the other tests of that type
  near it ([Viewport types](./3-api-map.md#viewport-types)). Of two equal
  `case` labels only the first runs.

Then run your formatter and your type checker, and do the steps of this page:
their searches find what is left. On the 5.x examples of this repository the
codemod rewrote almost two of three uses of a removed name, rewrote none
wrongly, and reported every one it left. Its
[README](https://github.com/cornerstonejs/cornerstone3D/blob/main/packages/codemods/registry/cornerstone3d/6/README.md)
lists each package with what it changes and what it reports.

## Step 1. The viewport types

**Search**

```sh
rg -n "ViewportType\.(STACK|ORTHOGRAPHIC|PERSPECTIVE|VOLUME_3D|VIDEO|WHOLE_SLIDE|ECG)\b" src
rg -n "type: *['\"](stack|orthographic|perspective|volume3d|video|wholeSlide|ecg)['\"]" src
```

**Change.** Each legacy type has one next type.
[Viewport types](./3-api-map.md#viewport-types) has the table.

Before:

```ts
renderingEngine.enableElement({
  viewportId,
  element,
  type: Enums.ViewportType.ORTHOGRAPHIC,
});
```

After:

```ts
renderingEngine.enableElement({
  viewportId,
  element,
  type: Enums.ViewportType.PLANAR,
  defaultOptions: { orientation: Enums.OrientationAxis.AXIAL },
});
```

On 5.x the planar type is `ViewportType.PLANAR_NEXT`. On 6.0 it is
`ViewportType.PLANAR`, and `PLANAR_NEXT` is its deprecated alias, so code
written on 5.x with `PLANAR_NEXT` runs on 6.0 too.

**Check.** `viewport.type` is `'planar'` on 6.0 (`'planarNext'` on 5.x), and
`viewport.getCurrentMode()` is `'empty'` until step 3 shows data.

**What can go wrong**

- A legacy `ORTHOGRAPHIC` viewport without options opened in `AXIAL`. A planar
  viewport without an orientation opens a volume in its acquisition plane. So
  pass the orientation, as above.
- A viewport for a stack gets no orientation.
- `PERSPECTIVE` becomes `VOLUME_3D` with
  `defaultOptions: { parallelProjection: false }`. The legacy type drew a
  slice, and the new one draws the volume in 3D. This needs
  [a decision](#changes-that-need-a-decision-by-a-person).
- A viewport of a next type has no legacy members. Its screen runs again when
  steps 2 to 8 are done for it.
- An application can use `ViewportType.STACK` and `ORTHOGRAPHIC` as its own
  marker of the data: it stores the value in its state and compares it later
  to tell a stack from a volume. Both are `PLANAR` now, so the marker says
  nothing, and the codemod also rewrites the function that makes it (a
  function that returned `STACK` or `ORTHOGRAPHIC` returns `PLANAR` on both
  paths). Give the application its own values for the shape of its data, and
  ask `viewport.getCurrentMode()` for a live viewport.

## Step 2. Class checks and TypeScript types

**Search**

```sh
rg -n "instanceof (StackViewport|VolumeViewport|BaseVolumeViewport|VolumeViewport3D|VideoViewport|WSIViewport|ECGViewport)\b" src
rg -n "\b(IStackViewport|IVolumeViewport|IBaseVolumeViewport|IVideoViewport|IWSIViewport|IECGViewport|IGenericViewport|isGenericViewport)\b" src
rg -n "\b(ViewportProperties|StackViewportProperties|VolumeViewportProperties|VideoViewportProperties|WSIViewportProperties|ECGViewportProperties|IVolumeInput|VolumeInputCallback|SetAspectRatioOptions|ImageSetOptions)\b" src
rg -n "enabledElement\.viewport|\.getViewport\(|\.getViewports\(" src
rg -n "\.type *[!=]==? *(Enums\.)?ViewportType\." src
rg -n "viewportSupports(Stack|Volume)Compatibility|requestedType" src
rg -n "'(setStack|setVolumes|setVideo|setWSI|setEcg)' in |\.type *[!=]==? *['\"](stack|orthographic|perspective)['\"]" src
```

**Change.** Ask what the viewport shows, not which class it is.

Before:

```ts
if (viewport instanceof StackViewport) {
  showStackControls();
}
```

After:

```ts
const viewport = renderingEngine.getViewport<PlanarViewport>(viewportId);

if (viewport.getCurrentMode() === 'stack') {
  showStackControls();
}
```

For a viewport of any family, `utilities.getViewportContentMode(viewport)`
returns `'stack'`, `'volume'`, `'volume3d'`, `'video'`, `'wholeSlide'`, `'ecg'`
or `'empty'`.

**The types.** `Types.IViewport` is the interface of a viewport of any
family: the members that every family has. `getEnabledElement(element).viewport`,
`renderingEngine.getViewport(viewportId)` and each viewport of
`renderingEngine.getViewports()` are typed with it. The members of a family
are on its class: type a planar viewport as `PlanarViewport`, a 3D viewport
as `VolumeViewport3D`, and so on (on 5.x the next 3D class is exported as
`GenericVolumeViewport3D`, which 6.0 keeps as a deprecated alias).
`Types.IStackViewport`, `Types.IVolumeViewport`, `Types.IBaseVolumeViewport`,
`Types.IVideoViewport`, `Types.IWSIViewport` and `Types.IECGViewport` are
gone, and so are the `*ViewportProperties` types. `Types.IGenericViewport` and
`utilities.isGenericViewport` are deprecated: replace the first with
`Types.IViewport`, and drop the second, keeping its true branch.
[Classes and TypeScript types](./3-api-map.md#classes-and-typescript-types)
has every type.

Before:

```ts
const { viewport } = getEnabledElement(element) as {
  viewport: Types.IStackViewport;
};
const imageId = viewport.getCurrentImageId();
```

After:

```ts
const viewport = renderingEngine.getViewport<PlanarViewport>(viewportId);
const imageId = viewport.getCurrentImageId();
```

Or, where the code gets the viewport from the element:

```ts
const { viewport } = getEnabledElement(element);

if (utilities.viewportSupportsImageSlices(viewport)) {
  const imageId = viewport.getCurrentImageId();
}
```

**Check.** Run the type checker. With the viewport typed as `PlanarViewport`,
each legacy member that the code still calls on it is an error. These errors
are the work list of steps 3 to 8.

**What can go wrong**

- A planar viewport can change its mode. `setDisplaySets` with another display
  set turns a stack into a volume. Ask for the mode when you need it, and do
  not store it.
- `utilities.viewportIsInVolumeMode(viewport)` is true for a 3D viewport too.
- A check for a member, such as `'setStack' in viewport` or
  `'setVolumes' in viewport`, is false for every 6.0 viewport, and a check
  `viewport.type === 'stack'` with a string is false too. Neither fails: the
  code takes its other branch for every viewport. The last search of the
  step finds both kinds. Ask for the mode in their place.
- An optional call of a removed member, such as
  `viewport.getAllVolumeIds?.()`, `viewport?.getBlendMode?.() === 1` or a
  guard `if (!viewport?.getCamera) return`, does not fail either. It gives
  `undefined` for every viewport, in JavaScript and in TypeScript on a
  viewport without a type, so the code behind it never runs. The codemod
  reports each removed name: read every reported optional call, and do not
  take a screen that still opens as proof that it still does its work.
- `utilities.getViewportContentMode(viewport)` says `'empty'` before the
  mount. A guard that ran before `setStack` and asked whether the viewport
  can take a stack has no twin: drop it.
- The guards `utilities.viewportSupportsImageSlices`,
  `utilities.viewportSupportsVolumeId` and the like test which members a
  viewport has. A planar viewport has them all in both modes, so they do not
  tell a stack from a volume.
- A function of the library that works on any viewport, such as
  `utilities.scroll`, takes a `Types.IViewport`, so a variable typed as
  `PlanarViewport` or as the class of another family goes in with no cast.
  A function that reads planar members takes `PlanarViewport`:
  [The type of a viewport in 6.0](./3-api-map.md#the-type-of-a-viewport-in-60)
  lists them and says what to write.
- A tool of the application that reads a member of a family from
  `enabledElement.viewport` gets a compile error now. Narrow it or ask for
  the class, as above. In JavaScript nothing changes: a call of a planar
  member on a 3D viewport fails at run time, as in 5.x.

## Step 3. The data

**Search**

```sh
rg -n "\.(setStack|setVolumes|addVolumes|removeVolumeActors|addImages|setVideo|setWSI|setEcg|setDataIds|setDataList)\(" src
rg -n "setVolumesForViewports|addVolumesToViewports|convertStackToVolumeViewport|convertVolumeToStackViewport" src
```

**Change.** Register each series once as a display set, under an id that the
application chooses. Then show it by its id.

The id names the data, such as the series instance UID. Give another series
another id: when the new source of a viewport has the id of the source it
shows, `setDisplaySets` keeps the segmentation overlays of that source. The
registration is global, so an application with two rendering engines whose
viewports share ids puts the engine in the id too, in a form that keeps the
parts apart: joined with `:`, engine `a:b` with viewport `c` and engine `a`
with viewport `b:c` give one id, and the second registration replaces the
first. The codemod registers a stack under the JSON of the three parts, one
registration for each engine, viewport and series:

```ts
const displaySetId = JSON.stringify([
  viewport.renderingEngineId,
  viewport.id,
  imageIds[0],
]);
```

[A display set is registered once](./1-next-viewports-only.md#a-display-set-is-registered-once)
says what each family registers, and how a fusion is shown.

For a stack.

Before:

```ts
await viewport.setStack(imageIds, 0);
```

After:

```ts
utilities.genericViewportDisplaySetMetadataProvider.add(displaySetId, {
  kind: 'planar',
  imageIds,
  initialImageIdIndex: 0,
});

await viewport.setDisplaySets({ displaySetId });
```

For a volume.

Before:

```ts
await viewport.setVolumes([{ volumeId }]);
```

After:

```ts
utilities.genericViewportDisplaySetMetadataProvider.add(displaySetId, {
  kind: 'planar',
  imageIds,
  volumeId,
});

await viewport.setDisplaySets({
  displaySetId,
  options: { orientation: Enums.OrientationAxis.AXIAL },
});
```

The viewport takes the volume from the cache. When the volume is not there,
the viewport makes it from the image ids and starts its load.

`setVolumesForViewports` becomes a loop over the viewports. Find and check
every viewport first, as the 5.x helper did, so that a missing one, or one
that cannot show a volume (5.x took only viewports with `setVolumes`),
changes none:

```ts
const viewports = viewportIds.map((viewportId) => {
  const viewport = renderingEngine.getViewport(viewportId);

  if (!viewport) {
    throw new Error(`No viewport ${viewportId}`);
  }

  if (
    viewport.type !== Enums.ViewportType.PLANAR &&
    viewport.type !== Enums.ViewportType.VOLUME_3D
  ) {
    throw new Error(`Viewport ${viewportId} cannot show a volume`);
  }

  return viewport;
});

await Promise.all(
  viewports.map((viewport) => viewport.setDisplaySets({ displaySetId }))
);
```

**Check.** `viewport.getCurrentMode()` is `'stack'` or `'volume'`.
`viewport.getDisplaySets()` lists the ids, the source first. The picture
shows. On 6.0 `VIEWPORT_NEW_IMAGE_SET` fires for a stack and
`VOLUME_VIEWPORT_NEW_VOLUME` for a volume.

**What can go wrong**

- A display set with a `volumeId` shows as a volume. Without it the same
  images show as a stack. Leave `volumeId` out for a stack.
- A stack that is asked for an orientation other than its acquisition plane
  shows as a volume when its images form one. The mount throws when they do
  not. Ask `viewport.canRenderOrientation(orientation)` first.
- `setDisplaySets` replaces everything that the viewport shows, also a
  surface that a segmentation mounted before it.
  `viewport.addDisplaySet(displaySetId, { role: 'overlay' })` adds one display
  set, and `viewport.removeData(displaySetId)` removes one.
- Wait for `setDisplaySets` before code that reads the view, that sets a tool
  active which reads it, that adds a Surface representation, or that should
  not see the first `NEW_IMAGE`. Legacy code often did not wait for
  `setVolumes` or `setVolumesForViewports`: a legacy volume viewport had a
  camera before its data, and a next viewport has no view before its mount.
- Two viewports that show one stack at two first images, as
  `setStack(imageIds)` and `setStack(imageIds, 50)` did, share one
  registration: call `await viewport.setImageIdIndex(50)` after
  `setDisplaySets` on the second viewport.
- `addVolumes` of a volume that the viewport showed already made a new actor
  with the look of its callback. `addDisplaySet` of a display set that is
  mounted keeps its presentation. For the look of the callback again call
  `resetDisplaySetPresentation(displaySetId)`, then
  `setDisplaySetPresentation`.
- `convertStackToVolumeViewport` kept the view (the view presentation and
  the view reference), and `convertVolumeToStackViewport` kept the view
  reference. Read them before `setDisplaySets` and set them after it. Both
  took a `background`, which a next viewport takes only at `enableElement`:
  a new background needs the element enabled again, which takes the
  viewport out of its tool group. Code that asked `viewport.type` after them
  asks `viewport.getCurrentMode()`.
- An input of the legacy calls could carry a `callback`, an `actorUID`, a
  `blendMode`, a `slabThickness` and a `visibility`. A display set has none of
  them. They are keys of the presentation, which is step 4.
- `addVolumes` hid the added volume unless its `visibility` was true. An added
  display set is visible.
- `setVolumes` threw when the volumes did not share a frame of reference.
  `setDisplaySets` does not check it.

## Step 4. The look of the data

**Search**

```sh
rg -n "\.(setProperties|getProperties|resetProperties|setDefaultProperties|getDefaultProperties|clearDefaultProperties|resetToDefaultProperties)\(" src
rg -n "\.(setBlendMode|getBlendMode|setSlabThickness|getSlabThickness|resetSlabThickness|setSampleDistanceMultiplier|setVOI|setWindowLevel|setAverageWhite|unsetColormap)\(" src
rg -n "\bVOILUTFunction\b|isComputedVOI|callback:|actorUID" src
```

**Change.** The look of one display set is its presentation.
[The keys of setProperties](./3-api-map.md#the-keys-of-setproperties) has the
key for each legacy key.

Before:

```ts
viewport.setProperties({
  voiRange: { lower: -160, upper: 240 },
  invert: true,
});

const { voiRange } = viewport.getProperties();

viewport.setSlabThickness(10);
```

After:

```ts
viewport.setDisplaySetPresentation(displaySetId, {
  voiRange: { lower: -160, upper: 240 },
  invert: true,
});

const voiRange =
  viewport.getDisplaySetPresentation(displaySetId)?.voiRange ??
  viewport.getDefaultVOIRange(displaySetId);

viewport.setDisplaySetPresentation(displaySetId, { slabThickness: 10 });
```

**Check.** `VOI_MODIFIED` fires on the element when the window or the invert
changes. `viewport.getDisplaySetPresentation(displaySetId)` returns the keys
that were set.

**What can go wrong**

- A presentation is what was set. A key that was never set is undefined, where
  `getProperties()` read the value back from the actor. The window that the
  data starts with is `viewport.getDefaultVOIRange(displaySetId)`.
- The key is `voiLUTFunction`, with a lower case `voi`. The legacy key and the
  detail of `VOI_MODIFIED` spell it `VOILUTFunction`.
- There are no default properties. The application keeps its own default and
  sets it.
- `resetDisplaySetPresentation(displaySetId)` does not move the camera, and it
  also clears the slab, the blend mode, the opacity and the visibility.
- A slab is set for each display set. The legacy `setSlabThickness` set all
  actors, so a fusion needs one call for each display set.
- A preset is a look of a 3D viewport. On a slice use
  `colormap: { name, opacityMapping }`.
- Do not edit an actor to set a look. The next presentation update writes the
  look of the actor again.

## Step 5. The view

**Search**

```sh
rg -n "\.(getCamera|setCamera|resetCamera|getViewPresentation|setViewPresentation|flip)\(" src
rg -n "\.(getZoom|setZoom|getPan|setPan|setDisplayArea|getDisplayArea|setAspectRatio|getAspectRatio|setOptions)\(" src
rg -n "storeAsInitialCamera|resetToCenter|resetAspectRatio|parallelScale" src
```

**Change.** A change of the look of the view is a view state change. Zoom and
pan are read and written through `viewportProjection`.

Before:

```ts
viewport.setZoom(viewport.getZoom() * 1.2);
viewport.setCamera({ flipHorizontal: true });
viewport.resetCamera();
```

After:

```ts
const presentation = viewportProjection.getPresentation(viewport, {
  selector: { zoom: true, pan: true },
});
const zoomed = viewportProjection.withPresentation(viewport, {
  zoom: (presentation?.zoom ?? 1) * 1.2,
});

if (zoomed) {
  viewport.setViewState(zoomed);
}

viewport.setViewState({ flipHorizontal: true });
viewport.resetViewState();
```

To zoom about a canvas point, give it as the fourth argument:
`viewportProjection.withPresentation(viewport, { zoom }, undefined, { anchorCanvas: canvasPoint })`.
Without it the zoom is about the centre of the canvas, also after a pan, as
the legacy `setZoom(zoom)` was. `setZoom(zoom)` of a planar viewport without
a canvas point is too.

To read a camera in the legacy shape, use
`viewport.getResolvedView()?.toICamera()`. It is for reading only.

**Check.** `CAMERA_MODIFIED` fires on each change. After `resetViewState()`
the presentation gives zoom 1 and pan `[0, 0]`.

**What can go wrong**

- `withPresentation` returns undefined while the viewport has no data. Check
  the result before `setViewState`.
- Zoom 1 and pan `[0, 0]` are always the fit. There is no stored initial
  camera, so `storeAsInitialCamera` and `resetToCenter` have no twin.
- A planar, a video and an ECG viewport still have `getZoom`, `setZoom`,
  `getPan` and `setPan` from 5.x. The second argument of `setZoom` is a canvas
  point there, not `storeAsInitialCamera`. On a legacy video viewport
  `setZoom` did not zoom and `getZoom` always gave 1; a video viewport now
  zooms. New code uses `viewportProjection`.
- A 3D viewport has none of the four members, and a whole slide viewport has
  no `getPan` and no `setPan`. Use `viewportProjection` there, as in the
  sample above.
- The `pan` of a presentation is in canvas pixels at zoom 1. The legacy
  `getPan()` gave canvas pixels on the screen, which is `pan * zoom`. So a
  value that went to `setPan` is divided by the zoom.
- The zoom of a 3D viewport is measured against the fit for the direction of
  the camera now. The zoom of a whole slide viewport in `viewportProjection`
  is a factor against the fit too; its `getZoom()` and `setZoom()` keep the
  zoom level of the map.
- `resetViewState()` keeps the slice. It takes
  `{ resetPan, resetZoom, resetOrientation, resetFlip }`, and each defaults
  to true.
- A camera that was set to move through slices is step 6.
- A display area in the options of a viewport is not applied by itself. Call
  `viewport.setViewState({ displayArea })` after the mount. `getDisplayArea()`
  reads the view state only; code that read the option back through it reads
  `viewport.defaultOptions.displayArea`.
- A stretch is `viewport.setViewState({ scale: [x, y] })`. `getAspectRatio()`
  of a planar viewport reads it back as the pair divided by its smaller
  number, as in 5.x. The legacy `setAspectRatio([w, h], { fit: true })` is
  `viewport.setViewState({ scale: [w / h, 1], scaleMode: 'fitAspect' })`.
- `setCamera({ viewPlaneNormal, viewUp })` becomes
  `viewport.setViewState({ orientation: { viewPlaneNormal, viewUp } })`, and
  `setCamera({ focalPoint, viewPlaneNormal, viewUp })` in one call becomes
  that, then `viewport.setViewReference({ cameraFocalPoint: focalPoint })`,
  then `viewport.scroll(0)`. A copy of the camera of another viewport is in
  [A copy of the view between viewports](./2-rendering-changes.md#a-copy-of-the-view-between-viewports).

## Step 6. Slices, orientation and references

**Search**

```sh
rg -n "\.(jumpToWorld|setOrientation|setBestOrentation|setViewPlane|setImageIdIndex|scroll|getTargetImageIdIndex|getSliceIndexForImage)\(" src
rg -n "utilities\.(scroll|jumpToSlice)|debounceLoading|scrollSlabs|focalPoint" src
```

**Change.** A move to a place in space is a view reference. A move by index
is `setImageIdIndex` or `scroll`.

Before:

```ts
volumeViewport.setCamera({ focalPoint, position });
volumeViewport.jumpToWorld(point);
```

After:

```ts
viewport.setViewReference({ cameraFocalPoint: point });
```

That call is for a volume. For code that can meet a stack and a volume, the
tools have one call for both modes:

```ts
import { utilities as csToolsUtilities } from '@cornerstonejs/tools';

csToolsUtilities.navigatePlanarViewportToPoint(viewport, point);
```

Without the tools, a stack goes to the image closest to the point. The index
is `null` for a stack without images:

```ts
const sliceIndex = utilities.getClosestStackImageIndexForPoint(point, viewport);

if (sliceIndex !== null) {
  viewport.setViewReference({ sliceIndex });
}
```

These calls keep their names and work in both modes:
`viewport.setImageIdIndex(index)`, `viewport.scroll(delta)`,
`viewport.getCurrentImageIdIndex()`, `viewport.getNumberOfSlices()`,
`utilities.scroll(viewport, { delta })` and
`utilities.jumpToSlice(element, { imageIndex })`.

**Check.** `viewport.getCurrentImageIdIndex()` gives the new index.
`NEW_IMAGE` fires after another image or slice shows, with that index in
`detail.imageIdIndex`.

**What can go wrong**

- A volume shows whole slices. After a jump to a world point the focal point
  can differ from the point by up to half a slice spacing. See
  [A volume slice sits on a slice centre](./2-rendering-changes.md#a-volume-slice-sits-on-a-slice-centre).
- `setOrientation` keeps the point in view, the pan and the zoom. The legacy
  volume viewport reset its camera. Give both vectors when you pass vectors:
  without a `viewUp` the view takes the view up of the acquisition, and a
  `viewUp` that is not orthogonal to the normal throws.
- A stack has one orientation. `setOrientation` changes nothing on a stack
  and does not throw. Ask `viewport.canRenderOrientation(orientation)` before
  the call.
- `viewport.scroll(1)` steps by one slice, also with a slab, and it takes the
  delta only. Pass `scrollSlabs: true` to `utilities.scroll` to step by the
  slab, and `loop: true` to wrap at the ends.
- `setImageIdIndex` clamps an index that is out of range. It does not throw.
- `getCurrentImageId()` takes no index: use `viewport.getImageIds()[index]`.
  For a volume it is undefined on a plane that is not the acquisition plane.
- `getTargetImageIdIndex()` is gone. `getCurrentImageIdIndex()` gives the
  requested index at once.

## Step 7. Questions about the data

**Search**

```sh
rg -n "\.(getBounds|getIntensityFromWorld|getSliceViewInfo|getSliceInfo|getCurrentSlicePixelData|getSlicesClippingPlanes|getSlicePlaneCoordinates|isInAcquisitionPlane|getCornerstoneImage|getAllVolumeIds|getImageDataMetadata|getImagePlaneReferenceData|isOrientationChangeable)\(" src
rg -n "\.(modality|scaling|isDisabled|stackActorReInitialized|useCPURendering|suppressEvents)\b" src
rg -n "getImageLegacy" src
```

**Change.** A question that the state and the data can answer is a function
that takes the viewport, or a read of `viewport.getImageData()`. Each one
answers for a stack and for a volume. The rows are in
[Members of the stack and the volume viewport](./3-api-map.md#members-of-the-stack-and-the-volume-viewport),
[Members of the stack viewport only](./3-api-map.md#members-of-the-stack-viewport-only)
and
[Members of the volume viewport only](./3-api-map.md#members-of-the-volume-viewport-only).

Before:

```ts
const bounds = viewport.getBounds();
const value = viewport.getIntensityFromWorld(point);
const inPlane = viewport.isInAcquisitionPlane();
const image = viewport.getCornerstoneImage();
```

After:

```ts
const data = viewport.getImageData();

if (!data) {
  return;
}

const { imageData, voxelManager } = data;
const bounds = imageData.getBounds?.();
const value = voxelManager?.getAtIJKPoint(
  utilities.transformWorldToIndex(imageData, point)
);
const inPlane = utilities.isInAcquisitionPlane(viewport);
const imageId = viewport.getCurrentImageId();
const image = imageId ? cache.getImage(imageId) : undefined;
```

**Check.** Show the same series once as a stack and once as a volume in its
acquisition orientation, on the same slice. Both give the same value at a
point of that slice.

**What can go wrong**

- `getImageData()` returns undefined while nothing is shown. Guard it before
  you read `imageData`.
- `getImageData().imageData` of a stack is a plain object, not a vtk.js image
  data. It has `getBounds`, `getDimensions`, `getSpacing`, `getDirection`,
  `worldToIndex` and `indexToWorld`. Its type declares `getBounds` optional,
  so with `strictNullChecks` the sample calls it with `?.`.
- `utilities.getCurrentVolumeViewportSlice(viewport)` throws for an oblique
  and for a rotated view.
- `cache.getImage(viewport.getCurrentImageId())` gives an image for a volume
  only in its acquisition orientation. On another plane the id is undefined
  and `cache.getImage(undefined)` throws, so check the id, as above.
- `viewport.getVolumeId()` is undefined in stack mode, where no volume is
  mounted, and `cache.getVolume(undefined)` throws, so check the id. The next
  viewport of 5.x gave the id that the images would get as a volume there.
- The search for `.modality` and `.scaling` also finds display sets and
  images of the application. Change only the reads on a viewport.

## Step 8. Actors, the renderer and widgets

**Search**

```sh
rg -n "\.(getActor|getActorByIndex|getActorUIDs|getActorUIDByIndex|getImageActor|getDefaultActor|getActors|addActor|addActors|setActors|removeActors|removeAllActors|getRenderer|addWidget|getWidget|getWidgets|removeWidgets)\(" src
rg -n "_actors" src
```

**Change.** Most code that reads an actor wants to set a look. Set the look
through the presentation.

Before:

```ts
const { actor } = viewport.getDefaultActor();

actor.getProperty().setInterpolationTypeToNearest();
```

After:

```ts
viewport.setDisplaySetPresentation(displaySetId, {
  interpolationType: Enums.InterpolationType.NEAREST,
});
```

`viewport.getActors()` still lists the actor entries of a planar and a 3D
viewport, and each entry names its data in `referencedId`.

A surface in a 3D viewport is a display set. Its id is the id of a geometry
of the cache, and its look is its presentation.

Before:

```ts
viewport.addActor({ uid: geometryId, actor });
```

After:

```ts
await viewport.addDisplaySet(geometryId, { renderMode: 'vtkGeometry3d' });

viewport.setDisplaySetPresentation(geometryId, {
  color: [255, 0, 0],
  opacity: 0.5,
});
```

**Check.** The look stays after a change of the window. A surface shows in
the 3D viewport, and `viewport.getActors()` has an entry whose `referencedId`
is its geometry id.

**What can go wrong**

- On a slice the actors are image slice actors, not vtk.js volumes. Code that
  calls methods of a volume mapper on them fails.
- A planar viewport and a 3D viewport have `getRenderer()`. A vtk.js prop of a
  tool or of the application goes into the scene with
  `viewport.getRenderer().addActor(actor)` and out with
  `viewport.getRenderer().removeActor(actor)`, each followed by
  `viewport.render()`. Its owner keeps it: `viewport.getActors()` does not
  list it. This replaces `addActor`, `addActors`, `setActors` and
  `removeActors` of a legacy stack or volume viewport for a prop that is not
  data.
- On a planar viewport, in both modes, the prop is drawn with the slice on the
  GPU and follows a zoom, a pan and a scroll. A prop behind the slice is
  hidden by it. The viewport does not clip a prop to its slab. The CPU path
  does not draw the renderer: the prop does not show, and the viewport warns
  once.
- A view that shows only props, as the stack viewport of the CPR example did,
  is a `VOLUME_3D` viewport: a planar viewport draws nothing without a
  display set.
- A 3D viewport has no `addActor`, `addActors`, `setActors`, `removeActors`
  and `getActor`. [The 3D viewport](./3-api-map.md#the-3d-viewport) has the
  call for each one.
- A reset fits a visible surface that reaches outside the volume. The legacy
  viewport fitted the volume only.
- Widgets are on a planar and on a 3D viewport:
  `viewport.addWidget(widgetId, widget)`, `viewport.getWidgets()`. No next
  viewport has `getWidget`: keep your own reference to a widget that you add.

## Step 9. Events

**Search**

```sh
rg -n "STACK_NEW_IMAGE|VOLUME_NEW_IMAGE|PRE_STACK_NEW_IMAGE|STACK_VIEWPORT_SCROLL|IMAGE_LOAD_ERROR|PRESET_MODIFIED|ACTORS_CHANGED|CLIPPING_PLANES_UPDATED|DYNAMIC_VOLUME_TIME_POINT" src
rg -n "CAMERA_MODIFIED|CAMERA_RESET|VOI_MODIFIED|IMAGE_SPACING_CALIBRATED|STACK_SCROLL_OUT_OF_BOUNDS|VOLUME_VIEWPORT_SCROLL" src
rg -n "invertStateChanged|previousCamera" src
```

**Change.** The first command finds events that a next viewport does not
fire. [Events](./3-api-map.md#events) names the event to listen to in place
of each. The second command finds events that stay and fire at other times.
Read each listener.

`STACK_NEW_IMAGE` and `VOLUME_NEW_IMAGE` are one event now, `NEW_IMAGE`,
with one detail for a stack, a volume and a video. A listener for stacks and
a listener for volumes become one listener. Its event type is
`Types.EventTypes.NewImageEvent`, and the type of the detail is
`Types.EventTypes.NewImageEventDetail`:

| Old detail                           | Detail of `NEW_IMAGE`   | What it is                                                                      |
| ------------------------------------ | ----------------------- | ------------------------------------------------------------------------------- |
| `imageIdIndex` of the stack event    | `detail.imageIdIndex`   | The index of the image in a stack, the slice index of the view of a volume      |
| `imageIndex` of the volume event     | `detail.imageIdIndex`   | The same key in both modes. `viewport.getCurrentImageIdIndex()` gives the value |
| `numberOfSlices` of the volume event | `detail.numberOfSlices` | Now in stack mode too. `viewport.getNumberOfSlices()` gives the value           |
| `imageId` of the stack event         | `detail.imageId`        | `viewport.getCurrentImageId()`. Undefined for a cut that shows no single image  |
| `image` of the stack event           | `detail.image`          | The image object in stack mode. Undefined in volume mode and on a video         |

Before:

```ts
element.addEventListener(Enums.Events.STACK_NEW_IMAGE, onNewImage);
element.addEventListener(Enums.Events.VOLUME_NEW_IMAGE, onNewImage);
eventTarget.addEventListener(Enums.Events.IMAGE_LOAD_ERROR, onLoadError);
```

After:

```ts
element.addEventListener(Enums.Events.NEW_IMAGE, onNewImage);

eventTarget.addEventListener(Enums.Events.IMAGE_LOAD_FAILED, (evt) => {
  const { imageId, error } = evt.detail;

  onLoadError(imageId, error);
});
```

**Check.** Log each event that the application listens to, on a stack and on
a volume: scroll, change the window, reset. Compare with the table.

**What can go wrong**

- `STACK_NEW_IMAGE` and `VOLUME_NEW_IMAGE` are gone from `Enums.Events`, so
  a listener of them is a compile error. Listen to `NEW_IMAGE`. A listener
  that names the event by its string compiles and never runs.
- `NEW_IMAGE` fires in both modes. A listener that came from
  `STACK_NEW_IMAGE` now also runs for each slice of a volume, where
  `detail.image` is undefined.
- `CAMERA_MODIFIED` fires on each new image of a stack and once after the
  source mounts. `detail.previousCamera` can be undefined.
- `CAMERA_RESET` fires in stack mode too, and only from `resetViewState()`.
- A change of `slabThickness` in the presentation of a planar viewport
  fires `CAMERA_MODIFIED`, as a slab change of the legacy volume viewport
  did. Read the slab from the presentation.
- `detail.invertStateChanged` of `VOI_MODIFIED` is not set by a next
  viewport. Compare `detail.invert` with the last value.
- `IMAGE_LOAD_FAILED` fires on the `eventTarget`, as `IMAGE_LOAD_ERROR` did.
  Its detail has no image index and no viewport id, and it also fires for a
  prefetch that fails.
- `PRE_STACK_NEW_IMAGE`, `STACK_VIEWPORT_SCROLL`, `PRESET_MODIFIED`,
  `ACTORS_CHANGED`, `CLIPPING_PLANES_UPDATED`,
  `DYNAMIC_VOLUME_TIME_POINT_INDEX_CHANGED` and
  `DYNAMIC_VOLUME_TIME_POINT_LOADED` are gone from `Enums.Events` too, with
  their detail types (`Types.EventTypes.ActorsChangedEvent` and
  `ActorsChangedEventDetail`), so a listener of one no longer compiles.
- `STACK_SCROLL_OUT_OF_BOUNDS` fires in stack mode only, as on the legacy
  stack viewport. In volume mode `utilities.scroll` fires
  `VOLUME_VIEWPORT_SCROLL` and `VOLUME_VIEWPORT_SCROLL_OUT_OF_BOUNDS` with
  the detail of the legacy volume viewport. Without a `volumeId` in the
  scroll options, `detail.volumeId` is the volume that the viewport shows,
  where 5.x gave `undefined`. `currentImageId` is optional in
  `Types.EventTypes.VolumeScrollOutOfBoundsEventDetail` now: it is
  `undefined` out of the acquisition plane, as in 5.x, so a typed listener
  checks it before it reads it.
- In volume mode `detail.imageIdIndex` of `NEW_IMAGE` is the slice index of
  the view. It can run against the order of the image ids, so it is not the
  place of `detail.imageId` in `viewport.getImageIds()`.
- On a video the detail of `NEW_IMAGE` has no `time` and no `duration`. Read
  `viewport.getCurrentTime()`.
- `IMAGE_SPACING_CALIBRATED` fires from `viewport.calibrateSpacing(imageId)`
  only, not when a calibrated image shows.

## Step 10. Video, whole slide and ECG viewports

**Search**

```sh
rg -n "\.(setVideo|setWSI|setEcg|togglePlayPause|setScrollSpeed|setTime|setFrameRange|getFrameRange|setPlaybackRate|setChannelVisibility|getMiddleSliceData)\(" src
```

**Change.** The rows are in [The video viewport](./3-api-map.md#the-video-viewport),
[The whole slide viewport](./3-api-map.md#the-whole-slide-viewport) and
[The ECG viewport](./3-api-map.md#the-ecg-viewport).

Before:

```ts
await viewport.setVideo(imageId, 1);
viewport.togglePlayPause();
viewport.setFrameRange([5, 10]);
```

After:

```ts
await viewport.setDisplaySets({
  displaySetId: imageId,
  options: { frameNumber: 1 },
});

if (viewport.isPlaying()) {
  viewport.pause();
} else {
  viewport.play();
}

viewport.setViewState({ frameRange: [5, 10] });
```

A whole slide is registered with its web client:

```ts
utilities.genericViewportDisplaySetMetadataProvider.add(displaySetId, {
  kind: 'wsi',
  imageIds,
  options: { webClient },
});

await viewport.setDisplaySets({ displaySetId });
```

**Check.** The video opens on its first frame and does not play by itself.
The slide opens at the view that fits the canvas. The ECG shows its trace.

**What can go wrong**

- `setPlaybackRate()` sets the rate only. It does not start playback.
- `viewport.getViewState().frameRange` is undefined for the whole video,
  where `getFrameRange()` gave `[1, numberOfFrames]`. A change of the range
  fires `CAMERA_MODIFIED`.
- The rotation of a whole slide viewport is in degrees.
- A whole slide viewport has no `scroll()`, no `getPan()`, no `setPan()` and
  no `getCanvas()`. The legacy `scroll()` zoomed: use
  `viewport.setZoom(zoom)`, and put the zoom tool on the wheel where the
  stack scroll tool was. For the pan see step 5.
- An ECG viewport has no `getNumberOfSlices()`. An ECG is one record.
- The default trace layout of an ECG differs from the legacy viewport. Set
  `traceLayout` for the layout that you want.
- See [Whole slide viewports](./2-rendering-changes.md#whole-slide-viewports),
  [ECG viewports](./2-rendering-changes.md#ecg-viewports) and
  [Video viewports](./2-rendering-changes.md#video-viewports) for what
  answers differently.

## Step 11. Tools and synchronizers

**Search**

```sh
rg -n "CrosshairsTool|StackScrollTool|createSlabThicknessSynchronizer|fillAlpha" src
```

**Change.** The tools work on the next viewports, and most code that adds
tools to a tool group needs no change.
[What changes in the tools package](./3-api-map.md#what-changes-in-the-tools-package)
has the rows. Four need work:

- **Crosshairs.** `WorldCrosshairTool` with `SliceIntersectionTool` is the
  crosshair for the next viewports. `CrosshairsTool` still works on a planar
  viewport in volume mode: it moves through the slices, its rotation handles
  turn the planes, its slab handles set the slab thickness, and `autoPan`
  pans. It sets no blend mode: set `blendMode` in the presentation of each
  display set, for example `Enums.BlendModes.MAXIMUM_INTENSITY_BLEND` for a
  MIP slab. See
  [the crosshair](./2-rendering-changes.md#a-volume-slice-sits-on-a-slice-centre).
- **The slab thickness synchronizer** copies `slabThickness` from the
  presentation of the source display set of the source viewport to every
  display set of each target.
- **The fill of a labelmap** is drawn with the configured alpha, so it looks
  stronger than on a legacy volume viewport.
- **The stack scroll tool** does nothing on a whole slide viewport, where
  the legacy `scroll()` zoomed. Put the zoom tool on the wheel there. With
  `loop: true` in its configuration the tool wraps a volume too.

**Check.** Draw each annotation tool that the application offers on a stack
and on a volume, scroll away and back, and compare the measurement with 5.x.
Paint a labelmap and look at the fill. Use each tool of each tool group once:
a tool that is only added to a tool group proves nothing.

**What can go wrong**

- A tool that the application wrote itself and that calls legacy members of
  a viewport is application code. Take it through steps 2 to 9.
- `ScaleOverlayTool` reads the corners of the images when it is enabled:
  enable it after every viewport of its tool group shows its data.
  `CrosshairsTool` can be set active before: it starts when a viewport of its
  group shows a volume.
- `utilities.getImageLegacy(element)` of the core is gone. Read
  `cache.getImage(viewport.getCurrentImageId())`.

## Step 12. The version and the settings

**Search**

```sh
rg -n "useGenericViewport|useCPURendering|setUseCPURendering|resetUseCPURendering|getShouldUseCPURendering|useViewportSamplingForLinear" src
rg -n "ViewportType\.(STACK|ORTHOGRAPHIC|PERSPECTIVE)\b|\.(setStack|setVolumes|addVolumes|setProperties|getProperties|resetProperties|getCamera|setCamera|resetCamera|getViewPresentation|setViewPresentation)\(|setVolumesForViewports|addVolumesToViewports" src
```

**Change.** The second command must print nothing before the version
changes. Then set every `@cornerstonejs` package to 6.0, and remove the
settings that the first command finds. [Settings](./3-api-map.md#settings) has
the row for each.

Before:

```ts
init({ rendering: { useGenericViewport: true, useCPURendering: true } });
```

After:

```ts
init();
setRenderBackend('cpu');
```

`setRenderBackend('cpu')` pins the planar viewports to the CPU. The key
`rendering.planar.renderBackend` of the configuration of `init` does the
same. Leave both out unless the application has to pin the viewports.
Without them a router picks the path for each layer, and a device without
WebGL draws on the CPU by itself.

The rename of the viewport types is in the code. Replace `PLANAR_NEXT`,
`VOLUME_3D_NEXT`, `VIDEO_NEXT`, `WHOLE_SLIDE_NEXT` and `ECG_NEXT` with
`PLANAR`, `VOLUME_3D`, `VIDEO`, `WHOLE_SLIDE` and `ECG` (the `_NEXT` names
still work: they are deprecated aliases), and a stored or compared
`'planarNext'` with `'planar'`.

**Check.** The type checker passes. `viewport.getRenderPlan()` of a planar
viewport says for each layer what draws it and why. Go through every screen
once more, with the list of
[changes that need a decision](#changes-that-need-a-decision-by-a-person).

**What can go wrong**

- Slice first is on by default in 6.0. See
  [Slice first is on by default](./2-rendering-changes.md#slice-first-is-on-by-default)
  for what it changes, and `setSliceFirst(false)` turns it off.
- A next viewport of 5.x and one of 6.0 differ. A screen that was checked on
  5.x is checked again.
- `setUseCPURendering()` marked the library as initialized, and
  `setRenderBackend()` does not. Code that ran without `init()` because of
  the old call throws at `new RenderingEngine()`:
  `@cornerstonejs/core is not initialized, run init() first`. Call
  `await init()` first, as the sample does.
- Call `setRenderBackend('cpu')` after `init()`, or pass
  `rendering.planar.renderBackend` to `init`. `init(configuration)` starts
  from the default configuration and its argument, so a backend that was set
  before it is lost.

## Changes that need a decision by a person

At these the code compiles and runs, and the picture or the result differs
from 5.x. Each one has more than one right answer, and the application
decides. A coding agent stops here and asks.

| Change                                              | What differs                                                                                                                                                                     | The choice                                                                                                                                              |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The orientation of a volume without an option       | A legacy `ORTHOGRAPHIC` viewport without options opened in `AXIAL`. A planar viewport opens a volume in its acquisition plane                                                    | Which orientation each viewport opens in. See [Orientation of a volume](./2-rendering-changes.md#orientation-of-a-volume)                               |
| A tilted series                                     | `AXIAL`, `SAGITTAL` and `CORONAL` show the true axis. `ACQUISITION` shows the plane of the acquisition                                                                           | Whether a viewport shows the true axis or the acquired plane                                                                                            |
| `setOrientation` keeps the view                     | The legacy volume viewport reset its camera and showed the middle of the volume. A next viewport keeps the point in view, the pan and the zoom                                   | Keep the view, or call `resetViewState()` after the change                                                                                              |
| A jump lands on a slice centre                      | The focal point after a jump can differ from the requested point by up to half a slice spacing                                                                                   | What code that stores or compares focal points does. See [the section](./2-rendering-changes.md#a-volume-slice-sits-on-a-slice-centre)                  |
| The fill of a labelmap                              | A `fillAlpha` of 0.5 looked like 0.26 on a legacy volume viewport. Now it is drawn as 0.5                                                                                        | Keep the stronger fill, or lower `fillAlpha` and `fillAlphaInactive`                                                                                    |
| The opacity of a fusion layer                       | A numeric opacity of a colour layer is applied as given. The legacy viewport drew it weaker                                                                                      | Keep the value, or lower it                                                                                                                             |
| A slab with the composite blend mode                | It draws as an average. The legacy viewport cast rays, so voxels in front hid what lies behind                                                                                   | Which blend mode the slab gets                                                                                                                          |
| A scroll with a slab                                | `viewport.scroll(1)` steps by one slice. The legacy volume viewport stepped by the slab thickness                                                                                | Step by slices, or pass `scrollSlabs: true` to `utilities.scroll`                                                                                       |
| A scroll with `loop`                                | `utilities.scroll` and `StackScrollTool` with `loop: true` wrap a volume at both ends. The legacy volume viewport ignored `loop`                                                 | Keep the wrap on volumes, or set `loop` only where the application wants it                                                                             |
| `setOrientation` with a normal and no view up       | The view takes the view up of the acquisition. The legacy viewport kept the current view up when it was orthogonal to the normal, and otherwise took `[0, 0, 1]` or `[0, -1, 0]` | Which `viewUp` the application passes                                                                                                                   |
| Default properties                                  | `setDefaultProperties` and its family have no twin                                                                                                                               | Where the application keeps its default, and when it sets it: for each display set, or for each image in a listener of `NEW_IMAGE`                      |
| Image defaults                                      | A MONOCHROME1 image starts inverted. An image without a window starts at its pixel range, not at 0 to 255                                                                        | Whether the application sets its own window or invert on top. See [Image defaults](./2-rendering-changes.md#image-defaults)                             |
| A display area of `type: 'SCALE'`                   | A scale of 1 is the fit of the picture. On a legacy viewport 1 meant one image pixel on one screen pixel                                                                         | The scale that gives the size the application wants                                                                                                     |
| Listeners of a new image and of `CAMERA_MODIFIED`   | `NEW_IMAGE` replaces `STACK_NEW_IMAGE` and `VOLUME_NEW_IMAGE` and has no `image` for a volume. `CAMERA_MODIFIED` fires on each new image of a stack                              | Whether one listener serves stacks and volumes, and what each listener does in each mode                                                                |
| A viewport on the CPU                               | The VOI lookup table and the modality lookup table of an image are not applied, as on the GPU. The area around the image has the background colour                               | Whether the application relied on the lookup tables on the CPU. See [the section](./2-rendering-changes.md#a-viewport-on-the-cpu-shows-the-gpu-picture) |
| The crosshair                                       | `CrosshairsTool` sets no blend mode for its slab                                                                                                                                 | Set `blendMode` in the presentation. Or use `WorldCrosshairTool` with `SliceIntersectionTool`                                                           |
| `ViewportType.PERSPECTIVE`                          | The legacy type drew a thin slab of the volume. A 3D viewport with `parallelProjection: false` draws the volume in 3D                                                            | What the screen shows                                                                                                                                   |
| The zoom and the pan of a video and an ECG viewport | `getPan()` gives canvas pixels from the fit. The legacy viewport gave world units, and the legacy video viewport did not zoom                                                    | What code that stores a pan does with stored values                                                                                                     |
| The pan of a whole slide viewport                   | It is measured from the centre of the slide. The legacy `getPan()` measured from the view at mount, and `setPan(pan, true)` stored a new origin                                  | What code that stores a pan does with stored values                                                                                                     |
| The zoom of a 3D viewport                           | It is measured against the fit for the direction of the camera now. The legacy `getZoom()` measured against the camera of the last reset                                         | What code that stores or compares a zoom does                                                                                                           |
| Playback of a video                                 | `setPlaybackRate()` does not start or pause playback                                                                                                                             | Where the application calls `play()` and `pause()`                                                                                                      |
| World points of a whole slide viewport              | World points follow the coordinate system of the slide, and the rotation is in degrees. Points saved from a next whole slide viewport of 5.x show shifted                        | What happens to saved points and rotations                                                                                                              |
| The trace layout of an ECG                          | The legacy viewport drew twelve rows of one lead. The next viewport picks a layout by the record                                                                                 | Which `traceLayout` the application sets                                                                                                                |

Rows that say "Differs" in [the map](./3-api-map.md) and are not in this table
change an answer in a way that has one right fix. The row gives it.

## For a coding agent

Rules for doing this upgrade mechanically. Run [the codemod](#the-codemod)
first, and take its two lists as the start of the work.

1. **Follow the order.** Do the steps from 1 to 12, for one screen at a
   time. Finish the check of a step before the next step.
2. **Never guess a replacement.** Search
   [the map](./3-api-map.md) for the legacy name. Use the call in the column
   "Use instead" of its row, as it is written. A name that has no row is not
   a viewport API of Cornerstone3D, or it is missing from the map: stop and
   report it.
3. **Read the last column of the row.** It says what the call does on a stack
   and on a volume. Where the code can meet both, use the call that answers
   in both modes, and do not add a branch on the mode that the row does not
   ask for.
4. **Know what is gone and what is deprecated.** Every call in the column
   "Use instead" is in the code. On 6.0 the legacy classes and their types,
   the compatibility adapters and the setting `rendering.useGenericViewport`
   are gone, so the type checker lists each use. A row marked
   **Deprecated** names a name that still compiles in 6.x, such as the
   `_NEXT` types, the `Generic` class names, `Types.IGenericViewport`,
   `utilities.isGenericViewport` and `utilities.ECGUtilities`: move off
   each one as its row says.
5. **Do not import a private name.** A cell with `-` means that no call takes
   the place of the legacy name. Do not import from a path inside a package,
   such as `@cornerstonejs/core/dist`. The `LegacyAdapter` classes and
   `rendering.useGenericViewport` of 5.x are not an end state: 6.0 has
   neither.
6. **Do not keep a legacy call behind a cast.** No `as any` and no check for
   the presence of a legacy member to keep an old path alive.
7. **Do not edit actors to set a look.** Use the presentation.
8. **Verify after each step.** The type checker passes. The tests of the
   application pass. The search of the step prints nothing, or only lines
   that you list with the reason. Then do the check of the step. A search
   also finds names that stay, such as `setOrientation`, `setImageIdIndex`,
   `scroll`, `getActors`, `setZoom` and `setDisplayArea` (the map says
   "Same name"), and calls in comments: list those as such.
9. **Stop and ask** at each row of
   [Changes that need a decision by a person](#changes-that-need-a-decision-by-a-person)
   that the code touches. Say what you found, where, and what the choices
   are. Do not change a value to make a picture look as before, such as
   `fillAlpha`, unless the person chose that.
10. **Report.** For each step: the files you changed, the result of its
    search before and after, the result of its check, and each decision that
    is open.
