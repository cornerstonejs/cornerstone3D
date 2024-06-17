import {
  RenderingEngine,
  Enums,
  init as csInit,
  volumeLoader,
  setVolumesForViewports,
} from '@cornerstonejs/core';
import { init as csTools3dInit } from '@cornerstonejs/tools';
import { cornerstoneNiftiImageVolumeLoader } from '@cornerstonejs/nifti-volume-loader';

// This is for debugging purposes
console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const size = '500px';

const content = document.getElementById('content');
const viewportGrid = document.createElement('div');
viewportGrid.style.display = 'flex';
viewportGrid.style.display = 'flex';
viewportGrid.style.flexDirection = 'row';

const element1 = document.createElement('div');
const element2 = document.createElement('div');
const element3 = document.createElement('div');
element1.style.width = size;
element1.style.height = size;
element2.style.width = size;
element2.style.height = size;
element3.style.width = size;
element3.style.height = size;

viewportGrid.appendChild(element1);
viewportGrid.appendChild(element2);
viewportGrid.appendChild(element3);

content.appendChild(viewportGrid);

const viewportId1 = 'CT_NIFTI_AXIAL';
const viewportId2 = 'CT_NIFTI_SAGITTAL';
const viewportId3 = 'CT_NIFTI_CORONAL';

async function setup() {
  await csInit();
  await csTools3dInit();

  volumeLoader.registerVolumeLoader('nifti', cornerstoneNiftiImageVolumeLoader);

  const niftiURL =
    'https://ohif-assets.s3.us-east-2.amazonaws.com/nifti/MRHead.nii.gz';
  const volumeId = 'nifti:' + niftiURL;

  const volume = await volumeLoader.createAndCacheVolume(volumeId);

  const renderingEngineId = 'myRenderingEngine';
  const renderingEngine = new RenderingEngine(renderingEngineId);

  const viewportInputArray = [
    {
      viewportId: viewportId1,
      type: Enums.ViewportType.ORTHOGRAPHIC,
      element: element1,
      defaultOptions: {
        orientation: Enums.OrientationAxis.AXIAL,
      },
    },
    {
      viewportId: viewportId2,
      type: Enums.ViewportType.ORTHOGRAPHIC,
      element: element2,
      defaultOptions: {
        orientation: Enums.OrientationAxis.SAGITTAL,
      },
    },
    {
      viewportId: viewportId3,
      type: Enums.ViewportType.ORTHOGRAPHIC,
      element: element3,
      defaultOptions: {
        orientation: Enums.OrientationAxis.CORONAL,
      },
    },
  ];

  renderingEngine.setViewports(viewportInputArray);

  setVolumesForViewports(
    renderingEngine,
    [{ volumeId }],
    viewportInputArray.map((v) => v.viewportId)
  );

  renderingEngine.render();
}

setup();
