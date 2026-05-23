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

The generic base `Viewport.setDataIds()` API has been replaced by
`setDataList()`.

Direct Generic viewport code should register logical data ids and then mount them:

```ts
import { Enums, utilities, type PlanarViewport } from '@cornerstonejs/core';

const viewport = renderingEngine.getViewport<PlanarViewport>(viewportId);
const dataId = 'ct-stack';

utilities.genericViewportDataSetMetadataProvider.add(dataId, {
  kind: 'planar',
  imageIds,
  initialImageIdIndex: 0,
});

await viewport.setDataList([
  {
    dataId,
    options: {
      orientation: Enums.OrientationAxis.AXIAL,
    },
  },
]);
```

For a volume-backed planar slice, include the `volumeId` in the registered data:

```ts
utilities.genericViewportDataSetMetadataProvider.add(dataId, {
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

## Direct Generic Viewports Use Data APIs

These direct Generic viewport types should use `setDataList()`, `setData()`, or
`addData()`:

- `ViewportType.PLANAR_NEXT`
- `ViewportType.VIDEO_NEXT`
- `ViewportType.ECG_NEXT`
- `ViewportType.WHOLE_SLIDE_NEXT`
- `ViewportType.VOLUME_3D_NEXT`

Do not assume direct Generic viewports expose the legacy data-loading method names.
For example, direct `PLANAR_NEXT` code should use `setDataList()` instead of
`setStack()` or `setVolumes()`.

## Presentation Is Split By Scope

Generic Viewport separates viewport navigation from per-data appearance:

- View presentation: pan, zoom or scale, rotation, flips, and display area.
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
viewport.setDataPresentation(dataId, {
  voiRange,
  colormap,
  invert: true,
});
```

Legacy compatibility adapters keep `setProperties()` and map those values to
data presentation internally.

## Camera Compatibility

Legacy adapters still expose `getCamera()` and `setCamera()`, but clean Next
viewport code should use semantic APIs:

```ts
viewport.setViewState({
  flipHorizontal: true,
});

viewport.setViewPresentation({
  rotation: 90,
});

viewport.setScale(1.5);
viewport.setPan([40, -20]);
```

For planar compatibility adapters, position-only camera patches are not
supported:

```ts
viewport.setCamera({ position });
```

Use `focalPoint`, `parallelScale`, `setViewState()`, `setViewPresentation()`,
or view-reference APIs instead.

## Planar Camera State Differences

Planar Generic viewports store zoom-to-point anchors as semantic view state.
When a stored anchor is replayed on another slice, the anchor is projected onto
the current slice plane. This keeps the camera on-plane, but it is not
invertible across slice changes: cine or synchronization code that stores a
camera on slice N, replays it on slice M, and later returns to slice N can see
anchor drift. Use view references for spatial slice synchronization, and treat
view presentation as display-only state.

`PlanarViewport.resetCamera({ resetPan, resetZoom })` resets pan, zoom, and
rotation presentation state. It does not reset the current slice, orientation,
or flip state. Legacy stack and volume viewports reset more acquisition-camera
state during `resetCamera`, so migration code that relies on that behavior
should explicitly call `setImageIdIndex`, `setOrientation`, or `setViewState`
for those fields.

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
   loading calls with logical data ids plus `setDataList()`.
5. Move clean Next presentation code from `setProperties()` to
   `setDataPresentation(dataId, ...)`.
6. Replace durable camera-state storage with view presentation or view
   reference APIs.
