import vtkDataArray from '@kitware/vtk.js/Common/Core/DataArray';
import vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';
import {
  ImageVolume,
  cache,
  volumeLoader,
  utilities,
} from '@cornerstonejs/core';
import {
  getVerticalBarImages,
  getExactRegionImages,
  getVerticalBarRGBImages,
} from './testUtilsPixelData';
import { decodeVolumeIdInfo, colors, encodeImageIdInfo } from './testUtils';

/**
 * It creates a volume based on the volumeId info for testing purposes. The volumeId is encoded
 * with JSON-stringified object containing the following properties:
 * [ loader, name, rows, columns, slices, xSpacing, ySpacing, zSpacing, rgb, pt ]
 *
 * If name is not equal to "volumeURIExact", then the volume is created with the
 * provided rows, columns, and slices, with spacing in x, y, and z direction, and with
 * each slice having one vertical bar spanning [width/slices] of the image. So for instance
 * a volumeId encoding { name: 'volumeURI', rows: 100, columns: 100, slices: 10, xSpacing: 1, ySpacing: 1, zSpacing: 1, rgb: 0 }
 * will generate a volume of size 100 by 100 by 10 with spacing of 1 mm in x, y, and z direction.
 * The volume will have 10 slices, and first slice will have a vertical bar spanning 10 pixels
 * in the first 10% of the image (since there are 10 slices), the second slice will have a
 * vertical bar of value 255 spanning 10 pixels in the second 10% of the image, and so on.
 *
 * If "volumeURIExact" is provided as the name, there will be no automatic generation of the vertical bars
 * for each slice and the volume will be created with an exact region specified.
 *
 * If rgb is true, then the volume will be created with RGB values.
 *
 * Note: fakeVolumeLoader should be registered for each test
 *
 * @example
 * ```
 * registerVolumeLoader('fakeVolumeLoader', fakeVolumeLoader)
 * ````
 *
 * @param {string} volumeId - Encoded volume information
 * @returns Promise that resolves to the image volume
 */
const fakeVolumeLoader = (volumeId) => {
  const volumeInfo = decodeVolumeIdInfo(volumeId);

  const {
    name: uriName,
    rows,
    columns,
    slices,
    xSpacing: x_spacing,
    ySpacing: y_spacing,
    zSpacing: z_spacing,
    rgb = 0,
    PT = false,
  } = volumeInfo;

  // If uri name is volumeURIExact, it means that the metadata provided
  // has the start and end indices of the region of interest.
  let useExactRegion = false;
  if (uriName === 'volumeURIExact') {
    useExactRegion = true;
  }

  const dimensions = [rows, columns, slices];

  const photometricInterpretation = rgb ? 'RGB' : 'MONOCHROME2';

  const imageIds = new Array(slices).fill().map((_, i) =>
    encodeImageIdInfo({
      loader: 'fakeImageLoader',
      name: 'myImage',
      rows,
      columns,
      startX: 0,
      endX: columns,
      xSpacing: x_spacing,
      ySpacing: y_spacing,
      rgb: rgb ? 1 : 0,
      pt: 0,
      sliceIndex: i,
    })
  );

  const volumeMetadata = {
    BitsAllocated: rgb ? 24 : 8,
    BitsStored: rgb ? 24 : 8,
    SamplesPerPixel: rgb ? 3 : 1,
    HighBit: rgb ? 24 : 8,
    PixelRepresentation: 0,
    PhotometricInterpretation: photometricInterpretation,
    FrameOfReferenceUID: 'Volume_Frame_Of_Reference',
    ImageOrientationPatient: [1, 0, 0, 0, 1, 0],
    PixelSpacing: [x_spacing, y_spacing, z_spacing],
    Columns: columns,
    Rows: rows,
  };

  let pixelDataArray;
  if (rgb) {
    pixelDataArray = getVerticalBarRGBImages(rows, columns, slices);
  } else if (useExactRegion) {
    pixelDataArray = getExactRegionImages(
      rows,
      columns,
      slices,
      pt.startX,
      pt.startY,
      pt.startZ,
      pt.endX,
      pt.endY,
      pt.endZ,
      pt.valueForSegmentIndex
    );
  } else {
    pixelDataArray = getVerticalBarImages(rows, columns, slices);
  }

  const numberOfComponents = rgb ? 3 : 1;
  // cache the images with their metadata so that when the image is requested, it can be returned
  // from the cache instead of being created again
  pixelDataArray.forEach((pixelData, i) => {
    const voxelManager = utilities.VoxelManager.createImageVoxelManager({
      width: columns,
      height: rows,
      scalarData: pixelData,
      numberOfComponents,
    });

    const imageId = imageIds[i];
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
      voxelManager,
      rowPixelSpacing: y_spacing,
      columnPixelSpacing: x_spacing,
      getPixelData: () => voxelManager.getScalarData(),
      sizeInBytes: rows * columns * numberOfComponents,
      FrameOfReferenceUID: 'Stack_Frame_Of_Reference',
      imageFrame: {
        photometricInterpretation: rgb ? 'RGB' : 'MONOCHROME2',
      },
    };

    cache.putImageSync(imageId, image);
  });

  const volumeVoxelManager =
    utilities.VoxelManager.createImageVolumeVoxelManager({
      dimensions,
      imageIds,
      numberOfComponents,
    });

  const imageVolume = new ImageVolume({
    dataType: 'Uint8Array',
    volumeId,
    metadata: volumeMetadata,
    dimensions: dimensions,
    voxelManager: volumeVoxelManager,
    spacing: [1, 1, 1],
    origin: [0, 0, 0],
    direction: [1, 0, 0, 0, 1, 0, 0, 0, 1],
    numberOfComponents,
    imageIds,
  });

  imageVolume.modified();

  return {
    promise: Promise.resolve(imageVolume),
  };
};

export { fakeVolumeLoader };
