import {
  RenderingEngine,
  Types,
  Enums,
  setVolumesForViewports,
  volumeLoader,
  CONSTANTS,
} from '@cornerstonejs/core';
import {
  initDemo,
  createImageIdsAndCacheMetaData,
  setTitleAndDescription,
} from '../../../../utils/demo/helpers';
import * as cornerstoneTools from '@cornerstonejs/tools';

// This is for debugging purposes
console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const {
  ZoomTool,
  ScaleOverlayTool,
  StackScrollMouseWheelTool,
  ToolGroupManager,
  Enums: csToolsEnums,
} = cornerstoneTools;

const { ViewportType } = Enums;
const { ORIENTATION } = CONSTANTS;
const { MouseBindings } = csToolsEnums;

// Define a unique id for the volume
const volumeName = 'CT_VOLUME_ID'; // Id of the volume less loader prefix
const volumeLoaderScheme = 'cornerstoneStreamingImageVolume'; // Loader id which defines which volume loader to use
const volumeId = `${volumeLoaderScheme}:${volumeName}`; // VolumeId with loader id + volume id

// ======== Set up page ======== //
setTitleAndDescription(
  'ScaleOverlay Tool On Volumes',
  'Here we demonstrate how Scale overlay tools can be rendered on plane.'
);

const size = '500px';
const content = document.getElementById('content');
const viewportGrid = document.createElement('div');

viewportGrid.style.display = 'flex';
viewportGrid.style.display = 'flex';
viewportGrid.style.flexDirection = 'row';

const element1 = document.createElement('div');
element1.style.width = size;
element1.style.height = size;

viewportGrid.appendChild(element1);
content.appendChild(viewportGrid);

const instructions = document.createElement('p');
instructions.innerText =
  'Left Click to draw zoom measurements on viewport.\n Use the mouse wheel to scroll through the stack.';

content.append(instructions);
// ============================= //

/**
 * Runs the demo
 */
async function run() {
  // Init Cornerstone and related libraries
  await initDemo();

  const toolGroupId = 'STACK_TOOL_GROUP_ID';

  // Add tools to Cornerstone3D
  cornerstoneTools.addTool(ZoomTool);
  cornerstoneTools.addTool(ScaleOverlayTool);
  cornerstoneTools.addTool(StackScrollMouseWheelTool);
  // Define a tool group, which defines how mouse events map to tool commands for
  // Any viewport using the group
  const toolGroup = ToolGroupManager.createToolGroup(toolGroupId);

  // Add the tools to the tool group and specify which volume they are pointing at
  toolGroup.addTool(ZoomTool.toolName, { configuration: { volumeId } });
  toolGroup.addTool(ScaleOverlayTool.toolName);
  toolGroup.addTool(StackScrollMouseWheelTool.toolName);
  // Set the initial state of the tools, here we set one tool active on left click.
  // This means left click will draw that tool.
  toolGroup.setToolActive(ZoomTool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Primary, // Left Click
      },
    ],
  });
  toolGroup.setToolActive(ScaleOverlayTool.toolName);
  toolGroup.setToolActive(StackScrollMouseWheelTool.toolName);
  // Get Cornerstone imageIds and fetch metadata into RAM
  const imageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.334240657131972136850343327463',
    SeriesInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.226151125820845824875394858561',
    wadoRsRoot: 'https://d1qmxk7r72ysft.cloudfront.net/dicomweb',
    type: 'VOLUME',
  });

  // Instantiate a rendering engine
  const renderingEngineId = 'myRenderingEngine';
  const renderingEngine = new RenderingEngine(renderingEngineId);

  // Create the viewports
  const viewportId = 'CT_AXIAL_STACK';

  const viewportInput = {
    viewportId: viewportId,
    type: ViewportType.ORTHOGRAPHIC,
    element: element1,
    defaultOptions: {
      orientation: ORIENTATION.AXIAL,
      background: <Types.Point3>[0.2, 0, 0.2],
    },
  };

  renderingEngine.setViewports([viewportInput]);

  // Set the tool group on the viewports
  toolGroup.addViewport(viewportId, renderingEngineId);

  // Define a volume in memory
  const volume = await volumeLoader.createAndCacheVolume(volumeId, {
    imageIds,
  });

  // Set the volume to load
  volume.load();

  setVolumesForViewports(renderingEngine, [{ volumeId }], [viewportId]);

  // Render the image
  renderingEngine.renderViewports([viewportId]);
}

run();
