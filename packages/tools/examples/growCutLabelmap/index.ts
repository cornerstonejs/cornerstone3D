import type { Types } from '@cornerstonejs/core';
import {
  RenderingEngine,
  Enums,
  cache,
  setVolumesForViewports,
  volumeLoader,
} from '@cornerstonejs/core';
import {
  initDemo,
  createImageIdsAndCacheMetaData,
  setTitleAndDescription,
  addDropdownToToolbar,
  addButtonToToolbar,
  createInfoSection,
  addBrushSizeSlider,
} from '../../../../utils/demo/helpers';
import * as cornerstoneTools from '@cornerstonejs/tools';

// This is for debugging purposes
console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const DEFAULT_SEGMENT_CONFIG = {
  fillAlpha: 0.1,
  outlineOpacity: 1,
  outlineWidthActive: 3,
};

const {
  ToolGroupManager,
  Enums: csToolsEnums,
  segmentation,
  BrushTool,
  PanTool,
  ZoomTool,
  StackScrollTool,
  utilities: cstUtils,
} = cornerstoneTools;

const { MouseBindings } = csToolsEnums;
const { ViewportType } = Enums;
const { segmentation: segmentationUtils } = cstUtils;

const growCutOptions = {
  windowSize: 3,
  inspection: {
    numCyclesInterval: 5,
  },
};

// Define a unique id for the volume
const volumeName = 'PT_VOLUME_ID'; // Id of the volume less loader prefix
const volumeLoaderScheme = 'cornerstoneStreamingImageVolume'; // Loader id which defines which volume loader to use
const volumeId = `${volumeLoaderScheme}:${volumeName}`; // VolumeId with loader id + volume id
const segmentationId = 'MY_SEGMENTATION_ID';
const toolGroupId = 'MY_TOOLGROUP_ID';

// ======== Set up page ======== //
setTitleAndDescription(
  'Custom Brush Grow Cut',
  'Demonstrates how to run Grow Cut algorithm in the GPU on a labelmap with positive and negative seeds'
);

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

// prettier-ignore
createInfoSection(content)
  .addInstruction(
    'Select "Segment 1" and draw on the are you want to segment ("positive")'
  )
  .addInstruction(
    'Select "Segment 2" and draw outside of the are you want to segment ("negative")'
  )
  .addInstruction('Select the window size (default: 3x3x3)')
  .openNestedSection()
    .addInstruction('the algorithm uses a NxNxN window to compare the current voxel to its neighbors')
    .addInstruction('start with a smaller window (faster) and change it to larger one only if the results are not accurate enough')
  .closeNestedSection()
  .addInstruction('Select the number of inspection cycles (default: 5)')
  .openNestedSection()
    .addInstruction(
      'the algorithm calculates the number of cycles to run based on the volume size (FOR loop) ' +
      'and push the data to the gpu which runs the grow cut algorithm. On every "X" cycles it ' +
      'reads some data from the gpu to see if voxels are still getting updated otherwise it stops.'
    )
    .openNestedSection()
      .addInstruction(
        'Smaller numbers may do it stop sooner but which is good but transfering data out of the ' +
        'gpu is costly and that can also make it run slower.'
      )
      .addInstruction(
        'Bigger numbers may make it waste time running a few more steps even when it is already done.'
      )
    .closeNestedSection()
  .closeNestedSection()
  .addInstruction('Click on "Run Grow Cut" button and wait a few seconds')
  .addInstruction('You can also click on "Restart" if you want to change the seed pixels (draw again)')

const statsElement = document.createElement('div');

Object.assign(statsElement.style, {
  color: '#00A',
  fontWeight: 'bold',
});
content.appendChild(statsElement);

// ============================= //
addDropdownToToolbar({
  options: {
    labels: ['Segment 1', 'Segment 2', 'Segment 3'],
    values: [1, 2, 3],
    defaultValue: 1,
  },
  onSelectedValueChange: (segmentIndex) => {
    segmentation.segmentIndex.setActiveSegmentIndex(
      segmentationId,
      Number(segmentIndex)
    );
  },
});

addBrushSizeSlider({ toolGroupId });

addDropdownToToolbar({
  labelText: 'Window Size',
  options: {
    labels: ['3x3x3', '5x5x5', '7x7x7', '9x9x9x'],
    values: [3, 5, 7, 9],
    defaultValue: growCutOptions.windowSize,
  },
  onSelectedValueChange: (windowSize) => {
    growCutOptions.windowSize = Number(windowSize);
  },
});

addDropdownToToolbar({
  labelText: 'Inspection Cycles',
  options: {
    labels: ['1 cycle', '3 cycles', '5 cycles', '10 cycles'],
    values: [1, 3, 5, 10],
    defaultValue: growCutOptions.inspection.numCyclesInterval,
  },
  onSelectedValueChange: (numCyclesInterval) => {
    growCutOptions.inspection.numCyclesInterval = Number(numCyclesInterval);
  },
});

addButtonToToolbar({
  title: 'Run Grow Cut',
  onClick: async function () {
    const startTime = performance.now();

    this.disabled = true;
    statsElement.innerText = 'Processing...';

    await segmentationUtils.growCut.run(
      volumeId,
      segmentationId,
      growCutOptions
    );

    this.disabled = false;
    statsElement.innerText = `Total time: ${(
      performance.now() - startTime
    ).toFixed(2)} ms`;

    segmentation.triggerSegmentationEvents.triggerSegmentationDataModified(
      segmentationId
    );
  },
});

addButtonToToolbar({
  title: 'Restart',
  onClick: async () => {
    const labelmapVolume = cache.getVolume(segmentationId);
    labelmapVolume.voxelManager.clear();
    segmentation.triggerSegmentationEvents.triggerSegmentationDataModified(
      segmentationId
    );
  },
});

// ============================= //

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
  cornerstoneTools.addTool(BrushTool);

  // Define tool groups to add the segmentation display tool to
  const toolGroup = ToolGroupManager.createToolGroup(toolGroupId);

  // Manipulation Tools
  toolGroup.addTool(PanTool.toolName);
  toolGroup.addTool(ZoomTool.toolName);
  toolGroup.addTool(StackScrollTool.toolName);

  // Segmentation Tools
  toolGroup.addTool(BrushTool.toolName);

  toolGroup.setToolActive(BrushTool.toolName, {
    bindings: [{ mouseButton: MouseBindings.Primary }],
  });

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
  // As the Stack Scroll mouse wheel is a tool using the `mouseWheelCallback`
  // hook instead of mouse buttons, it does not need to assign any mouse button.
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
    wadoRsRoot: 'https://d33do7qe4w26qo.cloudfront.net/dicomweb',
  });

  // Define a volume in memory
  const volume = await volumeLoader.createAndCacheVolume(volumeId, {
    imageIds,
  });

  // Instantiate a rendering engine
  const renderingEngineId = 'myRenderingEngine';
  const renderingEngine = new RenderingEngine(renderingEngineId);

  // Create the viewports
  const viewportId1 = 'CT_AXIAL';
  const viewportId2 = 'CT_SAGITTAL';
  const viewportId3 = 'CT_CORONAL';

  const viewportInputArray = [
    {
      viewportId: viewportId1,
      type: ViewportType.ORTHOGRAPHIC,
      element: element1,
      defaultOptions: {
        orientation: Enums.OrientationAxis.AXIAL,
        background: <Types.Point3>[0, 0, 0],
      },
    },
    {
      viewportId: viewportId2,
      type: ViewportType.ORTHOGRAPHIC,
      element: element2,
      defaultOptions: {
        orientation: Enums.OrientationAxis.SAGITTAL,
        background: <Types.Point3>[0, 0, 0],
      },
    },
    {
      viewportId: viewportId3,
      type: ViewportType.ORTHOGRAPHIC,
      element: element3,
      defaultOptions: {
        orientation: Enums.OrientationAxis.CORONAL,
        background: <Types.Point3>[0, 0, 0],
      },
    },
  ];

  renderingEngine.setViewports(viewportInputArray);

  toolGroup.addViewport(viewportId1, renderingEngineId);
  toolGroup.addViewport(viewportId2, renderingEngineId);
  toolGroup.addViewport(viewportId3, renderingEngineId);

  // Set the volume to load
  volume.load();

  // Set volumes on the viewports
  await setVolumesForViewports(
    renderingEngine,
    [{ volumeId }],
    [viewportId1, viewportId2, viewportId3]
  );

  // Create a segmentation of the same resolution as the source data
  volumeLoader.createAndCacheDerivedLabelmapVolume(volumeId, {
    volumeId: segmentationId,
  });

  // Add the segmentations to state
  segmentation.addSegmentations([
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

  const segMap = {
    [viewportId1]: [{ segmentationId }],
    [viewportId2]: [{ segmentationId }],
    [viewportId3]: [{ segmentationId }],
  };
  // Add the segmentation representation to the toolgroup
  await segmentation.addLabelmapRepresentationToViewportMap(segMap);

  // Render the image
  renderingEngine.renderViewports([viewportId1, viewportId2, viewportId3]);
}

run();
