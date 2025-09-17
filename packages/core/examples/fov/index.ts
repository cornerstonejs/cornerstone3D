import type { Types } from '@cornerstonejs/core';
import {
  RenderingEngine,
  Enums,
  volumeLoader,
  CONSTANTS,
} from '@cornerstonejs/core';
import * as cornerstoneTools from '@cornerstonejs/tools';
import {
  initDemo,
  createImageIdsAndCacheMetaData,
  setTitleAndDescription,
  ctVoiRange,
  setCtTransferFunctionForVolumeActor,
  addManipulationBindings,
} from '../../../../utils/demo/helpers';

const { ToolGroupManager } = cornerstoneTools;
const { ViewportType, OrientationAxis } = Enums;

console.warn(
  'Click on index.ts to open source code for this example --------->'
);

// ======== Set up page ======== //
setTitleAndDescription(
  'Field of View (FOV) Example',
  'Displays 5 viewports: Stack, Volume Axial, Volume Sagittal, Volume Coronal, and 3D Volume'
);

const content = document.getElementById('content');
const viewportGrid = document.createElement('div');

// Create a grid that fits within 1280x720
// 5 viewports arranged: 3 on top, 2 on bottom
// Account for some padding and margins
viewportGrid.style.display = 'grid';
viewportGrid.style.gridTemplateColumns = 'repeat(3, 400px)';
viewportGrid.style.gridTemplateRows = 'repeat(2, 340px)';
viewportGrid.style.gap = '4px';
viewportGrid.style.width = '1220px'; // Leave some margin
viewportGrid.style.height = '688px'; // Leave some margin for labels
viewportGrid.style.margin = '0 auto'; // Center the grid

// Create viewport elements
const element1 = document.createElement('div');
element1.id = 'viewport-1';
element1.style.width = '100%';
element1.style.height = '100%';
element1.style.border = '1px solid #ccc';
element1.oncontextmenu = () => false;

const element2 = document.createElement('div');
element2.id = 'viewport-2';
element2.style.width = '100%';
element2.style.height = '100%';
element2.style.border = '1px solid #ccc';
element2.oncontextmenu = () => false;

const element3 = document.createElement('div');
element3.id = 'viewport-3';
element3.style.width = '100%';
element3.style.height = '100%';
element3.style.border = '1px solid #ccc';
element3.oncontextmenu = () => false;

const element4 = document.createElement('div');
element4.id = 'viewport-4';
element4.style.width = '100%';
element4.style.height = '100%';
element4.style.border = '1px solid #ccc';
element4.oncontextmenu = () => false;

const element5 = document.createElement('div');
element5.id = 'viewport-5';
element5.style.width = '100%';
element5.style.height = '100%';
element5.style.border = '1px solid #ccc';
element5.oncontextmenu = () => false;

// Add labels to each viewport
const addLabel = (element: HTMLDivElement, text: string, gridArea?: string) => {
  const label = document.createElement('div');
  label.innerText = text;
  label.style.position = 'absolute';
  label.style.top = '5px';
  label.style.left = '5px';
  label.style.color = 'white';
  label.style.background = 'rgba(0, 0, 0, 0.6)';
  label.style.padding = '2px 6px';
  label.style.borderRadius = '3px';
  label.style.fontSize = '12px';
  label.style.zIndex = '1000';

  const wrapper = document.createElement('div');
  wrapper.style.position = 'relative';
  wrapper.style.width = '100%';
  wrapper.style.height = '100%';
  if (gridArea) {
    wrapper.style.gridArea = gridArea;
  }
  wrapper.appendChild(element);
  wrapper.appendChild(label);

  return wrapper;
};

// Add viewports to grid - 3D volume spans 2 columns on bottom row
viewportGrid.appendChild(addLabel(element1, 'Stack Viewport'));
viewportGrid.appendChild(addLabel(element2, 'Volume Axial'));
viewportGrid.appendChild(addLabel(element3, 'Volume Sagittal'));
viewportGrid.appendChild(addLabel(element4, 'Volume Coronal'));
viewportGrid.appendChild(addLabel(element5, '3D Volume', '2 / 2 / 3 / 4'));

content.appendChild(viewportGrid);

// Define unique ids
const renderingEngineId = 'myRenderingEngine';
const toolGroupId = 'TOOL_GROUP_ID';
const toolGroup3DId = 'TOOL_GROUP_3D_ID';

// Viewport IDs
const viewportId1 = 'CT_STACK';
const viewportId2 = 'CT_AXIAL';
const viewportId3 = 'CT_SAGITTAL';
const viewportId4 = 'CT_CORONAL';
const viewportId5 = 'CT_3D';

// Volume configuration
const volumeName = 'CT_VOLUME_ID';
const volumeLoaderScheme = 'cornerstoneStreamingImageVolume';
const volumeId = `${volumeLoaderScheme}:${volumeName}`;

async function run() {
  // Init Cornerstone and related libraries
  const config = (window as any).IS_TILED
    ? { core: { renderingEngineMode: 'tiled' } }
    : {};
  await initDemo(config);

  // Create tool groups
  const toolGroup = ToolGroupManager.createToolGroup(toolGroupId);
  const toolGroup3D = ToolGroupManager.createToolGroup(toolGroup3DId);

  // Add manipulation bindings
  addManipulationBindings(toolGroup);
  addManipulationBindings(toolGroup3D, { is3DViewport: true });

  // Get Cornerstone imageIds and fetch metadata into RAM
  const imageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.334240657131972136850343327463',
    SeriesInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.226151125820845824875394858561',
    wadoRsRoot: 'https://d14fa38qiwhyfd.cloudfront.net/dicomweb',
  });

  // Instantiate a rendering engine
  const renderingEngine = new RenderingEngine(renderingEngineId);

  // Create the viewports
  const viewportInputArray: Types.PublicViewportInput[] = [
    {
      viewportId: viewportId1,
      type: ViewportType.STACK,
      element: element1,
      defaultOptions: {
        background: <Types.Point3>[0.2, 0, 0.2],
      },
    },
    {
      viewportId: viewportId2,
      type: ViewportType.ORTHOGRAPHIC,
      element: element2,
      defaultOptions: {
        orientation: OrientationAxis.AXIAL,
        background: [0.2, 0, 0.2] as Types.Point3,
      },
    },
    {
      viewportId: viewportId3,
      type: ViewportType.ORTHOGRAPHIC,
      element: element3,
      defaultOptions: {
        orientation: OrientationAxis.SAGITTAL,
        background: [0.2, 0, 0.2] as Types.Point3,
      },
    },
    {
      viewportId: viewportId4,
      type: ViewportType.ORTHOGRAPHIC,
      element: element4,
      defaultOptions: {
        orientation: OrientationAxis.CORONAL,
        background: [0.2, 0, 0.2] as Types.Point3,
      },
    },
    {
      viewportId: viewportId5,
      type: ViewportType.VOLUME_3D,
      element: element5,
      defaultOptions: {
        orientation: OrientationAxis.CORONAL,
        background: CONSTANTS.BACKGROUND_COLORS.slicer3D,
      },
    },
  ];

  renderingEngine.setViewports(viewportInputArray);

  // Set tool groups on viewports
  toolGroup.addViewport(viewportId1, renderingEngineId);
  toolGroup.addViewport(viewportId2, renderingEngineId);
  toolGroup.addViewport(viewportId3, renderingEngineId);
  toolGroup.addViewport(viewportId4, renderingEngineId);
  toolGroup3D.addViewport(viewportId5, renderingEngineId);

  // Get the stack viewport
  const stackViewport = renderingEngine.getViewport(
    viewportId1
  ) as Types.IStackViewport;

  // Set stack on the stack viewport
  stackViewport.setStack(imageIds);
  stackViewport.setProperties({ voiRange: ctVoiRange });

  // Create and load volume
  const volume = await volumeLoader.createAndCacheVolume(volumeId, {
    imageIds,
  });

  // Start loading the volume
  volume.load();

  // Set the volume on volume viewports
  const volumeViewports = [viewportId2, viewportId3, viewportId4];

  for (const id of volumeViewports) {
    const viewport = renderingEngine.getViewport(id) as Types.IVolumeViewport;
    await viewport.setVolumes([
      { volumeId, callback: setCtTransferFunctionForVolumeActor },
    ]);
  }

  // Set the volume on 3D viewport with special preset
  const viewport3D = renderingEngine.getViewport(
    viewportId5
  ) as Types.IVolumeViewport;

  await viewport3D.setVolumes([{ volumeId }]);
  viewport3D.setProperties({
    preset: 'CT-Bone',
  });

  // Render all viewports
  renderingEngine.renderViewports([
    viewportId1,
    viewportId2,
    viewportId3,
    viewportId4,
    viewportId5,
  ]);
}

run();
