import type { Types } from '@cornerstonejs/core';
import type vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';
import type { Segmentation } from '../../../types/SegmentationStateTypes';
import type { LabelmapLayer } from '../../../types/LabelmapTypes';
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

import {
  beginLabelmapEditTransaction,
  eraseLabelmapEditTransactionOverwrites,
} from './labelmapEditTransaction';
import { registerLabelmap } from './labelmapLayerStore';
import { setSegmentBinding } from './labelmapSegmentBindings';

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
            type: 'stack',
            imageIds: ['layerA-image'],
            labelToSegmentIndex: {
              1: 1,
              2: 2,
            },
          },
          layerB: {
            labelmapId: 'layerB',
            type: 'stack',
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
  });

  it('moves a segment to a private layer before editing over a protected sibling', () => {
    const segmentation = createSegmentation();
    const segmentationVoxelManager = createVoxelManager([0, 2, 0]);
    const privateLayer: LabelmapLayer = {
      labelmapId: 'privateLayer',
      type: 'stack',
      imageIds: ['private-image'],
      labelToSegmentIndex: {
        1: 1,
      },
    };
    const moveSegmentToPrivateLabelmap = jest.fn(
      (targetSegmentation: Segmentation) => {
        registerLabelmap(targetSegmentation, privateLayer);
        setSegmentBinding(targetSegmentation, 1, {
          labelmapId: privateLayer.labelmapId,
          labelValue: 1,
        });

        return privateLayer;
      }
    );

    const transaction = beginLabelmapEditTransaction(segmentation, {
      segmentIndex: 1,
      overwriteSegmentIndices: [],
      segmentationVoxelManager,
      segmentationImageData: imageData,
      isInObject: () => true,
      moveSegmentToPrivateLabelmap,
    });

    expect(moveSegmentToPrivateLabelmap).toHaveBeenCalledTimes(1);
    expect(transaction.movedSegment).toBe(true);
    expect(transaction.sourceLayer?.labelmapId).toBe('layerA');
    expect(transaction.activeLayer?.labelmapId).toBe('privateLayer');
    expect(transaction.labelmapId).toBe('privateLayer');
    expect(transaction.labelValue).toBe(1);
    expect(transaction.protectedSegmentIndices).toEqual([2]);
  });

  it('keeps the segment on its shared layer when the overlap is allowed', () => {
    const segmentation = createSegmentation();
    const segmentationVoxelManager = createVoxelManager([2]);
    const moveSegmentToPrivateLabelmap = jest.fn();

    const transaction = beginLabelmapEditTransaction(segmentation, {
      segmentIndex: 1,
      overwriteSegmentIndices: [2],
      segmentationVoxelManager,
      segmentationImageData: imageData,
      isInObject: () => true,
      moveSegmentToPrivateLabelmap,
    });

    expect(moveSegmentToPrivateLabelmap).not.toHaveBeenCalled();
    expect(transaction.movedSegment).toBe(false);
    expect(transaction.activeLayer?.labelmapId).toBe('layerA');
    expect(transaction.labelmapId).toBe('layerA');
    expect(transaction.crossLayerEraseBindings).toEqual([]);
    expect(transaction.protectedSegmentIndices).toEqual([]);
  });

  it('collects cross-layer erase bindings after a protected overwrite move', () => {
    const segmentation = createSegmentation();
    const segmentationVoxelManager = createVoxelManager([2]);
    const privateLayer: LabelmapLayer = {
      labelmapId: 'privateLayer',
      type: 'stack',
      imageIds: ['private-image'],
      labelToSegmentIndex: {
        1: 1,
      },
    };

    const transaction = beginLabelmapEditTransaction(segmentation, {
      segmentIndex: 1,
      overwriteSegmentIndices: [3],
      segmentationVoxelManager,
      segmentationImageData: imageData,
      isInObject: () => true,
      moveSegmentToPrivateLabelmap: (targetSegmentation) => {
        registerLabelmap(targetSegmentation, privateLayer);
        setSegmentBinding(targetSegmentation, 1, {
          labelmapId: privateLayer.labelmapId,
          labelValue: 1,
        });

        return privateLayer;
      },
    });

    expect(transaction.movedSegment).toBe(true);
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
        activeLayer: segmentation.representationData.Labelmap.labelmaps.layerA,
        overwriteSegmentIndices: [3],
        protectedSegmentIndices: [],
        crossLayerEraseBindings: [
          {
            labelmapId: 'layerB',
            labelValue: 1,
          },
        ],
        movedSegment: false,
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
