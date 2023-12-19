import resemble from 'resemblejs';

import { fakeImageLoader, fakeMetaDataProvider } from './testUtilsImageLoader';
import { fakeVolumeLoader } from './testUtilsVolumeLoader';
import { createNormalizedMouseEvent } from './testUtilsMouseEvents';

/**
 * TestUtils: used for colorizing the image and comparing it to a baseline,
 * should not be used for development.
 */
const colors = [
  [255, 0, 0],
  [0, 255, 0],
  [128, 0, 0],
  [0, 0, 255],
  [0, 128, 0],
  [255, 255, 0],
  [0, 255, 255],
  [0, 0, 0],
  [0, 0, 128],
  [255, 0, 255],
];

Object.freeze(colors);

/**
 * It compares the image to a baseline, and if it is different by 1% it will
 * throw an error. Otherwise, it will return success.
 * @param {string} imageDataURL - The rendered imageDataURL - can be grabbed by calling canvas.toDataURL()
 * @param {string} baseline - Baseline imageDataURL - imported png in the test files
 * @param outputName - The name of the image for logging
 * @returns A promise.
 */
function compareImages(imageDataURL, baseline, outputName) {
  return new Promise((resolve, reject) => {
    resemble.outputSettings({
      useCrossOrigin: false,
      errorColor: {
        red: 0,
        green: 255,
        blue: 0,
      },
      transparency: 0.5,
      largeImageThreshold: 1200,
      outputDiff: true,
    });

    resemble(baseline.default)
      .compareTo(imageDataURL)
      .onComplete((data) => {
        const mismatch = parseFloat(data.misMatchPercentage);
        // If the error is greater than 1%, fail the test
        // and download the difference image
        // Todo: this should be a configurable threshold
        if (mismatch > 1) {
          console.log('mismatch of ' + mismatch + '%');
          const diff = data.getImageDataUrl();
          // Todo: we should store the diff image somewhere
          reject(
            new Error(
              `mismatch of ${mismatch} between images for ${outputName},
              the diff image is: \n\n ${diff} \n\n`
            )
          );
          // reject(new Error(`mismatch between images for ${outputName}\n mismatch: ${mismatch}\n ${baseline.default}\n ${imageDataURL}\n ${diff}`));
        } else {
          resolve();
        }
      });
  });
}

/**
 * Adds two concentric circles to each axial slice of the demo segmentation.
 */
function createMockEllipsoidStackSegmentation({
  imageIds,
  segmentationImageIds,
  cornerstone,
}) {
  const { metaData, cache } = cornerstone;
  const { rows, columns } = metaData.get('imagePlaneModule', imageIds[0]);
  const dimensions = [columns, rows, imageIds.length];

  const center = [dimensions[0] / 2, dimensions[1] / 2, dimensions[2] / 2];
  const outerRadius = 64;
  const innerRadius = 32;
  for (let z = 0; z < dimensions[2]; z++) {
    let voxelIndex = 0;
    const image = cache.getImage(segmentationImageIds[z]);
    const scalarData = image.getPixelData();
    for (let y = 0; y < dimensions[1]; y++) {
      for (let x = 0; x < dimensions[0]; x++) {
        const distanceFromCenter = Math.sqrt(
          (x - center[0]) * (x - center[0]) +
            (y - center[1]) * (y - center[1]) +
            (z - center[2]) * (z - center[2])
        );
        if (distanceFromCenter < innerRadius) {
          scalarData[voxelIndex] = 1;
        } else if (distanceFromCenter < outerRadius) {
          scalarData[voxelIndex] = 2;
        }
        voxelIndex++;
      }
    }
  }
}

export {
  fakeImageLoader,
  fakeMetaDataProvider,
  fakeVolumeLoader,
  compareImages,
  createNormalizedMouseEvent,
  // utils
  colors,
  createMockEllipsoidStackSegmentation,
};
