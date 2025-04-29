import vtkColormaps from '@kitware/vtk.js/Rendering/Core/ColorTransferFunction/ColorMaps';
import type { Types } from '@cornerstonejs/core';
import {
  RenderingEngine,
  Enums,
  getRenderingEngine,
} from '@cornerstonejs/core';
import { utilities as cstUtils } from '@cornerstonejs/tools';
import {
  initDemo,
  createImageIdsAndCacheMetaData,
  setTitleAndDescription,
  addDropdownToToolbar,
} from '../../../../utils/demo/helpers';
import * as cornerstoneTools from '@cornerstonejs/tools';

const { ViewportColorbar } = cstUtils.voi.colorbar;
const { ColorbarRangeTextPosition } = cstUtils.voi.colorbar.Enums;

// This is for debugging purposes
console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const {
  PanTool,
  WindowLevelTool,
  StackScrollTool,
  ZoomTool,
  ToolGroupManager,
  Enums: csToolsEnums,
} = cornerstoneTools;

const { ViewportType } = Enums;
const { MouseBindings } = csToolsEnums;
const renderingEngineId = 'myRenderingEngine';
const toolGroupId = 'STACK_TOOLGROUP_ID';
const viewportId = 'CT_STACK_AXIAL';
const colorbarWidth = 20; // px
let ctColorbar = null;

// Convert all VTK colormaps to the one supported by the colorbar which actualy
// have almost the same properties.
const colormaps = vtkColormaps.rgbPresetNames.map((presetName) =>
  vtkColormaps.getPresetByName(presetName)
);

// Colormap to load right after loading the example page but it can be changed
// after selecting a different one from the dropdown.
const currentPTColormapName = 'Grayscale';

// ======== Set up page ======== //
setTitleAndDescription(
  'Colorbar',
  'Interactive colorbar that can be used to manipulate the VOI on a stack viewport'
);

const content = document.getElementById('content');

// Container where the viewport and the color bars are added to
const viewportGrid = document.createElement('div');

Object.assign(viewportGrid.style, {
  position: 'relative',
  width: '532px',
  height: '512px',
  marginTop: '5px',
  display: 'grid',
  gridTemplateColumns: `1fr ${colorbarWidth}px`, // Default with colorbar on the right
});

content.appendChild(viewportGrid);

const info = document.createElement('div');
content.appendChild(info);

const addInstruction = (instruction) => {
  const node = document.createElement('p');
  node.innerText = instruction;
  info.appendChild(node);
};

addInstruction('- Select different colormaps');
addInstruction('- Click and drag on the viewport to change VOI');
addInstruction('- Click and drag on the color bar to change VOI');

// ==[ Toolbar ]================================================================

// Dropdown that allows the user to select a different colormap
addDropdownToToolbar({
  labelText: 'Colormap: ',
  options: {
    values: colormaps.map((cm) => cm.Name),
    defaultValue: currentPTColormapName,
  },
  style: {
    maxWidth: '200px',
  },
  onSelectedValueChange: (selectedValue) => {
    ctColorbar.activeColormapName = selectedValue;
    setViewportColormap(<string>selectedValue);
  },
});

// Dropdown that allows the user to change colorbar position
addDropdownToToolbar({
  labelText: 'Colorbar Position: ',
  options: {
    values: ['right', 'left', 'bottom'],
    defaultValue: 'right',
  },
  style: {
    maxWidth: '120px',
  },
  onSelectedValueChange: (position) => {
    updateColorbarPosition(position as string);
  },
});

// =============================================================================

// Change the colormap of an specific viewport
function setViewportColormap(colormapName: string) {
  // Get the rendering engine
  const renderingEngine = getRenderingEngine(renderingEngineId);

  // Get the volume viewport
  const viewport = <Types.IVolumeViewport>(
    renderingEngine.getViewport(viewportId)
  );

  viewport.setProperties({ colormap: { name: colormapName } });
  viewport.render();
}

// Update the colorbar position
function updateColorbarPosition(position: string) {
  const renderingEngine = getRenderingEngine(renderingEngineId);
  if (!renderingEngine) {
    return; // Exit if rendering engine not ready yet
  }

  const viewport = renderingEngine.getViewport(viewportId);
  if (!viewport) {
    return; // Exit if viewport not ready yet
  }

  const element = viewport.element;

  // Save current colormap if colorbar exists
  const currentColormapName = ctColorbar
    ? ctColorbar.activeColormapName
    : 'Grayscale';

  // Remove the old colorbar and its container if they exist
  if (ctColorbar) {
    ctColorbar.destroy();
  }

  const oldContainer = document.querySelector('#colorbarContainer');
  if (oldContainer) {
    oldContainer.remove();
  }

  // Recreate the grid layout based on position
  if (position === 'bottom') {
    viewportGrid.style.display = 'grid';
    viewportGrid.style.gridTemplateRows = `1fr ${colorbarWidth}px`;
    viewportGrid.style.gridTemplateColumns = '1fr';
  } else {
    viewportGrid.style.display = 'grid';
    viewportGrid.style.gridTemplateRows = '1fr';
    viewportGrid.style.gridTemplateColumns =
      position === 'right'
        ? `1fr ${colorbarWidth}px`
        : `${colorbarWidth}px 1fr`;
  }

  // Create a new colorbar container
  const colorbarContainer = document.createElement('div');
  colorbarContainer.id = 'colorbarContainer';

  Object.assign(colorbarContainer.style, {
    position: 'relative',
    boxSizing: 'border-box',
    border: 'solid 1px #555',
    cursor: 'initial',
    width: '100%',
    height: '100%',
  });

  // Position the container based on selected position
  if (position === 'bottom') {
    colorbarContainer.style.gridRow = '2';
  } else if (position === 'right') {
    colorbarContainer.style.gridColumn = '2';
  } else if (position === 'left') {
    colorbarContainer.style.gridColumn = '1';
  }

  viewportGrid.appendChild(colorbarContainer);

  // Get proper tick position based on colorbar position
  let tickPosition = ColorbarRangeTextPosition.Top; // Default for bottom position

  if (position === 'right') {
    tickPosition = ColorbarRangeTextPosition.Left;
  } else if (position === 'left') {
    tickPosition = ColorbarRangeTextPosition.Right;
  }

  // Create a new colorbar
  ctColorbar = new ViewportColorbar({
    id: 'ctColorbar',
    element,
    container: colorbarContainer,
    colormaps,
    activeColormapName: currentColormapName,
    ticks: {
      position: tickPosition,
      style: {
        font: '12px Arial',
        color: '#fff',
        maxNumTicks: 8,
        tickSize: 5,
        tickWidth: 1,
        labelMargin: 10,
      },
    },
  });
}

/**
 * Creates a viewport, load its stack/volume and adds its color bar(s).
 */
// Create a tool group and add all necessary tools to it
function initializeToolGroup(toolGroupId) {
  // Define a tool group, which defines how mouse events map to tool commands for
  // Any viewport using the group
  const toolGroup = ToolGroupManager.createToolGroup(toolGroupId);

  // Add the tools to the tool group
  toolGroup.addTool(WindowLevelTool.toolName);
  toolGroup.addTool(PanTool.toolName);
  toolGroup.addTool(ZoomTool.toolName);
  toolGroup.addTool(StackScrollTool.toolName);

  // Set the initial state of the tools, here all tools are active and bound to
  // Different mouse inputs
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
        mouseButton: MouseBindings.Auxiliary, // Middle Click
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

  // As the Stack Scroll mouse wheel is a tool using the `mouseWheelCallback`
  // hook instead of mouse buttons, it does not need to assign any mouse button.
  toolGroup.setToolActive(StackScrollTool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Wheel,
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

  // Add tools to Cornerstone3D
  cornerstoneTools.addTool(PanTool);
  cornerstoneTools.addTool(WindowLevelTool);
  cornerstoneTools.addTool(StackScrollTool);
  cornerstoneTools.addTool(ZoomTool);

  // Instantiate a rendering engine
  const renderingEngine = new RenderingEngine(renderingEngineId);

  // Create a tool group and add some tools to it
  const toolGroup = initializeToolGroup(toolGroupId);

  const element = document.createElement('div');

  // Disable right click context menu so we can have right click tools
  element.oncontextmenu = (e) => e.preventDefault();

  Object.assign(element.style, {
    width: '100%',
    height: '100%',
    overflow: 'hidden',
    boxSizing: 'border-box',
  });

  viewportGrid.appendChild(element);

  // Enable the viewport
  renderingEngine.enableElement({
    viewportId: 'CT_STACK_AXIAL',
    type: ViewportType.STACK,
    element,
    defaultOptions: {
      background: <Types.Point3>[0.2, 0, 0.2],
    },
  });

  // Set the tool group on the viewport
  toolGroup.addViewport(viewportId, renderingEngineId);

  // Send a request to get all image ids
  const imageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.334240657131972136850343327463',
    SeriesInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.226151125820845824875394858561',
    wadoRsRoot: 'https://d14fa38qiwhyfd.cloudfront.net/dicomweb',
  });

  // A reference for the new stack viewport created
  const viewport = <Types.IStackViewport>(
    renderingEngine.getViewport(viewportId)
  );

  // Load the stack
  viewport.setStack(imageIds);

  // Initial position of colorbar is 'right' (matching the dropdown default)
  updateColorbarPosition('right');
}

run();
