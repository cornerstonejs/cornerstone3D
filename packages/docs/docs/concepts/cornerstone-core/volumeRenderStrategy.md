---
id: volumeRenderStrategy
title: Volume Render Strategy
summary: How a viewport builds the strategies that a volume render path can use, how one render selects among them, and how the texture sets, the composite voxel manager and the quality record fit together
---

# Volume Render Strategy

A **strategy** states **how a render gets its voxels**. It is the unit that a volume render path
works with, and the names of the texture sets derive from it.

A device cannot always hold the full-resolution texture of a volume. The older code built one
texture in the constructor of `ImageVolume`, asked for it at the full dimensions, failed inside the
driver and showed a black viewport. A strategy replaces that: a render path states which strategies
it can use, the expensive work happens off the frame path, and each render chooses among what
already exists.

## The pieces

```
                        ┌─────────────────────────────────────────────┐
                        │  ImageVolume                                │
   the data             │    · the voxels, through CompositeVoxelManager
   and its              │    · the named texture sets of this volume  │
   textures             │    · the grid of the full-resolution data   │
                        └─────────────────────────────────────────────┘
                              ▲                        ▲
                              │ reads voxels           │ lists its sets
                              │                        │
  ╔═══════════════════════════╪════════════════════════╪═══════════════════════════╗
  ║  WHEN THE VIEWPORT ADDS ITS ACTOR, AND AGAIN ON A REBUILD                       ║
  ║                           │                        │                            ║
  ║   VtkVolumeSliceRenderPath│                        │                            ║
  ║            │              │                        │                            ║
  ║            │ asks         │                        │                            ║
  ║            ▼              │                        │                            ║
  ║   VolumeStrategyProvider ─┘                        │                            ║
  ║            │   · reads the GpuSettings    │                            ║
  ║            │   · computes the box factors per axis │                            ║
  ║            │   · provisions the texture sets ──────┘                            ║
  ║            │                                                                    ║
  ║            ▼                                                                    ║
  ║   IVolumeRenderStrategy[]   the strategies this render path may use             ║
  ║                                                                                 ║
  ║   a rebuild runs the provider again, on one of two events, and NEVER on a       ║
  ║   render:   loaded  the data finished loading                                   ║
  ║             memory  the budget changed, or the store evicted a set              ║
  ╚═════════════════════════════════════════════════════════════════════════════════╝
                               │
                               │  held by the render path
                               ▼
  ╔═════════════════════════════════════════════════════════════════════════════════╗
  ║  EVERY RENDER                                                                   ║
  ║                                                                                 ║
  ║   SelectVolumeStrategy ──────► one strategy, or NOTHING                         ║
  ║            │                                                                    ║
  ║            │  the chosen strategy updates anything of its own that moves        ║
  ║            ▼                                                                    ║
  ║   StrategyBinding[]      ordered, each with a role: base or refinement          ║
  ║            │                                                                    ║
  ║            ├──────────► the mapper binds the base texture                       ║
  ║            │                                                                    ║
  ║            └──────────► the render composes a VoxelQualityRecord                ║
  ╚═════════════════════════════════════════════════════════════════════════════════╝

  ╔═════════════════════════════════════════════════════════════════════════════════╗
  ║  WHENEVER NEW DATA ARRIVES                                                      ║
  ║                                                                                 ║
  ║   the loader ──► the voxel managers ──► ImageVolume marks the frame             ║
  ║                                              │                                  ║
  ║                                              ▼                                  ║
  ║                        every texture whose grid covers that frame               ║
  ║                                              │                                  ║
  ║                                              ▼                                  ║
  ║                        refilled at the next render of that texture              ║
  ╚═════════════════════════════════════════════════════════════════════════════════╝
```

| Piece                    | What it is                                                                                                                                             |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `IVolumeRenderStrategy`  | How one render gets its voxels. It says what to bind, and it keeps what it holds current. A strategy instance belongs to **one** render path.          |
| `VolumeStrategyProvider` | Builds the strategies of one render path. **A render component defines its own provider**, and that is how a new render type defines new texture sets. |
| `SelectVolumeStrategy`   | Chooses the strategy of one render, among the strategies that the provider already built.                                                              |
| `StrategyBinding`        | One texture that a strategy offers, with the role `base` or `refinement`.                                                                              |
| `VolumeTextureSet`       | A named set of textures, and the unit of storage, of cost and of eviction. Its members carry an area index.                                            |
| `volumeTextureStore`     | The global store of the sets, with one budget for the texture memory of every volume.                                                                  |
| `CompositeVoxelManager`  | The voxels. It holds the full-resolution data and every reduced representation, and it fills a grid from the best sources that it has.                 |
| `GpuSettings`            | The limits of the device. `auto` (the default) computes them from the stored record of the device. A named preset overrides `auto`.                    |
| `VoxelQualityRecord`     | The absolute record of the data that a render drew. It states no verdict.                                                                              |

## Where the code is

[Volume Render Sequences](./volumeRenderSequences.md) gives the sequence of calls as diagrams. The
table gives the file of each piece. The paths are under `packages/core/src/`, except the last row.

| Piece or step                                       | Code                                                                                                               |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| The presets, and the limits of a grid               | `utilities/gpuSettingsPresets.ts`: `setGpuSettingsPreset`, `gridLimitsOfGpuSettings`, `gpuSettingsForGrid`         |
| The probe, and the stored record of the device      | `utilities/textureSupport.ts`, `utilities/renderingCapabilities.ts`, `utilities/capabilityStorage.ts`              |
| The memory record of a large allocation             | `utilities/gpuAllocationTracker.ts`, called by `vtkStreamingOpenGLTexture.create3DFromRaw`                         |
| The factors of a reduction, and the reduced grid    | `utilities/voxelGrid/`: `boxAverageReductionFactors`, `reducedDimensions`, `deriveBoxAverageGrid`                  |
| The default provider and the default selection      | `RenderingEngine/helpers/volumeRenderStrategy.ts`: `defaultVolumeStrategyProvider`, `selectFirstReadyStrategy`     |
| The one place that both architectures share         | `RenderingEngine/helpers/resolveVolumeTexture.ts`, called by `createVolumeActor` and `createVolumeSliceActor`      |
| The texture sets and the store                      | `cache/classes/VolumeTextureSet.ts`, `cache/volumeTextureStore.ts`, `ImageVolume.provisionTextureSet`              |
| The marks and the deliveries                        | `cache/classes/ImageVolume.ts`: `markFrameTexturesDirty`, `recordFrameDelivery`, `markFrameModified`               |
| The load                                            | `cache/classes/BaseStreamingImageVolume.ts`: `load`, `successCallback`, `takeInCachedImages`                       |
| The fill of a reduced texture                       | `RenderingEngine/vtkClasses/vtkStreamingOpenGLTexture.js`: `updateTextureFromComposite`, `fillSliceByBoxStatistic` |
| The selection on each render (generic architecture) | `RenderingEngine/GenericViewport/Planar/VtkVolumeSliceRenderPath.ts`: `provisionStrategies`, `applyStrategy`       |
| The sample distance of a 3D render                  | `RenderingEngine/helpers/createVolumeMapper.ts`: `sampleDistanceOf`                                                |
| The statistic of a labelmap                         | `packages/tools/src/stateManagement/segmentation/labelmapModel/labelmapLayerStore.ts`: `tagLabelmapVolume`         |

## How the viewport builds the strategies

**The provider runs when the render path adds its actor, and it never runs on the frame path.** It
does the expensive thing: it allocates the textures.

With final downsampling off (`rendering.lossyDownsampling.final`, the default), the default provider
always builds the full-resolution strategy. With final downsampling on, the provider reads the GPU
settings and answers in one of two ways:

- The device can hold the full-resolution grid, so the provider builds the **full-resolution
  strategy** and provisions the set `full-resolution/full-extent`.
- The device cannot, so the provider computes the **size of the box on each axis** and provisions a
  reduced set whose name carries those factors.

The reduction is per axis and it is not uniform. An edge of 2049 voxels exceeds a limit of 2048 on
one axis and by one voxel, so one axis reduces and the other two do not. A factor can hold a
fraction, see `VRS-I-18`.

**The provider derives no representation.** A reduced texture fills each slice with the
`fillPlane` of the statistic of the volume (`ImageVolume.reductionStatistic`) straight from the
frames of the volume: a box average for an intensity volume, or a foreground majority for a
labelmap. The fill needs no reduced copy of the voxels in CPU memory. A
derivation of a volume that holds all of its data would otherwise reduce every voxel during the
provision, which takes many seconds on the main thread for 512 × 512 × 2464 voxels.
`ImageVolume.getGridQuality` gives the record of such a texture from the deliveries of the volume.

**The textures hold no data at this point.** Almost none of the images of the volume have arrived
when a viewport adds its actor. The loader fills the voxel managers as the data arrives,
`ImageVolume` marks every texture whose grid covers the new region, and each render refills the
marked slices. That is the path that the code already used, and a strategy does not change it.

**One render fills a limited number of reduced slices.** The fill of a reduced texture runs on the
main thread inside the render, so a render stops after `rendering.reducedTextureFill.maxSlicesPerRender`
slices that hold data (16 by default). It also stops when
`rendering.reducedTextureFill.maxMillisecondsPerRender` (8 ms by default) has passed, but only after
it filled at least one slice. The texture then requests another render for the slices that remain,
and the next fill starts where the last one stopped.

**A reduced slice reads only the frames that have arrived.** A frame that has not arrived would pull
the average towards 0. A replicate is a copy of another frame, so a slice reads a replicate only when
no frame of its box has arrived.

## How the volume takes a delivery

`ImageVolume` states three separate things, and each caller states only what it knows:

| Member                   | What it does                                                                                                                    | Who calls it                                                      |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `markFrameTexturesDirty` | Forgets the image that the voxel manager last resolved for the frame, and marks the frame in every texture whose grid covers it | every caller that changes the image of a frame                    |
| `recordFrameDelivery`    | Records the quality of the frame, and redoes the boxes of every derived representation that the frame touches                   | a loader, which knows the quality of the data that it delivered   |
| `markFrameModified`      | Redoes the derived boxes of the frame whatever the record states, and marks the textures. It records no quality                 | an edit of the voxels at an unchanged quality, such as a labelmap |

**Only a caller that knows the quality records it.** A lower record never replaces a higher one, so a
record of `FULL_RESOLUTION` for a thumbnail would stay for ever. The cache adds an image before the
loader calls `successCallback`, so a listener of the cache only marks the textures of an image whose
quality is not known yet, and `successCallback` records the delivery right after it.

`BaseStreamingImageVolume.invalidateVolume` records nothing. Every voxel then holds other data, such
as the next dimension group of a dynamic volume, so the volume discards its composite and builds it
again from the deliveries of the data that the grid now shows, and it marks every texture.

## How a derived representation follows the load

**A derivation is not a single event.** `createRepresentation` reduces the data that the composite
holds at the moment of the call, and a streaming loader delivers its frames after that moment.
`recordFrameDelivery` therefore redoes the boxes of every derived representation that a frame
touches. It redoes **those boxes only**: a volume of 2464 frames re-derives far too slowly to run in
full on each frame.

A source that states which regions it has delivered is reduced over those regions and no others, so
a derivation over a volume that has loaded nothing costs nothing, and a derivation over a volume
that has loaded half of its frames reduces that half.

**A large derivation runs in batches.** `createRepresentation` reduces the first 16 slices of the
derived grid at once, and each later batch of 16 slices in idle time. While the batches run, the
record of the representation covers the slices that they reduced and no others, so the record never
states a voxel that the derivation has not written. Each batch tells the volume which region it
wrote, and the volume marks its textures there. `representation.derivation` resolves when the last
batch is done.

P31.3 states the rule for the values. Before the full-resolution data of a box arrives, the box
average is an approximation over the frames that have arrived, and the code **replaces** that value
in place when the rest arrives. There are never two stored copies.

**The loader keeps the true decoded size.** The request states the type of the buffer and no size,
so an image keeps the size that the decoder produced: a sub-resolution HTJ2K decode and a JLS
thumbnail stay small in the cache. The voxel manager of the volume scales such an image when it
reads it, so the primary grid answers over its whole extent.

## When the strategies are rebuilt

**The provider runs again whenever something changes that could change its answer.** A render path
is long-lived, and two things move under it:

| Reason   | What changed                                                                                                                                              |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `loaded` | The data of the volume finished loading, so a strategy that could not draw before may now be worth building                                               |
| `memory` | The budget of the texture memory changed, or the store evicted a set, so a strategy may need to be rebuilt, or replaced by one that the device can afford |

**A rebuild is an event, and never a render**, so `VRS-C-1` still holds: nothing allocates on the
frame path.

Two rules make a rebuild safe:

- **A provider must be safe to run more than once.** A texture set that the store already holds
  comes back as it is, so a second run of the same provider allocates nothing.
- **A strategy that the provider names again keeps its identity.** A provider builds fresh objects,
  and a fresh object holds no claim on its texture set, so a rebuild that replaced a live strategy
  would leave that claim behind and the store could never evict the set. The render path therefore
  keeps the object that it already holds whenever the provider names it again, and it deactivates
  only the strategies that the provider stopped naming.

A strategy whose set the store evicted answers that it is not ready, and the selection passes over
it at once, with no rebuild needed. The rebuild is what restores it.

## How one render selects a strategy

**The selection runs on the frame path and it cannot fail.** Every strategy already exists, so the
selection allocates nothing, there is no refusal to answer and there is nothing to repeat.

The default selection keeps the strategy of the previous render while that strategy is still ready,
and otherwise takes the first ready one. A render path that wants something else supplies its own
function; the choice is a parameter of the render path and never a branch inside it.

Three answers are legal, and each means something different:

| The selection answers           | What happens                                                                                                                                                                                 |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| a strategy with bindings        | the render binds the `base` texture, and reads any `refinement` textures in the way that render defines                                                                                      |
| a strategy with **no** bindings | the strategy is ready, and the data is not in a texture. The full-resolution data may live in the voxel manager of a device that cannot hold the texture, and the render reads the composite |
| **nothing**                     | no texture is bound at all. A CPU render answers this way for its lossless pass                                                                                                              |

### The phase of a render is not defined here

"Reduced for the first render, full resolution for the lossless render" is a real case, and it is
**not** in this version. A phased render is tightly bound to how that render draws, so the render
component that implements phases names its own phases and reads them in its own selection function.
The record that the selection receives is open for exactly that reason: a reader takes the fields
that it needs by name, and it must not assume that the record holds nothing else.

## How a strategy keeps what it holds current

A strategy is asked to update itself on each render. Most strategies do nothing there, because a
full-extent texture never moves and the volume already marks its dirty slices.

A strategy that holds an **oblique slab** is the case that needs the call. The slab follows the
camera, so the strategy re-points it rather than building a new texture for each position. The slab
holds a front texture and a back texture: the strategy writes the back one and a draw reads the
front one, and a publish while a draw is in flight waits for that draw to finish instead of tearing
it.

This works because **the strategy instance is the single owner**. It belongs to one render path,
which belongs to one viewport, so exactly one party knows when a draw starts and when it stops. A
texture that any number of viewports may read is a different kind, it never re-points, and it needs
none of this.

## How the quality is reported

**The render reports the quality, and no other piece can.** The render is the only party that knows
which textures it used and **how** it used them.

The case that settles it: a 3D render may read a coarse maximum-value texture only to decide which
fine bricks to sample. The quality of that coarse texture is not the quality of the image, so a
record composed from "the textures that were bound" would be wrong. Only the render knows that one
texture answered a question and the others drew the picture.

The record states **no verdict**. A reader compares it against its own requirement, which is how two
viewports over one volume report differently at one moment, and how a viewport reports lossless when
the display resolution sits below the resolution of the data.

## How the device limits are found

The default preset is `auto`. Its edge and its texture memory come from a record that the browser
keeps for each renderer, in the `localStorage` key `cornerstone3D.renderingCapabilities`. The renderer
string and the probe version are the key of the record. A named preset (`low-tablet`, `low`,
`medium`, `high`) overrides `auto`.

A GPU fails in four ways, and each way has its own detection:

| #   | Cause                                           | Symptom               | Detection                                            |
| --- | ----------------------------------------------- | --------------------- | ---------------------------------------------------- |
| 1   | The edge of a texture is too large.             | A uniform gray.       | The probe, before the allocation.                    |
| 2   | The texture memory of the context is too large. | `WEBGL_CONTEXT_LOST`. | The loss during or shortly after a large allocation. |
| 3   | The GPU memory of the browser is too large.     | The tab stops.        | A pending record that a later start finds.           |
| 4   | A texel data type does not work.                | An incorrect image.   | The probe, at the first start.                       |

**The probe.** The probe draws N × 4 × 4 3D textures through a `sampler3D`, which is the path that a
volume uses. It tests each data type at an edge of 8, so a data type failure is not an edge failure.
It tests an edge on each of the three axes, and it samples four texels with different values along
the long axis: the first, the middle, the next to last and the last. A uniform gray or an empty
texture therefore fails. At the first start, the probe tests an edge of 2048 (or
`MAX_3D_TEXTURE_SIZE` when that is smaller), and halves the edge on each failure, down to 16. In
headless Chromium, the first probe took about 50 ms with SwiftShader and about 64 ms on an Intel UHD
GPU, which is below the budget of 250 ms. The probe is not yet measured on a device that renders a
uniform gray above an edge of 128.

**The probe at a larger edge.** When a volume needs an edge above the reliable edge, below a failed
edge and not above `MAX_3D_TEXTURE_SIZE`, `volumeTextureReductionFactors` and the mappers (through
`gridFitsGpuSettings`) run the probe at that edge before the texture is allocated. That probe took 10 to
20 ms. A pass raises the reliable edge, and a failure keeps the volume reduced. An edge whose probe
could not run is not tried again in the same page.

**No edge that a probe did not pass.** The edge of `auto` is the reliable edge, which is an edge that
a probe passed. When the record has none (the first probe could not run, or a failure removed it),
the edge search runs once in the page. When no probe can run at all, the edge is 128, or 8 when the
record states a failure at or below 128.

**The memory.** A page cannot read the memory of the GPU, so the record counts the GPU bytes of the
page from an in-memory ledger (`gpuMemoryLedger`): each texture upload, the canvas of each viewport,
the render buffers of each WebGL context, and a fixed estimate for each context. Another tab does not
count. Under `auto`, a new texture gets the memory limit minus the GPU bytes of the rest of the page.
Before an allocation of 64 MB or more on a visible page, the page writes a pending record under a key
of its own tab. The first render after the allocation settles it: 500 ms later, the total counts as
a success, and the page removes the pending record. A context loss before that, or within five
seconds of the allocation, records the total as a `textureBytes` failure, except on a hidden page and
within one second of a probe context. A pending record that a later start finds records the total as
a `gpuBytes` failure. Two tabs share the record: each change applies to a fresh read of the store.

**The memory level.** Each memory category keeps `normal`, the largest total that worked. A failure
starts an episode, and a failure within 1 hour of the previous one joins it. Each failure of the
episode halves the limit again, from the total of its first failure, for 1 hour after its last
failure, so the reload after a failure uses a lower level. A page that saw the reduction keeps it
until it reloads (`getPageMemoryReduction`). Three episodes within 7 days set a `ceiling` at 0.75 of
the smallest first failure of them, and the limit stays below it until a retest or a success above
it. Later sessions otherwise keep `normal`.

**Counts and retest.** The edge keeps a reliable value with a success count, and a failed value with
a failure count. `auto` does not try a failed edge or a memory ceiling again. A retest is the one way
to try it again, and the application decides when to offer the retest; the counts are for its display
and its decision. An application reads the record with `getStoredRenderingCapabilities()`, clears failures
with `retestRenderingCapabilities()`, and removes the record with
`resetRenderingCapabilities({ clearStorage: true })`. `setCapabilityStorage` replaces the store.

```json
{
  "probeVersion": 3,
  "renderer": "ANGLE (...)",
  "formats": { "norm16": true, "float": true },
  "max3DTextureSize": 2048,
  "probeMs": 63.6,
  "edge": { "reliable": { "value": 2048, "successes": 1 } },
  "textureBytes": {
    "normal": { "value": 1200000000, "successes": 25 },
    "failures": [{ "value": 1800000000, "at": 1793000000000 }],
    "recent": { "value": 1800000000, "at": 1793000060000, "count": 2 }
  },
  "gpuBytes": {
    "normal": { "value": 1200000000, "successes": 25 },
    "ceiling": 900000000,
    "failures": []
  }
}
```

## Scope, and the rule for a change to this document

The **user requirements** of this work are `MR-U-*` in
[cornerstone3D#2921](https://github.com/cornerstonejs/cornerstone3D/issues/2921) and `VFS-U-*` in
[cornerstone3D#2902](https://github.com/cornerstonejs/cornerstone3D/issues/2902). This document does
not restate them, and it does not change one.

The automatic GPU limits of
[cornerstone3D#3020](https://github.com/cornerstonejs/cornerstone3D/issues/3020) have their user
requirements in the specification [GPU device limits](../../specs/core/gpu-device-limits.md)
(`GPULIMIT-USER-*`).

This document holds the design, in three sections with different change rules:

- **§ User requirements** — what the user of a viewer must see. Change one of these only when the
  statement describes the behaviour wrongly, or when the intended user-facing behaviour changes.
- **§ Contracts** — what a consumer of this design may rely on. Change one of these in two cases
  only: the statement describes the behaviour wrongly, or the intended behaviour itself changes.
  That a contract is inconvenient to implement is never a reason to change it.
- **§ Implementation choices** — how this version does the work. Change any of these freely when a
  better approach appears.

## § User requirements

The user requirements of the device limits are `GPULIMIT-USER-*` in
[GPU device limits](../../specs/core/gpu-device-limits.md). This document does not restate them.

## § Contracts

**VRS-C-1.** Provisioning never runs on the frame path. A render allocates no texture and derives
no representation.

**VRS-C-1.1.** A provider may run again, on an event that could change its answer. A provider must
therefore be safe to run more than once, and a second run of the same provider allocates nothing.

**VRS-C-1.2.** A strategy that a rebuild names again keeps its identity, so what that strategy holds
stays balanced. A strategy that a rebuild stops naming is deactivated, so the store can evict its
set.

**VRS-C-2.** The selection cannot fail. It chooses among strategies that already exist, so no caller
handles a refusal and no caller repeats a request.

**VRS-C-3.** A strategy need not be backed by a texture. A ready strategy that offers no binding
states that the data is available by another means.

**VRS-C-4.** A render may select no strategy. Nothing is bound, and that is not an error.

**VRS-C-5.** The render reports the quality, composed from the bindings that it used and from how it
used them.

**VRS-C-6.** A strategy instance belongs to one render path. It is therefore the single owner of
anything mutable that it holds.

**VRS-C-7.** The name of a texture set derives from the strategy. Two viewports that choose one
strategy share one set, and they do not allocate two.

**VRS-C-8.** The set is the unit of eviction. A budget never evicts a set that a viewport draws: a
render path claims the set that it draws, and a legacy viewport, which has no point at which it
could release a claim, draws a pinned set that leaves with its volume. A backstop set is evicted
last, so a fill always finds a source.

**VRS-C-9.** The identity of a texture is stable and is not its grid. The grid is state of that
texture, which is what lets a basis point move.

**VRS-C-10.** The record that the selection receives is open. A render component adds the fields
that its own function reads, and no existing caller changes.

**VRS-C-11.** When an application selects no preset, `auto` applies. A named preset overrides
`auto`, and `resetGpuSettingsPreset` returns to `auto`.

**VRS-C-12.** Under `auto`, no texture with an edge above the reliable edge of the device is
allocated before the probe passes at that edge, on the streaming volume path, the streaming and the
non-streaming slice paths. When no probe can run, the edge is a fixed floor (see VRS-I-14). The mapper
of `convertMapperToNotSharedMapper` uploads the full-resolution scalars with no reduction: it runs
the probe and logs a warning for a grid above the limits, and it does not refuse the upload.

**VRS-C-13.** A failed edge and a memory ceiling stay until a retest. One memory failure episode
lowers only the loads of its hour, and the pages that saw it until they reload. The retest is the recovery path, and the application decides when
to offer it. `retestRenderingCapabilities` clears the failures of the selected categories, and
`resetRenderingCapabilities({ clearStorage: true })` removes the whole record.

**VRS-C-14.** Cornerstone3D shows no prompt about the limits. The application reads the record and
decides when to offer a retest.

**VRS-C-15.** A missing or failing storage does not stop a render. The page then probes again at the
next load.

## § Implementation choices

**VRS-I-1.** The default provider builds the full-resolution strategy when final downsampling is off
or the GPU settings admit it, and the reduced-resolution strategy otherwise. It reads the capability alone: a
performance-bound choice belongs to task T14, which supplies its own provider.

**VRS-I-2.** The default selection keeps the strategy of the previous render while that strategy is
ready, and otherwise takes the first ready one.

**VRS-I-3.** One class serves the full-resolution and the reduced-resolution strategies, because
they differ only in the grid that they state.

**VRS-I-4.** The name of a reduced set carries the factors of the box and the statistic.

**VRS-I-5.** The store holds no budget until an application states one, so a viewport behaves as it
behaved before the store existed.

**VRS-I-6.** The area index of a set buckets its members over a coarse grid of the volume. A set of
one member answers directly.

**VRS-I-7.** A slab that re-points counts twice, because it holds a front texture and a back
texture.

**VRS-I-8.** The volume slice render path reads the `base` binding alone.

**VRS-I-9.** The default provider derives no representation. A reduced texture fills by the
statistic of the volume from the frames of the volume, and its record comes from the deliveries of the volume.

**VRS-I-10.** A derivation reduces 16 slices of the derived grid in one batch. The first batch runs
at once, and each later batch runs in an idle callback.

**VRS-I-11.** A legacy viewport pins its set instead of claiming it. A claim needs a release at every
removal of an actor, and a legacy viewport has many such paths.

**VRS-I-12.** The probe uses N × 4 × 4 3D textures. It tests the data types at an edge of 8, and the
edge on each of the three axes, because a driver can store the depth axis as layers. The first edge
is 2048, and the search halves the edge down to 16.

**VRS-I-13.** `auto` takes its memory and its speed from a named preset of the class of the
renderer: `low` for a software rasterizer or no WebGL2, `low-tablet` for a mobile GPU (Mali, Adreno,
PowerVR, Apple GPU, Immortalis, Xclipse, Vivante), and `medium` for any other GPU. A software
rasterizer also keeps the edge of `low` (256) at most, because a larger texture is too slow on it.

**VRS-I-14.** The edge of `auto` is the reliable edge. With none, the edge search runs once in the
page, and with no probe at all the edge is 128 (8 when a failure at or below 128 is stored). A failed
edge at or below the reliable edge replaces the reliable edge by an edge that passed, or removes it.
The memory limit of `auto` is the larger of the start value and `normal`, capped by a `ceiling`,
and by `value / 2^count` of the current episode for 1 hour after its last failure, and for the rest
of a page that saw it. Three episodes within 7 days set the ceiling at 0.75 of the smallest first
failure of them. The constants are `MEMORY_RECENT_MS`,
`MEMORY_FAILURES_FOR_CEILING`, `MEMORY_FAILURE_WINDOW_MS` and `MEMORY_CEILING_FRACTION`.

**VRS-I-15.** The memory values count the GPU bytes of the page from `gpuMemoryLedger`. A
`vtkStreamingOpenGLTexture` adds an entry at each upload and removes it in
`releaseGraphicsResources`, which vtk.js calls when the texture moves to another context. The plain
textures of the reslice mapper and of `convertMapperToNotSharedMapper` add entries too.
`WebGLContextPool` adds the canvas of each viewport (4 bytes for each pixel), the render buffers of
each context (8 bytes for each pixel of its largest viewport), and 32 MB for each context. The
`TiledRenderingEngine` adds no canvas entries. A large allocation is 64 MB or more. A visible page writes its pending record, and a hidden page does not. The first render of a
volume mapper after the allocation settles it 500 ms later; with no render in 30 s, the pending record
is removed and nothing is recorded. A context loss counts while the allocation waits, or within 5 s of
it, but not on a hidden page and not within 1 s of a probe context. A pending record younger than
10 s can belong to a tab that still runs, so the startup scan leaves it. `pagehide` and a hidden page
remove the pending record of the tab. Each change of the record applies to a fresh read of the store,
so two tabs keep both of their changes.

**VRS-I-16.** `auto` limits a new texture to its memory limit minus the GPU bytes of the rest of the
page (at least 16 MB). It does not set the budget of the store, so it does not evict the textures
of another volume. A named preset limits one texture, as before.

**VRS-I-17.** No check after a render detects type 1. The probe runs before every allocation above
the reliable edge, and it fails a uniform gray, so a second check adds nothing. A check after a
render can also give a false failure, because a uniform gray can be a correct image: uniform source
data, a texture that has no data yet, or a window that saturates every value.

**VRS-I-18.** A reduced texture spans the full-resolution extent. The mappers allocate the
dimensions of the reduced grid, and vtk.js maps the texture over the extent of the full-resolution
`imageData`. On an axis of N source voxels and M texels, texel j therefore covers the source
`[j · N / M, (j + 1) · N / M)`, and the box of the fill must be that same range:

- The factor of an axis is `N / M`, and it can hold a fraction. A fill averages the source over the
  range of the texel, and a source voxel that an end of the range cuts counts with the part of it
  that lies inside the range. The foreground majority of a labelmap uses the same weights.
- `deriveBoxAverageGrid` of that factor gives the spacing `s · N / M` and puts the centre of box j at
  the centre of its range, so a CPU grid of the same reduction agrees with the texture.
- `boxAverageReductionFactors` takes the largest M that fits the limits. It takes a whole factor f
  that divides N in place of that M when `N / f` is at least `DIVISOR_PREFERENCE_MIN_RATIO` (0.9) of
  M, because the box is then exact and whole.
- A whole factor that does not divide N gives `ceil(N / f)` texels, which do not span N source
  voxels. A texture of such a grid draws stretched, so no reduced texture uses one.

## What a new render type defines

A new render type supplies two things, and it changes no existing file:

1. **A provider**, which decides which strategies exist and provisions the texture sets that they
   need. This is where a new kind of texture set is introduced.
2. **A selection function**, which decides which of those strategies one render uses. This is where
   a phased render puts its phases.

Everything else — the store, the budget, the eviction, the dirty marking and the refill — is shared
and needs no change.

## What this version does not do

| Item                                                                                                                                                                                                                                                                           | Where it belongs                         |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------- |
| A ladder of grids. The provider builds one reduced grid, which is the largest that the device allows, and it never builds a coarse grid that a finer one later replaces. The resolution of a render therefore does not change while a volume loads, although its values refine | a provider that reads the load progress  |
| A phased render, and a vocabulary of phases                                                                                                                                                                                                                                    | the render component that implements one |
| A consumer of the `refinement` role                                                                                                                                                                                                                                            | the multi-texture render component       |
| A performance-bound choice of strategy                                                                                                                                                                                                                                         | task T14                                 |
| An automatic policy with recorded fixtures                                                                                                                                                                                                                                     | task T15                                 |
| An eviction of the textures of another volume for the memory limit of `auto`                                                                                                                                                                                                   | cornerstone3D#3020, follow-up            |
| A reduction in `convertMapperToNotSharedMapper`, which uploads full resolution                                                                                                                                                                                                 | cornerstone3D#3020, follow-up            |
| The first context loss or stop of the tab at a memory size that the device has not used before (GPULIMIT-DETECT-5)                                                                                                                                                             | cornerstone3D#3020, known gap            |
| A brick loader, and the sets that it would provision                                                                                                                                                                                                                           | task T7                                  |
| The state that a user sees, and the indicator of OHIF                                                                                                                                                                                                                          | tasks T3 and T6                          |
