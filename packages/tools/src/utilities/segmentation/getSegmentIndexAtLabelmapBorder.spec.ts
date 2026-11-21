jest.mock('@cornerstonejs/core', () => {
  const actual = jest.requireActual('@cornerstonejs/core');
  return {
    ...actual,
    cache: {
      ...actual.cache,
      getImage: jest.fn(),
    },
  };
});

jest.mock('../../stateManagement/segmentation/segmentationState', () => ({
  getSegmentation: jest.fn(),
  getCurrentLabelmapImageIdForViewport: jest.fn(),
}));

jest.mock('../../stateManagement/segmentation/helpers', () => ({
  getLabelmapActorEntry: jest.fn(),
}));

jest.mock(
  '../../stateManagement/segmentation/helpers/getViewportLabelmapRenderMode',
  () => ({
    __esModule: true,
    default: jest.fn(() => 'image'),
  })
);

jest.mock(
  '../../stateManagement/segmentation/helpers/labelmapSegmentationState',
  () => ({
    getLabelmaps: jest.fn(() => []),
    getOrCreateLabelmapVolume: jest.fn(),
    getSegmentIndexForLabelValue: jest.fn(),
  })
);

import { cache, utilities } from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';
import {
  getSegmentation,
  getCurrentLabelmapImageIdForViewport,
} from '../../stateManagement/segmentation/segmentationState';
import { getLabelmapActorEntry } from '../../stateManagement/segmentation/helpers';
import { getSegmentIndexAtLabelmapBorder } from './getSegmentIndexAtLabelmapBorder';

const WIDTH = 20;
const HEIGHT = 20;

/**
 * Sets up a single-frame (stack) labelmap of WIDTH x HEIGHT whose pixels are
 * `labelAt(i, j)`, with world coordinates equal to IJK coordinates.
 */
function setupStackLabelmap(labelAt: (i: number, j: number) => number) {
  const dimensions: Types.Point3 = [WIDTH, HEIGHT, 1];
  const scalarData = new Uint8Array(WIDTH * HEIGHT);
  for (let j = 0; j < HEIGHT; j++) {
    for (let i = 0; i < WIDTH; i++) {
      scalarData[i + j * WIDTH] = labelAt(i, j);
    }
  }

  const voxelManager = utilities.VoxelManager.createScalarVolumeVoxelManager({
    dimensions,
    scalarData,
  });

  const imageData = {
    voxelManager,
    getDimensions: () => dimensions,
    worldToIndex: (point: Types.Point3) => [...point],
  };

  (getSegmentation as jest.Mock).mockReturnValue({
    segmentationId: 'seg',
    segments: { 1: { segmentIndex: 1 } },
    representationData: { Labelmap: {} },
  });
  (getCurrentLabelmapImageIdForViewport as jest.Mock).mockReturnValue(
    'labelmap-image'
  );
  (cache.getImage as jest.Mock).mockReturnValue({ imageId: 'labelmap-image' });
  (getLabelmapActorEntry as jest.Mock).mockReturnValue({
    actor: { getMapper: () => ({ getInputData: () => imageData }) },
  });
}

const viewport = { id: 'stack-viewport' } as unknown as Types.IViewport;

describe('getSegmentIndexAtLabelmapBorder (stack labelmap)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('uses the searchRadius option to find a border near the point', () => {
    // Segment 1 is the square i, j in [5, 14]. The point (10, 10) is 6 pixels
    // away from the background at i = 4 / j = 4.
    setupStackLabelmap((i, j) =>
      i >= 5 && i <= 14 && j >= 5 && j <= 14 ? 1 : 0
    );

    expect(
      getSegmentIndexAtLabelmapBorder('seg', [10, 10, 0], {
        viewport,
        searchRadius: 6,
      })
    ).toBe(1);

    expect(
      getSegmentIndexAtLabelmapBorder('seg', [10, 10, 0], {
        viewport,
        searchRadius: 2,
      })
    ).toBeUndefined();
  });

  it('uses whole-pixel neighbor offsets for a non-integer searchRadius', () => {
    // Segment 1 is the square i, j in [5, 14]. The background at i = 15 is
    // 2 pixels from (13, 10) and 1 pixel from (14, 10).
    setupStackLabelmap((i, j) =>
      i >= 5 && i <= 14 && j >= 5 && j <= 14 ? 1 : 0
    );

    expect(
      getSegmentIndexAtLabelmapBorder('seg', [13, 10, 0], {
        viewport,
        searchRadius: 2.5,
      })
    ).toBe(1);

    expect(
      getSegmentIndexAtLabelmapBorder('seg', [12, 10, 0], {
        viewport,
        searchRadius: 2.5,
      })
    ).toBeUndefined();

    // A radius below 1 still checks the direct neighbors
    expect(
      getSegmentIndexAtLabelmapBorder('seg', [14, 10, 0], {
        viewport,
        searchRadius: 0.5,
      })
    ).toBe(1);
  });

  it('does not wrap a neighbor left of column 0 to the end of the previous row', () => {
    // Segment 1 fills the left half of the image (columns 0..9). The point
    // (0, 5) is 10 columns away from the segment border at column 10, but the
    // offset i - 1 would wrap to (19, 4), which is background.
    setupStackLabelmap((i) => (i <= 9 ? 1 : 0));

    expect(
      getSegmentIndexAtLabelmapBorder('seg', [0, 5, 0], { viewport })
    ).toBeUndefined();
  });

  it('returns undefined for a point outside the labelmap', () => {
    // Segment 1 fills columns 15..19. The point (-1, 5) is left of the image;
    // read through the flat scalar array it would wrap to (19, 4), inside the
    // segment and next to its border.
    setupStackLabelmap((i) => (i >= 15 ? 1 : 0));

    expect(
      getSegmentIndexAtLabelmapBorder('seg', [-1, 5, 0], {
        viewport,
        searchRadius: 6,
      })
    ).toBeUndefined();
  });

  it('does not read pixels of other rows for neighbors outside the image', () => {
    // Segment 1 fills the top half of the image (rows 0..9). The point (10, 2)
    // is 8 rows away from the segment border at row 10; a 3 pixel search must
    // not find a border, even though offsets above row 0 wrap to the bottom
    // rows (background) of the scalar array.
    setupStackLabelmap((_i, j) => (j <= 9 ? 1 : 0));

    expect(
      getSegmentIndexAtLabelmapBorder('seg', [10, 2, 0], {
        viewport,
        searchRadius: 3,
      })
    ).toBeUndefined();

    // Sanity check: the same search radius finds the real border.
    expect(
      getSegmentIndexAtLabelmapBorder('seg', [10, 8, 0], {
        viewport,
        searchRadius: 3,
      })
    ).toBe(1);
  });
});
