import { RenderingEngine, Enums, imageLoader } from '@cornerstonejs/core';
import {
  cornerstoneNiftiImageLoader,
  createNiftiImageIdsAndCacheMetadata,
} from '@cornerstonejs/nifti-volume-loader';
import { initDemo } from '../../../../utils/demo/helpers';

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

const niftiURL =
  'https://ohif-assets.s3.us-east-2.amazonaws.com/nifti/CTACardio.nii.gz';

async function setup() {
  await initDemo();

  imageLoader.registerImageLoader('nifti', cornerstoneNiftiImageLoader);

  const imageIds = await createNiftiImageIdsAndCacheMetadata({ url: niftiURL });

  const renderingEngineId = 'myRenderingEngine';
  const renderingEngine = new RenderingEngine(renderingEngineId);

  const viewportInputArray = [
    {
      viewportId: viewportId1,
      type: Enums.ViewportType.STACK,
      element: element1,
    },
  ];

  renderingEngine.setViewports(viewportInputArray);

  const vps = renderingEngine.getStackViewports();
  const viewport = vps[0];

  viewport.setStack(imageIds);

  renderingEngine.render();
}

setup();
