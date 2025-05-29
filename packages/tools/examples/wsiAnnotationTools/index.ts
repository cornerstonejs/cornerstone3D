import type { Types } from '@cornerstonejs/core';
import { RenderingEngine, Enums, WSIViewport } from '@cornerstonejs/core';
import * as cornerstoneTools from '@cornerstonejs/tools';
import dicomImageLoader from '@cornerstonejs/dicom-image-loader';
import { api } from 'dicomweb-client';

import {
  initDemo,
  setTitleAndDescription,
  createImageIdsAndCacheMetaData,
  getLocalUrl,
  addDropdownToToolbar,
  addManipulationBindings,
} from '../../../../utils/demo/helpers';

// This is for debugging purposes
console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const {
  LengthTool,
  ProbeTool,
  RectangleROITool,
  EllipticalROITool,
  CircleROITool,
  BidirectionalTool,
  AngleTool,
  CobbAngleTool,
  ToolGroupManager,
  ArrowAnnotateTool,
  PlanarFreehandROITool,
  Enums: csToolsEnums,
} = cornerstoneTools;

const { MouseBindings } = csToolsEnums;
const toolGroupId = 'default';

const { wadors } = dicomImageLoader;

const { ViewportType, Events } = Enums;

// ======== Constants ======= //
const renderingEngineId = 'myRenderingEngine';
const viewportId = 'videoViewport';

// ======== Set up page ======== //
setTitleAndDescription(
  'WSI Annotation Tools',
  'Demonstrates WSI Annotation Tools'
);

const toolsNames = [
  LengthTool.toolName,
  // ProbeTool.toolName,
  RectangleROITool.toolName,
  EllipticalROITool.toolName,
  CircleROITool.toolName,
  BidirectionalTool.toolName,
  AngleTool.toolName,
  CobbAngleTool.toolName,
  ArrowAnnotateTool.toolName,
  PlanarFreehandROITool.toolName,
  // KeyImageTool.toolName,
];
let selectedToolName = toolsNames[0];

addDropdownToToolbar({
  options: { values: toolsNames, defaultValue: selectedToolName },
  onSelectedValueChange: (newSelectedToolNameAsStringOrNumber) => {
    const newSelectedToolName = String(newSelectedToolNameAsStringOrNumber);
    const toolGroup = ToolGroupManager.getToolGroup(toolGroupId);

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
});

const content = document.getElementById('content');
const element = document.createElement('div');
element.id = 'cornerstone-element';
element.oncontextmenu = () => false;
element.style.width = '500px';
element.style.height = '500px';

content.appendChild(element);

function registerTools() {
  // Add tools to Cornerstone3D
  cornerstoneTools.addTool(ProbeTool);
  cornerstoneTools.addTool(RectangleROITool);
  cornerstoneTools.addTool(EllipticalROITool);
  cornerstoneTools.addTool(CircleROITool);
  cornerstoneTools.addTool(BidirectionalTool);
  cornerstoneTools.addTool(AngleTool);
  cornerstoneTools.addTool(CobbAngleTool);
  cornerstoneTools.addTool(ArrowAnnotateTool);
  cornerstoneTools.addTool(PlanarFreehandROITool);
}

function createToolGroup(toolGroupId = 'default') {
  // Define a tool group, which defines how mouse events map to tool commands for
  // Any viewport using the group
  const toolGroup = ToolGroupManager.createToolGroup(toolGroupId);
  addManipulationBindings(toolGroup);

  // Add tools to the tool group
  toolGroup.addTool(ProbeTool.toolName);
  toolGroup.addTool(RectangleROITool.toolName);
  toolGroup.addTool(EllipticalROITool.toolName);
  toolGroup.addTool(CircleROITool.toolName);
  toolGroup.addTool(BidirectionalTool.toolName);
  toolGroup.addTool(AngleTool.toolName);
  toolGroup.addTool(CobbAngleTool.toolName);
  toolGroup.addTool(ArrowAnnotateTool.toolName);
  toolGroup.addTool(PlanarFreehandROITool.toolName);

  // Set the initial state of the tools, here we set one tool active on left click.
  // This means left click will draw that tool.
  toolGroup.setToolActive(toolsNames[0], {
    bindings: [
      {
        mouseButton: MouseBindings.Primary, // Left Click
      },
    ],
  });

  return toolGroup;
}
/**
 * Runs the demo
 */
async function run() {
  // Init Cornerstone and related libraries
  await initDemo();

  registerTools();
  const toolGroup = createToolGroup(toolGroupId);

  // Get Cornerstone imageIds and fetch metadata
  const wadoRsRoot =
    getLocalUrl() || 'https://d3t6nz73ql33tx.cloudfront.net/dicomweb';
  const client = new api.DICOMwebClient({ url: wadoRsRoot });
  const imageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID: '1.2.276.1.74.1.2.132733202464108492637644434464108492',
    SeriesInstanceUID:
      '2.16.840.1.113883.3.8467.132733202477512857637644434477512857',
    client,
    wadoRsRoot,
    convertMultiframe: false,
  });

  // Instantiate a rendering engine
  const renderingEngine = new RenderingEngine(renderingEngineId);

  // Create a stack viewport

  const viewportInput = {
    viewportId,
    type: ViewportType.WHOLE_SLIDE,
    element,
    defaultOptions: {
      background: <Types.Point3>[0.1, 0.1, 0.1],
    },
  };

  renderingEngine.enableElement(viewportInput);

  // Get the stack viewport that was created
  const viewport = <Types.IWSIViewport>renderingEngine.getViewport(viewportId);

  client.getDICOMwebMetadata = (imageId) => wadors.metaDataManager.get(imageId);
  // Set the stack on the viewport
  await viewport.setDataIds(imageIds, { webClient: client });

  toolGroup.addViewport(viewportId, renderingEngineId);
}

run();
