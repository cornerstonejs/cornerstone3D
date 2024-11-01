import type { Types } from '@cornerstonejs/core';
import {
  RenderingEngine,
  utilities,
  Enums,
  getRenderingEngine,
  cache,
  volumeLoader,
} from '@cornerstonejs/core';
import {
  initDemo,
  createImageIdsAndCacheMetaData,
  setTitleAndDescription,
  setCtTransferFunctionForVolumeActor,
} from '../../../../utils/demo/helpers';
import * as cornerstoneTools from '@cornerstonejs/tools';

// This is for debugging purposes
console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const { ViewportType } = Enums;
const renderingEngineId = 'myRenderingEngine';
const toolGroupIds = new Set<string>();
const volumeName = 'CT_VOLUME_ID'; // Id of the volume less loader prefix
const volumeLoaderScheme = 'cornerstoneStreamingImageVolume'; // Loader id which defines which volume loader to use
const volumeId = `${volumeLoaderScheme}:${volumeName}`; // VolumeId with loader id + volume id

const viewportsInfo = [
  {
    toolGroupId: 'STACK_TOOLGROUP_ID',
    segmentationEnabled: false,
    viewportInput: {
      viewportId: 'CT_STACK_AXIAL',
      type: ViewportType.STACK,
      element: null,
      defaultOptions: {
        background: <Types.Point3>[0.2, 0, 0.2],
      },
    },
  },
  {
    toolGroupId: 'VOLUME_TOOLGROUP_ID',
    viewportInput: {
      viewportId: 'CT_VOLUME_AXIAL',
      type: ViewportType.ORTHOGRAPHIC,
      element: null,
      defaultOptions: {
        orientation: Enums.OrientationAxis.AXIAL,
        background: <Types.Point3>[0, 255, 0],
      },
    },
  },
];
// ======== Set up page ======== //
setTitleAndDescription(
  'Dynamically Add Annotations',
  'Enter the image coords or world coords and press Enter to add an annotation. (Left) Stack Viewport, (Right) Volume Viewport.'
);

const demoToolbar = document.getElementById('demo-toolbar');
const content = document.getElementById('content');
const viewportGrid = document.createElement('div');

viewportGrid.style.display = 'grid';
viewportGrid.style.gridTemplateColumns = `auto auto`;
viewportGrid.style.width = '100%';
viewportGrid.style.height = '500px';
viewportGrid.style.paddingTop = '5px';
viewportGrid.style.gap = '5px';

content.appendChild(viewportGrid);

// Add input elements for Image Coords
const canvasCoordsForm = document.createElement('form');
canvasCoordsForm.style.marginBottom = '10px';
canvasCoordsForm.innerHTML = `
  <label style="margin-right: 20px;">Canvas Coords: Start [x, y]:</label>
  <input  style="width:40px " type="number" id="start-i" placeholder="Start x" value="0">
  <input  style="width:40px" type="number" id="start-j" placeholder="Start y" value="0">
  <label style="margin-left: 52px; margin-right: 21px;">End [i, j]:</label>
  <input  style="width:40px" type="number" id="end-i" placeholder="End i" value="100">
  <input  style="width:40px" type="number" id="end-j" placeholder="End j" value="100">
  <button  style="  margin-left: 52px;" type="button" id="add-canvas-coords-stack">Add Stack</button>
  <button   type="button" id="add-image-coords-volume">Add Volume</button>
`;
const imageCoordsForm = document.createElement('form');
imageCoordsForm.style.marginBottom = '10px';
imageCoordsForm.innerHTML = `
  <label style="margin-right: 20px;">Image Coords: Start [i, j]:</label>
  <input  style="width:40px " type="number" id="start-i" placeholder="Start i" value="0">
  <input  style="width:40px" type="number" id="start-j" placeholder="Start j" value="0">
  <label style="margin-left: 52px; margin-right: 21px;">End [i, j]:</label>
  <input  style="width:40px" type="number" id="end-i" placeholder="End i" value="100">
  <input  style="width:40px" type="number" id="end-j" placeholder="End j" value="100">
  <button  style="  margin-left: 52px;" type="button" id="add-image-coords-stack">Add Stack</button>
  <button   type="button" id="add-image-coords-volume">Add Volume</button>

`;

// Add input elements for World Coords
const worldCoordsForm = document.createElement('form');
worldCoordsForm.style.marginBottom = '10px';
worldCoordsForm.innerHTML = `
  <label>World Coords: Start [x, y, z]:</label>
  <input  style="width:40px" type="number" id="start-x" placeholder="Start x" value="0">
  <input  style="width:40px" type="number" id="start-y" placeholder="Start y" value="0">
  <input  style="width:40px" type="number" id="start-z" placeholder="Start z" value="0">
  <label>End [x, y, z]:</label>
  <input  style="width:40px" type="number" id="end-x" placeholder="End x" value="0">
  <input  style="width:40px" type="number" id="end-y" placeholder="End y" value="0">
  <input  style="width:40px" type="number" id="end-z" placeholder="End z" value="0">
  <button type="button" id="add-world-coords-stack">Add Stack</button>
  <button type="button" id="add-world-coords-volume">Add Volume</button>
`;

const mousePosDiv = document.createElement('div');

const canvasPosElement = document.createElement('p');
const worldPosElement = document.createElement('p');

canvasPosElement.innerText = 'canvas:';
worldPosElement.innerText = 'world:';

mousePosDiv.appendChild(canvasPosElement);
mousePosDiv.appendChild(worldPosElement);
content.appendChild(mousePosDiv);
demoToolbar.appendChild(canvasCoordsForm);
demoToolbar.appendChild(imageCoordsForm);
demoToolbar.appendChild(worldCoordsForm);

// Event listeners for the buttons
document
  .getElementById('add-image-coords-stack')
  .addEventListener('click', () => {
    const start = [
      parseFloat(
        (document.getElementById('start-i') as HTMLInputElement).value
      ),
      parseFloat(
        (document.getElementById('start-j') as HTMLInputElement).value
      ),
    ];
    const end = [
      parseFloat((document.getElementById('end-i') as HTMLInputElement).value),
      parseFloat((document.getElementById('end-j') as HTMLInputElement).value),
    ];

    addProgrammaticAnnotation(start, end, 'CT_STACK_AXIAL', 'image');
  });

document
  .getElementById('add-canvas-coords-stack')
  .addEventListener('click', () => {
    const start = [
      parseFloat(
        (document.getElementById('start-i') as HTMLInputElement).value
      ),
      parseFloat(
        (document.getElementById('start-j') as HTMLInputElement).value
      ),
    ];
    const end = [
      parseFloat((document.getElementById('end-i') as HTMLInputElement).value),
      parseFloat((document.getElementById('end-j') as HTMLInputElement).value),
    ];

    addProgrammaticAnnotation(start, end, 'CT_STACK_AXIAL', 'canvas');
  });

document
  .getElementById('add-image-coords-volume')
  .addEventListener('click', () => {
    const start = [
      parseFloat(
        (document.getElementById('start-i') as HTMLInputElement).value
      ),
      parseFloat(
        (document.getElementById('start-j') as HTMLInputElement).value
      ),
    ];
    const end = [
      parseFloat((document.getElementById('end-i') as HTMLInputElement).value),
      parseFloat((document.getElementById('end-j') as HTMLInputElement).value),
    ];

    addProgrammaticAnnotation(start, end, 'CT_VOLUME_AXIAL', 'image');
  });

document
  .getElementById('add-world-coords-stack')
  .addEventListener('click', () => {
    const start = [
      parseFloat(
        (document.getElementById('start-x') as HTMLInputElement).value
      ),
      parseFloat(
        (document.getElementById('start-y') as HTMLInputElement).value
      ),
      parseFloat(
        (document.getElementById('start-z') as HTMLInputElement).value
      ),
    ];
    const end = [
      parseFloat((document.getElementById('end-x') as HTMLInputElement).value),
      parseFloat((document.getElementById('end-y') as HTMLInputElement).value),
      parseFloat((document.getElementById('end-z') as HTMLInputElement).value),
    ];

    addProgrammaticAnnotation(start, end, 'CT_STACK_AXIAL', null);
  });

document
  .getElementById('add-world-coords-volume')
  .addEventListener('click', () => {
    const start = [
      parseFloat(
        (document.getElementById('start-x') as HTMLInputElement).value
      ),
      parseFloat(
        (document.getElementById('start-y') as HTMLInputElement).value
      ),
      parseFloat(
        (document.getElementById('start-z') as HTMLInputElement).value
      ),
    ];
    const end = [
      parseFloat((document.getElementById('end-x') as HTMLInputElement).value),
      parseFloat((document.getElementById('end-y') as HTMLInputElement).value),
      parseFloat((document.getElementById('end-z') as HTMLInputElement).value),
    ];

    addProgrammaticAnnotation(start, end, 'CT_VOLUME_AXIAL');
  });

const addProgrammaticAnnotation = (
  start: number[],
  end: number[],
  viewportId: string,
  type?: string
) => {
  const renderingEngine = getRenderingEngine(renderingEngineId);
  const viewport = <Types.IStackViewport>(
    renderingEngine.getViewport(viewportId)
  );
  if (type === 'image') {
    // convert image coords to world coords
    start = utilities.imageToWorldCoords(viewport.getCurrentImageId(), <
      Types.Point2
    >[...start]);
    end = utilities.imageToWorldCoords(viewport.getCurrentImageId(), <
      Types.Point2
    >[...end]);
  } else if (type === 'canvas') {
    // convert canvas coords to world coords
    start = viewport.canvasToWorld(<Types.Point2>[...start]);
    end = viewport.canvasToWorld(<Types.Point2>[...end]);
  }

  cornerstoneTools.utilities.annotationHydration(viewport, 'Length', [
    start as Types.Point3,
    end as Types.Point3,
  ]);

  cornerstoneTools.utilities.triggerAnnotationRenderForViewportIds([
    viewport.id,
  ]);
  viewport.render();
};

async function initializeVolumeViewport(
  viewport: Types.IVolumeViewport,
  volumeId: string,
  imageIds: string[]
) {
  let volume = cache.getVolume(volumeId) as any;

  if (!volume) {
    volume = await volumeLoader.createAndCacheVolume(volumeId, {
      imageIds,
    });

    // Set the volume to load
    volume.load();
  }

  // Set the volume on the viewport
  await viewport.setVolumes([
    { volumeId, callback: setCtTransferFunctionForVolumeActor },
  ]);

  return volume;
}

async function initializeViewport(
  renderingEngine,
  toolGroup,
  viewportInfo,
  imageIds
) {
  const { viewportInput } = viewportInfo;
  const element = document.createElement('div');

  element.id = viewportInput.viewportId;
  element.style.overflow = 'hidden';

  viewportInput.element = element;
  viewportGrid.appendChild(element);

  const { viewportId } = viewportInput;
  const { id: renderingEngineId } = renderingEngine;

  renderingEngine.enableElement(viewportInput);

  // Set the tool group on the viewport
  toolGroup.addViewport(viewportId, renderingEngineId);

  // Get the stack viewport that was created
  const viewport = <Types.IViewport>renderingEngine.getViewport(viewportId);

  if (viewportInput.type === ViewportType.STACK) {
    // Set the stack on the viewport
    (<Types.IStackViewport>viewport).setStack(imageIds);
  } else if (viewportInput.type === ViewportType.ORTHOGRAPHIC) {
    await initializeVolumeViewport(
      viewport as Types.IVolumeViewport,
      volumeId,
      imageIds
    );
  } else {
    throw new Error('Invalid viewport type');
  }

  element.addEventListener('mousemove', (evt) => {
    const rect = element.getBoundingClientRect();

    const canvasPos: Types.Point2 = [
      Math.floor(evt.clientX - rect.left),
      Math.floor(evt.clientY - rect.top),
    ];
    // Convert canvas coordinates to world coordinates
    const worldPos = renderingEngine
      .getViewport(element.id)
      .canvasToWorld(canvasPos);

    canvasPosElement.innerText = `canvas: (${canvasPos[0]}, ${canvasPos[1]})`;
    worldPosElement.innerText = `world: (${worldPos[0].toFixed(
      2
    )}, ${worldPos[1].toFixed(2)}, ${worldPos[2].toFixed(2)})`;
  });
}

function initializeToolGroup(toolGroupId) {
  let toolGroup = cornerstoneTools.ToolGroupManager.getToolGroup(toolGroupId);

  if (toolGroup) {
    return toolGroup;
  }

  // Define a tool group, which defines how mouse events map to tool commands for
  // Any viewport using the group
  toolGroup = cornerstoneTools.ToolGroupManager.createToolGroup(toolGroupId);

  // Add the tools to the tool group
  toolGroup.addTool(cornerstoneTools.LengthTool.toolName);
  toolGroup.addTool(cornerstoneTools.StackScrollTool.toolName);
  toolGroup.setToolPassive(cornerstoneTools.LengthTool.toolName);
  toolGroup.setToolActive(cornerstoneTools.StackScrollTool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Wheel,
      },
    ],
  });

  return toolGroup;
}
async function run() {
  // Init Cornerstone and related libraries
  await initDemo();

  // Add tools to Cornerstone3D
  cornerstoneTools.addTool(cornerstoneTools.LengthTool);
  cornerstoneTools.addTool(cornerstoneTools.StackScrollTool);

  const imageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.334240657131972136850343327463',
    SeriesInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.226151125820845824875394858561',
    wadoRsRoot: 'https://d3t6nz73ql33tx.cloudfront.net/dicomweb',
  });

  // Instantiate a rendering engine
  const renderingEngine = new RenderingEngine(renderingEngineId);

  for (let i = 0; i < viewportsInfo.length; i++) {
    const viewportInfo = viewportsInfo[i];
    const { toolGroupId } = viewportInfo;
    const toolGroup = initializeToolGroup(toolGroupId);

    toolGroupIds.add(toolGroupId);

    await initializeViewport(
      renderingEngine,
      toolGroup,
      viewportInfo,
      imageIds
    );
  }
}

run();
