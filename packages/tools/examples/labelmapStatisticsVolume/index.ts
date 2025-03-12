import {
  RenderingEngine,
  Enums,
  volumeLoader,
  eventTarget,
  setVolumesForViewports,
  utilities,
} from '@cornerstonejs/core';
import * as cornerstoneTools from '@cornerstonejs/tools';
import {
  createImageIdsAndCacheMetaData,
  initDemo,
  setTitleAndDescription,
  addBrushSizeSlider,
  addSegmentIndexDropdown,
  setCtTransferFunctionForVolumeActor,
} from '../../../../utils/demo/helpers';
import addButtonToToolbar from '../../../../utils/demo/helpers/addButtonToToolbar';

// This is for debugging purposes
console.debug(
  'Click on index.ts to open source code for this example --------->'
);

const {
  ToolGroupManager,
  ZoomTool,
  StackScrollTool,
  Enums: csToolsEnums,
  RectangleScissorsTool,
  CircleScissorsTool,
  BrushTool,
  PaintFillTool,
  PanTool,
  segmentation,
  utilities: cstUtils,
} = cornerstoneTools;

const { MouseBindings, KeyboardBindings, Events } = csToolsEnums;
const { ViewportType } = Enums;
const { segmentation: segmentationUtils, roundNumber } = cstUtils;

// Define a unique id for the volume
const volumeName = 'CT_VOLUME_ID'; // Id of the volume less loader prefix
const volumeLoaderScheme = 'cornerstoneStreamingImageVolume'; // Loader id which defines which volume loader to use
const volumeId = `${volumeLoaderScheme}:${volumeName}`;
const segmentationId = 'SEGMENTATION_ID';
const toolGroupId = 'TOOL_GROUP_ID';

// ======== Set up page ======== //
setTitleAndDescription(
  'Volume Segmentation Statistics',
  'Here we demonstrate how to calculate statistics for a volume segmentation.'
);

const size = '500px';
const content = document.getElementById('content');

const statsGrid = document.createElement('div');
statsGrid.style.display = 'flex';
statsGrid.style.flexDirection = 'row';
statsGrid.style.fontSize = 'smaller';

const statsIds = ['segment1', 'segment2', 'segmentCombined'];
const statsStyle = {
  width: '20em',
  height: '10em',
};

for (const statsId of statsIds) {
  const statsDiv = document.createElement('div');
  statsDiv.id = statsId;
  statsDiv.innerText = statsId;
  Object.assign(statsDiv.style, statsStyle);
  statsGrid.appendChild(statsDiv);
}

content.appendChild(statsGrid);

// Add calculate button
addButtonToToolbar({
  title: 'Calculate Statistics',
  onClick: () => {
    // Get the selected mode from the dropdown
    calculateStatistics([1, 2], 'individual');
    calculateStatistics([1, 2], 'collective');
  },
});

const viewportGrid = document.createElement('div');
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

const instructions = document.createElement('p');
instructions.innerText = `
  Left Click: Use selected Segmentation Tool.
  Middle Click: Pan
  Right Click: Zoom
  Mouse wheel: Scroll Stack
  `;

content.append(instructions);

// ============================= //

function displayStat(stat) {
  if (!stat) {
    return;
  }
  return `${stat.label || stat.name}: ${roundNumber(stat.value)} ${
    stat.unit ? stat.unit : ''
  }`;
}

async function calculateStatistics(indices, mode) {
  const stats = await segmentationUtils.getStatistics({
    segmentationId,
    segmentIndices: indices,
    mode,
  });

  if (!stats) {
    return;
  }

  if (mode === 'individual') {
    // Handle individual mode where stats is an object with segment indices as keys
    const segmentStats = stats as { [segmentIndex: number]: any };

    for (const segmentIndex of indices) {
      if (segmentStats[segmentIndex]) {
        const segmentStat = segmentStats[segmentIndex];
        segmentStat.count.label = 'Voxels';
        const items = [`Statistics on segment ${segmentIndex}`];

        items.push(
          displayStat(segmentStat.volume),
          displayStat(segmentStat.count),
          displayStat(segmentStat.mean),
          displayStat(segmentStat.max),
          displayStat(segmentStat.min),
          displayStat(segmentStat.peakValue)
        );

        const statsDiv = document.getElementById(`segment${segmentIndex}`);
        statsDiv.innerHTML = items.map((span) => `${span}<br />\n`).join('\n');
      }
    }
  } else {
    const items = [`Statistics on ${indices.join(', ')}`];
    // Handle collective mode where stats is a NamedStatistics object
    const namedStats = stats as any;
    namedStats.count.label = 'Voxels';

    items.push(
      displayStat(namedStats.volume),
      displayStat(namedStats.count),
      displayStat(namedStats.mean),
      displayStat(namedStats.max),
      displayStat(namedStats.min),
      displayStat(namedStats.peakValue)
    );

    const statsDiv = document.getElementById('segmentCombined');
    statsDiv.innerHTML = items.map((span) => `${span}<br />\n`).join('\n');
  }
}

function segmentationModifiedCallback(evt) {
  const { detail } = evt;
  if (!detail || !detail.segmentIndex || detail.segmentIndex === 255) {
    return;
  }
}

// ============================= //

async function addSegmentationsToState() {
  // Create a segmentation of the same resolution as the source data
  volumeLoader.createAndCacheDerivedLabelmapVolume(volumeId, {
    volumeId: segmentationId,
  });

  // Add the segmentations to state
  segmentation.addSegmentations([
    {
      segmentationId,
      representation: {
        type: csToolsEnums.SegmentationRepresentations.Labelmap,
        data: {
          volumeId: segmentationId,
        },
      },
    },
  ]);
}

function setupTools() {
  // Add tools to Cornerstone3D
  cornerstoneTools.addTool(PanTool);
  cornerstoneTools.addTool(ZoomTool);
  cornerstoneTools.addTool(StackScrollTool);
  cornerstoneTools.addTool(RectangleScissorsTool);
  cornerstoneTools.addTool(CircleScissorsTool);
  cornerstoneTools.addTool(PaintFillTool);
  cornerstoneTools.addTool(BrushTool);

  // Define a tool group
  const toolGroup = ToolGroupManager.createToolGroup(toolGroupId);

  // Add tools to the group
  toolGroup.addTool(PanTool.toolName);
  toolGroup.addTool(ZoomTool.toolName);
  toolGroup.addTool(StackScrollTool.toolName);
  toolGroup.addTool(RectangleScissorsTool.toolName);
  toolGroup.addTool(CircleScissorsTool.toolName);
  toolGroup.addTool(PaintFillTool.toolName);
  toolGroup.addTool(BrushTool.toolName);

  // Set tool modes
  toolGroup.setToolActive(BrushTool.toolName, {
    bindings: [{ mouseButton: MouseBindings.Primary }],
  });

  toolGroup.setToolActive(PanTool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Auxiliary,
      },
      {
        mouseButton: MouseBindings.Primary,
        modifierKey: KeyboardBindings.Ctrl,
      },
    ],
  });

  toolGroup.setToolActive(ZoomTool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Secondary,
      },
      {
        mouseButton: MouseBindings.Primary,
        modifierKey: KeyboardBindings.Shift,
      },
    ],
  });

  toolGroup.setToolActive(StackScrollTool.toolName, {
    bindings: [{ mouseButton: MouseBindings.Wheel }],
  });

  return toolGroup;
}

/**
 * Runs the demo
 */
async function run() {
  // Init Cornerstone and related libraries
  await initDemo();

  const toolGroup = setupTools();

  // Get Cornerstone imageIds and fetch metadata into RAM
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

  // Create the viewports
  const viewportId1 = 'CT_AXIAL';
  const viewportId2 = 'CT_SAGITTAL';
  const viewportId3 = 'CT_CORONAL';

  // Instantiate a rendering engine
  const renderingEngine = new RenderingEngine('myRenderingEngine');

  const viewportInputArray = [
    {
      viewportId: viewportId1,
      type: ViewportType.ORTHOGRAPHIC,
      element: element1,
      defaultOptions: {
        orientation: Enums.OrientationAxis.AXIAL,
        background: [0, 0, 0],
      },
    },
    {
      viewportId: viewportId2,
      type: ViewportType.ORTHOGRAPHIC,
      element: element2,
      defaultOptions: {
        orientation: Enums.OrientationAxis.SAGITTAL,
        background: [0, 0, 0],
      },
    },
    {
      viewportId: viewportId3,
      type: ViewportType.ORTHOGRAPHIC,
      element: element3,
      defaultOptions: {
        orientation: Enums.OrientationAxis.CORONAL,
        background: [0, 0, 0],
      },
    },
  ];

  renderingEngine.setViewports(viewportInputArray);

  toolGroup.addViewport(viewportId1, 'myRenderingEngine');
  toolGroup.addViewport(viewportId2, 'myRenderingEngine');
  toolGroup.addViewport(viewportId3, 'myRenderingEngine');

  // Set the volume to load
  volume.load();

  // Set volumes on the viewports
  await setVolumesForViewports(
    renderingEngine,
    [{ volumeId, callback: setCtTransferFunctionForVolumeActor }],
    [viewportId1, viewportId2, viewportId3]
  );

  // Add some segmentations based on the source data volume
  await addSegmentationsToState();

  // Add the segmentation representation to the viewports
  const segmentationRepresentation = {
    segmentationId,
    type: csToolsEnums.SegmentationRepresentations.Labelmap,
  };

  await segmentation.addLabelmapRepresentationToViewportMap({
    [viewportId1]: [segmentationRepresentation],
    [viewportId2]: [segmentationRepresentation],
    [viewportId3]: [segmentationRepresentation],
  });

  // Add brush size slider
  addBrushSizeSlider({
    toolGroupId,
  });

  addSegmentIndexDropdown(segmentationId, [1, 2]);

  // Add segmentation modified callback
  eventTarget.addEventListener(
    Events.SEGMENTATION_DATA_MODIFIED,
    segmentationModifiedCallback
  );

  // Render the image
  renderingEngine.render();
}

run();
