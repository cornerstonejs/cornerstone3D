# Volume3D performance comparison — why mview > gpu > gl

Companion to [`RENDERING-Volume3D-overview.md`](./RENDERING-Volume3D-overview.md).
This explains the two observed gaps:

- **mview is ~2× faster than gpu on low-end hardware**
- **gpu is significantly faster than gl during interaction**

Short version: almost none of the gap comes from mview having a leaner shader — per
sample it is actually _more_ expensive than vtk's. The gap comes from **how many
samples get taken**, **how early rays terminate**, and **fixed per-frame overhead**.
Two of the three are consequences of behavioural differences documented in the
overview's preset-fidelity section, not free wins.

## Things that are NOT the explanation

Worth stating up front, because they're the intuitive guesses and they're all wrong here.

**Texture format is identical.** mview uploads `r16float`
(`volume-data.js`,
`normalizeVolume`). vtk.js WebGPU maps `SHORT`/`UNSIGNED_SHORT`/`FLOAT` to
`r16float` too (`Rendering/WebGPU/TextureManager.js` `_fillRequest`, and
`Texture.js` half-float-converts on upload). Same 2 bytes/voxel, same linear
filtering, same bandwidth per fetch.

**mview's per-sample shader is not cheaper.** Per contributing sample, with shading on:

|                           | volume fetch | transfer fn                                                          | gradient                                                         | total |
| ------------------------- | ------------ | -------------------------------------------------------------------- | ---------------------------------------------------------------- | ----- |
| gpu (`VolumePassFSQ`)     | 1            | 2 (`tfunTexture` rgba8unorm + `ofunTexture` r16float, both filtered) | **3** — forward differences, reuses the already-fetched `scalar` | **6** |
| mview (`compositeRender`) | 1            | 1 (`textureLoad`, unfiltered)                                        | **6** — central differences, `sampleVolume(p±dx/dy/dz)`          | **8** |

mview saves one filtered TF fetch and spends three extra volume fetches on a
symmetric gradient. Net: mview is _more_ fetch-heavy per shaded sample.

**Early-termination thresholds are effectively the same.** mview breaks at
`accumulatedAlpha > 0.985`; vtk breaks at `computedColor.a > 0.98`
(`VolumePassFSQ.js:348`).

## 1. Early ray termination — the largest single factor

This one is a direct consequence of mview having no sample-distance opacity
correction (see the overview). The vtk paths bake
`α' = 1 - (1-α)^(sampleDistance/unitDistance)` into the opacity table; mview uses the
preset's alpha raw.

For CT-Bone (peak scalar opacity 0.7157) at a typical 0.4 mm sample distance and
vtk's default unit distance of 1.0:

|          | per-sample α                   | samples to reach the early-out   |
| -------- | ------------------------------ | -------------------------------- |
| gpu / gl | `1-(1-0.7157)^0.4` = **0.395** | `ln(0.015)/ln(0.605)` ≈ **8.4**  |
| mview    | **0.7157**                     | `ln(0.015)/ln(0.2843)` ≈ **3.3** |

So through bone, mview's rays terminate in roughly **2.5× fewer samples**. Rays that
only cross air and soft tissue don't terminate early in either renderer, so the
whole-frame effect is smaller than 2.5× — but for a bone-preset CT, where a large
fraction of pixels hit dense structure, this alone gets most of the way to the
observed 2×.

It is not free performance: it is the same defect that makes mview render more opaque
than the vtk paths. Fixing the opacity correction will cost most of this speedup.

## 2. Interactive sample count

Worked example — 1280×720 viewport at dpr 1, CT 512×512×300 at 0.7/0.7/1.0 mm
(physical 358×358×300, diagonal 589 mm, `sampleDistance = (0.7+0.7+1.0)/6 = 0.4`):

|                                | pixels rendered                                     | steps/ray                                         | samples/frame |
| ------------------------------ | --------------------------------------------------- | ------------------------------------------------- | ------------- |
| **gl** interactive             | 921 600 (full — no downscale)                       | 589/0.8 ≈ **736** (tool doubles `sampleDistance`) | **678 M**     |
| **gpu** interactive            | 230 400 (`initialInteractionScale(4)` ⇒ ½ per axis) | ≈ **736**                                         | **170 M**     |
| **mview** interactive          | 759 900 (`pixelBudget 760 000`)                     | **136** (fixed)                                   | **103 M**     |
| **gpu** still                  | 921 600                                             | 589/0.4 = **1473**                                | **1.36 G**    |
| **mview** still, quality `t=1` | 921 600 (`minimumScale 1`)                          | `ceil(589/0.4)` = **1473**                        | **1.36 G**    |

Two things fall out of this table.

**During interaction the two renderers make opposite trades.** gpu keeps the ray
sampling dense and throws away resolution (¼ the pixels); mview keeps most of the
resolution and throws away ray steps (5.4× fewer). mview's 1.65× fewer samples,
multiplied by the earlier termination in §1 and the overhead in §3, is the ~2×.

**At still quality `t=1` the sample counts are identical by construction** —
`ohifLikeStillSteps` deliberately reproduces `ceil(diagonal / ((sx+sy+sz)/6))`. So at
default present quality on a settled frame, mview has _no sampling advantage left_,
and given §"Things that are NOT the explanation" it may well be slower than gpu.

That gives you a clean diagnostic: **if you measure ~2× on still frames at quality 1,
the gap is coming from §1 (early termination) and §3 (fixed overhead), not from
sampling.** If you measure it during rotation, §2 dominates.

## 3. Fixed per-frame overhead

Per presented frame:

|           | render passes                                                                  | full-size intermediate targets                                   | CPU work per frame                                                                                                                                                                  |
| --------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **mview** | **1** — `beginRenderPass`, `draw(3)`, straight to the swapchain (`bgra8unorm`) | **none**                                                         | write 128 B of uniforms                                                                                                                                                             |
| **gpu**   | **3** — depth-bounds, raycast, composite copy                                  | 2× `r16float` (min/max depth) + 1× `rgba16float` (volume colour) | full scene-graph `traverseAllPasses()`, UBO/SSBO updates, bind-group rebuilds, **and a CPU-side rebuild of each volume's 12-edge bounding-box triangle list** (`renderDepthBounds`) |

vtk's `VolumePass.traverse` (`Rendering/WebGPU/VolumePass.js:146-224`) runs, in order:
`initialize` → `computeTiming` → `renderDepthBounds` (rasterises the box geometry into
paired min/max depth textures via `outColor1`/`outColor2`) → `rayCastPass` (the FSQ
raymarch into an `rgba16float` colour texture) → `_volumeCopyQuad` (fullscreen
composite into the renderer's colour target).

mview computes ray entry/exit analytically in the shader instead — `intersectBox()`
is about ten ALU ops and zero bandwidth, replacing gpu's entire geometry pre-pass and
its two texture reads per pixel (`maxTexture`/`minTexture` at
`VolumePassFSQ.js:361-362`).

Bandwidth cost of the intermediates at 1280×720: gpu writes 7.4 MB of `rgba16float`,
reads it back, and writes 3.7 MB of `bgra8unorm`; mview writes 3.7 MB once. On
integrated GPUs with shared memory this is a real fraction of the frame.

**Why this matters disproportionately on low-end hardware:** weak GPUs usually ship
with weak CPUs, and vtk.js's per-frame JS work (scene-graph traversal, dirty checks,
box geometry rebuild) is CPU-bound and does not shrink when you reduce resolution.
As the GPU work scales down with `_useSmallViewport`, the fixed CPU cost becomes a
larger share of the frame — so gpu's frame time flattens out at a floor that mview
doesn't have.

## 4. Why gpu beats gl during interaction

Both use the same vtk volume mapper semantics and the same doubled sample distance
from `TrackballRotateTool`, so **ray sampling per pixel is identical**. The difference
is resolution and presentation.

**gl never reduces resolution.** Both backends gate their interaction downscale on
the same condition — `rwi.isAnimating() && model._lastScale > 1.5`
(`OpenGL/VolumeMapper.js:802`, `WebGPU/VolumePass.js:241`). For gl neither half holds:

- Cornerstone's shared offscreen render window has no interactor driving an animation,
  so `isAnimating()` is false;
- `createVolumeMapper` never calls `setInitialInteractionScale`, leaving it at 1.0,
  which cannot exceed the 1.5 gate even if an interactor were animating.

The same two facts make `getInteractionSampleDistanceFactor()`
(`OpenGL/VolumeMapper.js:790`) inert for gl as well.

The gpu path fixes both deliberately: `applyDefaultSampleDistance` sets
`setInitialInteractionScale(4)` (the code comment in
[`WebGPUVolume3DRenderPath.ts`](https://github.com/mbellehumeur/cornerstone3D/blob/webgpuSpike/packages/core/src/RenderingEngine/GenericViewport/Volume3D/WebGPUVolume3DRenderPath.ts) calls out that the
default 1.0 "never opens that gate"), and `beginWebGPUViewportAnimation` flips
`isAnimating` via the detached interactor's `switchToXRAnimation()`. Result: **¼ the
pixels during a drag**, i.e. ~4× fewer samples than gl.

**gl blits every frame.** `ContextPoolRenderingEngine._copyToOnscreenCanvas` does a
per-frame `onScreenContext.drawImage(offScreenCanvas, …)` at full viewport size from
the shared offscreen WebGL canvas to the viewport's 2D canvas. gpu presents directly
to its own attached WebGPU canvas — no copy, and the code notes no GPU fence wait
either. gl also pays this at _full_ resolution precisely because of the point above.

**gl shares a context pool.** The offscreen multi-render-window is shared across
viewports (`WebGLContextPool`), so several 3D or MPR viewports serialise onto the same
context and framebuffer. Each gpu viewport gets a private device and canvas.

**gpu self-tunes, gl can't.** `computeTiming` adjusts `_lastScale` from measured frame
rate against `getDesiredUpdateRate()`, up to a cap of 400, so on genuinely slow
hardware gpu degrades further automatically. (This is also why
`webgpuViewportRenderWindow.ts` uses `switchToXRAnimation` rather than
`requestAnimation` — an interactor RAF loop would double-render and report a falsely
high frame rate, collapsing the adaptive scale back to full resolution.)

## Summary

| Factor                                  | mview vs gpu                                                       | gpu vs gl                               |
| --------------------------------------- | ------------------------------------------------------------------ | --------------------------------------- |
| Ray early-termination                   | ~2.5× fewer samples in opaque regions (missing opacity correction) | equal                                   |
| Interactive steps/ray                   | 136 vs ~736 (5.4× fewer)                                           | equal (both doubled by the tool)        |
| Interactive resolution                  | 760k px vs 230k px (mview renders _more_ pixels)                   | 230k vs 922k px (4× fewer)              |
| Still-frame sampling at default quality | **identical by construction**                                      | equal                                   |
| Per-sample fetches                      | 8 vs 6 (mview worse)                                               | equal                                   |
| Render passes / frame                   | 1 vs 3                                                             | 3 vs 1 (+ a full-size `drawImage` blit) |
| Per-frame CPU                           | ~none vs full vtk traversal                                        | equal-ish                               |
| Present                                 | direct to swapchain                                                | direct vs offscreen blit                |

## 5. Improving gl interaction-frame performance

gl's interactive frame is currently the worst of the three by a wide margin — full
resolution, ~736 steps/ray, plus a full-size blit — and the fix is mostly _turning on
machinery that already exists but is gated off_.

### 5a. Enable the downscale vtk.js already implements (cheapest, biggest win)

Both halves of the `isAnimating() && _lastScale > 1.5` gate fail for gl. Fixing them:

| Change                                                                | Where                                                                                                                                             | Note                                               |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `volumeMapper.setInitialInteractionScale(4)`                          | `createVolumeMapper.ts`, or per-viewport in `VtkVolume3DRenderPath.addData` mirroring `applyDefaultSampleDistance`                                | default is 1.0, which can never clear the 1.5 gate |
| Make the offscreen render window report `isAnimating()` during a drag | a detached `vtkRenderWindowInteractor` on the offscreen window + `switchToXRAnimation()`, exactly as `webgpuViewportRenderWindow.ts` already does | see the caveat below                               |

**This is blit-compatible.** `renderPieceFinish` (`OpenGL/VolumeMapper.js:904-930`)
renders the volume into a smaller framebuffer and then **upscales it back into the
full-size framebuffer with a copy shader** before the pass ends. The offscreen canvas
therefore still holds a full-resolution image, so
`ContextPoolRenderingEngine._copyToOnscreenCanvas`'s fixed
`sWidth`/`sHeight` source rectangle stays valid. No change is needed on the
Cornerstone blit side to adopt this.

**Caveat — the offscreen window is shared.** Unlike the WebGPU path (one private
window per viewport), the WebGL offscreen multi-render-window is shared across a
`WebGLContextPool` context. `isAnimating()` is a property of that shared window, so
flipping it during a 3D drag would also put every other viewport on the same context
into interaction mode. Two ways out: scope the flag by rendering interaction frames
for the dragged viewport only (the engine already renders per-viewport), or accept it
— MPR panes downscaling briefly during a 3D rotate is usually invisible. Also note
`_smallViewportWidth/Height` is computed from `getFramebufferSize()` — the whole
pooled framebuffer — not the viewport sub-rect, so verify framing on a multi-viewport
layout before shipping.

`interactionSampleDistanceFactor` defaults to 1.0, so enabling `isAnimating` does
**not** silently double-count against the tool's existing `sampleDistance × 2`. Raise
it deliberately if you want the ray-step trade too.

### 5b. Cut the blit

`_copyToOnscreenCanvas` does a full-viewport `drawImage` every frame.
`drawImage` already takes independent source and destination rectangles, so if the
interaction frame were rendered at reduced size you could blit _small → full_ and let
the 2D context do the upscale — skipping vtk's internal copy-shader upscale entirely
and moving one full-resolution pass off the GPU. This needs
`_copyToOnscreenCanvas` to learn the current interaction scale, which is the one
Cornerstone-side change in this list.

### 5c. Halve texture bandwidth

`createVolumeActor` already honours
`getConfiguration().rendering.preferSizeOverAccuracy` →
`volumeProperty.setPreferSizeOverAccuracy(true)`, which drops the scalar texture to
8-bit. On bandwidth-bound integrated GPUs that is close to a 2× on the sampling
inner loop. It is a global accuracy trade rather than an interaction-scoped one, so it
belongs in the "if the deployment can accept it" bucket — but it is already wired.

### 5d. Expected effect

Same worked example (1280×720 dpr 1, CT 512×512×300 at 0.7/0.7/1.0 mm):

| gl configuration                               | pixels  | steps/ray | samples/frame | vs today |
| ---------------------------------------------- | ------- | --------- | ------------- | -------- |
| today                                          | 921 600 | 736       | **678 M**     | —        |
| + `initialInteractionScale(4)` + animating     | 230 400 | 736       | **170 M**     | 4.0×     |
| + `interactionSampleDistanceFactor(2)` as well | 230 400 | 368       | **85 M**      | 8.0×     |

The first row of that table is simply "reach parity with gpu", and it is two setter
calls plus an interactor.

## 6. Improving gpu interaction-frame performance

### 6a. Coalesce presents to animation frames (highest value, lowest risk)

**gpu is the only one of the three that does not RAF-coalesce its renders.**

- gl: `viewport.render()` → `renderingEngine.renderViewport(id)` →
  `_setViewportsToBeRenderedNextFrame()` → batched behind `_animationFrameSet` /
  `requestAnimationFrame` (`BaseRenderingEngine.ts:663-686`).
- mview: `renderer.requestRender()` sets `renderPending` and defers to a single RAF.
- gpu: `viewport.render()` → `renderBindings()` → `renderWebGPUViewportWindow()` →
  `view.traverseAllPasses()` — **synchronous, every call**.

`TrackballRotateTool._dragCallback` calls `viewport.render()` once per mousemove
event. Mice commonly report at 125 Hz and gaming mice at 500–1000 Hz, against a 60 Hz
display. On low-end hardware where a 3-pass raymarch takes 30–50 ms, gpu can be
issuing several complete frames per displayed frame, all but the last discarded.

Wrapping the WebGPU present in the same `renderPending` + RAF pattern mview already
uses is a small, self-contained change in `WebGPUVolume3DRenderPath.render()` (or in
`renderWebGPUViewportWindow`), and on drag-heavy workloads it may be worth more than
everything else in this section combined. It also costs nothing in image quality.

### 6b. Trade ray steps for pixels — gpu is currently on the wrong side of this

Today gpu keeps ~736 steps/ray while dropping to ¼ resolution; mview does the
opposite (136 steps at ~0.6 scale) and is preferred by users during rotation. For
judging shape and orientation while the volume is moving, coarse sampling _along the
ray_ is far less objectionable than coarse sampling in screen space.

Levers, in increasing intrusiveness:

- `mapper.setInteractionSampleDistanceFactor(3)` — applied by
  `getCurrentSampleDistance` whenever `isAnimating()`, and it composes with the
  tool's existing `× 2` for an effective 6×.
- Or raise `TrackballRotateTool`'s `rotateSampleDistanceFactor` (default 2) for
  WebGPU-backed viewports.

**This is a lever gl/gpu have and mview does not.** Because the vtk paths bake the
sample-distance opacity correction into the opacity table
(`α' = 1-(1-α)^(sampleDistance/unitDistance)`), changing sample distance degrades
_detail_ without changing apparent _density_. mview, lacking that correction, cannot
reduce its step count without the volume visibly thinning out — which is exactly why
its interactive and still frames look different densities. gpu can crank sample
distance aggressively during interaction and settle back with no brightness pop.

### 6c. Raise the resolution scale

`setInitialInteractionScale(4)` gives ½ per axis. Going to 9 gives ⅓ per axis. The
adaptive loop in `computeTiming` will tune `_lastScale` from measured frame rate
anyway (clamped to `[1.5, 400]`), but the _initial_ value governs the first frames of
every drag — which is precisely when lag is perceived. Since `_lastScale` lives on the
model it persists across drags, so this mostly matters for the first interaction after
mount.

### 6d. Attack the fixed per-frame cost (needs vtk.js changes)

These are the costs that do _not_ shrink when you downscale, so they set the floor and
dominate exactly when 6a–6c have done their job:

| Cost                                                                                     | Possible change                                                                                                                                                 |
| ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Depth-bounds pre-pass (rasterises box geometry into paired `r16float` min/max targets)   | replace with an analytic ray/box intersection in the FSQ shader — mview's `intersectBox()` is ~10 ALU ops and zero bandwidth. Biggest structural win available. |
| CPU rebuild of each volume's 12-edge box triangle list every frame (`renderDepthBounds`) | cache it — it depends only on the volume bounds, which don't change during a rotate                                                                             |
| `rgba16float` intermediate + `_volumeCopyQuad` composite                                 | render straight to the renderer's colour target when there is a single volume and nothing depth-composited over it                                              |
| Full `traverseAllPasses()` scene-graph walk                                              | cache the pipeline/bind groups across frames when nothing is dirty                                                                                              |

All four require a vtk.js fork or an upstream contribution, which is why they are
listed after the Cornerstone-side options.

### 6e. Expected effect

| gpu configuration                      | pixels  | steps/ray | samples/frame | vs today |
| -------------------------------------- | ------- | --------- | ------------- | -------- |
| today                                  | 230 400 | 736       | **170 M**     | —        |
| + effective sample-distance × 6        | 230 400 | 245       | **56 M**      | 3.0×     |
| + `initialInteractionScale(9)` as well | 102 400 | 245       | **25 M**      | 6.8×     |
| mview today, for reference             | 759 900 | 136       | 103 M         | —        |

Plus 6a's elimination of redundant frames and 6d's reduction of the per-frame floor,
neither of which shows up in a sample count.

## 7. A separate interaction renderer

Worth treating as a real option — the upstream mview README names "separate pixel and
ray-step budgets for interaction and still frames" as the most promising thing to
upstream, and the plumbing is largely in place already.

### 7a. Same renderer, separate profile (recommended first)

Sections 5 and 6 are exactly this, without a second renderer: one mapper, two quality
profiles, switched by `isAnimating`. It gets most of the benefit and introduces no
image-consistency problem, because interaction and still frames come out of the same
shader. Given 6b, gpu can be driven to mview-like interactive cost while keeping
identical still-frame output.

### 7b. mview for interaction, vtk for the still frame

Architecturally coherent, and the mechanism mostly exists: both canvases already
coexist in the viewport element (WebGPU at `z-index 0`, mview at `z-index 1`), and
`setRenderModeVisibility` already swaps which is visible and which renderer the
context points at. A drag would show mview; mouseup would settle to the vtk WebGPU
frame.

Concrete blockers, in order:

1. **The settle would pop.** The two do not render the same image — different opacity
   handling and different shading (see the overview's preset-fidelity section). Until
   mview gains sample-distance opacity correction and the preset's
   ambient/diffuse/specular terms, the transition would be a visible brightness and
   shading jump, which is worse than a slow drag.
2. **Two GPU devices per viewport.** mview calls `navigator.gpu.requestAdapter()` /
   `requestDevice()` itself and `dispose()` destroys the device; vtk.js owns its own.
   Sharing one device would mean teaching `VolumeRenderer` to accept an external
   `GPUDevice`.
3. **Two copies of the volume in VRAM.** Both upload `r16float`. Avoidable only if
   `VolumeRenderer` could bind an externally-owned `GPUTexture` rather than calling
   `setVolume`.
4. **Camera round-trip fidelity.** `iCameraToFuberlinCamera` clamps zoom to
   `[0.05, 2]` and pan to `±2` and silently zeroes out-of-range pan; a drag that
   leaves those bounds would move the mview view differently from the vtk view, so
   the settle would jump position as well as brightness.

None are fundamental, but together they are considerably more work than 5a + 6a + 6b.

### 7c. LOD volume — applies to both gl and gpu

Independent of which renderer draws the interaction frame: keep a half-resolution copy
of the volume (⅛ the voxels) and bind it during interaction. On bandwidth-bound
integrated GPUs this is often a larger win than resolution scaling, because it
improves texture-cache hit rate rather than just reducing fetch count — and unlike
resolution scaling it composes with everything above. Cost is +12.5 % VRAM and one
downsample pass after `IMAGE_VOLUME_LOADING_COMPLETED`. For gpu it slots in beside the
existing `acquireWebGPUMapperImageData` materialisation, which already owns a
ref-counted per-volume copy and would be the natural place to build and cache it.

This is also the entry point to the volume-size ceiling rather than just the frame
rate: the same reduced volume that serves as an interaction LOD is what makes
oversized studies renderable at all. See
[`RENDERING-large-volumes.md`](./RENDERING-large-volumes.md).

## Measuring this properly

`VolumeRenderer.getStats()` returns `{ fps, frameMs, gpuWaitMs, width, height, steps,
scale, mode, interacting }`, and `options.onStats` streams it. Note the upstream
README's warning: `fps` measures render-_request_ cadence and `gpuWaitMs` is an
occasional `onSubmittedWorkDone` drain sampled every 20th frame — neither is a
hardware-independent GPU benchmark. For a real comparison use WebGPU timestamp
queries and report adapter, canvas size, and quality settings.

For an apples-to-apples A/B, pin all of: canvas CSS size and DPR, camera and
projection, transfer function, still/moving state, and — critically — present quality
`t = 1` on the mview side so the step counts match. Even then the opacity-correction
difference means the two are not rendering the same image, so a pure FPS number
overstates mview by whatever §1 is worth on your data.
