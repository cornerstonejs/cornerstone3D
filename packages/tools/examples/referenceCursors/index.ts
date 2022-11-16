import {
  RenderingEngine,
  Types,
  volumeLoader,
  Enums,
} from '@cornerstonejs/core';
import {
  initDemo,
  createImageIdsAndCacheMetaData,
  setTitleAndDescription,
  addDropdownToToolbar,
  addSliderToToolbar,
} from '../../../../utils/demo/helpers';
import * as cornerstoneTools from '@cornerstonejs/tools';

// This is for debugging purposes
console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const {
  ToolGroupManager,
  StackScrollMouseWheelTool,
  ReferenceCursors,
  PanTool,
  ZoomTool,
  Enums: csToolsEnums,
} = cornerstoneTools;

const { ViewportType } = Enums;

// Define a unique id for the volume
const volumeName = 'CT_VOLUME_ID'; // Id of the volume less loader prefix
const volumeLoaderScheme = 'cornerstoneStreamingImageVolume'; // Loader id which defines which volume loader to use
const volumeId = `${volumeLoaderScheme}:${volumeName}`; // VolumeId with loader id + volume id

const initialDisableCursor = false;

// ======== Set up page ======== //
setTitleAndDescription(
  'Cursor corsshair syncing example',
  'This example shows how to sync the crosshair cursors between 3 viewports (2 Stack viewports and 1 Volume viewport with a slightly different orientation). To disable orther cursors, set disableCursor to on and then disable and reactivate the tool.'
);

const size = '500px';
const content = document.getElementById('content');
const viewportGrid = document.createElement('div');

viewportGrid.style.display = 'flex';
viewportGrid.style.display = 'flex';
viewportGrid.style.flexDirection = 'row';

const element1 = document.createElement('div');
const element2 = document.createElement('div');
const element3 = document.createElement('div');
element1.style.width = size;
element1.style.height = size;
element1.oncontextmenu = (e) => e.preventDefault();
element2.style.width = size;
element2.style.height = size;
element2.oncontextmenu = (e) => e.preventDefault();
element3.style.height = size;
element3.style.width = size;
element3.oncontextmenu = (e) => e.preventDefault();

viewportGrid.appendChild(element1);
viewportGrid.appendChild(element2);
viewportGrid.appendChild(element3);

content.appendChild(viewportGrid);

const toolGroupId = 'STACK_TOOL_GROUP_ID';

const instructions = document.createElement('p');
instructions.innerText =
  'Simply move the mouse over the viewports to see the correlating positions in the other viewports';

content.append(instructions);

addDropdownToToolbar({
  options: {
    values: ['positionSync on', 'positionSync off'],
    defaultValue: 'positionSync on',
  },
  onSelectedValueChange: (newPositionSync) => {
    const toolGroup = ToolGroupManager.getToolGroup(toolGroupId);
    if (toolGroup) {
      toolGroup.setToolConfiguration(ReferenceCursors.toolName, {
        positionSync: newPositionSync === 'positionSync on',
      });
    }
  },
});

addDropdownToToolbar({
  options: {
    values: ['disableCursor on', 'disableCursor off'],
    defaultValue: initialDisableCursor
      ? 'disableCursor on'
      : 'disableCursor off',
  },
  onSelectedValueChange: (newDisableCursor) => {
    const toolGroup = ToolGroupManager.getToolGroup(toolGroupId);
    if (toolGroup) {
      toolGroup.setToolConfiguration(ReferenceCursors.toolName, {
        disableCursor: newDisableCursor === 'disableCursor on',
      });
    }
  },
});

addDropdownToToolbar({
  options: {
    values: ['tool enabled', 'tool disabled', 'tool passive', 'tool active'],
    defaultValue: 'tool active',
  },
  onSelectedValueChange: (newState) => {
    const toolGroup = ToolGroupManager.getToolGroup(toolGroupId);
    if (toolGroup) {
      switch (newState) {
        case 'tool enabled':
          toolGroup.setToolEnabled(ReferenceCursors.toolName);
          break;
        case 'tool disabled':
          toolGroup.setToolDisabled(ReferenceCursors.toolName);
          break;
        case 'tool passive':
          toolGroup.setToolPassive(ReferenceCursors.toolName);
          break;
        case 'tool active':
          toolGroup.setToolActive(ReferenceCursors.toolName);
          break;
        default:
          throw new Error('unhandled selector value');
      }
    }
  },
});

addSliderToToolbar({
  title: ' displayThreshold: 5 ',
  range: [0, 100],
  defaultValue: 5,
  updateLabelOnChange(value, label) {
    label.innerText = ` displayThreshold: ${value} `;
  },
  onSelectedValueChange: (newDisplayThreshold) => {
    const toolGroup = ToolGroupManager.getToolGroup(toolGroupId);
    if (toolGroup) {
      toolGroup.setToolConfiguration(ReferenceCursors.toolName, {
        displayThreshold: newDisplayThreshold,
      });
    }
  },
});
// ============================= //

/**
 * Runs the demo
 */
async function run() {
  // Init Cornerstone and related libraries
  await initDemo();

  // Add tools to Cornerstone3D
  cornerstoneTools.addTool(ReferenceCursors);
  cornerstoneTools.addTool(StackScrollMouseWheelTool);
  cornerstoneTools.addTool(PanTool);
  cornerstoneTools.addTool(ZoomTool);

  // Define a tool group, which defines how mouse events map to tool commands for
  // Any viewport using the group
  const toolGroup = ToolGroupManager.createToolGroup(toolGroupId);

  // Add the tools to the tool group and specify which volume they are pointing at
  toolGroup.addTool(ReferenceCursors.toolName);
  toolGroup.addTool(StackScrollMouseWheelTool.toolName);
  toolGroup.addTool(PanTool.toolName);
  toolGroup.addTool(ZoomTool.toolName);

  toolGroup?.setToolConfiguration(ReferenceCursors.toolName, {
    positionSync: true,
    disableCursor: initialDisableCursor,
  });

  // Get Cornerstone imageIds and fetch metadata into RAM
  const volumeImageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.334240657131972136850343327463',
    SeriesInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.226151125820845824875394858561',
    wadoRsRoot: 'https://d3t6nz73ql33tx.cloudfront.net/dicomweb',
    type: 'VOLUME',
  });

  const stackImageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.334240657131972136850343327463',
    SeriesInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.226151125820845824875394858561',
    wadoRsRoot: 'https://d3t6nz73ql33tx.cloudfront.net/dicomweb',
    type: 'STACK',
  });

  const smallVolumeImageIds = [volumeImageIds[42], volumeImageIds[43]]; // Small bit of the body
  const smallStackImageIds = [stackImageIds[42], stackImageIds[43]]; // Small bit of the body

  // Instantiate a rendering engine
  const renderingEngineId = 'myRenderingEngine';
  const renderingEngine = new RenderingEngine(renderingEngineId);

  // Create the viewports
  const viewportIds = ['CT_AXIAL_VOLUME', 'CT_AXIAL_STACK', 'CT_AXIAL_STACK2'];

  const viewportInputArray = [
    {
      viewportId: viewportIds[0],
      type: ViewportType.ORTHOGRAPHIC,
      element: element1,
      defaultOptions: {
        orientation: Enums.OrientationAxis.AXIAL,
        background: <Types.Point3>[0.2, 0, 0.2],
      },
    },
    {
      viewportId: viewportIds[1],
      type: ViewportType.STACK,
      element: element2,
      defaultOptions: {
        background: <Types.Point3>[0.2, 0, 0.2],
      },
    },
    {
      viewportId: viewportIds[2],
      type: ViewportType.STACK,
      element: element3,
      defaultOptions: {
        background: <Types.Point3>[0.2, 0, 0.2],
      },
    },
  ];

  renderingEngine.setViewports(viewportInputArray);

  // Set the tool group on the viewports
  viewportIds.forEach((viewportId) =>
    toolGroup.addViewport(viewportId, renderingEngineId)
  );

  // Define a volume in memory
  const volume = await volumeLoader.createAndCacheVolume(volumeId, {
    imageIds: smallVolumeImageIds,
  });

  const volumeViewport = <Types.IVolumeViewport>(
    renderingEngine.getViewport(viewportIds[0])
  );
  const stackViewport = <Types.IStackViewport>(
    renderingEngine.getViewport(viewportIds[1])
  );

  const stackViewport2 = <Types.IStackViewport>(
    renderingEngine.getViewport(viewportIds[2])
  );

  // Set the stack on the stackViewport
  stackViewport.setStack(smallStackImageIds);
  stackViewport2.setStack(smallStackImageIds);

  // Set the volume to load
  volume.load();

  // Set the volume on the viewport
  volumeViewport.setVolumes([{ volumeId }]).then(() => {
    volumeViewport.setCamera({
      viewPlaneNormal: [0, 0.1, -1],
      viewUp: [0, 1, 0],
    });
  });

  // As the Stack Scroll mouse wheel is a tool using the `mouseWheelCallback`
  // hook instead of mouse buttons, it does not need to assign any mouse button.
  toolGroup.setToolActive(StackScrollMouseWheelTool.toolName);

  toolGroup.setToolActive(PanTool.toolName, {
    bindings: [{ mouseButton: csToolsEnums.MouseBindings.Primary }],
  });
  toolGroup.setToolActive(ZoomTool.toolName, {
    bindings: [{ mouseButton: csToolsEnums.MouseBindings.Secondary }],
  });

  // Set the initial state of the tools, here we set one tool active on left click.
  // This means left click will draw that tool.
  toolGroup.setToolActive(ReferenceCursors.toolName);

  // Render the image
  renderingEngine.renderViewports(viewportIds);
}

run();
