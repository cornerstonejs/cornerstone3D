import resemble from 'resemblejs';
import { fakeImageLoader, fakeMetaDataProvider } from './testUtilsImageLoader';
import { fakeVolumeLoader } from './testUtilsVolumeLoader';
import { createNormalizedMouseEvent } from './testUtilsMouseEvents';
import { fillStackSegmentationWithMockData } from './fillStackSegmentationWithMockData';
import { fillVolumeLabelmapWithMockData } from './fillVolumeLabelmapWithMockData';
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
 * Compares images or signals to update baselines based on the updateBaselines parameter.
 * @param {string} imageDataURL - The rendered imageDataURL
 * @param {string} baseline - Baseline imageDataURL - imported png in the test files
 * @param {string} outputName - The name of the image for logging
 * @param {boolean} updateBaselines - Whether to update baselines instead of comparing
 * @returns A promise.
 */
function compareImages(
  imageDataURL,
  baseline,
  outputName,
  updateBaselines = true
) {
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
        if (mismatch > 1 && !updateBaselines) {
          console.warn('mismatch of', mismatch, '% to image', imageDataURL);
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
          console.debug(`[Baseline Match]`);
          console.debug(`${outputName}: ${imageDataURL}`);
          resolve();
        }
      });
  });
}

function encodeImageIdInfo(info) {
  return `fakeImageLoader:${encodeURIComponent(JSON.stringify(info))}`;
}

function decodeImageIdInfo(imageId) {
  const [scheme, encodedInfo] = imageId.split(':');
  if (scheme !== 'fakeImageLoader') {
    return null;
  }
  return JSON.parse(decodeURIComponent(encodedInfo));
}

function encodeVolumeIdInfo(info) {
  return `fakeVolumeLoader:${encodeURIComponent(JSON.stringify(info))}`;
}

function decodeVolumeIdInfo(volumeId) {
  const [scheme, encodedInfo] = volumeId.split(':');
  if (scheme !== 'fakeVolumeLoader') {
    return null;
  }
  return JSON.parse(decodeURIComponent(encodedInfo));
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
  fillVolumeLabelmapWithMockData,
  addMockContourSegmentation,
  encodeImageIdInfo,
  decodeImageIdInfo,
  encodeVolumeIdInfo,
  decodeVolumeIdInfo,
};
