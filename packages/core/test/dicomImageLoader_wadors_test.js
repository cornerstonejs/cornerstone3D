// @ts-check

import { metaData } from '@cornerstonejs/core';
import {
  init as dicomImageLoaderInit,
  wadors,
  wadouri,
} from '@cornerstonejs/dicom-image-loader';
import { WADO_RS_TEST as JpegBaselineWadoRS } from '../../dicomImageLoader/testImages/TestPattern_JPEG-Baseline_YBR422';
import { WADO_RS_TEST as JpegBaselineYbrFullTest } from '../../dicomImageLoader/testImages/TestPattern_JPEG-Baseline_YBRFull';
import { WADO_RS_TEST as NoPixelSpacingWadoRS } from '../../dicomImageLoader/testImages/no-pixel-spacing';

/** @type {import("../../dicomImageLoader/testImages/tests.models").IWadoRsTest[]} */
const WADO_RS_TESTS = [
  JpegBaselineWadoRS,
  NoPixelSpacingWadoRS,
  JpegBaselineYbrFullTest,
];

/**
 * These are paramaterized tests for dicomImageLoader.  It allows us to test
 * that different images are loaded correctly, and that the metadata returned by
 * the loader is as expected.
 */
describe('dicomImageLoader - WADO-RS', () => {
  beforeAll(() => {
    wadouri.register();
    wadors.register();
    dicomImageLoaderInit();
  });

  for (const t of WADO_RS_TESTS) {
    for (const frame of t.frames) {
      // WADO-RS Loader Tests
      if (frame.metadataModule && t.wadorsMetadata) {
        wadors.metaDataManager.add(t.wadorsUrl, t.wadorsMetadata);

        for (const [metadataModuleName, expectedModuleValues] of Object.entries(
          frame.metadataModule
        )) {
          it(`should get the ${metadataModuleName} metadata from the ${t.name} image`, async () => {
            const actualModuleValue = metaData.get(
              metadataModuleName,
              t.wadorsUrl
            );

            expect(actualModuleValue).toEqual(expectedModuleValues);
          });
        }
      }
    }
  }
});

/**
 *
 * @param {ArrayBufferLike} image
 */
async function createImageHash(image) {
  const hashBuffer = await crypto.subtle.digest('SHA-256', image);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return hashHex;
}
