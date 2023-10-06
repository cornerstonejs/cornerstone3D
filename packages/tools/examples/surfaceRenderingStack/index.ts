import {
  RenderingEngine,
  Types,
  Enums,
  setVolumesForViewports,
  volumeLoader,
  geometryLoader,
} from '@cornerstonejs/core';
import {
  initDemo,
  createImageIdsAndCacheMetaData,
  setTitleAndDescription,
} from '../../../../utils/demo/helpers';
import * as cornerstoneTools from '@cornerstonejs/tools';
import { sortImageIds } from './utils';

import surface13 from './lung13.json';
import surface14 from './lung14.json';
import surface15 from './lung15.json';
import surface16 from './lung16.json';
import surface17 from './lung17.json';

// This is for debugging purposes
console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const {
  SegmentationDisplayTool,
  ToolGroupManager,
  Enums: csToolsEnums,
  segmentation,
  ZoomTool,
  PanTool,
  StackScrollMouseWheelTool,
  SegmentationIntersectionTool,
} = cornerstoneTools;
const { MouseBindings } = csToolsEnums;
const { ViewportType, GeometryType } = Enums;

// Define a unique id for the volume
const volumeName = 'CT_VOLUME_ID'; // Id of the volume less loader prefix
const volumeLoaderScheme = 'cornerstoneStreamingImageVolume'; // Loader id which defines which volume loader to use
const volumeId = `${volumeLoaderScheme}:${volumeName}`; // VolumeId with loader id + volume id
const toolGroupIdStack = 'MY_TOOLGROUP_ID_STACK';
const toolGroupIdVolume = 'MY_TOOLGROUP_ID_VOLUME';

// ======== Set up page ======== //
setTitleAndDescription(
  'Surface Segmentation Representation for Volume Viewports',
  'Here we demonstrate how to render surfaces'
);

const size = '500px';
const content = document.getElementById('content');
const viewportGrid = document.createElement('div');

viewportGrid.style.display = 'flex';
viewportGrid.style.display = 'flex';
viewportGrid.style.flexDirection = 'row';

const element1 = document.createElement('div');
const element2 = document.createElement('div');
element1.oncontextmenu = () => false;
element2.oncontextmenu = () => false;

element1.style.width = size;
element1.style.height = size;
element2.style.width = size;
element2.style.height = size;

viewportGrid.appendChild(element1);
viewportGrid.appendChild(element2);

content.appendChild(viewportGrid);

const instructions = document.createElement('p');
content.append(instructions);
// ============================= //

//const surfaces = [surface];
const surfaces = [surface13, surface14, surface15, surface16, surface17];
async function addSegmentationsToState() {
  surfaces.forEach((surface) => {
    const geometryId = surface.closedSurface.id;
    const segmentationId = geometryId;
    geometryLoader.createAndCacheGeometry(surface.closedSurface.id, {
      type: GeometryType.SURFACE,
      geometryData: surface.closedSurface as Types.PublicSurfaceData,
    });

    // Add the segmentations to state
    segmentation.addSegmentations([
      {
        segmentationId,
        representation: {
          // The type of segmentation
          type: csToolsEnums.SegmentationRepresentations.Surface,
          // The actual segmentation data, in the case of contour geometry
          // this is a reference to the geometry data
          data: {
            geometryId,
          },
        },
      },
    ]);
  });
}

/**
 * Runs the demo
 */
async function run() {
  // Init Cornerstone and related libraries
  await initDemo();

  // Add tools to Cornerstone3D
  cornerstoneTools.addTool(SegmentationDisplayTool);
  cornerstoneTools.addTool(PanTool);
  cornerstoneTools.addTool(ZoomTool);
  cornerstoneTools.addTool(StackScrollMouseWheelTool);
  cornerstoneTools.addTool(SegmentationIntersectionTool);

  // Define tool groups to add the segmentation display tool to
  const toolGroupStack = ToolGroupManager.createToolGroup(toolGroupIdStack);
  const toolGroupVolume = ToolGroupManager.createToolGroup(toolGroupIdVolume);

  toolGroupStack.addTool(SegmentationDisplayTool.toolName);
  toolGroupStack.addTool(SegmentationIntersectionTool.toolName);
  toolGroupStack.addTool(PanTool.toolName);
  toolGroupStack.addTool(ZoomTool.toolName);
  toolGroupStack.addTool(StackScrollMouseWheelTool.toolName);

  toolGroupStack.setToolEnabled(SegmentationDisplayTool.toolName);
  toolGroupStack.setToolEnabled(SegmentationIntersectionTool.toolName);
  toolGroupStack.setToolActive(PanTool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Auxiliary, // Middle Click
      },
    ],
  });
  toolGroupStack.setToolActive(ZoomTool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Secondary, // Right Click
      },
    ],
  });
  toolGroupStack.setToolActive(StackScrollMouseWheelTool.toolName);

  toolGroupVolume.addTool(SegmentationDisplayTool.toolName);
  toolGroupVolume.addTool(SegmentationIntersectionTool.toolName);
  toolGroupVolume.addTool(PanTool.toolName);
  toolGroupVolume.addTool(ZoomTool.toolName);
  toolGroupVolume.addTool(StackScrollMouseWheelTool.toolName);

  toolGroupVolume.setToolEnabled(SegmentationDisplayTool.toolName);
  toolGroupVolume.setToolEnabled(SegmentationIntersectionTool.toolName);
  toolGroupVolume.setToolActive(PanTool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Auxiliary, // Middle Click
      },
    ],
  });
  toolGroupVolume.setToolActive(ZoomTool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Secondary, // Right Click
      },
    ],
  });
  toolGroupVolume.setToolActive(StackScrollMouseWheelTool.toolName);

  // Get Cornerstone imageIds for the source data and fetch metadata into RAM
  const imageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.334240657131972136850343327463',
    SeriesInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.226151125820845824875394858561',
    wadoRsRoot: 'https://d3t6nz73ql33tx.cloudfront.net/dicomweb',
  });

  // Define a volume in memory
  const volume = await volumeLoader.createAndCacheVolume(volumeId, {
    imageIds,
  });

  // Add some segmentations based on the source data volume
  await addSegmentationsToState();

  // Instantiate a rendering engine
  const renderingEngineId = 'myRenderingEngine';
  const renderingEngine = new RenderingEngine(renderingEngineId);

  // Create the viewports
  const viewportId1 = 'CT_AXIAL';
  const viewportId2 = 'CT_VOLUME_AXIAL';

  const viewportInputArray = [
    {
      viewportId: viewportId1,
      type: ViewportType.STACK,
      element: element1,
      defaultOptions: {
        orientation: Enums.OrientationAxis.AXIAL,
        background: <Types.Point3>[0.2, 0, 0.2],
      },
    },
    {
      viewportId: viewportId2,
      type: ViewportType.ORTHOGRAPHIC,
      element: element2,
      defaultOptions: {
        orientation: Enums.OrientationAxis.AXIAL,
        background: <Types.Point3>[0.2, 0, 0.2],
      },
    },
  ];

  renderingEngine.setViewports(viewportInputArray);

  toolGroupStack.addViewport(viewportId1, renderingEngineId);
  toolGroupVolume.addViewport(viewportId2, renderingEngineId);

  // Set the volume to load
  volume.load();

  // Get the stack viewport that was created
  const viewport = <Types.IStackViewport>(
    renderingEngine.getViewport(viewportId1)
  );
  viewport.setStack(sortImageIds(imageIds), Math.floor(imageIds.length / 2));

  // Set volumes on the viewports
  setVolumesForViewports(renderingEngine, [{ volumeId }], [viewportId2]);

  surfaces.forEach(async (surface) => {
    const segmentationId = surface.closedSurface.id;

    // // Add the segmentation representation to the toolgroup
    await segmentation.addSegmentationRepresentations(toolGroupIdStack, [
      {
        segmentationId,
        type: csToolsEnums.SegmentationRepresentations.Surface,
      },
    ]);

    await segmentation.addSegmentationRepresentations(toolGroupIdVolume, [
      {
        segmentationId,
        type: csToolsEnums.SegmentationRepresentations.Surface,
      },
    ]);
  });

  // Render the image
  renderingEngine.render();
}

run();
