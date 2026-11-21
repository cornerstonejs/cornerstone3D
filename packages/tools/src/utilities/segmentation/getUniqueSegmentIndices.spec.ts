import {
  cache,
  Enums,
  imageLoader,
  metaData,
  volumeLoader,
} from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';
import { getUniqueSegmentIndices } from './getUniqueSegmentIndices';
import addSegmentations from '../../stateManagement/segmentation/addSegmentations';
import { getSegmentation } from '../../stateManagement/segmentation/getSegmentation';
import { removeAllSegmentations } from '../../stateManagement/segmentation/removeSegmentation';
import { removeSegment } from '../../stateManagement/segmentation/removeSegment';
import { setActiveSegmentIndex } from '../../stateManagement/segmentation/segmentIndex';
import { triggerSegmentationDataModified } from '../../stateManagement/segmentation/triggerSegmentationEvents';
import { clearSegmentValue } from '../../stateManagement/segmentation/helpers/clearSegmentValue';
import {
  getOrCreateDynamicLabelmapVolume,
  registerLabelmap,
  setSegmentBinding,
} from '../../stateManagement/segmentation/labelmapModel';
import dynamicVolumeDimensionGroupChangedListener from '../../eventListeners/segmentation/dynamicVolumeDimensionGroupChangedListener';

const SIZE = 4;
const FRAME = SIZE * SIZE;
const TIME_POINTS = 2;
const POSITIONS = [0, 1, 2];

const ids = (prefix: string, timePoints = 1) =>
  Array.from({ length: timePoints }, (_, t) =>
    POSITIONS.map((z) => `${prefix}:${t}:${z}`)
  ).flat();

/** Metadata of a series of 4 x 4 frames, a 4D series for the `ref4d` prefix. */
function provider(type: string, imageId: string) {
  const [prefix, t, z] = imageId.split(':');

  if (type === 'imagePlaneModule') {
    return {
      imagePositionPatient: [0, 0, Number(z)],
      imageOrientationPatient: [1, 0, 0, 0, 1, 0],
      pixelSpacing: [1, 1],
      rows: SIZE,
      columns: SIZE,
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
  if (type === 'TemporalPositionIdentifier' && prefix === 'ref4d') {
    return Number(t) + 1;
  }
}

/** Caches one labelmap frame for each image id, RLE when asked. */
function cacheLabelmapImages(
  imageIds: string[],
  referencedImageIds: string[],
  voxelRepresentation?: Enums.VoxelManagerEnum
) {
  imageIds.forEach((imageId, index) =>
    imageLoader.createAndCacheLocalImage(imageId, {
      dimensions: [SIZE, SIZE],
      spacing: [1, 1],
      origin: [0, 0, index],
      direction: [1, 0, 0, 0, 1, 0, 0, 0, 1],
      scalarData: new Uint8Array(FRAME),
      referencedImageId: referencedImageIds[index],
      voxelRepresentation,
    })
  );
}

const voxels = (imageId: string): Types.IVoxelManager<number> =>
  cache.getImage(imageId).voxelManager as Types.IVoxelManager<number>;

function addStackSegmentation(
  segmentationId: string,
  imageIds: string[],
  referencedImageIds: string[]
) {
  addSegmentations([
    {
      segmentationId,
      representation: {
        type: 'Labelmap' as never,
        data: { imageIds, referencedImageIds },
      },
    },
  ]);
}

describe('getUniqueSegmentIndices', () => {
  beforeEach(() => metaData.addProvider(provider, 10000));
  afterEach(() => {
    removeAllSegmentations();
    metaData.removeProvider(provider);
    cache.purgeCache();
  });

  it('gives the segments of a stack labelmap that have voxels', () => {
    cacheLabelmapImages(ids('lm'), ids('ref'));
    addStackSegmentation('seg-stack', ids('lm'), ids('ref'));
    setActiveSegmentIndex('seg-stack', 1);
    setActiveSegmentIndex('seg-stack', 2);
    setActiveSegmentIndex('seg-stack', 3);
    voxels('lm:0:0').setAtIndex(5, 1);
    voxels('lm:0:2').setAtIndex(FRAME - 1, 2);
    triggerSegmentationDataModified('seg-stack');

    expect(getUniqueSegmentIndices('seg-stack')).toEqual([1, 2]);
  });

  it('gives a segment that has voxels and no entry in the segment list', () => {
    cacheLabelmapImages(ids('lm'), ids('ref'));
    addStackSegmentation('seg-loaded', ids('lm'), ids('ref'));
    voxels('lm:0:1').setAtIndex(0, 7);
    triggerSegmentationDataModified('seg-loaded');

    expect(getUniqueSegmentIndices('seg-loaded')).toEqual([7]);
  });

  it('leaves out the voxels of a brush preview, unless 255 is a segment', () => {
    cacheLabelmapImages(ids('lm'), ids('ref'));
    addStackSegmentation('seg-preview', ids('lm'), ids('ref'));
    setActiveSegmentIndex('seg-preview', 1);
    voxels('lm:0:0').setAtIndex(0, 1);
    voxels('lm:0:1').setAtIndex(3, 255);
    triggerSegmentationDataModified('seg-preview');

    expect(getUniqueSegmentIndices('seg-preview')).toEqual([1]);

    setActiveSegmentIndex('seg-preview', 255);

    expect(getUniqueSegmentIndices('seg-preview')).toEqual([1, 255]);
  });

  it('drops a segment after an erase and gives it back after a new stroke', () => {
    cacheLabelmapImages(ids('lm'), ids('ref'));
    addStackSegmentation('seg-erase', ids('lm'), ids('ref'));
    voxels('lm:0:0').setAtIndex(1, 1);
    voxels('lm:0:1').setAtIndex(2, 2);
    triggerSegmentationDataModified('seg-erase');
    expect(getUniqueSegmentIndices('seg-erase')).toEqual([1, 2]);

    voxels('lm:0:1').setAtIndex(2, 0);
    triggerSegmentationDataModified('seg-erase', [1], 2);
    expect(getUniqueSegmentIndices('seg-erase')).toEqual([1]);

    voxels('lm:0:2').setAtIndex(3, 2);
    triggerSegmentationDataModified('seg-erase', [2], 2);
    expect(getUniqueSegmentIndices('seg-erase')).toEqual([1, 2]);
  });

  it('reads voxels written without a SEGMENTATION_DATA_MODIFIED', () => {
    cacheLabelmapImages(ids('lm'), ids('ref'));
    addStackSegmentation('seg-silent', ids('lm'), ids('ref'));
    voxels('lm:0:0').setAtIndex(1, 1);
    triggerSegmentationDataModified('seg-silent');
    expect(getUniqueSegmentIndices('seg-silent')).toEqual([1]);

    voxels('lm:0:2').setAtIndex(1, 2);
    expect(getUniqueSegmentIndices('seg-silent')).toEqual([1, 2]);

    voxels('lm:0:0').setAtIndex(1, 0);
    expect(getUniqueSegmentIndices('seg-silent')).toEqual([2]);
  });

  it('drops a cleared segment and a removed segment', () => {
    cacheLabelmapImages(ids('lm'), ids('ref'));
    addStackSegmentation('seg-clear', ids('lm'), ids('ref'));
    [1, 2, 3].forEach((segmentIndex) => {
      setActiveSegmentIndex('seg-clear', segmentIndex);
      voxels('lm:0:0').setAtIndex(segmentIndex, segmentIndex);
    });
    triggerSegmentationDataModified('seg-clear');
    expect(getUniqueSegmentIndices('seg-clear')).toEqual([1, 2, 3]);

    clearSegmentValue('seg-clear', 2);
    expect(getUniqueSegmentIndices('seg-clear')).toEqual([1, 3]);

    removeSegment('seg-clear', 3);
    expect(getUniqueSegmentIndices('seg-clear')).toEqual([1]);
  });

  it('reads an RLE stack labelmap', () => {
    cacheLabelmapImages(ids('lm'), ids('ref'), Enums.VoxelManagerEnum.RLE);
    addStackSegmentation('seg-rle', ids('lm'), ids('ref'));
    setActiveSegmentIndex('seg-rle', 4);
    voxels('lm:0:1').setAtIndex(6, 2);
    voxels('lm:0:2').setAtIndex(7, 3);
    triggerSegmentationDataModified('seg-rle');

    expect(voxels('lm:0:1').getWritableScalarData()).toBeUndefined();
    expect(getUniqueSegmentIndices('seg-rle')).toEqual([2, 3]);
  });

  it('reads a volume labelmap made of images', () => {
    cacheLabelmapImages(ids('lm'), ids('ref'));
    const volume = volumeLoader.createAndCacheVolumeFromImagesSync(
      'labelmap-volume',
      ids('lm')
    );
    addSegmentations([
      {
        segmentationId: 'seg-volume',
        representation: {
          type: 'Labelmap' as never,
          data: { volumeId: volume.volumeId },
        },
      },
    ]);
    setActiveSegmentIndex('seg-volume', 1);
    setActiveSegmentIndex('seg-volume', 2);
    volume.voxelManager.setAtIJK(1, 1, 2, 2);
    triggerSegmentationDataModified('seg-volume');

    expect(getUniqueSegmentIndices('seg-volume')).toEqual([2]);
  });

  it('reads a volume labelmap that holds its own array', () => {
    const scalarData = new Uint8Array(FRAME * POSITIONS.length);
    scalarData[FRAME + 3] = 5;
    scalarData[scalarData.length - 1] = 1;
    const volume = volumeLoader.createLocalVolume('labelmap-array', {
      metadata: {} as Types.Metadata,
      dimensions: [SIZE, SIZE, POSITIONS.length],
      spacing: [1, 1, 1],
      origin: [0, 0, 0],
      direction: [1, 0, 0, 0, 1, 0, 0, 0, 1],
      scalarData,
    });
    addSegmentations([
      {
        segmentationId: 'seg-array',
        representation: {
          type: 'Labelmap' as never,
          data: { volumeId: volume.volumeId },
        },
      },
    ]);
    setActiveSegmentIndex('seg-array', 2);
    triggerSegmentationDataModified('seg-array');

    expect(getUniqueSegmentIndices('seg-array')).toEqual([1, 5]);
  });

  it('reads the last voxels of an array of two-byte values of odd length', () => {
    const scalarData = new Uint16Array(27);
    scalarData[1] = 300;
    scalarData[26] = 9;
    const volume = volumeLoader.createLocalVolume('labelmap-odd', {
      metadata: {} as Types.Metadata,
      dimensions: [3, 3, 3],
      spacing: [1, 1, 1],
      origin: [0, 0, 0],
      direction: [1, 0, 0, 0, 1, 0, 0, 0, 1],
      scalarData,
    });
    addSegmentations([
      {
        segmentationId: 'seg-odd',
        representation: {
          type: 'Labelmap' as never,
          data: { volumeId: volume.volumeId },
        },
      },
    ]);

    expect(getUniqueSegmentIndices('seg-odd')).toEqual([9, 300]);
  });

  it('maps the label values of each layer to their segments', () => {
    cacheLabelmapImages(ids('lm'), ids('ref'));
    cacheLabelmapImages(ids('private'), ids('ref'));
    addStackSegmentation('seg-layers', ids('lm'), ids('ref'));
    setActiveSegmentIndex('seg-layers', 1);
    const segmentation = getSegmentation('seg-layers');
    registerLabelmap(segmentation, {
      labelmapId: 'private',
      storageKind: 'stack',
      imageIds: ids('private'),
      referencedImageIds: ids('ref'),
    });
    setSegmentBinding(segmentation, 6, {
      labelmapId: 'private',
      labelValue: 1,
    });
    voxels('private:0:1').setAtIndex(4, 1);
    triggerSegmentationDataModified('seg-layers');

    expect(getUniqueSegmentIndices('seg-layers')).toEqual([6]);

    voxels('lm:0:0').setAtIndex(4, 1);
    triggerSegmentationDataModified('seg-layers');

    expect(getUniqueSegmentIndices('seg-layers')).toEqual([1, 6]);
  });

  it('gives the segments of the time point on display of a 4D labelmap', () => {
    cacheLabelmapImages(ids('lm4d', TIME_POINTS), ids('ref4d', TIME_POINTS));
    addStackSegmentation(
      'seg-4d',
      ids('lm4d', TIME_POINTS),
      ids('ref4d', TIME_POINTS)
    );
    voxels('lm4d:0:1').setAtIndex(0, 1);
    voxels('lm4d:1:2').setAtIndex(0, 2);
    triggerSegmentationDataModified('seg-4d');

    expect(getUniqueSegmentIndices('seg-4d')).toEqual([1]);
    expect(
      getOrCreateDynamicLabelmapVolume(getSegmentation('seg-4d'))
    ).toBeDefined();

    const imageVolume = {
      getCurrentDimensionGroupImageIds: () =>
        POSITIONS.map((z) => `ref4d:1:${z}`),
      dimensionGroupNumber: 2,
      getImageURIIndex: () => -1,
    };
    const getVolume = cache.getVolume.bind(cache);
    jest
      .spyOn(cache, 'getVolume')
      .mockImplementation((id) =>
        id === 'image-4d' ? (imageVolume as never) : getVolume(id)
      );
    dynamicVolumeDimensionGroupChangedListener({
      detail: { volumeId: 'image-4d' },
    } as CustomEvent);

    expect(getUniqueSegmentIndices('seg-4d')).toEqual([2]);
    jest.restoreAllMocks();
  });
});
