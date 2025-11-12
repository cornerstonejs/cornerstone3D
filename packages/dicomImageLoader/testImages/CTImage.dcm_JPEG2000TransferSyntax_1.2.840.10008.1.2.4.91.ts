import type { IWadoRsTest, IWadoUriTest } from './tests.models';

const IMAGE_HASH =
  '0c1d1516c0619ce2482ae7aa6d45b099c83d29cd55c398626b5b07c607771b4c';
const TEST_NAME = 'CTImage.dcm_JPEG2000TransferSyntax_1.2.840.10008.1.2.4.91';

export const WADOURI_TEST: IWadoUriTest = {
  name: TEST_NAME,
  wadouri: `wadouri:/testImages/CTImage.dcm_JPEG2000TransferSyntax_1.2.840.10008.1.2.4.91.dcm`,
  frames: [
    {
      pixelDataHash: IMAGE_HASH,
    },
  ],
};

export const WADO_RS_TEST: IWadoRsTest = {
  name: TEST_NAME,
  wadorsUrl: `wadors:/testImages/CTImage.dcm_JPEG2000TransferSyntax_1.2.840.10008.1.2.4.91.dcm`,
  frames: [
    {
      pixelDataHash: IMAGE_HASH,
    },
  ],
};
