import {
  RenderingEngine,
  Types,
  Enums,
  setVolumesForViewports,
  volumeLoader,
  getRenderingEngine,
} from '@cornerstonejs/core';
import {
  initDemo,
  createImageIdsAndCacheMetaData,
  setTitleAndDescription,
  setCtTransferFunctionForVolumeActor,
  addDropdownToToolbar,
} from '../../../../utils/demo/helpers';
import * as cornerstoneTools from '@cornerstonejs/tools';

// This is for debugging purposes
console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const {
  ToolGroupManager,
  Enums: csToolsEnums,
  CrosshairsTool,
  StackScrollMouseWheelTool,
  ZoomTool,
} = cornerstoneTools;

const { MouseBindings } = csToolsEnums;
const { ViewportType } = Enums;

// Define a unique id for the volume
const volumeName = 'CT_VOLUME_ID'; // Id of the volume less loader prefix
const volumeLoaderScheme = 'cornerstoneStreamingImageVolume'; // Loader id which defines which volume loader to use
const volumeId = `${volumeLoaderScheme}:${volumeName}`; // VolumeId with loader id + volume id
const toolGroupId = 'MY_TOOLGROUP_ID';

// ======== Set up page ======== //
setTitleAndDescription(
  'Crosshairs',
  'Here we demonstrate crosshairs linking three orthogonal views of the same data. You can select the blend mode that will be used if you modify the slab thickness of the crosshairs by dragging the control points.'
);

const size = '500px';
const content = document.getElementById('content');
const reloadButton = document.createElement('button');
reloadButton.innerHTML = 'Reload Image';
reloadButton.addEventListener('click', () => {
  run(
    Math.random(),
    '1.3.6.1.4.1.14519.5.2.1.7009.2403.334240657131972136850343327463',
    '1.3.6.1.4.1.14519.5.2.1.7009.2403.226151125820845824875394858561',
    'https://d3t6nz73ql33tx.cloudfront.net/dicomweb'
  );
});
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

// Disable right click context menu so we can have right click tools
element1.oncontextmenu = (e) => e.preventDefault();
element2.oncontextmenu = (e) => e.preventDefault();
element3.oncontextmenu = (e) => e.preventDefault();

viewportGrid.appendChild(element1);
viewportGrid.appendChild(element2);
viewportGrid.appendChild(element3);

content.appendChild(viewportGrid);
content.appendChild(reloadButton);

const instructions = document.createElement('p');
instructions.innerText = `
  Basic controls:
  - Click/Drag anywhere in the viewport to move the center of the crosshairs.
  - Drag a reference line to move it, scrolling the other views.

  Advanced controls: Hover over a line and find the following two handles:
  - Square (closest to center): Drag these to change the thickness of the MIP slab in that plane.
  - Circle (further from center): Drag these to rotate the axes.
  `;

content.append(instructions);

// ============================= //

const viewportId1 = 'CT_AXIAL';
const viewportId2 = 'CT_SAGITTAL';
const viewportId3 = 'CT_CORONAL';

/**
 * Runs the demo
 */
async function run(
  volumeName,
  StudyInstanceUID,
  SeriesInstanceUID,
  wadoRsRoot
) {
  // Define a unique id for the volume
  const volumeLoaderScheme = 'cornerstoneStreamingImageVolume'; // Loader id which defines which volume loader to use
  const volumeId = `${volumeLoaderScheme}:${volumeName}`; // VolumeId with loader id + volume id
  const toolGroupId = 'MY_TOOLGROUP_ID';
  // Init Cornerstone and related libraries
  await initDemo();

  // Get Cornerstone imageIds for the source data and fetch metadata into RAM
  const imageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID,
    SeriesInstanceUID,
    wadoRsRoot,
  });

  // Define a volume in memory
  const volume = await volumeLoader.createAndCacheVolume(volumeId, {
    imageIds,
  });
  const renderingEngineId = 'myRenderingEngine';
  let renderingEngine;
  // Instantiate a rendering engine
  if (!getRenderingEngine(renderingEngineId)) {
    renderingEngine = new RenderingEngine(renderingEngineId);
  } else {
    renderingEngine = getRenderingEngine(renderingEngineId);
  }

  // Create the viewports
  const viewportInputArray = [
    {
      viewportId: viewportId1,
      type: ViewportType.ORTHOGRAPHIC,
      element: element1,
      defaultOptions: {
        orientation: Enums.OrientationAxis.AXIAL,
        background: <Types.Point3>[0, 0, 0],
      },
    },
    {
      viewportId: viewportId2,
      type: ViewportType.ORTHOGRAPHIC,
      element: element2,
      defaultOptions: {
        orientation: Enums.OrientationAxis.SAGITTAL,
        background: <Types.Point3>[0, 0, 0],
      },
    },
    {
      viewportId: viewportId3,
      type: ViewportType.ORTHOGRAPHIC,
      element: element3,
      defaultOptions: {
        orientation: Enums.OrientationAxis.CORONAL,
        background: <Types.Point3>[0, 0, 0],
      },
    },
  ];

  if (!renderingEngine.getViewport('CT_CORONAL')) {
    renderingEngine.setViewports(viewportInputArray);
  }
  // Set the volume to load
  await volume.load();

  // Set volumes on the viewports
  await setVolumesForViewports(
    renderingEngine,
    [
      {
        volumeId,
        callback: setCtTransferFunctionForVolumeActor,
      },
    ],
    [viewportId1, viewportId2, viewportId3]
  );

  const isMobile = window.matchMedia('(any-pointer:coarse)').matches;

  // Render the image
  renderingEngine.renderViewports([viewportId1, viewportId2, viewportId3]);
}

run(
  Math.random(),
  '1.3.6.1.4.1.14519.5.2.1.7009.2403.334240657131972136850343327463',
  '1.3.6.1.4.1.14519.5.2.1.7009.2403.226151125820845824875394858561',
  'https://d3t6nz73ql33tx.cloudfront.net/dicomweb'
);
