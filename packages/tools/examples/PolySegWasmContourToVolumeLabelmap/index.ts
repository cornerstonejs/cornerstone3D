import {
  RenderingEngine,
  Enums,
  setVolumesForViewports,
  volumeLoader,
} from '@cornerstonejs/core';
import {
  initDemo,
  createImageIdsAndCacheMetaData,
  setTitleAndDescription,
  setCtTransferFunctionForVolumeActor,
  addButtonToToolbar,
  addDropdownToToolbar,
  createInfoSection,
  addManipulationBindings,
} from '../../../../utils/demo/helpers';
import * as cornerstoneTools from '@cornerstonejs/tools';

// This is for debugging purposes
console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const {
  SegmentationDisplayTool,
  ToolGroupManager,
  Enums: csToolsEnums,
  segmentation,
  PlanarFreehandContourSegmentationTool,
} = cornerstoneTools;

setTitleAndDescription(
  'Contour Segmentation to Volume Labelmap Segmentation',
  'This demonstration showcases the usage of PolySEG WASM module to convert a contour segmentation to a volume labelmap segmentation. Use the left viewport to draw a contour segmentation and then click on the button to convert it to a volume labelmap segmentation. The right viewport shows the volume labelmap segmentation.'
);

const { MouseBindings, KeyboardBindings } = csToolsEnums;
const { ViewportType } = Enums;

// Define a unique id for the volume
const volumeName = 'CT_VOLUME_ID'; // Id of the volume less loader prefix
const volumeLoaderScheme = 'cornerstoneStreamingImageVolume'; // Loader id which defines which volume loader to use
const volumeId = `${volumeLoaderScheme}:${volumeName}`; // VolumeId with loader id + volume id
const segmentationId = 'MY_SEGMENTATION_ID';

// ======== Set up page ======== //

const size = '500px';
const content = document.getElementById('content');
const viewportGrid = document.createElement('div');

viewportGrid.style.display = 'flex';
viewportGrid.style.display = 'flex';
viewportGrid.style.flexDirection = 'row';

const element1 = document.createElement('div');
const element2 = document.createElement('div');
element1.style.width = size;
element1.style.height = size;
element2.style.width = size;
element2.style.height = size;

// Disable right click context menu so we can have right click tools
element1.oncontextmenu = (e) => e.preventDefault();
element2.oncontextmenu = (e) => e.preventDefault();

viewportGrid.appendChild(element1);
viewportGrid.appendChild(element2);

content.appendChild(viewportGrid);

createInfoSection(content, { ordered: true })
  .addInstruction('Draw a contour segmentation on the left viewport')
  .addInstruction(
    'Click on the button to convert the contour segmentation to a volume labelmap segmentation'
  );

// ============================= //
let toolGroup1, toolGroup2;
let renderingEngine;
const toolGroupId1 = 'ToolGroup_Contour';
const toolGroupId2 = 'ToolGroup_Labelmap';
const viewportId1 = 'CT_SAGITTAL_CONTOUR';
const viewportId2 = 'CT_SAGITTAL_LABELMAP';

const segmentIndexes = [1, 2, 3, 4, 5];

addButtonToToolbar({
  title: 'Convert contour segmentation to labelmap segmentation',
  onClick: async () => {
    // add the 3d representation to the 3d toolgroup
    await segmentation.addSegmentationRepresentations(toolGroupId2, [
      {
        segmentationId,
        type: csToolsEnums.SegmentationRepresentations.Labelmap,
        options: {
          polySeg: {
            enabled: true,
          },
        },
      },
    ]);
  },
});

addDropdownToToolbar({
  labelText: 'Segment Index',
  options: { values: segmentIndexes, defaultValue: segmentIndexes[0] },
  onSelectedValueChange: (number) => {
    segmentation.segmentIndex.setActiveSegmentIndex(
      segmentationId,
      Number(number) as number
    );
  },
});

/**
 * Runs the demo
 */
async function run() {
  // Init Cornerstone and related libraries
  await initDemo();

  // Add tools to Cornerstone3D
  cornerstoneTools.addTool(SegmentationDisplayTool);
  cornerstoneTools.addTool(PlanarFreehandContourSegmentationTool);

  // Define tool groups to add the segmentation display tool to
  toolGroup1 = ToolGroupManager.createToolGroup(toolGroupId1);
  toolGroup2 = ToolGroupManager.createToolGroup(toolGroupId2);

  addManipulationBindings(toolGroup1);
  addManipulationBindings(toolGroup2);

  // Manipulation Tools
  toolGroup1.addTool(PlanarFreehandContourSegmentationTool.toolName);
  toolGroup1.addTool(SegmentationDisplayTool.toolName);
  toolGroup2.addTool(SegmentationDisplayTool.toolName);

  // activations
  toolGroup1.setToolEnabled(SegmentationDisplayTool.toolName);
  toolGroup2.setToolEnabled(SegmentationDisplayTool.toolName);

  toolGroup1.setToolActive(PlanarFreehandContourSegmentationTool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Primary,
      },
      {
        mouseButton: MouseBindings.Primary, // Shift + Left Click
        modifierKey: KeyboardBindings.Shift,
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

  // Instantiate a rendering engine
  const renderingEngineId = 'myRenderingEngine';
  renderingEngine = new RenderingEngine(renderingEngineId);

  const viewportInputArray = [
    {
      viewportId: viewportId1,
      type: ViewportType.ORTHOGRAPHIC,
      element: element1,
      defaultOptions: {
        orientation: Enums.OrientationAxis.SAGITTAL,
      },
    },
    {
      viewportId: viewportId2,
      type: ViewportType.ORTHOGRAPHIC,
      element: element2,
      defaultOptions: {
        orientation: Enums.OrientationAxis.SAGITTAL,
      },
    },
  ];

  renderingEngine.setViewports(viewportInputArray);

  toolGroup1.addViewport(viewportId1, renderingEngineId);
  toolGroup2.addViewport(viewportId2, renderingEngineId);

  // Set the volume to load
  volume.load();

  // Set volumes on the viewports
  await setVolumesForViewports(
    renderingEngine,
    [{ volumeId, callback: setCtTransferFunctionForVolumeActor }],
    [viewportId1, viewportId2]
  );

  // Add the segmentations to state
  await segmentation.addSegmentations([
    {
      segmentationId,
      representation: {
        // The type of segmentation
        type: csToolsEnums.SegmentationRepresentations.Contour,
      },
    },
  ]);

  // // Add the segmentation representation to the toolgroup
  await segmentation.addSegmentationRepresentations(toolGroupId1, [
    {
      segmentationId,
      type: csToolsEnums.SegmentationRepresentations.Contour,
    },
  ]);

  // Render the image
  renderingEngine.renderViewports([viewportId1, viewportId2]);
}

run();
