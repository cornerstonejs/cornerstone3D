import { WSIViewportV2 } from '@cornerstonejs/core';
import dicomImageLoader from '@cornerstonejs/dicom-image-loader';
import { api } from 'dicomweb-client';
import {
  createImageIdsAndCacheMetaData,
  getLocalUrl,
  initDemo,
  setTitleAndDescription,
} from '../../../../utils/demo/helpers';

console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const { wadors } = dicomImageLoader;
const viewportId = 'wsiViewportV2';

setTitleAndDescription(
  'WSI Viewport Architecture POC',
  'Bare-minimum usage of the new ViewportV2 + WSIViewportV2 proof of concept.'
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

  const wadoRsRoot =
    getLocalUrl() || 'https://d14fa38qiwhyfd.cloudfront.net/dicomweb';
  const client = new api.DICOMwebClient({ url: wadoRsRoot });
  const imageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID: '2.25.269859997690759739055099378767846712697',
    SeriesInstanceUID: '2.25.274641717059635090989922952756233538416',
    client,
    wadoRsRoot,
    convertMultiframe: false,
  });

  client.getDICOMwebMetadata = (imageId) => wadors.metaDataManager.get(imageId);

  const viewport = new WSIViewportV2({
    id: viewportId,
    element,
  });

  await viewport.setDataIds(imageIds, {
    webClient: client,
  });
}

run();
