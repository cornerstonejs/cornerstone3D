import type { Types } from '@cornerstonejs/core';
import type vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';
import type { Segmentation } from '../../../types/SegmentationStateTypes';
import type { LabelmapLayer } from '../../../types/LabelmapTypes';
jest.mock('@cornerstonejs/core', () => ({
  BaseVolumeViewport: class BaseVolumeViewport {},
  Enums: { VoxelStatistics: { ForegroundMajority: 'ForegroundMajority' } },
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
  resolveLabelmapLayerEditTarget,
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

  describe('a 2D edit of a volume layer in a stack viewport', () => {
    // The volume layer holds two slices of two voxels. Its images share their
    // voxels with the volume; the mock keeps them apart, so a test sees which
    // one an edit reads. Slice 1 is the edited slice, the volume voxel manager
    // starts with slice 0.
    function createVolumeLayerSetup() {
      const segmentation = createSegmentation();
      (getSegmentation as jest.Mock).mockReturnValue(segmentation);
      const { Labelmap } = segmentation.representationData;
      const volumeLayer: LabelmapLayer = {
        labelmapId: 'volumeLayer',
        storageKind: 'volume',
        volumeId: 'volumeLayer-volume',
        // Another order than the edited layer.
        imageIds: ['volume-1', 'volume-0'],
        referencedImageIds: ['ref-1', 'ref-0'],
        labelToSegmentIndex: { 1: 2 },
      };
      registerLabelmap(segmentation, volumeLayer);
      Labelmap.segmentBindings[2] = {
        labelmapId: 'volumeLayer',
        labelValue: 1,
      };
      delete Labelmap.labelmaps.layerA.labelToSegmentIndex[2];
      Labelmap.labelmaps.layerA.imageIds = ['layerA-0', 'layerA-1'];
      Labelmap.labelmaps.layerA.referencedImageIds = ['ref-0', 'ref-1'];

      // Segment 2 is on voxel 1 of slice 0 and on voxel 0 of slice 1.
      const sliceImages = {
        'volume-0': createVoxelManager([0, 1]),
        'volume-1': createVoxelManager([1, 0]),
      };
      const volumeVoxelManager = createVoxelManager([0, 1, 1, 0]);
      mockCache.getImage.mockImplementation((imageId: string) =>
        sliceImages[imageId]
          ? { imageId, voxelManager: sliceImages[imageId] }
          : undefined
      );
      mockCache.getVolume.mockImplementation((volumeId: string) =>
        volumeId === 'volumeLayer-volume'
          ? { volumeId, voxelManager: volumeVoxelManager, imageData }
          : undefined
      );
      const viewport = {
        getCurrentImageId: () => 'ref-1',
        getCurrentImageIdIndex: () => 1,
        getImageIds: () => ['ref-0', 'ref-1'],
      } as Types.IStackViewport;

      return {
        segmentation,
        volumeLayer,
        sliceImages,
        volumeVoxelManager,
        viewport,
      };
    }

    it('reads the locked voxels of the edited slice, not of slice 0', () => {
      const { segmentation, sliceImages, viewport } = createVolumeLayerSetup();
      const { layerA } = segmentation.representationData.Labelmap.labelmaps;
      const editedVoxels = createVoxelManager([0, 0]);

      const transaction = beginLabelmapEditTransaction(segmentation, {
        segmentIndex: 1,
        segmentsLocked: [2],
        segmentationVoxelManager: editedVoxels,
        segmentationImageData: imageData,
        isInObject: () => true,
      });
      transaction.lockedVoxelsOnOtherLayers = getLockedVoxelsOnOtherLayers(
        segmentation,
        transaction.labelmapId,
        [2],
        {
          viewport,
          imageId: 'layerA-1',
          sourceLayer: layerA,
          imageSliceEdit: true,
        }
      );
      paintAllVoxels(segmentation, transaction, [2], editedVoxels);

      expect(transaction.lockedVoxelsOnOtherLayers).toHaveLength(1);
      expect(transaction.lockedVoxelsOnOtherLayers[0].voxelManager).toBe(
        sliceImages['volume-1']
      );
      // Voxel 0 is locked on slice 1, voxel 1 is locked only on slice 0.
      expect(editedVoxels.values).toEqual([0, 1]);
    });

    it('reads the locked slice when the edited layer has no referenced image ids', () => {
      // The primary layer of a segmentation added with only a volumeId lists
      // its labelmap images, not the referenced ones. A private layer made
      // from it lists the referenced (CT) images of the volume.
      const { segmentation, sliceImages, viewport } = createVolumeLayerSetup();
      const { layerA } = segmentation.representationData.Labelmap.labelmaps;
      delete layerA.referencedImageIds;
      const editedImages = {
        'layerA-0': { referencedImageId: 'ref-0' },
        'layerA-1': { referencedImageId: 'ref-1' },
      };
      mockCache.getImage.mockImplementation((imageId: string) =>
        sliceImages[imageId]
          ? { imageId, voxelManager: sliceImages[imageId] }
          : editedImages[imageId]
            ? { imageId, ...editedImages[imageId] }
            : undefined
      );

      const lockedVoxels = getLockedVoxelsOnOtherLayers(
        segmentation,
        'layerA',
        [2],
        {
          viewport,
          imageId: 'layerA-1',
          sourceLayer: layerA,
          imageSliceEdit: true,
        }
      );

      expect(lockedVoxels).toHaveLength(1);
      expect(lockedVoxels[0].voxelManager).toBe(sliceImages['volume-1']);
    });

    it('does not read slice 0 of the volume when the edited slice has no image on the locked layer', () => {
      const { segmentation, viewport } = createVolumeLayerSetup();
      const { layerA } = segmentation.representationData.Labelmap.labelmaps;
      mockCache.getImage.mockReturnValue(undefined);

      const lockedVoxels = getLockedVoxelsOnOtherLayers(
        segmentation,
        'layerA',
        [2],
        {
          viewport,
          imageId: 'layerA-1',
          sourceLayer: layerA,
          imageSliceEdit: true,
        }
      );

      expect(lockedVoxels).toEqual([]);
    });

    it('finds the slice image of a volume layer without referenced image ids by the cached images', () => {
      const { segmentation, volumeLayer, sliceImages, viewport } =
        createVolumeLayerSetup();
      const { layerA } = segmentation.representationData.Labelmap.labelmaps;
      delete volumeLayer.referencedImageIds;
      mockCache.getImage.mockImplementation((imageId: string) =>
        sliceImages[imageId]
          ? {
              imageId,
              referencedImageId: imageId.replace('volume', 'ref'),
              voxelManager: sliceImages[imageId],
            }
          : undefined
      );

      const target = resolveLabelmapLayerEditTarget(volumeLayer, {
        viewport,
        imageId: 'layerA-1',
        sourceLayer: layerA,
        imageSliceEdit: true,
      });

      expect(target.imageId).toBe('volume-1');
      expect(target.voxelManager).toBe(sliceImages['volume-1']);
    });

    it('edits the slice image of a private volume layer after a move', () => {
      const { segmentation, volumeLayer, sliceImages, viewport } =
        createVolumeLayerSetup();
      const { layerA } = segmentation.representationData.Labelmap.labelmaps;

      const target = resolveLabelmapLayerEditTarget(volumeLayer, {
        viewport,
        imageId: 'layerA-1',
        sourceLayer: layerA,
        imageSliceEdit: true,
      });

      expect(target.imageId).toBe('volume-1');
      expect(target.voxelManager).toBe(sliceImages['volume-1']);
      expect(target.image).toBeDefined();
      expect(target.volume).toBeUndefined();
      expect(target.imageData).toBeUndefined();
    });

    it('keeps the volume for a volume edit', () => {
      const { segmentation, volumeLayer, volumeVoxelManager, viewport } =
        createVolumeLayerSetup();
      const { layerA } = segmentation.representationData.Labelmap.labelmaps;

      // A 3D strategy (a sphere) in a stack viewport indexes the volume.
      expect(
        resolveLabelmapLayerEditTarget(volumeLayer, {
          viewport,
          imageId: 'layerA-1',
          sourceLayer: layerA,
        }).voxelManager
      ).toBe(volumeVoxelManager);
      expect(
        resolveLabelmapLayerEditTarget(volumeLayer, {
          viewport,
          imageId: 'layerA-1',
          sourceLayer: layerA,
          imageSliceEdit: true,
          preferVolume: true,
        }).voxelManager
      ).toBe(volumeVoxelManager);

      const { BaseVolumeViewport } = jest.requireMock('@cornerstonejs/core');
      expect(
        resolveLabelmapLayerEditTarget(volumeLayer, {
          viewport: new BaseVolumeViewport(),
          imageId: 'layerA-1',
          sourceLayer: layerA,
          imageSliceEdit: true,
        }).voxelManager
      ).toBe(volumeVoxelManager);
    });

    it('erases a cross-layer overwrite on the edited slice of the volume layer', () => {
      const { segmentation, sliceImages, volumeVoxelManager, viewport } =
        createVolumeLayerSetup();
      const { layerA } = segmentation.representationData.Labelmap.labelmaps;
      const erased = [];

      const modifiedSlices = eraseLabelmapEditTransactionOverwrites(
        segmentation,
        {
          segmentIndex: 1,
          labelmapId: 'layerA',
          labelValue: 1,
          sourceLayer: layerA,
          activeLayer: layerA,
          overwriteSegmentIndices: [2],
          protectedSegmentIndices: [],
          crossLayerEraseBindings: [
            { labelmapId: 'volumeLayer', labelValue: 1 },
          ],
          movedSegment: false,
        },
        {
          viewport,
          referenceImageData: imageData,
          isInObject: () => true,
          isInObjectBoundsIJK: [
            [0, 1],
            [0, 0],
            [0, 0],
          ],
          imageId: 'layerA-1',
          imageSliceEdit: true,
          crossLayerEraseCallback: (record) => erased.push(record),
        }
      );

      expect(sliceImages['volume-1'].values).toEqual([0, 0]);
      expect(sliceImages['volume-0'].values).toEqual([0, 1]);
      expect(volumeVoxelManager.values).toEqual([0, 1, 1, 0]);
      expect(erased).toHaveLength(1);
      expect(erased[0].voxelManager).toBe(sliceImages['volume-1']);
      expect(erased[0].indices).toEqual([0]);
      expect(modifiedSlices).toEqual([1]);
    });
  });
});
