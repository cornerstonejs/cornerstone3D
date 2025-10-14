import type { IWadoRsTest, IWadoUriTest } from './tests.models';

const IMAGE_HASH =
  'db754473cb0f7754a77e709c199e787285f68beb675a934f8d4567328ab8f107';
const TEST_NAME = 'JPEG Lossless RGB';

export const WADOURI_TEST: IWadoUriTest = {
  name: TEST_NAME,
  wadouri: `wadouri:/testImages/TestPattern_JPEG-Lossless_RGB.dcm`,
  frames: [
    {
      pixelDataHash: IMAGE_HASH,
    },
  ],
};

export const WADO_RS_TEST: IWadoRsTest = {
  name: TEST_NAME,
  wadorsUrl: `wadors:/testImages/TestPattern_JPEG-Lossless_RGB.dcm`,
  frames: [
    {
      pixelDataHash: IMAGE_HASH,
    },
  ],
};
