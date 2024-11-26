import type { Types } from '@cornerstonejs/core';
import {
  RenderingEngine,
  Enums,
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
import { LengthTool, ProbeTool } from '@cornerstonejs/tools';
import {
  createToolUI,
  STACK_VIEWPORT_ID,
  VOLUME_VIEWPORT_ID,
} from './toolSpecificUI';
import addDropDownToToolbar from '../../../../utils/demo/helpers/addDropdownToToolbar';

// This is for debugging purposes
console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const { ViewportType } = Enums;
const { MouseBindings } = cornerstoneTools.Enums;
const renderingEngineId = 'myRenderingEngine';
const toolGroupIds = new Set<string>();
const volumeName = 'CT_VOLUME_ID'; // Id of the volume less loader prefix
const volumeLoaderScheme = 'cornerstoneStreamingImageVolume'; // Loader id which defines which volume loader to use
const volumeId = `${volumeLoaderScheme}:${volumeName}`; // VolumeId with loader id + volume id

const viewportsInfo = [
  {
    toolGroupId: 'STACK_TOOLGROUP_ID',
    viewportInput: {
      viewportId: STACK_VIEWPORT_ID,
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
      viewportId: VOLUME_VIEWPORT_ID,
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

const tools = [LengthTool, ProbeTool];
const toolNames = tools.map((tool) => tool.toolName);

const content = document.getElementById('content');
const viewportGrid = document.createElement('div');

viewportGrid.style.display = 'grid';
viewportGrid.style.gridTemplateColumns = `auto auto`;
viewportGrid.style.width = '100%';
viewportGrid.style.height = '500px';
viewportGrid.style.paddingTop = '5px';
viewportGrid.style.gap = '5px';

content.appendChild(viewportGrid);

const mousePosDiv = document.createElement('div');

const canvasPosElement = document.createElement('p');
const worldPosElement = document.createElement('p');

canvasPosElement.innerText = 'canvas:';
worldPosElement.innerText = 'world:';

mousePosDiv.appendChild(canvasPosElement);
mousePosDiv.appendChild(worldPosElement);
content.appendChild(mousePosDiv);

const demoToolbar = document.getElementById('demo-toolbar');
addDropDownToToolbar({
  options: {
    values: toolNames,
  },
  labelText: 'Select Tool',
  container: demoToolbar,
  onSelectedValueChange: (toolName: string) => {
    // Clear existing UI
    const forms = demoToolbar.querySelectorAll('form');
    forms.forEach((form) => form.remove());

    // Create new UI for selected tool
    const toolUI = createToolUI(toolName, {
      toolName,
      renderingEngineId,
      content,
      demoToolbar,
    });

    if (toolUI) {
      toolUI.forms.forEach((form) => demoToolbar.appendChild(form));
    }

    // Update active tool in toolGroups
    toolGroupIds.forEach((toolGroupId) => {
      const toolGroup =
        cornerstoneTools.ToolGroupManager.getToolGroup(toolGroupId);
      if (toolGroup) {
        // Deactivate current tool
        const currentTool = toolGroup.getActivePrimaryMouseButtonTool();
        if (currentTool) {
          toolGroup.setToolPassive(currentTool);
        }
        // Activate new tool
        toolGroup.setToolActive(toolName);
      }
    });
  },
});

const { forms } = createToolUI(LengthTool.toolName, {
  toolName: LengthTool.toolName,
  renderingEngineId,
  content,
  demoToolbar,
});

forms.forEach((form) => {
  demoToolbar.appendChild(form);
});

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
  tools.forEach((tool) => {
    toolGroup.addTool(tool.toolName);
  });

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
  tools.forEach((tool) => {
    cornerstoneTools.addTool(tool);
  });
  cornerstoneTools.addTool(cornerstoneTools.StackScrollTool);

  const stackImageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.334240657131972136850343327463',
    SeriesInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.285235930168924996436870336581',
    wadoRsRoot: 'https://d3t6nz73ql33tx.cloudfront.net/dicomweb',
  });
  const volumeImageIds = await createImageIdsAndCacheMetaData({
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
      i === 0 ? stackImageIds : volumeImageIds
    );
  }
}

run();
