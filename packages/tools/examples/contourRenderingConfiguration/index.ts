import type { Types } from '@cornerstonejs/core';
import {
  Enums,
  geometryLoader,
  RenderingEngine,
  setVolumesForViewports,
  volumeLoader,
} from '@cornerstonejs/core';
import * as cornerstoneTools from '@cornerstonejs/tools';
import {
  addSliderToToolbar,
  addToggleButtonToToolbar,
  createImageIdsAndCacheMetaData,
  initDemo,
  setTitleAndDescription,
} from '../../../../utils/demo/helpers';
import assetsURL from '../../../../utils/assets/assetsURL.json';

// This is for debugging purposes
console.debug(
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
const segmentationId = 'MY_SEGMENTATION_ID';
const toolGroupId = 'MY_TOOLGROUP_ID';

// ======== Set up page ======== //
setTitleAndDescription(
  'Contour Segmentation Configuration',
  'Here we demonstrate how to configure the contour rendering. This example downloads the contour data.'
);

const size = '500px';
const content = document.getElementById('content');
const viewportGrid = document.createElement('div');

viewportGrid.style.display = 'flex';
viewportGrid.style.flexDirection = 'row';

const element1 = document.createElement('div');
element1.oncontextmenu = () => false;

element1.style.width = size;
element1.style.height = size;

viewportGrid.appendChild(element1);

content.appendChild(viewportGrid);

const instructions = document.createElement('p');
content.append(instructions);

let viewportId;
// ============================= //

addToggleButtonToToolbar({
  title: 'Hide All Segments',
  onClick: (toggle) => {
    segmentation.config.visibility.setSegmentationRepresentationVisibility(
      viewportId,
      segmentationId,
      csToolsEnums.SegmentationRepresentations.Contour,
      !toggle
    );
  },
});

addToggleButtonToToolbar({
  title: 'Hide Red Segment',
  onClick: (toggle) => {
    const segmentIndex = 1;
    segmentation.config.visibility.setSegmentIndexVisibility(
      viewportId,
      segmentationId,
      csToolsEnums.SegmentationRepresentations.Contour,
      segmentIndex,
      !toggle
    );
  },
});

addToggleButtonToToolbar({
  title: 'Hide Green Segment',
  onClick: (toggle) => {
    const segmentIndex = 2;
    segmentation.config.visibility.setSegmentIndexVisibility(
      viewportId,
      segmentationId,
      csToolsEnums.SegmentationRepresentations.Contour,
      segmentIndex,
      !toggle
    );
  },
});

addSliderToToolbar({
  title: 'Change Segments Thickness For left viewport',
  range: [0.1, 10],
  defaultValue: 4,
  onSelectedValueChange: (value) => {
    segmentation.config.style.setGlobalContourStyle({
      outlineWidthActive: Number(value),
    });
  },
});

async function addSegmentationsToState() {
  const circle = await fetch(assetsURL.CircleContour).then((res) => res.json());

  // load the contour data
  const geometryIds = [];

  const promises = circle.contourSets.map((contourSet) => {
    const geometryId = contourSet.id;
    geometryIds.push(geometryId);
    return geometryLoader.createAndCacheGeometry(geometryId, {
      type: GeometryType.Contour,
      geometryData: contourSet as Types.PublicContourSetData,
    });
  });

  await Promise.all(promises);

  // Add the segmentations to state
  segmentation.addSegmentations([
    {
      segmentationId,
      representation: {
        // The type of segmentation
        type: csToolsEnums.SegmentationRepresentations.Contour,
        // The actual segmentation data, in the case of contour geometry
        // this is a reference to the geometry data
        data: {
          geometryIds: geometryIds,
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

  // Define tool groups to add the segmentation display tool to
  const toolGroup = ToolGroupManager.createToolGroup(toolGroupId);

  toolGroup.addTool(PanTool.toolName);
  toolGroup.addTool(ZoomTool.toolName);
  toolGroup.addTool(StackScrollTool.toolName);

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

  toolGroup.setToolActive(StackScrollTool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Wheel,
      },
    ],
  });

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
  viewportId = 'CT_AXIAL';

  const viewportInputArray = [
    {
      viewportId,
      type: ViewportType.ORTHOGRAPHIC,
      element: element1,
      defaultOptions: {
        orientation: Enums.OrientationAxis.AXIAL,
        background: <Types.Point3>[0.2, 0, 0.2],
      },
    },
  ];

  renderingEngine.setViewports(viewportInputArray);

  toolGroup.addViewport(viewportId, renderingEngineId);

  // Set the volume to load
  volume.load();

  // Set volumes on the viewports
  setVolumesForViewports(renderingEngine, [{ volumeId }], [viewportId]);

  // Add the segmentation representation to the viewport
  await segmentation.addSegmentationRepresentations(viewportId, [
    {
      segmentationId,
      type: csToolsEnums.SegmentationRepresentations.Contour,
    },
  ]);

  // Render the image
  renderingEngine.render();
}

run();
