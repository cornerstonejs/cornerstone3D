# Very large volume handling

Companion to [`RENDERING-performance-compare.md`](./RENDERING-performance-compare.md)
and [`RENDERING-Volume3D-overview.md`](./RENDERING-Volume3D-overview.md).

That document is about _frame rate_. This one is about **whether the volume can be
rendered at all**, and what each mitigation costs once it can. The two questions have
different answers: the scheme that gives the best interactive frame rate is not
necessarily the one that raises the ceiling on volume size.

## The quality criterion: lossless _at display resolution_

Before the options, the standard they should be judged against — because "reduced
resolution is lossy" is the wrong test and leads to the wrong decisions.

A display at a given magnification has a fixed sampling density. Any data finer than
that density is discarded by the display no matter what you stored, so a representation
that _meets_ that density is _lossless with respect to the displayed image_. The goal
is not "always full resolution", it is **lossless at the resolution actually being
displayed, up to the full resolution of the device**.

Let `p` be the projected voxel size — pane pixels spanned by the volume, divided by
voxels across:

|         | meaning                                         | consequence                                                                                |
| ------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `p > 1` | magnification — one voxel covers several pixels | the display is _interpolating_; more data would show more. Reduction here is genuine loss. |
| `p = 1` | 1:1                                             | the ideal operating point                                                                  |
| `p < 1` | minification — several voxels per pixel         | the **display** is discarding data. A level with `p = 1` is lossless for this view.        |

**A reduction is free exactly when the volume out-resolves the pane** — which is the
definition of the large-volume problem this document is about. The justification for
the scheme and the condition that creates the problem are the same condition:

| Volume across | Pane px | Full-res `p` | ½-res `p` | verdict                                      |
| ------------- | ------- | ------------ | --------- | -------------------------------------------- |
| 512           | 1024    | 2.0          | 4.0       | already magnifying — ½-res is **real loss**  |
| 1024          | 1024    | 1.0          | 2.0       | at 1:1 — ½-res is real loss                  |
| 2048          | 1024    | 0.5          | **1.0**   | ½-res is **lossless for this display**       |
| 4096          | 1024    | 0.25         | 0.5       | ¼-res is lossless; ½-res is wasted bandwidth |

Two conditions have to hold for the "lossless" claim:

1. **Pick the finest level with `p ≤ 1` — round up in resolution, never down.** This is
   your 1025 case: with 1024 and 2048 levels available and a 1025-pixel requirement,
   the 1024 level gives `p > 1` and the display starts inventing detail. Render from
   2048 and filter down. Power-of-two pyramids mean worst-case ~2× over-resolution,
   which is exactly the mipmapping tradeoff (and why hardware mip filtering blends two
   adjacent levels rather than snapping to one).
2. **The reduction must be band-limited, not decimated.** A filtered level discards
   only what the display cannot show. A decimated level _aliases_ — it folds
   high-frequency energy down into the displayed band, putting structure on screen that
   was never in the object. That is not "lossy", it is fabrication, and it is a
   categorically worse failure than blur. This is the real reason §2a insists on
   filtering, and the real cost of the every-other-slice variant.

**The operative consequence: level selection must be dynamic**, driven by the projected
voxel size for the current camera, not a fixed "⅛ volume". A pyramid plus per-view
level selection is what satisfies the criterion; a single reduced volume satisfies it
only for the zoom levels where `p ≤ 1` happens to hold.

**Interaction buys one more level, rigorously.** When the render target is itself
downscaled — gpu's `initialInteractionScale(4)` halves each axis, mview's pixel budget
does something similar — the effective pane shrinks and `p` falls with it. A 2048-wide
volume in a 1024 pane sits at `p = 0.5`; during a gpu drag the effective pane is 512, so
`p = 0.25` and a **¼-res level is exactly 1:1**. That is what makes an interaction LOD
lossless rather than merely tolerable, and it is the principled version of the
"output-sensitive" argument in the Beyer/Hadwiger/Pfister survey (§6e).

Note the corollary for the current gpu configuration: with a 512-across volume in a
1024 pane, `initialInteractionScale(4)` already lands on `p = 1.0` using the
**full-resolution** volume. Adding a ½-res interaction volume on top would push `p` to
2.0 — over-reduction. Volume level and render scale have to be chosen together.

## 1. What actually stops you

Four separate walls, hit in roughly this order as volumes grow.

### 1a. `maxTextureDimension3D` — a hard cliff, not a gradual slowdown

The WebGPU default limit is **2048** per axis. A volume with any axis above that
cannot be a single 3D texture, regardless of how much memory is free. mview checks
explicitly and throws:

```js
const limit = this.device.limits.maxTextureDimension3D;
if (Math.max(width, height, depth) > limit) {
  throw new RangeError(
    `volume ${width}x${height}x${depth} exceeds maxTextureDimension3D ${limit}`
  );
}
```

The vtk.js WebGPU path has no equivalent guard — `getTextureForImageData` passes the
dimensions straight through, so an oversized volume surfaces as a WebGPU validation
error rather than a catchable application error. On the WebGL side the equivalent is
`MAX_3D_TEXTURE_SIZE`, typically 2048 on desktop but as low as **256** on GLES3-class
integrated parts, which is the most common "renders on my machine, blank on theirs"
cause.

A 512×512×2048 whole-body CT sits exactly on this boundary. Anything longer — or any
1024²-in-plane study with more than 2048 slices — is simply unrenderable as one
texture.

### 1b. GPU memory

At `r16float`, 2 bytes/voxel:

| Volume                    | Voxels | GPU bytes |
| ------------------------- | ------ | --------- |
| 512×512×400 (chest CT)    | 105 M  | 210 MB    |
| 512×512×2000 (whole body) | 524 M  | 1.05 GB   |
| 1024×1024×2000            | 2.1 G  | 4.2 GB    |
| 1024×1024×4096            | 4.3 G  | 8.6 GB    |

On integrated GPUs sharing system memory, the practical ceiling is often 1–2 GB. Note
that gpu additionally allocates full-viewport `rgba16float` + two `r16float`
depth-bound intermediates per frame (see the performance doc §3), which is small by
comparison but not free.

### 1c. CPU peak memory — usually the first wall in practice

This is the one that bites earliest, and it is a property of _this codebase_, not of
WebGPU. For a volume of size S bytes in its native type:

| Path      | Resident copies during load                                                                                    | Peak    |
| --------- | -------------------------------------------------------------------------------------------------------------- | ------- |
| **gl**    | per-slice images in `cache` only — the mapper binds the volume's shared `vtkOpenGLTexture`, no contiguous copy | **~S**  |
| **gpu**   | cache slices + the contiguous array materialised by `acquireWebGPUMapperImageData` / `getVolumeScalarArray`    | **~2S** |
| **mview** | cache slices + contiguous array + `normalizeVolume`'s `new Uint16Array(voxelCount)` half-float copy            | **~3S** |

For a 1 GB whole-body CT that is ~3 GB of transient CPU allocation on the mview path
before a single voxel reaches the GPU — against Cornerstone's default
`_maxCacheSize = 3 * ONE_GB` and whatever `ArrayBuffer` ceiling the engine imposes.

**This is worth fixing independently of any LOD scheme.** Both the gpu and mview paths
materialise the whole volume into one contiguous array specifically because they need
a single upload; a slice-wise or slab-wise upload loop would remove one full copy from
each, and the downsampling schemes below can be applied _during_ that loop so the
full-resolution contiguous array never has to exist.

### 1d. Frame cost

Covered in the performance doc. Relevant here only because ray-step count is derived
from spacing — which means anything that changes the effective voxel size also changes
the step count, as §2 exploits.

## 2. Option 1 — fractional resolution (½ per axis = ⅛ the voxels)

The cheapest option and the only one that helps every wall at once.

| Wall                    | Effect                                                                                                                                  |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `maxTextureDimension3D` | **halves every axis** — a 4096-slice volume becomes 2048 and fits. Two levels (¼ per axis) covers 8192.                                 |
| GPU memory              | ⅛                                                                                                                                       |
| CPU peak                | ⅛ **if built incrementally during streaming** (see below); no better than full-res if you downsample from a materialised full-res array |
| Network / decode        | unchanged if every slice is fetched; **halved** in the every-other-slice variant (§2b)                                                  |
| Frame cost              | **also ~2× fewer ray steps, for free**                                                                                                  |

That last row is not obvious and is worth spelling out. Both vtk paths and mview
derive their sampling from `sampleDistance = (sx+sy+sz)/6`. Halving resolution doubles
the spacing, which doubles `sampleDistance`, which halves `numSteps = rayLength /
sampleDistance`. So a ⅛-size volume gives 8× the memory headroom _and_ roughly 2× the
frame rate, with no code changes to the samplers.

### 2a. Filtering — in-plane always, through-plane only when the data is already there

**Downsample, don't decimate** — but the two axes of that statement have very
different costs, because filtering in-plane is free and filtering through-plane is not.

- **In-plane (within-image): always use a 2×2 box average.** Both contributing
  columns and rows are inside a slice that has already been fetched and decoded, so
  the average costs nothing beyond the arithmetic. This halves X and Y with proper
  band-limiting.
- **Through-plane (between-image): average only when the intermediate slice is
  already loaded.** Averaging slice _k_ with slice _k+1_ requires slice _k+1_ to
  exist. If the point of the reduced volume is to fetch _fewer images_, then demanding
  the skipped slice defeats the exercise — you would be downloading and decoding 100%
  of the data to produce a ⅛-size volume. In that case take the loaded slice as-is
  (decimation along K).

So the rule is per-slice-pair, decided against what is actually in the cache:

| Situation                                                                       | Through-plane treatment                              |
| ------------------------------------------------------------------------------- | ---------------------------------------------------- |
| All slices fetched (full-resolution load, reduced volume built as a by-product) | 2-slice average — full 2×2×2 box filter              |
| Only every other slice fetched (half-resolution load)                           | take the fetched slice; **no** through-plane average |
| Progressive load, partner slice not yet cached                                  | take the available slice now                         |

**Consequence: the filter is anisotropic in the half-resolution-load case.** X and Y
are properly band-limited; K is decimated, so through-plane content above the new
Nyquist limit aliases. For thin-slice CT the through-plane content that gets folded
back is usually modest, but it is not nothing — thin cortical bone and vessels
crossing obliquely are the visible cases. It is worse the thicker the source slices
already are, since a thick-slice acquisition has less headroom to give up. This is a
quality-for-bandwidth trade, and it should be a deliberate one rather than a silent
consequence of the loader's fetch pattern.

**The context volume can improve in place.** Because the through-plane decision is
per-slice-pair, a slice that was written un-averaged can be re-averaged and rewritten
if its partner arrives later — a single output z-slice, so a single `writeTexture`
with a `z` origin, not a rebuild. That fits the existing progressive-load architecture
directly: the reduced volume is usable from the first slices and sharpens through the
slice axis as loading completes, with no full re-upload.

Whichever variant is used, a box average is physically defensible for CT — it is what
partial-volume averaging would have produced at a coarser acquisition, so HU values
stay meaningful and the existing preset transfer functions remain valid without
rescaling. Decimation does not have that property in the same way, but it does not
shift HU values either, so presets remain valid in both cases.

### 2b. Two variants with different cost profiles

The choice of through-plane treatment splits option 1 into two schemes that are worth
keeping distinct, because they relieve different walls:

|                                             | slices fetched | network / decode | GPU memory | through-plane quality          |
| ------------------------------------------- | -------------- | ---------------- | ---------- | ------------------------------ |
| **Full load, reduced volume as by-product** | all            | unchanged        | ⅛          | band-limited (2-slice average) |
| **Half-resolution load**                    | every other    | **halved**       | ⅛          | decimated — aliasing along K   |

The first is the right default when the full-resolution data is wanted anyway for the
still frame, and the reduced volume is purely an interaction/fallback LOD. The second
is the one that helps when the study is large enough that fetching and decoding all of
it is itself the problem — which is the case §1c is really about.

### 2c. Where it plugs in

**Build it during streaming, not after.** The natural place is inside the existing
per-volume materialisation. Each arriving slice pair contributes to one output slice,
so the reduced volume can be accumulated as images land and the full-resolution
contiguous array never needs to exist:

- **gpu** — `acquireWebGPUMapperImageData` in
  [`webgpuMapperImageData.ts`](https://github.com/mbellehumeur/cornerstone3D/blob/webgpuSpike/packages/core/src/RenderingEngine/GenericViewport/webgpuMapperImageData.ts) already owns a ref-counted
  per-volume copy and already assembles slice-by-slice in
  `materializeFromCachedImages`. That loop is the insertion point.
- **mview** — `FuberlinVolume3DRenderPath.uploadVolume`, before `renderer.setVolume`.
  mview's `normalizeVolume` already walks every voxel to half-float convert, so
  downsampling there is nearly free.
- **gl** — awkward. gl's advantage is that it binds the volume's _shared_
  `vtkOpenGLTexture` with no copy at all; a reduced variant means a second texture and
  a non-shared mapper, giving up the zero-copy property. gl is the path that least
  needs this and pays most to get it.

### 2d. Interaction LOD vs the only representation

Judged against the criterion at the top of this document: a single fixed ½-per-axis
volume is lossless for every view where `p ≤ 1` and genuinely lossy for every view
where it is not. For a large study in a normal pane that covers most of the range; for
a magnified 3D inspection — the case you care about most — it does not. That gap is
what a pyramid with dynamic level selection closes and a single reduced volume cannot.

**For interaction only vs for everything.** As an interaction LOD this is
uncontroversial — it is §7c of the performance doc. As the _only_ representation it is
a clinical decision: you lose everything above the new grid's Nyquist limit, which for
bone-surface DVR is often invisible but for fine trabecular structure, small vessels,
or thin cortical bone is not. A reasonable default is: reduced volume always resident
(guarantees the study renders at all), full resolution used for the still frame when
it fits.

## 3. Option 2 — multi-volume breakdown (bricking)

You asked what this does to overall display capability. The short answer: **it buys
dimension headroom, buys memory headroom only if you also page bricks in and out, and
costs both correctness and per-frame passes in vtk.js's current implementation.**

### 3a. What it does and does not buy

| Wall                    | Effect                                                                                                                                                                                                                                                                               |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `maxTextureDimension3D` | **Solved completely.** Each brick is sized under the limit, so volume dimensions become unbounded. This is the main reason to do it.                                                                                                                                                 |
| GPU memory              | **No change** if all bricks are resident — same voxels, more textures. Slightly _worse_, because correct trilinear filtering and gradients at brick boundaries need a 1-voxel apron on each face (a 128³ brick becomes 130³, ~5% overhead; smaller bricks are proportionally worse). |
| CPU peak                | No change by itself; improves a lot if bricks are built and uploaded one at a time and discarded.                                                                                                                                                                                    |
| Frame cost              | **Worse** — see below.                                                                                                                                                                                                                                                               |
| Fidelity                | Lossless in principle; **not lossless in vtk.js today** — see 3c.                                                                                                                                                                                                                    |

The memory win only materialises with a residency policy: determine which bricks the
current view actually needs, upload those, evict the rest. That is the difference
between "bricking" and "out-of-core rendering", and it is most of the work.

### 3b. vtk.js already chunks multiple volumes — but at a cost

`VolumePass.traverse` computes:

```js
const maxVolumes =
  device.getHandle().limits.maxSampledTexturesPerShaderStage - 4;
```

`maxSampledTexturesPerShaderStage` defaults to **16**, so `maxVolumes = 12`. Above
that, vtk sorts volumes back-to-front by centroid distance and issues **one full
ray-cast pass per chunk of 12**, with the first chunk using `_clearEncoder` and
subsequent chunks `_mergeEncoder` to blend into the same colour target
(`VolumePass.js:170-206, 268-269`).

So a volume split into 64 bricks costs 6 full-screen ray-cast passes per frame, on top
of the depth-bounds pre-pass and the composite copy. Each pass re-traverses the whole
screen. This scales badly precisely when you need it most.

### 3c. The correctness problem — this is the important one

The chunk compositing is an `over` operator applied between chunks, ordered by
**per-volume centroid distance**. That is correct when the volumes are spatially
disjoint along every view ray — the fusion case it was designed for (a PT volume and a
CT volume occupying the same space are handled inside one pass, not across chunks).

It is **not** correct for an axis-aligned brick decomposition of a single volume viewed
obliquely: for a given pixel, brick A may be in front of brick B, while for a
neighbouring pixel the order reverses. A single global centroid sort cannot express
that, so you get visible seams and incorrect compositing at brick boundaries at most
camera angles.

Getting this right needs one of:

1. **All bricks sampled in one shader pass** — bounded by
   `maxSampledTexturesPerShaderStage`, so ≤12 bricks. Enough to break the 2048 limit
   in one axis (12 bricks of 2048 = 24576 slices), not enough for a general 3D
   decomposition.
2. **A page table / virtual texture** — one indirection texture maps volume coordinates
   to physical brick slots in a single large atlas texture. This is the standard
   production answer, keeps everything in one pass, and adds roughly one extra texture
   fetch per sample. It is also a substantial piece of new WGSL and residency
   management.
3. **Strictly view-ordered slabs** — decompose along the view axis only, so ordering is
   unambiguous per ray. This is correct and simple, but it means re-slicing the
   decomposition whenever the camera rotates, which is option 3's problem.

### 3d. Verdict

Bricking is the right answer for _unbounded dimensions_ and for genuine out-of-core
streaming of studies that cannot fit in VRAM at any resolution. It is the wrong first
move here: it does not reduce memory on its own, vtk's existing multi-volume path will
produce artifacts if used naively for it, and the correct implementation (page table)
is far more work than options 1 and 3 combined. If the goal is "make large studies
render at all", option 1 gets there for a fraction of the effort.

## 4. Option 3 — interaction slab of N slices

Keep only a window of N slices resident, chosen to cover the region that matters, and
swap the window as the view changes.

| Wall                    | Effect                                                                      |
| ----------------------- | --------------------------------------------------------------------------- |
| `maxTextureDimension3D` | Solved along the slab axis only                                             |
| GPU memory              | **k/N** — the largest reduction of the three                                |
| CPU peak                | k/N, and it streams naturally — only the needed slices need decoding        |
| Frame cost              | Better: shorter rays, so fewer steps                                        |
| Fidelity                | Full resolution **within the slab**; everything outside it is simply absent |

### 4a. The critical caveat: this does not help rotation

It is worth being precise about when the slab shrinks, because the intuition is
misleading. `TrackballRotateTool` rotates the camera about the volume centre, and
`getInitialVolume3DCamera` frames the whole volume. During a rotate **the entire volume
stays inside the view frustum** — the visible extent does not shrink, it just turns.
A view-aligned depth slab therefore cannot be narrowed during rotation without
removing anatomy the user can see.

Where the slab genuinely wins is **zoomed-in inspection**: once the camera is close
enough that the frustum ∩ volume bounds is a small fraction of the study, a slab
covering that intersection is both small and complete. That is a common workflow
(examine one vertebra, one vessel segment), and there the k/N reduction is real and the
image is full-resolution and correct.

So the honest split is:

- **rotating a whole-study overview** → only resolution reduction (option 1) helps;
- **inspecting a sub-region** → the slab (option 3) helps most, and at full resolution.

### 4b. Choosing the axis

Two different things could be meant by "an orientation that agrees with the part being
displayed", and they behave differently:

- **Acquisition-axis slab over an ROI** — keep slices `[k₀, k₀+N)` in the volume's own
  K axis. Cheap: it is a contiguous range of the existing per-slice cache, needs no
  resampling, and re-uploading means writing a contiguous sub-region of the 3D texture
  (`writeTexture` with a `z` origin, which mview's `uploadTextureInSlabs` already does).
  This is the one to build.
- **View-aligned slab** — requires resampling the volume onto a view-aligned grid every
  time the camera moves, which is a full pass over the data per orientation change.
  Almost never worth it.

### 4c. Thrashing

The window has to move as the view changes, and re-upload is not free: N slices of
512×512 `r16float` is N × 512 KB, so N = 128 is 64 MB per swap. That is acceptable at
the _start_ of an interaction or on settle, but not per frame. Practical mitigations:
keep a generous margin around the required range so small movements do not trigger a
swap, apply hysteresis, and upload only the newly-needed sub-range rather than the
whole window (again a contiguous `z` range, so a single `writeTexture`).

## 5. MPR views

MPR inverts the priorities that the rest of this document assumes. It is the
**fidelity-critical** view — it is looked at at full magnification, and it is what
diagnostic reading actually uses — and at the same time it is by far the **cheapest**
view to render. 3D DVR is the expensive one, and if it mostly matters when heavily
magnified, then the resolution you can afford to lose in each is close to opposite.

### 5a. MPR needs no interaction LOD — it is not the bottleneck

A thin MPR frame is O(pixels × 1): `vtkImageResliceMapper` takes one sample per output
pixel. A DVR frame is O(pixels × ~1500). In a mixed layout — an MPR triptych plus a 3D
pane — the 3D pane dominates the frame budget by roughly three orders of magnitude, so
**all LOD effort belongs on the 3D pane**. There is no performance reason to reduce
MPR resolution during interaction.

The exception is thick-slab MPR. When `slabThickness` is large (the TMTV MIP pane
mounts `blendMode: 'MIP'` with `slabThickness: 'fullVolume'`, resolved to the volume
diagonal), the reslice mapper samples along the slab normal and the cost approaches
DVR. Slab panes belong in the 3D bucket for LOD purposes, not the MPR bucket.

### 5b. MPR and 3D currently share one GPU representation

This is the fact that governs everything else in this section:

| Backend | 3D path binds                                      | MPR path binds                                                 |
| ------- | -------------------------------------------------- | -------------------------------------------------------------- |
| gl      | `imageVolume.vtkOpenGLTexture` (shared, zero-copy) | the same shared `vtkOpenGLTexture`                             |
| gpu     | `acquireWebGPUMapperImageData(volumeId, …)`        | **the same `acquireWebGPUMapperImageData(volumeId, …)` entry** |

`mapperImageDataByVolumeId` is keyed by `volumeId` alone, and the module comment says
so explicitly — materialising is a full copy, so all render paths on that volume share
one instance. Both backends then drive a `vtkImageResliceMapper` for MPR.

Two consequences:

1. **Swapping the 3D path to a reduced volume today would silently reduce MPR too.**
   Any LOD scheme has to key that cache by `(volumeId, level)` and let each render path
   ask for the level it wants, rather than reusing the single per-volume entry.
2. **Option 1 does not reduce peak memory while an MPR view is on screen.** If MPR
   needs full resolution and 3D uses the ⅛ copy, both are resident: 1.125× the full
   volume, not ⅛ of it. Option 1's memory win is real only when the reduced volume is
   the _only_ representation needed — i.e. when 3D is the sole view, or when the study
   is too large for full resolution at all and MPR is knowingly degraded.

This substantially narrows what option 1 buys in a normal hanging protocol, and it is
worth being explicit about before treating ⅛ as a memory strategy.

### 5c. The every-other-slice variant hurts MPR far more than it hurts 3D

§2b's half-resolution load halves the slice axis without through-plane filtering.
Which axis each view actually displays at full magnification:

| View                             | In-plane (X, Y)         | Through-plane (K)                                               |
| -------------------------------- | ----------------------- | --------------------------------------------------------------- |
| Axial MPR (matching acquisition) | **displayed directly**  | not displayed (one slice)                                       |
| Sagittal / coronal reformat      | one axis displayed      | **displayed directly — this is the vertical axis of the image** |
| 3D DVR                           | contributes to sampling | contributes to sampling                                         |

So the slice axis that the half-resolution load decimates is precisely the axis a
coronal or sagittal reformat renders vertically. On a DVR the resulting aliasing is
subtle; on a reformat at full magnification it is a visible 2× vertical blur with
stair-stepping on oblique structures.

**Rule of thumb: the half-resolution load is acceptable when 3D is the only view. It
is not acceptable when reformats are diagnostic.** If reformats matter, use the
full-load variant and treat the reduced volume purely as a 3D LOD.

Note also that reformats require the _whole study_ to be fetched regardless of GPU
representation — a coronal plane takes one row from every axial slice — so the
half-resolution load's network saving is unavailable to a reading workflow that
includes reformats anyway.

### 5d. Slabs (option 3) fit MPR natively — better than they fit 3D

§4a concluded the slab does not help 3D rotation, because the whole volume stays in
frame. For MPR the opposite holds: the working set genuinely _is_ a slab. A thin MPR
needs the voxels adjacent to one plane; a slab MPR needs `slabThickness` worth. And
scrolling moves that window — which is exactly the "N slices switched as the volume
changes" model, arriving naturally rather than as a heuristic.

The axis asymmetry from §4b matters more here, though:

- **Axial MPR** — the needed slab is a contiguous range of the acquisition axis, i.e.
  a contiguous range of the per-slice cache and a single `writeTexture` with a `z`
  origin. Cheap, and it is the case option 3 was designed for.
- **Sagittal / coronal reformat** — the needed region is a thin band in X or Y
  spanning _all_ of K. That is not a contiguous slice range; it is a crop of every
  slice. Fetching cannot be reduced (every image is still needed), but GPU residency
  can be, since only a thin in-plane band of each slice has to be uploaded.

So option 3 serves axial MPR very well, and serves reformats only as a GPU-residency
measure, not a loading one.

### 5e. Bricking (option 2) is a much better fit for MPR than for 3D

The objection in §3c — that vtk's centroid-sorted chunk compositing is wrong for
bricks that interleave along a ray — is an objection about **compositing along a ray**.
MPR does not composite along a ray. Each output pixel takes one sample. **The ordering
problem simply does not exist for MPR.**

That makes bricking dramatically easier here:

- A plane through a bricked volume intersects only a small fraction of the bricks — on
  the order of N^(2/3) for an oblique plane through N bricks, and far fewer for an
  axis-aligned one. That is a real residency win, not just a dimension-limit fix.
- No page table is required. You can draw one quad per intersecting brick; the
  plane ∩ brick regions are disjoint in screen space, so there is nothing to blend.
- Even slab MPR survives brick boundaries, because MIP and MEAN are order-independent
  (max combines trivially; mean needs a per-pixel count). It is only the `over`
  operator of DVR that demands strict ordering.

So if bricking ever gets built, **MPR is where it should be built first** — it is the
safe, correct, high-value case, and it is also where the memory pressure genuinely
lives once you accept from §5b that MPR is what keeps the full-resolution data
resident.

### 5f. Summary — which option serves which view

| Option                                     | 3D DVR                                                                     | MPR                                                                                          |
| ------------------------------------------ | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| **1. ½ per axis, full load**               | ideal — ⅛ memory, ~2× fewer steps, quality loss acceptable when zoomed out | **do not bind to a diagnostic MPR**; forces full-res copy to stay resident alongside         |
| **1b. ½ per axis, every-other-slice load** | acceptable — K aliasing is subtle in DVR                                   | **not acceptable if reformats are diagnostic** — halves the reformat's vertical axis         |
| **2. Bricking**                            | expensive and currently incorrect in vtk's chunked path (§3c)              | **natural fit** — no ordering problem, small working set, no page table needed               |
| **3. Slab**                                | does not help rotation; helps zoomed-in stills                             | **native fit for axial MPR** (scrolling = window movement); residency-only win for reformats |

The practical reading: use option 1 for the 3D pane, options 2/3 for MPR residency,
and key the shared mapper-imageData cache by level so the two can differ.

## 6. Server-side axis-aligned storage

Everything above is a client-side mitigation for a problem that is partly created by
the storage format: a study is stored as one stack of axial images, so any view that
is not axial requires all of it.

### 6a. What it removes

From §5c and §5d, a coronal reformat takes one row from every axial slice. That single
fact is responsible for most of this document:

| Consequence today                                                                      | With a stored coronal stack                                          |
| -------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Must fetch and decode 100% of the study to show one coronal image                      | fetch **one image**                                                  |
| First coronal pixel waits for the last axial slice                                     | first coronal pixel waits for one request                            |
| Whole volume must be materialised on the CPU (§1c)                                     | nothing beyond the image                                             |
| Volume must fit `maxTextureDimension3D` and VRAM (§1a, §1b)                            | no volume involved                                                   |
| Half-resolution load unacceptable because it halves the reformat's vertical axis (§5c) | **objection disappears** — the reformat reads its own full-res stack |

That last row is the important one. §5b established that MPR is what forces the
full-resolution volume to stay resident, which is what stops option 1 from being a
memory win. **If orthogonal MPR is served from stored reformats, that constraint goes
away**, and the client-side LOD schemes become genuinely useful instead of additive:

- orthogonal MPR → server-side stacks, full fidelity, one image at a time;
- 3D DVR → ⅛ context volume built from a half-resolution axial load;
- **the full-resolution volume is never materialised on the client at all.**

That combination retires §1a, §1b and §1c simultaneously. The remaining gaps are
oblique/curved MPR and magnified 3D, both discussed in 6d.

### 6b. Is it reasonable to produce?

Yes, and the cost is smaller than it looks, because **decode dominates transposition**.

For a 512×512×2000 CT (524 M voxels, ~1 GB as Int16):

- Decoding 2000 compressed slices is the expensive part — and it is work the server
  very likely already does at ingestion for thumbnails, indexing, or derived objects.
- The transpose itself is memory-bandwidth-bound: a few passes over 1 GB, seconds at
  most. The naive implementation is cache-hostile (writing one coronal slice strides
  through the entire volume), so use a **blocked transpose** — read a 64³ or 128³
  block once, write its contribution into all three output orientations before moving
  on. That turns three random-access passes into one sequential one.
- Output is 3× the voxels (axial + coronal + sagittal). Compressed size is roughly 3×
  as well, though not exactly: reformatted CT slices can expose slice-to-slice noise as
  horizontal streaking, which sometimes compresses slightly worse than the acquired
  orientation. Worth measuring on real data rather than assuming parity.

**Your ingestion-plus-retention proposal is the right shape.** Study access is heavily
front-loaded, so generating at ingestion and keeping the reformats for 10–20 days
captures nearly all of the benefit at a fraction of the steady-state storage. After
expiry, fall back to on-demand generation with a disk cache.

For the on-demand path, one refinement: trigger generation on **first access to the
study**, not on the first request for a coronal image. The user typically opens the
study, looks at axials, and then switches to the coronal pane — which is several
seconds of head start, usually enough to have the reformat ready before it is asked
for. Triggering on the coronal request itself makes the first user wait through the
decode.

### 6c. Which series are worth generating

Not all of them — the cost is per-study and the benefit is not:

| Series                                            | Generate?                                         |
| ------------------------------------------------- | ------------------------------------------------- |
| Thin-slice CT (≤1.5 mm), near-isotropic           | **yes** — highest value, reformats are diagnostic |
| Volumetric MR (3D sequences)                      | **yes**                                           |
| Thick-slice axial CT (5 mm)                       | low value — reformats are poor regardless         |
| Gantry tilt / irregular slice spacing             | yes, but see below                                |
| Localizers, scouts, single images, non-volumetric | no                                                |

**Gantry tilt and irregular spacing need resampling, not transposition.** A pure
transpose is only valid on a regular rectilinear grid. With tilt or variable spacing,
producing a coronal image means interpolating — which is fine to do server-side (it is
exactly what a client-side MPR does anyway), but it makes the output a genuinely
derived, interpolated image. Record the geometry correctly for the new stack, and be
deliberate about labelling it as such.

### 6d. What it does not solve

- **Oblique and curved MPR.** Only the three orthogonal axes are stored. A double
  oblique still needs the volume. A plane close to one of the stored axes could be
  approximated by resampling the nearest stack, at anisotropic quality — usable for
  navigation, questionable for diagnosis.
- **3D DVR.** Raymarching needs the whole volume in a 3D texture no matter how it is
  stored on the server. Axis-aligned stacks do nothing for it.
- **Magnified 3D**, which is the case you identified as the one that matters. That
  wants a full-resolution _sub-volume_, not a reformat — which is option 3's slab, and
  is something a server that can serve reformats can equally serve as a cropped
  sub-volume request.

### 6e. The stronger version: a chunked multi-resolution store

Three transposed stacks cost 3× storage and serve only the orthogonal case. If you are
going to build server-side derived storage anyway, the general form of the same idea is
strictly better: store the volume **once, in bricks, with a resolution pyramid** —
64³ or 128³ chunks, a few mip levels. This is what OME-NGFF/Zarr, Neuroglancer's
precomputed format, and DICOM's own tiled WSI pyramids all do.

Then a single representation serves every option in this document:

| Client need                                 | Served by                                                                                                                |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Coronal / sagittal / axial MPR              | the bricks intersecting that plane — and per §5e there is **no ordering problem for MPR**, so this is correct and simple |
| Oblique MPR                                 | the bricks intersecting the oblique plane — works identically                                                            |
| Reduced-resolution volume for 3D (option 1) | read a coarse pyramid level; the client skips the downsample entirely and fetches ⅛ the bytes                            |
| ROI slab for magnified 3D (option 3)        | the bricks inside the ROI                                                                                                |
| Bricked rendering (option 2)                | the bricks, directly                                                                                                     |

Storage is ~1× plus the pyramid (⅛ + 1/64 + … ≈ **+14%**), against **+200%** for three
transposed stacks. And it handles oblique planes, which transposed stacks cannot.

The trade is client work:

|                       | Storage | Client changes                                                                                                                                                                                          | Coverage                                   |
| --------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| **Transposed stacks** | 3×      | **none** — ship as derived series (`ImageType` `DERIVED\SECONDARY\REFORMATTED`, `FrameOfReferenceUID` preserved) and OHIF's existing stack viewport, SOP class handlers and hanging protocols just work | orthogonal MPR only                        |
| **Chunked pyramid**   | 1.14×   | a new loader and a custom endpoint — DICOMweb has no standard "give me this brick" query                                                                                                                | everything above, including oblique and 3D |

#### Reading

**The one to start with** — Beyer, Hadwiger & Pfister, _State-of-the-Art in GPU-Based
Large-Scale Volume Visualization_, Computer Graphics Forum 34(8):13–37, 2015
([author PDF](https://johanna-b.github.io/files/documents/STAR_CGF_GPULargeScaleVolVis.pdf),
[DOI](https://onlinelibrary.wiley.com/doi/abs/10.1111/cgf.12605),
[slides](https://johanna-b.github.io/files/slides/largeScaleGPUVolRen_STAR.pdf)).
A survey covering exactly the design space in this document: bricking, multiresolution
hierarchies, page tables / virtual texturing, out-of-core streaming, and the
"output-sensitive" principle that work should be proportional to what is actually
visible on screen rather than to dataset size. If you read one thing before choosing
between §6's two options, read this.

**The page-table / virtual-memory approach in depth** — Hadwiger, Beyer, Jeong &
Pfister, _Interactive Volume Exploration of Petascale Microscopy Data Streams Using a
Visualization-Driven Virtual Memory Approach_, IEEE TVCG, 2012
([project page](https://vccvisualization.org/research/petascale/),
[PubMed](https://pubmed.ncbi.nlm.nih.gov/26357136/)). This is the concrete form of the
single-pass indirection recommended in §3c: a multi-resolution page directory on the
GPU, cache misses detected _during_ ray casting and propagated back for on-demand
loading. Also the reference for handling a volume that is still streaming in — missing
bricks are a first-class case rather than an error.

**Format specifications, as concrete examples of a chunked pyramid on the wire:**

- [OME-Zarr / OME-NGFF spec](https://ngff.openmicroscopy.org/0.5/) — the `multiscales`
  metadata is the part to read: how levels, downsampling method, and coordinate
  transforms between levels are declared. Background paper: Moore et al.,
  [_OME-NGFF: a next-generation file format for expanding bioimaging data-access
  strategies_](https://www.nature.com/articles/s41592-021-01326-w), Nature Methods, 2021.
- [Neuroglancer precomputed volume
  format](https://github.com/google/neuroglancer/blob/master/src/datasource/precomputed/volume.md)
  — a smaller, very readable spec; one directory per resolution level, chunk naming by
  coordinate range. The companion
  [sharded format](https://github.com/google/neuroglancer/blob/master/src/datasource/precomputed/sharded.md)
  addresses the problem you would hit immediately with per-chunk files: a large volume
  becomes millions of tiny objects, so chunks are packed into a bounded number of
  shards with an index. Worth reading before designing any brick endpoint.

**Practical comparisons rather than specs** — for "how does this actually serve over
HTTP / S3, and what does it cost":

- [Cloud-Optimized Geospatial Formats Guide](https://guide.cloudnativegeo.org/) — the
  best single starting point. Per-format primers (COG, Zarr, and others) written around
  access patterns rather than byte layouts, with an
  [overview page](https://guide.cloudnativegeo.org/overview.html) that frames the whole
  category. It is geospatial-flavoured, but the mechanics — front-loaded index, then
  range requests for the tiles you need — transfer directly. Its
  [Cloud-Optimized HDF/NetCDF](https://guide.cloudnativegeo.org/cloud-optimized-netcdf4-hdf5/)
  page is the one to read if you are considering HDF5, including the kerchunk /
  virtual-Zarr trick of publishing a chunk index so a monolithic file can be read as if
  it were chunked.
- [OME-Zarr: a cloud-optimized bioimaging file format](https://www.biorxiv.org/content/10.1101/2023.02.17.528834v1.full.pdf)
  (also in [Histochem Cell Biol](https://link.springer.com/article/10.1007/s00418-023-02209-1))
  — contains the benchmark that matters here: the same synthetic data as Zarr, TIFF and
  HDF5, read locally, over HTTP and from S3. The finding is the design argument for
  chunked formats — monolithic formats pay to traverse their internal binary structure
  remotely, and that penalty grows with latency, whereas precomputable chunk locations
  do not.
- [NASA/EOSDIS Cloud-Optimized Format Study](https://ntrs.nasa.gov/api/citations/20200001178/downloads/20200001178.pdf)
  — a formal scoring of candidate formats against cloud access criteria. Useful if you
  need to justify a choice rather than just make one.
- [What is Zarr?](https://www.earthmover.io/blog/what-is-zarr/) — short, readable
  orientation piece if the specs are too much detail too early.

**On compression and lossiness**, there is no single authoritative table, and the
answer is codec-dependent rather than format-dependent — Zarr, N5 and Neuroglancer all
delegate to a codec registry, so the format choice does not fix the compression choice:

- [Zarr codec registry](https://zarr.dev/codecs-registry/Others/Research.html) and the
  [Blosc codec spec](https://zarr-specs.readthedocs.io/en/latest/v3/codecs/blosc/index.html)
  — Blosc wraps lz4/lz4hc/snappy/zlib/zstd with `shuffle` / `bitshuffle` pre-filters.
  For 16-bit CT the byte-shuffle plus zstd combination is the one to try first: shuffle
  groups the high bytes together, which is what makes entropy coding effective on
  narrow-range integer data.
- [imagecodecs](https://github.com/cgohlke/imagecodecs) — the bridge to
  imaging-specific codecs including JPEG 2000 lossless, which is what lets a chunked
  store use the same compression family DICOM already uses.

Expect lossless 16-bit CT to land in roughly the same 2–2.5× range whether you use
JPEG-LS / JPEG 2000 lossless (DICOM's own transfer syntaxes) or shuffle+zstd — but
**measure on your own data**, since ratios vary with slice thickness, reconstruction
kernel and noise far more than with codec choice. Lossy compression is a regulatory and
clinical decision rather than a technical one — and it is a different kind of decision
from resolution level. A lossy codec discards information the display _would_ have
shown. A correctly chosen pyramid level discards only what the display _cannot_ show,
and is lossless by the criterion at the top of this document. The two should not be
traded off against each other as if they were the same currency.

**The DICOM-native precedent** — Supplement 145, Whole Slide Imaging
([NEMA WSI page](https://dicom.nema.org/dicom/dicomwsi/),
[supplement PDF](https://www.dicomstandard.org/News/ftsup/docs/sups/sup145.pdf)).
Directly relevant because it is the existing answer to "how does a pyramid live inside
DICOM": each pyramid level is a separate multi-frame instance, tiles are frames within
it, positioned against a Total Pixel Matrix, and sparse levels (missing tiles) are
explicitly permitted. It is 2D rather than volumetric, so it is a model to adapt rather
than adopt — but if the goal is to keep derived storage inside DICOM rather than
alongside it, this is the shape the standard already sanctions.

**Recommendation:** if you want value without client work, transposed stacks delivered
as derived series are the pragmatic move, and the retention policy you described makes
the 3× storage affordable. If you are willing to build a loader, the chunked pyramid
subsumes every client-side option in this document — options 1, 2 and 3 all become
"ask the server for the right chunks" — and it is the only version that also fixes
oblique MPR and magnified 3D. Preserving `FrameOfReferenceUID` matters in both cases,
so that measurements and annotations cross-reference against the original series.

### 6f. What about NIfTI?

It comes up whenever server-side storage is discussed, so: **NIfTI cannot serve a
resolution pyramid or an octree.** It is a flat, single-resolution, dense raster — a
348-byte header (NIfTI-1) or 540-byte header (NIfTI-2), optional extensions, then one
contiguous block of voxels from `vox_offset`, with `i` varying fastest:

```
offset(i,j,k) = vox_offset + ((k*ny + j)*nx + i) * bytesPerVoxel
```

There is no index, no tile table, and nowhere for a second resolution level to live.
The NIfTI-1 extension mechanism could physically hold arbitrary bytes, but no reader
would interpret them and the section precedes the voxel data.

Byte-range requests against an **uncompressed** `.nii` do give you something, just
much less than a pyramid:

| Access                        | Cost                                                                             |
| ----------------------------- | -------------------------------------------------------------------------------- |
| One axial (k) slice           | **one contiguous range** of `nx*ny*bpv` bytes — efficient                        |
| Every other k slice           | nz/2 contiguous ranges — a clean half-resolution-in-K load                       |
| One coronal (j) plane         | nz ranges of `nx*bpv` each — borderline; most servers cap multipart range counts |
| One sagittal (i) plane        | ny\*nz ranges of 2 bytes each — impractical                                      |
| Any reduced-resolution volume | **not possible** without reading everything                                      |

Fetch the first ~1 KB to read `dim[]`, `datatype`, `vox_offset` and endianness, then
compute offsets directly. Note where this lands: fetching every other slice is exactly
the §2b half-resolution variant — decimated in K, needing in-plane filtering on the
client, and per §5c unacceptable when reformats are diagnostic. NIfTI can express that
one scheme and no other.

**`.nii.gz` removes even that.** Standard gzip is a single sequential stream and
cannot be seeked. `indexed_gzip`-style seek indexes exist but are built by decompressing
the whole file once and are local artifacts, not part of the file.

A crude pyramid is still available by **storing several NIfTI files** —
`full.nii`, `half.nii`, `quarter.nii` — each independently slice-range-accessible, at
+14% storage and near-zero server effort. Combined with §6's transposed stacks that is
three orientations × three levels = nine files at ~3.4× storage. What it still cannot
do: arbitrary ROI sub-volumes (no 3D bricking — you always read whole slices),
efficient sagittal access at any level, and any DICOM metadata at all. That last point
matters here: NIfTI carries no `FrameOfReferenceUID`, no window presets, and no
study/series identifiers, so measurements and annotations lose their cross-reference to
the original series.

**A reframing:** you probably do not want an octree. Octrees buy _adaptive_
subdivision, which pays off on sparse or highly non-uniform data (microscopy with
empty space, LiDAR). A CT volume is dense and uniformly interesting, so the standard
answer — and what OME-Zarr, Neuroglancer precomputed and N5/BigDataViewer all actually
implement — is a **flat brick grid per resolution level**. Simpler to index, simpler to
render, and equivalent in practice for this data.

## 7. Combining them — the scheme that actually scales

Options 1 and 3 are complementary and together cover both workflows. This is the
standard focus-plus-context arrangement, and it is what your `k/(4N)` note is already
reaching toward:

- **Context: a reduced-resolution copy of the whole volume, always resident.** At ½ per
  axis it is ⅛ the memory and fits the 2048 limit for anything up to 4096 per axis; at
  ¼ per axis it is 1/64 and covers 8192. This guarantees that _something_ renders for
  any study, and it is what the interaction frame draws.
- **Focus: full-resolution data for the still frame** — either an ROI slab (option 3)
  when the camera is zoomed in, or the full volume when it fits.

Applied to the reference sizes, with a ½-per-axis context volume:

| Volume         | Full-res GPU | Renderable today?                        | Context volume          | Renderable with context? |
| -------------- | ------------ | ---------------------------------------- | ----------------------- | ------------------------ |
| 512×512×400    | 210 MB       | yes                                      | 26 MB                   | yes                      |
| 512×512×2000   | 1.05 GB      | borderline on integrated                 | 131 MB                  | yes                      |
| 1024×1024×2000 | 4.2 GB       | no                                       | 524 MB                  | yes                      |
| 1024×1024×4096 | 8.6 GB       | no — exceeds `maxTextureDimension3D` too | 1.05 GB (2048 max axis) | yes                      |

Only at the point where even the context volume will not fit — a second reduction
level, or genuinely out-of-core data — does bricking with a page table become the
necessary answer rather than an expensive one.

**This table describes the 3D pane in isolation.** Per §5b, if a diagnostic MPR is on
screen it holds the full-resolution representation resident, so the "renderable with
context?" column describes whether the _3D view_ can be drawn, not the total memory
footprint of the layout. For layouts that include reformats, the context volume is an
addition (1.125×) rather than a replacement, and the memory ceiling is set by MPR's
requirements — which is the case where options 2 and 3, applied to MPR residency, do
the real work.

## 8. Suggested order of work

1. **Guard the cliff.** Add mview's `maxTextureDimension3D` check to the vtk.js WebGPU
   path (and read `MAX_3D_TEXTURE_SIZE` for gl) so an oversized volume produces a
   diagnosable error and a fallback rather than a WebGPU validation failure or a blank
   viewport. Cheap, and it turns the most confusing failure mode into a legible one.
2. **Remove the redundant CPU copies** (§1c). Slice-wise upload in
   `acquireWebGPUMapperImageData` and mview's `uploadVolume` takes peak CPU from ~2S/~3S
   toward ~S, which on its own moves the practical ceiling substantially — and it is a
   prerequisite for building the reduced volume during streaming rather than after it.
3. **Key the mapper-imageData cache by `(volumeId, level)`.** Today
   `mapperImageDataByVolumeId` is keyed by `volumeId` alone and is shared between the
   3D and MPR render paths on both backends (§5b), so there is currently no way for
   the 3D pane to use a reduced volume without degrading MPR. This is a small change
   and it is a hard prerequisite for step 4.
4. **Build the ½-per-axis context volume in that same loop**, with a 2×2 in-plane box
   filter always and a through-plane average only for slice pairs already in cache
   (§2a). Bind it from the 3D path only. Use it as the interaction LOD first
   (performance doc §7c), then as the fallback representation when full resolution
   will not fit. Add the re-average-on-arrival path so the context volume sharpens
   through the slice axis as progressive loading completes.
5. **ROI slab for zoomed-in still frames** (option 3), acquisition-axis only, with
   hysteresis on the window. This also serves axial MPR scrolling directly (§5d), so
   it is worth building against the MPR path rather than the 3D path first — the
   window movement is driven by an existing, well-defined interaction.
6. **Bricking, starting with MPR, not 3D** (§5e). MPR has no ray-ordering constraint,
   needs no page table, and touches only the bricks its plane intersects, so it is the
   correct and safe place to introduce a bricked representation. Extend to 3D only if
   studies remain that defeat steps 4 and 5 — and if so, plan for the single-pass
   indirection approach rather than vtk's chunked multi-volume path, for the ordering
   reason in §3c.

Running in parallel to all of the above, and with the highest leverage per unit of
client work:

7. **Server-side derived storage** (§6). Transposed orthogonal stacks as derived
   series need no client changes at all and remove the constraint that makes step 4 an
   addition rather than a replacement. A chunked multi-resolution store (§6e) is more
   work on the client but subsumes steps 4, 5 and 6 outright — at which point the
   client-side implementations of options 1–3 become "request the right chunks" rather
   than "build the representation locally".

If server-side storage is on the table at all, it is worth deciding between §6's two
forms **before** investing in steps 5 and 6, since the chunked variant makes both
largely unnecessary on the client.
