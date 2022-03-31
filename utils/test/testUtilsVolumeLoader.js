import vtkDataArray from '@kitware/vtk.js/Common/Core/DataArray';
import vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';
import { ImageVolume } from '@cornerstonejs/core';
import {
  getVerticalBarRGBVolume,
  getVerticalBarVolume,
  getExactRegionVolume,
} from './testUtilsPixelData';

/**
 * It creates a volume based on the volumeId name for testing purposes. It splits the volumeId
 * based on "_" and deciphers each field of [ scheme, rows, columns, slices, x_spacing, y_spacing, z_spacing, rgb,
 * startX, startY, startZ, endX, endY, endZ, and valueForSegmentIndex ].
 *
 * If scheme is not equal to "volumeURIExact", then the volume is created with number of
 * provided rows, columns, and slices, with spacing in x, y, and z direction, and with
 * each slice having one vertical bar spanning [width/slices] of the image. So for instance
 * myVolume_100_100_10_1_1_1_0 will generate a volume of size 100 by 100 by 10 with spacing
 * of 1 mm in x and y direction and 1 mm in z direction. The volume will have 10 slices, and
 * first slice will have a vertical bar spanning 10 pixels in the first 10% of the image (since
 * there are 10 slices), the second slice will have a vertical bar of value 255 spanning 10 pixels in the
 * second 10% of the image, and so on.
 *
 * If volumeURIExact is provided as the scheme, there will be no automatic generation of the vertical bars
 * for each slice and using the provided startX, startY, startZ, endX, endY, endZ, and valueForSegmentIndex
 * will be used to create the volume that has the exact region specified with value of valueForSegmentIndex
 * (instead of 255).
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
 * then you can use imageId like: 'fakeVolumeLoader: myVolume_64_64_10_1_1_1_0'
 *
 *
 * @param {volumeId} volumeId
 * @returns Promise that resolves to the image
 */
const fakeVolumeLoader = (volumeId) => {
  const volumeURI = volumeId.split(':')[1];
  const uriName = volumeURI.split('_')[0];
  const [
    _,
    rows,
    columns,
    slices,
    x_spacing,
    y_spacing,
    z_spacing,
    rgb,
    startX,
    startY,
    startZ,
    endX,
    endY,
    endZ,
    valueForSegmentIndex,
  ] = volumeURI.split('_').map((v) => parseFloat(v));

  // If uri name is volumeURIExact, it means that the metadata provided
  // has the start and end indices of the region of interest.
  let useExactRegion = false;
  if (uriName === 'volumeURIExact') {
    useExactRegion = true;
  }

  const dimensions = [rows, columns, slices];

  const photometricInterpretation = rgb ? 'RGB' : 'MONOCHROME2';

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

  let pixelData;
  if (rgb) {
    pixelData = getVerticalBarRGBVolume(rows, columns, slices);
  } else if (useExactRegion) {
    pixelData = getExactRegionVolume(
      rows,
      columns,
      slices,
      startX,
      startY,
      startZ,
      endX,
      endY,
      endZ,
      valueForSegmentIndex
    );
  } else {
    pixelData = getVerticalBarVolume(rows, columns, slices);
  }

  const scalarArray = vtkDataArray.newInstance({
    name: 'Pixels',
    numberOfComponents: rgb ? 3 : 1,
    values: pixelData,
  });

  const imageData = vtkImageData.newInstance();
  imageData.setDimensions(dimensions);
  imageData.setSpacing([1, 1, 1]);
  imageData.setDirection([1, 0, 0, 0, 1, 0, 0, 0, 1]);
  imageData.setOrigin([0, 0, 0]);
  imageData.getPointData().setScalars(scalarArray);

  const imageVolume = new ImageVolume({
    volumeId,
    metadata: volumeMetadata,
    dimensions: dimensions,
    spacing: [1, 1, 1],
    origin: [0, 0, 0],
    direction: [1, 0, 0, 0, 1, 0, 0, 0, 1],
    scalarData: pixelData,
    sizeInBytes: pixelData.byteLength,
    imageData: imageData,
    imageIds: [],
  });

  return {
    promise: Promise.resolve(imageVolume),
  };
};

export { fakeVolumeLoader };
