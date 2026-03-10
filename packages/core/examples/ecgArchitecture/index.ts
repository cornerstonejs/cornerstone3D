import { ECGViewportV2, utilities } from '@cornerstonejs/core';
import {
  createImageIdsAndCacheMetaData,
  getLocalUrl,
  initDemo,
  setTitleAndDescription,
} from '../../../../utils/demo/helpers';

console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const viewportId = 'ecgViewportV2';

const StudyInstanceUID = '1.3.76.13.65829.2.20130125082826.1072139.2';
const SeriesInstanceUID = '1.3.6.1.4.1.20029.40.20130125105919.5407.1';
const wadoRsRoot =
  getLocalUrl() || 'https://d14fa38qiwhyfd.cloudfront.net/dicomweb';

setTitleAndDescription(
  'ECG Viewport Architecture POC',
  'Bare-minimum usage of the new ViewportV2 + ECGViewportV2 proof of concept.'
);

const content = document.getElementById('content');

if (!content) {
  throw new Error('Missing #content container');
}

const element = document.createElement('div');
element.style.width = '960px';
element.style.height = '640px';
element.style.background = '#000';
content.appendChild(element);

async function run() {
  await initDemo();

  const imageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID,
    SeriesInstanceUID,
    wadoRsRoot,
  });

  const viewport = new ECGViewportV2({
    id: viewportId,
    element,
  });

  utilities.viewportV2DataSetMetadataProvider.add('ecg-demo', imageIds[0]);
  await viewport.setDataIds(['ecg-demo']);
}

run();
