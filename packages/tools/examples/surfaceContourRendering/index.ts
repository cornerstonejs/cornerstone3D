import type { Types } from '@cornerstonejs/core';
import {
  RenderingEngine,
  Enums,
  setVolumesForViewports,
  volumeLoader,
  utilities,
  CONSTANTS,
} from '@cornerstonejs/core';
import {
  initDemo,
  createImageIdsAndCacheMetaData,
  setTitleAndDescription,
  createAndCacheGeometriesFromSurfaces,
} from '../../../../utils/demo/helpers';

import * as cornerstoneTools from '@cornerstonejs/tools';

// This is for debugging purposes
console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const {
  ToolGroupManager,
  Enums: csToolsEnums,
  segmentation,
  ZoomTool,
  PanTool,
  StackScrollTool,
  TrackballRotateTool,
} = cornerstoneTools;
const { MouseBindings } = csToolsEnums;
const { ViewportType, GeometryType } = Enums;

// Define a unique id for the volume
const volumeName = 'CT_VOLUME_ID'; // Id of the volume less loader prefix
const volumeLoaderScheme = 'cornerstoneStreamingImageVolume'; // Loader id which defines which volume loader to use
const volumeId = `${volumeLoaderScheme}:${volumeName}`; // VolumeId with loader id + volume id
const toolGroupId2D = 'MY_TOOLGROUP_ID_2D';
const toolGroupId3D = 'MY_TOOLGROUP_ID_3D';
const segmentationId = 'MY_SEGMENTATION_ID';

// ======== Set up page ======== //
setTitleAndDescription(
  'Multi-Planar Reconstruction with Surface Segmentation',
  'This example shows a 2x2 grid with axial, coronal, sagittal, and 3D surface rendering viewports. All viewports display the same series with segmentation overlays. The 3D viewport shows surface representations while the 2D viewports show labelmap segmentations.'
);

const size = '400px';
const content = document.getElementById('content');
const viewportGrid = document.createElement('div');

viewportGrid.style.display = 'grid';
viewportGrid.style.gridTemplateColumns = '1fr 1fr';
viewportGrid.style.gridTemplateRows = '1fr 1fr';
viewportGrid.style.gap = '10px';
viewportGrid.style.width = '820px';
viewportGrid.style.height = '820px';

// Create viewport elements
const elementAxial = document.createElement('div');
elementAxial.oncontextmenu = () => false;
elementAxial.style.width = size;
elementAxial.style.height = size;
elementAxial.style.border = '1px solid #ccc';

const elementCoronal = document.createElement('div');
elementCoronal.oncontextmenu = () => false;
elementCoronal.style.width = size;
elementCoronal.style.height = size;
elementCoronal.style.border = '1px solid #ccc';

const elementSagittal = document.createElement('div');
elementSagittal.oncontextmenu = () => false;
elementSagittal.style.width = size;
elementSagittal.style.height = size;
elementSagittal.style.border = '1px solid #ccc';

const element3D = document.createElement('div');
element3D.oncontextmenu = () => false;
element3D.style.width = size;
element3D.style.height = size;
element3D.style.border = '1px solid #ccc';

// Add labels
const axialLabel = document.createElement('div');
axialLabel.textContent = 'Axial';
axialLabel.style.textAlign = 'center';
axialLabel.style.fontWeight = 'bold';
axialLabel.style.marginBottom = '5px';

const coronalLabel = document.createElement('div');
coronalLabel.textContent = 'Coronal';
coronalLabel.style.textAlign = 'center';
coronalLabel.style.fontWeight = 'bold';
coronalLabel.style.marginBottom = '5px';

const sagittalLabel = document.createElement('div');
sagittalLabel.textContent = 'Sagittal';
sagittalLabel.style.textAlign = 'center';
sagittalLabel.style.fontWeight = 'bold';
sagittalLabel.style.marginBottom = '5px';

const surfaceLabel = document.createElement('div');
surfaceLabel.textContent = '3D Surface';
surfaceLabel.style.textAlign = 'center';
surfaceLabel.style.fontWeight = 'bold';
surfaceLabel.style.marginBottom = '5px';

// Create containers for each viewport
const axialContainer = document.createElement('div');
axialContainer.appendChild(axialLabel);
axialContainer.appendChild(elementAxial);

const coronalContainer = document.createElement('div');
coronalContainer.appendChild(coronalLabel);
coronalContainer.appendChild(elementCoronal);

const sagittalContainer = document.createElement('div');
sagittalContainer.appendChild(sagittalLabel);
sagittalContainer.appendChild(elementSagittal);

const surfaceContainer = document.createElement('div');
surfaceContainer.appendChild(surfaceLabel);
surfaceContainer.appendChild(element3D);

viewportGrid.appendChild(axialContainer);
viewportGrid.appendChild(coronalContainer);
viewportGrid.appendChild(sagittalContainer);
viewportGrid.appendChild(surfaceContainer);

content.appendChild(viewportGrid);
let renderingEngine;
const instructions = document.createElement('p');
instructions.textContent =
  'Use mouse to interact: Left click to rotate 3D view, right click to zoom, middle click to pan in 2D views.';
content.append(instructions);
// ============================= //

// Create the viewports
const viewportIdAxial = 'CT_AXIAL';
const viewportIdCoronal = 'CT_CORONAL';
const viewportIdSagittal = 'CT_SAGITTAL';
const viewportId3D = 'CT_3D';

let surfaces;
async function addSegmentationsToState() {
  // Download the surface data. Please note that this is a large file
  // and may take a while to download

  const geometriesInfo = await createAndCacheGeometriesFromSurfaces();

  // Add the segmentations to state
  segmentation.addSegmentations([
    {
      segmentationId,
      representation: {
        type: csToolsEnums.SegmentationRepresentations.Surface,
        data: {
          geometryIds: geometriesInfo,
        },
      },
    },
  ]);
}

/**
 * Runs the demo
 */
async function run() {
  // Init Cornerstone and related libraries
  await initDemo();

  // Add tools to Cornerstone3D
  cornerstoneTools.addTool(PanTool);
  cornerstoneTools.addTool(ZoomTool);
  cornerstoneTools.addTool(StackScrollTool);
  cornerstoneTools.addTool(TrackballRotateTool);

  // Create tool groups for 2D and 3D viewports
  const toolGroup2D = ToolGroupManager.createToolGroup(toolGroupId2D);
  const toolGroup3D = ToolGroupManager.createToolGroup(toolGroupId3D);

  // Configure 2D tool group
  toolGroup2D.addTool(ZoomTool.toolName);
  toolGroup2D.addTool(PanTool.toolName);
  toolGroup2D.addTool(StackScrollTool.toolName);

  toolGroup2D.setToolActive(ZoomTool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Secondary,
      },
    ],
  });

  toolGroup2D.setToolActive(PanTool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Auxiliary,
      },
    ],
  });

  toolGroup2D.setToolActive(StackScrollTool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Wheel,
      },
    ],
  });

  // Configure 3D tool group
  toolGroup3D.addTool(ZoomTool.toolName);
  toolGroup3D.addTool(TrackballRotateTool.toolName, {
    configuration: { volumeId },
  });

  toolGroup3D.setToolActive(TrackballRotateTool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Primary,
      },
    ],
  });

  toolGroup3D.setToolActive(ZoomTool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Secondary,
      },
    ],
  });

  // Get Cornerstone imageIds for the source data and fetch metadata into RAM
  const imageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.334240657131972136850343327463',
    SeriesInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.226151125820845824875394858561',
    wadoRsRoot: 'https://d14fa38qiwhyfd.cloudfront.net/dicomweb',
  });

  // Define a volume in memory
  const volume = await volumeLoader.createAndCacheVolume(volumeId, {
    imageIds,
  });

  // Add some segmentations based on the source data volume
  await addSegmentationsToState();

  // Instantiate a rendering engine
  const renderingEngineId = 'myRenderingEngine';
  renderingEngine = new RenderingEngine(renderingEngineId);

  // Create viewport input array for all four viewports
  const viewportInputArray = [
    {
      viewportId: viewportIdAxial,
      type: ViewportType.ORTHOGRAPHIC,
      element: elementAxial,
      defaultOptions: {
        orientation: Enums.OrientationAxis.AXIAL,
        background: <Types.Point3>[0.2, 0, 0.2],
      },
    },
    {
      viewportId: viewportIdCoronal,
      type: ViewportType.ORTHOGRAPHIC,
      element: elementCoronal,
      defaultOptions: {
        orientation: Enums.OrientationAxis.CORONAL,
        background: <Types.Point3>[0.2, 0, 0.2],
      },
    },
    {
      viewportId: viewportIdSagittal,
      type: ViewportType.ORTHOGRAPHIC,
      element: elementSagittal,
      defaultOptions: {
        orientation: Enums.OrientationAxis.SAGITTAL,
        background: <Types.Point3>[0.2, 0, 0.2],
      },
    },
    {
      viewportId: viewportId3D,
      type: ViewportType.VOLUME_3D,
      element: element3D,
      defaultOptions: {
        background: <Types.Point3>[0.2, 0, 0.2],
      },
    },
  ];

  renderingEngine.setViewports(viewportInputArray);

  // Add viewports to tool groups
  toolGroup2D.addViewport(viewportIdAxial, renderingEngineId);
  toolGroup2D.addViewport(viewportIdCoronal, renderingEngineId);
  toolGroup2D.addViewport(viewportIdSagittal, renderingEngineId);
  toolGroup3D.addViewport(viewportId3D, renderingEngineId);

  // Set the volume to load
  volume.load();

  // Set volumes on all viewports
  const allViewportIds = [
    viewportIdAxial,
    viewportIdCoronal,
    viewportIdSagittal,
    viewportId3D,
  ];

  setVolumesForViewports(renderingEngine, [{ volumeId }], allViewportIds).then(
    () => {
      // Configure 3D viewport
      const viewport3D = renderingEngine.getViewport(viewportId3D);
      const volumeActor = viewport3D.getDefaultActor()
        .actor as Types.VolumeActor;
      utilities.applyPreset(
        volumeActor,
        CONSTANTS.VIEWPORT_PRESETS.find(
          (preset) => preset.name === 'CT-Chest-Contrast-Enhanced'
        )
      );

      const renderer = viewport3D.getRenderer();
      renderer.getActiveCamera().elevation(-70);
      viewport3D.setCamera({ parallelScale: 600 });

      // Render all viewports
      renderingEngine.render();
    }
  );

  // Add surface representation to 3D viewport
  await segmentation.addSurfaceRepresentationToViewport(viewportId3D, [
    {
      segmentationId,
    },
  ]);

  await segmentation.addContourRepresentationToViewportMap({
    [viewportIdAxial]: [{ segmentationId }],
    [viewportIdCoronal]: [{ segmentationId }],
    [viewportIdSagittal]: [{ segmentationId }],
  });

  // Final render
  renderingEngine.render();
}

run();
