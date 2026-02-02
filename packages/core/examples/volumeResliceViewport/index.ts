import type { Types } from '@cornerstonejs/core';
import {
  RenderingEngine,
  Enums,
  volumeLoader,
  setVolumesForViewports,
} from '@cornerstonejs/core';
import {
  initDemo,
  createImageIdsAndCacheMetaData,
  setTitleAndDescription,
  setCtTransferFunctionForVolumeActor,
} from '../../../../utils/demo/helpers';

// This is for debugging purposes
console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const { ViewportType } = Enums;

const renderingEngineId = 'myRenderingEngine';
const volumeName = 'CT_VOLUME_ID';
const volumeLoaderScheme = 'cornerstoneStreamingImageVolume';
const volumeId = `${volumeLoaderScheme}:${volumeName}`;

const viewportIds = {
  axial: 'AXIAL_SLICE',
  sagittal: 'SAGITTAL_SLICE',
  coronal: 'CORONAL_SLICE',
};

setTitleAndDescription(
  'Volume Reslice Viewport',
  'Displays axial, sagittal, and coronal slice viewports using ImageResliceMapper.'
);

const content = document.getElementById('content');
const container = document.createElement('div');
container.style.display = 'grid';
container.style.gridTemplateColumns = 'repeat(3, 1fr)';
container.style.gap = '5px';
container.style.width = '100%';
container.style.height = '500px';

const axialElement = document.createElement('div');
axialElement.id = 'axial-element';
axialElement.style.width = '100%';
axialElement.style.height = '100%';

const sagittalElement = document.createElement('div');
sagittalElement.id = 'sagittal-element';
sagittalElement.style.width = '100%';
sagittalElement.style.height = '100%';

const coronalElement = document.createElement('div');
coronalElement.id = 'coronal-element';
coronalElement.style.width = '100%';
coronalElement.style.height = '100%';

container.appendChild(axialElement);
container.appendChild(sagittalElement);
container.appendChild(coronalElement);
content.appendChild(container);

async function run() {
  await initDemo({
    core: {
      rendering: {
        renderingEngineMode: Enums.RenderingEngineModeEnum.Direct,
      },
    },
  });

  const imageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.334240657131972136850343327463',
    SeriesInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.226151125820845824875394858561',
    wadoRsRoot: 'https://d14fa38qiwhyfd.cloudfront.net/dicomweb',
  });

  const renderingEngine = new RenderingEngine(renderingEngineId);

  const viewportInputs = [
    {
      viewportId: viewportIds.axial,
      type: ViewportType.VOLUME_SLICE,
      element: axialElement,
      defaultOptions: {
        orientation: Enums.OrientationAxis.AXIAL,
        background: [0, 0, 0] as Types.Point3,
      },
    },
    {
      viewportId: viewportIds.sagittal,
      type: ViewportType.VOLUME_SLICE,
      element: sagittalElement,
      defaultOptions: {
        orientation: Enums.OrientationAxis.SAGITTAL,
        background: [0, 0, 0] as Types.Point3,
      },
    },
    {
      viewportId: viewportIds.coronal,
      type: ViewportType.VOLUME_SLICE,
      element: coronalElement,
      defaultOptions: {
        orientation: Enums.OrientationAxis.CORONAL,
        background: [0, 0, 0] as Types.Point3,
      },
    },
  ];

  renderingEngine.setViewports(viewportInputs);

  const volume = await volumeLoader.createAndCacheVolume(volumeId, {
    imageIds,
  });
  volume.load();

  await setVolumesForViewports(
    renderingEngine,
    [{ volumeId, callback: setCtTransferFunctionForVolumeActor }],
    Object.values(viewportIds)
  );

  renderingEngine.renderViewports(Object.values(viewportIds));
}

run();
