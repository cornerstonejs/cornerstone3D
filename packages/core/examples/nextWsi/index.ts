import type { Types, WSIViewportNext } from '@cornerstonejs/core';
import {
  RenderingEngine,
  Enums,
  getRenderingEngine,
  utilities,
} from '@cornerstonejs/core';
import * as cornerstoneTools from '@cornerstonejs/tools';
import dicomImageLoader from '@cornerstonejs/dicom-image-loader';
import { api } from 'dicomweb-client';

import {
  initDemo,
  setTitleAndDescription,
  createImageIdsAndCacheMetaData,
  getLocalUrl,
  addButtonToToolbar,
  addManipulationBindings,
} from '../../../../utils/demo/helpers';
import { getBooleanUrlParam } from '../../../../utils/demo/helpers/exampleParameters';

// This is for debugging purposes
console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const { ToolGroupManager } = cornerstoneTools;
const { wadors } = dicomImageLoader;
const { ViewportType } = Enums;

const renderingEngineId = 'myRenderingEngine';
const viewportId = 'wsiNextViewport';
const wsiDataId = 'wsi-next:primary';

function getNextExampleBackground(): Types.Point3 {
  return getBooleanUrlParam('cpu') ? [0, 0, 0] : [0, 0.2, 0];
}

setTitleAndDescription(
  'WSI ViewportNext',
  'Demonstrates whole slide imaging with the clean ViewportNext WSI API.'
);

addButtonToToolbar({
  title: 'Zoom In',
  onClick: () => {
    const renderingEngine = getRenderingEngine(renderingEngineId);
    const viewport = renderingEngine.getViewport(viewportId) as WSIViewportNext;

    viewport.setZoom(2 * viewport.getZoom());
    viewport.render();
  },
});

addButtonToToolbar({
  title: 'Disable Viewport',
  onClick: () => {
    const renderingEngine = getRenderingEngine(renderingEngineId);
    renderingEngine?.disableElement(viewportId);
  },
});

const content = document.getElementById('content');
const element = document.createElement('div');
element.id = 'cornerstone-element';
element.oncontextmenu = () => false;
element.style.width = '500px';
element.style.height = '500px';

content.appendChild(element);

function createToolGroup(toolGroupId = 'default') {
  const toolGroup = ToolGroupManager.createToolGroup(toolGroupId);
  addManipulationBindings(toolGroup);

  return toolGroup;
}

async function run() {
  await initDemo();

  const toolGroupId = 'default';
  const toolGroup = createToolGroup(toolGroupId);

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

  const renderingEngine = new RenderingEngine(renderingEngineId);

  renderingEngine.enableElement({
    viewportId,
    type: ViewportType.WHOLE_SLIDE_V2,
    element,
    defaultOptions: {
      background: getNextExampleBackground(),
    },
  });

  const viewport = renderingEngine.getViewport(viewportId) as WSIViewportNext;

  client.getDICOMwebMetadata = (imageId) => wadors.metaDataManager.get(imageId);

  utilities.viewportNextDataSetMetadataProvider.add(wsiDataId, {
    imageIds,
    kind: 'wsi',
    options: { webClient: client },
  });
  await viewport.setDataList([{ dataId: wsiDataId }]);

  toolGroup.addViewport(viewportId, renderingEngineId);
}

run();
