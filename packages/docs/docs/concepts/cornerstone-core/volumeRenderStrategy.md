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
  ║            │   · reads the GpuCapabilityProfile    │                            ║
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
| `GpuCapabilityProfile`   | A declared class of device. An application states which profile applies, and nothing probes.                                                           |
| `VoxelQualityRecord`     | The absolute record of the data that a render drew. It states no verdict.                                                                              |

## How the viewport builds the strategies

**The provider runs when the render path adds its actor, and it never runs on the frame path.** It
does the two expensive things: it derives the voxels that a strategy needs, and it allocates the
textures.

The default provider reads the capability profile and answers in one of two ways:

- The device can hold the full-resolution grid, so the provider builds the **full-resolution
  strategy** and provisions the set `full-resolution/full-extent`.
- The device cannot, so the provider computes the **size of the box on each axis** and provisions a
  reduced set whose name carries those factors. It also derives the representation of that grid,
  which holds the box average that the texture reads.

The reduction is per axis and it is not uniform. An edge of 2049 voxels exceeds a limit of 2048 on
one axis and by one voxel, so one axis reduces and the other two do not.

**The textures hold no data at this point, and neither does the derived representation.** Almost
none of the images of the volume have arrived when a viewport adds its actor, so the derivation
reduces almost nothing. The next section states how it catches up.

The loader fills the voxel managers as the data arrives, `ImageVolume` marks every texture whose
grid covers the new region, and each render refills the marked slices. That is the path that the
code already used, and a strategy does not change it.

## How a derived representation follows the load

**A derivation is not a single event.** `createRepresentation` reduces the data that the composite
holds at the moment of the call, and a streaming loader delivers its frames after that moment. A
derivation that ran once would hold the empty result for ever.

`ImageVolume.markFrameDirty` therefore does three things when a frame arrives, and a loader calls
it for every delivery:

1. It tells the voxel manager to forget the image that it last resolved for the frame. A
   progressive loader puts a replicate of a nearby frame in the cache under the image id of this
   frame, and the image of the frame itself arrives later.
2. It hands the delivery to the composite, which records the quality of the frame and redoes the
   boxes of every derived representation that the frame touches. It redoes **those boxes only**: a
   volume of 2464 frames re-derives far too slowly to run in full on each frame.
3. It marks the frame in every texture of every set whose grid covers it.

`createRepresentation` reads the same record. A source that states which regions it has delivered
is reduced over those regions and no others, so a derivation over a volume that has loaded nothing
costs nothing, and a derivation over a volume that has loaded half of its frames reduces that half.

P31.3 states the rule for the values. Before the full-resolution data of a box arrives, the box
average is an approximation over the frames that have arrived, and the code **replaces** that value
in place when the rest arrives. There are never two stored copies.

**The loader keeps the true decoded size.** The request states the type of the buffer and no size,
so an image keeps the size that the decoder produced: a sub-resolution HTJ2K decode and a JLS
thumbnail stay small in the cache. The voxel manager of the volume scales such an image when it
reads it, so the primary grid answers over its whole extent.

## When the strategies are rebuilt

**The provider runs again whenever something changes that could change its answer.** A render path
is long lived, and two things move under it:

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

## Scope, and the rule for a change to this document

The **user requirements** of this work are `MR-U-*` in
[cornerstone3D#2921](https://github.com/cornerstonejs/cornerstone3D/issues/2921) and `VFS-U-*` in
[cornerstone3D#2902](https://github.com/cornerstonejs/cornerstone3D/issues/2902). This document does
not restate them, and it does not change one.

This document holds the design, in two sections with different change rules:

- **§ Contracts** — what a consumer of this design may rely on. Change one of these in two cases
  only: the statement describes the behaviour wrongly, or the intended behaviour itself changes.
  That a contract is inconvenient to implement is never a reason to change it.
- **§ Implementation choices** — how this version does the work. Change any of these freely when a
  better approach appears.

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

**VRS-C-8.** The set is the unit of eviction. A set that a render path holds is never evicted, and a
backstop set is evicted last, so a fill always finds a source.

**VRS-C-9.** The identity of a texture is stable and is not its grid. The grid is state of that
texture, which is what lets a basis point move.

**VRS-C-10.** The record that the selection receives is open. A render component adds the fields
that its own function reads, and no existing caller changes.

## § Implementation choices

**VRS-I-1.** The default provider builds the full-resolution strategy when the capability profile
admits it, and the reduced-resolution strategy otherwise. It reads the capability alone: a
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
| A capability probe, and the override of an overstated memory value                                                                                                                                                                                                             | task T15                                 |
| A brick loader, and the sets that it would provision                                                                                                                                                                                                                           | task T7                                  |
| The state that a user sees, and the indicator of OHIF                                                                                                                                                                                                                          | tasks T3 and T6                          |
