# Volume3D rendering paths — overview

> **Where the code is.** These documents are based on the `webgpuSpike` branch in
> [mbellehumeur/cornerstone3D](https://github.com/mbellehumeur/cornerstone3D/tree/webgpuSpike),
> not on `main`. The `fuberlinVolume3D` and `webgpuVolume3d` render paths and their
> supporting modules do not exist on `main` yet, so every source link below points at
> that branch. The docs are proposed against `main` so the analysis and the plan can be
> discussed independently of the spike landing.

`VolumeViewport3D` (`viewport3D.ts`, `ViewportType.VOLUME_3D_NEXT`) hosts three
independent volume-rendering implementations plus a geometry path. Which one runs
is decided per mounted display set by the `renderMode` option, resolved by
`DefaultRenderPathResolver` over `createDefaultVolume3DRenderPaths()`
(`Volume3DRenderPathResolver.ts`):

| `renderMode` wire id | Render path file                | Short name used here |
| -------------------- | ------------------------------- | -------------------- |
| `vtkVolume3d`        | `VtkVolume3DRenderPath.ts`      | **gl**               |
| `webgpuVolume3d`     | `WebGPUVolume3DRenderPath.ts`   | **gpu**              |
| `fuberlinVolume3D`   | `FuberlinVolume3DRenderPath.ts` | **mview**            |
| `vtkGeometry3d`      | `VtkGeometry3DRenderPath.ts`    | (surfaces only)      |

Per-path detail lives in:

- [`RENDERING-vtkVolume3d-webgl.md`](./RENDERING-vtkVolume3d-webgl.md)
- [`RENDERING-webgpuVolume3d.md`](./RENDERING-webgpuVolume3d.md)
- [`RENDERING-fuberlinVolume3D-mview.md`](./RENDERING-fuberlinVolume3D-mview.md)

The sequenced implementation plan derived from all of the below —
phases, the gl-vs-mview performance estimate, and the rendering decision engine — is
[`RENDERING-PLAN.md`](./RENDERING-PLAN.md).

Why the three perform differently — sample counts, ray termination and per-frame
overhead — is worked through in
[`RENDERING-performance-compare.md`](./RENDERING-performance-compare.md), and what
limits renderable volume size (texture dimension caps, CPU/GPU memory, LOD and
bricking options) in
[`RENDERING-large-volumes.md`](./RENDERING-large-volumes.md).

The upstream, OHIF-free version of the mview renderer documents itself in
`z:/src/gpu-viewer-3d/mview-webgpu-volume-core/README.md`. These files are the
OHIF/Cornerstone-tree counterpart: what each path actually does _inside_ a
`VolumeViewport3D`, including the plumbing the standalone renderer has no notion of.

## How a mode gets selected (OHIF side)

1. `genericViewports.enabled` (or `?useNextViewports=true`) must be on, otherwise
   the legacy `VolumeViewport3D` is used and none of this applies.
2. `NextViewportBackend._setNativeVolumeDisplaySets` picks the mode:
   - `getVolume3DRenderModeOverride()` — from `?renderMode=<exact wire id>`
     (`nextViewports.ts`, `VOLUME_3D_RENDER_MODES`) — wins if present;
   - else `viewportRendering=webgpu` ⇒ `webgpuVolume3d`;
   - else `vtkVolume3d`.
     So `fuberlinVolume3D` is reachable only via the explicit `?renderMode=` override.
3. `VolumeViewport3D.resolveRenderMode` only handles `'auto'` (⇒ `vtkVolume3d` when
   the dataset has imageIds, else `vtkGeometry3d`); the backend always passes an
   explicit mode, so this is a fallback for direct API callers.

## What all three share

**Data provider.** `DefaultVolume3DDataProvider` is used for all three: it resolves
a volumeId, `createAndCacheVolume(...)`, and kicks `imageVolume.load()` _before_ the
render path's `addData` runs. Paths that need the callback have to hook the in-flight
`loadStatus.callbacks` list (see the mview path).

**Camera.** The VTK camera is the single source of truth in every mode. Initial
camera comes from `getInitialVolume3DCamera` (`vtkVolume3DInitialCamera.ts`):
orientation from viewport options / `MPR_CAMERA_VALUES` / acquisition direction,
focal point at the volume centre IJK, `parallelScale` from `getCubeSizeInView`
corrected for canvas aspect, camera distance = `10 × bounds radius`, `viewAngle 90`,
`parallelProjection` default `true`. `applyVolume3DCamera` writes it back.
`getZoom`/`setZoom` are `parallelScale` ratios against `initialCamera`.

**Clipping range.** gl and gpu both call `setVtkCameraClippingRange()` then
`renderer.resetCameraClippingRange()`. The tight range matters: vtk volume ray
casting derives its sampling from the clipping range, so leaving it at ±1e6
quantises the ray steps and produces visible banding/streaks.

**Canvas ownership.** `setRenderModeVisibility(renderMode)` picks which surface is
visible and re-points `renderContext.vtk.{canvas,renderer}`:

|       | visible surface                               | `vtk.renderer`                                       | z-index |
| ----- | --------------------------------------------- | ---------------------------------------------------- | ------- |
| gl    | viewport's shared WebGL canvas                | engine renderer                                      | —       |
| gpu   | vtk WebGPU canvas attached to the element     | the WebGPU window's renderer                         | 0       |
| mview | mview's own `<canvas data-fuberlin-volume3d>` | **the default VTK renderer** (camera authority only) | 1       |

`cpuCanvas` is always `display:none` for 3D; it exists as a size authority
(`syncPresentSize()` keeps it at `clientSize × devicePixelRatio`).

**Present loop.** gl goes through the rendering engine's frame loop
(`requestRender` ⇒ `renderingEngine.renderViewport(id)`). gpu and mview are
_self-presenting_: `renderBindings()` returns true, the engine loop is bypassed
entirely, and `VolumeViewport3D.render()` fires `IMAGE_RENDERED` by hand so OHIF
overlays still update.

## Side-by-side behaviour

|                           | **gl** `vtkVolume3d`                                 | **gpu** `webgpuVolume3d`                                  | **mview** `fuberlinVolume3D`                                 |
| ------------------------- | ---------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------ |
| Engine                    | vtk.js WebGL volume mapper                           | vtk.js WebGPU view API (`VolumePass`)                     | hand-written WGSL raymarcher                                 |
| Scene graph               | full vtk.js                                          | full vtk.js                                               | none (one fullscreen triangle)                               |
| Mapper input              | shared `vtkOpenGLTexture` from the streaming volume  | **separate materialised `vtkImageData` clone**            | **`r16float` 3D texture, CPU-normalised**                    |
| Progressive display       | yes — texture updates per slice batch                | no — one upload after load completes                      | no — one upload after load completes                         |
| Present                   | engine blit to on-screen canvas                      | direct to attached WebGPU canvas                          | direct to own WebGPU canvas                                  |
| Interactive degradation   | mapper `sampleDistance × 2`                          | `initialInteractionScale(4)` ⇒ ½ res/axis while animating | pixel budget 760k + `minimumScale 0.38` + 136 steps          |
| Still quality             | `sampleDistance = (sx+sy+sz)/6`, ≤4000 samples/ray   | same, full DPR                                            | blended, default = OHIF-matched (see below)                  |
| Transfer function         | `csUtils.applyPreset` on the actor                   | `csUtils.applyPreset` on the actor                        | `viewportPresetToFuberlinAppearance` ⇒ 256-entry LUT         |
| TF domain                 | absolute HU                                          | absolute HU                                               | volume's observed min/max                                    |
| TF table                  | 1024, linear-filtered                                | 1024, linear-filtered                                     | 256, nearest, 8-bit                                          |
| Opacity correction        | `1-(1-α)^(sampleDist/unitDist)`                      | same                                                      | **none — per-sample, not per-mm**                            |
| Gradient opacity          | yes (flat in all shipped presets)                    | yes (flat in all shipped presets)                         | no (harmless — see below)                                    |
| Shading                   | vtk Phong (`ambient/diffuse/specular/specularPower`) | vtk WebGPU `VolumePass` shade                             | `rgb *= abs(n·view)` (composite) / Blinn-Phong-ish (surface) |
| Extra modes               | blend modes via mapper                               | blend modes via mapper                                    | `surface` / `composite` / `mip`                              |
| Image direction/origin    | honoured                                             | honoured                                                  | **ignored** — box is IJK-aligned, camera bridge compensates  |
| Overlays / SEG / geometry | yes                                                  | yes                                                       | **no**                                                       |
| GPU device                | shared WebGL context pool                            | vtk.js-owned `GPUDevice`                                  | **its own `requestAdapter`/`requestDevice`**                 |

## Preset fidelity: mview vs the two vtk paths

All three are driven by the same `VIEWPORT_PRESETS` entry, but only gl and gpu route
it through `csUtils.applyPreset` on a real `vtkVolume` actor. Two things that look
like divergences are not:

- **The shift range in `applyPreset` is an exact identity round-trip.** It normalises
  each point by `(hu - min)/width` with `min = -center`, `width = 2·center`, then
  `applyPointsToRGBFunction` rescales by `x·width + range[0]` using the same range:
  `((hu + c)/2c)·2c - c = hu`. The transfer functions are installed in **absolute HU**.
- **Gradient opacity is a no-op for every shipped preset.** `applyPreset` calls
  `setUseGradientOpacity(0, true)`, but all 26 presets specify a flat curve
  (CT-Bone: `'4 0 1 255 1'` — opacity 1 at both ends; 21 presets use that exact
  string, the other 5 differ only in the breakpoint position). mview omitting the
  term costs nothing.

The differences that do matter, ranked:

1. **Sample-distance opacity correction.** gl and gpu bake
   `α' = 1 - (1-α)^(sampleDistance / scalarOpacityUnitDistance)` into the opacity
   table (`Rendering/OpenGL/VolumeMapper.js`, `Rendering/WebGPU/VolumePassFSQ.js`), so
   transmittance over a path of length L is `(1-α)^(L/unitDistance)` — independent of
   sample distance. That is why gl can double `sampleDistance` during a rotate without
   the volume going translucent. mview's `compositeRender` uses `transfer.a × opacity`
   raw, so transmittance is `(1-α)^steps`. Concretely: CT-Bone's peak alpha is 0.7157;
   at 0.4mm sampling and vtk's default unit distance of 1.0, vtk's effective
   per-sample alpha is `1-(1-0.7157)^0.4 = 0.395`, while mview uses 0.7157. And
   because the present-quality blend moves the still step count from 224 to
   ~`diagonal/0.4` (~1500 for a typical CT), that slider changes rendered density,
   not just smoothness — as does the interactive/still transition (136 vs ~1500).
2. **Shading model.** CT-Bone is `shade '1'`, `ambient 0.1`, `diffuse 0.9`,
   `specular 0.2`, `specularPower 10`. mview composite implements only
   `rgb *= abs(n·view)`: no ambient floor (silhouettes and grazing surfaces fall to
   black), no specular highlights, `abs()` so front/back gradients shade alike, and
   speckle in homogeneous regions where the central-difference gradient is noise.
   mview's richer `surface` shading is unreachable once a preset forces composite mode.
3. **LUT resolution.** 256 entries, `rgba8unorm`, fetched with `textureLoad` at
   `round(value*255)` — nearest, no interpolation — versus vtk's 1024-entry
   linear-filtered tables. Over CT-Bone's -3024..3071 span that is ~16 HU per bin
   against ~4, so expect banding on the 0 → 0.716 opacity ramp. 8-bit alpha also puts
   the smallest non-zero opacity at 1/255 ≈ 0.004 (and the shader skips below 0.0005).
4. **TF domain anchoring.** mview normalises both the `r16float` texture and the LUT
   x-positions by `voxelManager.getRange()`, so it is self-consistent — but
   data-dependent. A metal artefact pushing the observed max to 10000+ compresses the
   whole preset into the low end of the LUT; a volume whose max sits below the
   preset's top control point collapses every point above it onto `x = 1`.

`threshold` is inert whenever a preset is applied: `compositeRender` never reads
`uniforms.render.x`, only `surfaceRender` does.

## Build-status caveat

`@mview/webgpu-volume-standalone` — imported by `FuberlinVolume3DRenderPath.ts`,
`fuberlinVolume3DRegistry.ts`, `fuberlinVolume3DCamera.ts`, `fuberlinViewportPreset.ts`
and `viewport3DTypes.ts` — is **not declared or installed anywhere in this tree**:
no `package.json` dependency, no workspace entry, no tsconfig path alias, and no
`node_modules/@mview` directory. The package source is
`z:/src/gpu-viewer-3d/mview-webgpu-volume-core` (`"name": "@mview/webgpu-volume-standalone"`,
`private`, `UNLICENSED`). It has to be linked or vendored before the mview path
can build.
