import * as cornerstone3D from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';

const { utilities, cache, imageLoader, volumeLoader, metaData } = cornerstone3D;

const renderingEngineId = utilities.uuidv4();
const ROWS = 16;
const COLUMNS = 16;

/**
 * The largest value of each image of the series of the tests, as the MR of
 * OHIF M65: 12 bits stored, the first, the middle and the last images of the
 * sorted series below 256, and one image above.
 */
const LARGEST_VALUES = [135, 90, 637, 300, 45, 120, 80, 45];

/** The image ids of a series, with the bits of its pixel module. */
function createImageIds(name, { bitsAllocated = 16, bitsStored = 12 } = {}) {
  return LARGEST_VALUES.map(
    (largestValue, sliceIndex) =>
      `seriesArrayType:${JSON.stringify({
        name,
        sliceIndex,
        largestValue,
        bitsAllocated,
        bitsStored,
      })}`
  );
}

/** The fields that an image id of the tests holds. */
function infoOf(imageId) {
  return JSON.parse(imageId.slice('seriesArrayType:'.length));
}

/**
 * A loader as the DICOM image loader: without a target buffer (a stack) an
 * image gets the smallest array that holds its own values, a Uint8Array for
 * values below 256; with one (a volume) it gets the array of the target
 * buffer. The values of an image rise along its rows up to its largest value.
 */
function seriesImageLoader(imageId, options = {}) {
  const { largestValue } = infoOf(imageId);
  const length = ROWS * COLUMNS;
  const type =
    options.targetBuffer?.type ??
    (largestValue <= 255 ? 'Uint8Array' : 'Uint16Array');
  const pixelData = new globalThis[type](length);

  for (let index = 0; index < length; index++) {
    pixelData[index] = Math.round((largestValue * index) / (length - 1));
  }

  const voxelManager = utilities.VoxelManager.createImageVoxelManager({
    height: ROWS,
    width: COLUMNS,
    numberOfComponents: 1,
    scalarData: pixelData,
  });

  return {
    promise: Promise.resolve({
      imageId,
      rows: ROWS,
      columns: COLUMNS,
      width: COLUMNS,
      height: ROWS,
      intercept: 0,
      slope: 1,
      minPixelValue: 0,
      maxPixelValue: largestValue,
      windowCenter: 128,
      windowWidth: 256,
      rowPixelSpacing: 1,
      columnPixelSpacing: 1,
      voxelManager,
      getPixelData: () => voxelManager.getScalarData(),
      sizeInBytes: pixelData.byteLength,
      imageFrame: { photometricInterpretation: 'MONOCHROME2' },
    }),
  };
}

/** The metadata of the images of the tests: an axial MR series. */
function seriesMetadataProvider(type, imageId) {
  if (typeof imageId !== 'string' || !imageId.startsWith('seriesArrayType:')) {
    return;
  }

  const { sliceIndex, bitsAllocated, bitsStored } = infoOf(imageId);

  switch (type) {
    case 'imagePixelModule':
      return {
        samplesPerPixel: 1,
        photometricInterpretation: 'MONOCHROME2',
        rows: ROWS,
        columns: COLUMNS,
        bitsAllocated,
        bitsStored,
        highBit: bitsStored - 1,
        pixelRepresentation: 0,
      };
    case 'imagePlaneModule':
      return {
        rows: ROWS,
        columns: COLUMNS,
        imageOrientationPatient: [1, 0, 0, 0, 1, 0],
        rowCosines: [1, 0, 0],
        columnCosines: [0, 1, 0],
        imagePositionPatient: [0, 0, sliceIndex * 2],
        pixelSpacing: [1, 1],
        rowPixelSpacing: 1,
        columnPixelSpacing: 1,
        frameOfReferenceUID: 'seriesArrayTypeFrame',
      };
    case 'generalSeriesModule':
      return { modality: 'MR', seriesInstanceUID: 'seriesArrayType' };
    case 'modalityLutModule':
      return { rescaleSlope: 1, rescaleIntercept: 0 };
    case 'voiLutModule':
      return { windowCenter: 128, windowWidth: 256 };
  }
}

/** Loads the images of a series as a stack does, into the image cache. */
function loadAsStack(imageIds) {
  return Promise.all(
    imageIds.map((imageId) => imageLoader.loadAndCacheImage(imageId))
  );
}

/** The largest value of an array. */
function largestOf(array) {
  let largest = -Infinity;

  for (let index = 0; index < array.length; index++) {
    largest = Math.max(largest, array[index]);
  }

  return largest;
}

/** Resolves when the volume has loaded every image. */
function loadVolume(volume) {
  return new Promise((resolve) => {
    volume.load(() => resolve());
  });
}

describe('The array type of a volume comes from what its series can hold -- ', () => {
  beforeEach(function () {
    testUtils.setupTestEnvironment({ renderingEngineId, toolGroupIds: [] });
    imageLoader.registerImageLoader('seriesArrayType', seriesImageLoader);
    metaData.addProvider(seriesMetadataProvider, 30000);
  });

  afterEach(function () {
    metaData.removeProvider(seriesMetadataProvider);
    testUtils.cleanupTestEnvironment({ renderingEngineId, toolGroupIds: [] });
  });

  it('a stack of 12 bit images whose first, middle and last images fit in 8 bits makes a Uint16Array volume that holds every value', async function () {
    const imageIds = createImageIds('stackToVolume');
    const images = await loadAsStack(imageIds);

    expect(images.map((image) => image.getPixelData().constructor.name))
      .withContext('the stack loader gives each image the smallest array')
      .toEqual([
        'Uint8Array',
        'Uint8Array',
        'Uint16Array',
        'Uint16Array',
        'Uint8Array',
        'Uint8Array',
        'Uint8Array',
        'Uint8Array',
      ]);

    const volume = volumeLoader.createAndCacheVolumeFromImagesSync(
      'seriesArrayType:stackToVolume',
      imageIds
    );
    const scalarData = volume.voxelManager.getCompleteScalarDataArray();

    expect(volume.dataType).toBe('Uint16Array');
    expect(scalarData.constructor.name).toBe('Uint16Array');
    expect(largestOf(scalarData)).toBe(637);
    expect(volume.voxelManager.getRange()).toEqual([0, 637]);
  });

  it('a streaming volume of that series made while its first, middle and last images are in the cache is a Uint16Array volume that holds every value', async function () {
    const imageIds = createImageIds('streaming');

    await loadAsStack([imageIds[0], imageIds[4], imageIds[7]]);

    const volume = await volumeLoader.createAndCacheVolume(
      'cornerstoneStreamingImageVolume:seriesArrayTypeStreaming',
      { imageIds }
    );

    await loadVolume(volume);

    const scalarData = volume.voxelManager.getCompleteScalarDataArray();

    expect(volume.dataType).toBe('Uint16Array');
    expect(scalarData.constructor.name).toBe('Uint16Array');
    expect(largestOf(scalarData)).toBe(637);
  });

  it('a series whose metadata says 8 bits allocated, or 16 allocated and 8 stored, makes a Uint8Array volume', async function () {
    for (const [name, bits] of [
      ['eightAllocated', { bitsAllocated: 8, bitsStored: 8 }],
      ['eightStored', { bitsAllocated: 16, bitsStored: 8 }],
    ]) {
      const imageIds = createImageIds(name, bits).map((imageId) =>
        imageId.replace(/"largestValue":\d+/, '"largestValue":200')
      );

      await loadAsStack(imageIds);

      const volume = volumeLoader.createAndCacheVolumeFromImagesSync(
        `seriesArrayType:${name}`,
        imageIds
      );

      expect(volume.dataType).withContext(name).toBe('Uint8Array');
    }
  });

  it('a volume of derived images keeps the array type of the images', async function () {
    const imageIds = createImageIds('derived');

    await loadAsStack(imageIds);

    for (const type of [
      'Uint8Array',
      'Uint16Array',
      'Int16Array',
      'Float32Array',
    ]) {
      const derivedImageIds = imageLoader
        .createAndCacheDerivedImages(imageIds, { targetBuffer: { type } })
        .map(({ imageId }) => imageId);
      const volume = volumeLoader.createAndCacheVolumeFromImagesSync(
        `derivedArrayType:${type}`,
        derivedImageIds
      );

      expect(volume.dataType).withContext(type).toBe(type);
      expect(volume.voxelManager.getCompleteScalarDataArray().constructor.name)
        .withContext(type)
        .toBe(type);
    }
  });

  it('a derived labelmap volume of the volume of that series is a Uint8Array volume', async function () {
    const imageIds = createImageIds('labelmap');

    await loadAsStack(imageIds);
    volumeLoader.createAndCacheVolumeFromImagesSync(
      'seriesArrayType:labelmapSource',
      imageIds
    );

    const labelmap = volumeLoader.createAndCacheDerivedLabelmapVolume(
      'seriesArrayType:labelmapSource',
      { volumeId: 'seriesArrayType:labelmap' }
    );

    expect(labelmap.dataType).toBe('Uint8Array');
    expect(cache.getVolume('seriesArrayType:labelmapSource').dataType).toBe(
      'Uint16Array'
    );
  });
});
