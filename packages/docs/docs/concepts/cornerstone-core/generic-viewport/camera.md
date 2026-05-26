---
id: camera
title: Camera Model
summary: Comprehensive ownership model for view state, presentation, references, resolved views, and legacy camera compatibility
---

# Camera Model

Generic viewports use `viewState`, not VTK-style camera fields, as the clean source
of truth.

The model is:

```text
Viewport viewState
  -> ResolvedView
  -> renderer projection
  -> runtime engine state
```

Only `viewState` is durable viewport navigation state. `ResolvedView` is a
computed snapshot for the current canvas, data, and state. Renderer projections
are commands sent to VTK, CPU canvas, DOM, OpenLayers, or another runtime.
Runtime engine state is private to that renderer.

Clean Next viewport instances do not expose `getViewPresentation()` or
`setViewPresentation()`. Presentation is a projection-service concern:

```ts
import { viewportProjection } from '@cornerstonejs/core';

const presentation = viewportProjection.getPresentation(viewport, {
  selector: {
    pan: true,
    zoom: true,
    rotation: true,
  },
});

const nextViewState = viewportProjection.withPresentation(viewport, {
  zoom: 2,
  pan: [20, -10],
});

if (nextViewState) {
  viewport.setViewState(nextViewState);
}
```

`viewportProjection.withPresentation()` is pure. It translates the presentation
patch into the viewport family's native `ViewState`, but it does not mutate the
viewport and it does not render. `setViewState()` and `updateViewState()` remain
the clean Next paths for arbitrary view-state changes; `resetViewState()` is the
clean reset helper.

For cross-viewport tooling and synchronizers, use the Viewport Projection
construct instead of treating `ICamera` as a universal camera model. Viewport
Projection exposes capability-checked transforms, semantic scale and position,
and optional renderer-camera output. See
[Viewport Projection](./viewport-projection.md).

> **Naming note.** "Viewport Projection" uses _projection_ in the mathematical
> sense — projecting semantic viewport state onto presentation, transforms, and
> renderer output. It is distinct from VTK's parallel-vs-perspective projection
> (`parallelProjection`), which is a renderer-matrix setting carried on the
> resolved `ICamera`. The two concepts coexist in the same code paths but
> describe different layers.

## Contract Matrix

| Concept            | Owns                                                                                                                 | Does Not Own                                              |
| ------------------ | -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| `ViewState`        | Mutable viewport-local navigation and layout source of truth.                                                        | Cross-viewport persistence by itself.                     |
| `ViewPresentation` | Persistable look state: pan, zoom or scale, rotation, flips, and display area.                                       | Data identity, slice identity, VOI, opacity, or colormap. |
| `ViewReference`    | Persistable spatial pointer: frame of reference, data id, volume id, image id, slice locator, and plane restriction. | Pan, zoom, rotation, flips, VOI, opacity, or colormap.    |
| `ResolvedView`     | Ephemeral world/canvas transforms, resolved presentation, and renderer geometry.                                     | Durable state or persistence.                             |
| `DataPresentation` | Per-binding appearance such as VOI, opacity, colormap, interpolation, and visibility.                                | Viewport navigation.                                      |

## Planar View State

`PlanarViewState` is semantic. It does not extend `ICamera`, and it does not
store `focalPoint`, `position`, `parallelScale`, `viewPlaneNormal`, or `viewUp`
as source truth.

It stores fields such as:

- `orientation`
- `slice`
- `anchorWorld`
- `anchorCanvas`
- `scale`
- `scaleMode`
- `rotation`
- `flipHorizontal`
- `flipVertical`
- `displayArea`

Planar slice identity is explicit:

- Stack and image paths use `slice.kind === 'stackIndex'`.
- Volume paths use `slice.kind === 'volumePoint'`.

`setImageIdIndex()` remains a convenience API. For stack data it stores a stack
index. For volume data it resolves the requested index into a world point and
stores a `volumePoint` slice locator. Crosshairs and navigation tools should use
`ViewReference` or `sliceWorldPoint`, not raw camera position.

## Resolved Planar View

Planar render code derives VTK-compatible fields from the resolved view. This
includes the focal point, position, parallel scale, view plane normal, view up,
presentation scale, and slice metadata needed by CPU and VTK paths.

Those fields are renderer projection data. They are not copied back into
`PlanarViewState` as durable truth.

## Video And ECG

Video and ECG viewports also use semantic state as the source of truth. Their
rendering code resolves a canvas mapping from:

- viewport state
- canvas or element dimensions
- intrinsic media or waveform metrics
- object-fit or signal layout rules

The resolved canvas mapping supplies pan, zoom, and canvas/world conversion for
tools and renderers. It is not persisted as a camera.

Video projection reports intrinsic media-pixel coordinates:

- `ProjectionPosition.kind === 'mediaPoint'`
- `ProjectionScale.kind === 'nativePixel'`

ECG projection reports signal coordinates:

- world tuples are `[sampleIndex, amplitudeValue, channelIndex]`
- `ProjectionPosition.kind === 'signalPoint'`
- `ProjectionScale.kind === 'signal'`

## 3D And WSI Exceptions

3D viewports are runtime-camera-backed. The VTK active camera remains the source
of truth, `getViewState()` reads from VTK, and `setViewState()` applies to VTK.

Whole-slide image viewports have semantic `WSIViewState`, but they synchronize
with OpenLayers before reads and after map interactions. Their projection
adapter exposes slide/world transforms, zoom, rotation, and renderer-camera
output through `viewportProjection`.

## Camera Patch Migration

Legacy code often wrote durable camera fields:

```ts
viewport.setCamera({
  focalPoint,
  position,
  parallelScale,
});
```

For direct Next viewports, prefer native state or projection writes:

```ts
viewport.updateViewState((viewState) => ({
  ...viewState,
  anchorWorld: [x, y, z],
}));
```

```ts
const nextViewState = viewportProjection.withPresentation(viewport, {
  zoom: 2,
});

if (nextViewState) {
  viewport.setViewState(nextViewState);
}
```

Use `ViewReference` for spatial navigation across slices or datasets:

```ts
const reference = sourceViewport.getViewReference();

targetViewport.setViewReference(reference);
targetViewport.render();
```

Use `setCamera()` only on legacy compatibility adapters. Position-only camera
patches are not a stable Next-state operation because Next view state stores
semantic anchors, slice locators, and scale, not durable renderer position.

## Legacy Compatibility

Legacy adapters are the temporary migration boundary for `ICamera`. They exist
to keep older applications running while code moves to direct Next viewports,
and they should not be treated as the long-term Next API surface. Plan for these
compatibility camera methods to be removed in a later breaking release.

Clean Generic viewports expose `getViewState()`, `setViewState()`,
`updateViewState()`, `resetViewState()`, and `getResolvedView()`. Legacy
adapters expose `getCamera()`, `setCamera()`, `resetCamera()`,
`getViewPresentation()`, and
`setViewPresentation()` for old APIs and legacy camera events.

For planar adapters:

- `getCamera()` derives an `ICamera` from `getResolvedView()`.
- `parallelScale` maps to semantic scale using the current resolved fit scale.
- In-plane focal-point deltas map to pan and anchor state.
- Normal-direction focal-point deltas map to volume `sliceWorldPoint`
  navigation.
- `position` may disambiguate legacy movement but is not stored.
- Position-only planar patches are unsupported and should not mutate clean
  state.

Tools that still need an `ICamera`-compatible shape should use the bridge
utility that derives that shape from `getResolvedView()` first and falls back to
legacy `getCamera()` only when needed.
