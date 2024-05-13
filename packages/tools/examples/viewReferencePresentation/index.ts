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
  addButtonToToolbar,
} from '../../../../utils/demo/helpers';
import * as cornerstoneTools from '@cornerstonejs/tools';
import { IStackViewport } from 'core/dist/types/types';

// This is for debugging purposes
console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const { ToolGroupManager } = cornerstoneTools;

const { ViewportType, Events } = Enums;

// Define a unique id for the volume
const volumeName = 'CT_VOLUME_ID'; // Id of the volume less loader prefix
const volumeLoaderScheme = 'cornerstoneStreamingImageVolume'; // Loader id which defines which volume loader to use
const volumeId = `${volumeLoaderScheme}:${volumeName}`; // VolumeId with loader id + volume id
const toolGroupId = 'MY_TOOLGROUP_ID';
const viewportId0 = 'CT_STACK';
const viewportId1 = 'CT_AXIAL';
const viewportId2 = 'CT_SAGITTAL';
const viewportId3 = 'CT_CORONAL';
const viewportId4 = 'TEST_STACK';
const viewportIds = [
  viewportId0,
  viewportId1,
  viewportId2,
  viewportId3,
  viewportId4,
];
let viewport;
const viewports = [];
const renderingEngineId = 'myRenderingEngine';

// ======== Set up page ======== //
setTitleAndDescription(
  'ViewReferencePresentation',
  'Here we demonstrate view reference/presentation syncing.'
);

const width = `18vw`;
const height = `33vh`;
const content = document.getElementById('content');
const viewportGrid = document.createElement('div');

viewportGrid.style.width = '100%';

const element0 = document.createElement('div');
const element1 = document.createElement('div');
const element2 = document.createElement('div');
const element3 = document.createElement('div');
const element4 = document.createElement('div');
const elements = [element0, element1, element2, element3, element4];
const controlElements = [...elements];
const setViewElements = controlElements.map(() => {
  const newElement = document.createElement('div');
  elements.push(newElement);
  return newElement;
});

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
  There are two lines of viewports, the top line allows controls, while the bottom line shows what happens when a isReferenceViewable applies, and the
  setView is updated when it is viewable.
  The left and right most views are stack views, while the middle three are  orthographic views of the left most viewport.
  Turning on apply orientation will apply the orientation from the source to the destination viewports for compatible viewports.
  Turning on apply presentation will apply the presentation for viewports that are not compatible with the view reference.
  There is no automatic conversion of stack to volume to demonstrate compatibility for conversion of viewport types.
  Note the two acquisition viewports (left two viewports) - these will sync in opposite scroll directions for the destination viewports.
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

const storeAsInitialCamera = true;

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
let withOrientation = false;

addToggleButtonToToolbar({
  id: 'matchOrientation',
  title: 'Match On Orientation',
  defaultToggle: !withOrientation,
  onClick: (toggle) => {
    withOrientation = !toggle;
  },
});

let applyPresentation = false;

addToggleButtonToToolbar({
  id: 'presentationToAll',
  title: 'Presentation To All',
  defaultToggle: applyPresentation,
  onClick: (toggle) => {
    applyPresentation = toggle;
  },
});

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
      viewport.setViewPresentation(presentations[idx]);
    });
  }
}

/**
 * Handles the updates from the source viewports by choosing one or MORE
 * of the viewports to apply the update to.  By default, only viewports
 * showing the same orientation and same stack are navigated/applied updates.
 *
 * If match on orientation is false, it applies to all viewports that contain
 * the same image set and are capable of the new orientation.
 *
 * If applyPresentation is true, then viewports which do NOT match get the presentation
 * applied additionally.
 */
function viewportRenderedListener(event) {
  const { element } = event.detail;
  const { viewport: renderedViewport } = getEnabledElement(element);
  viewport = renderedViewport;
  const viewRef = renderedViewport.getViewReference();
  const viewPres = renderedViewport.getViewPresentation();
  for (const destElement of setViewElements) {
    const { viewport: destViewport } = getEnabledElement(destElement);
    if (
      destViewport.isReferenceViewable(viewRef, {
        withNavigation: true,
        asVolume: false,
        withOrientation,
      })
    ) {
      destViewport.setViewReference(viewRef);
      destViewport.setViewPresentation(viewPres);
      destViewport.render();
    } else if (applyPresentation) {
      // Apply the presentation values even though the reference isn't compatible.
      destViewport.setViewPresentation(viewPres);
      destViewport.render();
    }
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
      viewportId: viewportId0,
      stackImageIds: imageIds,
      type: ViewportType.STACK,
      element: element0,
      defaultOptions: {
        background: <Types.Point3>[0, 0.3, 0],
      },
    },
    {
      viewportId: viewportId1,
      type: ViewportType.ORTHOGRAPHIC,
      element: element1,
      defaultOptions: {
        orientation: Enums.OrientationAxis.AXIAL,
        background: <Types.Point3>[0, 0, 0.3],
      },
    },
    {
      viewportId: viewportId2,
      type: ViewportType.ORTHOGRAPHIC,
      element: element2,
      defaultOptions: {
        orientation: Enums.OrientationAxis.SAGITTAL,
        background: <Types.Point3>[0, 0, 0.6],
      },
    },
    {
      viewportId: viewportId3,
      type: ViewportType.ORTHOGRAPHIC,
      element: element3,
      defaultOptions: {
        orientation: Enums.OrientationAxis.CORONAL,
        background: <Types.Point3>[0, 0, 0.9],
      },
    },
    {
      viewportId: viewportId4,
      stackImageIds,
      type: ViewportType.STACK,
      element: element4,
      defaultOptions: {
        background: <Types.Point3>[0, 0.5, 0],
      },
    },
  ];
  for (let i = 0; i < setViewElements.length; i++) {
    const baseViewInput = viewportInputArray[i];
    const newViewInput = {
      ...baseViewInput,
      viewportId: `${baseViewInput.viewportId}-setView`,
      element: setViewElements[i],
    };
    viewportInputArray.push(newViewInput);
    viewportIds.push(newViewInput.viewportId);
  }

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
    viewportInputArray
      .filter((it) => it.type === ViewportType.ORTHOGRAPHIC)
      .map((it) => it.viewportId)
  );

  for (const viewportInput of viewportInputArray) {
    const { stackImageIds: idsForStack, viewportId } = viewportInput;
    if (!idsForStack) {
      continue;
    }
    const stackViewport = <IStackViewport>(
      renderingEngine.getViewport(viewportId)
    );
    await stackViewport.setStack(idsForStack);
  }
  // Assign the initial viewport
  viewport = renderingEngine.getViewport(viewportId0);

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
  toolGroup.addViewport(viewportId0, renderingEngineId);
  toolGroup.addViewport(viewportId4, renderingEngineId);

  // Render the image
  renderingEngine.renderViewports(viewportIds);
  viewportIds.forEach((id) => viewports.push(renderingEngine.getViewport(id)));
  resizeObserver.observe(viewportGrid);

  for (const element of controlElements) {
    const { viewport } = getEnabledElement(element);
    viewport.element.addEventListener(
      Events.IMAGE_RENDERED,
      viewportRenderedListener
    );
  }
}

run();
