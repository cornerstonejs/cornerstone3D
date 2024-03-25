import {
  RenderingEngine,
  Types,
  Enums,
  setVolumesForViewports,
  volumeLoader,
  getRenderingEngine,
  getEnabledElement,
  Viewport,
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
  addButtonToToolbar,
} from '../../../../utils/demo/helpers';
import * as cornerstoneTools from '@cornerstonejs/tools';

// This is for debugging purposes
console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const { ToolGroupManager, synchronizers } = cornerstoneTools;

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
const viewportId5 = 'TEST_STACK';
const viewportIds = [
  viewportId1,
  viewportId2,
  viewportId3,
  viewportId4,
  viewportId5,
];
let viewport;
const viewports = [];
const renderingEngineId = 'myRenderingEngine';
const synchronizerId = 'SLAB_THICKNESS_SYNCHRONIZER_ID';
const synchronizerOptions = {
  ...Viewport.CameraViewPresentation,
};

// ======== Set up page ======== //
setTitleAndDescription(
  'Resize',
  'Here we demonstrate resize, using the display area/relative zoom, pan view reference synchronization.'
);

const width = `18vw`;
const height = `25vw`;
const content = document.getElementById('content');
const viewportGrid = document.createElement('div');

viewportGrid.style.width = '100%';

const element1 = document.createElement('div');
const element2 = document.createElement('div');
const element3 = document.createElement('div');
const element4 = document.createElement('div');
const element5 = document.createElement('div');
const elements = [element3, element4, element1, element2, element5];
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

const leftTopDisplayArea = {
  storeAsInitialCamera: true,
  imageArea: [1.1, 1.1],
  imageCanvasPoint: {
    imagePoint: [0, 0],
    canvasPoint: [0, 0],
  },
};

const leftDisplayArea = {
  storeAsInitialCamera: true,
  imageArea: [1.1, 1.1],
  imageCanvasPoint: {
    imagePoint: [0, 0.5],
    canvasPoint: [0, 0.5],
  },
};

const rightDisplayArea = {
  storeAsInitialCamera: true,
  imageArea: [1.1, 1.1],
  imageCanvasPoint: {
    imagePoint: [1, 1],
    canvasPoint: [1, 1],
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

const defaultDisplayArea = {
  storeAsInitialCamera: true,
  // imageArea: [1, 1],
  // imageCanvasPoint: {
  //   imagePoint: [0.5, 0.5],
  //   canvasPoint: [0.5, 0.5],
  // },
};

const centerSmallDisplayArea = {
  storeAsInitialCamera: true,
  imageArea: [1.1, 1.1],
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

const scaleLeftTop = {
  type: 'SCALE',
  storeAsInitialCamera: true,
  scale: 1.0,
  imageCanvasPoint: {
    imagePoint: [0, 0],
  },
};

const scaleLeft = {
  type: 'SCALE',
  storeAsInitialCamera: true,
  scale: 1.0,
  imageCanvasPoint: {
    imagePoint: [0, 0.5],
  },
};

const scaleRightBottom = {
  type: 'SCALE',
  storeAsInitialCamera: true,
  scale: 1.0,
  imageCanvasPoint: {
    imagePoint: [1, 1],
  },
};

const displayAreaOptions = new Map();
displayAreaOptions.set('Default', defaultDisplayArea);
displayAreaOptions.set('Center', centerDisplayArea);
displayAreaOptions.set('Left Top', leftTopDisplayArea);
displayAreaOptions.set('Left', leftDisplayArea);
displayAreaOptions.set('Left 2', leftDisplayArea);
displayAreaOptions.set('Right Bottom', rightDisplayArea);
displayAreaOptions.set('Center Small', centerSmallDisplayArea);
displayAreaOptions.set('Center Fit Height', centerHeight);
displayAreaOptions.set('Center Fit Width', centerWidth);
displayAreaOptions.set('Scale 1x', scale1);
displayAreaOptions.set('Scale 15x', scale15);
displayAreaOptions.set('Scale Left Top', scaleLeftTop);
displayAreaOptions.set('Scale Left', scaleLeft);
displayAreaOptions.set('Scale Left 2', scaleLeft);
displayAreaOptions.set('Scale Right Bottom', scaleRightBottom);

let storeAsInitialCamera = true;
addToggleButtonToToolbar({
  id: 'storeAsInitialCameraToggle',
  title: 'Store Display Area',
  defaultToggle: storeAsInitialCamera,
  onClick: (toggle) => {
    storeAsInitialCamera = toggle;
  },
});

addDropdownToToolbar({
  id: 'displayArea',
  options: {
    values: Array.from(displayAreaOptions.keys()),
    defaultValue: displayAreaOptions.keys().next().value,
  },
  onSelectedValueChange: (value) => {
    const displayArea = displayAreaOptions.get(value);
    displayArea.storeAsInitialCamera = storeAsInitialCamera;
    viewport.setDisplayArea(displayArea);
    viewport.render();
  },
});

addButtonToToolbar({
  title: 'Reset Camera',
  onClick: () => {
    viewport.resetCamera();
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
  defaultToggle: synchronizerOptions.displayArea,
  onClick: (toggle) => {
    synchronizerOptions.displayArea = toggle;
  },
});

addToggleButtonToToolbar({
  id: 'syncZoom',
  title: 'Sync Zoom',
  defaultToggle: synchronizerOptions.zoom,
  onClick: (toggle) => {
    synchronizerOptions.zoom = toggle;
  },
});

addToggleButtonToToolbar({
  id: 'syncPan',
  title: 'Sync Pan',
  defaultToggle: synchronizerOptions.pan,
  onClick: (toggle) => {
    synchronizerOptions.pan = toggle;
  },
});

addToggleButtonToToolbar({
  id: 'syncRotation',
  title: 'Sync Rotation',
  defaultToggle: synchronizerOptions.rotation,
  onClick: (toggle) => {
    synchronizerOptions.rotation = toggle;
  },
});

//////////
// Sets the sizing options for how the images are displayed

const resizeOptions = new Map();
resizeOptions.set('Original', {
  viewportStyle: { width, height },
});
resizeOptions.set('1:2', {
  viewportStyle: { width: '19vw', height: '38vw' },
});
resizeOptions.set('2:1', {
  viewportStyle: { width: '40vw', height: '20vw' },
});
resizeOptions.set('3:2', {
  viewportStyle: { width: '30vw', height: '20vw' },
});
resizeOptions.set('3:1', {
  viewportStyle: { width: '30vw', height: '10vw' },
});
resizeOptions.set('1:4', {
  viewportStyle: { width: '10vw', height: '40vw' },
});
resizeOptions.set('4:1', {
  viewportStyle: { width: '40vw', height: '10vw' },
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
    const presentations = viewports.map((viewport) =>
      viewport.getViewPresentation()
    );
    renderingEngine.resize(true, false);
    viewports.forEach((viewport, idx) => {
      viewport.setView(null, presentations[idx]);
    });
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
    {
      viewportId: viewportId5,
      type: ViewportType.STACK,
      element: element5,
      defaultOptions: {
        background: <Types.Point3>[0, 0, 0.5],
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

  const stackViewport5 = renderingEngine.getViewport(
    viewportId5
  ) as Types.IStackViewport;
  await stackViewport5.setStack(stackImageIds);
  // stackViewport5.setProperties({
  //   interpolationType: Enums.InterpolationType.NEAREST,
  // });

  const stackViewport4 = renderingEngine.getViewport(
    viewportId4
  ) as Types.IStackViewport;
  await stackViewport4.setStack(imageIds);
  // Assign the initial viewport
  viewport = stackViewport4;

  // Define tool groups to add the segmentation display tool to
  const toolGroup = ToolGroupManager.createToolGroup(toolGroupId);
  addManipulationBindings(toolGroup);
  toolGroup.setToolActive(cornerstoneTools.PanTool.toolName, {
    bindings: toolGroup.getDefaultPrimaryBindings(),
  });

  // For the crosshairs to operate, the viewports must currently be
  // added ahead of setting the tool active. This will be improved in the future.
  toolGroup.addViewport(viewportId1, renderingEngineId);
  toolGroup.addViewport(viewportId2, renderingEngineId);
  toolGroup.addViewport(viewportId3, renderingEngineId);
  toolGroup.addViewport(viewportId4, renderingEngineId);
  toolGroup.addViewport(viewportId5, renderingEngineId);

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
