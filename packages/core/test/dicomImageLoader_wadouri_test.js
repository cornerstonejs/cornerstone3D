// @ts-check

import { cache, Enums, imageLoader, metaData } from '@cornerstonejs/core';
import {
  init as dicomImageLoaderInit,
  wadouri,
} from '@cornerstonejs/dicom-image-loader';
import { expectObjectEquality } from './expectObjectEquality';

import * as dcmjs from 'dcmjs';
import { createImageHash } from '../../../utils/test/pixel-data-hash';
import { WADOURI_TEST as CtBigEndian_1_2_840_1008_1_2_2 } from '../../dicomImageLoader/testImages/CTImage.dcm_BigEndianExplicitTransferSyntax_1.2.840.10008.1.2.2';
import { WADOURI_TEST as CtJpeg2000Lossless_1_2_840_10008_1_2_4_90 } from '../../dicomImageLoader/testImages/CTImage.dcm_JPEG2000LosslessOnlyTransferSyntax_1.2.840.10008.1.2.4.90';
import { WADOURI_TEST as CtJpeg2000_1_2_840_10008_1_2_4_91 } from '../../dicomImageLoader/testImages/CTImage.dcm_JPEG2000TransferSyntax_1.2.840.10008.1.2.4.91';
import { WADOURI_TEST as CtJpegLsLossless_1_2_840_10008_1_2_4_80 } from '../../dicomImageLoader/testImages/CTImage.dcm_JPEGLSLosslessTransferSyntax_1.2.840.10008.1.2.4.80';
import { WADOURI_TEST as CtJpegLsLossless_1_2_840_10008_1_2_4_81 } from '../../dicomImageLoader/testImages/CTImage.dcm_JPEGLSLossyTransferSyntax_1.2.840.10008.1.2.4.81';
import { WADOURI_TEST as CtJpegProcess14V1_1_2_840_10008_1_2_4_70 } from '../../dicomImageLoader/testImages/CTImage.dcm_JPEGProcess14SV1TransferSyntax_1.2.840.10008.1.2.4.70';
import { WADOURI_TEST as CtJpegProcess14_1_2_840_10008_1_2_4_57 } from '../../dicomImageLoader/testImages/CTImage.dcm_JPEGProcess14TransferSyntax_1.2.840.10008.1.2.4.57';
import { WADOURI_TEST as CtJpegProcess1_1_2_840_10008_1_2_4_50 } from '../../dicomImageLoader/testImages/CTImage.dcm_JPEGProcess1TransferSyntax_1.2.840.10008.1.2.4.50';
import { WADOURI_TEST as CtLittleEndian_1_2_840_10008_1_2_1 } from '../../dicomImageLoader/testImages/CTImage.dcm_LittleEndianExplicitTransferSyntax_1.2.840.10008.1.2.1';
import { WADOURI_TEST as CtLittleEndian_1_2_840_10008_1_2 } from '../../dicomImageLoader/testImages/CTImage.dcm_LittleEndianImplicitTransferSyntax_1.2.840.10008.1.2';
import { WADOURI_TEST as CtRLELossless_1_2_840_10008_1_2_5 } from '../../dicomImageLoader/testImages/CTImage.dcm_RLELosslessTransferSyntax_1.2.840.10008.1.2.5';
import { WADOURI_TEST as TestPattern_JpegBaselineYbr422 } from '../../dicomImageLoader/testImages/TestPattern_JPEG-Baseline_YBR422';
import { WADOURI_TEST as TestPatternJpegBaselineYbrFull } from '../../dicomImageLoader/testImages/TestPattern_JPEG-Baseline_YBRFull';
import { WADOURI_TEST as TestPatternJpegLsLossless } from '../../dicomImageLoader/testImages/TestPattern_JPEG-LS-Lossless';
import { WADOURI_TEST as TestPatternJpegLsNearLossless } from '../../dicomImageLoader/testImages/TestPattern_JPEG-LS-NearLossless';
import { WADOURI_TEST as TestPatternJpegLosslessRgb } from '../../dicomImageLoader/testImages/TestPattern_JPEG-Lossless_RGB';
import { WADOURI_TEST as TestPatternPalette } from '../../dicomImageLoader/testImages/TestPattern_Palette';
import { WADOURI_TEST as TestPatternPalette_16 } from '../../dicomImageLoader/testImages/TestPattern_Palette_16';
import { WADOURI_TEST as TestPatternRGB } from '../../dicomImageLoader/testImages/TestPattern_RGB';
import { WADOURI_TEST as NoPixelSpacing } from '../../dicomImageLoader/testImages/no-pixel-spacing';
import { WADOURI_TEST as ParamapTest } from '../../dicomImageLoader/testImages/paramap';
import { WADOURI_TEST as ParamapFloatTest } from '../../dicomImageLoader/testImages/paramap-float';
import { WADOURI_TEST as UsMultiframeYbrFull422 } from '../../dicomImageLoader/testImages/us-multiframe-ybr-full-422';

/** @type {import("../../dicomImageLoader/testImages/tests.models").IWadoUriTest[]} */
const tests = [
  // CtBigEndian_1_2_840_1008_1_2_2,
  // CtJpeg2000_1_2_840_10008_1_2_4_91,
  // CtJpeg2000Lossless_1_2_840_10008_1_2_4_90,
  // CtJpegLsLossless_1_2_840_10008_1_2_4_80,
  // CtJpegLsLossless_1_2_840_10008_1_2_4_81,
  // CtJpegProcess1_1_2_840_10008_1_2_4_50,
  // CtBigEndian_1_2_840_1008_1_2_2,
  // CtJpegProcess14_1_2_840_10008_1_2_4_57,
  // CtJpegProcess14V1_1_2_840_10008_1_2_4_70,
  // CtLittleEndian_1_2_840_10008_1_2_1,
  // CtLittleEndian_1_2_840_10008_1_2,
  // CtRLELossless_1_2_840_10008_1_2_5,
  // NoPixelSpacing,
  // ParamapFloatTest,
  ParamapTest,
  // TestPattern_JpegBaselineYbr422,
  // TestPatternJpegBaselineYbrFull,
  // TestPatternJpegLosslessRgb,
  // TestPatternJpegLsLossless,
  // TestPatternJpegLsNearLossless,
  // TestPatternPalette_16,
  // TestPatternPalette,
  // TestPatternRGB,
  // UsMultiframeYbrFull422,
];

/**
 * These are paramaterized tests for dicomImageLoader.  It allows us to test
 * that different images are loaded correctly, and that the metadata returned by
 * the loader is as expected.
 *
 * These tests are setup to test different aspects from loading single and
 * multi-frame dicom images via WADO-URI. The tests include:
 *
 * 1. Loading the image and comparing the pixelData hash with an expected hash.
 * 2. Loading the image and comparing the returned image object with an expected
 *    image object.
 * 3. Retrieving metadata modules and comparing them with expected metadata
 *    modules.
 */
describe('dicomImageLoader - WADO-URI', () => {
  beforeEach(() => {
    // register the wadouri loader
    wadouri.register();
    // re-initialise the loader before each test to clear any previous config
    dicomImageLoaderInit();
  });

  afterEach(() => {
    // Purge any loaded data so each test loads the image
    wadouri.dataSetCacheManager.purge();
    cache.purgeCache();
    imageLoader.unregisterAllImageLoaders();
  });

  it('should allow customising the http request with beforeSend', async () => {
    const test = CtLittleEndian_1_2_840_10008_1_2;
    const beforeSpy = jasmine.createSpy('beforeHandler').and.resolveTo();

    dicomImageLoaderInit({
      beforeSend: beforeSpy,
    });

    await imageLoader.loadImage(test.wadouri);

    const expectedHeaders = {};
    const expectedImageId = test.wadouri;
    const expectedUrl = test.wadouri.replace('wadouri:', '');

    expect(beforeSpy).toHaveBeenCalledWith(
      jasmine.any(XMLHttpRequest),
      expectedImageId,
      expectedHeaders,
      {
        url: expectedUrl,
        deferred: {
          resolve: jasmine.any(Function),
          reject: jasmine.any(Function),
        },
        imageId: expectedImageId,
      }
    );
  });

  it('should call request lifecycle callbacks', async () => {
    const test = CtLittleEndian_1_2_840_10008_1_2;
    const onreadystatechangeSpy = jasmine.createSpy('onreadystatechange');
    const onprogressSpy = jasmine.createSpy('onprogress');
    const onloadendSpy = jasmine.createSpy('onloadend');
    const onloadstartSpy = jasmine.createSpy('onloadstart');

    dicomImageLoaderInit({
      onreadystatechange: onreadystatechangeSpy,
      onprogress: onprogressSpy,
      onloadend: onloadendSpy,
      onloadstart: onloadstartSpy,
    });

    await imageLoader.loadImage(test.wadouri);

    const expectedImageId = test.wadouri;
    const expectedUrl = test.wadouri.replace('wadouri:', '');
    const expectedLoaderParams = {
      url: expectedUrl,
      deferred: {
        resolve: jasmine.any(Function),
        reject: jasmine.any(Function),
      },
      imageId: expectedImageId,
    };

    expect(onloadstartSpy).toHaveBeenCalledOnceWith(
      jasmine.any(Event),
      expectedLoaderParams
    );

    expect(onprogressSpy).toHaveBeenCalled();

    expect(onreadystatechangeSpy).toHaveBeenCalledTimes(3);
    expect(onreadystatechangeSpy.calls.argsFor(0)).toEqual([
      jasmine.any(Event),
      expectedLoaderParams,
    ]);

    expect(onloadendSpy).toHaveBeenCalledOnceWith(
      jasmine.any(Event),
      expectedLoaderParams
    );
  });

  for (const t of tests) {
    describe(t.name, () => {
      for (const frame of t.frames) {
        // Determine the frame to use (default to 1 if not specified)
        const frameIndex = frame.index || 1;

        if (frame.pixelDataHash) {
          it(`decodes the image and the pixel data hash for frame ${frameIndex} of ${t.name} is correct`, async () => {
            // first load the image without the frame so that it is loaded into
            // the cache
            const { imageId } = await imageLoader.loadImage(t.wadouri);
            /**
             * If the test case has `.pixelDataHash` defined, then we want to
             * load the image and check that the pixel data matches the expected
             * hash.
             */
            const image = await imageLoader.loadImage(
              imageIdWithFrame(imageId, frameIndex)
            );
            const hash = await createImageHash(image.getPixelData());

            expect(hash).toBe(frame.pixelDataHash);
          });
        }

        if ('image' in frame && frame.image) {
          it(`returns the correct image object for ${frameIndex} of the ${t.name} image`, async () => {
            // first load the image without the frame so that it is loaded into
            // the cache
            const { imageId } = await imageLoader.loadImage(t.wadouri);

            // now load the frame specific imageId
            const imagObj = await imageLoader.loadImage(
              imageIdWithFrame(imageId, frameIndex)
            );

            expect(imagObj).toEqual(frame.image);
          });
        }

        // WADO-RS Loader Tests
        if (frame.metadataModule) {
          for (const [
            metadataModuleName,
            expectedModuleValues,
          ] of Object.entries(frame.metadataModule)) {
            fit(`returns the correct ${metadataModuleName} metadata for frame ${frameIndex} of ${t.name} image`, async () => {
              const { imageId } = await imageLoader.loadImage(t.wadouri);
              const imageIdWithFrameIndex = imageIdWithFrame(
                imageId,
                frameIndex
              );
              const actualModuleValue = metaData.get(
                metadataModuleName,
                imageIdWithFrameIndex
              );
              expectObjectEquality(actualModuleValue, expectedModuleValues);
            });
          }
        }
      }
    });
  }

  describe('multiframe images', () => {
    it('returns ImagePlaneModule metadata for each frame', async () => {
      /**
       * When loading ImagePlaneModule metadata from multi-frame images that
       * have SharedFunctionalGroupsSequence or
       * PerFrameFunctionalGroupsSequence, some values are extracted from
       * SharedFunctionalGroupsSequence or PerFrameFunctionalGroupsSequence. For
       * example ImagePositionPatient is extracted from
       * SharedFunctionalGroupsSequence[0].PlanePositionSequence[0].ImagePositionPatient
       *
       * Some dicoms may not have any contents of .PlanePositionSequence, which
       * causes the extraction to fail. This test ensures that even if
       * .PlanePositionSequence is empty, the ImagePlaneModule metadata is still
       * returned.
       *
       * The same can occur for other shared sequences such as
       * PlaneOrientationSequence, PixelMeasuresSequence, etc.
       */

      // Use the US Multiframe Test Images
      const wadorsUrl = UsMultiframeYbrFull422.wadouri;
      const data = await (
        await fetch(wadorsUrl.replace('wadouri:', ''))
      ).arrayBuffer();
      // Load it using dcmjs
      const dicomDataset = dcmjs.data.DicomMessage.readFile(data);
      const dataset = dcmjs.data.DicomMetaDictionary.naturalizeDataset(
        dicomDataset.dict
      );
      // Modify the dataset to
      // SharedFunctionalGroupsSequence[0].PlanePositionSequence to be empty
      dataset.SharedFunctionalGroupsSequence = [
        {
          PlanePositionSequence: [],
        },
      ];
      // modify the dataset to set
      // SharedFunctionalGroupsSequence[0].PlaneOrientationSequence to be empty
      dataset.SharedFunctionalGroupsSequence[0].PlaneOrientationSequence = [];
      // modify the dataset to set
      // SharedFunctionalGroupsSequence[0].PixelMeasuresSequence to be empty
      dataset.SharedFunctionalGroupsSequence[0].PixelMeasuresSequence = [];

      // Denaturalize the dataset back to dicom format
      const modifiedDicomData =
        dcmjs.data.DicomMetaDictionary.denaturalizeDataset(dataset);
      dicomDataset.dict = modifiedDicomData;

      // Write the modified dicom dataset back to a byte array
      const updatedDicom = dicomDataset.write();
      const updatedDicomAsBlob = new Blob([updatedDicom], {
        type: 'application/dicom',
      });

      // Cache the file in the wadouri file manager
      const fileId = wadouri.fileManager.add(updatedDicomAsBlob);

      const fileIdWithFrame = imageIdWithFrame(fileId, 1);
      // load the image
      await imageLoader.loadImage(fileIdWithFrame);

      // get the ImagePlaneModule metadata
      const imagePlaneMetaData = metaData.get(
        Enums.MetadataModules.IMAGE_PLANE,
        fileIdWithFrame
      );
      // Ensure the metadata is returned
      expect(imagePlaneMetaData).toBeDefined();
    });
  });
});

/**
 *
 * @param {string} imageId
 * @param {number} frame 1 based frame index.
 * @returns {string}
 */
function imageIdWithFrame(imageId, frame) {
  return `${imageId}?frame=${frame}`;
}
