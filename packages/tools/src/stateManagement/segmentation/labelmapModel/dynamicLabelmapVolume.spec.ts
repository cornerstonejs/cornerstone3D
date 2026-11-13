import { cache, eventTarget, imageLoader, metaData } from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';
import {
  createDynamicLabelmapVolume,
  getDynamicLabelmapTimePoint,
  syncDynamicLabelmapVolume,
} from './dynamicLabelmapVolume';
import { getOrCreateDynamicLabelmapVolume } from './labelmapLayerStore';
import { computeStackLabelmapFromVolume } from '../helpers/computeStackLabelmapFromVolume';
import { createLabelmapMemo } from '../../../utilities/segmentation/createLabelmapMemo';
import type { LabelmapMemo } from '../../../utilities/segmentation/createLabelmapMemo';
import addSegmentations from '../addSegmentations';
import { getSegmentation } from '../getSegmentation';
import { removeAllSegmentations } from '../removeSegmentation';
import dynamicVolumeDimensionGroupChangedListener from '../../../eventListeners/segmentation/dynamicVolumeDimensionGroupChangedListener';
import { Events } from '../../../enums';
import type { Segmentation } from '../../../types/SegmentationStateTypes';

const TIME_POINTS = 2;
// Unsorted on purpose: the volume sorts each time point by position.
const POSITIONS = [2, 0, 1];

const ids = (prefix: string, timePoints = TIME_POINTS) =>
  Array.from({ length: timePoints }, (_, t) =>
    POSITIONS.map((z) => `${prefix}:${t}:${z}`)
  ).flat();

function provider(type: string, imageId: string) {
  const [prefix, t, z] = imageId.split(':');

  if (type === 'imagePlaneModule') {
    return {
      imagePositionPatient: [0, 0, Number(z)],
      imageOrientationPatient: [1, 0, 0, 0, 1, 0],
      pixelSpacing: [1, 1],
      rows: 2,
      columns: 2,
      frameOfReferenceUID: 'for',
    };
  }
  if (type === 'imagePixelModule') {
    return {
      bitsAllocated: 8,
      bitsStored: 8,
      highBit: 7,
      pixelRepresentation: 0,
      photometricInterpretation: 'MONOCHROME2',
      samplesPerPixel: 1,
    };
  }
  if (type === 'generalSeriesModule') {
    return { modality: 'SEG', seriesInstanceUID: 'series' };
  }
  if (type === 'TemporalPositionIdentifier' && prefix.startsWith('ref')) {
    return Number(t) + 1;
  }
}

/** The part of a dynamic image volume that the sync reads. */
const imageVolumeAt = (timePoint: number) =>
  ({
    getCurrentDimensionGroupImageIds: () =>
      POSITIONS.map((z) => `ref:${timePoint}:${z}`),
  }) as unknown as Types.IImageVolume;

/** Caches one 2x2 labelmap image for each referenced image. */
function cacheLabelmapImages(timePoints = TIME_POINTS) {
  ids('lm', timePoints).forEach((imageId, i) =>
    imageLoader.createAndCacheLocalImage(imageId, {
      dimensions: [2, 2],
      spacing: [1, 1, 1],
      origin: [0, 0, 0],
      direction: [1, 0, 0, 0, 1, 0, 0, 0, 1],
      scalarData: new Uint8Array(4),
      referencedImageId: ids('ref', timePoints)[i],
    })
  );
}

const pixel = (imageId: string) =>
  cache.getImage(imageId).voxelManager.getAtIndex(0);

describe('dynamic labelmap volume', () => {
  beforeEach(() => metaData.addProvider(provider, 10000));
  afterEach(() => {
    removeAllSegmentations();
    metaData.removeProvider(provider);
    cache.purgeCache();
  });

  it('is one volume of one time point that follows the image volume', () => {
    const volume = createDynamicLabelmapVolume('labelmap-4d', {
      labelmapId: 'labelmap',
      imageIds: ids('lm'),
      referencedImageIds: ids('ref'),
    });

    expect(cache.getVolume('labelmap-4d')).toBe(volume);
    expect(volume.dimensions).toEqual([2, 2, 3]);
    expect(volume.isDynamicVolume()).toBe(false);
    expect(volume.imageIds).toEqual(['lm:0:0', 'lm:0:1', 'lm:0:2']);

    expect(syncDynamicLabelmapVolume(volume, imageVolumeAt(1))).toBe(true);
    expect(volume.imageIds).toEqual(['lm:1:0', 'lm:1:1', 'lm:1:2']);
    expect(volume.referencedImageIds).toEqual([
      'ref:1:0',
      'ref:1:1',
      'ref:1:2',
    ]);

    expect(syncDynamicLabelmapVolume(volume, imageVolumeAt(1))).toBe(false);
  });

  it('leaves a 3D labelmap to the static volume', () => {
    expect(
      createDynamicLabelmapVolume('labelmap-3d', {
        labelmapId: 'labelmap',
        imageIds: ids('lm', 1),
        referencedImageIds: ids('ref', 1),
      })
    ).toBeUndefined();
  });

  it('restores the time point of an edit after a change of time point', () => {
    cacheLabelmapImages();
    const volume = createDynamicLabelmapVolume('labelmap-4d', {
      labelmapId: 'labelmap',
      imageIds: ids('lm'),
      referencedImageIds: ids('ref'),
    });
    cache.getImage('lm:1:0').voxelManager.setAtIndex(0, 3);

    const timePoint = getDynamicLabelmapTimePoint(volume);
    expect(timePoint.dimensionGroupNumber).toBe(1);
    const memo = createLabelmapMemo(
      'segmentation',
      timePoint.voxelManager
    ) as unknown as LabelmapMemo;
    memo.voxelManager.setAtIndex(0, 1);
    memo.commitMemo();

    // The paint shows only at its own time point.
    expect(pixel('lm:0:0')).toBe(1);
    expect(pixel('lm:1:0')).toBe(3);

    syncDynamicLabelmapVolume(volume, imageVolumeAt(1));
    memo.restoreMemo(true);

    expect(pixel('lm:0:0')).toBe(0);
    expect(pixel('lm:1:0')).toBe(3);
  });

  it('keeps every time point in a conversion back to a stack', async () => {
    cacheLabelmapImages();
    createDynamicLabelmapVolume('labelmap-4d', {
      labelmapId: 'labelmap',
      imageIds: ids('lm'),
      referencedImageIds: ids('ref'),
    });

    const { imageIds } = await computeStackLabelmapFromVolume({
      volumeId: 'labelmap-4d',
    });

    expect([...imageIds].sort()).toEqual([...ids('lm')].sort());
  });

  it('creates no volume for a 3D labelmap', () => {
    cacheLabelmapImages(1);
    const segmentation = {
      segmentationId: 'seg-3d',
      representationData: {
        Labelmap: {
          imageIds: ids('lm', 1),
          referencedImageIds: ids('ref', 1),
        },
      },
      segments: {},
    } as unknown as Segmentation;

    expect(getOrCreateDynamicLabelmapVolume(segmentation)).toBeUndefined();
    expect(getOrCreateDynamicLabelmapVolume(segmentation)).toBeUndefined();
    expect(cache.getVolumes()).toHaveLength(0);
  });

  it('sends the time point when the image volume changes time point', () => {
    cacheLabelmapImages();
    addSegmentations([
      {
        segmentationId: 'seg-4d',
        representation: {
          type: 'Labelmap' as never,
          data: { imageIds: ids('lm'), referencedImageIds: ids('ref') },
        },
      },
    ]);
    const volume = getOrCreateDynamicLabelmapVolume(getSegmentation('seg-4d'));
    expect(volume).toBeDefined();

    const imageVolume = {
      ...imageVolumeAt(1),
      dimensionGroupNumber: 2,
      getImageURIIndex: () => -1,
    };
    const getVolume = cache.getVolume.bind(cache);
    jest
      .spyOn(cache, 'getVolume')
      .mockImplementation((id) =>
        id === 'image-4d' ? (imageVolume as never) : getVolume(id)
      );
    const details = [];
    const onModified = (evt) => details.push(evt.detail);
    eventTarget.addEventListener(Events.SEGMENTATION_DATA_MODIFIED, onModified);

    dynamicVolumeDimensionGroupChangedListener({
      detail: { volumeId: 'image-4d' },
    } as CustomEvent);

    eventTarget.removeEventListener(
      Events.SEGMENTATION_DATA_MODIFIED,
      onModified
    );
    jest.restoreAllMocks();
    expect(details).toEqual([
      expect.objectContaining({
        segmentationId: 'seg-4d',
        dimensionGroupNumber: 2,
      }),
    ]);
    expect(details[0].voxelsUnchanged).toBeUndefined();
  });
});
