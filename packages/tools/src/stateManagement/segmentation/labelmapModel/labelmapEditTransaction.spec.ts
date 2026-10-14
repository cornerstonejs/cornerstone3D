import type { Types } from '@cornerstonejs/core';
import type vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';
import type { Segmentation } from '../../../types/SegmentationStateTypes';
jest.mock('@cornerstonejs/core', () => ({
  BaseVolumeViewport: class BaseVolumeViewport {},
  cache: {
    getImage: jest.fn(),
    getVolume: jest.fn(),
    removeVolumeLoadObject: jest.fn(),
  },
  imageLoader: {
    createAndCacheDerivedImages: jest.fn(),
  },
  utilities: {
    uuidv4: jest.fn(() => 'uuid'),
  },
  volumeLoader: {
    createAndCacheDerivedLabelmapVolume: jest.fn(),
    createAndCacheVolumeFromImagesSync: jest.fn(),
  },
}));

jest.mock('../getSegmentation', () => ({ getSegmentation: jest.fn() }));

import setValueComposition from '../../../tools/segmentation/strategies/compositions/setValue';
import StrategyCallbacks from '../../../enums/StrategyCallbacks';
import { getSegmentation } from '../getSegmentation';
import {
  beginLabelmapEditTransaction,
  eraseLabelmapEditTransactionOverwrites,
} from './labelmapEditTransaction';

const { cache: mockCache } = jest.requireMock('@cornerstonejs/core');

function createSegment(segmentIndex: number) {
  return {
    segmentIndex,
    label: `Segment ${segmentIndex}`,
    locked: false,
    cachedStats: {},
    active: segmentIndex === 1,
  };
}

function createSegmentation(): Segmentation {
  return {
    segmentationId: 'segmentation',
    label: 'Segmentation',
    cachedStats: {},
    segments: {
      1: createSegment(1),
      2: createSegment(2),
      3: createSegment(3),
    },
    representationData: {
      Labelmap: {
        labelmaps: {
          layerA: {
            labelmapId: 'layerA',
            storageKind: 'stack',
            imageIds: ['layerA-image'],
            labelToSegmentIndex: {
              1: 1,
              2: 2,
            },
          },
          layerB: {
            labelmapId: 'layerB',
            storageKind: 'stack',
            imageIds: ['layerB-image'],
            labelToSegmentIndex: {
              1: 3,
            },
          },
        },
        segmentBindings: {
          1: {
            labelmapId: 'layerA',
            labelValue: 1,
          },
          2: {
            labelmapId: 'layerA',
            labelValue: 2,
          },
          3: {
            labelmapId: 'layerB',
            labelValue: 1,
          },
        },
      },
    },
  };
}

function createVoxelManager(values: number[]) {
  const voxelManager = {
    values: [...values],
    forEach(callback) {
      voxelManager.values.forEach((value, index) => {
        callback({
          value,
          index,
          pointIJK: [index, 0, 0],
        });
      });
    },
    getAtIndex(index: number) {
      return voxelManager.values[index];
    },
    setAtIndex(index: number, value: number) {
      voxelManager.values[index] = value;
    },
  };

  return voxelManager as typeof voxelManager & Types.IVoxelManager<number>;
}

const imageData = {
  indexToWorld: (point: Types.Point3) => point,
} as vtkImageData;

describe('labelmap edit transactions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCache.getImage.mockReset();
  });

  it.each([
    ['locked', { overwriteSegmentIndices: [2, 3], segmentsLocked: [2] }],
    ['protected', { overwriteSegmentIndices: [], segmentsLocked: [] }],
  ])(
    'does not paint the voxels of a %s segment, and does not create a layer',
    (_, { overwriteSegmentIndices, segmentsLocked }) => {
      const segmentation = createSegmentation();
      (getSegmentation as jest.Mock).mockReturnValue(segmentation);
      const segmentationVoxelManager = createVoxelManager([0, 2, 0]);

      const transaction = beginLabelmapEditTransaction(segmentation, {
        segmentIndex: 1,
        overwriteSegmentIndices,
      });

      expect(transaction.labelmapId).toBe('layerA');
      expect(
        Object.keys(segmentation.representationData.Labelmap.labelmaps)
      ).toEqual(['layerA', 'layerB']);

      // The stroke covers all three voxels.
      const operationData = {
        segmentationId: segmentation.segmentationId,
        segmentIndex: 1,
        labelValue: transaction.labelValue,
        labelmapId: transaction.labelmapId,
        labelmapEditTransaction: transaction,
        segmentsLocked,
        segmentationVoxelManager,
        memo: { voxelManager: segmentationVoxelManager },
      };
      segmentationVoxelManager.values.forEach((value, index) =>
        setValueComposition[StrategyCallbacks.INTERNAL_setValue](
          operationData as never,
          { value, index }
        )
      );

      expect(segmentationVoxelManager.values).toEqual([1, 2, 1]);
    }
  );

  it('keeps the segment on its shared layer when the overlap is allowed', () => {
    const segmentation = createSegmentation();

    const transaction = beginLabelmapEditTransaction(segmentation, {
      segmentIndex: 1,
      overwriteSegmentIndices: [2],
    });

    expect(transaction.labelmapId).toBe('layerA');
    expect(transaction.crossLayerEraseBindings).toEqual([]);
    expect(transaction.protectedSegmentIndices).toEqual([]);
  });

  it('collects the cross-layer erase bindings of the overwritten segments', () => {
    const segmentation = createSegmentation();

    const transaction = beginLabelmapEditTransaction(segmentation, {
      segmentIndex: 1,
      overwriteSegmentIndices: [3],
    });

    expect(transaction.crossLayerEraseBindings).toEqual([
      {
        labelmapId: 'layerB',
        labelValue: 1,
      },
    ]);
  });

  it('erases cross-layer stack overwrites without brush tool setup', () => {
    const segmentation = createSegmentation();
    const layerBVoxelManager = createVoxelManager([1, 1, 0]);
    const viewport = {
      getCurrentImageId: () => 'ref-image',
      getCurrentImageIdIndex: () => 0,
      getImageIds: () => ['ref-image'],
    } as Types.IStackViewport;

    mockCache.getImage.mockImplementation((imageId: string) =>
      imageId === 'layerB-image'
        ? {
            imageId,
            voxelManager: layerBVoxelManager,
          }
        : undefined
    );

    const modifiedSlices = eraseLabelmapEditTransactionOverwrites(
      segmentation,
      {
        segmentIndex: 1,
        labelmapId: 'layerA',
        labelValue: 1,
        sourceLayer: segmentation.representationData.Labelmap.labelmaps.layerA,
        overwriteSegmentIndices: [3],
        protectedSegmentIndices: [],
        crossLayerEraseBindings: [
          {
            labelmapId: 'layerB',
            labelValue: 1,
          },
        ],
      },
      {
        viewport,
        referenceImageData: imageData,
        isInObject: (point) => point[0] === 0,
      }
    );

    expect(layerBVoxelManager.values).toEqual([0, 1, 0]);
    expect(modifiedSlices).toEqual([0]);
  });
});
