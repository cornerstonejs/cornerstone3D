import type {
  PlanarViewport,
  VolumeViewport3D,
  Types,
} from '@cornerstonejs/core';
import {
  RenderingEngine,
  Enums,
  volumeLoader,
  utilities,
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
  SegmentationIntersectionTool,
} = cornerstoneTools;
const { MouseBindings } = csToolsEnums;
const { ViewportType, GeometryType } = Enums;

// Define a unique id for the volume
const volumeName = 'CT_VOLUME_ID'; // Id of the volume less loader prefix
const volumeLoaderScheme = 'cornerstoneStreamingImageVolume'; // Loader id which defines which volume loader to use
const volumeId = `${volumeLoaderScheme}:${volumeName}`; // VolumeId with loader id + volume id
const toolGroupId = 'MY_TOOLGROUP_ID';
const toolGroupId3d = 'MY_TOOLGROUP_ID_3d';
const segmentationId = 'MY_SEGMENTATION_ID';
const displaySetId = 'surfaceRendering:ct';
const axialDisplaySetId = 'surfaceRendering:ct:axial';

// ======== Set up page ======== //
setTitleAndDescription(
  'Surface Segmentation Representation for Volume Viewports',
  'This example first downloads the surface data. In this demonstration, we will show you how to render surfaces. On the left side there is an axial viewport, and on the right side a 3D viewport that shows the surfaces. On the axial viewport, the SegmentationIntersectionTool draws the lines where the surfaces cut the slice on display, and the lines follow when you scroll. The lines of a slice are calculated on its first visit and kept for the next ones.'
);

const size = '512px';
const content = document.getElementById('content');
const viewportGrid = document.createElement('div');

viewportGrid.style.display = 'flex';
viewportGrid.style.display = 'flex';
viewportGrid.style.flexDirection = 'row';

const element1 = document.createElement('div');
element1.oncontextmenu = () => false;

element1.style.width = size;
element1.style.height = size;

const element2 = document.createElement('div');
element2.oncontextmenu = () => false;

element2.style.width = size;
element2.style.height = size;

viewportGrid.appendChild(element1);
viewportGrid.appendChild(element2);

content.appendChild(viewportGrid);
let renderingEngine;
const instructions = document.createElement('p');
instructions.innerText =
  'Axial viewport: mouse wheel to scroll, right drag to zoom. 3D viewport: left drag to rotate, right drag to zoom.';
content.append(instructions);
// ============================= //

// Create the viewports
const viewportId1 = 'CT_AXIAL';
const viewportId2 = 'CT_3D';

let surfaces;
async function addSegmentationsToState(frameOfReferenceUID: string) {
  // Download the surface data. Please note that this is a large file
  // and may take a while to download

  const geometriesInfo = await createAndCacheGeometriesFromSurfaces({
    frameOfReferenceUID,
  });

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
  cornerstoneTools.addTool(SegmentationIntersectionTool);

  const toolGroup = ToolGroupManager.createToolGroup(toolGroupId);

  toolGroup.addTool(StackScrollTool.toolName);
  toolGroup.addTool(ZoomTool.toolName);
  toolGroup.addTool(SegmentationIntersectionTool.toolName);

  toolGroup.setToolActive(StackScrollTool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Wheel,
      },
    ],
  });
  toolGroup.setToolActive(ZoomTool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Secondary,
      },
    ],
  });

  const toolGroup3d = ToolGroupManager.createToolGroup(toolGroupId3d);

  toolGroup3d.addTool(ZoomTool.toolName);
  toolGroup3d.addTool(TrackballRotateTool.toolName, {
    configuration: { volumeId },
  });

  toolGroup3d.setToolActive(TrackballRotateTool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Primary,
      },
    ],
  });

  toolGroup3d.setToolActive(ZoomTool.toolName, {
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
  await addSegmentationsToState(volume.metadata.FrameOfReferenceUID);

  // Instantiate a rendering engine
  const renderingEngineId = 'myRenderingEngine';
  renderingEngine = new RenderingEngine(renderingEngineId);

  const viewportInputArray = [
    {
      viewportId: viewportId1,
      type: ViewportType.PLANAR,
      element: element1,
      defaultOptions: {
        orientation: Enums.OrientationAxis.AXIAL,
        background: <Types.Point3>[0.2, 0, 0.2],
      },
    },
    {
      viewportId: viewportId2,
      type: ViewportType.VOLUME_3D,
      element: element2,
      defaultOptions: {
        background: <Types.Point3>[0.2, 0, 0.2],
      },
    },
  ];

  renderingEngine.setViewports(viewportInputArray);

  toolGroup.addViewport(viewportId1, renderingEngineId);
  toolGroup3d.addViewport(viewportId2, renderingEngineId);

  // Set the volume to load
  volume.load();

  // Set volumes on the viewports
  utilities.genericViewportDisplaySetMetadataProvider.add(displaySetId, {
    imageIds,
    volumeId,
  });
  utilities.genericViewportDisplaySetMetadataProvider.add(axialDisplaySetId, {
    kind: 'planar',
    imageIds,
    volumeId,
  });

  const axialViewport: PlanarViewport =
    renderingEngine.getViewport(viewportId1);

  await axialViewport.setDisplaySets({ displaySetId: axialDisplaySetId });

  const viewport3d: VolumeViewport3D = renderingEngine.getViewport(viewportId2);

  await viewport3d.setDisplaySets({ displaySetId });
  viewport3d.setDisplaySetPresentation(displaySetId, {
    preset: 'CT-Chest-Contrast-Enhanced',
  });

  const renderer = viewport3d.getRenderer();
  renderer.getActiveCamera().elevation(-70);
  viewport3d.setViewState({ parallelScale: 600 });

  viewport3d.render();

  await segmentation.addSurfaceRepresentationToViewport(viewportId2, [
    {
      segmentationId,
    },
  ]);

  toolGroup.setToolEnabled(SegmentationIntersectionTool.toolName);

  // Render the image
  renderingEngine.render();
}

run();
