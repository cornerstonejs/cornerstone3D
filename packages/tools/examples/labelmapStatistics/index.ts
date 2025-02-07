import type { Types } from '@cornerstonejs/core';
import {
  RenderingEngine,
  Enums,
  setVolumesForViewports,
  volumeLoader,
  eventTarget,
} from '@cornerstonejs/core';
import {
  initDemo,
  createImageIdsAndCacheMetaData,
  setTitleAndDescription,
  addDropdownToToolbar,
  addSliderToToolbar,
  setCtTransferFunctionForVolumeActor,
  getLocalUrl,
  addManipulationBindings,
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
  RectangleScissorsTool,
  SphereScissorsTool,
  CircleScissorsTool,
  BrushTool,
  PaintFillTool,
  utilities: cstUtils,
} = cornerstoneTools;

const { MouseBindings, Events } = csToolsEnums;
const { ViewportType } = Enums;
const { segmentation: segmentationUtils, roundNumber } = cstUtils;

// Define a unique id for the volume
const volumeName = 'CT_VOLUME_ID'; // Id of the volume less loader prefix
const volumeLoaderScheme = 'cornerstoneStreamingImageVolume'; // Loader id which defines which volume loader to use
const volumeId = `${volumeLoaderScheme}:${volumeName}`; // VolumeId with loader id + volume id
const segmentationId = 'MY_SEGMENTATION_ID';
const toolGroupId = 'MY_TOOLGROUP_ID';
const viewports = [];

const DEFAULT_BRUSH_SIZE = 20;

// ======== Set up page ======== //
setTitleAndDescription(
  'Labelmap Segmentation Statistics',
  'Here we demonstrate calculating labelmap statistics'
);

const size = '500px';
const content = document.getElementById('content');

const statsGrid = document.createElement('div');
statsGrid.style.display = 'flex';
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

const instructions = document.createElement('p');
instructions.innerText = `
  Hover - show preview of segmentation tool
  Left drag to extend preview
  Left Click (or enter) to accept preview
  Reject preview by button (or esc)
  Hover outside of region to reset to hovered over segment index
  Shift Left - zoom, Ctrl Left - Pan, Alt Left - Stack Scroll
  `;

content.append(instructions);

const interpolationTools = new Map<string, any>();
const configuration = {
  preview: {
    enabled: true,
  },
};

const thresholdOptions = new Map<string, any>();
thresholdOptions.set('Dynamic Radius 0', { isDynamic: true, dynamicRadius: 0 });
thresholdOptions.set('Dynamic Radius 1', { isDynamic: true, dynamicRadius: 1 });
thresholdOptions.set('Dynamic Radius 3', { isDynamic: true, dynamicRadius: 3 });
thresholdOptions.set('Dynamic Radius 5', { isDynamic: true, dynamicRadius: 5 });
thresholdOptions.set('Use Existing Threshold', {
  isDynamic: false,
  dynamicRadius: 5,
});
thresholdOptions.set('CT Fat: (-150, -70)', {
  threshold: [-150, -70],
  isDynamic: false,
});
thresholdOptions.set('CT Bone: (200, 1000)', {
  threshold: [200, 1000],
  isDynamic: false,
});
const defaultThresholdOption = [...thresholdOptions.keys()][2];
const thresholdArgs = thresholdOptions.get(defaultThresholdOption);

interpolationTools.set('CircularBrush', {
  baseTool: BrushTool.toolName,
  configuration: {
    ...configuration,
    activeStrategy: 'FILL_INSIDE_CIRCLE',
  },
});

interpolationTools.set('ThresholdCircle', {
  baseTool: BrushTool.toolName,
  configuration: {
    ...configuration,
    activeStrategy: 'THRESHOLD_INSIDE_CIRCLE',
    strategySpecificConfiguration: {
      THRESHOLD_INSIDE_CIRCLE: { ...thresholdArgs },
    },
  },
});

interpolationTools.set('ThresholdSphere', {
  baseTool: BrushTool.toolName,
  configuration: {
    ...configuration,
    activeStrategy: 'THRESHOLD_INSIDE_SPHERE_WITH_ISLAND_REMOVAL',
    strategySpecificConfiguration: {
      THRESHOLD_INSIDE_SPHERE: { ...thresholdArgs },
    },
  },
});

interpolationTools.set('SphereBrush', {
  baseTool: BrushTool.toolName,
  configuration: {
    ...configuration,
    activeStrategy: 'FILL_INSIDE_SPHERE',
    strategySpecificConfiguration: {
      useCenterSegmentIndex: true,
    },
  },
});

const optionsValues = [...interpolationTools.keys()];

// ============================= //

// Create a reference to the threshold dropdown element
const thresholdDropdownElement = null;

addDropdownToToolbar({
  options: { values: optionsValues, defaultValue: BrushTool.toolName },
  onSelectedValueChange: (nameAsStringOrNumber) => {
    const name = String(nameAsStringOrNumber);
    const toolGroup = ToolGroupManager.getToolGroup(toolGroupId);

    // Set the currently active tool disabled
    const toolName = toolGroup.getActivePrimaryMouseButtonTool();

    if (toolName) {
      toolGroup.setToolDisabled(toolName);
    }

    toolGroup.setToolActive(name, {
      bindings: [{ mouseButton: MouseBindings.Primary }],
    });

    // Show/hide threshold dropdown based on selected tool
    if (thresholdDropdownElement) {
      thresholdDropdownElement.style.display = name
        .toLowerCase()
        .includes('threshold')
        ? 'inline-block'
        : 'none';
    }
  },
});

// Store reference to threshold dropdown element
thresholdDropdownElement = addDropdownToToolbar({
  options: {
    values: Array.from(thresholdOptions.keys()),
    defaultValue: defaultThresholdOption,
  },
  onSelectedValueChange: (nameAsStringOrNumber) => {
    const name = String(nameAsStringOrNumber);
    const thresholdArgs = thresholdOptions.get(name);

    segmentationUtils.setBrushThresholdForToolGroup(
      toolGroupId,
      thresholdArgs.threshold,
      thresholdArgs
    );
  },
});

// Initially hide threshold dropdown if first tool doesn't include 'threshold'
if (thresholdDropdownElement) {
  const initialTool = optionsValues[0];
  thresholdDropdownElement.style.display = initialTool
    .toLowerCase()
    .includes('threshold')
    ? 'inline-block'
    : 'none';
}

addSliderToToolbar({
  title: 'Brush Size',
  range: [5, 100],
  defaultValue: DEFAULT_BRUSH_SIZE,
  onSelectedValueChange: (valueAsStringOrNumber) => {
    const value = Number(valueAsStringOrNumber);
    segmentationUtils.setBrushSizeForToolGroup(toolGroupId, value);
  },
});

// ============================= //
addDropdownToToolbar({
  options: { values: ['1', '2'], defaultValue: '1' },
  labelText: 'Segment',
  onSelectedValueChange: (segmentIndex) => {
    segmentation.segmentIndex.setActiveSegmentIndex(
      segmentationId,
      Number(segmentIndex)
    );
  },
});

function displayStat(stat) {
  if (!stat) {
    return;
  }
  return `${stat.label || stat.name}: ${roundNumber(stat.value)} ${
    stat.unit ? stat.unit : ''
  }`;
}

async function calculateStatistics(id, indices) {
  const [viewport] = viewports;
  // const toolGroup = ToolGroupManager.getToolGroup(toolGroupId);
  // const activeName = toolGroup.getActivePrimaryMouseButtonTool();
  // const brush = toolGroup.getToolInstance(activeName);
  const stats = await segmentationUtils.getStatistics({
    segmentationId,
    segmentIndices: indices,
    viewportId: viewport.id,
  });

  if (!stats) {
    return;
  }
  const items = [`Statistics on ${indices.join(', ')}`];
  stats.count.label = 'Voxels';
  // const lesionGlycolysis = {
  //   name: 'Lesion Glycolysis',
  //   value: stats.volume.value * stats.stdDev.value,
  //   unit: 'HU \xB7 mm \xb3',
  // };
  items.push(
    displayStat(stats.volume),
    displayStat(stats.count),
    // displayStat(lesionGlycolysis),
    displayStat(stats.mean),
    displayStat(stats.max),
    displayStat(stats.min)
  );
  const statsDiv = document.getElementById(id);
  statsDiv.innerHTML = items.map((span) => `${span}<br />\n`).join('\n');
}

let timeoutId;

function segmentationModifiedCallback(evt) {
  const { detail } = evt;
  if (!detail || !detail.segmentIndex || detail.segmentIndex === 255) {
    return;
  }

  const statsId = detail.segmentIndex === 1 ? statsIds[0] : statsIds[1];

  const debounced = () => {
    calculateStatistics(statsId, [detail.segmentIndex]);
    // Also update combined stats
    calculateStatistics(statsIds[2], [1, 2]);
  };

  if (timeoutId) {
    window.clearTimeout(timeoutId);
  }

  timeoutId = window.setTimeout(debounced, 1000);
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

  eventTarget.addEventListener(
    Events.SEGMENTATION_DATA_MODIFIED,
    segmentationModifiedCallback
  );
}

/**
 * Runs the demo
 */
async function run() {
  // Init Cornerstone and related libraries
  await initDemo();

  // Add tools to Cornerstone3D
  cornerstoneTools.addTool(RectangleScissorsTool);
  cornerstoneTools.addTool(CircleScissorsTool);
  cornerstoneTools.addTool(SphereScissorsTool);
  cornerstoneTools.addTool(PaintFillTool);
  cornerstoneTools.addTool(BrushTool);

  // Define tool groups to add the segmentation display tool to
  const toolGroup = ToolGroupManager.createToolGroup(toolGroupId);

  // Manipulation Tools
  addManipulationBindings(toolGroup);

  // Segmentation Tools
  toolGroup.addTool(RectangleScissorsTool.toolName);
  toolGroup.addTool(CircleScissorsTool.toolName);
  toolGroup.addTool(SphereScissorsTool.toolName);
  toolGroup.addTool(PaintFillTool.toolName);
  toolGroup.addTool(BrushTool.toolName);

  for (const [toolName, config] of interpolationTools.entries()) {
    if (config.baseTool) {
      toolGroup.addToolInstance(
        toolName,
        config.baseTool,
        config.configuration
      );
    } else {
      toolGroup.addTool(toolName, config.configuration);
    }
    if (config.passive) {
      // This can be applied during add/remove contours
      toolGroup.setToolPassive(toolName);
    }
  }

  toolGroup.setToolActive(interpolationTools.keys().next().value, {
    bindings: [{ mouseButton: MouseBindings.Primary }],
  });

  // Get Cornerstone imageIds for the source data and fetch metadata into RAM
  const imageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.334240657131972136850343327463',
    SeriesInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.226151125820845824875394858561',
    wadoRsRoot:
      getLocalUrl() || 'https://d14fa38qiwhyfd.cloudfront.net/dicomweb',
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

  viewports.push(...renderingEngine.getViewports());

  // Set the volume to load
  volume.load();

  // Set volumes on the viewports
  await setVolumesForViewports(
    renderingEngine,
    [{ volumeId, callback: setCtTransferFunctionForVolumeActor }],
    [viewportId1, viewportId2, viewportId3]
  );

  const segmentationRepresentation = [
    {
      segmentationId,
    },
  ];
  // Add the segmentation representation to the toolgroup
  await segmentation.addLabelmapRepresentationToViewportMap({
    [viewportId1]: segmentationRepresentation,
    [viewportId2]: segmentationRepresentation,
    [viewportId3]: segmentationRepresentation,
  });

  segmentationUtils.setBrushSizeForToolGroup(toolGroupId, DEFAULT_BRUSH_SIZE);

  // Render the image
  renderingEngine.render();
}

run();
