// @ts-check

import {
  cache,
  Enums,
  imageLoader,
  metaData,
  utilities,
} from '@cornerstonejs/core';
import {
  init as dicomImageLoaderInit,
  wadouri,
} from '@cornerstonejs/dicom-image-loader';
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
  CtBigEndian_1_2_840_1008_1_2_2,
  CtJpeg2000_1_2_840_10008_1_2_4_91,
  CtJpeg2000Lossless_1_2_840_10008_1_2_4_90,
  CtJpegLsLossless_1_2_840_10008_1_2_4_80,
  CtJpegLsLossless_1_2_840_10008_1_2_4_81,
  CtJpegProcess1_1_2_840_10008_1_2_4_50,
  CtBigEndian_1_2_840_1008_1_2_2,
  CtJpegProcess14_1_2_840_10008_1_2_4_57,
  CtJpegProcess14V1_1_2_840_10008_1_2_4_70,
  CtLittleEndian_1_2_840_10008_1_2_1,
  CtLittleEndian_1_2_840_10008_1_2,
  CtRLELossless_1_2_840_10008_1_2_5,
  NoPixelSpacing,
  ParamapFloatTest,
  ParamapTest,
  TestPattern_JpegBaselineYbr422,
  TestPatternJpegBaselineYbrFull,
  TestPatternJpegLosslessRgb,
  TestPatternJpegLsLossless,
  TestPatternJpegLsNearLossless,
  TestPatternPalette_16,
  TestPatternPalette,
  TestPatternRGB,
  UsMultiframeYbrFull422,
];

/**
 * These paramaterized tests for dicomImageLoader.  It allows us to test
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
 *
 * Notes:
 * - "Worker type 'dicomImageLoader' is already registered" appears because
 *   beforeEach calls dicomImageLoaderInit() every test; the worker is registered
 *   once and not unregistered in afterEach, so subsequent tests see the warning.
 * - The NATURAL path (loadImageFromNatural) uses dcmjs stream + COMPRESSED_FRAME_DATA
 *   from NATURAL. NATURAL is stored under the base imageId (frame stripped) so registration
 *   happens once per URL. Pixel data is resolved from PixelData, FloatPixelData, or hex tags
 *   (7FE0,0010) / (7FE0,0008) so paramap and paramap-float work on the default path.
 */
describe('dicomImageLoader - WADO-URI', () => {
  beforeEach(() => {
    // Suppress "Worker type 'dicomImageLoader' is already registered" in tests
    utilities.logger.workerLog.setLevel('error');
    // register the wadouri loader and default (NATURAL) path
    wadouri.register();
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

    expect(onreadystatechangeSpy.calls.count()).toBeGreaterThanOrEqual(3);
    expect(onreadystatechangeSpy.calls.argsFor(0)).toEqual([
      jasmine.any(Event),
      expectedLoaderParams,
    ]);

    expect(onloadendSpy).toHaveBeenCalledOnceWith(
      jasmine.any(Event),
      expectedLoaderParams
    );
  });

  describe('legacy loader', () => {
    beforeEach(() => {
      wadouri.dataSetCacheManager.purge();
      cache.purgeCache();
      imageLoader.unregisterAllImageLoaders();
      wadouri.register();
      dicomImageLoaderInit({ useLegacyMetadataProvider: true });
    });

    afterEach(() => {
      wadouri.dataSetCacheManager.purge();
      cache.purgeCache();
      imageLoader.unregisterAllImageLoaders();
    });

    it('should allow customising the http request with beforeSend', async () => {
      const test = CtLittleEndian_1_2_840_10008_1_2;
      const beforeSpy = jasmine.createSpy('beforeHandler').and.resolveTo();
      dicomImageLoaderInit({
        useLegacyMetadataProvider: true,
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
        useLegacyMetadataProvider: true,
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
      expect(onreadystatechangeSpy.calls.count()).toBeGreaterThanOrEqual(3);
      expect(onloadendSpy).toHaveBeenCalledOnceWith(
        jasmine.any(Event),
        expectedLoaderParams
      );
    });
  });

  for (const t of tests) {
    if (!t.frames.find((frame) => frame.pixelDataHash || frame.image)) {
      console.log(
        `Skipping ${t.name} because it has no pixel data or image tests`
      );
      continue;
    }
    if (t.name.indexOf('No Pixel Spacing') === -1) {
      continue;
    }
    describe(t.name, () => {
      beforeEach(() => {
        jasmine.DEFAULT_TIMEOUT_INTERVAL = 15000;
      });
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

            // No Pixel Spacing: dump decoded pixel data as PNG data URL for visual inspection (paste in browser).
            if (t.name === 'No Pixel Spacing') {
              const redPalette =
                image.imageFrame?.redPaletteColorLookupTableData;
              expect(redPalette).toBeDefined();
              const firstN = NO_PIXEL_SPACING_RED_PALETTE_FIRST_VALUES.length;
              const actualFirst = Array.from(redPalette).slice(0, firstN);
              expect(actualFirst).toEqual(
                NO_PIXEL_SPACING_RED_PALETTE_FIRST_VALUES
              );
            }

            expect(hash).toBe(frame.pixelDataHash);
          });
        }

        if (frame.image) {
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
      }
    });
  }

  // Metadata module tests use the legacy provider (dataset-based metadata).
  // Specific legacy handling is not being moved forward to the NATURAL path.
  describe('legacy loader metadata modules', () => {
    beforeEach(() => {
      wadouri.dataSetCacheManager.purge();
      cache.purgeCache();
      imageLoader.unregisterAllImageLoaders();
      wadouri.register();
      dicomImageLoaderInit({ useLegacyMetadataProvider: true });
    });

    afterEach(() => {
      wadouri.dataSetCacheManager.purge();
      cache.purgeCache();
      imageLoader.unregisterAllImageLoaders();
    });

    for (const t of tests) {
      if (!t.frames.some((frame) => frame.metadataModule)) {
        continue;
      }
      describe(t.name, () => {
        for (const frame of t.frames) {
          const frameIndex = frame.index || 1;

          if (frame.metadataModule) {
            for (const [
              metadataModuleName,
              expectedModuleValues,
            ] of Object.entries(frame.metadataModule)) {
              it(`returns the correct ${metadataModuleName} metadata for frame ${frameIndex} of ${t.name} image`, async () => {
                const { imageId } = await imageLoader.loadImage(t.wadouri);
                const imageIdWithFrameIndex = imageIdWithFrame(
                  imageId,
                  frameIndex
                );
                const actualModuleValue = metaData.get(
                  metadataModuleName,
                  imageIdWithFrameIndex
                );

                expect(actualModuleValue).toEqual(expectedModuleValues);
              });
            }
          }
        }
      });
    }
  });

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

/**
 * First 80 values of RedPaletteColorLookupTableData (0028,1201) for no-pixel-spacing.dcm.
 * DICOM OW #512: 16-bit; negatives as unsigned 16-bit for Uint16Array comparison.
 */
const NO_PIXEL_SPACING_RED_PALETTE_FIRST_VALUES = [
  0, 256, 256, 256, 256, 256, 512, 512, 512, 768, 768, 768, 768, 1024, 1024,
  1280, 1280, 1280, 1280, 1280, 1536, 1536, 1536, 1536, 1792, 1792, 1792, 2048,
  2304, 2304, 2304, 2304, 2816, 2816, 2816, 3072, 3072, 3072, 3328, 3328, 3584,
  3840, 3840, 3840, 4096, 4352, 4352, 4352, 4608, 4864, 4864, 5120, 5376, 5376,
  5632, 5632, 5888, 5888, 6144, 6400, 6656, 6656, 6912, 7168, 7168, 7424, 7680,
  7680, 8192, 8192, 8448, 8704, 8704, 9216, 9216, 9472, 9728, 9984, 10240,
  10496, 10496, 10752, 11008, 11264, 11520, 12032, 12032, 12544, 12544, 12800,
  13056, 13312, 13568, 13824, 14336, 14336,
];
