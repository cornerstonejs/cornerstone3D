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
  addToggleButtonToToolbar,
  addSliderToToolbar,
  downloadSurfacesData,
  addManipulationBindings,
} from '../../../../utils/demo/helpers';
import * as cornerstoneTools from '@cornerstonejs/tools';
import { sortImageIds } from './utils';

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
const segmentationId = 'MY_SEGMENTATION_ID';

// ======== Set up page ======== //
setTitleAndDescription(
  'Surface Segmentation Representation for Stack and Volume Viewports',
  'In this demonstration, we will show you how to render surfaces. On the left side, you will find a stack viewport (background purple), and on the right side you see two volume viewports (background red). When you interact with the images, the intersection between the surfaces and the underlying volume is calculated. Please note that this calculation may be slow during the initial visit, but we have implemented caching to significantly improve speed in subsequent visits. In the future, we plan to enhance the user experience by introducing off-thread pre-calculation of all surfaces.'
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

let toolGroupStack, toolGroupVolume;

addToggleButtonToToolbar({
  title: 'toggle overlay',
  onClick: (toggle) => {
    if (!toggle) {
      toolGroupStack.setToolDisabled(SegmentationIntersectionTool.toolName);
      toolGroupVolume.setToolDisabled(SegmentationIntersectionTool.toolName);
    } else {
      toolGroupStack.setToolEnabled(SegmentationIntersectionTool.toolName);
      toolGroupVolume.setToolEnabled(SegmentationIntersectionTool.toolName);
    }
  },
  defaultToggle: true,
});

addSliderToToolbar({
  title: 'opacity',
  range: [0, 1],
  step: 0.1,
  defaultValue: 0.5,
  onSelectedValueChange: (value) => {
    toolGroupStack.setToolConfiguration(SegmentationIntersectionTool.toolName, {
      opacity: value,
    });
    toolGroupVolume.setToolConfiguration(
      SegmentationIntersectionTool.toolName,
      {
        opacity: value,
      }
    );
  },
});

let surfaces;

async function addSegmentationsToState() {
  // Download the surface data. Please note that this is a large file
  // and may take a while to download
  surfaces = await downloadSurfacesData();

  const geometriesInfo = surfaces.reduce(
    (acc: Map<number, string>, surface, index) => {
      const geometryId = surface.closedSurface.id;
      geometryLoader.createAndCacheGeometry(geometryId, {
        type: GeometryType.SURFACE,
        geometryData: surface.closedSurface as Types.PublicSurfaceData,
      });

      const segmentIndex = index + 1;
      acc.set(segmentIndex, geometryId);

      return acc;
    },
    new Map()
  );

  // create a Set from the geometriesInfo to Set<number, string>[]

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
  cornerstoneTools.addTool(SegmentationDisplayTool);
  cornerstoneTools.addTool(SegmentationIntersectionTool);

  // Define tool groups to add the segmentation display tool to
  toolGroupStack = ToolGroupManager.createToolGroup(toolGroupIdStack);
  toolGroupVolume = ToolGroupManager.createToolGroup(toolGroupIdVolume);

  addManipulationBindings(toolGroupStack);
  addManipulationBindings(toolGroupVolume);

  toolGroupStack.addTool(SegmentationDisplayTool.toolName);
  toolGroupStack.addTool(SegmentationIntersectionTool.toolName);

  toolGroupStack.setToolEnabled(SegmentationDisplayTool.toolName);
  toolGroupStack.setToolEnabled(SegmentationIntersectionTool.toolName);

  toolGroupVolume.addTool(SegmentationDisplayTool.toolName);
  toolGroupVolume.addTool(SegmentationIntersectionTool.toolName);

  toolGroupVolume.setToolEnabled(SegmentationDisplayTool.toolName);
  toolGroupVolume.setToolEnabled(SegmentationIntersectionTool.toolName);

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
  const viewportId2 = 'CT_VOLUME_SAG';

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
        orientation: Enums.OrientationAxis.SAGITTAL,
        background: <Types.Point3>[0.5, 0, 0.2],
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
  await viewport.setStack(
    sortImageIds(imageIds),
    Math.floor(imageIds.length / 2)
  );

  // Set volumes on the viewports
  await setVolumesForViewports(renderingEngine, [{ volumeId }], [viewportId2]);

  // // Add the segmentation representation to the toolgroup
  segmentation.addSegmentationRepresentations(toolGroupIdStack, [
    {
      segmentationId,
      type: csToolsEnums.SegmentationRepresentations.Surface,
    },
  ]);

  segmentation.addSegmentationRepresentations(toolGroupIdVolume, [
    {
      segmentationId,
      type: csToolsEnums.SegmentationRepresentations.Surface,
    },
  ]);

  // Render the image
  renderingEngine.render();
}

run();
