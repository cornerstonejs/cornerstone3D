# Volume rendering improvement plan

Consolidated implementation plan derived from the analysis in this directory. Intended
to be committed together with those four documents as a discussion PR:

- [`RENDERING-Volume3D-overview.md`](./RENDERING-Volume3D-overview.md) — the three
  render paths, how a mode is selected, preset fidelity
- [`RENDERING-vtkVolume3d-webgl.md`](./RENDERING-vtkVolume3d-webgl.md) — **gl**
- [`RENDERING-webgpuVolume3d.md`](./RENDERING-webgpuVolume3d.md) — **gpu**
- [`RENDERING-fuberlinVolume3D-mview.md`](./RENDERING-fuberlinVolume3D-mview.md) — **mview**
- [`RENDERING-performance-compare.md`](./RENDERING-performance-compare.md) — why the
  three differ, and the option lists this plan sequences
- [`RENDERING-large-volumes.md`](./RENDERING-large-volumes.md) — capability limits, LOD,
  bricking, server-side storage

Nothing here is new analysis; it is a sequencing of what those documents establish, plus
the performance estimate requested for the Phase 1–2 deliverable.

## Guiding principle

From the criterion at the top of the large-volumes document: **the target is lossless at
the resolution actually being displayed, up to the full resolution of the device** — not
"always full resolution". With `p` = pane pixels spanned by the volume ÷ voxels across,
a representation with `p ≤ 1` is lossless _for that view_. Two constraints follow and
apply to every phase below:

1. Select the finest level with `p ≤ 1` — round up in resolution, never down.
2. Reductions must be band-limited. Decimation aliases, which fabricates structure
   rather than merely losing it.

A corollary that constrains Phase 1: volume level and render-target scale must be chosen
_together_. For a 512-across volume in a 1024px pane, an interaction scale of 4 already
lands on `p = 1.0` using the full-resolution volume — so no reduced volume is wanted
there.

## Phase overview

| Phase  | Scope                                                            | Touches vtk.js?      | Deliverable                                                |
| ------ | ---------------------------------------------------------------- | -------------------- | ---------------------------------------------------------- |
| **0**  | Rendering decision engine — cross-cutting, grows with each phase | no                   | capability-aware selection + legible failures              |
| **1**  | gl interaction quick wins                                        | no                   | —                                                          |
| **2**  | gl optimisations needing vtk.js                                  | yes                  | **A: interaction-parity release**, testable and measurable |
| **3**  | Surface renderer                                                 | no (new render path) | **B: high-volume interaction mode**                        |
| **4a** | Precomputed hierarchical storage in static DICOMweb              | no (server-side)     | precomputed pyramid + manifest, independently testable     |
| **4b** | Bricked client rendering (MPR then DVR)                          | yes                  | **C: large-volume capability**                             |
| **5**  | WebGPU parity                                                    | yes                  | lower priority                                             |

Phases 1–2 produce a shippable, verifiable performance improvement that **does not**
address large volumes. Phase 3 is the bridge: it helps performance _and_ builds the
acceleration structure Phase 4 needs.

---

## Phase 0 — Rendering decision engine (cross-cutting)

### The gap today

Selection is currently: `?renderMode=` / `viewportRendering=` / appConfig →
a `renderMode` string → `DefaultRenderPathResolver` matching on that string. There is
**no capability probing, no limit checking, and no fallback anywhere in that chain**.
Consequences already identified in the analysis:

- an oversized volume produces a WebGPU validation error (gpu has no
  `maxTextureDimension3D` guard) or a blank viewport, rather than a diagnosable failure;
- `MAX_3D_TEXTURE_SIZE` is never read on the gl side, and is as low as **256** on
  GLES3-class integrated parts — the most common "works here, blank there" cause;
- a deployment configured for `webgpu` on a machine without `navigator.gpu` has no
  defined degradation;
- nothing chooses a resolution level, so the display criterion cannot be applied.

The engine replaces the ad-hoc parts of `nextViewports.ts`
(`resolveViewportRendering`, `resolveVolume3DRenderMode`,
`getViewportRenderingOverride`) — config and URL become _override inputs to a policy_
rather than the whole policy. Overrides must still be able to force a choice for
debugging, but should be validated and logged when they are going to fail.

### Structure

Four separable pieces:

1. **Capability probe** — runs once at init, async (WebGPU adapter acquisition is
   async), caches a synchronous snapshot for use at mount time.
2. **Policy** — a pure function: `(capabilities, request, volume, pane) → decision`.
   Pure so it is unit-testable against recorded capability snapshots from real hardware.
3. **Fallback chain** — ordered, each transition recorded with a reason.
4. **Observability** — the decision and everything it rejected must be inspectable.

### What to probe

| Capability                                     | Source                                                           | Used for                                                                                               |
| ---------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| WebGPU adapter present                         | `navigator.gpu.requestAdapter()`                                 | gpu / mview eligibility (today only `isWebGPURenderingAvailable()`, which just checks `navigator.gpu`) |
| `maxTextureDimension3D`                        | device limits                                                    | the hard cliff — max volume axis, default 2048                                                         |
| `maxSampledTexturesPerShaderStage`             | device limits                                                    | bricks per pass — vtk computes `maxVolumes = this − 4`                                                 |
| `maxBufferSize`, `maxStorageBufferBindingSize` | device limits                                                    | page-table and brick-atlas sizing (Phase 4)                                                            |
| adapter vendor / architecture                  | `adapterInfo` (already surfaced by `getWebGPUViewportDebugInfo`) | integrated-vs-discrete default quality heuristics                                                      |
| WebGL2 context creation                        | `canvas.getContext('webgl2')`                                    | gl eligibility                                                                                         |
| `MAX_3D_TEXTURE_SIZE`                          | `gl.getParameter`                                                | **the gl equivalent of the cliff — often 256**                                                         |
| half-float / float linear filtering extensions | `gl.getExtension`                                                | whether the scalar texture can be filtered at all                                                      |
| `navigator.deviceMemory`                       | browser                                                          | coarse CPU budget against the §1c peaks (gl ~1×, gpu ~2×, mview ~3× the volume)                        |
| measured allocation probe                      | try/catch on a test texture                                      | last-resort VRAM sanity; no reliable VRAM query exists                                                 |

### Policy

**Inputs:** volume dimensions / spacing / dtype; pane size and DPR; view kind (3D DVR,
thin MPR, slab MPR); available server representations (levels, bricks, transposed
stacks); config/URL overrides; interaction state.

**Outputs:** backend, render mode, resolution level, residency scheme (whole volume /
slab / bricks), quality profile.

**Rules**, following the guiding principle:

- Reject any level whose largest axis exceeds the backend's 3D texture cap → step down
  a level, or switch to bricks once Phase 4 exists.
- Choose the finest level with `p ≤ 1` for the current pane — round up in resolution.
- Estimate memory as `voxels × bytesPerVoxel` against a budget derived from adapter
  class and `deviceMemory`; step down if over.
- **The policy must know the view kind.** Per §5b/§5f of the large-volumes doc, MPR must
  never be handed a level below its display need, while 3D can be reduced freely when
  `p ≤ 1`. This is the single most important input, and it is the one the current
  volumeId-keyed cache makes impossible to honour.
- Interaction may step down one level **only when paired with the render-scale
  reduction** — the corollary in the guiding principle. Level and render scale are
  chosen together, never independently.

### Fallback chain

Ordered, with each transition logged:

```
backend:  webgpuVolume3d → vtkVolume3d → (3D: refuse) / (MPR: cpu)
data:     full resolution → reduced level → slab or bricks → refuse
```

Note the asymmetry: there is a CPU planar path (`CpuVolumeSliceRenderPath`,
`PlanarCPUVolumeSampler`) but **no CPU DVR** — `createDefaultVolume3DRenderPaths()`
returns only the two vtk paths, fuberlin and geometry. So the CPU fallback for 3D is
"no 3D", i.e. degrade the layout to MPR only. Worth stating plainly rather than
discovering it at runtime.

**Refusing with a legible error beats a blank viewport.** This is the guard called for
as step 1 of the large-volumes order of work, and it is the cheapest item in this
entire plan.

### Observability

`getRenderingDecision(viewportId)` returning
`{ backend, mode, level, residency, reasons[], rejected[] }` — where `rejected[]`
records what was considered and why it was ruled out. Without this, a wrong decision on
a customer machine is undebuggable. Follow the existing precedent of
`getWebGPUViewportDebugInfo` and the `__cs3dWebGPUWindows` devtools handle.

### How the engine grows

It is introduced as a stub and extended by each phase rather than built once:

| With        | Adds                                                                                                                        |
| ----------- | --------------------------------------------------------------------------------------------------------------------------- |
| **Phase 1** | capability probe, both texture-dimension guards, backend fallback chain, decision record. Small and independently valuable. |
| **Phase 3** | select surface mode when the volume exceeds a size threshold or the frame budget is missed                                  |
| **Phase 4** | level selection by `p`, brick residency, negotiation of the available server representation                                 |
| **Phase 5** | prefer WebGPU once gpu is actually competitive                                                                              |

---

## Phase 1 — gl interaction quick wins (no vtk.js changes)

All of this is machinery vtk.js already implements and Cornerstone currently leaves
inert. Reference: performance doc §5a–5c.

| #   | Change                                                                                                 | Where                                                                                                              | Risk                                                          |
| --- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------- |
| 1.1 | `volumeMapper.setInitialInteractionScale(4)`                                                           | `createVolumeMapper.ts`, or per-viewport in `VtkVolume3DRenderPath.addData` mirroring `applyDefaultSampleDistance` | low — default 1.0 can never clear vtk's `> 1.5` gate          |
| 1.2 | Make the offscreen render window report `isAnimating()` during a drag                                  | detached `vtkRenderWindowInteractor` + `switchToXRAnimation()`, as `webgpuViewportRenderWindow.ts` already does    | **medium — see caveat**                                       |
| 1.3 | `setInteractionSampleDistanceFactor(2)`, composing with the tool's existing `×2`                       | `createVolumeMapper.ts`                                                                                            | low; defaults to 1.0 today so there is no silent double-count |
| 1.4 | Teach `_copyToOnscreenCanvas` the interaction scale so the blit reads a small source rect and upscales | `ContextPoolRenderingEngine.ts`                                                                                    | low                                                           |
| 1.5 | Optional: `preferSizeOverAccuracy` for 8-bit scalar textures                                           | existing config, already wired in `createVolumeActor`                                                              | policy decision, not code                                     |

**Verified compatible:** enabling the downscale does _not_ break Cornerstone's blit.
`renderPieceFinish` (`OpenGL/VolumeMapper.js:904-930`) renders into a smaller
framebuffer and upscales back into the full-size framebuffer with a copy shader before
the pass ends, so the offscreen canvas still holds a full-resolution image and the fixed
`sWidth`/`sHeight` source rect stays valid. Item 1.4 is an optimisation on top, not a
prerequisite.

**Caveat on 1.2 — the offscreen window is shared.** Unlike gpu (one private window per
viewport), the WebGL offscreen multi-render-window is shared across a `WebGLContextPool`
context, so `isAnimating()` is not per-viewport. Flipping it during a 3D drag also puts
other viewports on that context into interaction mode. Two acceptable resolutions:
scope interaction frames to the dragged viewport, or accept that MPR panes briefly
downscale during a 3D rotate (usually invisible). Also verify framing on a
multi-viewport layout: `_smallViewportWidth/Height` is computed from
`getFramebufferSize()` — the whole pooled framebuffer — not the viewport sub-rect.

**gl already RAF-coalesces** (`BaseRenderingEngine` `_needsRender` / `_animationFrameSet`),
so the coalescing fix needed by gpu does not apply here.

### Expected effect

Worked example used throughout: 1280×720 at dpr 1, CT 512×512×300 at 0.7/0.7/1.0 mm
(diagonal 589 mm, `sampleDistance = 0.4`).

| gl configuration         | pixels  | steps/ray | samples/frame | vs today |
| ------------------------ | ------- | --------- | ------------- | -------- |
| today                    | 921 600 | 736       | **678 M**     | —        |
| + 1.1 + 1.2              | 230 400 | 736       | **170 M**     | 4.0×     |
| + 1.3                    | 230 400 | 368       | **85 M**      | 8.0×     |
| _mview today, reference_ | 759 900 | 136       | _103 M_       | —        |

Item 1.4 removes a full-viewport (921 600 px) 2D composite per frame, which does not
appear in a sample count but is real on low-end parts.

---

## Phase 2 — gl optimisations requiring vtk.js changes

Reference: performance doc §6d, which lists these against gpu; the WebGL mapper has a
different and _simpler_ pass structure, so fewer of them apply.

| #   | Change                                                                             | Note                                                                                            |
| --- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| 2.1 | Per-viewport `isAnimating` scoping                                                 | removes the Phase 1 caveat properly rather than tolerating it                                   |
| 2.2 | Avoid the small-viewport copy-shader upscale when the consumer will rescale anyway | with 1.4 in place the engine blit can upscale directly; the intermediate pass becomes redundant |
| 2.3 | Cache pipeline/VAO state across interaction frames                                 | reduces per-frame CPU, which is the floor once resolution is reduced                            |
| 2.4 | Expose empty-space skipping hooks                                                  | not a win on its own; groundwork for Phase 3's min/max grid                                     |

Note what gl does **not** need: it has no separate depth-bounds pre-pass and no
`rgba16float` intermediate + composite quad. Those are gpu-specific costs (performance
doc §3). gl raymarches in the fragment shader over the volume's proxy geometry, so its
fixed per-frame GPU overhead is already lower than gpu's. gl's problems were never pass
count — they were the absent downscale and the full-resolution blit, both addressed in
Phase 1.

---

## Deliverable A — how close does gl get to mview?

The customer threshold is **within a factor of 2 on low-end hardware**. Assessment after
Phase 1 (+1.4), with Phase 2 as margin.

### Factors, with direction and confidence

| Factor                                      | After Phase 1                                                                                      | Confidence             |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------- | ---------------------- |
| Nominal samples/frame                       | **gl 0.82× of mview** (85 M vs 103 M) — gl ahead                                                   | high — arithmetic      |
| Per-sample texture fetches                  | **gl ~6 vs mview 8** — gl ahead (mview does 6-tap central-difference gradients, vtk 3-tap forward) | high                   |
| Render passes / frame                       | gl 1–2 + blit; mview 1 direct to swapchain — mview ahead                                           | high                   |
| Full-res blit                               | eliminated by 1.4                                                                                  | high                   |
| RAF coalescing                              | both have it — neutral                                                                             | high                   |
| **Early ray termination**                   | **mview ~2.5× fewer effective samples in opaque regions** — mview ahead                            | high — see below       |
| WebGL2 vs WebGPU driver/validation overhead | mview ahead, magnitude unknown                                                                     | **low — must measure** |
| Shared context contention (multi-viewport)  | mview ahead in mixed layouts                                                                       | **low — must measure** |

**The early-termination factor is a defect, not an optimisation.** mview omits
sample-distance opacity correction, so CT-Bone's per-sample alpha is 0.7157 where vtk's
corrected value is 0.395. mview therefore reaches its ~0.985 early-out in ~3.3 samples
through bone against vtk's ~8.4. gl should **not** match this: doing so would mean
reproducing the same over-opacity that makes mview's interactive and still frames differ
in density. Conversely, if mview is corrected for image fidelity (recommended
independently), it loses this advantage and gl's position improves.

### Estimate

Sample count and per-sample cost favour gl after Phase 1. mview retains lower fixed
overhead and the early-termination advantage. Netting these:

- **After Phase 1 (incl. 1.4): 1.3× – 2.2× of mview on low-end hardware.**
- **After Phase 2: 1.1× – 1.6×.**

So the 2× threshold is _probably_ met by Phase 1 alone and comfortably by Phase 2 — but
the range is wide because two factors are unquantified, and the WebGL2 driver-overhead
term is the one that could push Phase 1 past 2× on a specific low-end part.

**Recommendation: run a measurement spike after Phase 1 before committing Phase 2
effort.** Items 1.1 + 1.3 are two setter calls; 1.2 is an interactor. That is a day or
two to a number, on the actual target hardware. If Phase 1 lands inside 2×, Phase 2
becomes optional margin rather than a requirement.

### Fair-comparison protocol

Pin canvas CSS size and DPR, camera and projection, transfer function, and still/moving
state. Set mview present quality to **t = 1** so still-frame step counts match by
construction. Report adapter, pane size and quality settings. `VolumeRenderer.getStats()`
gives `fps`/`frameMs`/`gpuWaitMs`, but note the upstream warning: `fps` measures
render-_request_ cadence and `gpuWaitMs` is sampled every 20th frame — for a defensible
number use WebGPU timestamp queries on the mview side and equivalent instrumentation on
gl. Measure **interaction** frames specifically; on still frames at t = 1 the sample
counts already match and gl/gpu should be competitive or ahead today.

---

## Phase 3 — Surface renderer

### Rationale

mview's `surface` mode terminates each ray at the first threshold crossing (plus a
5-step bisection refine). For a bone or vessel preset, most rays terminate very early,
which is a far larger saving than any resolution or step-count trade — and unlike the
early-termination advantage above, it is a legitimate one rather than a side effect of
missing opacity correction.

Two deployment modes, not mutually exclusive:

- **Interaction proxy** — surface during drag, composite DVR on settle. Cheaper than
  Deliverable A's approach and visually stable while moving. Image pop on settle is a
  concern, but a controlled one since both renderers are ours.
- **Standard mode for high-volume data** — shaded surface display at a threshold is a
  recognised diagnostic mode for bone and vessel work, and for very large studies it may
  be the only mode that renders interactively at all.

### The part that matters for Phase 4

A surface renderer only needs data _near the surface_. Building it requires a **min/max
acceleration grid** — a coarse grid recording the value range in each block — so the
raymarch can skip blocks that cannot contain the threshold crossing.

That single structure then serves three purposes:

1. empty-space skipping (Phase 3 performance),
2. surface localisation (Phase 3 correctness),
3. **brick residency decisions (Phase 4)** — which bricks must be resident at full
   resolution.

Build it in Phase 3 and Phase 4 inherits it. This is the main reason to sequence the
surface renderer before the large-volume work rather than after.

### Placement

No vtk.js changes required. The `GenericViewport` render-path architecture already
supports a fully custom renderer — `FuberlinVolume3DRenderPath` is the existence proof,
including canvas ownership, camera bridging and self-presenting render. A surface render
path slots in beside it as another `renderMode`.

---

## Phase 4 — Large volume / precomputed bricked pyramid

Three requirements, each mapped to a mechanism.

### R1 — lossless MPR single-slice without loading all data

Two viable routes (large-volumes doc §6, §5e):

- **Server-side transposed orthogonal stacks** as derived series. Zero client changes —
  OHIF's existing stack viewport, SOP class handlers and hanging protocols work as-is.
  3× storage. Covers orthogonal only.
- **Brick-based MPR.** Per §5e, MPR performs no compositing along a ray, so the
  ordering problem that makes bricked DVR hard **does not exist**. One quad per
  intersecting brick, regions disjoint in screen space, no page table required. A plane
  touches ~N^(2/3) of N bricks.

**Recommendation: bricks**, because R2 requires arbitrary orientation and transposed
stacks cannot provide it. Transposed stacks remain a good tactical option if a
zero-client-change win is wanted first.

### R2 — progressive display of any orientation, MPR or 3D

- **Any orientation** rules out transposed stacks alone → bricks + pyramid.
- **Progressive** = display the coarsest available level immediately, refine as finer
  bricks arrive, with level selection driven by projected voxel size per the guiding
  principle.
- **Missing bricks must be a first-class state**, not an error — this is precisely the
  design in Hadwiger et al., _Visualization-Driven Virtual Memory_ (large-volumes doc
  §6e), where cache misses are detected during ray casting and propagated back for
  on-demand load.

### R3 — lossless 3D where "lossless" is surface-dominated

The stated assumption — outer regions transparent, a reasonably quick transparent → opaque
transition — is what makes this tractable, because it means the visually significant data
is a **thin shell**, and shells are O(area) not O(volume).

Using the Phase 3 min/max grid, classify each brick:

| Brick content                         | Residency                                       |
| ------------------------------------- | ----------------------------------------------- |
| entirely below opacity onset          | skip, or coarse level only                      |
| **spans the opacity onset**           | **full resolution required**                    |
| entirely above onset (dense interior) | coarse — occluded by the surface in front of it |

For a 2048³ volume at 128³ bricks: 16³ = 4096 bricks total; a shell intersects on the
order of 16² × 2–3 ≈ 500–750 of them, i.e. **roughly 12–18% at full resolution** plus a
coarse level for context. That is the quantitative basis for calling R3 satisfiable.

The "reasonably quick transition" wording matters: a steep TF ramp makes the shell thin
and the fraction small. A very gradual ramp thickens the shell and the fraction grows —
worth validating against the actual presets in use.

### Phase 4a — generation in static DICOMweb

The precomputed representation is produced by the static DICOMweb creation service
([RadicalImaging/static-dicomweb](https://github.com/RadicalImaging/static-dicomweb),
`packages/static-wado-creator`) at ingestion, from the DICOM it is already processing.

**Why this is cheap here.** Per large-volumes doc §6b, decode dominates transposition —
and the creator already decodes every frame (`lib/operation/extractImageFrames.js`,
`getUncompressedImageFrame.js`, `getEncapsulatedImageFrame.js`). Generating pyramid
levels from frames that are already in memory adds a bandwidth-bound pass, not a decode
pass. **`ThumbnailService` is the existing precedent**: a derived rendition produced at
ingestion, written by a dedicated writer (`lib/writer/ThumbnailWriter.js`), optional and
configurable. A volume pyramid follows the same shape.

| Step                     | Where                                                                                                        | Note                                                                                                                                                                                                                                                                                     |
| ------------------------ | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 4a.1 Eligibility         | extend the existing scan/metadata pass (`lib/operation/ScanStudy.js`, `StudyData.js`, `validateMetadata.js`) | only volumetric series worth it — thin-slice CT, volumetric MR. Skip localizers, scouts, thick-slice axials (§6c)                                                                                                                                                                        |
| 4a.2 Geometry validation | same pass                                                                                                    | a pure transpose requires a **regular rectilinear grid**. Gantry tilt or irregular spacing requires resampling, not transposition — detect, and either resample or skip and record why                                                                                                   |
| 4a.3 Build               | new `lib/operation/VolumePyramidService.js`                                                                  | **blocked transpose** (read a 64³/128³ block once, write its contribution to all outputs) plus 2×2×2 box downsample per level. Process in slabs — never materialise a 1 GB volume in the creator                                                                                         |
| 4a.4 Write               | new `lib/writer/VolumeBrickWriter.js` alongside `ImageFrameWriter.js`                                        | **sharded** chunk layout — naive per-chunk objects turn one study into millions of tiny S3 keys. Follow [Neuroglancer's sharded format](https://github.com/google/neuroglancer/blob/master/src/datasource/precomputed/sharded.md): front-loaded index, then two range requests per brick |
| 4a.5 Manifest            | per-series JSON at a well-known path                                                                         | levels, brick size, dtype, scaling (`RescaleSlope`/`Intercept`), geometry, and **`FrameOfReferenceUID`** so measurements cross-reference the source series                                                                                                                               |
| 4a.6 Deploy              | `packages/s3-deploy`, `static-wado-deploy`                                                                   | verify `Accept-Ranges`, `Content-Type`, cache headers and CORS expose range requests; this is the whole access model                                                                                                                                                                     |
| 4a.7 Retention           | creator config                                                                                               | generate at ingestion, keep 10–20 days, then expire and regenerate on demand. Trigger on-demand generation on first **study** access, not first brick request, so the user's axial reading time covers the build                                                                         |

**Format choice.** Per §6e, prefer the **chunked multi-resolution store** over three
transposed stacks: ~+14% storage against +200%, and it serves oblique MPR, the reduced
volume for 3D, and ROI sub-volumes from one representation. Transposed orthogonal stacks
as derived series remain a valid tactical first step — they need no client changes at
all — but they cannot satisfy R2's "any orientation".

**NIfTI cannot serve this** (§6f): flat, single-resolution, no index. Byte ranges give
K-slice access only, and `.nii.gz` removes even that.

**Discovery is the contract with Phase 0.** The decision engine can only choose a
representation it knows exists, so 4a.5's manifest must be surfaced through the OHIF
data source as a capability the policy can read. Define this interface before either
side is built — it is the coupling point between the server and client halves of
Phase 4.

### Phase 4b — client consumption

Sequence within Phase 4b:

1. **Brick-aware MPR first.** No ordering constraint, no page table, immediately
   satisfies R1 and the MPR half of R2. Either extend `vtkImageResliceMapper` to be
   brick-aware or write a Cornerstone-owned brick reslicer in the Planar render paths.
2. **Brick-aware DVR second**, reusing the Phase 3 min/max grid for residency. Per
   §3c, plan for **single-pass page-table indirection**, not vtk's chunked multi-volume
   path — `_clearEncoder`/`_mergeEncoder` composites chunks back-to-front by _centroid_,
   which is incorrect for bricks that interleave along a ray.
3. **Level selection** driven by projected voxel size, shared by both.

**Prerequisite carried from the large-volumes doc:** key the mapper-imageData cache by
`(volumeId, level)`. `mapperImageDataByVolumeId` is keyed by `volumeId` alone and is
shared between the 3D and MPR paths on both backends (§5b), so today there is no way for
3D to use a reduced level without degrading MPR. Small change, hard prerequisite.

Also fix the redundant CPU copies (§1c): gl peaks at ~1× the volume, gpu ~2×, mview ~3×.
Slice-wise upload moves gpu and mview toward ~1× and is a prerequisite for building
reduced levels during streaming rather than after.

---

## Phase 5 — WebGPU parity (lower priority)

Known fixes, from performance doc §6:

| #   | Change                                                                   | Note                                                                                                                                                            |
| --- | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 5.1 | **RAF-coalesce the present**                                             | gpu is the only path that does not; `viewport.render()` → `traverseAllPasses()` is synchronous per mousemove event. Highest value, lowest risk, no quality cost |
| 5.2 | Raise `initialInteractionScale` beyond 4                                 | governs the first frames of each drag                                                                                                                           |
| 5.3 | Trade steps for pixels via `interactionSampleDistanceFactor`             | gpu is currently on the wrong side of this trade vs mview                                                                                                       |
| 5.4 | Replace the depth-bounds pre-pass with analytic ray/box intersection     | vtk.js change; largest structural win                                                                                                                           |
| 5.5 | Cache the per-frame bounding-box geometry rebuild                        | depends only on bounds                                                                                                                                          |
| 5.6 | Skip the `rgba16float` intermediate + copy quad for single-volume scenes | vtk.js change                                                                                                                                                   |

**Phase 4 may pull this forward.** A bricked renderer with page-table indirection is a
better fit for WebGPU than WebGL — higher texture binding limits, compute shaders for
the min/max grid, and storage buffers for the page directory. If Phase 4 is built as a
custom render path, targeting WebGPU first may be less work than retrofitting WebGL,
which would reorder 4 and 5.

---

## Running comparison: gl vs mview vs gpu by phase

Samples/frame during interaction, worked example above. "—" means unchanged.

|                                     | gl                                                | gpu   | mview                                          |
| ----------------------------------- | ------------------------------------------------- | ----- | ---------------------------------------------- |
| Today                               | 678 M                                             | 170 M | 103 M                                          |
| After Phase 1                       | **85 M**                                          | —     | —                                              |
| After Phase 2                       | 85 M + lower fixed cost                           | —     | —                                              |
| After Phase 3 (surface interaction) | early-terminating; not comparable by sample count | —     | 103 M (composite) / much lower in surface mode |
| After Phase 5                       | —                                                 | 25 M  | —                                              |

Qualitative position, same phases:

| Property                  | gl after 1–2                                                  | gpu after 5       | mview today                                                                       |
| ------------------------- | ------------------------------------------------------------- | ----------------- | --------------------------------------------------------------------------------- |
| Interaction cost          | competitive (est. 1.1–1.6× mview)                             | best of the three | baseline                                                                          |
| Still-frame fidelity      | **correct** — opacity correction, full Phong, 1024-entry LUTs | correct           | over-opaque, `\|n·view\|` only, 256-entry nearest LUT                             |
| Preset support            | full `VIEWPORT_PRESETS`                                       | full              | composite only, gradient opacity absent (harmless — all shipped presets are flat) |
| Overlays / SEG / geometry | yes                                                           | yes               | no                                                                                |
| Large volumes             | Phase 4                                                       | Phase 4           | no                                                                                |
| Progressive display       | yes                                                           | no                | no                                                                                |

The point worth carrying into the discussion: **mview's speed advantage is partly a
fidelity defect**, and gl/gpu should not chase it. The correct target is Deliverable A's
2× threshold with fidelity intact, then Phase 3–4 for the capability mview does not have
at all.

---

## Risks and open questions

1. **WebGL2 driver overhead on target hardware is unquantified** and is the main risk to
   Deliverable A. Mitigate with the Phase 1 measurement spike.
2. **Phase 1 item 1.2 has a shared-context side effect.** Decide explicitly whether
   brief MPR downscaling during a 3D drag is acceptable, or scope it properly (2.1).
3. **`@mview/webgpu-volume-standalone` is not installed in this tree** — no dependency
   entry, no workspace member, no tsconfig alias, no `node_modules/@mview`. The fuberlin
   path cannot build until it is linked or vendored. This blocks any A/B measurement
   against mview and should be resolved before Phase 1 measurement.
4. **mview's opacity correction and shading gaps** should be fixed regardless of this
   plan, both for fidelity and so comparisons are meaningful. Doing so removes its
   early-termination advantage.
5. **Surface-mode acceptability** (Phase 3 as a standard mode, not just an interaction
   proxy) is a clinical decision, not a technical one.
6. **Shell fraction for R3 depends on TF steepness** — validate against the presets
   actually in use before relying on the 12–18% figure.
7. **Server-side format choice** (transposed stacks vs chunked pyramid) should be decided
   _before_ investing in Phase 4b client work, since the chunked variant subsumes much of
   it.

## Verification

Each phase should land with a measurement, not just a change:

- **Phase 0:** a recorded capability snapshot from each class of target hardware
  (low-end integrated, mid, discrete), checked into the repo as policy test fixtures.
  Exit criterion: no configuration produces a blank viewport — every unsupported
  combination yields a logged fallback or a legible error, and
  `getRenderingDecision()` explains it.

- **Phase 1–2:** interaction-frame time on target low-end hardware, gl vs mview, under
  the protocol above. Exit criterion: within 2×.
- **Phase 3:** interaction-frame time in surface mode; separately, min/max grid build
  time and its effect on empty-space skipping.
- **Phase 4a:** generation wall-time and peak creator memory for a large study, as a
  fraction of the existing ingestion cost (it should be a bandwidth-bound pass on
  already-decoded frames, not a second decode); output size against the +14% budget;
  and a served-from-S3 check that a single brick is retrievable in two range requests.
  Independently testable with no client changes.
- **Phase 4b:** time-to-first-pixel for an MPR at each orientation without a full volume
  load (R1, R2); resident brick fraction and time-to-lossless for a bone-preset 3D view
  (R3); peak CPU and GPU memory against the §1b/§1c figures.
- **Phase 5:** interaction-frame time gpu vs gl vs mview, plus a check that 5.1 actually
  reduced redundant frames (count presents per displayed frame during a drag).
