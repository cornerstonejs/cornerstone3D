import {
  RenderingEngine,
  Enums,
  setVolumesForViewports,
  volumeLoader,
  CONSTANTS,
  utilities,
  Types,
} from '@cornerstonejs/core';
import {
  initDemo,
  createImageIdsAndCacheMetaData,
  setTitleAndDescription,
  setCtTransferFunctionForVolumeActor,
  addButtonToToolbar,
  addDropdownToToolbar,
  addToggleButtonToToolbar,
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
  BrushTool,
  PanTool,
  ZoomTool,
  StackScrollMouseWheelTool,
  TrackballRotateTool,
} = cornerstoneTools;

setTitleAndDescription(
  'Volume Labelmap to Surface',
  'This demonstration showcases the usage of PolySEG WASM module to convert a labelmap to a surface representation.'
);

const { MouseBindings } = csToolsEnums;
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
const element3 = document.createElement('div');
element1.style.width = size;
element1.style.height = size;
element2.style.width = size;
element2.style.height = size;
element3.style.width = size;
element3.style.height = size;

// Disable right click context menu so we can have right click tools
element1.oncontextmenu = (e) => e.preventDefault();
element2.oncontextmenu = (e) => e.preventDefault();
element3.oncontextmenu = (e) => e.preventDefault();

viewportGrid.appendChild(element1);
viewportGrid.appendChild(element2);
viewportGrid.appendChild(element3);

content.appendChild(viewportGrid);

createInfoSection(content, { ordered: true })
  .addInstruction('Use the Brush Tool for segmentation in MPR viewports')
  .addInstruction(
    'Toggle between different segmentation tools like Sphere Brush and Eraser'
  )
  .addInstruction('Convert the labelmap to a 3D surface representation')
  .addInstruction('Manipulate the 3D view using the Trackball Rotate Tool')
  .addInstruction('Toggle the visibility of the 3D anatomy model');

// ============================= //
const toolGroupId = 'ToolGroup_MPR';
const toolGroupId2 = 'ToolGroup_3D';
let toolGroup1, toolGroup2;
let renderingEngine;
// Create the viewports
const viewportId1 = 'CT_AXIAL';
const viewportId2 = 'CT_SAGITTAL';
const viewportId3 = 'CT_3D';

const segmentIndexes = [1, 2, 3, 4, 5];

addButtonToToolbar({
  title: 'Convert labelmap to surface',
  onClick: async () => {
    // add the 3d representation to the 3d toolgroup
    await segmentation.addSegmentationRepresentations(toolGroupId2, [
      {
        segmentationId,
        type: csToolsEnums.SegmentationRepresentations.Surface,
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
  onSelectedValueChange: (nameAsStringOrNumber) => {
    segmentation.segmentIndex.setActiveSegmentIndex(
      segmentationId,
      nameAsStringOrNumber as number
    );
  },
});

addToggleButtonToToolbar({
  title: 'Toggle Brush and Eraser',
  defaultToggle: true,
  onClick: async (toggle) => {
    if (toggle) {
      toolGroup1.setToolDisabled('EraserBrush', {});
      toolGroup1.setToolActive('SphereBrush', {
        bindings: [
          {
            mouseButton: MouseBindings.Primary, // Middle Click
          },
        ],
      });
    } else {
      toolGroup1.setToolDisabled('SphereBrush', {});
      toolGroup1.setToolActive('EraserBrush', {
        bindings: [
          {
            mouseButton: MouseBindings.Primary, // Middle Click
          },
        ],
      });
    }
  },
});

addToggleButtonToToolbar({
  title: 'Show 3D Anatomy',
  defaultToggle: false,
  onClick: async (toggle) => {
    const viewport3 = renderingEngine.getViewport(viewportId3);
    const volumeActor = viewport3.getDefaultActor().actor as Types.VolumeActor;

    const visibility = toggle;
    volumeActor.setVisibility(visibility);

    // seems like we should reset camera, most likely this is clipping planes
    // not critical but we should fix it later
    viewport3.resetCamera();
    viewport3.render();
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
  cornerstoneTools.addTool(BrushTool);

  // Define tool groups to add the segmentation display tool to
  toolGroup1 = ToolGroupManager.createToolGroup(toolGroupId);
  toolGroup2 = ToolGroupManager.createToolGroup(toolGroupId2);

  addManipulationBindings(toolGroup1);
  addManipulationBindings(toolGroup2, { is3DViewport: true });

  // Segmentation Tools
  toolGroup1.addTool(SegmentationDisplayTool.toolName);
  toolGroup1.addToolInstance('SphereBrush', BrushTool.toolName, {
    activeStrategy: 'FILL_INSIDE_SPHERE',
  });
  toolGroup1.addToolInstance('EraserBrush', BrushTool.toolName, {
    activeStrategy: 'ERASE_INSIDE_SPHERE',
  });

  toolGroup2.addTool(SegmentationDisplayTool.toolName);

  // activations
  toolGroup1.setToolEnabled(SegmentationDisplayTool.toolName);
  toolGroup2.setToolEnabled(SegmentationDisplayTool.toolName);

  toolGroup1.setToolActive('SphereBrush', {
    bindings: [
      {
        mouseButton: MouseBindings.Primary, // Middle Click
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
        orientation: Enums.OrientationAxis.AXIAL,
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
    {
      viewportId: viewportId3,
      type: ViewportType.VOLUME_3D,
      element: element3,
      defaultOptions: {
        background: CONSTANTS.BACKGROUND_COLORS.slicer3D,
      },
    },
  ];

  renderingEngine.setViewports(viewportInputArray);

  toolGroup1.addViewport(viewportId1, renderingEngineId);
  toolGroup1.addViewport(viewportId2, renderingEngineId);
  toolGroup2.addViewport(viewportId3, renderingEngineId);

  // Set the volume to load
  volume.load();

  // Set volumes on the viewports
  await setVolumesForViewports(
    renderingEngine,
    [{ volumeId, callback: setCtTransferFunctionForVolumeActor }],
    [viewportId1, viewportId2, viewportId3]
  );

  // set the anatomy at first invisible
  const volumeActor = renderingEngine.getViewport(viewportId3).getDefaultActor()
    .actor as Types.VolumeActor;
  utilities.applyPreset(
    volumeActor,
    CONSTANTS.VIEWPORT_PRESETS.find((preset) => preset.name === 'CT-Bone')
  );
  volumeActor.setVisibility(false);

  // Add some segmentations based on the source data volume
  // Create a segmentation of the same resolution as the source data
  // using volumeLoader.createAndCacheDerivedVolume.
  await volumeLoader.createAndCacheDerivedVolume(volumeId, {
    volumeId: segmentationId,
  });

  // Add the segmentations to state
  await segmentation.addSegmentations([
    {
      segmentationId,
      representation: {
        // The type of segmentation
        type: csToolsEnums.SegmentationRepresentations.Labelmap,
        // The actual segmentation data, in the case of labelmap this is a
        // reference to the source volume of the segmentation.
        data: {
          volumeId: segmentationId,
        },
      },
    },
  ]);

  // // Add the segmentation representation to the toolgroup
  await segmentation.addSegmentationRepresentations(toolGroupId, [
    {
      segmentationId,
      type: csToolsEnums.SegmentationRepresentations.Labelmap,
    },
  ]);

  // setBrushSizeForToolGroup(toolGroupId, 100);

  // Render the image
  renderingEngine.renderViewports([viewportId1, viewportId2, viewportId3]);
}

run();
