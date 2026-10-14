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

jest.mock('../getSegmentation', () => ({ getSegmentation: jest.fn() }));

import setValueComposition from '../../../tools/segmentation/strategies/compositions/setValue';
import StrategyCallbacks from '../../../enums/StrategyCallbacks';
import { getSegmentation } from '../getSegmentation';
import {
  beginLabelmapEditTransaction,
  eraseLabelmapEditTransactionOverwrites,
} from './labelmapEditTransaction';
import { registerLabelmap } from './labelmapLayerStore';
import {
  getLabelToSegmentIndex,
  removeSegmentBinding,
  setSegmentBinding,
} from './labelmapSegmentBindings';

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
  });

  it('moves a segment to a private layer before editing over a protected sibling', () => {
    const segmentation = createSegmentation();
    const segmentationVoxelManager = createVoxelManager([0, 2, 0]);
    const privateLayer: LabelmapLayer = {
      labelmapId: 'privateLayer',
      storageKind: 'stack',
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

  it('does not paint the voxels of a locked segment, and does not create a layer', () => {
    const segmentation = createSegmentation();
    (getSegmentation as jest.Mock).mockReturnValue(segmentation);
    const segmentationVoxelManager = createVoxelManager([0, 2, 0]);
    const moveSegmentToPrivateLabelmap = jest.fn();
    const segmentsLocked = [2];

    const transaction = beginLabelmapEditTransaction(segmentation, {
      segmentIndex: 1,
      // Segment 2 is locked, so it is not a segment that the brush can overwrite.
      overwriteSegmentIndices: [3],
      segmentsLocked,
      segmentationVoxelManager,
      segmentationImageData: imageData,
      isInObject: () => true,
      moveSegmentToPrivateLabelmap,
    });

    expect(moveSegmentToPrivateLabelmap).not.toHaveBeenCalled();
    expect(transaction.movedSegment).toBe(false);
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
  });

  it('gives the label map of one layer as a copy', () => {
    const segmentation = createSegmentation();

    const labelToSegmentIndex = getLabelToSegmentIndex(segmentation, 'layerB');
    expect(labelToSegmentIndex).toEqual({ 1: 3 });

    labelToSegmentIndex[1] = 5;
    expect(getLabelToSegmentIndex(segmentation, 'layerB')).toEqual({ 1: 3 });
  });

  it('clears the old label value from the old layer when a binding moves or goes away', () => {
    const segmentation = createSegmentation();
    const layerAVoxelManager = createVoxelManager([1, 2, 0, 2]);
    const layerBVoxelManager = createVoxelManager([1, 0, 1, 0]);
    mockCache.getImage.mockImplementation((imageId: string) => {
      const voxelManager = {
        'layerA-image': layerAVoxelManager,
        'layerB-image': layerBVoxelManager,
      }[imageId];
      return voxelManager ? { imageId, voxelManager } : undefined;
    });

    // Segment 2 moves from label value 2 of layer A to label value 2 of layer B.
    setSegmentBinding(segmentation, 2, { labelmapId: 'layerB', labelValue: 2 });

    expect(layerAVoxelManager.values).toEqual([1, 0, 0, 0]);
    expect(getLabelToSegmentIndex(segmentation, 'layerA')).toEqual({ 1: 1 });

    // Segment 3 goes away.
    removeSegmentBinding(segmentation, 3);

    expect(layerBVoxelManager.values).toEqual([0, 0, 0, 0]);
    expect(getLabelToSegmentIndex(segmentation, 'layerB')).toEqual({ 2: 2 });
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
      storageKind: 'stack',
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
