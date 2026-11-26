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
  getLockedVoxelsOnOtherLayers,
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

function createPrivateLayerMover(privateLayer: LabelmapLayer) {
  return jest.fn((targetSegmentation: Segmentation, segmentIndex: number) => {
    registerLabelmap(targetSegmentation, privateLayer);
    setSegmentBinding(targetSegmentation, segmentIndex, {
      labelmapId: privateLayer.labelmapId,
      labelValue: 1,
    });

    return privateLayer;
  });
}

/** Applies the brush setValue to every voxel, as a stroke that covers them. */
function paintAllVoxels(
  segmentation: Segmentation,
  transaction: ReturnType<typeof beginLabelmapEditTransaction>,
  segmentsLocked: number[],
  segmentationVoxelManager: ReturnType<typeof createVoxelManager>
) {
  const operationData = {
    segmentationId: segmentation.segmentationId,
    segmentIndex: transaction.segmentIndex,
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
}

describe('labelmap edit transactions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCache.getImage.mockReset();
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

  it('does not move the segment for a locked segment, and does not paint its voxels', () => {
    const segmentation = createSegmentation();
    (getSegmentation as jest.Mock).mockReturnValue(segmentation);
    const segmentationVoxelManager = createVoxelManager([0, 2, 0]);
    const moveSegmentToPrivateLabelmap = createPrivateLayerMover({
      labelmapId: 'privateLayer',
      storageKind: 'stack',
      imageIds: ['private-image'],
    });

    const transaction = beginLabelmapEditTransaction(segmentation, {
      segmentIndex: 1,
      overwriteSegmentIndices: [],
      segmentsLocked: [2],
      segmentationVoxelManager,
      segmentationImageData: imageData,
      isInObject: () => true,
      moveSegmentToPrivateLabelmap,
    });
    paintAllVoxels(segmentation, transaction, [2], segmentationVoxelManager);

    expect(moveSegmentToPrivateLabelmap).not.toHaveBeenCalled();
    expect(transaction.labelmapId).toBe('layerA');
    expect(
      Object.keys(segmentation.representationData.Labelmap.labelmaps)
    ).toEqual(['layerA', 'layerB']);
    expect(segmentationVoxelManager.values).toEqual([1, 2, 1]);
  });

  it('moves the segment for an unlocked protected segment, and keeps the voxels of a locked segment on the other layer', () => {
    const segmentation = createSegmentation();
    (getSegmentation as jest.Mock).mockReturnValue(segmentation);
    const { Labelmap } = segmentation.representationData;
    Labelmap.labelmaps.layerA.labelToSegmentIndex[4] = 4;
    Labelmap.segmentBindings[4] = { labelmapId: 'layerA', labelValue: 4 };
    // Segment 2 is locked, segment 4 is protected but not locked.
    const layerAVoxels = createVoxelManager([2, 4, 0]);
    const privateVoxels = createVoxelManager([0, 0, 0]);
    mockCache.getImage.mockImplementation((imageId: string) =>
      imageId === 'layerA-image' ? { voxelManager: layerAVoxels } : undefined
    );
    const privateLayer: LabelmapLayer = {
      labelmapId: 'privateLayer',
      storageKind: 'stack',
      imageIds: ['private-image'],
    };
    const moveSegmentToPrivateLabelmap = createPrivateLayerMover(privateLayer);

    const transaction = beginLabelmapEditTransaction(segmentation, {
      segmentIndex: 1,
      overwriteSegmentIndices: [],
      segmentsLocked: [2],
      segmentationVoxelManager: layerAVoxels,
      segmentationImageData: imageData,
      isInObject: () => true,
      moveSegmentToPrivateLabelmap,
    });
    transaction.lockedVoxelsOnOtherLayers = getLockedVoxelsOnOtherLayers(
      segmentation,
      transaction.labelmapId,
      [2],
      { imageId: 'private-image', sourceLayer: transaction.activeLayer }
    );
    paintAllVoxels(segmentation, transaction, [2], privateVoxels);

    expect(moveSegmentToPrivateLabelmap).toHaveBeenCalledTimes(1);
    expect(transaction.labelmapId).toBe('privateLayer');
    expect(privateVoxels.values).toEqual([0, 1, 1]);
    expect(layerAVoxels.values).toEqual([2, 4, 0]);
  });

  it('reads the locked layer image of the same referenced image, when the stack layers list them in another order', () => {
    const segmentation = createSegmentation();
    const privateLayer: LabelmapLayer = {
      labelmapId: 'privateLayer',
      storageKind: 'stack',
      imageIds: ['private-0', 'private-1'],
      referencedImageIds: ['ref-0', 'ref-1'],
    };
    registerLabelmap(segmentation, privateLayer);
    const { layerA } = segmentation.representationData.Labelmap.labelmaps;
    layerA.imageIds = ['layerA-1', 'layerA-0'];
    layerA.referencedImageIds = ['ref-1', 'ref-0'];
    const layerAImages = {
      'layerA-0': createVoxelManager([2, 0]),
      'layerA-1': createVoxelManager([0, 0]),
    };
    mockCache.getImage.mockImplementation((imageId: string) =>
      layerAImages[imageId]
        ? { voxelManager: layerAImages[imageId] }
        : undefined
    );

    const lockedVoxels = getLockedVoxelsOnOtherLayers(
      segmentation,
      'privateLayer',
      [2],
      { imageId: 'private-0', sourceLayer: privateLayer }
    );

    expect(lockedVoxels).toHaveLength(1);
    expect(lockedVoxels[0].voxelManager).toBe(layerAImages['layerA-0']);
    expect([...lockedVoxels[0].labelValues]).toEqual([2]);
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
