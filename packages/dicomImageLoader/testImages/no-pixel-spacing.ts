import { Enums, type Types } from '@cornerstonejs/core';
import { tags } from './no-pixel-spacing.wado-rs-tags';
import type { IWadoRsTest, IWadoUriTest } from './tests.models';

const WADO_RS_IMAGE_PLANE_MODULE: Types.ImagePlaneModule = {
  columnCosines: [0, 1, 0],
  columnPixelSpacing: 1,
  columns: 800,
  frameOfReferenceUID: undefined,
  // @ts-expect-error Incorrect type in core
  imageOrientationPatient: [1, 0, 0, 0, 1, 0],
  imagePositionPatient: [0, 0, 0],
  pixelSpacing: undefined,
  rowCosines: [1, 0, 0],
  rowPixelSpacing: 1,
  rows: 600,
  sliceLocation: undefined,
  sliceThickness: undefined,
  usingDefaultValues: true,
};

/**
 * WADO-URI Image Plan Module returns different values for some fields
 */
const WADO_URI_IMAGE_PLANE_MODULE: Types.ImagePlaneModule = {
  ...WADO_RS_IMAGE_PLANE_MODULE,
  columnCosines: null,
  imageOrientationPatient: undefined,
  imagePositionPatient: undefined,
  rowCosines: null,
};

const WADO_RS_IMAGE_PIXEL_MODULE: Types.ImagePixelModule = {
  bitsAllocated: 8,
  bitsStored: 8,
  // @ts-expect-error Types.ImagePixelModule is missing bluePaletteColorLookupTableData
  // greenPaletteColorLookupTableData, redPaletteColorLookupTableData
  bluePaletteColorLookupTableData: undefined,
  bluePaletteColorLookupTableDescriptor: [256, 0, 16],
  columns: 800,
  greenPaletteColorLookupTableData: undefined,
  greenPaletteColorLookupTableDescriptor: [256, 0, 16],
  highBit: 7,
  largestPixelValue: undefined,
  photometricInterpretation: 'PALETTE COLOR',
  pixelAspectRatio: undefined,
  pixelRepresentation: 0,
  planarConfiguration: undefined,
  redPaletteColorLookupTableData: undefined,
  redPaletteColorLookupTableDescriptor: [256, 0, 16],
  rows: 600,
  samplesPerPixel: 1,
  smallestPixelValue: undefined,
};

/**
 * WADO-URI Pixel Module returns arrays for the
 * blue/gree/redPaletteColorLookupTableData where as WADO-RS returns undefined.
 *
 * Match using `jasmine.any(Array)` to just check that an array is returned.
 */
const WADO_URI_IMAGE_PIXEL_MODULE = {
  ...WADO_RS_IMAGE_PIXEL_MODULE,
  bluePaletteColorLookupTableData: jasmine.any(Array),
  greenPaletteColorLookupTableData: jasmine.any(Array),
  redPaletteColorLookupTableData: jasmine.any(Array),
};

const IMAGE_HASH =
  'd4c564cf88bf9fe0654d380ad45744c9579b4e456150e40e5577f87103949c4a';
const TEST_NAME = 'No Pixel Spacing';

export const WADOURI_TEST: IWadoUriTest = {
  name: TEST_NAME,
  wadouri: `wadouri:/testImages/no-pixel-spacing.dcm`,
  frames: [
    {
      pixelDataHash: IMAGE_HASH,
      metadataModule: {
        [Enums.MetadataModules.IMAGE_PLANE]: WADO_URI_IMAGE_PLANE_MODULE,
        [Enums.MetadataModules.IMAGE_PIXEL]: WADO_URI_IMAGE_PIXEL_MODULE,
      },
    },
  ],
};

export const WADO_RS_TEST: IWadoRsTest = {
  name: TEST_NAME,
  wadorsUrl: `wadors:/testImages/no-pixel-spacing.dcm`,
  wadorsMetadata: tags,
  frames: [
    {
      pixelDataHash: IMAGE_HASH,
      metadataModule: {
        [Enums.MetadataModules.IMAGE_PLANE]: WADO_RS_IMAGE_PLANE_MODULE,
        [Enums.MetadataModules.IMAGE_PIXEL]: WADO_RS_IMAGE_PIXEL_MODULE,
      },
    },
  ],
};
