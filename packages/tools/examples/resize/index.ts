import {
  RenderingEngine,
  Types,
  Enums,
  setVolumesForViewports,
  volumeLoader,
  getRenderingEngine,
  getEnabledElement,
} from '@cornerstonejs/core';
import {
  initDemo,
  createImageIdsAndCacheMetaData,
  setTitleAndDescription,
  setCtTransferFunctionForVolumeActor,
  addDropdownToToolbar,
  addManipulationBindings,
  getLocalUrl,
  addToggleButtonToToolbar,
} from '../../../../utils/demo/helpers';
import * as cornerstoneTools from '@cornerstonejs/tools';

// This is for debugging purposes
console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const {
  ToolGroupManager,
  Enums: csToolsEnums,
  synchronizers,
} = cornerstoneTools;

const { createPresentationViewSynchronizer } = synchronizers;

const { ViewportType } = Enums;

// Define a unique id for the volume
const volumeName = 'CT_VOLUME_ID'; // Id of the volume less loader prefix
const volumeLoaderScheme = 'cornerstoneStreamingImageVolume'; // Loader id which defines which volume loader to use
const volumeId = `${volumeLoaderScheme}:${volumeName}`; // VolumeId with loader id + volume id
const toolGroupId = 'MY_TOOLGROUP_ID';
const viewportId1 = 'CT_AXIAL';
const viewportId2 = 'CT_SAGITTAL';
const viewportId3 = 'CT_CORONAL';
const viewportId4 = 'CT_STACK';
const viewportIds = [viewportId1, viewportId2, viewportId3, viewportId4];
let viewport;
const renderingEngineId = 'myRenderingEngine';
const synchronizerId = 'SLAB_THICKNESS_SYNCHRONIZER_ID';
const synchronizerOptions = {
  applySlabThickness: false,
  applyDisplayArea: true,
  applyRotation: false,
};

// ======== Set up page ======== //
setTitleAndDescription(
  'Resize',
  'Here we demonstrate resize, using the display area/relative zoom, pan view reference synchronization.'
);

let widthValue = Math.floor(window.innerWidth / 4);
let heightValue = Math.floor((window.innerHeight * 2) / 3);

const width = `${widthValue}px`;
const height = `${heightValue}px`;
const content = document.getElementById('content');
const viewportGrid = document.createElement('div');

viewportGrid.style.display = 'flex';
viewportGrid.style.display = 'flex';
viewportGrid.style.width = '100%';
viewportGrid.style.height = '50%';
viewportGrid.style.flexDirection = 'row';

const element1 = document.createElement('div');
const element2 = document.createElement('div');
const element3 = document.createElement('div');
const element4 = document.createElement('div');
const elements = [element4, element1, element2, element3];
elements.forEach((element) => {
  Object.assign(element.style, {
    width,
    height,
    background: 'red',
  });
  // Disable right click context menu so we can have right click tools
  element.oncontextmenu = (e) => e.preventDefault();
  viewportGrid.appendChild(element);
  element.onclick = (evt) => {
    const clickViewport = getEnabledElement(element)?.viewport;
    viewport = clickViewport;
    console.log('Setting click viewport to', viewport.id);
    return false;
  };
});

content.appendChild(viewportGrid);

const instructions = document.createElement('p');
instructions.innerText = `
  Resize the window with various synchronization options on and see how it
  affects the different windows.
  `;

content.append(instructions);

const rightDisplayArea = {
  storeAsInitialCamera: true,
  imageArea: [0.8, 0.8],
  imageCanvasPoint: {
    imagePoint: [0, 0.5],
    canvasPoint: [0, 0.5],
  },
};

const leftDisplayArea = {
  storeAsInitialCamera: true,
  imageArea: [0.8, 0.8],
  imageCanvasPoint: {
    imagePoint: [1, 0.5],
    canvasPoint: [1, 0.5],
  },
};

const centerDisplayArea = {
  storeAsInitialCamera: true,
  imageArea: [1, 1],
  imageCanvasPoint: {
    imagePoint: [0.5, 0.5],
    canvasPoint: [0.5, 0.5],
  },
};

const centerSmallDisplayArea = {
  storeAsInitialCamera: true,
  imageArea: [2, 2],
  imageCanvasPoint: {
    imagePoint: [0.5, 0.5],
    canvasPoint: [0.5, 0.5],
  },
};

const centerHeight = {
  storeAsInitialCamera: true,
  imageArea: [0.1, 1],
  imageCanvasPoint: {
    imagePoint: [0.5, 0.5],
    canvasPoint: [0.5, 0.5],
  },
};

const displayAreaOptions = new Map();
displayAreaOptions.set('Center', centerDisplayArea);
displayAreaOptions.set('Left', leftDisplayArea);
displayAreaOptions.set('Right', rightDisplayArea);
displayAreaOptions.set('Center Small', centerSmallDisplayArea);
displayAreaOptions.set('Center Fit Heigth', centerHeight);

addDropdownToToolbar({
  id: 'displayArea',
  options: {
    values: Array.from(displayAreaOptions.keys()),
    defaultValue: displayAreaOptions.keys().next().value,
  },
  onSelectedValueChange: (value) => {
    const displayArea = displayAreaOptions.get(value);
    console.log(
      'Setting display area',
      viewport.id,
      value,
      JSON.stringify(displayArea)
    );
    viewport.setDisplayArea(displayArea);
    viewport.render();
  },
});
// ============================= //

addToggleButtonToToolbar({
  id: 'syncDisplayArea',
  title: 'Sync Display Area',
  defaultToggle: synchronizerOptions.applyDisplayArea,
  onClick: (toggle) => {
    synchronizerOptions.applyDisplayArea = toggle;
  },
});

function setUpSynchronizers() {
  const synchronizer = createPresentationViewSynchronizer(
    synchronizerId,
    synchronizerOptions
  );

  // Add viewports to VOI synchronizers
  viewportIds.forEach((viewportId) => {
    synchronizer.add({
      renderingEngineId,
      viewportId,
    });
  });
}

let resizeTimeout = null;
const resizeObserver = new ResizeObserver(() => {
  if (resizeTimeout) {
    return;
  }
  resizeTimeout = setTimeout(resize, 100);
});

function resize() {
  const newWidthValue = Math.floor(window.innerWidth / 4);
  const newHeightValue = Math.floor((window.innerHeight * 2) / 3);
  resizeTimeout = null;
  if (widthValue === newWidthValue && heightValue === newHeightValue) {
    return;
  }
  widthValue = newWidthValue;
  heightValue = newHeightValue;
  console.log('Resizing window');
  elements.forEach((element) => {
    element.style.width = `${widthValue}px`;
    element.style.height = `${heightValue}px`;
  });
  const renderingEngine = getRenderingEngine(renderingEngineId);

  if (renderingEngine) {
    renderingEngine.resize(true, true);
  }
}

/**
 * Runs the demo
 */
async function run() {
  // Init Cornerstone and related libraries
  await initDemo();

  // Add tools to Cornerstone3D

  // Get Cornerstone imageIds for the source data and fetch metadata into RAM
  const imageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.334240657131972136850343327463',
    SeriesInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.226151125820845824875394858561',
    wadoRsRoot:
      getLocalUrl() || 'https://d3t6nz73ql33tx.cloudfront.net/dicomweb',
  });

  // Define a volume in memory
  const volume = await volumeLoader.createAndCacheVolume(volumeId, {
    imageIds,
  });

  // Instantiate a rendering engine
  const renderingEngine = new RenderingEngine(renderingEngineId);

  // Create the viewports
  const viewportInputArray = [
    {
      viewportId: viewportId1,
      type: ViewportType.ORTHOGRAPHIC,
      element: element1,
      defaultOptions: {
        orientation: Enums.OrientationAxis.AXIAL,
        background: <Types.Point3>[0, 0, 0.5],
      },
    },
    {
      viewportId: viewportId2,
      type: ViewportType.ORTHOGRAPHIC,
      element: element2,
      defaultOptions: {
        orientation: Enums.OrientationAxis.SAGITTAL,
        background: <Types.Point3>[0.5, 0.5, 0],
      },
    },
    {
      viewportId: viewportId3,
      type: ViewportType.ORTHOGRAPHIC,
      element: element3,
      defaultOptions: {
        orientation: Enums.OrientationAxis.CORONAL,
        background: <Types.Point3>[0, 0.5, 0],
      },
    },
    {
      viewportId: viewportId4,
      type: ViewportType.STACK,
      element: element4,
      defaultOptions: {
        background: <Types.Point3>[0, 0.5, 0.5],
      },
    },
  ];

  renderingEngine.setViewports(viewportInputArray);

  // Set the volume to load
  volume.load();

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

  const stackViewport = renderingEngine.getViewport(
    viewportId4
  ) as Types.IStackViewport;
  await stackViewport.setStack(imageIds);
  // Assign the initial viewport
  viewport = stackViewport;

  // Define tool groups to add the segmentation display tool to
  const toolGroup = ToolGroupManager.createToolGroup(toolGroupId);
  addManipulationBindings(toolGroup);

  // For the crosshairs to operate, the viewports must currently be
  // added ahead of setting the tool active. This will be improved in the future.
  toolGroup.addViewport(viewportId1, renderingEngineId);
  toolGroup.addViewport(viewportId2, renderingEngineId);
  toolGroup.addViewport(viewportId3, renderingEngineId);
  toolGroup.addViewport(viewportId4, renderingEngineId);

  // Manipulation Tools
  // Add Crosshairs tool and configure it to link the three viewports
  // These viewports could use different tool groups. See the PET-CT example
  // for a more complicated used case.

  setUpSynchronizers();

  // Render the image
  renderingEngine.renderViewports(viewportIds);
  resizeObserver.observe(viewportGrid);
}

run();
