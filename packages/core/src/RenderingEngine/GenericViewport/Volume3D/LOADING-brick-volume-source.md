# Brick-delivered volumes as a Cornerstone image source

**Goal.** A hierarchical brick encoding of an **existing DICOM series** — no new
instances — whose purpose is **full-resolution off-axis display without fetching the
whole volume**. Metadata stays in the DICOM metadata object. Pixel encoding must be
**lossless compressed**, ideally an existing DICOM transfer syntax. Must handle
multi-dimensional series (4D/5D, and series where the third index is temporal). Loader
layer only — no rendering changes.

Running example: **512 × 512 × 2048 uint16 CT**, 1.07 GB raw, ≈410 MB at 2.5:1 lossless.

## 1. What the base frames serve, and what they do not

`/frames/{n}` stays unchanged, for compatibility and because it is already the best
answer for axial access. But "already available" and "available _effectively_" are
different tests, and only axial passes both.

| Access                                  | Base frames                                  | Effective?                               |
| --------------------------------------- | -------------------------------------------- | ---------------------------------------- |
| **Axial, full resolution**              | 1 frame fetch, ~205 KB                       | ✅ **yes — nothing can improve on this** |
| **Axial, reduced resolution**           | 1 range request, HTJ2K decode level          | ✅ yes                                   |
| **Coarse 3D volume**                    | 2048 range requests, no z reduction          | ❌ request count                         |
| **Sagittal / coronal, full resolution** | **2048 frames, ~410 MB** — the entire series | ❌ **this is the problem**               |
| Oblique, full resolution                | same                                         | ❌                                       |

DICOM's HTJ2K transfer syntax
([Supplement 235](https://www.dicomstandard.org/News-dir/ftsup/docs/sups/sup235.pdf))
mandates RPCL progression and Tile Length Markers so resolution breakpoints are
locatable, and Cornerstone already implements the client half
(`imageLoader/internal/rangeRequest.ts`, `shared/decoders/decodeHTJ2K.ts`, the
`docs/concepts/progressive-loading/` retrieve configuration). So in-plane
multi-resolution and full-resolution axial are genuinely solved and must not be
duplicated.

**Full-resolution off-axis is not solved.** A sagittal plane needs one column from every
frame, so the axial-major base layout forces a complete series fetch — 410 MB and 2048
requests to display a 2 MB plane. A coarse pyramid gives a fast _first_ image but never a
full-resolution one, so it does not address this. **This is what the brick store is
for, and it justifies a full-resolution level even though `/frames/` already holds the
same voxels.**

## 2. Why full-resolution bricks pay

For an orthogonal plane, a brick layout fetches a slab of brick-thickness rather than
the whole volume. The saving is `imageDimension / brickSize`:

| Source of a full-res sagittal plane          | Bytes (raw) | Bytes (~compressed) | Requests |
| -------------------------------------------- | ----------- | ------------------- | -------- |
| Base frames                                  | 1.07 GB     | ~410 MB             | **2048** |
| **64³ bricks** — k<sub>x</sub> fixed, 8 × 32 | **128 MB**  | **~58 MB**          | **256**  |
| 32³ bricks — 16 × 64                         | 64 MB       | ~29 MB              | 1024     |
| 128³ bricks — 4 × 16                         | 256 MB      | ~116 MB             | 64       |

**64³ against base frames is ~7× fewer bytes and 8× fewer requests.** That is the return
on the second copy.

Brick size is a genuine tuning knob: halving it halves off-axis bytes and quadruples
request count. **64³ is the balance point** — 256 requests is comfortable over HTTP/2,
and objects stay large enough to compress well. Choose 32³ if bandwidth dominates and
request count does not.

Note this also settles the cubic-versus-tile question. Tiles of 64 × 64 × 1 would move
exactly the same bytes for a sagittal plane but require **16 384 requests instead of
256**, and the axial advantage that would have justified them is irrelevant because
axial is served by base frames. **Cubic bricks, and only cubic bricks, are right for
this store.**

### Codec: JPEG-LS throughout, including `/frames/`

Typical lossless ratios on this data: **JLS ≈ 3.5:1**, JPEG 2000 ≈ 3:1, **HTJ2K ≈ 2.5:1**
— HTJ2K's high-throughput block coder trades efficiency for decode speed.

The only thing HTJ2K provides that JLS cannot is **in-codestream resolution
scalability**: RPCL progression plus TLM markers let a client byte-range a
low-resolution prefix. Two observations retire that advantage in both stores.

**In the brick store it is redundant**, because the pyramid is explicit — resolution
comes from choosing `d2` over `d1`, not from truncating a codestream.

**On the base frames it is replaceable, and Cornerstone already documents the
replacement.** `docs/concepts/progressive-loading/non-htj2k-progressive.md` describes
serving progressive display from **separate reduced-resolution renditions** rather than
in-codestream scalability, and static-wado already generates them:

```
mkdicomweb create -t jhc --recompress true --alternate jlsLossless --alternate-name jls  …
mkdicomweb create -t jhc --recompress true --alternate jls --alternate-name jlsThumbnail --alternate-thumbnail  …
```

consumed by:

```js
retrieveOptions: {
  default:    { default: { framesPath: '/jls/' } },
  singleFast: { default: { imageQualityStatus: ImageQualityStatus.SUBRESOLUTION,
                           framesPath: '/jlsThumbnail/' } },
}
```

with `singleFast` → `singleFinal` retrieve stages. So the low-res-then-refine behaviour
that HTJ2K decode levels give is **already available with JLS**, in production, with a
documented CLI.

Two further points favour JLS on the base frames:

- **JLS being single-frame is irrelevant here.** DICOMweb frames are individually
  encoded anyway, so the limitation that forced the brick packing discussion does not
  apply at all to `/frames/`.
- **JLS is the more widely supported transfer syntax** — it has been in DICOM since 1999;
  HTJ2K arrived with Supplement 235. For interoperability JLS is the safer choice, not
  the riskier one.

| Store           | Codec       | Why                                                            |
| --------------- | ----------- | -------------------------------------------------------------- |
| `frames/`       | **JPEG-LS** | ~40% better ratio; progressive served by a thumbnail rendition |
| `jlsThumbnail/` | **JPEG-LS** | per-frame reduced in-plane, for stack scrolling                |
| `brick/`        | **JPEG-LS** | ~40% better ratio; scalability supplied by the pyramid         |

Note the three paths are the _same mechanism_ — static-wado `--alternate` renditions — so
`/brick/` is a less novel addition than it first appears.

### Storage, all three options

Base 1024 MB raw; bricks `d1`–`d32` 1.18 GB raw; thumbnail at ¼ in-plane ≈ 67 MB raw.

| Scheme                         | Base       | Bricks     | Thumb | **Total**  |
| ------------------------------ | ---------- | ---------- | ----- | ---------- |
| All HTJ2K                      | 410 MB     | 471 MB     | —     | **881 MB** |
| Mixed — HTJ2K base, JLS bricks | 410 MB     | 336 MB     | —     | **746 MB** |
| **All JLS**                    | **293 MB** | **336 MB** | 19 MB | **648 MB** |

**All-JLS saves ~233 MB against all-HTJ2K — 26% of the store — and lands below the
1024 MB raw volume while holding a full-resolution axial copy, a full brick pyramid and
a thumbnail rendition.**

The trade is one extra rendition (`/jlsThumbnail/`, ~19 MB) in place of in-codestream
scalability. At 117 MB saved on the base against 19 MB spent, that is clearly worth it —
but it is a real operational difference: two paths per series instead of one.

**Caveat:** if a deployment currently relies on HTJ2K streaming retrieve configurations,
switching is a re-encode plus a `retrieveOptions` change, not a drop-in. Measure both
codecs on real series first — the 3.5 : 2.5 gap is the entire argument, and it is a
figure worth confirming rather than inheriting.

### Can the coarse brick levels replace `/jlsThumbnail/`?

For everything volumetric, yes — and they are both smaller and far more capable. The
thumbnail rendition keeps **all 2048 z-planes** and reduces only in-plane; the brick
levels reduce all three axes, so at the _same in-plane resolution_ they are 4× smaller:

| Rendition        | Dimensions           | ~JLS       | Serves                                    |
| ---------------- | -------------------- | ---------- | ----------------------------------------- |
| `/jlsThumbnail/` | 128 × 128 × **2048** | 19 MB      | axial only                                |
| **`brick/d4`**   | 128 × 128 × **512**  | **4.8 MB** | **axial, sagittal, coronal, oblique, 3D** |
| **`brick/d8`**   | 64 × 64 × 256        | **600 KB** | all orientations                          |

Fetching the whole `d8` level costs 600 KB and gives immediate low-resolution access in
**every** orientation — something the thumbnail rendition cannot do at any price, since
a sagittal plane needs data the axial-major thumbnail never reorganises.

Amortised cost favours bricks for scrolling too. One `d4` brick slab (4 bricks, ~600 KB)
covers 64 coarse slices — 256 full-resolution slice positions — so sustained scrolling
costs ~2.3 KB per slice against ~9 KB for per-frame thumbnails.

**On correctness, the brick level is the better representation, not the worse one.**

It is tempting to object that `d4` z-index 256 is an average of four source slices rather
than "slice 1024", and to treat that as a loss of accuracy. It is not. Per the criterion
in [`RENDERING-large-volumes.md`](./RENDERING-large-volumes.md), at a given display
resolution the _correct_ value is the band-limited one — a filtered average **is** the
lossless representation at that resolution, and asking for one specific source slice is
asking for a sample of a finer grid, which is under-sampled by definition.

The existing thumbnail does not have the accuracy the objection would credit it with.
`static-wado-creator/lib/operation/adapter/transcodeImage.js` builds it with:

```js
const dest = { rows: Math.round(rows / 4), columns: Math.round(columns / 4), … };
replicate(src, dest);
```

— **pixel replication, i.e. nearest-neighbour decimation**, with no filtering — and
`generateLossyImage` then encodes it lossily (`jls` at ±2, or high-loss htj2k). So the
current thumbnail is a decimated, lossy artifact that **aliases in-plane**: it folds
high-frequency content down into the displayed band, which is fabrication rather than
blur.

So the comparison is:

|                  | in-plane                        | through-plane          | fidelity at its own resolution |
| ---------------- | ------------------------------- | ---------------------- | ------------------------------ |
| `/jlsThumbnail/` | decimated (`replicate`) + lossy | none (all slices kept) | **aliased**                    |
| `brick/d4`       | box-filtered                    | box-filtered           | **band-limited — correct**     |

**Brick levels are strictly more correct.** The refine step does change through-plane
content, but it changes it from a correct coarse value to a correct fine value, which is
what progressive refinement should do.

That leaves only mechanical arguments for keeping `/jlsThumbnail/`:

- **per-frame random access** is one ~9 KB request, against fetching a brick slab — though
  since a whole `d8` level is 600 KB, prefetching the level wholesale removes this;
- **plumbing** — it works through the existing image-loader `framesPath` mechanism,
  whereas serving a _stack_ viewport from bricks needs a brick-backed **image** loader
  layered on the volume loader.

**Recommendation: treat `/jlsThumbnail/` as interim plumbing, not as the quality
baseline.** Keep it while the stack path has no brick-backed image loader, and retire it
once that exists — the brick levels supersede it on fidelity, on orientation coverage,
and on amortised bytes. At 19 MB of a 648 MB store its cost is ~3%, so the decision is
about machinery and correctness rather than size.

### JLS is single-frame — so how to pack a 64³ brick

JPEG-LS has no multi-frame or tiling concept, so a brick must become one 2D image. The
packing choice matters more for JLS than it would for a wavelet codec, because LOCO-I
predicts each pixel from its **left and above** neighbours — so the packing should make
those neighbours real 3D neighbours.

Pack as **64 wide (x) × 4096 tall**, with row index `r = y × 64 + z`:

- left neighbour → `(x−1, y, z)` — spatially adjacent ✅
- above neighbour → `(x, y, z−1)` — spatially adjacent ✅, for 63 of every 64 rows
  (at `z = 0` it falls back to `(x, y−1, 63)`)

This deliberately puts the **through-plane** axis on the fast vertical direction, so the
MED predictor exploits inter-slice correlation — which for thin-slice CT is often
stronger than in-plane correlation, and which slice-wise encoding never uses at all. The
alternative `r = z × 64 + y` (plane-major) instead exploits in-plane vertical
correlation, also 63/64 rows valid. **Choose by slice thickness — through-plane
interleave for near-isotropic voxels, plane-major for thick slices — or simply measure
both.** There is a real possibility of beating 3.5:1 here, since neither ordering is
what the 3.5 figure was measured on.

Avoid the mosaic packings (512 × 512 as an 8 × 8 grid of planes): horizontally adjacent
pixels straddle plane boundaries every 64 columns, which is exactly the neighbour the
predictor relies on most.

### Measured — Juno CT, 512 × 512 × 174, 0.98 mm in-plane, 5 mm slices

Source `frames/` as stored: **28.34 MB, 3.07:1**.

| Combination          | Brick total  | Ratio      | vs `frames/` |
| -------------------- | ------------ | ---------- | ------------ |
| **JLS, plane-major** | **32.07 MB** | **3.10:1** | **+113.2%**  |
| JLS, z-minor         | 32.48 MB     | 3.06:1     | +114.6%      |
| HTJ2K, plane-major   | 36.19 MB     | 2.75:1     | +127.7%      |
| HTJ2K, z-minor       | 36.95 MB     | 2.69:1     | +130.4%      |

Three things fall out, two of which contradict what this document previously assumed.

**The small-tile penalty is real, but only for the wavelet codec.** JLS bricks (3.06–3.10)
essentially match the source frames (3.07), so packing into 64-wide images costs
JPEG-LS nothing measurable. HTJ2K bricks (2.69–2.75) sit ~12% below the same frames.
A predictive codec degrades far less on narrow images than a wavelet one, because it
needs only the left and above neighbours rather than a wide support region. **This is
the strongest argument for JLS in the brick store** — stronger than the headline ratio,
because it is specific to bricking.

**JLS beats HTJ2K by 12–14% here, not the ~40% the 3.5 : 2.5 figures imply.** On this
data JLS lands at 3.06–3.10 and HTJ2K at 2.69–2.75. The codec choice still holds; the
margin is smaller than assumed and should be quoted as measured.

**`plane-major` wins, so the recommended default is wrong for this series.** The rule
stated above is right — this is a **5 mm slice** series against 0.98 mm pixels, 5:1
anisotropy, so in-plane vertical neighbours are five times physically closer than
through-plane ones and predict much better. The margin is small (1.2% for JLS, 2.1% for
HTJ2K) precisely because through-plane correlation is weakened but not absent.

Expect `z-minor` to win on near-isotropic thin-slice data; that remains untested.
**The generator should choose per series from the spacing ratio rather than defaulting
to either** — `plane-major` when slice spacing materially exceeds in-plane spacing,
`z-minor` when they are comparable. The loader needs no change either way: it reads
`brickOrder` from the manifest and de-interleaves accordingly.

**Per-object overhead is small either way**, and favours JLS: a JPEG-LS header is roughly
25–40 B (SOI + SOF55 + SOS + EOI) against HTJ2K's ~120–200 B.

| Container                               | Overhead per brick | On ~150 KB |
| --------------------------------------- | ------------------ | ---------- |
| **One packed JLS codestream**           | ~35 B              | **0.02%**  |
| 64 JLS codestreams + index              | ~2.2 KB            | 1.5%       |
| 64 JLS codestreams as multipart on disk | ~10 KB             | ~7%        |

The multipart-on-disk option reuses static-wado's existing writers
(`WriteMultipart.js`, `MultipartHeader.js`, `MultipartAttribute.js`) and lets the server
return a brick without reassembly — but at ~7% overhead plus 64 decoder invocations per
brick instead of one. Since axial access comes from base frames, there is **no
access-granularity reason to subdivide a brick**, so the single packed codestream wins:
lowest overhead, one decode, and it works with `decodeJPEGLS.ts` unchanged — the loader
simply de-interleaves the decoded buffer into the volume.

**What is given up:** with HTJ2K you could byte-range a reduced-resolution version of a
`d1` brick, getting quality between `d2` and `d1` without storing it. JLS is all-or-
nothing. That matters little when `d2` already exists, and it is cheap insurance to
**measure both codecs on real series before committing** — the 3.5 : 2.5 gap is the
entire argument.

## 3. Levels and storage

### Levels reduce by physical spacing, not by a single factor

A scalar downsample factor is only right for isotropic voxels. Juno is 0.977 mm
in-plane against **5 mm** slices — 5.1:1 — so halving _z_ as hard as _x_ and _y_ preserves
that anisotropy the whole way down and leaves a coarse level with 22 slices over 870 mm:
40 mm slabs, useless for a coronal reformat or a 3D view.

So each step halves only the axes whose spacing is more than a half-octave (√2) finer
than the coarsest axis', and halves all three once they are comparable. On isotropic data
no axis is ever √2 finer than another, so this **degenerates exactly to the uniform
ladder below** — it changes nothing for a thin-slice series.

For Juno that gives:

| Level        | Dimensions       | Spacing (mm)           | Aspect   | Stored            |
| ------------ | ---------------- | ---------------------- | -------- | ----------------- |
| `d1`         | 512 × 512 × 174  | 0.98 / 0.98 / 5.0      | 5.1      | ✅                |
| `d2_2_1`     | 256 × 256 × 174  | 1.96 / 1.96 / 5.0      | 2.6      | ❌ computed only  |
| `d4_4_1`     | 128 × 128 × 174  | 3.91 / 3.91 / 5.0      | 1.28     | ✅                |
| **`d8_8_2`** | **64 × 64 × 87** | **7.81 / 7.81 / 10.0** | **1.28** | ✅ **one object** |

Two consequences worth naming.

**The coarsest level is a single request covering the whole volume.** 64 × 64 × 87 is
356 k voxels, inside the single-brick budget, so its brick is _the shape of the level_
rather than a cube — one 64 × 5568 codestream, **185 KB measured**. Uniform halving
would instead have produced 64 × 64 × 22 at 40 mm spacing. The extra 4× in _z_ is what
makes the first request displayable in every orientation rather than only axially.

**`d2_2_1` is computed but not stored.** Reaching isotropy takes steps that halve only
_x_ and _y_, and those divide the voxel count by 4 rather than 8. The first such step is
therefore the most expensive level after `d1` and the least useful — 2× coarser in-plane,
identical through-plane. A level is stored only if its factors multiply to ≥ 8, which is
the reduction a uniformly halved level already has, so **nothing is dropped on isotropic
data**.

Levels are named `d<f>` while the axes agree and `d<fx>_<fy>_<fz>` once they diverge,
because `d8` would not describe a level that reduced _z_ by 2.

### Bricks are stored at their true extent

An edge brick covers fewer voxels than the brick pitch and is stored at exactly that
extent, not padded out. Juno's 174 slices over three 64-deep bricks leave the trailing
one holding 46, so **64 of the 192 `d1` bricks** — a third of the level — would otherwise
have been 28% zeros. Padding compresses to almost nothing, but it still costs a full-size
decode buffer and the decode work to fill it. Measured on disk: `d1/k002/y0x0.jls` is
64 × **2944**, i.e. 64 × (64 × 46).

### Measured — Juno, `alternates --brick`

|                | Old uniform pyramid     | **Spacing-driven**          |
| -------------- | ----------------------- | --------------------------- |
| Levels stored  | `d1`, `d2`, `d4`, `d8`  | `d1`, `d4_4_1`, `d8_8_2`    |
| Bricks         | 192 + 32 + 4 + 1 = 229  | 192 + 12 + 1 = **205**      |
| Coarse level   | 64 × 64 × 22, 40 mm _z_ | **64 × 64 × 87, 10 mm _z_** |
| Coarse fetch   | 4 bricks                | **1 brick, 185 KB**         |
| `brick/` total | 32.07 MB, +113.2%       | **30.28 MB, +106.8%**       |

Per level: `d1` 28.55 MB, `d4_4_1` 1.54 MB, `d8_8_2` 185.5 KB, against `frames/` at
28.34 MB (3.07:1).

**It is smaller than the uniform pyramid it replaces while holding 4× the through-plane
resolution at the coarse levels** — the budget is reallocated out of redundant in-plane
steps rather than added to.

One estimate in this document was wrong and the measurement corrects it: coarse levels
compress **better** than `d1`, not worse — `d4_4_1` reaches 3.49:1 and `d8_8_2` 3.84:1
against `d1`'s 3.07:1. Box-filtering removes the high-frequency acquisition noise that
the MED predictor handles least well, so each reduction improves the ratio.

### The uniform ladder, for near-isotropic series

Sizes at **JPEG-LS 3.5:1**:

| Level           | Dimensions       | Raw         | ~JLS        | Bricks (64³)          |
| --------------- | ---------------- | ----------- | ----------- | --------------------- |
| **d1**          | 512 × 512 × 2048 | 1 024 MB    | ~293 MB     | 8 × 8 × 32 = **2048** |
| **d2**          | 256 × 256 × 1024 | 134 MB      | ~38 MB      | 256                   |
| **d4**          | 128 × 128 × 512  | 16.8 MB     | ~4.8 MB     | 32                    |
| **d8**          | 64 × 64 × 256    | 2.1 MB      | ~600 KB     | 4                     |
| **d16**         | 32 × 32 × 128    | 262 KB      | ~75 KB      | 2 (partial)           |
| **d32**         | 16 × 16 × 64     | 33 KB       | ~10 KB      | 1 (partial)           |
| **Total added** |                  | **1.18 GB** | **~336 MB** | **2343**              |

With base `/frames/` also on JLS (~293 MB) plus a thumbnail rendition (~19 MB), the whole
store is **~648 MB against a 1024 MB raw series** — it holds a full-resolution axial
copy, a complete brick pyramid and a thumbnail, and still comes in **below the raw voxel
data**. Counted as voxels rather than bytes it remains a second full-resolution copy,
i.e. **2.14× the raw data**. That is the honest price of fast
full-resolution off-axis display: the base layout is axial-major, off-axis access needs
different locality, and no encoding removes that. It should be a conscious decision
rather than a surprise.

Two levers if 2.14× is too much:

- **Omit `d2`** (the largest coarse level) → ~2.01×, costing one refinement step.
- **Store `d1` bricks only for eligible series** — thin-slice, near-isotropic, volumetric
  — and let others fall back to base frames for off-axis.

### The orthogonal-only alternative, stated honestly

If **orthogonal** MPR speed is the whole requirement and oblique does not matter,
transposed frame stacks beat bricks by a wide margin: a sagittal plane becomes **one
frame, ~800 KB, one request** instead of 58 MB and 256 requests. The cost is +2× storage
(sagittal and coronal stacks) for ~3.14× total, and no oblique or 3D benefit.

Bricks are recommended because they serve **oblique reformats and 3D traversal** as well
as orthogonal planes, from a single +1× copy. But if the deployment only ever shows
orthogonal MPR, the transposed option is 60× faster for it and should not be dismissed.

## 4. Multi-dimensional series

The pyramid covers **spatial** axes only. Time, channel and b-value are _indexed_, not
subsampled — every phase is wanted at reduced spatial resolution, not half the phases.

```json
{
  "version": 2,
  "axes": [
    { "name": "x", "type": "space", "size": 512, "subsample": true },
    { "name": "y", "type": "space", "size": 512, "subsample": true },
    { "name": "z", "type": "space", "size": 2048, "subsample": true },
    { "name": "t", "type": "time", "size": 20, "subsample": false }
  ],
  "dimensionIndexPointers": ["(0020,9056)", "(0020,9057)"],
  "brickSize": [64, 64, 64],
  "brickOrder": "z-minor",
  "brickPadding": false,
  "spacing": [0.7, 0.7, 0.5],
  "levels": [
    {
      "name": "d1",
      "factors": [1, 1, 1],
      "size": [512, 512, 2048],
      "brickSize": [64, 64, 64],
      "bricks": [8, 8, 32]
    },
    {
      "name": "d32",
      "factors": [32, 32, 32],
      "size": [16, 16, 64],
      "brickSize": [16, 16, 64],
      "bricks": [1, 1, 1]
    }
  ],
  "transferSyntaxUID": "1.2.840.10008.1.2.4.80"
}
```

`factors` is per axis, so a level is `d8_8_2` when the spacing rule reduced _z_ less than
in-plane. `brickSize` is per level, which is how a coarse level becomes one object.
`brickPadding: false` says bricks are stored at their true extent, so a reader sizes each
decode from the level's `size` and `brickSize` rather than assuming every brick is full.
`size`, `factors`, `brickSize` and `bricks` are all derivable and all written explicitly,
because repeated halving rounds up at each step and `ceil(size / factor)` does not always
agree with it.

Two cases the declaration must handle:

- **4D / 5D spatial series** — non-spatial axes become path components, one pyramid per
  index combination. A 20-phase study is 20 × 2343 objects, and 20 × the storage, which
  makes the eligibility rule matter far more than for a 3D series.
- **Series whose third index is temporal** (cine, dynamic 2D) — there is no spatial _z_,
  so no off-axis plane exists to serve. **Emit no brick store**; base frames already
  cover everything.

`dimensionIndexPointers` maps store axes onto the series' existing
`DimensionIndexSequence` / `DimensionIndexValues`, so there is no second addressing
convention. The axes-declaration idea is borrowed from OME-NGFF — the part of that spec
worth keeping even though the container was rejected.

## 5. Layout

```
studies/{StudyInstanceUID}/
  series/{SeriesInstanceUID}/
    frames/                              # UNCHANGED — full-res axial, compatibility
      1 … 2048
    brick/
      manifest.json
      d1/ t000/k000/y0x0.jls … y7x7.jls  # 64 bricks per k, k000 … k031
      d2/ t000/k000/y0x0.jls … y3x3.jls  # k000 … k015
      d4/ t000/k000/y0x0.jls … y1x1.jls  # k000 … k007
      d8/ t000/k000/y0x0.jls … k003
      d16/t000/k000/y0x0.jls … k001
      d32/t000/k000/y0x0.jls
```

An anisotropic series has the same layout with spacing-driven level names, and its
coarsest level is a single object — as actually generated for Juno:

```
    brick/
      manifest.json
      d1/     k000/y0x0.jls … y7x7.jls   # 8x8 per k, k000 … k002   (192)
      d4_4_1/ k000/y0x0.jls … y1x1.jls   # 2x2 per k, k000 … k002   (12)
      d8_8_2/ k000/y0x0.jls              # the whole level, 185 KB  (1)
```

```
brick/{d}/{t###}/{k###}/y{ky}x{kx}.jph
        k = brick index along z
        t = one component per non-spatial axis; omitted for 3D series
```

Largest directory is 64 entries (`d1` tiles per `k`), with 32 `k` directories per level —
nothing near a listing or filesystem limit.

A level small enough to be worth one request is given a **brick the shape of the level**,
so it is a single object with no index format, no range requests and no new container —
the ordinary brick path serves it unchanged. That supersedes the packed-level-with-offset-index
idea this section previously proposed: the manifest already carries a per-level `brickSize`,
and setting it to the level's own dimensions is the whole mechanism.

## 6. What display costs

| Step                            | Source                              | Bytes      | Requests |
| ------------------------------- | ----------------------------------- | ---------- | -------- |
| Coarse 3D + all planes          | `brick/d8`, one object              | 750 KB     | **1**    |
| Axial, full resolution          | **base** `/frames/1024`             | 205 KB     | **1**    |
| Sagittal refine                 | `brick/d4`, k<sub>x</sub> fixed     | 3.8 MB     | 16       |
| Sagittal refine                 | `brick/d2`, k<sub>x</sub> fixed     | 30 MB      | 64       |
| **Sagittal, full resolution**   | **`brick/d1`, k<sub>x</sub> fixed** | **~58 MB** | **256**  |
| _(same, without a brick store)_ | _base frames_                       | _~410 MB_  | _2048_   |

The progression is the point: something on screen in one request, the diagnostic axial
plane at full resolution in one more, and full-resolution sagittal reachable in ~58 MB
instead of the whole series.

### Measured, for the Juno store above

174 slices means the _z_ brick grid is only 3, so the off-axis saving is set by the
in-plane grid of 8 rather than by depth — the 2048-slice figures above are where the
headline 8× comes from.

| Step                            | Source                              | ~Bytes      | Requests |
| ------------------------------- | ----------------------------------- | ----------- | -------- |
| Coarse 3D + all planes          | `brick/d8_8_2`, whole level         | **185 KB**  | **1**    |
| Sagittal refine                 | `brick/d4_4_1`, k<sub>x</sub> fixed | 0.77 MB     | 6        |
| **Sagittal, full resolution**   | **`brick/d1`, k<sub>x</sub> fixed** | **~3.6 MB** | **24**   |
| _(same, without a brick store)_ | _base frames_                       | _28.34 MB_  | _174_    |

**~4.5 MB and 31 requests to reach a full-resolution sagittal plane, against 28.34 MB and
174 requests** — 6.3× fewer bytes, 5.6× fewer requests.

## 7. Signalling that the brick store exists

**The NIfTI path uses a loader _scheme_, not a private tag.**
`packages/nifti-volume-loader/src/constants/niftiLoaderScheme.ts` defines the scheme
`nifti`; a volume is `volumeId = 'nifti:<url>'`, dispatched via `registerVolumeLoader`.
A search of this repo and `static-dicomweb` finds no NIfTI private tag — only a tsconfig
alias. _(If one exists elsewhere, point me at it and this should follow its
conventions.)_

The scheme mechanism is directly reusable:

```
registerVolumeLoader('brick', cornerstoneBrickVolumeLoader)
volumeId = 'brick:https://host/studies/{study}/series/{series}/brick/'
```

Because the bricks are an encoding of an existing series rather than new instances,
nothing in a series query reveals them — a **private tag carrying a manifest URI** is the
only signal:

```
(0009,0010) LO  PrivateCreator     "RadicalImaging"     # block already in use
(0009,10E0) UR  BrickManifestURI   ".../series/{uid}/brick/manifest.json"
```

Group `0009` block `10` is already used by static-dicomweb — `(0009,1001)` carries
Content-Location — so this extends a reserved block rather than claiming a new group.
Keep levels, brick size, axes and transfer syntax **out** of DICOM and in the manifest so
the layout can evolve without a tag change. The tag rides on every instance; it is a
short string, and any single metadata retrieval reveals the capability.

**This is the mechanism Phase 4a.5 of [`RENDERING-PLAN.md`](./RENDERING-PLAN.md) called
for** — the decision engine can only choose a representation it knows exists, and OHIF
already fetches series metadata before deciding what to display.

## 8. Why not an off-the-shelf brick format

**No off-the-shelf brick format carries 16-bit DICOM-standard lossless codecs.**

[Neuroglancer precomputed](https://github.com/google/neuroglancer/blob/master/src/datasource/precomputed/volume.md)
has the right shape — brick-native chunking, `scales` pyramid, `uint16` data type,
sharding, multiple chunk shapes per scale — but its encodings are `raw`, `jpeg` and
`compressed_segmentation` only. `jpeg` requires `uint8` and is lossy;
`compressed_segmentation` requires `uint32`/`uint64`. **For `uint16` the only encoding is
`raw`**, so a 1 GB volume stays 1 GB. It also expresses `resolution` in nanometres, an
electron-microscopy inheritance.

OME-Zarr can carry JPEG-LS or HTJ2K only through non-standard `numcodecs` ids, forfeiting
the ecosystem interoperability that was its sole advantage. Plain **Zarr v3 with `zstd`**
is the honest non-DICOM option — standard, lossless, sharded — but with metadata in DICOM
and a flat path layout sufficing for 2343 objects, it buys little.

## 9. What it takes in Cornerstone — and what already works

The hook is **`registerVolumeLoader`**, not `registerImageLoader`. The loader mixes
sources — coarse levels and full-resolution bricks from `brick/`, full-resolution axial
frames from `frames/` — and populates the volume's scalar buffer directly, which is why
it belongs at the volume level.

### 9a. Reduced resolution is already supported

`packages/core/src/loaders/decimatedVolumeLoader.ts` already builds a
`StreamingImageVolume` at reduced resolution via `ijkDecimation: [i, j, k]`:

- **K decimation** removes slices _before_ metadata generation, so spacing reflects the
  decimated stack and fewer imageIds are fetched;
- **In-plane decimation** (`decimatedVolumeModifiers/inPlaneDecimationModifier.ts`)
  divides Columns/Rows, scales PixelSpacing, and rewrites the DICOM metadata to match;
- the design is a plugin chain (`applyDecimatedVolumeModifiers`), and the loader's own
  doc comment already anticipates a `partialRangeModifier` as a future member.

**This matters more than it first appears, because a decimated volume is allocated at the
reduced dimensions.** So for the reduced-resolution case Cornerstone already delivers
what §9 previously denied: real reduction in **CPU volume memory, GPU texture memory and
the `maxTextureDimension3D` headroom** — not just latency.

The brick store slots directly into this as a better data source, improving two things:

|                    | `decimatedVolumeLoader` today                       | Fed from brick coarse levels                       |
| ------------------ | --------------------------------------------------- | -------------------------------------------------- |
| Network            | fetches full-resolution frames, reduces client-side | fetches only the coarse level — `d8` is 950 KB     |
| K reduction        | **drops slices** — decimation, so it aliases        | **band-limited** — properly filtered at generation |
| In-plane reduction | client-side                                         | precomputed                                        |

The aliasing point is the one to emphasise: dropping every _n_-th slice folds
through-plane structure into the displayed band, which is fabrication rather than blur
(see the quality criterion in
[`RENDERING-large-volumes.md`](./RENDERING-large-volumes.md)). A server-generated,
box-filtered level is strictly better, and costs the client nothing.

### 9b. Full resolution is the subsequent phase

For a full-resolution off-axis view the renderer still reslices from a **dense,
full-extent** volume — `createMapperImageData` builds a complete `vtkImageData` and the
mappers bind a full 3D texture. So fetching only the sagittal slab of `d1` bricks reduces
network and decode, and the unfetched region can be zero-filled and refined, but the
allocation is full-size regardless.

That is the later phase, and it needs one of:

- a **partial / sparse volume** representation (the `partialRangeModifier` the decimated
  loader already gestures at), so an allocated volume can cover a sub-extent; or
- the **brick-aware rendering** of Phase 4b in [`RENDERING-PLAN.md`](./RENDERING-PLAN.md).

**The format should define `d1` now even though its consumer comes later** — that is the
whole point of fixing the layout up front, so nothing has to be regenerated when the
full-resolution path lands.

## 10. Recommendation

**Define the whole format now; implement its consumers in two steps.** Fixing `d1`
through `d32` up front means nothing has to be regenerated when the full-resolution path
lands.

|            | Deliverable              | Consumer                    | Status                                   |
| ---------- | ------------------------ | --------------------------- | ---------------------------------------- |
| **Step 1** | coarse levels `d2`–`d32` | **`decimatedVolumeLoader`** | consumer **already exists**              |
| **Step 2** | `d1` bricks              | full-resolution off-axis    | needs partial-volume support or Phase 4b |

Step 1 is worth shipping alone: it replaces client-side decimation of full-resolution
fetches with a band-limited precomputed level, cutting network from hundreds of MB to
~950 KB _and_ removing the slice-dropping aliasing — against a loader that already
reduces allocated memory. Storage cost for `d2`–`d32` alone is **+14%**.

1. **Keep `/frames/` as the full-resolution axial source** — a single fetch, not
   duplicated anywhere — but **re-encode it to JPEG-LS**. ~29% smaller than HTJ2K, and
   the progressive behaviour HTJ2K gave in-codestream is already served by a
   `/jlsThumbnail/` rendition that static-wado generates and Cornerstone consumes today.
2. **Generate `d1` through `d32` as 64³ bricks.** `d1` is the point of the exercise —
   ~7× fewer bytes and 8× fewer requests for full-resolution off-axis planes — even
   though its consumer arrives in step 2. Keep `d1` bricks **cubic in voxels**: making them
   physically cubic on a 5 mm series (64 × 64 × 13) moves identical bytes for a sagittal
   plane but turns 24 requests into 104.
3. **Choose which axes each level reduces from the spacing, not from one factor** — and
   give a level that fits one request a brick shaped like the level, so the opening fetch
   is a single object. See §3; both are implemented and measured.
4. **Accept ~2.14× total storage** once `d1` is stored, or **+14%** for coarse levels
   alone; trim further with the `d2` and eligibility levers.
5. **Filter, do not decimate, when generating levels** — this is the quality advantage
   over what `decimatedVolumeLoader` does client-side today.
6. **Encode bricks with JPEG-LS, not HTJ2K** — ~3.5:1 against ~2.5:1, saving ~135 MB
   (15% of the store). HTJ2K's in-codestream resolution scalability is what the base
   frames need and what the brick pyramid makes redundant. Both decoders already ship.
7. **Pack each brick as one JLS codestream** of `extentX` × (`extentY` × `extentZ`), with
   rows interleaved `r = y × extentZ + z`, so the predictor's left and above neighbours are
   true 3D neighbours. Store each brick at its **true extent** rather than padding edge
   bricks — a third of Juno's `d1` bricks would otherwise be 28% zeros. Measure that
   ordering against plane-major and against HTJ2K on real series before committing.
8. **Declare axes in the manifest**, index non-spatial dimensions as path components, and
   emit no store for series whose third index is temporal.
9. **Signal with one private tag** carrying the manifest URI, plus a `brick:` volume
   loader scheme mirroring `nifti:`.
10. **Consider transposed stacks instead** if oblique and 3D are genuinely out of scope —
    60× faster for orthogonal MPR at +1× more storage.

---

Sources: [Neuroglancer precomputed volume spec](https://github.com/google/neuroglancer/blob/master/src/datasource/precomputed/volume.md) ·
[DICOM Supplement 235 (HTJ2K)](https://www.dicomstandard.org/News-dir/ftsup/docs/sups/sup235.pdf) ·
[DICOM WSI / Supplement 145](https://dicom.nema.org/dicom/dicomwsi/) ·
[CP-2135 Acquisition and Pyramid Entities](https://www.dicomstandard.org/news-dir/current/docs/cpack115/cp2135.pdf) ·
[JPEG HTJ2K white paper](https://ds.jpeg.org/whitepapers/jpeg-htj2k-whitepaper.pdf)
