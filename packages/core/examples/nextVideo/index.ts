import type { Types, VideoViewportNext } from '@cornerstonejs/core';
import {
  RenderingEngine,
  Enums,
  getRenderingEngine,
  utilities,
} from '@cornerstonejs/core';
import {
  initDemo,
  setTitleAndDescription,
  addButtonToToolbar,
  createImageIdsAndCacheMetaData,
  getLocalUrl,
} from '../../../../utils/demo/helpers';
import { getBooleanUrlParam } from '../../../../utils/demo/helpers/exampleParameters';

// This is for debugging purposes
console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const { ViewportType, Events } = Enums;

const renderingEngineId = 'myRenderingEngine';
const viewportId = 'videoNextViewport';
const videoDataId = 'video-next:primary';

function getNextExampleBackground(): Types.Point3 {
  return getBooleanUrlParam('cpu') ? [0, 0, 0] : [0, 0.2, 0];
}

setTitleAndDescription(
  'Video ViewportNext API',
  'Demonstrates the clean ViewportNext video API using dataset registration and setDataList.'
);

const content = document.getElementById('content');
const element = document.createElement('div');
element.id = 'cornerstone-element';
element.style.width = '500px';
element.style.height = '500px';

content.appendChild(element);

const info = document.createElement('div');
content.appendChild(info);

const rotationInfo = document.createElement('div');
info.appendChild(rotationInfo);

const flipHorizontalInfo = document.createElement('div');
info.appendChild(flipHorizontalInfo);

const flipVerticalInfo = document.createElement('div');
info.appendChild(flipVerticalInfo);

element.addEventListener(Events.CAMERA_MODIFIED, () => {
  const renderingEngine = getRenderingEngine(renderingEngineId);
  const viewport = renderingEngine.getViewport<VideoViewportNext>(viewportId);

  if (!viewport) {
    return;
  }

  const { flipHorizontal, flipVertical } = viewport.getCamera();
  const { rotation } = viewport.getViewPresentation();

  rotationInfo.innerText = `Rotation: ${Math.round(rotation || 0)}`;
  flipHorizontalInfo.innerText = `Flip horizontal: ${flipHorizontal}`;
  flipVerticalInfo.innerText = `Flip vertical: ${flipVertical}`;
});

addButtonToToolbar({
  title: 'Play',
  onClick: () => {
    const renderingEngine = getRenderingEngine(renderingEngineId);
    const viewport = renderingEngine.getViewport(
      viewportId
    ) as VideoViewportNext;

    viewport.play();
  },
});

addButtonToToolbar({
  title: 'Pause',
  onClick: () => {
    const renderingEngine = getRenderingEngine(renderingEngineId);
    const viewport = renderingEngine.getViewport(
      viewportId
    ) as VideoViewportNext;

    viewport.pause();
  },
});

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
    throw new Error('Unable to locate the video dataset for the example.');
  }

  const renderingEngine = new RenderingEngine(renderingEngineId);

  renderingEngine.enableElement({
    viewportId,
    type: ViewportType.VIDEO_V2,
    element,
    defaultOptions: {
      background: getNextExampleBackground(),
    },
  });

  const viewport = renderingEngine.getViewport<VideoViewportNext>(viewportId);

  utilities.viewportNextDataSetMetadataProvider.add(videoDataId, {
    kind: 'video',
    sourceDataId: videoId,
  });

  await viewport.setDataList([{ dataId: videoDataId }]);
}

run();
