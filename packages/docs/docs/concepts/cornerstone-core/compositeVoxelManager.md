---
id: compositeVoxelManager
title: Composite Voxel Manager
summary: How to hold more than one representation of one volume at the same time, how to select the representation that a reader can use, and how to fill a grid from the representations that exist
---

# Composite Voxel Manager

A `CompositeVoxelManager` holds **more than one representation of the same data at the same
time**. A reduced-resolution copy, a brick of a server side store and a full-resolution volume
live in one composite, and a reader takes the representation that the reader can use.

A device that cannot hold the full-resolution texture then still shows an image, and a viewport
can report the quality of the data that the viewport drew.

The composite implements `IVoxelManager`, and the composite is **not** a subclass of
`VoxelManager`. Every member of the existing API delegates to the **primary representation**, so a
viewport, a tool, a segmentation and an annotation get the same geometry, the same number of
slices and the same positions that they get today. New code opts in to the new API.

## The model

### A representation is a grid and a statistic

A **grid** carries an origin, a direction, a spacing and a set of dimensions, and it carries
nothing else. The type is `Types.VoxelGrid`.

```ts
const grid = {
  origin: [0, 0, 0],
  direction: [1, 0, 0, 0, 1, 0, 0, 0, 1],
  spacing: [1, 1, 1],
  dimensions: [512, 512, 300],
};
```

One type describes each of these cases, and a grid can be more than one of them at the same time:

| Case                     | What the grid holds                                                                  |
| ------------------------ | ------------------------------------------------------------------------------------ |
| A sub-resolution grid    | the whole volume, at a larger spacing                                                |
| A sub-region grid        | a part of the volume, at the full spacing. A brick is one, and so is an oblique slab |
| A level of a brick store | a grid whose values are on the server                                                |

**There is no level index.** There is no `levelIndex` field, no convention that "level 0 is the
finest", and no array of levels. The spacing already carries on three axes what an ordinal carries
on one.

**Two grids can share a spacing and differ in origin.** A set of the odd slices and a set of the
even slices are two distinct grids. **No code may assume one grid for each spacing.**

**Many grids can exist at one resolution**, each one covering a different part of the volume. A set
of bricks is exactly that. What is single is one representation for one region, at one resolution,
at one statistic.

A representation is identified by the pair **(grid, statistic)**, and not by the grid alone.
`Enums.VoxelStatistics.Average` is the statistic of the core package. The
[statistics](#adding-a-statistic) section below shows how an extension adds another one.

### The composite holds the representations

```ts
import { utilities, Enums } from '@cornerstonejs/core';

const composite = new utilities.CompositeVoxelManager({
  primary: volume.voxelManager,
  grid: {
    origin: volume.origin,
    direction: volume.direction,
    spacing: volume.spacing,
    dimensions: volume.dimensions,
  },
  quality: Enums.ImageQualityStatus.FULL_RESOLUTION,
});
```

The **primary representation** defines the index space of the composite. Every region, and every
index of the existing API, belongs to the grid of the primary representation.

## Reading the data

### The ordinary read does not change

```ts
const value = composite.getAtIJK(i, j, k);
```

`getAtIJK` returns the value of the primary representation. When the primary representation holds
no value for that voxel, which happens while a load is not complete, the read falls back to the
representations that cover that voxel, from the finest to the coarsest.

**`getAtIJK` never returns `undefined` for a voxel that is in bounds** while any representation
covers the region. A region that no representation covers yet is a **hole**, and the lowest
resolution representation is the backstop that fills a hole. The user must not see a blank region.

### Selecting a representation

```ts
const representation = composite.selectRepresentation({
  region: [
    [0, 255],
    [0, 255],
    [10, 20],
  ],
  statistic: Enums.VoxelStatistics.Average,
  ceiling: [4, 4, 4],
});

const value = representation.voxelManager.getAtIJK(0, 0, 0);
```

The rule takes **three** inputs:

| Input       | Meaning                                                                                                |
| ----------- | ------------------------------------------------------------------------------------------------------ |
| `region`    | the region that the caller reads, in the index space of the composite. The default is the whole volume |
| `statistic` | the statistic that the caller needs. The default considers `average` alone                             |
| `ceiling`   | the resolution that the caller will use, as the spacing of one voxel                                   |

The rule selects the representation of the **highest resolution that is not higher than the
ceiling**, among those that match the statistic and cover the region. A tie of the resolution takes
the better quality.

**Why the ceiling matters.** Without it, a request that fills a texture at one eighth selects the
full-resolution data, and it reduces that data at every fill.

**When nothing sits at the ceiling**, the rule returns the best that exists. Every candidate is then
finer than the ceiling, and the rule takes the coarsest of them, which is the cheapest source that
still holds the resolution that the caller asked for.

**A read from a tool passes no ceiling.** The rule then degenerates to "the highest resolution
available", which is the behaviour of today.

**The rule resolves for a region, and not for each voxel.** A test inside the inner loop of a brush
tool is too slow. Select once for the region, then read through the result.

**The rule never creates.** See [Creating a representation](#creating-a-representation).

### Addressing one representation directly

```ts
const representation = composite.getRepresentation(grid, statistic);
```

A read through the result applies **no selection rule**. A render path does this when it draws the
sub-resolution data, and this is the only way to reach a statistic that a default selection does
not consider.

### Reading the representations that cover a region

```ts
const covering = composite.coveringRepresentations(region);
```

The result holds every representation that covers the region, from the finest to the coarsest.
**Several representations can cover one region between them** — that is the brick case — and no one
of them then covers the region on its own, so no one of them is a candidate of the selection. A
read of such a region composes over the **set**, which `fillGrid` does.

## Filling a grid

```ts
const written = composite.fillGrid(textureGrid, textureVoxelManager);
```

**A fill is many to one.** The composite fills the target grid from the best sources that the
composite has, and several representations can fill one target between them. There is no strategy
parameter in this version.

The fill writes no value for a voxel that no representation holds, so the target keeps what the
target already holds for that voxel.

## Creating a representation

**The selection never creates.** Whether a new representation is worth its cost depends on the
configuration and on the data that is available, so a **caller** decides, and a separate member
creates:

```ts
const reduced = composite.createRepresentation({
  factors: [2, 2, 1],
  statistic: Enums.VoxelStatistics.Average,
});
```

| Option                             | Meaning                                                                                    |
| ---------------------------------- | ------------------------------------------------------------------------------------------ |
| `factors`                          | the box size of each axis. A factor of 1 leaves that axis at the resolution of the source  |
| `sourceGrid`                       | the representation that the derivation reads. The best that the composite holds by default |
| `sourceOffset`, `sourceDimensions` | the region of the source, for a derivation of one brick                                    |
| `statistic`                        | the statistic of the result. `average` by default                                          |
| `round`                            | rounds each value. `true` by default, for a store of whole numbers                         |

**The reduction is a box average, and it is never a decimation.** A decimation of 2 takes every
second voxel, which keeps the high spatial frequencies and folds them into the signal as an alias.
A reformat then shows vertical blur with stair steps on an oblique structure, and that result is
not acceptable when a reformat is diagnostic.

**A derivation always goes from a higher resolution to a lower one.** A box size is a whole number
of at least 1, so the result is never finer than its source. Data that no derivation can give
arrives through `acceptData`.

**A derivation reduces the regions that its source has delivered, and no others.** A source that
states a list of deliveries is read over those regions alone, so a derivation over a streaming
volume that has loaded nothing costs nothing, and a derivation over a volume that has loaded half
of its frames reduces that half. A source that states no list holds every voxel, and the derivation
then reads the whole grid.

**The origin carries the sample offset.** A decimation reports the corner voxel of a box, and a box
average reports the centre. The two lie apart by `(factor - 1) / 2` source voxels on each axis, and
`deriveBoxAverageGrid` puts that distance in the origin of the new grid. Every consumer that
transforms through the grid therefore gets the correct position, with no new code.

## Taking new data from a loader

```ts
// One frame of a streaming volume.
composite.acceptData({
  grid: composite.grid,
  frameIndex: 12,
  quality: Enums.ImageQualityStatus.SUBRESOLUTION,
});

// One brick of a brick store, or one tile of a whole slide image.
composite.acceptData({
  grid: brickGrid,
  voxelManager: brickVoxelManager,
  bounds: [
    [0, 63],
    [0, 63],
    [64, 127],
  ],
  quality: Enums.ImageQualityStatus.FULL_RESOLUTION,
});
```

**The unit of a delivery is not always a frame.** A streaming volume delivers one frame, a brick
store delivers a box of voxels, and a whole slide image delivers a tile. `bounds` states the region
that the delivery covered, in the index space of that representation, and `frameIndex` is the
convenience for the case of one frame. A call that states neither states the quality of every voxel
that no delivery covers.

A representation that shares the key (grid, statistic) of a representation that the composite
already holds **replaces** that representation.

**A delivery also updates every derived representation that reads it.** `acceptData` redoes the
boxes that the delivery touches, and it redoes those boxes only: a volume of 2464 frames re-derives
far too slowly to run in full on the arrival of each frame. A caller that delivers data therefore
needs no second call, and a derivation that ran before the data arrived catches up.

P31.3 states the rule for the values. Before the full-resolution data of a box arrives, the box
average is an approximation over the source voxels that have arrived, and the code **replaces**
that value in place when the rest arrives. There are never two stored copies.

### What the record holds

A record answers **what the data is**, and a separate pure function answers **what one reader gets
from it**. The record is a fact about the data, so a caller can cache a record. A verdict belongs to
a pair — the data, and the reader that uses it — so a caller must not cache a verdict.

```ts
const record = composite.getRegionQuality(representation, region);
// { grid, lowest, highest, voxels, missing, deliveries, exact }
```

**The record holds one entry for each delivery, and never one for each voxel.** A volume of
64 x 64 x 500 holds 2,048,000 voxels, and a loader that delivers 500 frames leaves 500 entries of
six numbers each. A delivery that holds an earlier delivery of no better quality replaces it, so a
whole volume that arrives at the full quality takes the record back to one entry.

`exact` states whether `missing` is a count or an estimate. **A record that is not exact never
states less than what is missing**, so a reader that trusts it errs towards "the data is not
complete", and never towards a wrong statement of completeness. Two cases give an estimate: a
derived representation, whose voxel maps to a box of source voxels, and a set of deliveries at
unrelated offsets whose edges are too many to cut exactly.

The record is **absolute**, and it states **no verdict**. It says which data exists and how much is
missing, and a reader compares that against its own requirement. Two viewports over one volume can
therefore reach a different answer from one record.

`getQuality` takes the same three inputs as the selection, so a reader gets the record of the
representation that the reader will really read:

```ts
composite.getQuality({ region, ceiling: [4, 4, 4] });
```

**A frame and a region are the same thing at two scales.** The record of one delivery aggregates
into the record of a region, and `cachedFrames` of `BaseStreamingImageVolume` is the same record at
the granularity of a frame.

### Deliveries that overlap

**Deliveries can overlap, and they often do.** A brick store delivers a box that holds part of a
frame that a progressive loader already delivered.

- **Each voxel carries the best quality that any delivery gave it.** A low quality delivery over a
  voxel that a better delivery already held changes nothing, which is the rule that `cachedFrames`
  applies to a frame.
- **The record counts the union of the deliveries exactly.** An overlap is never counted twice, so
  `missing` stays correct whatever the shape of the deliveries.
- A delivery that an earlier delivery of no worse quality already holds **does not enter the
  record**, and a delivery that holds an earlier delivery of no better quality **replaces** it, so
  an overlap never makes the record grow without a limit.

### A derived representation

A derived representation holds **no record of its own**. One of its voxels is a box of source
voxels, so:

- the quality of that voxel is the quality of the **worst** source voxel of its box;
- the voxel holds **no data at all** while any source voxel of its box has not arrived.

`createRepresentation` therefore takes a copy of the record of its source, and `getRegionQuality`
maps the region back into the source and reads that copy. **The copy states the data that the
derivation really read**, and never more: a box that reads a source voxel that has not arrived
holds nothing, and the copy says so. When a delivery redoes that box, it takes the copy forward at
the same time, so the record and the data always describe the same moment.

### The verdict of one reader

```ts
const record = composite.getQuality({ region, ceiling: [2, 2, 2] });
const verdict = utilities.voxelGrid.compareVoxelQuality(record, {
  displaySpacing: [4, 4, 4],
});
// { lossless: true, causes: [], magnitude: 0.5, record }
```

`compareVoxelQuality` is **pure**. A view is lossless when each of these holds:

| Cause         | The reader sees a loss when                                                     |
| ------------- | ------------------------------------------------------------------------------- |
| `resolution`  | the spacing of the data is coarser than one display pixel of that reader        |
| `aliasing`    | the reduction that produced the data folds the high frequencies into the signal |
| `missingData` | more of the region is missing than the reader accepts                           |
| `quality`     | the comparable summary is below the floor that the reader states                |

`displaySpacing` is the distance in world units that **one display pixel** covers. A reader that
states nothing there asks for the data at its own spacing, and the resolution then makes no view
lossy. `magnitude` says how much coarser the data is than one display pixel, on the axis where the
difference is largest.

**Two viewports over one volume hold one record and a different verdict at one moment, and both
verdicts are correct.** A 3D viewport that draws the whole volume small reports `lossless` from the
reduced data, while an MPR viewport at a high magnification reports `resolution` from the same
volume. MR-U-5 requires the first of those two: a viewport that shows reduced data where the
reduction is not visible must not warn the user.

### How the data reached its spacing, and where it came from

The record carries the two separately, because they answer different questions:

- **`reduction`** — `Enums.VoxelReductions.None`, `.BoxAverage` or `.Decimation`. A box average and
  a decimation at one spacing have a **different loss**: a decimation folds the high spatial
  frequencies into the signal, so no magnification removes that error and a view of it is never
  lossless. A box average is lossless at a display resolution that its spacing can carry.
- **`source`** — `Enums.VoxelDataSources.ServerLevel`, `.ClientDerived`, `.DecoderSubResolution` or
  `.DirectLoad`. The source carries no rule. A reader that reports the fidelity to a user names it.

A loader states both when the data arrives:

```ts
composite.acceptData({
  grid,
  voxelManager,
  reduction: Enums.VoxelReductions.Decimation,
  source: Enums.VoxelDataSources.ServerLevel,
});
```

An extension adds a kind of a reduction in the same way as a statistic, and it states the one
property that a verdict reads:

```ts
registerVoxelReduction({
  name: 'WAVELET',
  reduction: 'myOrg:wavelet',
  aliases: false,
});
```

**A kind that nothing registered counts as a kind that aliases**, so an unknown production of the
data never gives a verdict of "lossless".

### The comparable summary

`record.status` is an `ImageQualityStatus`, and the code **derives** it from the record with
`imageQualityStatusOfRecord`. Every existing `minQuality` floor and every existing guard against a
regression of the quality reads that one number, so those call sites keep working. The record holds
the facts, and the summary holds the number that a floor can compare.

The summary takes the lowest quality of the region, it falls to a replicate while data is missing,
and it never states the full resolution for a reduction that aliases.

## The arithmetic behind the composite

`utilities.voxelGrid` holds the functions, and each one is pure. Nothing there holds voxel data,
and nothing there allocates a texture.

| Function                                                       | What it gives                                                                                           |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `boxAverageReductionFactors(dimensions, limits)`               | the box size of each axis that brings a grid inside a maximum edge, a maximum number of voxels, or both |
| `reducedDimensions(dimensions, factors)`                       | the dimensions of the reduced grid. The count rounds up, so the reduced grid covers the whole region    |
| `deriveBoxAverageGrid(grid, reduction)`                        | the grid of the reduced data, with the sample offset in the origin                                      |
| `reduceByBoxStatistic(source, reduction, target, options)`     | the values of the reduced data. `reduceByBoxAverage` names the average case                             |
| `voxelGridKey(grid, statistic)`                                | the key of one representation, for a cache or for a pool                                                |
| `voxelGridsEqual(gridA, gridB)`                                | whether two grids describe one geometry                                                                 |
| `voxelCountOfGrid`, `maxEdgeOfGrid`, `voxelGridWithinLimits`   | the cost of a grid, before a caller allocates a texture                                                 |
| `gridIndexToWorld`, `gridWorldToIndex`, `mapIndexBetweenGrids` | the position of a voxel, and the index of one grid in another grid                                      |
| `gridCoversRegion(source, bounds, target)`                     | whether the target grid covers a region of the source grid                                              |

**The reduction is per axis, and it is not uniform.** A volume that has an edge of 2049 voxels
exceeds a limit of 2048 on **one** axis and by **one** voxel:

```ts
const factors = utilities.voxelGrid.boxAverageReductionFactors(
  [2049, 512, 512],
  { maxEdge: 2048 }
);
// [2, 1, 1], and the reduced dimensions are [1025, 512, 512]
```

A uniform reduction by a factor of 2 on three axes takes 8 times fewer voxels for an excess of one
voxel, and that result is wrong.

## Adding a statistic

The set of the statistics is **open**, and it is not an enum. An extension adds a statistic with no
change to a file of the core package.

Augment the two interfaces in the `.d.ts` of the extension:

```ts
declare module '@cornerstonejs/core' {
  interface VoxelStatisticRegistry {
    'myOrg:minimum': 'myOrg:minimum';
  }
  interface VoxelStatisticConstants {
    readonly MINIMUM: 'myOrg:minimum';
  }
}
```

Then register the arithmetic:

```ts
import { registerVoxelStatistic, Enums } from '@cornerstonejs/core';

registerVoxelStatistic({
  name: 'MINIMUM',
  statistic: 'myOrg:minimum',
  description: 'The smallest of the source voxels of one box.',
  createAccumulator: () => {
    let minimum;

    return {
      reset: () => {
        minimum = undefined;
      },
      add: (value) => {
        minimum = minimum === undefined ? value : Math.min(minimum, value);
      },
      getValue: () => minimum,
    };
  },
});

composite.createRepresentation({
  factors: [8, 8, 8],
  statistic: Enums.VoxelStatistics.MINIMUM,
});
```

`VoxelStatisticRegistry` feeds the `VoxelStatistic` string union that every call site takes, and
`VoxelStatisticConstants` types the properties of `Enums.VoxelStatistics`. `registerVoxelStatistic`
adds the arithmetic and, when the caller gives a `name`, the constant.

**An accumulator takes one component of one voxel.** A voxel of a volume of one component is a
number, and a voxel of an RGB volume is an array of numbers. The reduction builds one accumulator
for each component, and the components are independent, so a definition states the arithmetic once
and it serves both cases.

**A default selection considers the `average` statistic only.** `defaultSelection` is `false` for
every other statistic, and the field must stay `false` for a minimum and for a maximum: a minimum
grid at a high resolution would otherwise win a selection that asks for the highest resolution, and
a read would then return minimum values in place of the data. That result is a wrong answer, and
not a lossy one, so no quality record reports it. A caller reaches such a statistic by direct
addressing, or by a selection that names the statistic.

## What the composite does not do

| Item                                                         | Where it belongs                     |
| ------------------------------------------------------------ | ------------------------------------ |
| The pool of the textures, and the check before an allocation | `ImageVolume`                        |
| The absolute quality record, and the verdict of one reader   | a later part of this work            |
| The approximation of a box average from a decimation         | the code that fills a representation |
| A loader for a brick store, or for a whole slide image       | a loader, and not this API           |
