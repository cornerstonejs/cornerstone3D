import type { Types, VideoGenericViewport } from '@cornerstonejs/core';
import {
  RenderingEngine,
  Enums,
  getRenderingEngine,
  viewportProjection,
  utilities,
} from '@cornerstonejs/core';
import * as cornerstoneTools from '@cornerstonejs/tools';
import {
  initDemo,
  setTitleAndDescription,
  addButtonToToolbar,
  createImageIdsAndCacheMetaData,
  getLocalUrl,
} from '../../../../utils/demo/helpers';

// This is for debugging purposes
console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const { ViewportType, Events } = Enums;
const { ToolGroupManager } = cornerstoneTools;

const renderingEngineId = 'myRenderingEngine';
const viewportId = 'videoGenericViewport';
const toolGroupId = 'videoNextToolGroup';
const videoDataId = 'video-next:primary';

setTitleAndDescription(
  'Video GenericViewport API',
  'Demonstrates the clean GenericViewport video API using dataset registration and setDataList. Right-drag to pan, scroll to zoom.'
);

const content = document.getElementById('content');
const element = document.createElement('div');
element.id = 'cornerstone-element';
element.style.width = '512px';
element.style.height = '512px';

content.appendChild(element);

element.oncontextmenu = (e) => e.preventDefault();

const info = document.createElement('div');
content.appendChild(info);

const rotationInfo = document.createElement('div');
info.appendChild(rotationInfo);

const zoomInfo = document.createElement('div');
info.appendChild(zoomInfo);

const panInfo = document.createElement('div');
info.appendChild(panInfo);

const flipHorizontalInfo = document.createElement('div');
info.appendChild(flipHorizontalInfo);

const flipVerticalInfo = document.createElement('div');
info.appendChild(flipVerticalInfo);

element.addEventListener(Events.CAMERA_MODIFIED, () => {
  const renderingEngine = getRenderingEngine(renderingEngineId);
  const viewport =
    renderingEngine.getViewport<VideoGenericViewport>(viewportId);

  if (!viewport) {
    return;
  }

  const { flipHorizontal = false, flipVertical = false } =
    viewport.getViewState();
  const { rotation, zoom } =
    viewportProjection.getPresentation<Types.ViewPresentation>(viewport) || {};
  const currentPan = viewport.getPan();

  rotationInfo.innerText = `Rotation: ${Math.round(rotation || 0)}`;
  zoomInfo.innerText = `Zoom: ${(zoom ?? viewport.getZoom()).toFixed(2)}`;
  panInfo.innerText = `Pan: [${Math.round(currentPan[0])}, ${Math.round(currentPan[1])}]`;
  flipHorizontalInfo.innerText = `Flip horizontal: ${flipHorizontal}`;
  flipVerticalInfo.innerText = `Flip vertical: ${flipVertical}`;
});

addButtonToToolbar({
  title: 'Play',
  onClick: () => {
    const renderingEngine = getRenderingEngine(renderingEngineId);
    const viewport = renderingEngine.getViewport(
      viewportId
    ) as VideoGenericViewport;

    viewport.play();
  },
});

addButtonToToolbar({
  title: 'Pause',
  onClick: () => {
    const renderingEngine = getRenderingEngine(renderingEngineId);
    const viewport = renderingEngine.getViewport(
      viewportId
    ) as VideoGenericViewport;

    viewport.pause();
  },
});

addButtonToToolbar({
  title: 'Reset View',
  onClick: () => {
    const renderingEngine = getRenderingEngine(renderingEngineId);
    const viewport = renderingEngine.getViewport(
      viewportId
    ) as VideoGenericViewport;

    viewport.resetCamera();
  },
});

async function run() {
  await initDemo();

  const { PanTool, ZoomTool } = cornerstoneTools;
  const { MouseBindings } = cornerstoneTools.Enums;

  cornerstoneTools.addTool(PanTool);
  cornerstoneTools.addTool(ZoomTool);

  const toolGroup = ToolGroupManager.createToolGroup(toolGroupId);
  toolGroup.addTool(PanTool.toolName);
  toolGroup.addTool(ZoomTool.toolName, {
    minZoomScale: 0.001,
    maxZoomScale: 4000,
  });

  toolGroup.setToolActive(PanTool.toolName, {
    bindings: [{ mouseButton: MouseBindings.Secondary }],
  });
  toolGroup.setToolActive(ZoomTool.toolName, {
    bindings: [{ mouseButton: MouseBindings.Wheel }],
  });

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
    type: ViewportType.VIDEO_NEXT,
    element,
    defaultOptions: {
      background: [0, 0.2, 0] as Types.Point3,
    },
  });

  toolGroup.addViewport(viewportId, renderingEngineId);

  const viewport =
    renderingEngine.getViewport<VideoGenericViewport>(viewportId);

  utilities.genericViewportDataSetMetadataProvider.add(videoDataId, {
    kind: 'video',
    sourceDataId: videoId,
  });

  await viewport.setDataList([{ dataId: videoDataId }]);
}

run();
