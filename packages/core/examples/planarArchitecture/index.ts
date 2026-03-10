import type { PlanarRenderMode } from '@cornerstonejs/core';
import { PlanarViewportV2 } from '@cornerstonejs/core';
import {
  createImageIdsAndCacheMetaData,
  ctVoiRange,
  initDemo,
  setTitleAndDescription,
} from '../../../../utils/demo/helpers';

console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const viewportId = 'planarViewportV2';
const renderMode =
  (new URLSearchParams(window.location.search).get(
    'renderMode'
  ) as PlanarRenderMode) || 'cpu2d';

setTitleAndDescription(
  'Planar Viewport Architecture POC',
  'Bare-minimum usage of the new ViewportV2 + PlanarViewportV2 proof of concept. Default render path is CPU canvas 2D; use ?renderMode=vtkImage or ?renderMode=vtkVolume to exercise the GPU paths.'
);

const content = document.getElementById('content');

if (!content) {
  throw new Error('Missing #content container');
}

const element = document.createElement('div');
element.style.width = '500px';
element.style.height = '500px';
element.style.background = '#000';
content.appendChild(element);

async function run() {
  await initDemo();

  const imageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.334240657131972136850343327463',
    SeriesInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.226151125820845824875394858561',
    wadoRsRoot: 'https://d14fa38qiwhyfd.cloudfront.net/dicomweb',
  });
  const viewport = new PlanarViewportV2({
    id: viewportId,
    element,
    background: [0.2, 0, 0.2],
  });

  await viewport.setStack(imageIds.slice(0, 3), {
    renderMode,
  });
  viewport.setProperties({
    voiRange: ctVoiRange,
  });
  viewport.render();
}

run();
