import {
  RenderingEngine,
  Types,
  Enums,
  setVolumesForViewports,
  volumeLoader,
} from '@cornerstonejs/core';
import {
  initDemo,
  createImageIdsAndCacheMetaData,
  setTitleAndDescription,
  addButtonToToolbar,
  addToggleButtonToToolbar,
} from '../../../../utils/demo/helpers';
import * as cornerstoneTools from '@cornerstonejs/tools';
import addDropDownToToolbar from '../../../../utils/demo/helpers/addDropdownToToolbar';

// This is for debugging purposes
console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const {
  ToolGroupManager,
  StackScrollMouseWheelTool,
  ZoomTool,
  ReferenceLines,
  PanTool,
  Enums: csToolsEnums,
  WindowLevelTool,
} = cornerstoneTools;

const { ViewportType } = Enums;
const { MouseBindings } = csToolsEnums;

// Define a unique id for the volume
const volumeName = 'CT_VOLUME_ID'; // Id of the volume less loader prefix
const volumeLoaderScheme = 'cornerstoneStreamingImageVolume'; // Loader id which defines which volume loader to use
const volumeId = `${volumeLoaderScheme}:${volumeName}`; // VolumeId with loader id + volume id

// ======== Set up page ======== //
setTitleAndDescription(
  'Volume Slab Scroll',
  'Here we demonstrate how you can programmatically change the slab thickness of volume for rendering and view them in 3D.'
);

const size = '500px';
const content = document.getElementById('content');
const viewportGrid = document.createElement('div');

viewportGrid.style.display = 'flex';
viewportGrid.style.flexDirection = 'row';

const element1 = document.createElement('div');
const element2 = document.createElement('div');
const element3 = document.createElement('div');
element1.oncontextmenu = () => false;
element2.oncontextmenu = () => false;
element3.oncontextmenu = () => false;

element1.style.width = size;
element1.style.height = size;
element2.style.width = size;
element2.style.height = size;
element3.style.width = size;
element3.style.height = size;

viewportGrid.appendChild(element1);
viewportGrid.appendChild(element2);
viewportGrid.appendChild(element3);

content.appendChild(viewportGrid);

const instructions = document.createElement('p');
instructions.innerText =
  'Choose the level of thickness you want to view the volume in 3D.';

content.append(instructions);
// ============================= //

let renderingEngine;

const viewportIds = ['CT_AXIAL', 'CT_SAGITTAL', 'CT_OBLIQUE'];
let activeViewportId = viewportIds[0];
let targetSlabThickness = 1;
let toolGroup;

addDropDownToToolbar({
  id: 'viewportIdSelector',
  options: {
    defaultValue: activeViewportId,
    values: viewportIds,
  },
  labelText: 'Active Viewport to Change Slab Thickness',
  onSelectedValueChange: (value) => {
    activeViewportId = value as string;
    toolGroup.setToolDisabled(ReferenceLines.toolName);
    toolGroup.setToolConfiguration(ReferenceLines.toolName, {
      sourceViewportId: activeViewportId,
    });
    toolGroup.setToolEnabled(ReferenceLines.toolName);
    renderingEngine.render();
  },
});

/**
 * - add button to change slab thickness dropdown
 * - test on the other orientations
 */

addDropDownToToolbar({
  id: 'slabThickness',
  options: {
    defaultValue: targetSlabThickness,
    values: [1, 2.5, 3, 4.5, 5, 20],
  },
  labelText: 'Slab Thickness',
  onSelectedValueChange: (value) => {
    targetSlabThickness = value as number;
  },
});

addButtonToToolbar({
  id: 'slabChange',
  title: 'Apply',
  onClick: () => {
    const viewport = renderingEngine.getViewport(activeViewportId);

    viewport.setProperties({ slabThickness: targetSlabThickness });

    // Todo: i think we should move this to set properties as well
    viewport.setBlendMode(Enums.BlendModes.AVERAGE_INTENSITY_BLEND);
    viewport.render();
  },
});

addButtonToToolbar({
  title: 'Reset',
  onClick: () => {
    const viewport = renderingEngine.getViewport(activeViewportId);

    viewport.resetProperties();
    viewport.render();
  },
});

addToggleButtonToToolbar({
  id: 'slabScroll',
  title: 'Toggle Slab Scroll',
  defaultToggle: false,
  onClick: (toggle) => {
    const scrollSlabs = !!toggle;
    toolGroup.setToolConfiguration(StackScrollMouseWheelTool.toolName, {
      scrollSlabs,
    });
  },
});

/**
 * Runs the demo
 */
async function run() {
  // Init Cornerstone and related libraries
  await initDemo();

  const toolGroupId = 'STACK_TOOL_GROUP_ID';

  // Add tools to Cornerstone3D
  cornerstoneTools.addTool(WindowLevelTool);
  cornerstoneTools.addTool(ReferenceLines);
  cornerstoneTools.addTool(PanTool);
  cornerstoneTools.addTool(ZoomTool);
  cornerstoneTools.addTool(StackScrollMouseWheelTool);

  // Define a tool group, which defines how mouse events map to tool commands for
  // Any viewport using the group
  toolGroup = ToolGroupManager.createToolGroup(toolGroupId);

  // Add the tools to the tool group and specify which volume they are pointing at
  toolGroup.addTool(WindowLevelTool.toolName, { volumeId });
  toolGroup.addTool(ReferenceLines.toolName, { volumeId });
  toolGroup.addTool(PanTool.toolName, { volumeId });
  toolGroup.addTool(ZoomTool.toolName, { volumeId });
  toolGroup.addTool(StackScrollMouseWheelTool.toolName);

  // Set the initial state of the tools, here we set one tool active on left click.
  // This means left click will draw that tool.
  toolGroup.setToolActive(WindowLevelTool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Primary, // Left Click
      },
    ],
  });
  toolGroup.setToolActive(PanTool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Auxiliary, // Left Click
      },
    ],
  });

  toolGroup.setToolActive(ZoomTool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Secondary, // Right Click
      },
    ],
  });
  toolGroup.setToolEnabled(ReferenceLines.toolName);
  toolGroup.setToolConfiguration(ReferenceLines.toolName, {
    sourceViewportId: 'CT_AXIAL',
  });

  // As the Stack Scroll mouse wheel is a tool using the `mouseWheelCallback`
  // hook instead of mouse buttons, it does not need to assign any mouse button.
  toolGroup.setToolActive(StackScrollMouseWheelTool.toolName);

  // Get Cornerstone imageIds and fetch metadata into RAM
  const imageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.334240657131972136850343327463',
    SeriesInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.226151125820845824875394858561',
    wadoRsRoot: 'https://d3t6nz73ql33tx.cloudfront.net/dicomweb',
  });

  // Instantiate a rendering engine
  const renderingEngineId = 'myRenderingEngine';
  renderingEngine = new RenderingEngine(renderingEngineId);

  // Create the viewports

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
      type: ViewportType.ORTHOGRAPHIC,
      element: element2,
      defaultOptions: {
        orientation: Enums.OrientationAxis.SAGITTAL,
        background: <Types.Point3>[0.2, 0, 0.2],
      },
    },
    {
      viewportId: viewportIds[2],
      type: ViewportType.ORTHOGRAPHIC,
      element: element3,
      defaultOptions: {
        orientation: Enums.OrientationAxis.CORONAL,
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
    imageIds,
  });

  // Set the volume to load
  volume.load();

  setVolumesForViewports(renderingEngine, [{ volumeId }], viewportIds);

  // Render the image
  renderingEngine.renderViewports(viewportIds);
}

run();
