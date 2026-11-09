# `vtkVolume3d` — vtk.js WebGL volume rendering ("gl")

Source: [`VtkVolume3DRenderPath.ts`](https://github.com/mbellehumeur/cornerstone3D/blob/webgpuSpike/packages/core/src/RenderingEngine/GenericViewport/Volume3D/VtkVolume3DRenderPath.ts)
Selected by: `renderMode: 'vtkVolume3d'` — the default for a 3D display set unless
`?viewportRendering=webgpu` or `?renderMode=` says otherwise.

This is the reference path: everything else in `Volume3D/` is measured against it.
It is the only one of the three that is a plain, unmodified Cornerstone volume actor
inside the rendering engine's normal frame loop.

## Mount (`addData`)

```
createVolumeActor({ volumeId }, element, viewportId, suppressEvents = true)
  → loadVolume(volumeId)
  → createVolumeMapper(imageVolume.imageData, imageVolume.vtkOpenGLTexture)
  → vtkVolume.newInstance() + setDefaultVolumeVOI()
renderer.addVolume(actor)
```

Key consequence: the mapper is a **`vtkSharedVolumeMapper` bound to the volume's own
`vtkOpenGLTexture`**. No scalar data is copied. The same texture object is shared with
every other viewport showing that volume (MPR panes included), and the streaming
loader updates it in place as slices arrive.

Sampling defaults, from `createVolumeMapper`:

- `sampleDistance = sampleDistanceMultiplier × (sx + sy + sz) / 6`
  (multiplier from `getConfiguration().rendering.volumeRendering.sampleDistanceMultiplier`, default 1)
- `maximumSamplesPerRay = 4000`

Camera: on the first volume added to an empty renderer, `getInitialVolume3DCamera`
is applied, then `setCameraClippingRange()`. That helper deliberately does _both_
`setVtkCameraClippingRange()` (wide ±1e6 fallback) **and**
`renderer.resetCameraClippingRange()` (tight fit to visible bounds) — the tight range
is load-bearing, because volume ray casting derives its step count from the clipping
range and a wide range quantises the ray steps into visible banding/streaks.

`defaultVOIRange` is captured from the actor's initial RGB transfer function range so
`updateDataPresentation` can fall back to it.

## Progressive loading

`subscribeToVolumeEvents(volumeId, …)` listens to `IMAGE_VOLUME_MODIFIED` and
`IMAGE_VOLUME_LOADING_COMPLETED` and calls `ctx.display.requestRender()` on **every**
event. Because the mapper reads the shared texture, each re-render shows whatever
slices have landed — this is the only path with true progressive 3D display.

## Present

`render()` and `resize()` both do nothing but `ctx.display.requestRender()`, i.e.
`renderingEngine.renderViewport(id)`. The engine's shared offscreen WebGL
render window draws and blits to the viewport's on-screen canvas, and the engine
emits `IMAGE_RENDERED` itself. `VolumeViewport3D.renderBindings()` returns false for
this path, so `render()` falls through to `requestRenderingEngineRender()`.

## Appearance

Two layers, applied in this order in practice:

1. **Path-level** (`applyDataPresentation`): visibility, `updateOpacity(actor, opacity)`,
   a linear RGB transfer function from `voiRange` (optionally inverted),
   `interpolationType`, and `sampleDistanceMultiplier` (recomputes
   `sampleDistance = multiplier × (sx+sy+sz)/6`, floored at `0.001`).
2. **Preset** (`csUtils.applyPreset(actor, preset)`, driven by OHIF's hanging
   protocol through `NextViewportBackend`). This is what makes a 3D volume actually
   look like a 3D volume, and it sets, from the `VIEWPORT_PRESETS` entry:
   - RGB transfer function and scalar-opacity piecewise function, both remapped into
     a _shift range_ centred on zero rather than into the volume's real HU range;
   - **gradient opacity** — `setUseGradientOpacity(0, true)` plus min/max
     value/opacity;
   - `setShade(preset.shade === '1')` and `ambient` / `diffuse` / `specular` /
     `specularPower`;
   - `setInterpolationTypeToFastLinear()` when `preset.interpolation === '1'`.

Both the gradient-opacity term and the full Phong model are unique to the two vtk
paths — the mview raymarcher replicates neither.

## Interaction

`TrackballRotateTool.preMouseDownCallback` finds the actor's mapper, multiplies
`sampleDistance` by `rotateSampleDistanceFactor` (default **2**), and restores the
original on `mouseup`. So interactive degradation here is _ray-step_ degradation only —
resolution stays at full device pixels throughout the drag.

`_dragCallback` rotates the VTK camera about the canvas-centre world point
(`forwardV` then `rightV`) and calls `viewport.render()`.

## Removal

`removeStreamingSubscriptions()` then `renderer.removeVolume(actor)`. The shared
texture and the volume stay in cache for other viewports.

## Notable characteristics vs the other two

- Only path with progressive display.
- Only path with zero scalar-data duplication (shared GPU texture).
- Only path whose still-frame quality is _not_ explicitly downscaled anywhere.
- Participates fully in the engine's actor model, so SEG/RT overlays, geometry
  actors, `getActors()` / `getDefaultActor()` and every actor-based tool work
  unchanged.
