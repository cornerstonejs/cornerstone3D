# `webgpuVolume3d` — vtk.js WebGPU volume rendering ("gpu")

Source: [`WebGPUVolume3DRenderPath.ts`](https://github.com/mbellehumeur/cornerstone3D/blob/webgpuSpike/packages/core/src/RenderingEngine/GenericViewport/Volume3D/WebGPUVolume3DRenderPath.ts)
Supporting: [`../Planar/webgpuViewportRenderWindow.ts`](https://github.com/mbellehumeur/cornerstone3D/blob/webgpuSpike/packages/core/src/RenderingEngine/GenericViewport/Planar/webgpuViewportRenderWindow.ts),
[`../webgpuMapperImageData.ts`](https://github.com/mbellehumeur/cornerstone3D/blob/webgpuSpike/packages/core/src/RenderingEngine/GenericViewport/webgpuMapperImageData.ts)
Selected by: `?viewportRendering=webgpu` (⇒ `webgpuVolume3d`) or
`?renderMode=webgpuVolume3d`.

Same vtk.js scene graph and same `vtkVolumeMapper` API as the WebGL path, but
rendered through vtk.js's **WebGPU view API** (`vtkWebGPURenderWindow` +
`VolumePass`) in a render window that Cornerstone owns privately, outside the
engine's WebGL context pool.

## Its own render window

`acquireWebGPUViewportWindow(viewportId)` builds, per viewport and reference-counted:

- a core `vtkRenderWindow`;
- a `vtkWebGPURenderWindow` view (`@kitware/vtk.js/Rendering/WebGPU/Profiles/All`
  registers the WebGPU view-node overrides);
- one `vtkRenderer`, background resolved from the viewport's `defaultOptions.background`
  so it clears the same colour the WebGL renderer would, `parallelProjection(true)`;
- a **detached `vtkRenderWindowInteractor`** — created and `initialize()`d but never
  bound to DOM events. It exists solely because
  `VolumePass.computeTiming` dereferences `getInteractor().isAnimating()`.

The WebGPU canvas is attached directly into the viewport element by
`attachWebGPUViewportCanvas` (absolute, full-bleed, `z-index: 0`) and _is_ the present
surface — no CPU 2D blit, no GPU fence wait. `setRenderModeVisibility` hides the
shared WebGL canvas (`display:none`) while this mode is active.

Release is deferred by 50 ms (`releaseWebGPUViewportWindow`) so a rapid MPR ↔ 3D
layout switch reuses the same device/canvas, and so in-flight `onInitialized`
callbacks observe the `destroyed` flag before objects are torn down.

`globalThis.__cs3dWebGPUWindows` exposes the map for devtools inspection.

## Scalar data: a separate materialised copy

This is the biggest functional divergence from the WebGL path.

`acquireWebGPUMapperImageData(volumeId, imageVolume)` creates a **second
`vtkImageData`** with the source's dimensions/spacing/direction/origin but a
_contiguous_ scalar array produced by `getVolumeScalarArray()`:

1. `voxelManager.getCompleteScalarDataArray()` if it returns something non-empty;
2. otherwise assemble slice-by-slice from `cache.getImage(imageId)` — needed because
   CS's complete-array helper resolves the TypedArray constructor from slice 0 only,
   and progressive loads often fill middle slices first;
3. otherwise the source point-data scalars, then `voxelManager.getScalarData()`.

The entry is ref-counted per volumeId (materialising is a full volume copy, so all
render paths on that volume share one instance) and released on `removeData`.

Because that copy is expensive, **scalars are uploaded once, not progressively**:

- `subscribeToVolumeEvents` refreshes only on `IMAGE_VOLUME_LOADING_COMPLETED`, or on
  `IMAGE_VOLUME_MODIFIED` _after_ completion has been seen (retry when the first
  materialise failed), guarded by `refreshedAfterLoad`;
- `imageVolume.load(cb)` also refreshes on its completion callback;
- only a genuine refresh triggers `ctx.display.renderNow()` — progressive
  `IMAGE_VOLUME_MODIFIED` events do **not** trigger raycasts.

`renderNow()` (not `requestRender()`) is used deliberately: `requestRender` blits the
hidden OpenGL canvas, which is not the present surface here.

## Actor / mapper setup

```
vtkVolume + vtkVolumeMapper (plain, not the shared mapper)
mapper.setInputData(mapperImageData)
property.setIndependentComponents(false)
initializeDefaultTransferFunction(actor, imageVolume)
```

`initializeDefaultTransferFunction` reads `voxelManager.getRange()` and installs a
linear RGB transfer function plus a **flat 0.9 opacity ramp**, so the volume is
visible before OHIF's hanging protocol applies a preset. It avoids
`updateOpacity()` on purpose — that helper reads voxelManager metadata in a shape the
materialised clone does not reliably match. For the same reason `applyDataPresentation`
wraps `updateVolumeOpacity` in a `try/catch` and keeps the actor visible on failure.

`applyDefaultSampleDistance(mapper)`:

- `sampleDistance = (sx + sy + sz) / 6` (same as the WebGL default)
- `maximumSamplesPerRay = 4000`
- **`setInitialInteractionScale(4)`** — vtk's `VolumePass` only downscales while
  `isAnimating && _lastScale > 1.5`, and the stock `initialInteractionScale` of 1.0
  never opens that gate. `4` gives half-resolution per axis during interaction;
  settled frames return to full DPR because `isAnimating` is false outside a drag.

## Camera pinning

`selectContext` deliberately returns the **root** `vtk` handle rather than a copy, and
`addData` / `applyViewState` then call `pinContextToWindow(ctx)`, which sets
`ctx.vtk.renderer = window.renderer` and `ctx.vtk.canvas = window.view.getCanvas()`.

This is the fix for a real bug: with a copied `{ renderer }` object, the viewport's
`getViewState` / `setViewState` / `resetCamera` read and wrote the hidden OpenGL
camera, and a later `applyViewState` clobbered the WebGPU camera — blank display.
`setRenderModeVisibility` re-points the same fields when switching into this mode.

Clipping range handling is identical to the WebGL path
(`setVtkCameraClippingRange` + `resetCameraClippingRange`).

## Present

`render()` → `renderWebGPUViewportWindow(window, ctx.cpu.canvas)`:

- present size comes from the **cpuCanvas bitmap size**, which `syncPresentSize()`
  keeps at `element.clientSize × devicePixelRatio` — the cpuCanvas is never drawn to
  in 3D, it is just the size authority;
- `view.setSize(w, h)` only when it changed, then `view.traverseAllPasses()`;
- if the device is not yet initialised, a traverse is issued to kick adapter
  acquisition and a `view.onInitialized` subscription retries once; teardown races
  are swallowed.

`resize()` is just `render()`. `VolumeViewport3D.renderBindings()` returns true for
this path, so the engine frame loop is skipped and `IMAGE_RENDERED` is fired manually
by the viewport.

## Interaction

`TrackballRotateTool` takes its normal actor/mapper branch (there _is_ a real mapper),
so it applies `sampleDistance × rotateSampleDistanceFactor` **and** calls
`beginWebGPUViewportAnimation(viewport.id)` / `endWebGPUViewportAnimation` on mouseup.

Those use `interactor.switchToXRAnimation()` / `returnFromXRAnimation()` rather than
`requestAnimation()` on purpose: Cornerstone owns presents on the WebGPU canvas, and
an interactor RAF loop would double-render and fake a high frame rate — which
collapses `VolumePass`'s adaptive scale straight back to full resolution.

Net effect during a drag: half-res per axis **and** doubled sample distance.

## Appearance

Same as the WebGL path — a real `vtkVolume` actor, so `csUtils.applyPreset` applies the
full `VIEWPORT_PRESETS` entry: colour, scalar opacity, gradient opacity, shade, and the
ambient/diffuse/specular terms. Shading is executed by vtk.js's WebGPU `VolumePass`
(`VolumePassFSQ`), not by the WebGL shaders.

## Teardown

`removeData` removes the volume from the WebGPU renderer, releases the window
(deferred destroy) and releases the shared mapper imageData entry. The `GPUDevice`
belongs to vtk.js and is destroyed with the view.

## Notable characteristics

- Full vtk.js scene graph and preset fidelity, but **no progressive display** and a
  **full extra CPU copy** of the volume scalars.
- Presents directly to its own canvas; the engine's WebGL render/blit cycle never
  touches the viewport.
- Two independent interactive-quality levers (resolution scale + sample distance).
- `getWebGPUViewportDebugInfo(viewportId)` reports `viewApi`, `initialized` and the
  adapter string for debug panels.
