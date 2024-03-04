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
const viewports = [];
const renderingEngineId = 'myRenderingEngine';
const synchronizerId = 'SLAB_THICKNESS_SYNCHRONIZER_ID';
const synchronizerOptions = {
  displayAreaType: true,
  rotationType: true,
  zoomType: true,
  panType: true,
};

// ======== Set up page ======== //
setTitleAndDescription(
  'Resize',
  'Here we demonstrate resize, using the display area/relative zoom, pan view reference synchronization.'
);

const widthValue = Math.floor(window.innerWidth / 4 - 50);
const heightValue = Math.floor((window.innerHeight * 2) / 3);

const width = `${widthValue}px`;
const height = `${heightValue}px`;
const content = document.getElementById('content');
const viewportGrid = document.createElement('div');

viewportGrid.style.width = '100%';

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
    display: 'inline-block',
  });
  // Disable right click context menu so we can have right click tools
  element.oncontextmenu = (e) => e.preventDefault();
  viewportGrid.appendChild(element);
  element.onclick = (evt) => {
    const clickViewport = getEnabledElement(element)?.viewport;
    viewport = clickViewport;
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

const centerWidth = {
  storeAsInitialCamera: true,
  imageArea: [1, 0.1],
  imageCanvasPoint: {
    imagePoint: [0.5, 0.5],
    canvasPoint: [0.5, 0.5],
  },
};

const scale1 = {
  type: 'SCALE',
  storeAsInitialCamera: true,
  scale: 1.0,
  imageCanvasPoint: {
    imagePoint: [0.5, 0.5],
    canvasPoint: [0.5, 0.5],
  },
};

const scale15 = {
  type: 'SCALE',
  storeAsInitialCamera: true,
  scale: 15.0,
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
displayAreaOptions.set('Center Fit Height', centerHeight);
displayAreaOptions.set('Center Fit Width', centerWidth);
displayAreaOptions.set('Scale 1x', scale1);
displayAreaOptions.set('Scale 15x', scale15);

addDropdownToToolbar({
  id: 'displayArea',
  options: {
    values: Array.from(displayAreaOptions.keys()),
    defaultValue: displayAreaOptions.keys().next().value,
  },
  onSelectedValueChange: (value) => {
    const displayArea = displayAreaOptions.get(value);
    viewport.setDisplayArea(displayArea);
    viewport.render();
  },
});

const rotations = ['0', '45', '90', '135', '180', '270'];
addDropdownToToolbar({
  id: 'rotation',
  options: {
    values: rotations,
    defaultValue: rotations[0],
  },
  onSelectedValueChange: (value) => {
    viewport.setProperties({ rotation: value });
    viewport.render();
  },
});

// ============================= //

addToggleButtonToToolbar({
  id: 'syncDisplayArea',
  title: 'Sync Display Area',
  defaultToggle: synchronizerOptions.displayAreaType,
  onClick: (toggle) => {
    synchronizerOptions.displayAreaType = toggle;
  },
});

addToggleButtonToToolbar({
  id: 'syncZoom',
  title: 'Sync Zoom',
  defaultToggle: synchronizerOptions.zoomType,
  onClick: (toggle) => {
    synchronizerOptions.zoomType = toggle;
  },
});

addToggleButtonToToolbar({
  id: 'syncPan',
  title: 'Sync Pan',
  defaultToggle: synchronizerOptions.panType,
  onClick: (toggle) => {
    synchronizerOptions.panType = toggle;
  },
});

addToggleButtonToToolbar({
  id: 'syncRotation',
  title: 'Sync Rotation',
  defaultToggle: synchronizerOptions.rotationType,
  onClick: (toggle) => {
    synchronizerOptions.rotationType = toggle;
  },
});

//////////
// Sets the sizing options for how the images are displayed

const resizeOptions = new Map();
resizeOptions.set('Original', {
  viewportStyle: { width, height },
});
resizeOptions.set('Tall', {
  viewportStyle: { width: '256px', height: '1024px' },
});
resizeOptions.set('Wide', {
  viewportStyle: { width: '1024px', height: '256px' },
});
resizeOptions.set('1:2', {
  viewportStyle: { width: '256px', height: '512px' },
});
resizeOptions.set('2:1', {
  viewportStyle: { width: '512px', height: '256px' },
});
resizeOptions.set('4:5', {
  viewportStyle: { width: '400px', height: '500px' },
});
resizeOptions.set('5:4', {
  viewportStyle: { width: '500px', height: '400px' },
});

addDropdownToToolbar({
  id: 'resizeAspect',
  options: {
    values: Array.from(resizeOptions.keys()),
    defaultValue: resizeOptions.keys().next().value,
  },
  onSelectedValueChange: (value) => {
    const aspect = resizeOptions.get(value);
    Object.assign(viewportGrid.style, aspect.viewportGridStyle);
    viewports.forEach((viewport) => {
      Object.assign(viewport.element.style, aspect.viewportStyle);
    });
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
  resizeTimeout = null;
  const renderingEngine = getRenderingEngine(renderingEngineId);

  if (renderingEngine) {
    renderingEngine.resize(true, false);
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
    wadoRsRoot: 'https://d3t6nz73ql33tx.cloudfront.net/dicomweb',
  });

  const stackImageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID: '2.16.124.113543.6004.101.103.20021117.190619.1',
    SeriesInstanceUID: '2.16.124.113543.6004.101.103.20021117.190619.1.001',
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
  await stackViewport.setStack(stackImageIds);
  // Assign the initial viewport
  viewport = stackViewport;
  stackViewport.setProperties({
    interpolationType: Enums.InterpolationType.NEAREST,
  });

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
  viewportIds.forEach((id) => viewports.push(renderingEngine.getViewport(id)));
  resizeObserver.observe(viewportGrid);
}

run();
