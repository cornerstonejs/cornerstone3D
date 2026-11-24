import type { PlanarViewport, Types } from '@cornerstonejs/core';
import {
  RenderingEngine,
  Enums,
  volumeLoader,
  getRenderingEngine,
  getEnabledElement,
  viewportProjection,
  displaySetRegistry,
} from '@cornerstonejs/core';
import {
  initDemo,
  createImageIdsAndCacheMetaData,
  setTitleAndDescription,
  addDropdownToToolbar,
  addManipulationBindings,
  getLocalUrl,
  addToggleButtonToToolbar,
  addButtonToToolbar,
} from '../../../../utils/demo/helpers';
import { ctPresentation } from '../../../../utils/demo/helpers/volumePresentationRecipes';
import * as cornerstoneTools from '@cornerstonejs/tools';

// This is for debugging purposes
console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const { ToolGroupManager, synchronizers } = cornerstoneTools;

const { createViewFramingSynchronizer } = synchronizers;

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

let viewport: PlanarViewport;
const viewports: PlanarViewport[] = [];
const renderingEngineId = 'myRenderingEngine';
const synchronizerId = 'SLAB_THICKNESS_SYNCHRONIZER_ID';
const volumeDisplaySetId = 'resize:ct:volume';
const ctStackDisplaySetId = 'resize:ct:stack';
const testStackDisplaySetId = 'resize:test:stack';
const synchronizerOptions: Types.ViewFramingSelector = {
  rotation: true,
  pan: true,
  zoom: true,
  aspectRatio: true,
  displayArea: true,
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
    const enabledElement = getEnabledElement(element);

    if (enabledElement) {
      viewport = getRenderingEngine(
        renderingEngineId
      ).getViewport<PlanarViewport>(enabledElement.viewportId);
    }
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
  imageArea: [1.1, 1.1],
  imageCanvasPoint: {
    imagePoint: [0, 0],
    canvasPoint: [0, 0],
  },
};

const leftDisplayArea = {
  imageArea: [1.1, 1.1],
  imageCanvasPoint: {
    imagePoint: [0, 0.5],
    canvasPoint: [0, 0.5],
  },
};

const rightDisplayArea = {
  imageArea: [1.1, 1.1],
  imageCanvasPoint: {
    imagePoint: [1, 1],
    canvasPoint: [1, 1],
  },
};

const centerDisplayArea = {
  imageArea: [1, 1],
  imageCanvasPoint: {
    imagePoint: [0.5, 0.5],
    canvasPoint: [0.5, 0.5],
  },
};

const defaultDisplayArea = {
  // imageArea: [1, 1],
  // imageCanvasPoint: {
  //   imagePoint: [0.5, 0.5],
  //   canvasPoint: [0.5, 0.5],
  // },
};

const centerSmallDisplayArea = {
  imageArea: [1.1, 1.1],
  imageCanvasPoint: {
    imagePoint: [0.5, 0.5],
    canvasPoint: [0.5, 0.5],
  },
};

const centerHeight = {
  imageArea: [0.1, 1],
  imageCanvasPoint: {
    imagePoint: [0.5, 0.5],
    canvasPoint: [0.5, 0.5],
  },
};

const centerWidth = {
  imageArea: [1, 0.1],
  imageCanvasPoint: {
    imagePoint: [0.5, 0.5],
    canvasPoint: [0.5, 0.5],
  },
};

const scale1 = {
  type: 'SCALE',
  scale: 1.0,
  imageCanvasPoint: {
    imagePoint: [0.5, 0.5],
    canvasPoint: [0.5, 0.5],
  },
};

const scale15 = {
  type: 'SCALE',
  scale: 15.0,
  imageCanvasPoint: {
    imagePoint: [0.5, 0.5],
    canvasPoint: [0.5, 0.5],
  },
};

const scaleLeftTop = {
  type: 'SCALE',
  scale: 1.0,
  imageCanvasPoint: {
    imagePoint: [0, 0],
  },
};

const scaleLeft = {
  type: 'SCALE',
  scale: 1.0,
  imageCanvasPoint: {
    imagePoint: [0, 0.5],
  },
};

const scaleRightBottom = {
  type: 'SCALE',
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

addDropdownToToolbar({
  id: 'displayArea',
  options: {
    values: Array.from(displayAreaOptions.keys()),
    defaultValue: displayAreaOptions.keys().next().value,
  },
  onSelectedValueChange: (value) => {
    const displayArea = displayAreaOptions.get(value);
    viewport.setViewState({ displayArea });
    viewport.render();
  },
});

addButtonToToolbar({
  title: 'Reset Camera',
  onClick: () => {
    viewport.resetViewState();
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
    const viewState = viewportProjection.withFraming(viewport, {
      rotation: Number(value),
    });

    if (viewState) {
      viewport.setViewState(viewState);
    }

    viewport.render();
  },
});

const aspects = ['1:1', '1:2', '2:1', '0.5:1', '1:0.5', '3:17'];
addDropdownToToolbar({
  id: 'aspect',
  options: {
    values: aspects,
    defaultValue: aspects[0],
  },
  onSelectedValueChange: (value) => {
    const aspect = (value as string).split(':').map((it) => Number(it));
    const [scaleX] = viewportProjection.getFraming(viewport, {
      selector: { scale: true },
    })?.scale ?? [1, 1];

    viewport.setViewState({
      scale: [scaleX, (scaleX * aspect[1]) / aspect[0]],
    });
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
  const synchronizer = createViewFramingSynchronizer(
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
      viewportProjection.getFraming(viewport)
    );
    renderingEngine.resize(true, false);
    viewports.forEach((viewport, idx) => {
      const viewState = viewportProjection.withFraming(
        viewport,
        presentations[idx]
      );

      if (viewState) {
        viewport.setViewState(viewState);
      }
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
    StudyInstanceUID: '1.3.6.1.4.1.25403.345050719074.3824.20170125095438.5',
    SeriesInstanceUID: '1.3.6.1.4.1.25403.345050719074.3824.20170125095501.12',
    wadoRsRoot: 'https://d14fa38qiwhyfd.cloudfront.net/dicomweb',
  });

  const stackImageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID: '2.16.124.113543.6004.101.103.20021117.190619.1',
    SeriesInstanceUID: '2.16.124.113543.6004.101.103.20021117.190619.1.001',
    wadoRsRoot:
      getLocalUrl() || 'https://d14fa38qiwhyfd.cloudfront.net/dicomweb',
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
      type: ViewportType.PLANAR,
      element: element1,
      defaultOptions: {
        orientation: Enums.OrientationAxis.AXIAL,
        background: <Types.Point3>[0, 0, 0.5],
      },
    },
    {
      viewportId: viewportId2,
      type: ViewportType.PLANAR,
      element: element2,
      defaultOptions: {
        orientation: Enums.OrientationAxis.SAGITTAL,
        background: <Types.Point3>[0.5, 0.5, 0],
      },
    },
    {
      viewportId: viewportId3,
      type: ViewportType.PLANAR,
      element: element3,
      defaultOptions: {
        orientation: Enums.OrientationAxis.CORONAL,
        background: <Types.Point3>[0, 0.5, 0],
      },
    },
    {
      viewportId: viewportId4,
      type: ViewportType.PLANAR,
      element: element4,
      defaultOptions: {
        background: <Types.Point3>[0, 0.5, 0.5],
      },
    },
    {
      viewportId: viewportId5,
      type: ViewportType.PLANAR,
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
  displaySetRegistry.add(volumeDisplaySetId, {
    imageIds,
    volumeId,
  });
  displaySetRegistry.add(ctStackDisplaySetId, {
    imageIds,
    initialImageIdIndex: 0,
  });
  displaySetRegistry.add(testStackDisplaySetId, {
    imageIds: stackImageIds,
    initialImageIdIndex: 0,
  });

  await Promise.all(
    [viewportId1, viewportId2, viewportId3].map(async (viewportId) => {
      const volumeViewport =
        renderingEngine.getViewport<PlanarViewport>(viewportId);

      await volumeViewport.setDisplaySets({
        displaySetId: volumeDisplaySetId,
        options: { mode: 'volume' },
      });
      volumeViewport.setDisplaySetAppearance(
        volumeDisplaySetId,
        ctPresentation()
      );
    })
  );

  const stackViewport5 =
    renderingEngine.getViewport<PlanarViewport>(viewportId5);
  await stackViewport5.setDisplaySets({ displaySetId: testStackDisplaySetId });
  // stackViewport5.setProperties({
  //   interpolationType: Enums.InterpolationType.NEAREST,
  // });

  const stackViewport4 =
    renderingEngine.getViewport<PlanarViewport>(viewportId4);
  await stackViewport4.setDisplaySets({ displaySetId: ctStackDisplaySetId });
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
  viewportIds.forEach((id) =>
    viewports.push(renderingEngine.getViewport<PlanarViewport>(id))
  );
  resizeObserver.observe(viewportGrid);
}

run();
