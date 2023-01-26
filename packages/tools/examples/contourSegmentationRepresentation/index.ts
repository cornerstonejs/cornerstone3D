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
// import rtContour from './RTContour.json';
import rtContour from './RTContourNew.json';

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
} = cornerstoneTools;
const { MouseBindings } = csToolsEnums;
const { ViewportType, GeometryType } = Enums;

// Define a unique id for the volume
const volumeName = 'CT_VOLUME_ID'; // Id of the volume less loader prefix
const volumeLoaderScheme = 'cornerstoneStreamingImageVolume'; // Loader id which defines which volume loader to use
const volumeId = `${volumeLoaderScheme}:${volumeName}`; // VolumeId with loader id + volume id
const segmentationId = 'MY_SEGMENTATION_ID';
const toolGroupId = 'MY_TOOLGROUP_ID';
const geometryId = 'RTContour';

// ======== Set up page ======== //
setTitleAndDescription(
  'Contour Segmentation Representation for Volume Viewport',
  'Here we demonstrate how you can add a contour as a segmentation to a volume.'
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
// ============================= //

async function addSegmentationsToState() {
  // load the contour data
  await geometryLoader.createAndCacheGeometry(geometryId, {
    type: GeometryType.CONTOUR,
    data: rtContour.contourSets as Types.PublicContourSetData,
  });

  // Add the segmentations to state
  segmentation.addSegmentations([
    {
      segmentationId,
      representation: {
        // The type of segmentation
        type: csToolsEnums.SegmentationRepresentations.Contour,
        // The actual segmentation data, in the case of contour geometry
        //  this is a reference to the geometry data
        data: {
          geometryId,
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
  // Define tool groups to add the segmentation display tool to
  const toolGroup = ToolGroupManager.createToolGroup(toolGroupId);

  toolGroup.addTool(SegmentationDisplayTool.toolName);
  toolGroup.setToolEnabled(SegmentationDisplayTool.toolName);
  toolGroup.addTool(PanTool.toolName);
  toolGroup.addTool(ZoomTool.toolName);
  toolGroup.addTool(StackScrollMouseWheelTool.toolName);

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
  // const imageIds = await createImageIdsAndCacheMetaData({
  //   StudyInstanceUID:
  //     '1.3.6.1.4.1.14519.5.2.1.7009.2403.334240657131972136850343327463',
  //   SeriesInstanceUID:
  //     '1.3.6.1.4.1.14519.5.2.1.7009.2403.226151125820845824875394858561',
  //   wadoRsRoot: 'https://d3t6nz73ql33tx.cloudfront.net/dicomweb',
  // });
  const imageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID: '1.3.12.2.1107.5.7.8.10013.30000011072819531359300000347',
    SeriesInstanceUID:
      '1.3.12.2.1107.5.7.8.10013.30000011072819531359300000346',
    wadoRsRoot: 'http://localhost/dicom-web',
  });
  // const imageIds = await createImageIdsAndCacheMetaData({
  //   StudyInstanceUID: '1.2.276.0.7230010.3.1.2.481035776.1.1669385265.734807',
  //   SeriesInstanceUID: '1.2.276.0.7230010.3.1.3.481035776.1.1669385265.734808',
  //   wadoRsRoot: 'http://localhost/dicom-web',
  // });

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
  await setVolumesForViewports(renderingEngine, [{ volumeId }], [viewportId1]);

  const viewport = renderingEngine.getViewport(
    viewportId1
  ) as Types.IVolumeViewport;
  // viewport.setBlendMode(Enums.BlendModes.MAXIMUM_INTENSITY_BLEND);
  // viewport.setSlabThickness(10);

  // // Add the segmentation representation to the toolgroup
  await segmentation.addSegmentationRepresentations(toolGroupId, [
    {
      segmentationId,
      type: csToolsEnums.SegmentationRepresentations.Contour,
    },
  ]);

  // Render the image
  renderingEngine.renderViewports([viewportId1]);
}

run();
