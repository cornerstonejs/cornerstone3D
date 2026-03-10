import { VideoViewportV2 } from '@cornerstonejs/core';
import {
  createImageIdsAndCacheMetaData,
  getLocalUrl,
  initDemo,
  setTitleAndDescription,
} from '../../../../utils/demo/helpers';

console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const viewportId = 'videoViewportV2';

setTitleAndDescription(
  'Video Viewport Architecture POC',
  'Bare-minimum usage of the new ViewportV2 + VideoViewportV2 proof of concept.'
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
    StudyInstanceUID: '2.25.96975534054447904995905761963464388233',
    SeriesInstanceUID: '2.25.15054212212536476297201250326674987992',
    wadoRsRoot:
      getLocalUrl() || 'https://d14fa38qiwhyfd.cloudfront.net/dicomweb',
  });

  const videoId = imageIds.find((it) =>
    it.includes('2.25.179478223177027022014772769075050874231')
  );

  if (!videoId) {
    throw new Error('Missing sample video imageId');
  }

  const viewport = new VideoViewportV2({
    id: viewportId,
    element,
  });

  await viewport.setVideo(videoId);
  await viewport.play();
}

run();
