import { describe, it, expect } from '@jest/globals';
import ImageVolume from '../src/cache/classes/ImageVolume';
import { VoxelManager } from '../src/utilities';
import { VoxelStatistics, VoxelReductions } from '../src/enums';

// The composite on `ImageVolume`, which is MR-API-IV-1 and MR-API-IV-4 of
// cornerstone3D issue #2921. The existing public surface does not change, and a
// new API gives the alternate representations to a caller.

const identityDirection = [1, 0, 0, 0, 1, 0, 0, 0, 1];
const dimensions = [4, 4, 4];
const spacing = [1, 1, 2];
const origin = [10, 20, 30];

/** A dense voxel manager whose value is the flat index of the voxel. */
function makeRamp([width, height, depth]) {
  const scalarData = new Uint16Array(width * height * depth);

  for (let index = 0; index < scalarData.length; index++) {
    scalarData[index] = index;
  }

  return VoxelManager.createScalarVolumeVoxelManager({
    dimensions: [width, height, depth],
    scalarData,
    numberOfComponents: 1,
  });
}

function makeVolume({ volumeId = 'volume-1' } = {}) {
  const imageIds = Array.from(
    { length: dimensions[2] },
    (_, k) => `image:${volumeId}:${k}`
  );

  return new ImageVolume({
    volumeId,
    metadata: { FrameOfReferenceUID: 'for-1' },
    dimensions,
    spacing,
    origin,
    direction: identityDirection,
    imageIds,
    dataType: 'Uint16Array',
    numberOfComponents: 1,
    voxelManager: makeRamp(dimensions),
  });
}

describe('ImageVolume — the grid descriptor', () => {
  it('reports the origin, the direction, the spacing and the dimensions of the volume', () => {
    const volume = makeVolume();

    expect(volume.voxelGrid).toEqual({
      origin,
      direction: identityDirection,
      spacing,
      dimensions,
    });
  });

  it('copies every array, so a consumer that stores the grid sees no later change', () => {
    const volume = makeVolume();
    const grid = volume.voxelGrid;

    expect(grid.origin).not.toBe(volume.origin);
    expect(grid.dimensions).not.toBe(volume.dimensions);
    expect(grid.spacing).not.toBe(volume.spacing);
    expect(grid.direction).not.toBe(volume.direction);

    // `volume.origin` is the array that the props gave, so the change below
    // reaches the volume. The grid holds a copy, and the copy does not change.
    const before = grid.origin[0];

    volume.origin[0] = 999;

    expect(grid.origin[0]).toBe(before);
    expect(volume.voxelGrid.origin[0]).toBe(999);

    volume.origin[0] = before;
  });
});

describe('ImageVolume — the existing public surface does not change', () => {
  it('keeps the dimensions, the spacing, the origin, the direction and the image ids', () => {
    const volume = makeVolume();

    expect(volume.dimensions).toEqual(dimensions);
    expect(volume.spacing).toEqual(spacing);
    expect(volume.origin).toEqual(origin);
    expect(volume.direction).toEqual(identityDirection);
    expect(volume.imageIds.length).toBe(dimensions[2]);
    expect(volume.getImageIdIndex(volume.imageIds[2])).toBe(2);
  });

  it('keeps `voxelManager` as the primary voxel manager, and a read goes to that grid alone', () => {
    const volume = makeVolume();

    // The composite exists, and `voxelManager` is still the manager that the
    // props gave. A tool, a segmentation and a measurement therefore read
    // exactly what they read before.
    expect(volume.compositeVoxelManager.primary).toBe(volume.voxelManager);
    expect(volume.voxelManager.getAtIJK(1, 0, 0)).toBe(1);
  });
});

describe('ImageVolume — the alternate representations', () => {
  it('holds the primary representation alone at the start, at the grid of the volume', () => {
    const volume = makeVolume();
    const representations = volume.getVoxelRepresentations();

    expect(representations.length).toBe(1);
    expect(representations[0].voxelManager).toBe(volume.voxelManager);
    expect(representations[0].grid).toEqual(volume.voxelGrid);
    expect(representations[0].statistic).toBe(VoxelStatistics.Average);
  });

  it('gives one composite for every call', () => {
    const volume = makeVolume();

    expect(volume.compositeVoxelManager).toBe(volume.compositeVoxelManager);
  });

  it('adds a derived representation, which the box average produces', () => {
    const volume = makeVolume();
    const derived = volume.createVoxelRepresentation({ factors: [2, 2, 1] });

    expect(volume.getVoxelRepresentations().length).toBe(2);
    expect(derived.grid.dimensions).toEqual([2, 2, 4]);
    expect(derived.grid.spacing).toEqual([2, 2, 2]);
    expect(derived.reduction).toBe(VoxelReductions.BoxAverage);
    // The box of the voxels 0, 1, 4 and 5 averages to 2.5, and the derivation
    // rounds that value for a store of whole numbers.
    expect(derived.voxelManager.getAtIJK(0, 0, 0)).toBe(3);
  });

  it('selects the derived representation under a ceiling, and the primary without one', () => {
    const volume = makeVolume();
    const derived = volume.createVoxelRepresentation({ factors: [2, 2, 1] });

    // A render path that draws at a spacing of 2 states that ceiling, and the
    // selection gives the data at that resolution. Without the ceiling the rule
    // degenerates to "the highest resolution available", which is the
    // behaviour of today.
    expect(volume.selectVoxelRepresentation({ ceiling: [2, 2, 2] })).toBe(
      derived
    );
    expect(volume.selectVoxelRepresentation().voxelManager).toBe(
      volume.voxelManager
    );
  });

  it('reports the quality record of the representation that a reader gets', () => {
    const volume = makeVolume();

    const record = volume.getVoxelQuality();

    expect(record.grid).toEqual(volume.voxelGrid);
    expect(record.voxels).toBe(dimensions[0] * dimensions[1] * dimensions[2]);
    // The record states no verdict. A reader compares the record against its
    // own requirement.
    expect(record.status).toBeDefined();
  });
});

describe('ImageVolume — the life of the composite', () => {
  it('discards the composite when a caller assigns a new voxel manager', () => {
    const volume = makeVolume();

    volume.createVoxelRepresentation({ factors: [2, 2, 1] });
    expect(volume.getVoxelRepresentations().length).toBe(2);

    // `volumeLoader.createLocalVolume` assigns a new voxel manager immediately
    // after the construction. The alternate representations describe the data
    // of the voxel manager that produced them, so the volume discards them.
    const replacement = makeRamp(dimensions);
    volume.voxelManager = replacement;

    expect(volume.compositeVoxelManager.primary).toBe(replacement);
    expect(volume.getVoxelRepresentations().length).toBe(1);
  });

  it('releases the composite when the volume is destroyed', () => {
    const volume = makeVolume();

    volume.createVoxelRepresentation({ factors: [2, 2, 1] });
    volume.destroy();

    expect(volume.getVoxelRepresentations().length).toBe(1);
  });
});
