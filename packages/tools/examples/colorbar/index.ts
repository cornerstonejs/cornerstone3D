import vtkColormaps from '@kitware/vtk.js/Rendering/Core/ColorTransferFunction/ColorMaps';
import {
  RenderingEngine,
  Types,
  Enums,
  cache,
  volumeLoader,
  getRenderingEngine,
} from '@cornerstonejs/core';
import { utilities as cstUtils } from '@cornerstonejs/tools';
import {
  initDemo,
  createImageIdsAndCacheMetaData,
  setCtTransferFunctionForVolumeActor,
  setPetColorMapTransferFunctionForVolumeActor,
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
  StackScrollMouseWheelTool,
  ZoomTool,
  ToolGroupManager,
  Enums: csToolsEnums,
} = cornerstoneTools;

const { ViewportType } = Enums;
const { MouseBindings } = csToolsEnums;
const renderingEngineId = 'myRenderingEngine';
const toolGroupIds = new Set<string>();
const colorbarWidth = 20; // px
const imageIdsCache = new Map<string, string[]>();

const wadoRsRoot = 'https://d3t6nz73ql33tx.cloudfront.net/dicomweb';
const StudyInstanceUID =
  '1.3.6.1.4.1.14519.5.2.1.7009.2403.334240657131972136850343327463';

const volumeLoaderScheme = 'cornerstoneStreamingImageVolume'; // Loader id which defines which volume loader to use
const ctVolumeName = 'CT_VOLUME_ID'; // Id of the volume less loader prefix
const ctVolumeId = `${volumeLoaderScheme}:${ctVolumeName}`; // VolumeId with loader id + volume id

// Define a unique id for the volume
const ptVolumeName = 'PT_VOLUME_ID';
const ptVolumeId = `${volumeLoaderScheme}:${ptVolumeName}`;

// Convert all VTK colormaps to the one supported by the colorbar which actualy
// have almost the same properties.
const colormaps = vtkColormaps.rgbPresetNames.map((presetName) =>
  vtkColormaps.getPresetByName(presetName)
);

// Colormap to load right after loading the example page but it can be changed
// after selecting a different one from the dropdown.
let currentPTColormapName = 'Black-Body Radiation';

// Info about all the three viewports (stack, volume sagittal and volume coronal)
const viewportsInfo = [
  {
    toolGroupId: 'STACK_TOOLGROUP_ID',
    fusion: false,
    colorbar: {
      position: 'right',
      instances: [],
    },
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
    volumeIds: [ctVolumeId, ptVolumeId],
    toolGroupId: 'VOLUME_TOOLGROUP_ID',
    fusion: true,
    colorbar: {
      position: 'right',
      instances: [],
    },
    viewportInput: {
      viewportId: 'CT_VOLUME_SAGITTAL',
      type: ViewportType.ORTHOGRAPHIC,
      element: null,
      defaultOptions: {
        orientation: Enums.OrientationAxis.SAGITTAL,
        background: <Types.Point3>[0.2, 0, 0.2],
      },
    },
  },
  {
    volumeIds: [ctVolumeId, ptVolumeId],
    toolGroupId: 'VOLUME_TOOLGROUP_ID',
    fusion: true,
    colorbar: {
      position: 'right',
      instances: [],
    },
    viewportInput: {
      viewportId: 'CT_VOLUME_CORONAL',
      type: ViewportType.ORTHOGRAPHIC,
      element: null,
      defaultOptions: {
        orientation: Enums.OrientationAxis.CORONAL,
        background: <Types.Point3>[0.2, 0, 0.2],
      },
    },
  },
];

// ======== Set up page ======== //
setTitleAndDescription(
  'Color Bar',
  'Interactive color bar that can be used to manipulate the VOI'
);

const content = document.getElementById('content');
const viewportGrid = document.createElement('div');

// Grid were all viewports are added in a single row
viewportGrid.style.display = 'grid';
viewportGrid.style.width = '100%';
viewportGrid.style.height = '500px';
viewportGrid.style.marginTop = '5px';
viewportGrid.style.gap = '5px';

// Generate the template columns based on the number of viewports to render.
// The template is set to "auto auto auto" for 3 viewports.
viewportGrid.style.gridTemplateColumns = new Array(viewportsInfo.length)
  .fill('auto')
  .join(' ');

content.appendChild(viewportGrid);

const info = document.createElement('div');
content.appendChild(info);

const addInstruction = (instruction) => {
  const node = document.createElement('p');
  node.innerText = instruction;
  info.appendChild(node);
};

addInstruction(
  'Viewports: Stack/Axial (left) | Volume/Sagittal (middle) | Volume/Coronal (right)'
);
addInstruction('- Select different colormaps');
addInstruction('- Click and drag on the viewport to change VOI');
addInstruction('- Click and drag on the color bar to change VOI');

// ==[ Toolbar ]================================================================

// Dropdown that allows the user to select a different colormap
addDropdownToToolbar({
  options: {
    values: colormaps.map((cm) => cm.Name),
    defaultValue: currentPTColormapName,
  },
  style: {
    maxWidth: '200px',
  },
  onSelectedValueChange: (selectedValue) => {
    setPTColormap(<string>selectedValue);
  },
});

// =============================================================================

// Change the colormap of an specific viewport
function setPTViewportColormap(viewportInfo, colormapName: string) {
  const { fusion, colorbar, viewportInput } = viewportInfo;
  const { viewportId } = viewportInput;

  if (!fusion) {
    return;
  }

  const ptColorbar = colorbar?.instances?.[1];

  if (ptColorbar) {
    ptColorbar.activeColormapName = colormapName;
  }

  // Get the rendering engine
  const renderingEngine = getRenderingEngine(renderingEngineId);

  // Get the volume viewport
  const viewport = <Types.IVolumeViewport>(
    renderingEngine.getViewport(viewportId)
  );

  viewport.setProperties({ colormap: { name: colormapName } }, ptVolumeId);
  viewport.render();
}

// Change the colormap of all viewports
function setPTColormap(colormapName: string) {
  currentPTColormapName = colormapName;

  viewportsInfo.forEach((viewportInfo) =>
    setPTViewportColormap(viewportInfo, colormapName)
  );
}

async function createAndCacheVolume(volumeId, imageIds) {
  let volume = cache.getVolume(volumeId) as any;

  if (!volume) {
    volume = await volumeLoader.createAndCacheVolume(volumeId, {
      imageIds,
    });

    // Set the volume to load
    volume.load();
  }
}

async function initializeVolumeViewport(
  viewportInfo,
  viewport: Types.IVolumeViewport
) {
  const { fusion } = viewportInfo;
  const volumes = [];
  const ctImageIds = await getCTImageIds();

  await createAndCacheVolume(ctVolumeId, ctImageIds);

  volumes.push({
    volumeId: ctVolumeId,
    callback: setCtTransferFunctionForVolumeActor,
  });

  // Add PT volume on fusion viewports
  if (fusion) {
    const ptImageIds = await getPTImageIds();

    await createAndCacheVolume(ptVolumeId, ptImageIds);

    volumes.push({
      volumeId: ptVolumeId,
      callback: setPetColorMapTransferFunctionForVolumeActor,
    });
  }

  // Set the volume on the viewport
  await viewport.setVolumes(volumes);

  // Update the colormap to the active one on PT/CT viewports
  if (fusion) {
    setPTViewportColormap(viewportInfo, currentPTColormapName);
  }
}

// Creates one or more containers at the right side of the viewport
function createRightColorbarContainers(numContainers) {
  const containers = [];
  const height = 100 / numContainers;
  let top = 0;

  for (let i = 0; i < numContainers; i++, top += height) {
    const container = document.createElement('div');

    Object.assign(container.style, {
      position: 'absolute',
      top: `${top}%`,
      left: `calc(100% - ${colorbarWidth}px)`,
      width: `${colorbarWidth}px`,
      height: `${100 / numContainers}%`,
    });

    containers.push(container);
  }

  return containers;
}

// Creates one or more containers at the bottom of the viewport
function createBottomColorbarContainers(numContainers) {
  const containers = [];
  const width = 100 / numContainers;
  let left = 0;

  for (let i = 0; i < numContainers; i++, left += width) {
    const container = document.createElement('div');

    Object.assign(container.style, {
      position: 'absolute',
      top: `calc(100% - ${colorbarWidth}px)`,
      left: `${left}%`,
      width: `${width}%`,
      height: `${colorbarWidth}px`,
    });

    containers.push(container);
  }

  return containers;
}

// Creates one or more containers at the right side or at the bottom
// of the viewport based on `colorbar.position` config
function initializeColorbarContainers(viewportInfo, viewportContainer) {
  const numContainers = viewportInfo.fusion ? 2 : 1;
  const containers =
    viewportInfo.colorbar?.position === 'right'
      ? createRightColorbarContainers(numContainers)
      : createBottomColorbarContainers(numContainers);

  containers.forEach((container) => {
    Object.assign(container.style, {
      boxSizing: 'border-box',
      display: 'block',
      border: 'solid 1px #555',
      cursor: 'initial',
    });

    viewportContainer.appendChild(container);
  });

  return containers;
}

// Create instaces of the color bars for CT or PT/CT viewports and add them to the DOM
function initializeColorbars(viewportInfo, colorbarContainers) {
  const { fusion, volumeIds, colorbar, viewportInput } = viewportInfo;
  const { element } = viewportInput;

  // Stack viewports do not have volumeIds
  const ctVolumeId = volumeIds?.length ? volumeIds[0] : undefined;

  const scaleStyle = {
    font: '12px Arial',
    color: '#fff',
    maxNumTicks: 8,
    tickSize: 5,
    tickWidth: 1,
    labelMargin: 3,
  };

  const ctColorbar = new ViewportColorbar({
    id: 'ctColorbar',
    element,
    container: colorbarContainers[0],
    volumeId: ctVolumeId,
    colormaps,
    activeColormapName: 'Grayscale',
    ticks: {
      position: ColorbarRangeTextPosition.Left,
      style: scaleStyle,
    },
  });

  colorbar.instances.push(ctColorbar);

  if (fusion && volumeIds?.length === 2) {
    const ptColorbar = new ViewportColorbar({
      id: 'ptColorbar',
      element,
      container: colorbarContainers[1],
      volumeId: volumeIds[1],
      colormaps,
      activeColormapName: currentPTColormapName,
      ticks: {
        position: ColorbarRangeTextPosition.Left,
        style: scaleStyle,
      },
    });

    colorbar.instances.push(ptColorbar);
  }
}

/**
 * Creates a viewport, load its stack/volume and adds its color bar(s).
 * HTML Structure:
 *    viewportGrid
 *        viewportContainer
 *            viewport
 *                canvas
 *            color bar container (CT)
 *                color bar (CT)
 *            color bar container (PT)
 *                color bar (PT)
 */
async function initializeViewport(renderingEngine, toolGroup, viewportInfo) {
  const { viewportInput } = viewportInfo;

  // Container where the viewport and the color bars are added to
  const viewportContainer = document.createElement('div');

  Object.assign(viewportContainer.style, {
    position: 'relative',
    width: '100%',
    height: '100%',
  });

  viewportGrid.appendChild(viewportContainer);

  const element = document.createElement('div');
  let width = '100%';
  let height = '100%';

  // Leave some space for the color bar that can be added to the
  // left or at the bottom of the viewport
  if (viewportInfo.colorbar?.position === 'right') {
    width = `calc(100% - ${colorbarWidth}px)`;
  } else {
    height = `calc(100% - ${colorbarWidth}px)`;
  }

  // Disable right click context menu so we can have right click tools
  element.oncontextmenu = (e) => e.preventDefault();

  element.id = viewportInput.viewportId;
  Object.assign(element.style, { width, height, overflow: 'hidden' });

  viewportInput.element = element;
  viewportContainer.appendChild(element);

  const { viewportId } = viewportInput;
  const { id: renderingEngineId } = renderingEngine;

  // Enable the viewport
  renderingEngine.enableElement(viewportInput);

  // Set the tool group on the viewport
  toolGroup.addViewport(viewportId, renderingEngineId);

  // Create the color bar containers that will be used to append the
  // colorbars' rootElement
  const colorbarContainers = initializeColorbarContainers(
    viewportInfo,
    viewportContainer
  );

  // Create and add the color bars to the DOM
  initializeColorbars(viewportInfo, colorbarContainers);

  const ctImageIds = await getCTImageIds();
  const viewport = <Types.IViewport>renderingEngine.getViewport(viewportId);

  if (viewportInput.type === ViewportType.STACK) {
    (<Types.IStackViewport>viewport).setStack(ctImageIds);
  } else if (viewportInput.type === ViewportType.ORTHOGRAPHIC) {
    await initializeVolumeViewport(
      viewportInfo,
      viewport as Types.IVolumeViewport
    );
  } else {
    throw new Error('Invalid viewport type');
  }
}

// Create a tool group and add all necessary tools to it
function initializeToolGroup(toolGroupId) {
  let toolGroup = ToolGroupManager.getToolGroup(toolGroupId);

  if (toolGroup) {
    return toolGroup;
  }

  // Define a tool group, which defines how mouse events map to tool commands for
  // Any viewport using the group
  toolGroup = ToolGroupManager.createToolGroup(toolGroupId);

  // Add the tools to the tool group
  toolGroup.addTool(WindowLevelTool.toolName);
  toolGroup.addTool(PanTool.toolName);
  toolGroup.addTool(ZoomTool.toolName);
  toolGroup.addTool(StackScrollMouseWheelTool.toolName);

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
  toolGroup.setToolActive(StackScrollMouseWheelTool.toolName);

  return toolGroup;
}

async function getCTImageIds() {
  let imageIds = imageIdsCache.get('ct');

  if (!imageIds) {
    imageIds = await createImageIdsAndCacheMetaData({
      StudyInstanceUID,
      SeriesInstanceUID:
        '1.3.6.1.4.1.14519.5.2.1.7009.2403.226151125820845824875394858561',
      wadoRsRoot,
    });

    imageIdsCache.set('ct', imageIds);
  }

  return imageIds;
}

async function getPTImageIds() {
  let imageIds = imageIdsCache.get('pt');

  if (!imageIds) {
    imageIds = await createImageIdsAndCacheMetaData({
      StudyInstanceUID,
      SeriesInstanceUID:
        '1.3.6.1.4.1.14519.5.2.1.7009.2403.879445243400782656317561081015',
      wadoRsRoot,
    });

    imageIdsCache.set('pt', imageIds);
  }

  return imageIds;
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
  cornerstoneTools.addTool(StackScrollMouseWheelTool);
  cornerstoneTools.addTool(ZoomTool);

  // Instantiate a rendering engine
  const renderingEngine = new RenderingEngine(renderingEngineId);

  for (let i = 0; i < viewportsInfo.length; i++) {
    const viewportInfo = viewportsInfo[i];
    const { toolGroupId } = viewportInfo;
    const toolGroup = initializeToolGroup(toolGroupId);

    toolGroupIds.add(toolGroupId);

    await initializeViewport(renderingEngine, toolGroup, viewportInfo);
  }
}

run();
