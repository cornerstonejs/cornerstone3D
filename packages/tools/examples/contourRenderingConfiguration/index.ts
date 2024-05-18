import {
  Enums,
  geometryLoader,
  RenderingEngine,
  setVolumesForViewports,
  Types,
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
  'Here we demonstrate how to configure the contour rendering. This example download the contour data.'
);

const size = '500px';
const content = document.getElementById('content');
const viewportGrid = document.createElement('div');

viewportGrid.style.display = 'flex';
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

let planarSegmentationRepresentationUID;

// ============================= //

addToggleButtonToToolbar({
  title: 'Hide All Segments',
  onClick: (toggle) => {
    [
      { representationUID: planarSegmentationRepresentationUID, toolGroupId },
    ].forEach(({ representationUID, toolGroupId }) => {
      segmentation.config.visibility.setSegmentationVisibility(
        toolGroupId,
        representationUID,
        !toggle
      );
    });
  },
});

addToggleButtonToToolbar({
  title: 'Hide Red Segment',
  onClick: (toggle) => {
    const segmentIndex = 1;
    [
      { representationUID: planarSegmentationRepresentationUID, toolGroupId },
    ].forEach(({ representationUID, toolGroupId }) => {
      segmentation.config.visibility.setSegmentVisibility(
        toolGroupId,
        representationUID,
        segmentIndex,
        !toggle
      );
    });
  },
});

addToggleButtonToToolbar({
  title: 'Hide Green Segment',
  onClick: (toggle) => {
    const segmentIndex = 2;
    [
      { representationUID: planarSegmentationRepresentationUID, toolGroupId },
    ].forEach(({ representationUID, toolGroupId }) => {
      segmentation.config.visibility.setSegmentVisibility(
        toolGroupId,
        representationUID,
        segmentIndex,
        !toggle
      );
    });
  },
});

addSliderToToolbar({
  title: 'Change Segments Thickness For left viewport',
  range: [0.1, 10],
  defaultValue: 4,
  onSelectedValueChange: (value) => {
    segmentation.config.setToolGroupSpecificConfig(toolGroupId, {
      renderInactiveSegmentations: true,
      representations: {
        CONTOUR: {
          outlineWidthActive: Number(value),
        },
      },
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
      type: GeometryType.CONTOUR,
      geometryData: contourSet as Types.PublicContourSetData,
    });
  });

  await Promise.all(promises);

  // Add the segmentations to state
  segmentation.addSegmentations([
    {
      segmentationId: `${segmentationId}`,
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
  cornerstoneTools.addTool(SegmentationDisplayTool);
  cornerstoneTools.addTool(PanTool);
  cornerstoneTools.addTool(ZoomTool);
  cornerstoneTools.addTool(StackScrollMouseWheelTool);
  cornerstoneTools.addTool(TrackballRotateTool);

  // Define tool groups to add the segmentation display tool to
  const toolGroup = ToolGroupManager.createToolGroup(toolGroupId);

  toolGroup.addTool(SegmentationDisplayTool.toolName);
  toolGroup.addTool(PanTool.toolName);
  toolGroup.addTool(ZoomTool.toolName);
  toolGroup.addTool(StackScrollMouseWheelTool.toolName);
  toolGroup.setToolEnabled(SegmentationDisplayTool.toolName);

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

  toolGroup.setToolActive(StackScrollMouseWheelTool.toolName);

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

  const viewportInputArray = [
    {
      viewportId: viewportId1,
      type: ViewportType.ORTHOGRAPHIC,
      element: element1,
      defaultOptions: {
        orientation: Enums.OrientationAxis.AXIAL,
        background: <Types.Point3>[0.2, 0, 0.2],
      },
    },
  ];

  renderingEngine.setViewports(viewportInputArray);

  toolGroup.addViewport(viewportId1, renderingEngineId);

  // Set the volume to load
  volume.load();

  // Set volumes on the viewports
  setVolumesForViewports(renderingEngine, [{ volumeId }], [viewportId1]);

  // // Add the segmentation representation to the toolgroup
  const segRepresentations1 = await segmentation.addSegmentationRepresentations(
    toolGroupId,
    [
      {
        segmentationId: `${segmentationId}`,
        type: csToolsEnums.SegmentationRepresentations.Contour,
      },
    ]
  );

  planarSegmentationRepresentationUID = segRepresentations1[0];

  // Render the image
  renderingEngine.render();
}

run();
