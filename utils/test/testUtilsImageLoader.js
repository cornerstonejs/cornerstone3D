import {
  getVerticalBarImage,
  getVerticalBarRGBImage,
} from './testUtilsPixelData';

/**
 * It creates an image based on the imageId name for testing purposes. It splits the imageId
 * based on "_" and deciphers each field of scheme, rows, columns, barStart, barWidth, x_spacing, y_spacing, rgb, and PT.
 * fakeLoader: myImage_64_64_10_20_1_1_0 will load a grayscale test image of size 64 by
 * 64 and with a vertical bar which starts at 10th pixel and span 20 pixels
 * width, with pixel spacing of 1 mm and 1 mm in x and y direction.
 *
 * fakeImageLoader should be registered for each test image:
 *
 * @example
 * ```javascript
 * imageLoader.registerImageLoader('fakeImageLoader', imageLoader)
 * ```
 *
 * then you can use imageId like: 'fakeImageLoader: myImage_64_64_10_20_1_1_0'
 *
 * @param {imageId} imageId
 * @returns Promise that resolves to the image
 */
const fakeImageLoader = (imageId) => {
  const imageURI = imageId.split(':')[1];
  const [_, rows, columns, barStart, barWidth, x_spacing, y_spacing, rgb, PT] =
    imageURI.split('_').map((v) => parseFloat(v));

  let pixelData;

  if (rgb) {
    pixelData = getVerticalBarRGBImage(rows, columns, barStart, barWidth);
  } else {
    pixelData = getVerticalBarImage(rows, columns, barStart, barWidth);
  }

  // Todo: separated fakeImageLoader for cpu and gpu
  const image = {
    rows,
    columns,
    width: columns,
    height: rows,
    imageId,
    intercept: 0,
    slope: 1,
    invert: false,
    windowCenter: 40,
    windowWidth: 400,
    maxPixelValue: 255,
    minPixelValue: 0,
    rowPixelSpacing: y_spacing,
    columnPixelSpacing: x_spacing,
    getPixelData: () => pixelData,
    sizeInBytes: rows * columns * 1, // 1 byte for now
    FrameOfReferenceUID: 'Stack_Frame_Of_Reference',
  };

  return {
    promise: Promise.resolve(image),
  };
};

/**
 * Returns the requested metadata for the imageId
 *
 * Note: fakeMetadataLoader should be added as a provider for each test
 *
 * ```javascript
 * metaData.addProvider(fakeMetaDataProvider, 10000)
 * ```
 *
 *
 *
 * @param {string} type - metadata type
 * @param {string} imageId - the imageId
 * @returns metadata based on the imageId and type
 */
function fakeMetaDataProvider(type, imageId) {
  if (typeof imageId !== 'string') {
    throw new Error(
      `Expected imageId to be of type string, but received ${imageId}`
    );
  }
  const imageURI = imageId.split(':')[1];
  const [_, rows, columns, barStart, barWidth, x_spacing, y_spacing, rgb, PT] =
    imageURI.split('_').map((v) => parseFloat(v));

  const modality = PT ? 'PT' : 'MR';
  const photometricInterpretation = rgb ? 'RGB' : 'MONOCHROME2';
  if (type === 'imagePixelModule') {
    const imagePixelModule = {
      photometricInterpretation,
      rows,
      columns,
      samplesPerPixel: rgb ? 3 : 1,
      bitsAllocated: rgb ? 24 : 8,
      bitsStored: rgb ? 24 : 8,
      highBit: rgb ? 24 : 8,
      pixelRepresentation: 0,
    };

    return imagePixelModule;
  } else if (type === 'generalSeriesModule') {
    const generalSeriesModule = {
      modality: modality,
    };
    return generalSeriesModule;
  } else if (type === 'scalingModule') {
    const scalingModule = {
      suvbw: 100,
      suvlbm: 100,
      suvbsa: 100,
    };
    return scalingModule;
  } else if (type === 'imagePlaneModule') {
    const imagePlaneModule = {
      rows,
      columns,
      width: rows,
      height: columns,
      imageOrientationPatient: [1, 0, 0, 0, 1, 0],
      rowCosines: [1, 0, 0],
      columnCosines: [0, 1, 0],
      imagePositionPatient: [0, 0, 0],
      pixelSpacing: [x_spacing, y_spacing],
      rowPixelSpacing: y_spacing,
      columnPixelSpacing: x_spacing,
    };

    return imagePlaneModule;
  } else if (type === 'voiLutModule') {
    return {
      windowWidth: undefined,
      windowCenter: undefined,
    };
  } else if (type === 'modalityLutModule') {
    return {
      rescaleSlope: undefined,
      rescaleIntercept: undefined,
    };
  }
}

export { fakeImageLoader, fakeMetaDataProvider };
