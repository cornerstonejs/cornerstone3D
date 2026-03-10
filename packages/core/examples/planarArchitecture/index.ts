import type { PlanarRenderMode } from '@cornerstonejs/core';
import {
  Enums,
  PlanarViewportV2,
  RenderingEngineV2,
} from '@cornerstonejs/core';
import {
  createImageIdsAndCacheMetaData,
  ctVoiRange,
  initDemo,
  setTitleAndDescription,
} from '../../../../utils/demo/helpers';

type PlanarOrientation =
  | Enums.OrientationAxis.AXIAL
  | Enums.OrientationAxis.CORONAL
  | Enums.OrientationAxis.SAGITTAL;

console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const viewportId = 'planarViewportV2';
const orientation =
  (new URLSearchParams(window.location.search).get(
    'orientation'
  ) as PlanarOrientation) || Enums.OrientationAxis.AXIAL;
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

function addOrientationSelector(viewport: PlanarViewportV2) {
  if (renderMode !== 'vtkVolume') {
    return;
  }

  const controls = document.createElement('div');
  controls.style.display = 'flex';
  controls.style.gap = '8px';
  controls.style.marginBottom = '12px';

  const label = document.createElement('label');
  label.textContent = 'Orientation';
  label.style.color = '#fff';

  const select = document.createElement('select');
  select.innerHTML = `
    <option value="${Enums.OrientationAxis.AXIAL}">Axial</option>
    <option value="${Enums.OrientationAxis.CORONAL}">Coronal</option>
    <option value="${Enums.OrientationAxis.SAGITTAL}">Sagittal</option>
  `;
  select.value = orientation;
  select.onchange = () => {
    viewport.setOrientation(select.value as PlanarOrientation);
  };

  controls.appendChild(label);
  controls.appendChild(select);
  content.insertBefore(controls, element);
}

async function run() {
  await initDemo();

  const imageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.334240657131972136850343327463',
    SeriesInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.226151125820845824875394858561',
    wadoRsRoot: 'https://d14fa38qiwhyfd.cloudfront.net/dicomweb',
  });
  const renderingEngine = new RenderingEngineV2('renderingEngineV2');
  renderingEngine.enableViewport({
    viewportId,
    type: Enums.ViewportType.PLANAR_V2,
    element,
    defaultOptions: {
      background: [0.2, 0, 0.2],
    },
  });
  const viewport = renderingEngine.getViewport(viewportId) as PlanarViewportV2;
  const stackImageIds =
    renderMode === 'vtkVolume' ? imageIds : imageIds.slice(0, 3);

  await viewport.setStack(stackImageIds, {
    renderMode,
  });
  viewport.setOrientation(orientation);
  viewport.setProperties({
    voiRange: ctVoiRange,
  });
  addOrientationSelector(viewport);
  viewport.render();
}

run();
