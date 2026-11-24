---
id: camera
title: Camera Model
summary: Comprehensive ownership model for view state, framing, appearance, references, resolved views, and what replaces the legacy camera
---

# Camera Model

The viewports use `viewState`, not VTK-style camera fields, as the clean source
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

The framing of a view (pan, zoom, rotation, flips and display area against
the fit) is read and written through the projection service, or with
`viewport.getViewFraming()` and `viewport.setViewFraming()`, which call it:

```ts
import { viewportProjection } from '@cornerstonejs/core';

const framing = viewportProjection.getFraming(viewport, {
  selector: {
    pan: true,
    zoom: true,
    rotation: true,
  },
});

const nextViewState = viewportProjection.withFraming(viewport, {
  zoom: 2,
  pan: [20, -10],
});

if (nextViewState) {
  viewport.setViewState(nextViewState);
}
```

`viewportProjection.withFraming()` is pure. It translates the framing
patch into the viewport family's native `ViewState`, but it does not mutate the
viewport and it does not render. `setViewState()` and `updateViewState()` remain
the paths for arbitrary view-state changes; `resetViewState()` is the
clean reset helper.

For cross-viewport tooling and synchronizers, use the Viewport Projection
construct instead of treating `ICamera` as a universal camera model. Viewport
Projection exposes capability-checked transforms, semantic scale and position,
and optional renderer-camera output. See
[Viewport Projection](./viewport-projection.md).

> **Naming note.** "Viewport Projection" uses _projection_ in the mathematical
> sense — projecting semantic viewport state onto framing, transforms, and
> renderer output. It is distinct from VTK's parallel-vs-perspective projection
> (`parallelProjection`), which is a renderer-matrix setting carried on the
> resolved `ICamera`. The two concepts coexist in the same code paths but
> describe different layers.

## Contract Matrix

| Concept                | Owns                                                                                                                 | Does Not Own                                              |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| `ViewState`            | Mutable viewport-local navigation and layout source of truth.                                                        | Cross-viewport persistence by itself.                     |
| `ViewFraming`          | Persistable look state: pan, zoom or scale, rotation, flips, and display area.                                       | Data identity, slice identity, VOI, opacity, or colormap. |
| `ViewReference`        | Persistable spatial pointer: frame of reference, data id, volume id, image id, slice locator, and plane restriction. | Pan, zoom, rotation, flips, VOI, opacity, or colormap.    |
| `ResolvedView`         | Ephemeral world/canvas transforms, resolved framing, and renderer geometry.                                          | Durable state or persistence.                             |
| `DisplaySetAppearance` | Per-binding appearance such as VOI, opacity, colormap, interpolation, and visibility.                                | Viewport navigation.                                      |

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
framing scale, and slice metadata needed by CPU and VTK paths.

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

- world tuples are `[sampleIndex, amplitude, leadIndex]`
- the amplitude is in raw units of the first channel, for every lead
- `leadIndex` is `channel + 1000 * k`, with `k = copy * groupCount +
groupIndex` over the multiplex groups of the instance. With one group, the
  first region of a lead has its channel index, whether or not every channel
  shows, and a rhythm strip of lead II is 1001. A copy that the layout does not
  show maps to the first region of its lead in the same group
- the frame of reference is the SOP Instance UID of the ECG, so every viewport
  of one ECG shares its annotations
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

Code written for the legacy viewports of 5.x often wrote durable camera
fields with `setCamera({ focalPoint, position, parallelScale })`. A 6.0
viewport has no `setCamera`. Write native state or projection patches:

```ts
viewport.updateViewState((viewState) => ({
  ...viewState,
  anchorWorld: [x, y, z],
}));
```

```ts
const nextViewState = viewportProjection.withFraming(viewport, {
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

A position-only camera patch has no twin: view state stores semantic
anchors, slice locators, and scale, not durable renderer position.

## The Legacy Camera

5.x ran the legacy camera API (`getCamera`, `setCamera`, `resetCamera`,
`getViewPresentation`, `setViewPresentation`) on these viewports through
compatibility adapters. 6.0 removed the adapters and that API. Viewports expose
`getViewState()`, `setViewState()`, `updateViewState()`, `resetViewState()`,
`getViewFraming()`, `setViewFraming()` and `getResolvedView()`.

Code that needs an `ICamera`-compatible shape reads
`viewport.getResolvedView()?.toICamera()`. It is for reading only: a write goes
through the view state or `viewportProjection`. The
[6.0 migration guide](../../../migration-guides/6x/3-api-map.md) gives the call
that replaces each legacy camera member.
