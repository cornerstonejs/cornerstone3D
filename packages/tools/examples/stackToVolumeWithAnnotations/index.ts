import * as cornerstone from '@cornerstonejs/core';
import { Types } from '@cornerstonejs/core';
import * as cornerstoneTools from '@cornerstonejs/tools';

import {
  addButtonToToolbar,
  addDropdownToToolbar,
  addManipulationBindings,
  createImageIdsAndCacheMetaData,
  createInfoSection,
  initDemo,
  setTitleAndDescription,
} from '../../../../utils/demo/helpers';

// This is for debugging purposes
console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const {
  Enums: csEnums,
  RenderingEngine,
  getRenderingEngine,
  utilities: csUtilities,
} = cornerstone;
const { ViewportType } = csEnums;

const {
  Enums: csToolsEnums,
  LengthTool,
  StackScrollMouseWheelTool,
  ToolGroupManager,
  utilities: csToolsUtilities,
} = cornerstoneTools;
const { MouseBindings } = csToolsEnums;

//
let renderingEngine;
const renderingEngineId = 'MY_RENDERING_ENGINE_ID';
let toolGroup;
const toolGroupId = 'MY_TOOL_GROUP_ID';
const viewportIds = ['CT_VIEWPORT'];
let imageIds;
const volumeLoaderScheme = 'cornerstoneStreamingImageVolume';
const volumeId = volumeLoaderScheme + ':myVolume';

const toolsNames = [LengthTool.toolName];
let selectedToolName = toolsNames[0];

// ======== Set up page ======== //

setTitleAndDescription(
  'Stack and VolumeViewport conversions',
  'In this demo, you see how the stack and volume viewport conversions work. The purple background represents a StackViewport while the green background represents a VolumeViewport. You can start annotating the images and annotations will be rendered correctly regardless of the viewport they were drawn on.'
);

const size = '500px';

const demoToolbar = document.getElementById('demo-toolbar');

const group1 = document.createElement('div');
group1.style.marginBottom = '10px';
demoToolbar.appendChild(group1);

const content = document.getElementById('content');

const viewportGrid = document.createElement('div');
viewportGrid.style.display = 'flex';
viewportGrid.style.flexDirection = 'row';

const element1 = document.createElement('div');
element1.style.width = size;
element1.style.height = size;

// Disable right click context menu so we can have right click tools
element1.oncontextmenu = (e) => e.preventDefault();

viewportGrid.appendChild(element1);

content.appendChild(viewportGrid);

createInfoSection(content).addInstruction('Left Click to use selected tool');

// ============================= //

addDropdownToToolbar({
  style: {
    marginRight: '5px',
  },
  options: { values: toolsNames, defaultValue: selectedToolName },
  onSelectedValueChange: (newSelectedToolNameAsStringOrNumber) => {
    const newSelectedToolName = String(newSelectedToolNameAsStringOrNumber);

    // Set the new tool active
    toolGroup.setToolActive(newSelectedToolName, {
      bindings: [
        {
          mouseButton: MouseBindings.Primary, // Left Click
        },
      ],
    });

    // Set the old tool passive
    toolGroup.setToolPassive(selectedToolName);

    selectedToolName = <string>newSelectedToolName;
  },
  container: group1,
});

addButtonToToolbar({
  title: 'Switch StackViewport to VolumeViewport, and vice versa',
  onClick: async () => {
    // Get the rendering engine
    const renderingEngine = getRenderingEngine(renderingEngineId);

    const viewport = renderingEngine.getViewport(viewportIds[0]);

    let newViewport;

    if (viewport.type === ViewportType.STACK) {
      newViewport = await csUtilities.convertStackToVolumeViewport({
        viewport: viewport as Types.IStackViewport,
        options: {
          background: <Types.Point3>[0, 0.4, 0],
          volumeId: volumeId,
        },
      });
    } else {
      newViewport = await csUtilities.convertVolumeToStackViewport({
        viewport: viewport as Types.IVolumeViewport,
        options: {
          background: <Types.Point3>[0.4, 0.0, 0.4],
        },
      });
    }

    // Set the tool group on the viewport
    if (toolGroup) {
      toolGroup.addViewport(newViewport.id, renderingEngineId);
    }
  },
  container: group1,
});

// ============================= //

/**
 * Runs the demo
 */
async function run() {
  // Init Cornerstone and related libraries
  await initDemo();

  // Define a tool group, which defines how mouse events map to tool commands for
  // Any viewport using the group
  toolGroup = ToolGroupManager.createToolGroup(toolGroupId);

  addManipulationBindings(toolGroup);

  toolGroup.setToolActive(LengthTool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Primary, // Left Click
      },
    ],
  });

  // We set all the other tools passive here, this means that any state is rendered, and editable
  // But aren't actively being drawn (see the toolModes example for information)
  toolGroup.setToolActive(StackScrollMouseWheelTool.toolName);

  // Get Cornerstone imageIds and fetch metadata into RAM
  imageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.334240657131972136850343327463',
    SeriesInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.226151125820845824875394858561',
    wadoRsRoot: 'https://d3t6nz73ql33tx.cloudfront.net/dicomweb',
  });

  // Instantiate a rendering engine
  renderingEngine = new RenderingEngine(renderingEngineId);

  // Create a stack viewport
  const viewportInput = {
    viewportId: viewportIds[0],
    type: ViewportType.STACK,

    element: element1,
    defaultOptions: {
      background: <Types.Point3>[0.4, 0, 0.4],
    },
  };

  renderingEngine.enableElement(viewportInput);

  // Set the tool group on the viewport
  toolGroup.addViewport(viewportIds[0], renderingEngineId);

  // Get the stack viewport that was created
  const viewport = <Types.IStackViewport>(
    renderingEngine.getViewport(viewportIds[0])
  );

  // Set the stack on the viewport
  viewport.setStack(imageIds, 80);

  csToolsUtilities.stackContextPrefetch.enable(viewport.element);

  // const volumeId = 'volumeId';
  // const volume = await cornerstone.volumeLoader.createAndCacheEmptyVolume(
  //   volumeId,
  //   {
  //     imageIds,
  //   }
  // );

  // volume.load();

  // viewport.setVolumes([
  //   {
  //     volumeId,
  //   },
  // ]);

  renderingEngine.render();
}

run();
