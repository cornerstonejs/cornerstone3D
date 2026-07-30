---
id: generic-viewport
title: Generic Viewport
summary: Migration notes for adopting Generic Viewport and updating code that depends on legacy viewport classes or removed viewport accessors
---

# Generic Viewport Migration Guide

Generic Viewport adds new viewport implementations and an optional compatibility
mode for routing legacy viewport types through those implementations.

Most application code that creates a viewport and then calls the standard data
APIs still works through compatibility adapters. The code most likely to need
changes is code that depends on concrete viewport classes, old rendering-engine
accessors, generic `setDataIds()`, or raw `viewport.type` checks.

## How Generic Viewport Is Enabled

You can use Generic Viewport directly by requesting a Generic viewport type:

```ts
renderingEngine.enableElement({
  viewportId,
  element,
  type: Enums.ViewportType.PLANAR_NEXT,
});
```

You can also opt legacy viewport creation into Next-backed compatibility
adapters:

```ts
import { init } from '@cornerstonejs/core';

init({
  rendering: {
    useGenericViewport: true,
  },
});
```

When `rendering.useGenericViewport` is true, legacy viewport requests are remapped
internally:

| Requested type              | Runtime type                    |
| --------------------------- | ------------------------------- |
| `ViewportType.STACK`        | `ViewportType.PLANAR_NEXT`      |
| `ViewportType.ORTHOGRAPHIC` | `ViewportType.PLANAR_NEXT`      |
| `ViewportType.VIDEO`        | `ViewportType.VIDEO_NEXT`       |
| `ViewportType.ECG`          | `ViewportType.ECG_NEXT`         |
| `ViewportType.WHOLE_SLIDE`  | `ViewportType.WHOLE_SLIDE_NEXT` |
| `ViewportType.VOLUME_3D`    | `ViewportType.VOLUME_3D_NEXT`   |

Direct Generic viewport types use the new APIs. Remapped legacy viewport types use
compatibility adapters that preserve legacy methods such as `setStack()`,
`setVolumes()`, `setVideo()`, `setEcg()`, and `setWSI()` where applicable.
These adapters are a temporary migration layer, not the long-term Next API
surface, and their legacy helpers should be expected to be removed in a later
breaking release.
Keep those API families separate for a given viewport instance: use the legacy
methods on compatibility viewports, or use Generic methods such as
`setDisplaySets()` and `addDisplaySet()` on direct Generic viewports. Mixing
legacy data mounting with direct Generic data mounting on the same viewport
can leave legacy presentation defaults and Generic data state out of sync.

## Extending Viewport Types (New Pattern)

### When you actually need a new viewport type

The built-in viewport types cover a fixed set of render paths: stack and volume
image slices, 3D volumes, whole-slide tiles, video frames, and ECG waveforms.
You only need to register a _new_ type when you want a viewport to draw
something none of those render paths model.

A good example is a **3D contour viewport for a digital twin**. Cornerstone can
already render contour geometry — for example DICOM RT Structure Set contours —
but only as a segmentation _overlay_ aligned to an image source view. A
digital-twin view instead makes the contour geometry the **primary source
data**: there is no underlying image, so the contour itself defines the view,
including navigation and camera. No built-in source render path models contour
geometry as the primary data, so a custom `Contour3D` viewport class owns its
own data shape, render path, and view state while still participating in the
rendering engine, projection service, and tooling like any other viewport.

Rule of thumb: register a new type only for a genuinely new **data shape** or
**render path**. If you can express what you need with an existing viewport's
source/overlay bindings and presentation, do that instead.

### Registering the type

Built-in and extension viewport type names live on **`Enums.ViewportTypes`**, a
runtime constants map in the enums package (not the legacy `ViewportType` enum).

- **Built-ins:** `Enums.ViewportTypes.STACK`, `Enums.ViewportTypes.PLANAR_NEXT`, etc.
- **Extensions:** `registerViewportType({ name: 'Contour3D', ... })` then `Enums.ViewportTypes.Contour3D`
- **Types:** augment `ViewportTypeConstants` (and `ViewportTypeRegistry` for the
  wire-value union) from the constants you export. `Enums.ViewportTypes` is typed
  from `ViewportTypeConstants`, so new keys pick up the correct literal types
  automatically.

The deprecated `Enums.ViewportType` enum is unchanged at runtime and is **not**
extended when you register new types.

### 1) Declare the name and type augmentation in one place

Export the name and wire value as constants and derive the type augmentation
from them. The literal strings then live in exactly one file and every other
step imports the constants instead of retyping them. Because this file now
carries runtime values it is a regular `.ts` module, not a `.d.ts` (a `.d.ts`
is type-only and cannot emit the `export const`s).

```ts
// my-extension/src/viewportTypes.ts
import '@cornerstonejs/core';

// Single source of truth for this extension's viewport type.
export const CONTOUR_3D_NAME = 'Contour3D';
export const CONTOUR_3D_TYPE = 'myOrg:contour3d';

declare module '@cornerstonejs/core' {
  interface ViewportTypeRegistry {
    [CONTOUR_3D_TYPE]: typeof CONTOUR_3D_TYPE;
  }

  interface ViewportTypeConstants {
    readonly [CONTOUR_3D_NAME]: typeof CONTOUR_3D_TYPE;
  }
}
```

The computed keys are valid because both constants have string-literal types, so
`Enums.ViewportTypes.Contour3D` and the `'myOrg:contour3d'` wire value are both
derived from these two declarations.

### 2) Register the type at runtime

Import the constants and pass them straight to `registerViewportType`. The call
is typed against the step 1 augmentation: `name` is constrained to a declared
key and `type` is pinned to that key's wire value, so a mismatched pair is a
compile-time error. Importing `viewportTypes.ts` here also pulls in its `declare
module` augmentation, so the new name is present on `Enums.ViewportTypes`
wherever this module is loaded.

```ts
import { registerViewportType } from '@cornerstonejs/core';
import { CONTOUR_3D_NAME, CONTOUR_3D_TYPE } from './viewportTypes';

registerViewportType({
  name: CONTOUR_3D_NAME,
  type: CONTOUR_3D_TYPE,
  ViewportClass: Contour3DViewport,
});
```

After this runs, `Enums.ViewportTypes.Contour3D === 'myOrg:contour3d'`.

### 3) Enable elements using the registered type

Reuse the same constant, or use the `Enums.ViewportTypes` accessor once
registration has populated it:

```ts
import { Enums } from '@cornerstonejs/core';
import { CONTOUR_3D_TYPE } from './viewportTypes';

renderingEngine.enableElement({
  viewportId: 'digitalTwinViewport',
  element,
  type: CONTOUR_3D_TYPE, // or Enums.ViewportTypes.Contour3D
});
```

Notes:

- Call `registerViewportType(...)` in your extension entry module **before** any
  `enableElement(...)` that uses `Enums.ViewportTypes.Contour3D`.
- `declare module` only affects TypeScript; it does not register constructors.
  Runtime registration is required.
- Use namespaced wire values (for example, `myOrg:contour3d`) to avoid
  collisions across extensions.
- Import `CONTOUR_3D_TYPE`/`CONTOUR_3D_NAME` rather than retyping the literals.
  `Enums.ViewportTypes.Contour3D` is the enum-like ergonomic accessor and is
  equivalent to `CONTOUR_3D_TYPE` after registration.

Code that branches on `viewport.type` should also account for the runtime type.
Direct planar Generic viewports report `ViewportType.PLANAR_NEXT`; remapped stack
and orthographic compatibility adapters still expose their requested legacy type
while delegating to the planar Generic implementation internally.

## Removed Rendering Engine Accessors

The following `RenderingEngine` methods have been removed:

- `getStackViewport(viewportId)`
- `getStackViewports()`
- `getVolumeViewports()`

These methods classified viewports by concrete legacy classes. That does not
work reliably with Generic Viewport because a `PLANAR_NEXT` viewport can support
stack-style and volume-style behavior without being an instance of
`StackViewport` or `VolumeViewport`.

Use `getViewport()` and capability guards instead:

```ts
import { utilities } from '@cornerstonejs/core';

const viewport = renderingEngine.getViewport(viewportId);

if (!utilities.viewportSupportsStackCompatibility(viewport)) {
  throw new Error(`Viewport ${viewportId} does not support setStack`);
}

await viewport.setStack(imageIds);
```

For viewport lists:

```ts
const stackViewports = renderingEngine
  .getViewports()
  .filter(utilities.viewportSupportsStackCompatibility);

const volumeViewports = renderingEngine
  .getViewports()
  .filter(utilities.viewportSupportsVolumeCompatibility);
```

Available capability guards include:

- `viewportSupportsImageSlices`
- `viewportSupportsStackCompatibility`
- `viewportSupportsStackCalibration`
- `viewportSupportsVolumeCompatibility`
- `viewportSupportsVolumeActors`
- `viewportSupportsVolumeId`
- `viewportSupportsVolumeURI`

## Replace Class Checks With Capability Checks

Code like this is fragile under Generic Viewport:

```ts
if (viewport instanceof StackViewport) {
  await viewport.setStack(imageIds);
}
```

Prefer checking for the behavior you need:

```ts
if (utilities.viewportSupportsStackCompatibility(viewport)) {
  await viewport.setStack(imageIds);
}
```

The same applies to `BaseVolumeViewport`, `VolumeViewport`, and
`VolumeViewport3D` checks. Use volume capability guards when the code needs
`setVolumes()`, actor access, volume-id checks, or volume-URI checks.

## Be Careful With `viewport.type`

If `rendering.useGenericViewport` is enabled, a viewport requested as
`ViewportType.STACK` or `ViewportType.ORTHOGRAPHIC` has runtime type
`ViewportType.PLANAR_NEXT`.

Before:

```ts
if (viewport.type === Enums.ViewportType.STACK) {
  // stack-specific path
}
```

After:

```ts
if (utilities.viewportSupportsImageSlices(viewport)) {
  // image-slice path
}
```

Use `viewport.type` when you truly need to know the runtime implementation. Use
capability guards when you need to know what operations are supported.

## Generic `setDataIds()` Is Replaced

The generic base `Viewport.setDataIds()` API has been replaced by the variadic
`setDisplaySets()`.

Direct Generic viewport code should register logical display set ids and then
mount them:

```ts
import { Enums, utilities, type PlanarViewport } from '@cornerstonejs/core';

const viewport = renderingEngine.getViewport<PlanarViewport>(viewportId);
const displaySetId = 'ct-stack';

utilities.genericViewportDisplaySetMetadataProvider.add(displaySetId, {
  kind: 'planar',
  imageIds,
  initialImageIdIndex: 0,
});

await viewport.setDisplaySets({
  displaySetId,
  options: {
    orientation: Enums.OrientationAxis.AXIAL,
  },
});
```

For a volume-backed planar slice, include the `volumeId` in the registered
display set:

```ts
utilities.genericViewportDisplaySetMetadataProvider.add(displaySetId, {
  kind: 'planar',
  imageIds,
  initialImageIdIndex: Math.floor(imageIds.length / 2),
  volumeId,
});
```

If you are using a remapped legacy viewport type through
`rendering.useGenericViewport`, prefer keeping the legacy method while migrating:

```ts
await viewport.setStack(imageIds);
await viewport.setVolumes([{ volumeId }]);
```

## Direct Generic Viewports Use Display Set APIs

These direct Generic viewport types should use `setDisplaySets()` or
`addDisplaySet()`:

- `ViewportType.PLANAR_NEXT`
- `ViewportType.VIDEO_NEXT`
- `ViewportType.ECG_NEXT`
- `ViewportType.WHOLE_SLIDE_NEXT`
- `ViewportType.VOLUME_3D_NEXT`

Do not assume direct Generic viewports expose the legacy data-loading method names.
For example, direct `PLANAR_NEXT` code should use `setDisplaySets()` instead of
`setStack()` or `setVolumes()`.

## Presentation Is Split By Scope

Generic Viewport separates viewport navigation from per-data appearance:

- View presentation: pan, zoom or scale, rotation, flips, and display area.
  Direct Next viewports expose this through `viewportProjection`, not viewport
  instance methods.
- Data presentation: VOI, opacity, colormap, blend mode, interpolation, and
  visibility for one mounted dataset.

Before:

```ts
viewport.setProperties({
  voiRange,
  colormap,
  invert: true,
});
```

Direct Next API:

```ts
viewport.setDisplaySetPresentation(displaySetId, {
  voiRange,
  colormap,
  invert: true,
});
```

Legacy compatibility adapters keep `setProperties()` and map those values to
display set presentation internally for migration only. Because the adapters
are temporary, code that can move directly to Next should use
`setDisplaySetPresentation()` instead.

## Camera Compatibility

Legacy adapters still expose `getCamera()` and `setCamera()`, but clean Next
viewport code should use semantic APIs. Treat those adapter methods as
temporary migration compatibility that should be expected to be removed in a
later breaking release, not as a stable Next camera API. `ViewState` is the
viewport source of truth. `setViewState()` and `updateViewState()` are the
direct Next mutation paths.

```ts
viewport.setViewState({
  flipHorizontal: true,
  rotation: 90,
});

viewport.updateViewState(({ rotation = 0 }) => ({
  rotation: rotation + 30,
}));

const nextViewState = viewportProjection.withPresentation(viewport, {
  zoom: 1.5,
  pan: [40, -20],
});

if (nextViewState) {
  viewport.setViewState(nextViewState);
}
```

Read presentation through the projection service:

```ts
const presentation = viewportProjection.getPresentation(viewport, {
  selector: {
    pan: true,
    zoom: true,
    rotation: true,
  },
});
```

Direct Next viewports do not expose `getViewPresentation()` or
`setViewPresentation()`. Legacy compatibility adapters may still expose those
methods and delegate them through `viewportProjection.withPresentation(...)`
followed by `setViewState(...)`. Those compatibility methods are temporary,
should not be used in new Next code, and should be expected to be removed in a
later breaking release.

Before:

```ts
viewport.setCamera({
  focalPoint,
  position,
});
```

Now, for display navigation:

```ts
const nextViewState = viewportProjection.withPresentation(viewport, {
  zoom: 2,
});

if (nextViewState) {
  viewport.setViewState(nextViewState);
}
```

For spatial navigation across viewports, use references:

```ts
targetViewport.setViewReference(sourceViewport.getViewReference());
targetViewport.render();
```

For planar compatibility adapters, position-only camera patches are not
supported:

```ts
viewport.setCamera({ position });
```

Use `focalPoint`, `parallelScale`, `setViewState()`, `updateViewState()`,
viewport projection, or view-reference APIs instead.

Lower-level planar camera helpers are available for custom synchronizers and
tooling that need to derive renderer cameras without going through a viewport.
They are grouped under a `planarProjection` namespace export to signal that
they sit a tier below the stable viewport API and may change before 3.0 stable:

```ts
import { planarProjection } from '@cornerstonejs/core';

const sliceBasis = planarProjection.createImageSliceBasis({
  image,
  canvasWidth,
  canvasHeight,
});
const icamera = planarProjection.resolveICamera({
  sliceBasis,
  camera: viewState,
  canvasWidth,
  canvasHeight,
});
planarProjection.applyToRenderer({ renderer, activeSourceICamera: icamera });
```

The namespace also exposes `derivePresentation` (canvas-space pan/zoom/rotation
without the world-space focal-point step) and `createVolumeSliceBasis` (for
volume-backed planar viewports). Treat these as helper APIs around the planar
camera model rather than as the primary viewport control surface.

## Planar Camera State Differences

Planar Generic viewports store zoom-to-point anchors as semantic view state.
When a stored anchor is replayed on another slice, the anchor is projected onto
the current slice plane. This keeps the camera on-plane, but it is not
invertible across slice changes: cine or synchronization code that stores a
camera on slice N, replays it on slice M, and later returns to slice N can see
anchor drift. Use view references for spatial slice synchronization, and treat
view presentation as display-only state.

When both `viewState.displayArea.scaleMode` and `viewState.scaleMode` are set,
the display-area scale mode wins. Set only one of those fields unless the
display area is intentionally overriding the broader view-state scaling mode.

`PlanarViewport.resetViewState({ resetPan, resetZoom })` resets pan, zoom,
rotation, orientation, and flip presentation state by default. It does not reset
the current slice. Pass `resetOrientation: false` or `resetFlip: false` to keep
those fields. Legacy stack and volume viewports expose `resetCamera` through
compatibility adapters, but that name is a temporary migration API that should
be expected to be removed in a later breaking release. New Next code should call
`resetViewState` on direct Next viewports and explicitly call
`setImageIdIndex`, `setOrientation`, or `setViewState` for fields that should not
follow the default reset.

## Event And Enabled Element Notes

Some event and enabled-element fields are now optional because not every Next
viewport has a frame of reference or a legacy camera snapshot at all times:

- `CameraModifiedEventDetail.previousCamera`
- `CameraModifiedEventDetail.element`
- `CameraResetEventDetail.element`
- `IEnabledElement.FrameOfReferenceUID`

Guard those fields before using them.

## Migration Checklist

Search your codebase for these patterns:

```sh
rg "getStackViewport|getStackViewports|getVolumeViewports|setDataIds"
rg "instanceof (StackViewport|VolumeViewport|BaseVolumeViewport|VolumeViewport3D)"
rg "viewport\\.type === Enums\\.ViewportType\\.(STACK|ORTHOGRAPHIC|VIDEO|ECG|WHOLE_SLIDE|VOLUME_3D)"
rg "setCamera\\(\\{\\s*position"
```

Then migrate in this order:

1. Replace removed rendering-engine accessors with `getViewport()` or
   `getViewports()` plus capability guards.
2. Replace concrete class checks with capability guards.
3. If enabling `rendering.useGenericViewport`, audit `viewport.type` checks for
   legacy types that now run as Next runtime types.
4. For direct Generic viewports, replace generic `setDataIds()` and legacy data
   loading calls with logical display set ids plus `setDisplaySets()`.
5. Move clean Next presentation code from `setProperties()` to
   `setDisplaySetPresentation(displaySetId, ...)`.
6. Replace durable camera-state storage with `ViewState`,
   `viewportProjection`, or view reference APIs.
