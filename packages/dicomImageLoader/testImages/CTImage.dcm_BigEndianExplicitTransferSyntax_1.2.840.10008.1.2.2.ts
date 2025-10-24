import { Enums, type Types } from '@cornerstonejs/core';
import type { IWadoRsTest, IWadoUriTest } from './tests.models';
import { tags } from './CTImage.dcm_BigEndianExplicitTransferSyntax_1.2.840.10008.1.2.2.wado-rs-tags';

const EXPECTED_IMAGE: Types.IImage = {
  // @ts-expect-error Incorrect type
  calibration: {},
  color: false,
  columnPixelSpacing: 0.675781,
  columns: 512,
  dataType: 'Int16Array',
  data: jasmine.any(Object),
  // @ts-expect-error Extra fields not defined in IImage
  decodeTimeInMS: jasmine.any(Number),
  floatPixelData: undefined,
  getCanvas: undefined,
  // @ts-expect-error jasmine matcher
  getPixelData: jasmine.any(Function),
  height: 512,
  imageFrame: {
    bitsAllocated: 16,
    bitsStored: 16,
    bluePaletteColorLookupTableData: undefined,
    bluePaletteColorLookupTableDescriptor: undefined,
    columns: 512,
    decodeLevel: undefined,
    // @ts-expect-error jasmine matcher
    decodeTimeInMS: jasmine.any(Number),
    greenPaletteColorLookupTableData: undefined,
    greenPaletteColorLookupTableDescriptor: undefined,
    // @ts-expect-error jasmine matcher
    imageId: jasmine.any(String),
    largestPixelValue: 1378,
    photometricInterpretation: 'MONOCHROME2',
    // @ts-expect-error jasmine matcher
    pixelData: jasmine.any(Int16Array),
    pixelDataLength: 262144,
    pixelRepresentation: 1,
    planarConfiguration: undefined,
    preScale: {
      enabled: true,
      scalingParameters: {
        rescaleSlope: 1,
        rescaleIntercept: -1024,
        modality: 'CT',
      },
      scaled: true,
    },
    redPaletteColorLookupTableData: undefined,
    redPaletteColorLookupTableDescriptor: undefined,
    rows: 512,
    samplesPerPixel: 1,
    smallestPixelValue: -3024,
  },
  // @ts-expect-error jasmine matcher
  imageId: jasmine.any(String),
  intercept: -1024,
  invert: false,
  maxPixelValue: 1378,
  minPixelValue: -3024,
  numberOfComponents: 1,
  preScale: {
    enabled: true,
    scalingParameters: {
      rescaleSlope: 1,
      rescaleIntercept: -1024,
      modality: 'CT',
    },
    scaled: true,
  },
  rgba: false,
  rowPixelSpacing: 0.675781,
  rows: 512,
  sizeInBytes: 524288,
  slope: 1,
  voiLUTFunction: undefined,
  width: 512,
  windowCenter: 40,
  windowWidth: 400,
  // @todo - add tests for voxelManager.
  // @ts-expect-error jasmine matcher
  voxelManager: jasmine.any(Object),
  // @ts-expect-error jasmine matcher
  loadTimeInMS: jasmine.any(Number),
  totalTimeInMS: jasmine.any(Number),
  // @ts-expect-error jasmine matcher
  imageQualityStatus: jasmine.any(Number),
};

const WADO_URI_IMAGE_PLANE_MODULE: Types.ImagePlaneModule = {
  columnCosines: [0, 1, 0],
  columnPixelSpacing: 0.675781,
  columns: 512,
  frameOfReferenceUID:
    '1.2.840.113619.2.30.1.1762295590.1623.978668949.886.8493.0.12',
  // @ts-expect-error invalid type in ImagePlaneModule
  imageOrientationPatient: [1, 0, 0, 0, 1, 0],
  imagePositionPatient: [-161.399994, -148.800003, 4.7],
  pixelSpacing: [0.675781, 0.675781],
  rowCosines: [1, 0, 0],
  rowPixelSpacing: 0.675781,
  rows: 512,
  sliceLocation: 4.6999998093,
  sliceThickness: 5,
  usingDefaultValues: false,
};
// Should be `Types.ImagePixelModule` the actual metadata doesn't conform to it.
const WADO_URI_IMAGE_PIXEL_MODULE = {
  bitsAllocated: 16,
  bitsStored: 16,
  columns: 512,
  highBit: 15,
  largestPixelValue: undefined,
  photometricInterpretation: 'MONOCHROME2',
  pixelAspectRatio: undefined,
  pixelRepresentation: 1,
  planarConfiguration: undefined,
  rows: 512,
  samplesPerPixel: 1,
  smallestPixelValue: undefined,
};

/**
 * WADO-RS Pixel Module contains additional fields that are not present in
 * WADO-URI Pixel Module.
 */
const WADO_RS_IMAGE_PIXEL_MODULE = {
  ...WADO_URI_IMAGE_PIXEL_MODULE,
  bluePaletteColorLookupTableData: undefined,
  bluePaletteColorLookupTableDescriptor: undefined,
  greenPaletteColorLookupTableData: undefined,
  greenPaletteColorLookupTableDescriptor: undefined,
  redPaletteColorLookupTableData: undefined,
  redPaletteColorLookupTableDescriptor: undefined,
};

const IMAGE_HASH =
  'd36b58a8274fd5882a3863693bb84d2fb5719fff73c0ee21c98bfcb9abbb05c4';
const TEST_NAME =
  'CTImage.dcm_BigEndianExplicitTransferSyntax_1.2.840.10008.1.2.2';

export const WADOURI_TEST: IWadoUriTest = {
  name: TEST_NAME,
  wadouri: `wadouri:/testImages/CTImage.dcm_BigEndianExplicitTransferSyntax_1.2.840.10008.1.2.2.dcm`,
  frames: [
    {
      pixelDataHash: IMAGE_HASH,
      image: EXPECTED_IMAGE,
      metadataModule: {
        [Enums.MetadataModules.IMAGE_PIXEL]: WADO_URI_IMAGE_PIXEL_MODULE,
        [Enums.MetadataModules.IMAGE_PLANE]: WADO_URI_IMAGE_PLANE_MODULE,
      },
    },
  ],
};

export const WADO_RS_TEST: IWadoRsTest = {
  name: TEST_NAME,
  wadorsUrl: `wadors:/testImages/CTImage.dcm_BigEndianExplicitTransferSyntax_1.2.840.10008.1.2.2.dcm`,
  wadorsMetadata: tags,
  frames: [
    {
      pixelDataHash: IMAGE_HASH,
      metadataModule: {
        [Enums.MetadataModules.IMAGE_PIXEL]: WADO_RS_IMAGE_PIXEL_MODULE,
        [Enums.MetadataModules.IMAGE_PLANE]: WADO_URI_IMAGE_PLANE_MODULE,
      },
    },
  ],
};
