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

/** Records `depth` frame deliveries and returns the milliseconds that took. */
function timeFrames(depth) {
  const grid = gridOf(depth);
  const primary = VoxelManager.createScalarVolumeVoxelManager({
    dimensions: grid.dimensions,
    scalarData: new Uint8Array(4 * 4 * depth),
  });
  const composite = new CompositeVoxelManager({
    primary,
    grid,
    delivered: [],
    id: `scaling-${depth}`,
  });
  const representation = composite.getRepresentations()[0];

  const start = performance.now();

  for (let frame = 0; frame < depth; frame++) {
    composite.setDeliveredQuality(
      representation,
      boundsOfFrame(grid, frame),
      ImageQualityStatus.FULL_RESOLUTION
    );
  }

  return {
    ms: performance.now() - start,
    recorded: representation.delivered.length,
  };
}

describe('the record of the deliveries scales linearly', () => {
  it('takes one delivery in constant time, and not in the size of the record', () => {
    // Warm the code paths so the first measurement is not the compile.
    timeFrames(200);

    const small = timeFrames(1000);
    const large = timeFrames(8000);

    expect(small.recorded).toBe(1000);
    expect(large.recorded).toBe(8000);

    // 8 times the frames. A scan of the record for each delivery would take
    // about 64 times as long; a constant cost for each delivery takes about 8.
    // The bound of 20 leaves room for the noise of one machine.
    const growth = large.ms / Math.max(small.ms, 0.5);

    // eslint-disable-next-line no-console
    console.log(
      `1000 frames: ${small.ms.toFixed(1)} ms, 8000 frames: ${large.ms.toFixed(
        1
      )} ms, growth ${growth.toFixed(1)}x for 8x the frames`
    );

    expect(growth).toBeLessThan(20);
  });

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
