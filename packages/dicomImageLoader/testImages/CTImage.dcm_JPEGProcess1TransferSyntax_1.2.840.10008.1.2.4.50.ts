import type { IWadoRsTest, IWadoUriTest } from './tests.models';

const IMAGE_HASH =
  'e3f2fc815cfd235d2c3873ef35cff6771a11ba3b2bc77fa6ade776bb64174c5a';
const TEST_NAME =
  'CTImage.dcm_JPEGProcess1TransferSyntax_1.2.840.10008.1.2.4.50';

export const WADOURI_TEST: IWadoUriTest = {
  name: TEST_NAME,
  wadouri: `wadouri:/testImages/CTImage.dcm_JPEGProcess1TransferSyntax_1.2.840.10008.1.2.4.50.dcm`,
  frames: [
    {
      pixelDataHash: IMAGE_HASH,
    },
  ],
};

export const WADO_RS_TEST: IWadoRsTest = {
  name: TEST_NAME,
  wadorsUrl: `wadors:/testImages/CTImage.dcm_JPEGProcess1TransferSyntax_1.2.840.10008.1.2.4.50.dcm`,
  frames: [
    {
      pixelDataHash: IMAGE_HASH,
    },
  ],
};
