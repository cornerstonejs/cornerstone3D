import type { IWadoRsTest, IWadoUriTest } from './tests.models';

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
    },
  ],
};

export const WADO_RS_TEST: IWadoRsTest = {
  name: TEST_NAME,
  wadorsUrl: `wadors:/testImages/CTImage.dcm_BigEndianExplicitTransferSyntax_1.2.840.10008.1.2.2.dcm`,
  frames: [
    {
      pixelDataHash: IMAGE_HASH,
    },
  ],
};
