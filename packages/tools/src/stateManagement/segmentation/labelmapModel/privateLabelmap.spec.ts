import type { Types } from '@cornerstonejs/core';
import type vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';
import type { Segmentation } from '../../../types/SegmentationStateTypes';
import type { LabelmapRestoreStep } from '../../../utilities/segmentation/createLabelmapMemo';

jest.mock('@cornerstonejs/core', () => {
  const actual = jest.requireActual('@cornerstonejs/core');
  return {
    ...actual,
    cache: {
      getImage: jest.fn(),
      getVolume: jest.fn(),
      removeVolumeLoadObject: jest.fn(),
    },
    imageLoader: {
      createAndCacheDerivedImages: jest.fn(),
    },
    volumeLoader: {
      createAndCacheDerivedLabelmapVolume: jest.fn(),
      createAndCacheVolumeFromImagesSync: jest.fn(),
    },
  };
});

jest.mock('../triggerSegmentationEvents', () => ({
  triggerSegmentationDataModified: jest.fn(),
}));

import { moveSegmentToPrivateLabelmap } from './privateLabelmap';
import {
  beginLabelmapEditTransaction,
  eraseLabelmapEditTransactionOverwrites,
} from './labelmapEditTransaction';
import { getLabelmap } from './labelmapLayerStore';
import { getSegmentBinding } from './labelmapSegmentBindings';
import { createLabelmapMemo } from '../../../utilities/segmentation/createLabelmapMemo';
import type { LabelmapMemo } from '../../../utilities/segmentation/createLabelmapMemo';

const { cache: mockCache, imageLoader: mockImageLoader } = jest.requireMock(
  '@cornerstonejs/core'
);

function createVoxelManager(values: number[]) {
  const state = { values: [...values] };
  const voxelManager = {
    id: `vm-${Math.random()}`,
    dimensions: [values.length, 1, 1] as Types.Point3,
    forEach(
      callback: (args: {
        value: number;
        index: number;
        pointIJK: Types.Point3;
      }) => void
    ) {
      state.values.forEach((value, index) => {
        callback({ value, index, pointIJK: [index, 0, 0] });
      });
    },
    getAtIndex: (index: number) => state.values[index],
    setAtIndex: (index: number, value: number) => {
      state.values[index] = value;
    },
    getAtIJKPoint: ([i]: Types.Point3) => state.values[i],
    setAtIJKPoint: ([i]: Types.Point3, value: number) => {
      state.values[i] = value;
    },
    get values() {
      return [...state.values];
    },
  };
  return voxelManager as unknown as Types.IVoxelManager<number> & {
    values: number[];
  };
}

/**
 * layerA holds segment 1 (label 1) and segment 2 (label 2); layerB holds
 * segment 3 (label 1) - the post-overlap shape produced by a previous
 * segment move.
 */
function createSegmentation(): Segmentation {
  return {
    segmentationId: 'segmentation',
    label: 'Segmentation',
    cachedStats: {},
    segments: {
      1: {
        segmentIndex: 1,
        label: 'S1',
        locked: false,
        cachedStats: {},
        active: false,
      },
      2: {
        segmentIndex: 2,
        label: 'S2',
        locked: false,
        cachedStats: {},
        active: true,
      },
      3: {
        segmentIndex: 3,
        label: 'S3',
        locked: false,
        cachedStats: {},
        active: false,
      },
    },
    representationData: {
      Labelmap: {
        labelmaps: {
          layerA: {
            labelmapId: 'layerA',
            storageKind: 'stack',
            imageIds: ['layerA-image'],
            labelToSegmentIndex: { 1: 1, 2: 2 },
          },
          layerB: {
            labelmapId: 'layerB',
            storageKind: 'stack',
            imageIds: ['layerB-image'],
            labelToSegmentIndex: { 1: 3 },
          },
        },
        segmentBindings: {
          1: { labelmapId: 'layerA', labelValue: 1 },
          2: { labelmapId: 'layerA', labelValue: 2 },
          3: { labelmapId: 'layerB', labelValue: 1 },
        },
      },
    },
  } as unknown as Segmentation;
}

const imageData = {
  indexToWorld: (point: Types.Point3) => point,
} as vtkImageData;

/** Wires cache.getImage to serve the given imageId -> voxelManager map and
 *  makes derived-image creation produce the private layer's image. */
function wireImages(
  images: Record<string, ReturnType<typeof createVoxelManager>>
) {
  mockCache.getImage.mockImplementation((imageId: string) =>
    images[imageId] ? { imageId, voxelManager: images[imageId] } : undefined
  );
  mockImageLoader.createAndCacheDerivedImages.mockImplementation(() => {
    const voxelManager = createVoxelManager(
      new Array(Object.values(images)[0].values.length).fill(0)
    );
    images['private-image'] = voxelManager;
    return [{ imageId: 'private-image', voxelManager }];
  });
}

describe('overlap undo/redo bookkeeping', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('moveSegmentToPrivateLabelmap', () => {
    it('moves the segment voxels and emits a step that reverses the whole move', () => {
      const segmentation = createSegmentation();
      const layerAVoxels = createVoxelManager([1, 2, 2, 0]);
      wireImages({ 'layerA-image': layerAVoxels });

      let moveStep: LabelmapRestoreStep;
      const privateLayer = moveSegmentToPrivateLabelmap(segmentation, 2, {
        moveStepCallback: (step) => (moveStep = step),
      });

      const privateVoxels = () =>
        (
          mockCache.getImage('private-image')?.voxelManager as ReturnType<
            typeof createVoxelManager
          >
        ).values;

      // the move itself: label 2 voxels leave layerA and land as label 1 on
      // the private layer, and the binding follows
      expect(privateLayer.labelmapId).not.toBe('layerA');
      expect(layerAVoxels.values).toEqual([1, 0, 0, 0]);
      expect(privateVoxels()).toEqual([0, 1, 1, 0]);
      expect(getSegmentBinding(segmentation, 2)).toEqual({
        labelmapId: privateLayer.labelmapId,
        labelValue: 1,
      });
      expect(moveStep).toBeDefined();

      // undo: voxels return to layerA, binding restored, private layer gone
      moveStep.undo();
      expect(layerAVoxels.values).toEqual([1, 2, 2, 0]);
      expect(privateVoxels()).toEqual([0, 0, 0, 0]);
      expect(getSegmentBinding(segmentation, 2)).toEqual({
        labelmapId: 'layerA',
        labelValue: 2,
      });
      expect(
        getLabelmap(segmentation, privateLayer.labelmapId)
      ).toBeUndefined();

      // redo: the whole move replays, including re-registering the layer
      moveStep.redo();
      expect(layerAVoxels.values).toEqual([1, 0, 0, 0]);
      expect(privateVoxels()).toEqual([0, 1, 1, 0]);
      expect(getSegmentBinding(segmentation, 2)).toEqual({
        labelmapId: privateLayer.labelmapId,
        labelValue: 1,
      });
      expect(getLabelmap(segmentation, privateLayer.labelmapId)).toBe(
        privateLayer
      );

      // undo/redo stay stable across repeated cycles
      moveStep.undo();
      expect(layerAVoxels.values).toEqual([1, 2, 2, 0]);
      moveStep.redo();
      expect(privateVoxels()).toEqual([0, 1, 1, 0]);
    });

    it('does not emit a step when the segment is already alone on its layer', () => {
      const segmentation = createSegmentation();
      const moveStepCallback = jest.fn();

      const layer = moveSegmentToPrivateLabelmap(segmentation, 3, {
        moveStepCallback,
      });

      expect(layer?.labelmapId).toBe('layerB');
      expect(moveStepCallback).not.toHaveBeenCalled();
    });
  });

  describe('beginLabelmapEditTransaction', () => {
    it('surfaces the move step when the default mover relocates the segment', () => {
      const segmentation = createSegmentation();
      const layerAVoxels = createVoxelManager([1, 2, 0]);
      wireImages({ 'layerA-image': layerAVoxels });

      const transaction = beginLabelmapEditTransaction(segmentation, {
        segmentIndex: 2,
        overwriteSegmentIndices: [],
        segmentationVoxelManager: layerAVoxels,
        segmentationImageData: imageData,
        isInObject: () => true,
      });

      expect(transaction.movedSegment).toBe(true);
      expect(transaction.moveStep).toBeDefined();

      // and the step round-trips
      transaction.moveStep.undo();
      expect(layerAVoxels.values).toEqual([1, 2, 0]);
      expect(getSegmentBinding(segmentation, 2)).toEqual({
        labelmapId: 'layerA',
        labelValue: 2,
      });

      transaction.moveStep.redo();
      expect(layerAVoxels.values).toEqual([1, 0, 0]);
    });

    it('does not surface a move step when overlap is allowed (no move)', () => {
      const segmentation = createSegmentation();
      const layerAVoxels = createVoxelManager([1, 2, 0]);
      wireImages({ 'layerA-image': layerAVoxels });

      const transaction = beginLabelmapEditTransaction(segmentation, {
        segmentIndex: 2,
        // overwrite of the sibling is allowed, so no protection, no move
        overwriteSegmentIndices: [1],
        segmentationVoxelManager: layerAVoxels,
        segmentationImageData: imageData,
        isInObject: () => true,
      });

      expect(transaction.movedSegment).toBe(false);
      expect(transaction.moveStep).toBeUndefined();
    });
  });

  describe('cross-layer erase recording', () => {
    it('reports erased voxels through crossLayerEraseCallback so they can be restored', () => {
      const segmentation = createSegmentation();
      const layerBVoxels = createVoxelManager([1, 1, 0]);
      wireImages({ 'layerB-image': layerBVoxels });

      const viewport = {
        getCurrentImageId: () => 'ref-image',
        getCurrentImageIdIndex: () => 0,
        getImageIds: () => ['ref-image'],
      } as unknown as Types.IStackViewport;

      const records = [];
      const modifiedSlices = eraseLabelmapEditTransactionOverwrites(
        segmentation,
        {
          segmentIndex: 2,
          labelmapId: 'layerA',
          labelValue: 2,
          overwriteSegmentIndices: [3],
          protectedSegmentIndices: [],
          crossLayerEraseBindings: [{ labelmapId: 'layerB', labelValue: 1 }],
          movedSegment: false,
        },
        {
          viewport,
          referenceImageData: imageData,
          isInObject: ([i]) => i < 2,
          crossLayerEraseCallback: (record) => records.push(record),
        }
      );

      expect(modifiedSlices).toEqual([0]);
      expect(layerBVoxels.values).toEqual([0, 0, 0]);
      expect(records).toHaveLength(1);
      expect(records[0].labelValue).toBe(1);
      expect(records[0].indices).toEqual([0, 1]);

      // undo semantics used by the strategy layer: write labelValue back
      records[0].indices.forEach((index) =>
        records[0].voxelManager.setAtIndex(index, records[0].labelValue)
      );
      expect(layerBVoxels.values).toEqual([1, 1, 0]);
    });
  });

  describe('full overlap stroke timeline', () => {
    it('round-trips two strokes where the second moves the segment and erases another layer', () => {
      const segmentation = createSegmentation();
      const layerAVoxels = createVoxelManager([1, 0, 0, 0]);
      const layerBVoxels = createVoxelManager([0, 0, 1, 1]);
      wireImages({
        'layerA-image': layerAVoxels,
        'layerB-image': layerBVoxels,
      });
      const viewport = {
        getCurrentImageId: () => 'ref-image',
        getCurrentImageIdIndex: () => 0,
        getImageIds: () => ['ref-image'],
      } as unknown as Types.IStackViewport;

      // --- stroke 1: segment 2 paints alone on the shared layer ---
      const memoA = createLabelmapMemo(
        'segmentation',
        layerAVoxels
      ) as unknown as LabelmapMemo;
      memoA.voxelManager.setAtIndex(1, 2);
      expect(memoA.commitMemo()).toBe(true);
      const afterStrokeA = [1, 2, 0, 0];
      expect(layerAVoxels.values).toEqual(afterStrokeA);

      // --- stroke 2: segment 2 paints over segment 1 with cross-layer
      // overwrite of segment 3 - segment move + private write + erase ---
      const transaction = beginLabelmapEditTransaction(segmentation, {
        segmentIndex: 2,
        overwriteSegmentIndices: [3],
        segmentationVoxelManager: layerAVoxels,
        segmentationImageData: imageData,
        isInObject: () => true,
      });
      expect(transaction.movedSegment).toBe(true);

      const privateLayerId = transaction.activeLayer.labelmapId;
      const privateVM = mockCache.getImage('private-image')
        .voxelManager as ReturnType<typeof createVoxelManager>;
      // the segment move carried segment 2's stroke-1 voxel to the private layer
      expect(privateVM.values).toEqual([0, 1, 0, 0]);
      expect(layerAVoxels.values).toEqual([1, 0, 0, 0]);

      const memoB = createLabelmapMemo(
        'segmentation',
        privateVM
      ) as unknown as LabelmapMemo;
      (memoB.priorSteps ||= []).push(transaction.moveStep);

      // the stroke's own writes land on the private layer
      memoB.voxelManager.setAtIndex(0, 1);

      // cross-layer erase of segment 3, recorded as a post step - the same
      // wiring crossLayerErase.ts performs
      eraseLabelmapEditTransactionOverwrites(segmentation, transaction, {
        viewport,
        referenceImageData: imageData,
        isInObject: ([i]) => i >= 2,
        crossLayerEraseCallback: ({ voxelManager, labelValue, indices }) => {
          (memoB.postSteps ||= []).push({
            undo: () =>
              indices.forEach((index) =>
                voxelManager.setAtIndex(index, labelValue)
              ),
            redo: () =>
              indices.forEach((index) => voxelManager.setAtIndex(index, 0)),
          });
        },
      });
      expect(layerBVoxels.values).toEqual([0, 0, 0, 0]);
      expect(memoB.commitMemo()).toBe(true);

      const finalPrivate = [1, 1, 0, 0];
      expect(privateVM.values).toEqual(finalPrivate);

      // --- undo stroke 2: private layer gone, segment 2 back on the shared
      // layer with its stroke-1 voxel, segment 3 restored ---
      memoB.restoreMemo(true);
      expect(getLabelmap(segmentation, privateLayerId)).toBeUndefined();
      expect(getSegmentBinding(segmentation, 2)).toEqual({
        labelmapId: 'layerA',
        labelValue: 2,
      });
      expect(layerAVoxels.values).toEqual(afterStrokeA);
      expect(layerBVoxels.values).toEqual([0, 0, 1, 1]);
      expect(privateVM.values).toEqual([0, 0, 0, 0]);

      // --- undo stroke 1: back to the initial state ---
      memoA.restoreMemo(true);
      expect(layerAVoxels.values).toEqual([1, 0, 0, 0]);

      // --- redo both strokes: the exact final state returns ---
      memoA.restoreMemo(false);
      expect(layerAVoxels.values).toEqual(afterStrokeA);

      memoB.restoreMemo(false);
      expect(getLabelmap(segmentation, privateLayerId)).toBe(
        transaction.activeLayer
      );
      expect(getSegmentBinding(segmentation, 2)).toEqual({
        labelmapId: privateLayerId,
        labelValue: 1,
      });
      expect(layerAVoxels.values).toEqual([1, 0, 0, 0]);
      expect(privateVM.values).toEqual(finalPrivate);
      expect(layerBVoxels.values).toEqual([0, 0, 0, 0]);
    });
  });
});
