# `fuberlinVolume3D` — mview standalone WebGPU raymarcher ("mview")

Source: [`FuberlinVolume3DRenderPath.ts`](https://github.com/mbellehumeur/cornerstone3D/blob/webgpuSpike/packages/core/src/RenderingEngine/GenericViewport/Volume3D/FuberlinVolume3DRenderPath.ts)
Supporting: [`fuberlinVolume3DRegistry.ts`](https://github.com/mbellehumeur/cornerstone3D/blob/webgpuSpike/packages/core/src/RenderingEngine/GenericViewport/Volume3D/fuberlinVolume3DRegistry.ts),
[`fuberlinVolume3DCamera.ts`](https://github.com/mbellehumeur/cornerstone3D/blob/webgpuSpike/packages/core/src/RenderingEngine/GenericViewport/Volume3D/fuberlinVolume3DCamera.ts),
[`fuberlinViewportPreset.ts`](https://github.com/mbellehumeur/cornerstone3D/blob/webgpuSpike/packages/core/src/RenderingEngine/GenericViewport/Volume3D/fuberlinViewportPreset.ts)
Renderer package: `@mview/webgpu-volume-standalone`
(source: `z:/src/gpu-viewer-3d/mview-webgpu-volume-core`, see its own `README.md`)
Selected by: `?renderMode=fuberlinVolume3D` only — no `viewportRendering` value maps
to it.

This path embeds the FU-Berlin MView quick-viewer's standalone WGSL volume renderer
inside a Cornerstone `VolumeViewport3D`. There is no vtk.js involvement in the
rendering at all: no scene graph, no actor, no mapper, no vtk render window. The VTK
renderer is kept alive purely as the **camera authority** so Cornerstone tools keep
working, and its state is bridged into the mview camera on every change.

> **Build status.** `@mview/webgpu-volume-standalone` is not declared or installed in
> this tree (no dependency entry, no workspace member, no tsconfig path alias, no
> `node_modules/@mview`). It must be linked/vendored before this path compiles.

## The renderer itself (what it does per frame)

One fullscreen triangle, one fragment shader, one uniform buffer (128 B), one
`r16float` 3D texture, one 256×1 `rgba8unorm` transfer LUT
(`VolumeRenderer.js` / `shaders.js`):

- **Box.** The volume is an axis-aligned box in IJK, half-extents
  `(dim·spacing) / max(dim·spacing) × 0.5`. **Image direction and origin are not
  used** — the camera bridge compensates for direction, and origin is irrelevant
  because framing is relative to the volume centre.
- **Ray setup.** Orthographic (`boxHalf.w = 1`): parallel rays, origin offset by
  `screen × halfHeight`, eye distance `|boxHalf| + 1`. Perspective: origin on the
  camera axis at `zoom`, direction through the screen point at `z = -1.7`.
- **`surface` mode.** March until the first sample ≥ `threshold`, refine the crossing
  with 5 bisection steps, then shade at the refined hit: central-difference gradient,
  view-facing normal flip, headlight (`normalize(view + rotate([-0.35, 0.45, 0.8]))`),
  diffuse `0.22 + 0.86·n·l`, specular `pow(n·h, 28) × 0.32`, then a `pow(·, 0.86)`
  gamma tweak. Early ray termination is the whole point of this mode.
- **`composite` mode.** Front-to-back accumulation of the LUT colour/alpha, alpha
  scaled by the global `opacity` uniform, early-out at `accumulatedAlpha > 0.985`,
  optional shade term `rgb *= abs(n · view)` — deliberately the same idea as vtk.js's
  WebGPU `VolumePassFSQ`, and only that term: **gradient opacity is not implemented**
  (the comment notes CT-Bone's gradient opacity is flat, `gomin = gomax = 1`).
- **`mip` mode.** Running maximum, then `transfer.rgb × maximumValue`.
- All three loops are hard-capped at 4000 iterations in WGSL and additionally bounded
  by the per-frame `steps` uniform.

Scalars are normalised on the CPU to IEEE half-float once per `setVolume` and uploaded
in ≤64 MB slabs with 256-byte row alignment. `maxTextureDimension3D` is checked and
shader compilation errors are surfaced as `webgpu-shader-error`.

The renderer requests **its own `GPUAdapter`/`GPUDevice`** and `dispose()` destroys
them — distinct from the vtk WebGPU path, which shares vtk.js's device.

## Mount (`addData`)

1. Hard-fails if `VolumeRenderer.isSupported()` is false.
2. Creates a `<canvas data-fuberlin-volume3d>` appended to the viewport element
   (absolute, full-bleed, `z-index: 1`, `pointer-events: auto`) and sizes its backing
   store to `clientSize × devicePixelRatio`.
3. Constructs the renderer with OHIF-matched defaults:
   `mode: 'composite'`, `threshold: 0.36`, `opacity: 1`, `shade: true`,
   `background: [0,0,0]`, `camera: { projection: 'orthographic', zoom: 0.55 }`.
4. Registers in the module-level registry (`registerFuberlinVolume3D`) with
   `volumePhysicalMax = max(dim·spacing)` and `volumeCenter` (world/LPS), then sets
   present quality to **1 (OHIF)**.
5. Seeds the **CT-Bone** `VIEWPORT_PRESET` so the volume looks right before the
   hanging protocol applies one.
6. Hides any leftover vtk-WebGPU present canvas that could cover it.
7. Applies the initial camera (`getInitialVolume3DCamera`) to the VTK camera and
   bridges it to mview.

The canvas is created with `display: block` (**never** `''` — a canvas defaults to
`inline`, which collapses `clientWidth/Height` and makes `VolumeRenderer.resize()`
present a blank 1×1 frame) but `visibility: hidden` until the first successful upload,
so a partially-loaded, zero-padded volume never flashes as a solid AABB cube.

## Data upload: once, after the load completes

`DefaultVolume3DDataProvider` already called `imageVolume.load()` before `addData`
runs, and `StreamingImageVolume.load()` ignores new callbacks while loading — so
`attachVolumeLoadCallback` pushes onto the in-flight `loadStatus.callbacks` array
when it can, calls back immediately if already loaded, and only falls back to
`load(cb)` otherwise.

`refreshScalars` guards with `uploadInFlight` + `refreshedAfterLoad`, and re-checks
`refreshedAfterLoad` _after_ the await — `load-callback` and `load-completed` can both
enter before either finishes, and without the re-check the post-load pitch runs twice
(+180°).

Progressive `IMAGE_VOLUME_MODIFIED` is ignored until completion has been seen:
each upload copies and converts the whole volume to `r16float`, which measured
~100× slower than the vtk WebGPU path's refresh. Scalars come from the same
`getVolumeScalarArray()` helper the WebGPU path uses.

On successful upload: `setFuberlinVolume3DValueRange`, flush any pending preset,
re-apply present quality (now that real dims/spacing exist), reveal the canvas,
`requestRender()`, `ctx.display.renderNow()`.

## Camera bridge

The VTK camera stays authoritative — `setRenderModeVisibility` keeps
`renderContext.vtk.renderer = defaultVtkRenderer` (only `vtk.canvas` is re-pointed at
the mview canvas). Every `setViewState` / `resetViewState` runs
`syncFuberlinCameraFromViewState()`, and the render path also bridges on
`applyViewState`.

`iCameraToFuberlinCamera` (`fuberlinVolume3DCamera.ts`) does the conversion:

- world/LPS `viewPlaneNormal` and `viewUp` are mapped into the volume's IJK frame with
  the direction cosines (`worldToVolumeAxis`);
- `xAxis = up × z` (screen right, VTK/CS convention), with a perpendicular fallback
  when degenerate;
- `yAxis = -up` — mview's screen Y points down — then re-orthogonalised against Z;
- packed column-wise into the 9-float `orientation` patch.

Framing is bridged **only in orthographic projection** (`includeFraming`):

- `zoom = parallelScale / volumePhysicalMax`, accepted only within `[0.05, 2]`;
- `panX = -offset·right / parallelScale`, `panY = offset·up / parallelScale` where
  `offset = focalPoint - volumeCenter`, accepted only within `±2`, else forced to 0.

The guards exist because out-of-range framing previously blanked the present.

**The +90° pitch.** mview's IJK-aligned present is 90° off the Volume3D default
orientation. `pitchVolume3DCameraUp90` rotates about screen-right
(`vpn' = -up`, `up' = vpn`, position recomputed at the same distance) and is applied
**to the VTK camera** once, after upload, gated by
`APPLY_FUBERLIN_POST_LOAD_PITCH_UP_90` (set `false` to revert to a mount-time pitch).
Applying it to the VTK side rather than only to mview keeps both in the same frame, so
TrackballRotate left/right stays yaw instead of degenerating into roll about the view
axis.

## Quality model

`setFuberlinVolume3DPresentQuality(viewportId, t)` blends **still-frame** quality
between mview's adaptive profile (`t = 0`) and OHIF-matched quality (`t = 1`, the
default). Interactive quality is fixed and cheap either way.

|                | interactive (fixed) | still `t = 0` (mview) | still `t = 1` (OHIF)                                    |
| -------------- | ------------------- | --------------------- | ------------------------------------------------------- |
| `pixelBudget`  | 760 000             | 2 400 000             | 64 000 000                                              |
| `minimumScale` | 0.38                | 0.52                  | 1                                                       |
| `steps`        | 136                 | 224                   | `ceil(diagonal / ((sx+sy+sz)/6))`, clamped `[16, 2048]` |

`pixelBudget` is **log**-lerped so mid-slider values are usable; `minimumScale` and
`steps` are linear-lerped. The still `steps` target approximates
`createVolumeMapper`'s sample density (`sampleDistance = (sx+sy+sz)/6`, ≤4000 samples)
along the volume diagonal — that is what makes `t = 1` comparable with the two vtk
paths. Before upload it falls back to 1024 and is re-applied afterwards.

Adaptive resolution is implemented by **resizing the canvas backing store** inside
`VolumeRenderer.resize()` —
`scale = clamp(sqrt(pixelBudget / (cssW·cssH·dpr²)), minimumScale, maximumScale)` —
not by a separate render target. Note that `FuberlinVolume3DRenderPath.resizeCanvas`
sets the canvas to full `client × dpr` first; the renderer then overrides it with the
quality-scaled size on the next frame.

UI: `FuberlinVolumePresentQuality.tsx` renders a 0–1 "Resolution" slider labelled
MView → OHIF, shown only for `composite` mode, wired to the
`setFuberlinVolumePresentQuality` command.

## Presets and appearance

`applyFuberlinVolume3DPreset` is called by `NextViewportBackend` _before_ it falls
back to the actor-based `csUtils.applyPreset` — this path has no actor. It returns
`true` even when it only stashes the preset (`pendingPreset`), so OHIF does not fall
through to the VTK branch; `flushFuberlinVolume3DPendingPreset` applies it once
`valueRange` is known.

`viewportPresetToFuberlinAppearance` (`fuberlinViewportPreset.ts`) converts a
Cornerstone `VIEWPORT_PRESET`:

- merges `colorTransfer` (HU, r, g, b) and `scalarOpacity` (HU, alpha) by HU into one
  sorted point list;
- normalises each HU to `x = (hu - min) / (max - min)` against the **volume's actual
  scalar range** (`voxelManager.getRange()`);
- clamps to `[0, 1]` and pads endpoints at `x = 0` / `x = 1`;
- `threshold` = normalised position of the first non-zero-alpha HU (default 0.36);
- `shade = preset.shade === '1'`.

Applying a preset also forces `mode: 'composite'` and `opacity: 1`.

### Where this differs from `csUtils.applyPreset`

See [`RENDERING-Volume3D-overview.md`](./RENDERING-Volume3D-overview.md#preset-fidelity-mview-vs-the-two-vtk-paths)
for the full comparison. In short, ranked by visual impact:

1. **No sample-distance opacity correction.** The vtk backends bake
   `α' = 1 - (1-α)^(sampleDistance / scalarOpacityUnitDistance)` into the opacity
   table, making transmittance per _millimetre_. The composite shader uses
   `transfer.a × opacity` raw, making it per _sample_ — so the rendered density
   depends on the step count, and the present-quality slider (224 → ~1500 steps)
   changes how opaque the volume looks, not just how smooth.
2. **Shading.** `rgb *= abs(n·view)` only; the preset's `ambient` / `diffuse` /
   `specular` / `specularPower` are dropped. No ambient floor (silhouettes go black),
   no highlights, and speckle in homogeneous regions where the gradient is noise.
3. **LUT resolution.** 256-entry `rgba8unorm` sampled with `textureLoad` at
   `round(value*255)` — nearest, no interpolation — against vtk's 1024-entry
   linear-filtered tables.
4. **TF domain.** vtk keys on absolute HU; mview keys on the volume's observed
   min/max, so an outlier (metal artefact) compresses the whole preset into part of
   the LUT.

**Gradient opacity is not implemented**, but this is a non-issue in practice: all 26
entries in `VIEWPORT_PRESETS` specify a flat curve (CT-Bone is `'4 0 1 255 1'`,
opacity 1 at both ends), so vtk's gradient-opacity factor is 1 everywhere too.

`threshold` is inert while a preset is applied: `compositeRender` never reads
`uniforms.render.x` — only `surfaceRender` does.

`updateDataPresentation` handles just `visible` (canvas `visibility`, and it refuses
to reveal before `volumeUploaded`) and `opacity` (floored at 0.001).

## Interaction

`TrackballRotateTool.preMouseDownCallback` checks
`beginFuberlinVolume3DInteraction(viewport.id)` **first**; when it returns true the
tool returns early, skipping the mapper/`sampleDistance` branch entirely (there is no
mapper). `endFuberlinVolume3DInteraction` + `viewport.render()` run on `mouseup`.
Those map to `VolumeRenderer.beginInteraction()` / `endInteraction()`, which switch
the quality profile.

Dragging itself is unchanged: `_dragCallback` rotates the VTK camera, and the mview
orientation follows via `setViewState → syncFuberlinCameraFromViewState`.
`rotateFuberlinVolume3D(viewportId, dx, dy, w, h)` exists in the registry as a direct
trackball bridge and is exported from `@cornerstonejs/core`, but the tool does not
currently use it.

## Registry-driven controls

`fuberlinVolume3DRegistry.ts` keeps a `viewportId → { canvas, renderer, … }` map and
exposes the OHIF-facing knobs, surfaced as commands in
`extensions/cornerstone/src/commandsModule.ts`:

| Command                           | Registry function                   | Effect                                              |
| --------------------------------- | ----------------------------------- | --------------------------------------------------- |
| `setFuberlinVolumeRenderMode`     | `setFuberlinVolume3DRenderMode`     | `surface` / `composite` / `mip`                     |
| `setFuberlinVolumeProjection`     | `setFuberlinVolume3DProjection`     | ortho (`zoom = 0.55`) / perspective (`zoom = 1.55`) |
| `setFuberlinVolumeThreshold`      | `setFuberlinVolume3DThreshold`      | normalised `[0,1]` surface/MIP threshold            |
| `setFuberlinVolumePresentQuality` | `setFuberlinVolume3DPresentQuality` | still-quality blend, see above                      |

`setFuberlinVolume3DCanvasVisible` toggles `display` between `block` and `none` —
again never `''`.

## Present and teardown

`render()` is `renderer.requestRender()` — a RAF-coalesced single-frame request; the
engine loop is bypassed and `VolumeViewport3D.render()` fires `IMAGE_RENDERED` itself.
`resize()` re-sizes the canvas and re-requests.

`removeData` unsubscribes, unregisters, `renderer.dispose()` (destroys textures,
buffers, unconfigures the context, destroys the `GPUDevice`) and removes the canvas
from the DOM.

## What this path does not do

No overlay/fusion volumes, no SEG/RT representations, no geometry actors
(`getActors()` returns `[]` for a fuberlin rendering), no MPR, no clipping planes or
crop, no gradient opacity, no independent components / multi-component volumes, no
progressive display, no VOI/colormap/invert presentation (only global opacity), and no
use of image direction or origin inside the renderer.
