import vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';
import vtkDataArray from '@kitware/vtk.js/Common/Core/DataArray';
import type { Types } from '@cornerstonejs/core';
import type { Segmentation } from '../../types';

jest.mock('@cornerstonejs/core', () => {
  const { default: transformWorldToIndex } = jest.requireActual(
    '@cornerstonejs/core/utilities/transformWorldToIndex'
  );
  const { default: indexWithinDimensions } = jest.requireActual(
    '@cornerstonejs/core/utilities/indexWithinDimensions'
  );
  const { default: VoxelManager } = jest.requireActual(
    '@cornerstonejs/core/utilities/VoxelManager'
  );

  return {
    BaseVolumeViewport: class BaseVolumeViewport {},
    cache: { getImage: jest.fn() },
    utilities: { transformWorldToIndex, indexWithinDimensions, VoxelManager },
  };
});

// Only the contour path reads annotations and polylines; keep them out.
jest.mock('../../stateManagement', () => ({ getAnnotation: jest.fn() }));
jest.mock('../math/polyline', () => ({ isPointInsidePolyline3D: jest.fn() }));
jest.mock('../planar/filterAnnotationsForDisplay', () => ({
  __esModule: true,
  default: jest.fn(),
}));

jest.mock('../../stateManagement/segmentation/segmentationState', () => ({
  getSegmentation: jest.fn(),
  getCurrentLabelmapImageIdsForViewport: jest.fn(),
}));

jest.mock(
  '../../stateManagement/segmentation/helpers/getSegmentationActor',
  () => ({ getLabelmapActorEntry: jest.fn() })
);

jest.mock(
  '../../stateManagement/segmentation/helpers/getViewportLabelmapRenderMode',
  () => ({ __esModule: true, default: jest.fn() })
);

jest.mock(
  '../../stateManagement/segmentation/helpers/labelmapSegmentationState',
  () => ({
    getLabelmaps: jest.fn(),
    getOrCreateLabelmapVolume: jest.fn(),
    // Label value n is segment 10 + n, so a test can tell the two apart.
    getSegmentIndexForLabelValue: jest.fn(
      (_segmentation, _labelmapId, labelValue) => 10 + labelValue
    ),
  })
);

import { cache, utilities } from '@cornerstonejs/core';
import {
  getSegmentation,
  getCurrentLabelmapImageIdsForViewport,
} from '../../stateManagement/segmentation/segmentationState';
import { getLabelmapActorEntry } from '../../stateManagement/segmentation/helpers/getSegmentationActor';
import getViewportLabelmapRenderMode from '../../stateManagement/segmentation/helpers/getViewportLabelmapRenderMode';
import {
  getLabelmaps,
  getOrCreateLabelmapVolume,
} from '../../stateManagement/segmentation/helpers/labelmapSegmentationState';
import { getSegmentIndexAtWorldPoint } from './getSegmentIndexAtWorldPoint';

const WIDTH = 4;
const HEIGHT = 3;

/**
 * A 4 x 3 labelmap slice at the origin with unit spacing. Pixel (i, j) holds
 * the label j * WIDTH + i + 1, so every pixel is labelled and no two pixels
 * share a label.
 */
function createSliceScalars(): Uint8Array {
  return Uint8Array.from({ length: WIDTH * HEIGHT }, (_, index) => index + 1);
}

function createImageData({ withScalars = true } = {}) {
  const imageData = vtkImageData.newInstance();
  imageData.setDimensions(WIDTH, HEIGHT, 1);
  imageData.setSpacing(1, 1, 1);
  imageData.setOrigin(0, 0, 0);

  if (withScalars) {
    imageData.getPointData().setScalars(
      vtkDataArray.newInstance({
        numberOfComponents: 1,
        values: createSliceScalars(),
      })
    );
  }

  return imageData;
}

function createActorEntry(imageData) {
  return {
    actor: { getMapper: () => ({ getInputData: () => imageData }) },
  };
}

const segmentation = {
  segmentationId: 'segmentation',
  representationData: { Labelmap: {} },
} as unknown as Segmentation;

const stackViewport = { id: 'stack-viewport' } as unknown as Types.IViewport;

function getSegmentIndexAt(
  worldPoint: Types.Point3,
  viewport: Types.IViewport = stackViewport
) {
  return getSegmentIndexAtWorldPoint('segmentation', worldPoint, {
    viewport,
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  (getSegmentation as jest.Mock).mockReturnValue(segmentation);
  (getLabelmaps as jest.Mock).mockReturnValue([
    { labelmapId: 'layer', imageIds: ['labelmap-image'] },
  ]);
});

describe('getSegmentIndexAtWorldPoint for a stack labelmap', () => {
  beforeEach(() => {
    (getViewportLabelmapRenderMode as jest.Mock).mockReturnValue('image');
    (getCurrentLabelmapImageIdsForViewport as jest.Mock).mockReturnValue([
      'labelmap-image',
    ]);
    (cache.getImage as jest.Mock).mockReturnValue({
      imageId: 'labelmap-image',
    });
  });

  it('returns the segment of the label under the point', () => {
    (getLabelmapActorEntry as jest.Mock).mockReturnValue(
      createActorEntry(createImageData())
    );

    // Pixel (2, 1) holds the label 1 * 4 + 2 + 1 = 7.
    expect(getSegmentIndexAt([2, 1, 0])).toBe(17);
  });

  it('returns undefined without throwing when the labelmap image has no actor yet', () => {
    (getLabelmapActorEntry as jest.Mock).mockReturnValue(undefined);

    expect(() => getSegmentIndexAt([2, 1, 0])).not.toThrow();
    expect(getSegmentIndexAt([2, 1, 0])).toBeUndefined();
  });

  it('returns undefined without throwing when the actor image data has no scalars', () => {
    (getLabelmapActorEntry as jest.Mock).mockReturnValue(
      createActorEntry(createImageData({ withScalars: false }))
    );

    expect(() => getSegmentIndexAt([2, 1, 0])).not.toThrow();
    expect(getSegmentIndexAt([2, 1, 0])).toBeUndefined();
  });

  it.each([
    ['past the last column', [WIDTH, 1, 0]],
    ['before the first column', [-1, 1, 0]],
  ])(
    'returns undefined for a point %s, instead of the label of a pixel on another row',
    (_, worldPoint) => {
      (getLabelmapActorEntry as jest.Mock).mockReturnValue(
        createActorEntry(createImageData())
      );

      expect(getSegmentIndexAt(worldPoint as Types.Point3)).toBeUndefined();
    }
  );

  it('returns undefined without throwing when no viewport is given', () => {
    (getViewportLabelmapRenderMode as jest.Mock).mockReturnValue('unsupported');

    expect(() =>
      getSegmentIndexAtWorldPoint('segmentation', [2, 1, 0])
    ).not.toThrow();
    expect(
      getSegmentIndexAtWorldPoint('segmentation', [2, 1, 0])
    ).toBeUndefined();
  });
});

describe('getSegmentIndexAtWorldPoint for a volume labelmap', () => {
  beforeEach(() => {
    (getViewportLabelmapRenderMode as jest.Mock).mockReturnValue('volume');

    const dimensions: Types.Point3 = [WIDTH, HEIGHT, 1];
    (getOrCreateLabelmapVolume as jest.Mock).mockReturnValue({
      dimensions,
      imageData: createImageData(),
      voxelManager: utilities.VoxelManager.createScalarVolumeVoxelManager({
        dimensions,
        scalarData: createSliceScalars(),
      }),
    });
  });

  it('returns the segment of the label under the point', () => {
    expect(getSegmentIndexAt([2, 1, 0])).toBe(17);
  });

  it.each([
    ['past the last column', [WIDTH, 1, 0]],
    ['before the first column', [-1, 1, 0]],
  ])(
    'returns undefined for a point %s, instead of the label of a pixel on another row',
    (_, worldPoint) => {
      expect(getSegmentIndexAt(worldPoint as Types.Point3)).toBeUndefined();
    }
  );

  it('returns undefined without throwing when the labelmap volume has no voxel manager yet', () => {
    (getOrCreateLabelmapVolume as jest.Mock).mockReturnValue({
      dimensions: [WIDTH, HEIGHT, 1],
      imageData: createImageData(),
    });

    expect(() => getSegmentIndexAt([2, 1, 0])).not.toThrow();
    expect(getSegmentIndexAt([2, 1, 0])).toBeUndefined();
  });
});
