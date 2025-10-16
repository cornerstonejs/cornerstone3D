// @ts-check
import { metaData } from '@cornerstonejs/core';
import {
  init as dicomImageLoaderInit,
  wadors,
  wadouri,
} from '@cornerstonejs/dicom-image-loader';
import { WADO_RS_TEST as CtBigEndian_1_2_840_10008_1_2_2 } from '../../dicomImageLoader/testImages/CTImage.dcm_BigEndianExplicitTransferSyntax_1.2.840.10008.1.2.2';
import { WADO_RS_TEST as JpegBaselineWadoRS } from '../../dicomImageLoader/testImages/TestPattern_JPEG-Baseline_YBR422';
import { WADO_RS_TEST as JpegBaselineYbrFullTest } from '../../dicomImageLoader/testImages/TestPattern_JPEG-Baseline_YBRFull';
import { WADO_RS_TEST as NoPixelSpacingWadoRS } from '../../dicomImageLoader/testImages/no-pixel-spacing';

/** @type {import("../../dicomImageLoader/testImages/tests.models").IWadoRsTest[]} */
const WADO_RS_TESTS = [
  CtBigEndian_1_2_840_10008_1_2_2,
  JpegBaselineWadoRS,
  JpegBaselineYbrFullTest,
  NoPixelSpacingWadoRS,
];

/**
 * These are paramaterized tests for dicomImageLoader.  Theses tests are for
 * validating the WADO-RS loader works correctly for a wide variety of images.
 * Currently, the WADO-RS tests only test the WADO-RS Metadata Provider.
 *
 * Future improvement can extend these tests to match the functionality of
 * WADO-URI tests including:
 * 1. Testing pixel data matches the expected hash
 * 2. Testing the Image object returned by `loadImage`
 */
describe('dicomImageLoader - WADO-RS', () => {
  beforeAll(() => {
    wadouri.register();
    wadors.register();
    dicomImageLoaderInit();
  });

  for (const t of WADO_RS_TESTS) {
    describe(t.name, () => {
      for (const frame of t.frames) {
        // WADO-RS Loader Tests
        if (frame.metadataModule && t.wadorsMetadata) {
          wadors.metaDataManager.add(t.wadorsUrl, t.wadorsMetadata);

          for (const [
            metadataModuleName,
            expectedModuleValues,
          ] of Object.entries(frame.metadataModule)) {
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
    });
  }
});
