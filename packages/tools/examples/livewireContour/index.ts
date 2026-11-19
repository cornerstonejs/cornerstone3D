import type { PlanarViewport, Types } from '@cornerstonejs/core';
import {
  RenderingEngine,
  Enums,
  utilities,
  volumeLoader,
} from '@cornerstonejs/core';
import {
  initDemo,
  createImageIdsAndCacheMetaData,
  setTitleAndDescription,
  createInfoSection,
  addManipulationBindings,
} from '../../../../utils/demo/helpers';
import { ctPresentation } from '../../../../utils/demo/helpers/volumePresentationRecipes';
import * as cornerstoneTools from '@cornerstonejs/tools';

// This is for debugging purposes
console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const {
  LivewireContourTool,
  StackScrollTool,
  ToolGroupManager,
  Enums: csToolsEnums,
} = cornerstoneTools;

const { ViewportType, Events } = Enums;
const { MouseBindings } = csToolsEnums;
const renderingEngineId = 'myRenderingEngine';
const stackViewportId = 'CT_STACK';
const stackDisplaySetId = 'livewireContour:stack';
const volumeDisplaySetId = 'livewireContour:ct';

// ======== Set up page ======== //
setTitleAndDescription(
  'Livewire Tool',
  'Interactive segmentation with intelligent scissors that uses Laplacian of Gaussian filter to find the shortest-path'
);

const content = document.getElementById('content');

const viewoprtsContainer = document.createElement('div');

Object.assign(viewoprtsContainer.style, {
  display: 'grid',
  height: '512px',
  gridTemplateColumns: '1fr 1fr 1fr',
  gap: '5px',
});

content.appendChild(viewoprtsContainer);

const createViewportElement = (id: string) => {
  const element = document.createElement('div');

  // Disable right click context menu so we can have right click tools
  element.oncontextmenu = (e) => e.preventDefault();

  element.id = id;
  viewoprtsContainer.appendChild(element);

  return element;
};

const stackViewportElement = createViewportElement('axial-element');
const volumeCoronalViewportElement = createViewportElement('coronal-element');
const volumeSagittalViewportElement = createViewportElement('sagittal-element');

createInfoSection(content)
  .addInstruction(
    'Viewports: Axial (Stack), Coronal (Volume), Sagittal (Volume)'
  )
  .addInstruction('Left click to use the livewire tool')
  .addInstruction('Middle click to use the pan tool')
  .addInstruction('Right click to use the zoom tool')
  .addInstruction('Press "escape" to cancel drawing');

// ============================= //

const toolGroupId = 'STACK_TOOL_GROUP_ID';

const cancelToolDrawing = (evt) => {
  const { element, key } = evt.detail;
  if (key === 'Escape') {
    cornerstoneTools.cancelActiveManipulations(element);
  }
};

stackViewportElement.addEventListener(csToolsEnums.Events.KEY_DOWN, (evt) => {
  cancelToolDrawing(evt);
});

volumeCoronalViewportElement.addEventListener(
  csToolsEnums.Events.KEY_DOWN,
  (evt) => {
    cancelToolDrawing(evt);
  }
);

/**
 * Runs the demo
 */
async function run() {
  // Init Cornerstone and related libraries
  await initDemo();

  // Add tools to Cornerstone3D
  cornerstoneTools.addTool(LivewireContourTool);

  // Define a tool group, which defines how mouse events map to tool commands for
  // Any viewport using the group
  const toolGroup = ToolGroupManager.createToolGroup(toolGroupId);

  // Add the tools to the tool group
  toolGroup.addTool(LivewireContourTool.toolName);

  // Set the initial state of the tools
  toolGroup.setToolActive(LivewireContourTool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Primary, // Left Click
      },
    ],
  });
  addManipulationBindings(toolGroup);

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

  // Create a stack viewport
  const stackViewportInput = {
    viewportId: stackViewportId,
    type: ViewportType.PLANAR,
    element: stackViewportElement,
    defaultOptions: {
      background: <Types.Point3>[0.2, 0.2, 0],
    },
  };

  renderingEngine.enableElement(stackViewportInput);

  // Set the tool group on stack the viewport
  toolGroup.addViewport(stackViewportId, renderingEngineId);

  // Get the stack viewport that was created
  const stackViewport =
    renderingEngine.getViewport<PlanarViewport>(stackViewportId);

  // Define a stack containing a few images
  const stackImageIds = imageIds.slice(0, 5);

  // Set the stack on the viewport
  utilities.genericViewportDisplaySetMetadataProvider.add(stackDisplaySetId, {
    kind: 'planar',
    imageIds: stackImageIds,
  });

  await stackViewport.setDisplaySets({ displaySetId: stackDisplaySetId });

  // Render the image
  stackViewport.render();

  // Define a unique id for the volume
  const volumeName = 'CT_VOLUME_ID'; // Id of the volume less loader prefix
  const volumeLoaderScheme = 'cornerstoneStreamingImageVolume'; // Loader id which defines which volume loader to use
  const volumeId = `${volumeLoaderScheme}:${volumeName}`; // VolumeId with loader id + volume id

  // Define a volume in memory
  const volume = await volumeLoader.createAndCacheVolume(volumeId, {
    imageIds,
  });

  // Set the volume to load
  volume.load();

  utilities.genericViewportDisplaySetMetadataProvider.add(volumeDisplaySetId, {
    kind: 'planar',
    imageIds,
    volumeId,
  });

  // Create a volume viewport (Coronal)
  const volumeCoronalViewportId = 'CT_CORONAL';
  const volumeCoronalViewportInput = {
    viewportId: volumeCoronalViewportId,
    type: ViewportType.PLANAR,
    element: volumeCoronalViewportElement,
    defaultOptions: {
      orientation: Enums.OrientationAxis.CORONAL,
      background: <Types.Point3>[0.2, 0, 0.2],
    },
  };

  renderingEngine.enableElement(volumeCoronalViewportInput);

  // Set the tool group on stack the viewport
  toolGroup.addViewport(volumeCoronalViewportId, renderingEngineId);

  // Get the volume viewport that was created
  const volumeCoronalViewport = renderingEngine.getViewport<PlanarViewport>(
    volumeCoronalViewportId
  );

  // Set the volume on the viewport
  await volumeCoronalViewport.setDisplaySets({
    displaySetId: volumeDisplaySetId,
  });
  volumeCoronalViewport.setDisplaySetPresentation(
    volumeDisplaySetId,
    ctPresentation()
  );

  // Render the image
  volumeCoronalViewport.render();

  // Create a volume viewport (Coronal)
  const volumeSagittalViewportId = 'CT_SAGITTAL';
  const volumeSagittalViewportInput = {
    viewportId: volumeSagittalViewportId,
    type: ViewportType.PLANAR,
    element: volumeSagittalViewportElement,
    defaultOptions: {
      orientation: Enums.OrientationAxis.SAGITTAL,
      background: <Types.Point3>[0.2, 0, 0.2],
    },
  };

  renderingEngine.enableElement(volumeSagittalViewportInput);

  // Set the tool group on stack the viewport
  toolGroup.addViewport(volumeSagittalViewportId, renderingEngineId);

  // Get the volume viewport that was created
  const volumeSagittalViewport = renderingEngine.getViewport<PlanarViewport>(
    volumeSagittalViewportId
  );

  // Set the volume on the viewport
  await volumeSagittalViewport.setDisplaySets({
    displaySetId: volumeDisplaySetId,
  });
  volumeSagittalViewport.setDisplaySetPresentation(
    volumeDisplaySetId,
    ctPresentation()
  );

  // Render the image
  volumeSagittalViewport.render();
}

run();
