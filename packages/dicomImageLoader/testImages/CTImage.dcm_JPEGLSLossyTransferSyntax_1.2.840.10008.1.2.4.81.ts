import type { IWadoRsTest, IWadoUriTest } from './tests.models';

const IMAGE_HASH =
  '24558c9527160735784e5601f29a15b6939a213f141f871c7c4cfcc639ada493';
const TEST_NAME =
  'CTImage.dcm_JPEGLSLossyTransferSyntax_1.2.840.10008.1.2.4.81';

export const WADOURI_TEST: IWadoUriTest = {
  name: TEST_NAME,
  wadouri: `wadouri:/testImages/CTImage.dcm_JPEGLSLossyTransferSyntax_1.2.840.10008.1.2.4.81.dcm`,
  frames: [
    {
      pixelDataHash: IMAGE_HASH,
    },
  ],
};

export const WADO_RS_TEST: IWadoRsTest = {
  name: TEST_NAME,
  wadorsUrl: `wadors:/testImages/CTImage.dcm_JPEGLSLossyTransferSyntax_1.2.840.10008.1.2.4.81.dcm`,
  frames: [
    {
      pixelDataHash: IMAGE_HASH,
    },
  ],
};
