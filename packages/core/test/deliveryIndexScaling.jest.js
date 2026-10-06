import CompositeVoxelManager from '../src/utilities/CompositeVoxelManager';
import VoxelManager from '../src/utilities/VoxelManager';
import { boundsOfFrame } from '../src/utilities/voxelGrid';
import ImageQualityStatus from '../src/enums/ImageQualityStatus';

function gridOf(depth) {
  return {
    origin: [0, 0, 0],
    direction: [1, 0, 0, 0, 1, 0, 0, 0, 1],
    spacing: [1, 1, 1],
    dimensions: [4, 4, depth],
  };
}

describe('the record of the deliveries of a long volume', () => {
  it('counts a fully loaded volume of 3720 frames exactly', () => {
    // One delivery for each frame. The work of the count is one layer of cells
    // for each delivery, so a long volume stays inside the exact count.
    const depth = 3720;
    const grid = gridOf(depth);
    const primary = VoxelManager.createScalarVolumeVoxelManager({
      dimensions: grid.dimensions,
      scalarData: new Uint8Array(4 * 4 * depth),
    });
    const composite = new CompositeVoxelManager({
      primary,
      grid,
      delivered: [],
      id: `coverage-${depth}`,
    });
    const representation = composite.getRepresentations()[0];

    for (let frame = 0; frame < depth; frame++) {
      composite.setDeliveredQuality(
        representation,
        boundsOfFrame(grid, frame),
        ImageQualityStatus.FULL_RESOLUTION
      );
    }

    const record = composite.getRegionQuality(representation);

    expect(record.exact).toBe(true);
    expect(record.missing).toBe(0);
    expect(record.status).toBe(ImageQualityStatus.FULL_RESOLUTION);
  });
});
