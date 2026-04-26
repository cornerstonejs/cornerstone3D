---
id: camera
title: Camera Model
summary: Comprehensive ownership model for view state, presentation, references, resolved views, and legacy camera compatibility
---

# Camera Model

Next viewports use `viewState`, not VTK-style camera fields, as the clean source
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

## 3D And WSI Exceptions

3D viewports are runtime-camera-backed. The VTK active camera remains the source
of truth, `getViewState()` reads from VTK, and `setViewState()` applies to VTK.

Whole-slide image viewports have semantic `WSIViewState`, but they synchronize
with OpenLayers before reads and after map interactions.

## Legacy Compatibility

Legacy adapters are the compatibility boundary for `ICamera`.

Clean Next viewports expose `getViewState()`, `setViewState()`, and
`getResolvedView()`. Legacy adapters expose `getCamera()` and `setCamera()` for
old APIs and legacy camera events.

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
