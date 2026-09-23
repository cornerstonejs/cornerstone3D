import { describe, it, expect, beforeEach } from '@jest/globals';
import {
  CompositeVoxelManager,
  VoxelManager,
  voxelGrid,
} from '../../src/utilities';
import {
  VoxelStatistics,
  ImageQualityStatus,
  VoxelReductions,
  VoxelDataSources,
} from '../../src/enums';
import {
  registerVoxelStatistic,
  __resetVoxelStatisticRegistry,
} from '../../src/utilities/voxelGrid/voxelStatistics';

const { deriveBoxAverageGrid, boundsOfFrame } = voxelGrid;

const identityDirection = [1, 0, 0, 0, 1, 0, 0, 0, 1];

function makeGrid(dimensions, spacing = [1, 1, 1], origin = [0, 0, 0]) {
  return { dimensions, spacing, origin, direction: identityDirection };
}

/** Builds a dense voxel manager whose voxels all hold one value. */
function makeFilled(dimensions, value) {
  const length = dimensions[0] * dimensions[1] * dimensions[2];
  const scalarData = new Uint16Array(length).fill(value);

  return VoxelManager.createScalarVolumeVoxelManager({
    dimensions,
    scalarData,
    numberOfComponents: 1,
  });
}

/** Builds a dense voxel manager whose value is the flat index. */
function makeRamp(dimensions) {
  const length = dimensions[0] * dimensions[1] * dimensions[2];
  const scalarData = new Uint16Array(length);

  for (let index = 0; index < length; index++) {
    scalarData[index] = index;
  }

  return VoxelManager.createScalarVolumeVoxelManager({
    dimensions,
    scalarData,
    numberOfComponents: 1,
  });
}

/** Builds a dense voxel manager whose value comes from a function of i, j, k. */
function makeFunction(dimensions, valueOf) {
  const [width, height, depth] = dimensions;
  const scalarData = new Uint16Array(width * height * depth);

  for (let k = 0; k < depth; k++) {
    for (let j = 0; j < height; j++) {
      for (let i = 0; i < width; i++) {
        scalarData[i + j * width + k * width * height] = valueOf(i, j, k);
      }
    }
  }

  return VoxelManager.createScalarVolumeVoxelManager({
    dimensions,
    scalarData,
    numberOfComponents: 1,
  });
}

function makeComposite(dimensions = [8, 8, 4]) {
  const grid = makeGrid(dimensions);

  return new CompositeVoxelManager({
    primary: makeRamp(dimensions),
    grid,
    quality: ImageQualityStatus.FULL_RESOLUTION,
  });
}

describe('CompositeVoxelManager delegates the existing API', () => {
  it('gives the geometry and the values of the primary representation', () => {
    const dimensions = [8, 8, 4];
    const primary = makeRamp(dimensions);
    const composite = new CompositeVoxelManager({
      primary,
      grid: makeGrid(dimensions),
    });

    expect(composite.dimensions).toEqual(dimensions);
    expect(composite.numberOfComponents).toBe(1);
    expect(composite.getScalarDataLength()).toBe(8 * 8 * 4);
    expect(composite.toIndex([2, 1, 1])).toBe(primary.toIndex([2, 1, 1]));
    expect(composite.toIJK(74)).toEqual(primary.toIJK(74));
    expect(composite.getAtIJK(2, 1, 1)).toBe(primary.getAtIJK(2, 1, 1));
    expect(composite.getAtIndex(74)).toBe(primary.getAtIndex(74));
  });

  it('writes through to the primary representation', () => {
    const dimensions = [8, 8, 4];
    const primary = makeRamp(dimensions);
    const composite = new CompositeVoxelManager({
      primary,
      grid: makeGrid(dimensions),
    });

    composite.setAtIJK(2, 1, 1, 4242);

    expect(primary.getAtIJK(2, 1, 1)).toBe(4242);
    expect(composite.getAtIJK(2, 1, 1)).toBe(4242);
    expect(composite.getArrayOfModifiedSlices()).toEqual([1]);
  });
});

describe('CompositeVoxelManager.createRepresentation', () => {
  it('derives a box average, and the derivation goes to a lower resolution', () => {
    const composite = makeComposite([4, 4, 1]);
    const derived = composite.createRepresentation({ factors: [2, 2, 1] });

    expect(derived.grid.dimensions).toEqual([2, 2, 1]);
    expect(derived.grid.spacing).toEqual([2, 2, 1]);
    // The ramp holds 0..15, so each 2 x 2 box gives its mean.
    expect(derived.voxelManager.getAtIJK(0, 0, 0)).toBe(3);
    expect(derived.voxelManager.getAtIJK(1, 1, 0)).toBe(13);
    expect(composite.getRepresentations()).toHaveLength(2);
  });

  it('derives one brick of the source', () => {
    const composite = makeComposite([8, 1, 1]);
    const derived = composite.createRepresentation({
      factors: [2, 1, 1],
      sourceOffset: [4, 0, 0],
      sourceDimensions: [4, 1, 1],
    });

    expect(derived.grid.dimensions).toEqual([2, 1, 1]);
    expect(derived.voxelManager.getAtIJK(0, 0, 0)).toBe(5);
    expect(derived.voxelManager.getAtIJK(1, 0, 0)).toBe(7);
  });
});

describe('CompositeVoxelManager.selectRepresentation', () => {
  let composite;
  let half;

  beforeEach(() => {
    composite = makeComposite([8, 8, 8]);
    half = composite.createRepresentation({ factors: [2, 2, 2] });
    // The quarter resolution derives from the half resolution, and never from
    // a resolution below its own.
    composite.createRepresentation({
      factors: [2, 2, 2],
      sourceGrid: half.grid,
    });
  });

  it('gives the highest resolution when the caller states no ceiling', () => {
    expect(composite.selectRepresentation().grid.spacing).toEqual([1, 1, 1]);
  });

  it('gives the highest resolution that is not higher than the ceiling', () => {
    expect(
      composite.selectRepresentation({ ceiling: [2, 2, 2] }).grid.spacing
    ).toEqual([2, 2, 2]);
    expect(
      composite.selectRepresentation({ ceiling: [3, 3, 3] }).grid.spacing
    ).toEqual([4, 4, 4]);
  });

  it('gives the best that exists when nothing sits at the ceiling', () => {
    // Every representation is finer than a ceiling of 16, so the rule takes the
    // coarsest, which is the cheapest source of that resolution.
    expect(
      composite.selectRepresentation({ ceiling: [16, 16, 16] }).grid.spacing
    ).toEqual([4, 4, 4]);
  });

  it('never creates a representation', () => {
    composite.selectRepresentation({ ceiling: [16, 16, 16] });
    composite.selectRepresentation({ ceiling: [1, 1, 1] });

    expect(composite.getRepresentations()).toHaveLength(3);
  });

  it('takes the better quality when two representations share a resolution', () => {
    const lossy = composite.addRepresentation({
      grid: half.grid,
      statistic: VoxelStatistics.Average,
      voxelManager: makeFilled(half.grid.dimensions, 7),
      quality: ImageQualityStatus.SUBRESOLUTION,
    });

    expect(lossy).toBeDefined();
    // The grid and the statistic are the key, so the lossy entry replaced the
    // entry of the same key, and the composite still holds three entries.
    expect(composite.getRepresentations()).toHaveLength(3);

    const shiftedGrid = {
      ...half.grid,
      origin: [
        half.grid.origin[0] + 0.001,
        half.grid.origin[1],
        half.grid.origin[2],
      ],
    };

    composite.addRepresentation({
      grid: shiftedGrid,
      statistic: VoxelStatistics.Average,
      voxelManager: makeFilled(shiftedGrid.dimensions, 9),
      quality: ImageQualityStatus.FULL_RESOLUTION,
    });

    const selected = composite.selectRepresentation({ ceiling: [2, 2, 2] });

    expect(selected.quality).toBe(ImageQualityStatus.FULL_RESOLUTION);
    expect(selected.voxelManager.getAtIJK(0, 0, 0)).toBe(9);
  });

  it('gives a representation that covers the region, and never one that does not', () => {
    // The primary representation of this composite carries no quality, which is
    // a volume whose load is not complete.
    composite = new CompositeVoxelManager({
      primary: makeRamp([8, 8, 8]),
      grid: makeGrid([8, 8, 8]),
    });

    const brick = composite.addRepresentation({
      grid: deriveBoxAverageGrid(composite.grid, {
        factors: [1, 1, 1],
        sourceOffset: [0, 0, 0],
        sourceDimensions: [4, 8, 8],
      }),
      statistic: VoxelStatistics.Average,
      voxelManager: makeFilled([4, 8, 8], 5),
      quality: ImageQualityStatus.FULL_RESOLUTION,
    });
    const insideTheBrick = [
      [0, 3],
      [0, 7],
      [0, 7],
    ];
    const acrossTheVolume = [
      [0, 7],
      [0, 7],
      [0, 7],
    ];

    // The brick and the primary representation share a resolution, and both
    // cover this region, so the better quality decides.
    expect(
      composite.selectRepresentation({ region: insideTheBrick }).voxelManager
    ).toBe(brick.voxelManager);

    // The brick covers a part of the volume only, so a region that leaves the
    // brick never selects the brick.
    expect(
      composite
        .coveringRepresentations(acrossTheVolume)
        .map((representation) => representation.grid.dimensions)
    ).not.toContainEqual([4, 8, 8]);
    expect(
      composite.selectRepresentation({ region: acrossTheVolume }).grid
        .dimensions
    ).toEqual([8, 8, 8]);
  });
});

describe('CompositeVoxelManager and the statistics', () => {
  const MAXIMUM = 'myOrg:maximum';

  beforeEach(() => {
    __resetVoxelStatisticRegistry();
    registerVoxelStatistic({
      statistic: MAXIMUM,
      createAccumulator: () => {
        let maximum;

        return {
          reset: () => {
            maximum = undefined;
          },
          add: (value) => {
            maximum = maximum === undefined ? value : Math.max(maximum, value);
          },
          getValue: () => maximum,
        };
      },
    });
  });

  it('keeps a statistic that is not for a default selection out of the selection', () => {
    const composite = makeComposite([4, 4, 1]);
    const maximum = composite.createRepresentation({
      factors: [2, 2, 1],
      statistic: MAXIMUM,
    });

    expect(maximum.voxelManager.getAtIJK(0, 0, 0)).toBe(5);
    // A default selection considers the average alone, so the maximum
    // representation never wins, although it is coarse and it covers the
    // volume.
    expect(
      composite.selectRepresentation({ ceiling: [2, 2, 1] }).statistic
    ).toBe(VoxelStatistics.Average);
    // A caller reaches the maximum by direct addressing, or by a selection that
    // names that statistic.
    expect(composite.getRepresentation(maximum.grid, MAXIMUM)).toBe(maximum);
    expect(
      composite.selectRepresentation({ statistic: MAXIMUM }).voxelManager
    ).toBe(maximum.voxelManager);
  });
});

describe('CompositeVoxelManager reads over a hole', () => {
  it('gives the nearest value available, and never undefined in bounds', () => {
    // The primary representation is a sparse store, which is a volume whose
    // load is not complete: it gives undefined for a voxel that has not
    // arrived.
    const dimensions = [8, 8, 1];
    const primary = VoxelManager.createMapVoxelManager({
      dimension: dimensions,
    });
    const composite = new CompositeVoxelManager({
      primary,
      grid: makeGrid(dimensions),
      quality: ImageQualityStatus.FULL_RESOLUTION,
    });

    primary.setAtIJK(0, 0, 0, 100);

    // The backstop covers the whole volume at a low resolution.
    composite.addRepresentation({
      grid: deriveBoxAverageGrid(composite.grid, { factors: [4, 4, 1] }),
      statistic: VoxelStatistics.Average,
      voxelManager: makeFilled([2, 2, 1], 42),
      quality: ImageQualityStatus.SUBRESOLUTION,
    });

    expect(composite.getAtIJK(0, 0, 0)).toBe(100);
    // Every other voxel is a hole in the primary representation, and the
    // backstop answers. MR-U-6: the user must not see a blank region.
    expect(composite.getAtIJK(7, 7, 0)).toBe(42);
    expect(composite.getAtIJK(3, 5, 0)).toBe(42);
  });
});

describe('CompositeVoxelManager records what a loader delivered', () => {
  // The unit of a delivery is not always a frame: a streaming volume delivers
  // one frame, a brick store delivers a box, and a whole slide image delivers a
  // tile. The record carries the region of each delivery.
  const dimensions = [8, 8, 4];
  let composite;
  let representation;

  beforeEach(() => {
    composite = new CompositeVoxelManager({
      primary: VoxelManager.createMapVoxelManager({ dimension: dimensions }),
      grid: makeGrid(dimensions),
    });
    representation = composite.getRepresentations()[0];
  });

  it('records one frame at a time, and aggregates the frames of a region', () => {
    composite.acceptData({
      grid: composite.grid,
      frameIndex: 0,
      quality: ImageQualityStatus.FULL_RESOLUTION,
    });
    composite.acceptData({
      grid: composite.grid,
      frameIndex: 1,
      quality: ImageQualityStatus.SUBRESOLUTION,
    });

    const wholeVolume = composite.getRegionQuality(representation);

    expect(wholeVolume.voxels).toBe(8 * 8 * 4);
    expect(wholeVolume.deliveries).toBe(2);
    expect(wholeVolume.lowest).toBe(ImageQualityStatus.SUBRESOLUTION);
    expect(wholeVolume.highest).toBe(ImageQualityStatus.FULL_RESOLUTION);
    // Two frames of the four have not arrived.
    expect(wholeVolume.missing).toBe(8 * 8 * 2);

    const firstFrame = composite.getRegionQuality(representation, [
      [0, 7],
      [0, 7],
      [0, 0],
    ]);

    expect(firstFrame.lowest).toBe(ImageQualityStatus.FULL_RESOLUTION);
    expect(firstFrame.missing).toBe(0);

    const lastFrame = composite.getRegionQuality(representation, [
      [0, 7],
      [0, 7],
      [3, 3],
    ]);

    expect(lastFrame.lowest).toBeUndefined();
    expect(lastFrame.missing).toBe(8 * 8);
  });

  it('records a brick, which covers a box and not a frame', () => {
    composite.acceptData({
      grid: composite.grid,
      bounds: [
        [0, 3],
        [0, 3],
        [0, 3],
      ],
      quality: ImageQualityStatus.FULL_RESOLUTION,
    });

    const insideTheBrick = composite.getRegionQuality(representation, [
      [0, 1],
      [0, 1],
      [0, 1],
    ]);

    expect(insideTheBrick.missing).toBe(0);
    expect(insideTheBrick.lowest).toBe(ImageQualityStatus.FULL_RESOLUTION);

    const acrossTheBrick = composite.getRegionQuality(representation, [
      [0, 7],
      [0, 3],
      [0, 3],
    ]);

    expect(acrossTheBrick.voxels).toBe(8 * 4 * 4);
    // The brick covers half of that region.
    expect(acrossTheBrick.missing).toBe(4 * 4 * 4);
  });

  it('never takes the record of a delivery backwards', () => {
    const bounds = [
      [0, 7],
      [0, 7],
      [0, 0],
    ];

    composite.acceptData({
      grid: composite.grid,
      bounds,
      quality: ImageQualityStatus.SUBRESOLUTION,
    });
    composite.acceptData({
      grid: composite.grid,
      bounds,
      quality: ImageQualityStatus.FULL_RESOLUTION,
    });
    // A decimated frame that arrives after the full frame must not lower the
    // record, which is the rule of cachedFrames.
    composite.acceptData({
      grid: composite.grid,
      bounds,
      quality: ImageQualityStatus.ADJACENT_REPLICATE,
    });

    expect(representation.delivered).toHaveLength(1);
    expect(representation.delivered[0].quality).toBe(
      ImageQualityStatus.FULL_RESOLUTION
    );
  });

  it('carries the record of the source into a derived representation', () => {
    composite.acceptData({
      grid: composite.grid,
      frameIndex: 0,
      quality: ImageQualityStatus.SUBRESOLUTION,
    });
    composite.acceptData({
      grid: composite.grid,
      frameIndex: 1,
      quality: ImageQualityStatus.FULL_RESOLUTION,
    });

    const derived = composite.createRepresentation({ factors: [2, 2, 2] });

    // The derived representation holds no record of its own. It holds the
    // frozen record of the source, because each of its voxels is a box of
    // source voxels.
    expect(derived.derivedFrom.delivered).toHaveLength(2);
    // The two source frames fed the first frame of the derived grid, and the
    // derived data is no better than the data that produced it.
    expect(composite.getRegionQuality(derived).lowest).toBe(
      ImageQualityStatus.SUBRESOLUTION
    );
    expect(composite.getRegionQuality(derived).missing).toBe(4 * 4 * 1);
  });

  it('gives the record of the representation that a reader will read', () => {
    composite.acceptData({
      grid: composite.grid,
      quality: ImageQualityStatus.FULL_RESOLUTION,
    });
    composite.addRepresentation({
      grid: deriveBoxAverageGrid(composite.grid, { factors: [2, 2, 2] }),
      statistic: VoxelStatistics.Average,
      voxelManager: makeFilled([4, 4, 2], 3),
      quality: ImageQualityStatus.SUBRESOLUTION,
    });

    // A reader at the full resolution, and a reader that draws at one half,
    // hold a different record of one volume at one moment.
    expect(composite.getQuality().lowest).toBe(
      ImageQualityStatus.FULL_RESOLUTION
    );
    expect(composite.getQuality({ ceiling: [2, 2, 2] }).lowest).toBe(
      ImageQualityStatus.SUBRESOLUTION
    );
  });
});

describe('CompositeVoxelManager records deliveries that overlap', () => {
  // A brick store delivers a box that holds part of a frame that a progressive
  // loader already delivered, so the deliveries of one representation overlap.
  // Each voxel carries the best quality that any delivery gave it, and the
  // record counts the union of the deliveries exactly.
  const dimensions = [8, 8, 4];
  let composite;
  let representation;

  function deliver(bounds, quality) {
    composite.acceptData({ grid: composite.grid, bounds, quality });
  }

  beforeEach(() => {
    composite = new CompositeVoxelManager({
      primary: VoxelManager.createMapVoxelManager({ dimension: dimensions }),
      grid: makeGrid(dimensions),
    });
    representation = composite.getRepresentations()[0];
  });

  it('counts the union of two overlapping bricks, and not the sum', () => {
    // Each brick holds 4 x 8 x 4 = 128 voxels, and the two share 2 x 8 x 4 = 64
    // voxels, so the union holds 192 voxels of the 256 of the volume.
    deliver(
      [
        [0, 3],
        [0, 7],
        [0, 3],
      ],
      ImageQualityStatus.FULL_RESOLUTION
    );
    deliver(
      [
        [2, 5],
        [0, 7],
        [0, 3],
      ],
      ImageQualityStatus.FULL_RESOLUTION
    );

    const record = composite.getRegionQuality(representation);

    expect(record.voxels).toBe(256);
    expect(record.deliveries).toBe(2);
    expect(record.missing).toBe(256 - 192);
  });

  it('gives each voxel of an overlap the better quality of the two deliveries', () => {
    // A frame arrives at a low quality, and a brick then arrives over a part of
    // that frame at the full quality.
    deliver(
      [
        [0, 7],
        [0, 7],
        [0, 0],
      ],
      ImageQualityStatus.SUBRESOLUTION
    );
    deliver(
      [
        [0, 3],
        [0, 3],
        [0, 0],
      ],
      ImageQualityStatus.FULL_RESOLUTION
    );

    const insideTheBrick = composite.getRegionQuality(representation, [
      [0, 3],
      [0, 3],
      [0, 0],
    ]);

    expect(insideTheBrick.lowest).toBe(ImageQualityStatus.FULL_RESOLUTION);
    expect(insideTheBrick.missing).toBe(0);

    const wholeFrame = composite.getRegionQuality(representation, [
      [0, 7],
      [0, 7],
      [0, 0],
    ]);

    // The part of the frame that the brick does not hold keeps the lower
    // quality, so the lowest of the frame stays SUBRESOLUTION.
    expect(wholeFrame.lowest).toBe(ImageQualityStatus.SUBRESOLUTION);
    expect(wholeFrame.highest).toBe(ImageQualityStatus.FULL_RESOLUTION);
    expect(wholeFrame.missing).toBe(0);
  });

  it('never lowers the quality of a voxel that a better delivery already held', () => {
    deliver(
      [
        [0, 7],
        [0, 7],
        [0, 0],
      ],
      ImageQualityStatus.FULL_RESOLUTION
    );
    // A decimated brick arrives late, over a part of that frame.
    deliver(
      [
        [0, 3],
        [0, 3],
        [0, 0],
      ],
      ImageQualityStatus.ADJACENT_REPLICATE
    );

    const record = composite.getRegionQuality(representation, [
      [0, 3],
      [0, 3],
      [0, 0],
    ]);

    expect(record.lowest).toBe(ImageQualityStatus.FULL_RESOLUTION);
    // The late delivery holds no voxel that the earlier delivery did not hold
    // at a better quality, so the record does not grow.
    expect(representation.delivered).toHaveLength(1);
  });

  it('replaces an earlier delivery that a new delivery holds completely', () => {
    deliver(
      [
        [0, 3],
        [0, 3],
        [0, 0],
      ],
      ImageQualityStatus.SUBRESOLUTION
    );
    deliver(
      [
        [0, 7],
        [0, 7],
        [0, 0],
      ],
      ImageQualityStatus.FULL_RESOLUTION
    );

    expect(representation.delivered).toHaveLength(1);
    expect(
      composite.getRegionQuality(representation, [
        [0, 3],
        [0, 3],
        [0, 0],
      ]).lowest
    ).toBe(ImageQualityStatus.FULL_RESOLUTION);
  });

  it('counts the union of three overlapping frames and bricks', () => {
    // Two frames, and a brick that crosses the two frames and a third frame.
    deliver(boundsOfFrame(composite.grid, 0), ImageQualityStatus.SUBRESOLUTION);
    deliver(boundsOfFrame(composite.grid, 1), ImageQualityStatus.SUBRESOLUTION);
    deliver(
      [
        [0, 1],
        [0, 1],
        [0, 2],
      ],
      ImageQualityStatus.FULL_RESOLUTION
    );

    const record = composite.getRegionQuality(representation);

    // The two frames hold 128 voxels, and the brick adds the 4 voxels of its
    // third slice, which no frame held.
    expect(record.missing).toBe(256 - 132);
    expect(record.lowest).toBe(ImageQualityStatus.SUBRESOLUTION);
    expect(record.highest).toBe(ImageQualityStatus.FULL_RESOLUTION);

    // The third frame holds the four voxels of the brick alone.
    const thirdFrame = composite.getRegionQuality(
      representation,
      boundsOfFrame(composite.grid, 2)
    );

    expect(thirdFrame.voxels).toBe(64);
    expect(thirdFrame.missing).toBe(60);
    expect(thirdFrame.lowest).toBe(ImageQualityStatus.FULL_RESOLUTION);
  });

  it('carries overlapping deliveries into a derived representation', () => {
    deliver(boundsOfFrame(composite.grid, 0), ImageQualityStatus.SUBRESOLUTION);
    deliver(
      [
        [0, 3],
        [0, 3],
        [0, 1],
      ],
      ImageQualityStatus.FULL_RESOLUTION
    );

    const derived = composite.createRepresentation({ factors: [2, 2, 2] });
    const record = composite.getRegionQuality(derived);

    // The derived grid holds 4 x 4 x 2 voxels, and the two deliveries map onto
    // it. The record of the source becomes the record of the result.
    expect(record.voxels).toBe(32);
    expect(record.highest).toBe(ImageQualityStatus.FULL_RESOLUTION);
    expect(record.lowest).toBe(ImageQualityStatus.SUBRESOLUTION);
    expect(record.missing).toBeLessThan(32);
  });
});

describe('CompositeVoxelManager stores the quality by region', () => {
  it('holds one entry for each delivery, and never one for each voxel', () => {
    // A volume of 64 x 64 x 500 holds 2,048,000 voxels, and a loader delivers
    // 500 frames. The record holds 500 entries.
    const dimensions = [64, 64, 500];
    const composite = new CompositeVoxelManager({
      primary: VoxelManager.createMapVoxelManager({ dimension: dimensions }),
      grid: makeGrid(dimensions),
    });
    const representation = composite.getRepresentations()[0];

    for (let frameIndex = 0; frameIndex < 500; frameIndex++) {
      composite.acceptData({
        grid: composite.grid,
        frameIndex,
        quality: ImageQualityStatus.FULL_RESOLUTION,
      });
    }

    expect(representation.delivered).toHaveLength(500);

    const record = composite.getRegionQuality(representation);

    expect(record.voxels).toBe(64 * 64 * 500);
    expect(record.missing).toBe(0);
    expect(record.exact).toBe(true);
  });

  it('holds one entry for a delivery that covers everything', () => {
    const dimensions = [8, 8, 4];
    const composite = new CompositeVoxelManager({
      primary: VoxelManager.createMapVoxelManager({ dimension: dimensions }),
      grid: makeGrid(dimensions),
    });
    const representation = composite.getRepresentations()[0];

    for (let frameIndex = 0; frameIndex < 4; frameIndex++) {
      composite.acceptData({
        grid: composite.grid,
        frameIndex,
        quality: ImageQualityStatus.SUBRESOLUTION,
      });
    }

    expect(representation.delivered).toHaveLength(4);

    // The whole volume then arrives at the full quality, and that one delivery
    // replaces the four frames.
    composite.acceptData({
      grid: composite.grid,
      bounds: [
        [0, 7],
        [0, 7],
        [0, 3],
      ],
      quality: ImageQualityStatus.FULL_RESOLUTION,
    });

    expect(representation.delivered).toHaveLength(1);
    expect(composite.getRegionQuality(representation).lowest).toBe(
      ImageQualityStatus.FULL_RESOLUTION
    );
  });

  it('states that a record is not exact, and never states less than what is missing', () => {
    const dimensions = [8, 8, 4];
    const composite = new CompositeVoxelManager({
      primary: VoxelManager.createMapVoxelManager({ dimension: dimensions }),
      grid: makeGrid(dimensions),
    });

    composite.acceptData({
      grid: composite.grid,
      frameIndex: 0,
      quality: ImageQualityStatus.FULL_RESOLUTION,
    });

    const derived = composite.createRepresentation({ factors: [2, 2, 2] });
    const record = composite.getRegionQuality(derived);

    // One frame of the four arrived, so the derived record is an estimate.
    expect(record.exact).toBe(false);
    expect(record.missing).toBeGreaterThan(0);

    composite.acceptData({
      grid: composite.grid,
      bounds: [
        [0, 7],
        [0, 7],
        [0, 3],
      ],
      quality: ImageQualityStatus.FULL_RESOLUTION,
    });

    const complete = composite.getRegionQuality(
      composite.createRepresentation({ factors: [2, 2, 2] })
    );

    // A source that holds everything gives an exact record.
    expect(complete.exact).toBe(true);
    expect(complete.missing).toBe(0);
  });
});

describe('CompositeVoxelManager reads across a reduction of 2, 3 and 4', () => {
  // THE FACTORS DIFFER ON EACH AXIS, and none of them is the same as another.
  // An axis that the code takes for another axis, and a sample offset that the
  // code applies to the wrong axis, both give a wrong value here and nowhere in
  // a test whose factors are equal.
  //
  // The volume is 8 x 10 x 8, so the j axis does NOT divide by 3: the last box
  // of that axis holds one row of the three, which is the partial box.
  const dimensions = [8, 10, 8];
  const factors = [2, 3, 4];
  const valueOf = (i, j, k) => i + j * 10 + k * 100;

  /** The box of the source that one voxel of the reduced grid holds. */
  function sourceBoxOf(si, sj, sk) {
    return {
      i: [si * 2, Math.min(si * 2 + 1, dimensions[0] - 1)],
      j: [sj * 3, Math.min(sj * 3 + 2, dimensions[1] - 1)],
      k: [sk * 4, Math.min(sk * 4 + 3, dimensions[2] - 1)],
    };
  }

  /** The box average that the reduction must produce. */
  function expectedAverage(si, sj, sk) {
    const box = sourceBoxOf(si, sj, sk);
    let sum = 0;
    let count = 0;

    for (let k = box.k[0]; k <= box.k[1]; k++) {
      for (let j = box.j[0]; j <= box.j[1]; j++) {
        for (let i = box.i[0]; i <= box.i[1]; i++) {
          sum += valueOf(i, j, k);
          count++;
        }
      }
    }

    return Math.round(sum / count);
  }

  it('derives the reduced grid, and each voxel holds the average of its own box', () => {
    // The full resolution data arrives, and a reader takes the reduced data.
    const composite = new CompositeVoxelManager({
      primary: makeFunction(dimensions, valueOf),
      grid: makeGrid(dimensions),
      quality: ImageQualityStatus.FULL_RESOLUTION,
    });
    const reduced = composite.createRepresentation({ factors });

    // 8 / 2 = 4, 10 / 3 rounds up to 4, and 8 / 4 = 2.
    expect(reduced.grid.dimensions).toEqual([4, 4, 2]);
    expect(reduced.grid.spacing).toEqual([2, 3, 4]);
    // The origin carries (factor - 1) / 2 source voxels on each axis.
    expect(reduced.grid.origin[0]).toBeCloseTo(0.5, 10);
    expect(reduced.grid.origin[1]).toBeCloseTo(1, 10);
    expect(reduced.grid.origin[2]).toBeCloseTo(1.5, 10);

    for (let sk = 0; sk < 2; sk++) {
      for (let sj = 0; sj < 4; sj++) {
        for (let si = 0; si < 4; si++) {
          expect(reduced.voxelManager.getAtIJK(si, sj, sk)).toBe(
            expectedAverage(si, sj, sk)
          );
        }
      }
    }
  });

  it('reads the full resolution index from the reduced data that holds it', () => {
    // Only the reduced data arrived, and a tool reads at the full resolution.
    const composite = new CompositeVoxelManager({
      primary: VoxelManager.createMapVoxelManager({ dimension: dimensions }),
      grid: makeGrid(dimensions),
    });
    const grid = deriveBoxAverageGrid(composite.grid, { factors });
    // Each voxel of the reduced grid holds the index that identifies it.
    const reduced = makeFunction(
      grid.dimensions,
      (si, sj, sk) => 1000 + si + sj * 10 + sk * 100
    );

    composite.acceptData({
      grid,
      voxelManager: reduced,
      quality: ImageQualityStatus.SUBRESOLUTION,
    });

    for (let k = 0; k < dimensions[2]; k++) {
      for (let j = 0; j < dimensions[1]; j++) {
        for (let i = 0; i < dimensions[0]; i++) {
          const si = Math.min(Math.floor(i / 2), grid.dimensions[0] - 1);
          const sj = Math.min(Math.floor(j / 3), grid.dimensions[1] - 1);
          const sk = Math.min(Math.floor(k / 4), grid.dimensions[2] - 1);

          expect(composite.getAtIJK(i, j, k)).toBe(
            1000 + si + sj * 10 + sk * 100
          );
        }
      }
    }
  });

  it('gives the same values in both directions for one region', () => {
    // The reduced data derives from the full resolution data, and a read at the
    // full resolution then gives the average of the box that holds the index.
    const composite = new CompositeVoxelManager({
      primary: makeFunction(dimensions, valueOf),
      grid: makeGrid(dimensions),
      quality: ImageQualityStatus.FULL_RESOLUTION,
    });
    const reduced = composite.createRepresentation({ factors });

    // A reader that draws at the reduced resolution states that ceiling, and it
    // gets the reduced representation.
    const selected = composite.selectRepresentation({ ceiling: [2, 3, 4] });

    expect(selected.voxelManager).toBe(reduced.voxelManager);

    // The full resolution index [5, 7, 6] lies in the box [2, 2, 1] of the
    // reduced grid, on each of the three axes independently.
    expect(selected.voxelManager.getAtIJK(2, 2, 1)).toBe(
      expectedAverage(2, 2, 1)
    );
    expect(composite.getAtIJK(5, 7, 6)).toBe(valueOf(5, 7, 6));
  });

  it('maps a delivery of one reduced frame onto the full resolution region', () => {
    const composite = new CompositeVoxelManager({
      primary: VoxelManager.createMapVoxelManager({ dimension: dimensions }),
      grid: makeGrid(dimensions),
    });
    const grid = deriveBoxAverageGrid(composite.grid, { factors });
    const representation = composite.acceptData({
      grid,
      voxelManager: makeFilled(grid.dimensions, 5),
      frameIndex: 0,
      quality: ImageQualityStatus.SUBRESOLUTION,
    });

    // One frame of the reduced grid covers four slices of the full resolution
    // grid, because the factor of the k axis is 4.
    const firstFourSlices = composite.getRegionQuality(representation, [
      [0, 7],
      [0, 9],
      [0, 3],
    ]);

    expect(firstFourSlices.missing).toBe(0);
    expect(firstFourSlices.lowest).toBe(ImageQualityStatus.SUBRESOLUTION);

    const lastFourSlices = composite.getRegionQuality(representation, [
      [0, 7],
      [0, 9],
      [4, 7],
    ]);

    expect(lastFourSlices.missing).toBe(lastFourSlices.voxels);
    expect(lastFourSlices.lowest).toBeUndefined();
  });
});

describe('CompositeVoxelManager gives a record that two readers judge', () => {
  const { compareVoxelQuality } = voxelGrid;
  const dimensions = [8, 8, 8];

  it('gives one record to two viewports, which report differently', () => {
    // Acceptance criterion 7 of issue #2921. The full resolution data arrived,
    // and a reduction of it exists beside it.
    const composite = new CompositeVoxelManager({
      primary: makeFunction(dimensions, (i, j, k) => i + j + k),
      grid: makeGrid(dimensions),
      quality: ImageQualityStatus.FULL_RESOLUTION,
    });

    composite.createRepresentation({ factors: [2, 2, 2] });

    // The 3D viewport draws the whole volume small, so it takes the reduced
    // data, and one of its display pixels covers 4 mm.
    const volumeRecord = composite.getQuality({ ceiling: [2, 2, 2] });
    const volumeVerdict = compareVoxelQuality(volumeRecord, {
      displaySpacing: [4, 4, 4],
    });

    // The MPR viewport draws one plane at a high magnification, so it takes the
    // full resolution data, and one of its display pixels covers 0.5 mm.
    const planeRecord = composite.getQuality({ ceiling: [0.5, 0.5, 0.5] });
    const planeVerdict = compareVoxelQuality(planeRecord, {
      displaySpacing: [0.5, 0.5, 0.5],
    });

    expect(volumeRecord.grid.spacing).toEqual([2, 2, 2]);
    expect(volumeRecord.reduction).toBe(VoxelReductions.BoxAverage);
    expect(volumeRecord.source).toBe(VoxelDataSources.ClientDerived);
    expect(volumeVerdict.lossless).toBe(true);

    expect(planeRecord.grid.spacing).toEqual([1, 1, 1]);
    expect(planeRecord.reduction).toBe(VoxelReductions.None);
    expect(planeVerdict.lossless).toBe(false);
    expect(planeVerdict.causes).toEqual(['resolution']);
    expect(planeVerdict.magnitude).toBeCloseTo(2, 10);
  });

  it('states the kind of the reduction and the source that a loader gave', () => {
    const composite = new CompositeVoxelManager({
      primary: VoxelManager.createMapVoxelManager({ dimension: dimensions }),
      grid: makeGrid(dimensions),
    });
    const grid = deriveBoxAverageGrid(composite.grid, { factors: [2, 2, 2] });

    // A level of a server brick store arrives, and that server decimated it.
    composite.acceptData({
      grid,
      voxelManager: makeFilled(grid.dimensions, 3),
      reduction: VoxelReductions.Decimation,
      source: VoxelDataSources.ServerLevel,
      quality: ImageQualityStatus.FULL_RESOLUTION,
    });

    const record = composite.getQuality({ ceiling: [2, 2, 2] });

    expect(record.reduction).toBe(VoxelReductions.Decimation);
    expect(record.source).toBe(VoxelDataSources.ServerLevel);
    // A decimation aliases, so no magnification gives a lossless view, and the
    // comparable summary never states the full resolution.
    expect(record.status).toBe(ImageQualityStatus.SUBRESOLUTION);
    expect(
      compareVoxelQuality(record, { displaySpacing: [100, 100, 100] }).causes
    ).toEqual(['aliasing']);
  });

  it('takes the summary of the record down while data is missing', () => {
    const composite = new CompositeVoxelManager({
      primary: VoxelManager.createMapVoxelManager({ dimension: dimensions }),
      grid: makeGrid(dimensions),
    });

    composite.acceptData({
      grid: composite.grid,
      frameIndex: 0,
      quality: ImageQualityStatus.FULL_RESOLUTION,
    });

    const record = composite.getQuality();

    expect(record.missing).toBe(8 * 8 * 7);
    expect(record.status).toBe(ImageQualityStatus.ADJACENT_REPLICATE);
    expect(compareVoxelQuality(record).causes).toEqual(['missingData']);

    // The region of the frame that arrived is complete, and its record says so.
    const firstFrame = composite.getQuality({
      region: [
        [0, 7],
        [0, 7],
        [0, 0],
      ],
    });

    expect(firstFrame.missing).toBe(0);
    expect(firstFrame.status).toBe(ImageQualityStatus.FULL_RESOLUTION);
    expect(compareVoxelQuality(firstFrame).lossless).toBe(true);
  });
});

describe('CompositeVoxelManager over a WSI-shaped pyramid', () => {
  // Acceptance criterion 9 of issue #2921. The tiles have PER-LEVEL DIFFERING
  // EXTENTS and NON-UNIFORM TILING, and the levels are NOT a clean pyramid of
  // powers of two: the coarse level reduces by 3 on i and by 2 on j.
  const dimensions = [100, 60, 1];
  let composite;
  let tiles;
  let coarse;

  beforeEach(() => {
    composite = new CompositeVoxelManager({
      primary: VoxelManager.createMapVoxelManager({ dimension: dimensions }),
      grid: makeGrid(dimensions),
    });

    // Three tiles of different widths, which cover the volume between them.
    const extents = [
      { offset: 0, width: 40, value: 11 },
      { offset: 40, width: 35, value: 22 },
      { offset: 75, width: 25, value: 33 },
    ];

    tiles = extents.map(({ offset, width, value }) => {
      const grid = deriveBoxAverageGrid(composite.grid, {
        factors: [1, 1, 1],
        sourceOffset: [offset, 0, 0],
        sourceDimensions: [width, 60, 1],
      });

      return composite.addRepresentation({
        grid,
        statistic: VoxelStatistics.Average,
        voxelManager: makeFilled([width, 60, 1], value),
        quality: ImageQualityStatus.FULL_RESOLUTION,
      });
    });

    coarse = composite.addRepresentation({
      grid: deriveBoxAverageGrid(composite.grid, { factors: [3, 2, 1] }),
      statistic: VoxelStatistics.Average,
      voxelManager: makeFilled([34, 30, 1], 7),
      quality: ImageQualityStatus.SUBRESOLUTION,
    });
  });

  it('holds tiles of differing extents at one resolution', () => {
    expect(tiles.map((tile) => tile.grid.dimensions)).toEqual([
      [40, 60, 1],
      [35, 60, 1],
      [25, 60, 1],
    ]);
    expect(coarse.grid.dimensions).toEqual([34, 30, 1]);
    expect(coarse.grid.spacing).toEqual([3, 2, 1]);
  });

  it('reads each voxel from the tile that holds it', () => {
    expect(composite.getAtIJK(0, 0, 0)).toBe(11);
    expect(composite.getAtIJK(39, 59, 0)).toBe(11);
    expect(composite.getAtIJK(40, 0, 0)).toBe(22);
    expect(composite.getAtIJK(74, 30, 0)).toBe(22);
    expect(composite.getAtIJK(75, 0, 0)).toBe(33);
    expect(composite.getAtIJK(99, 59, 0)).toBe(33);
  });

  it('selects one tile for a region inside that tile', () => {
    const insideTheSecondTile = [
      [45, 60],
      [0, 59],
      [0, 0],
    ];

    expect(
      composite
        .selectRepresentation({ region: insideTheSecondTile })
        .voxelManager.getAtIJK(0, 0, 0)
    ).toBe(22);
  });

  it('leaves out every tile for a region that no single tile covers', () => {
    // The tiles cover this region BETWEEN THEM, and no one tile covers it, so
    // no tile is a candidate. A read of such a region composes over the SET of
    // the tiles, which `fillGrid` does.
    const acrossTwoTiles = [
      [30, 50],
      [0, 59],
      [0, 0],
    ];
    const covering = composite
      .coveringRepresentations(acrossTwoTiles)
      .map((representation) => representation.grid.dimensions);

    expect(covering).not.toContainEqual([40, 60, 1]);
    expect(covering).not.toContainEqual([35, 60, 1]);
    expect(covering).toContainEqual(coarse.grid.dimensions);
    // The primary representation covers the whole volume, and it resolves the
    // tiles, in the same way as the voxel manager of an image volume resolves
    // the slices of the image cache.
    expect(covering).toContainEqual(dimensions);
  });

  it('fills a grid from several tiles at the same time', () => {
    // A FILL IS MANY TO ONE. The target covers the whole volume at one fifth on
    // i, and the three tiles fill it between them.
    const target = deriveBoxAverageGrid(composite.grid, { factors: [5, 5, 1] });
    const filled = makeFilled(target.dimensions, 0);

    const written = composite.fillGrid(target, filled);

    expect(target.dimensions).toEqual([20, 12, 1]);
    expect(written).toBe(20 * 12);
    expect(filled.getAtIJK(0, 0, 0)).toBe(11);
    expect(filled.getAtIJK(10, 5, 0)).toBe(22);
    expect(filled.getAtIJK(19, 11, 0)).toBe(33);
  });
});

describe('a derivation follows the load', () => {
  const dimensions = [4, 4, 4];
  const factors = [2, 2, 2];

  const frameSize = dimensions[0] * dimensions[1];

  /**
   * A composite whose primary representation streams.
   *
   * The primary gives NOTHING for a frame that has not arrived, which is what
   * the voxel manager of an image volume does: it reads the image of the cache
   * for the slice, and no image is there yet. The composite states an empty
   * list of deliveries to say the same thing about the whole grid.
   */
  function makeStreaming() {
    const frames = new Map();
    const primary = new VoxelManager(dimensions, {
      _get: (index) => frames.get(Math.floor(index / frameSize)),
      numberOfComponents: 1,
      _getConstructor: () => Uint16Array,
    });

    const composite = new CompositeVoxelManager({
      primary,
      grid: makeGrid(dimensions),
      delivered: [],
    });

    // Gives one k slice its value, and then delivers that slice.
    composite.deliver = (frameIndex, value) => {
      frames.set(frameIndex, value);
      composite.acceptData({
        grid: composite.grid,
        frameIndex,
        quality: ImageQualityStatus.FULL_RESOLUTION,
      });
    };

    return composite;
  }

  it('reduces no box when the source has delivered nothing', () => {
    const composite = makeStreaming();
    const derived = composite.createRepresentation({ factors });

    // The primary holds zeros everywhere, so this states nothing about the
    // values. What it states is that the derivation reduced NO region: the
    // record of the source is the empty list that the primary carries.
    expect(derived.grid.dimensions).toEqual([2, 2, 2]);
    expect(derived.derivedFrom.delivered).toEqual([]);
  });

  it('redoes the box of a frame that arrives after the derivation', () => {
    const composite = makeStreaming();
    const derived = composite.createRepresentation({ factors });

    composite.deliver(0, 10);
    composite.deliver(1, 20);

    // The box on k holds the frames 0 and 1, and both arrived, so the average
    // of the box is 15. The box of the frames 2 and 3 holds nothing yet.
    expect(derived.voxelManager.getAtIJK(0, 0, 0)).toBe(15);
    expect(derived.voxelManager.getAtIJK(0, 0, 1)).toBe(0);
  });

  it('replaces the value of a box in place as more of it arrives', () => {
    const composite = makeStreaming();
    const derived = composite.createRepresentation({ factors });

    composite.deliver(2, 40);

    // The box holds the frames 2 and 3, and the frame 3 has not arrived, so
    // the average reads the one frame that has.
    expect(derived.voxelManager.getAtIJK(0, 0, 1)).toBe(40);

    composite.deliver(3, 60);

    // P31.3: the code REPLACES the value in place, and it never keeps two
    // copies of the data of one box.
    expect(derived.voxelManager.getAtIJK(0, 0, 1)).toBe(50);
  });

  it('takes the deliveries that arrived before the derivation', () => {
    const composite = makeStreaming();

    composite.deliver(0, 10);
    composite.deliver(1, 20);

    const derived = composite.createRepresentation({ factors });

    expect(derived.voxelManager.getAtIJK(0, 0, 0)).toBe(15);
    expect(derived.derivedFrom.delivered.length).toBe(2);
  });

  it('reduces the whole grid when the source states no delivery', () => {
    // A volume that holds every voxel from its construction states no list,
    // and the derivation then reads the whole grid.
    const composite = new CompositeVoxelManager({
      primary: makeFilled(dimensions, 7),
      grid: makeGrid(dimensions),
    });
    const derived = composite.createRepresentation({ factors });

    expect(derived.voxelManager.getAtIJK(0, 0, 0)).toBe(7);
    expect(derived.voxelManager.getAtIJK(1, 1, 1)).toBe(7);
  });

  it('leaves a derivation of another source alone', () => {
    const composite = makeStreaming();
    const derived = composite.createRepresentation({ factors });
    const other = makeGrid([2, 2, 2], [2, 2, 2]);

    // A delivery into a grid that this derivation does not read changes no box
    // of it.
    composite.acceptData({
      grid: other,
      voxelManager: makeFilled([2, 2, 2], 99),
      frameIndex: 0,
    });

    expect(derived.voxelManager.getAtIJK(0, 0, 0)).toBe(0);
  });
});
