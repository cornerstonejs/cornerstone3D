import type { IWadoRsTest, IWadoUriTest } from './tests.models';

const IMAGE_HASH =
  '7e07e65b853f83c2239a253037dd29278d22638fbaaa8d80e7ae31f300606586';
const TEST_NAME = 'JPEG Baseline YBR Full';

export const WADOURI_TEST: IWadoUriTest = {
  name: TEST_NAME,
  wadouri: `wadouri:/testImages/TestPattern_JPEG-Baseline_YBRFull.dcm`,
  frames: [
    {
      pixelDataHash: IMAGE_HASH,
    },
  ],
};

export const WADO_RS_TEST: IWadoRsTest = {
  name: TEST_NAME,
  wadorsUrl: `wadors:/testImages/TestPattern_JPEG-Baseline_YBRFull.dcm`,
  frames: [
    {
      pixelDataHash: IMAGE_HASH,
    },
  ],
};
