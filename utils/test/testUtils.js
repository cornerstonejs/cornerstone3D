import resemble from 'resemblejs';
import { fakeImageLoader, fakeMetaDataProvider } from './testUtilsImageLoader';
import { fakeVolumeLoader } from './testUtilsVolumeLoader';
import { createNormalizedMouseEvent } from './testUtilsMouseEvents';
import { fillStackSegmentationWithMockData } from './fillStackSegmentationWithMockData';
import { fillVolumeSegmentationWithMockData } from './fillVolumeSegmentationWithMockData';
import { addMockContourSegmentation } from './addMockContourSegmentation';

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

export {
  fakeImageLoader,
  fakeMetaDataProvider,
  fakeVolumeLoader,
  compareImages,
  createNormalizedMouseEvent,
  // utils
  colors,
  fillStackSegmentationWithMockData,
  fillVolumeSegmentationWithMockData,
  addMockContourSegmentation,
};
