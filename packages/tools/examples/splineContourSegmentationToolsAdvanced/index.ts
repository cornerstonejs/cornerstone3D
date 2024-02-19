import {
  Enums,
  RenderingEngine,
  setVolumesForViewports,
  Types,
  volumeLoader,
} from '@cornerstonejs/core';
import * as cornerstoneTools from '@cornerstonejs/tools';
import {
  addButtonToToolbar,
  addSliderToToolbar,
  addDropdownToToolbar,
  addToggleButtonToToolbar,
  createImageIdsAndCacheMetaData,
  createInfoSection,
  initDemo,
  setTitleAndDescription,
} from '../../../../utils/demo/helpers';
import type { Types as cstTypes } from '@cornerstonejs/tools';

// This is for debugging purposes
console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const DEFAULT_SEGMENT_CONFIG = {
  fillAlpha: 0.5,
  fillAlphaInactive: 0.3,
  outlineOpacity: 1,
  outlineOpacityInactive: 0.85,
  outlineWidthActive: 3,
  outlineWidthInactive: 2,
  outlineDashActive: undefined,
  outlineDashInactive: undefined,
};

const {
  SplineContourSegmentationTool,
  SegmentationDisplayTool,
  PlanarFreehandContourSegmentationTool,
  ToolGroupManager,
  Enums: csToolsEnums,
  segmentation,
  ZoomTool,
  PanTool,
  StackScrollMouseWheelTool,
  TrackballRotateTool,
} = cornerstoneTools;
const { MouseBindings } = csToolsEnums;
const { ViewportType } = Enums;

// Define a unique id for the volume
const volumeName = 'CT_VOLUME_ID'; // Id of the volume less loader prefix
const volumeLoaderScheme = 'cornerstoneStreamingImageVolume'; // Loader id which defines which volume loader to use
const volumeId = `${volumeLoaderScheme}:${volumeName}`; // VolumeId with loader id + volume id
const stackToolGroupId = 'STACK_TOOLGROUP_ID';
const volumeToolGroupId = 'VOLUME_TOOLGROUP_ID';
const toolGroupIds = [stackToolGroupId, volumeToolGroupId];

let segmentationSequenceId = 1;
const segmentationIds = [];
const segmentationRepresentationUIDs = toolGroupIds.reduce((acc, cur) => {
  acc[cur] = [];
  return acc;
}, {});
const segmentationsDropDownId = 'SEGMENTATION_DROPDOWN';
const segmentIndexes = [1, 2, 3, 4, 5];
const segmentVisibilityMap = new Map();
let activeSegmentationId = '';
let activeSegmentIndex = 1;

// ======== Set up page ======== //

setTitleAndDescription(
  'Spline Segmentation ROI Tool (Advanced)',
  'Here we demonstrate how to use spline segmentation ROI tools on multiple ' +
    'viewports (stack and volume), segmentations and different styles for ' +
    'active and inactive states'
);

const size = '500px';
const content = document.getElementById('content');
const viewportGrid = document.createElement('div');

viewportGrid.style.display = 'flex';
viewportGrid.style.flexDirection = 'row';

const numViewports = 3;
const viewportIds = [
  'CT_STACK_AXIAL',
  'CT_VOLUME_CORONAL',
  'CT_VOLUME_SAGITTAL',
];
const elements = new Array(numViewports);

for (let i = 0; i < numViewports; i++) {
  const element = document.createElement('div');

  element.oncontextmenu = () => false;
  element.style.width = size;
  element.style.height = size;
  elements[i] = element;

  viewportGrid.appendChild(element);
}

content.appendChild(viewportGrid);

createInfoSection(content)
  .addInstruction('Select a segmentation index')
  .addInstruction('Select a spline curve type')

  .addInstruction('Draw a spline curve on one or more viewports')
  .openNestedSection()
  .addInstruction('Left: axial/stack')
  .addInstruction('Right: coronal/volume')
  .addInstruction('Middle: sagittal/volume')
  .closeNestedSection()

  .addInstruction('Repeat the steps 1-3 as many times as you want')
  .addInstruction(
    'Notice that each segment index has a different color assigned to it'
  )

  .addInstruction('Change the style for the current segmentation')
  .openNestedSection()
  .addInstruction(
    'Change the style for both scenarios, active and inactive, as desired'
  )
  .closeNestedSection()

  .addInstruction('Click on "Add Segmentation"')
  .openNestedSection()
  .addInstruction('The new segmentation shall be the active one')
  .closeNestedSection()

  .addInstruction('Confirm the active/inactive style is applied properly');

function updateSegmentationDropdownOptions(activeSegmentationId) {
  const dropdown = document.getElementById(
    segmentationsDropDownId
  ) as HTMLSelectElement;

  dropdown.innerHTML = '';

  segmentationIds.forEach((segmentationId, i) => {
    const option: HTMLOptionElement = document.createElement('option');
    option.value = segmentationId;
    option.title = segmentationId;
    option.label = `Segmentation ${i + 1}`;
    dropdown.appendChild(option);
  });

  if (activeSegmentationId) {
    dropdown.value = activeSegmentationId;
  }
}

function updateInputsForCurrentSegmentation() {
  // We can use any toolGroupId because they are all configured in the same way
  const segmentationConfig = getCurrentSegmentationConfig(stackToolGroupId);
  const contourConfig = segmentationConfig.CONTOUR;

  (document.getElementById('outlineWidthActive') as HTMLInputElement).value =
    String(
      contourConfig.outlineWidthActive ??
        DEFAULT_SEGMENT_CONFIG.outlineWidthActive
    );

  (document.getElementById('outlineWidthInactive') as HTMLInputElement).value =
    String(
      contourConfig.outlineWidthInactive ??
        DEFAULT_SEGMENT_CONFIG.outlineWidthInactive
    );

  (document.getElementById('outlineOpacity') as HTMLInputElement).value =
    String(
      contourConfig.outlineOpacity ?? DEFAULT_SEGMENT_CONFIG.outlineOpacity
    );

  (
    document.getElementById('outlineOpacityInactive') as HTMLInputElement
  ).value = String(
    contourConfig.outlineOpacityInactive ??
      DEFAULT_SEGMENT_CONFIG.outlineOpacityInactive
  );

  (document.getElementById('fillAlpha') as HTMLInputElement).value = String(
    contourConfig.fillAlpha ?? DEFAULT_SEGMENT_CONFIG.fillAlpha
  );

  (document.getElementById('fillAlphaInactive') as HTMLInputElement).value =
    String(
      contourConfig.fillAlphaInactive ??
        DEFAULT_SEGMENT_CONFIG.fillAlphaInactive
    );

  (document.getElementById('outlineDashActive') as HTMLInputElement).value =
    String(
      contourConfig.outlineDashActive?.split(',')[0] ??
        DEFAULT_SEGMENT_CONFIG.outlineDashActive?.split(',')[0] ??
        '0'
    );

  (document.getElementById('outlineDashInactive') as HTMLInputElement).value =
    String(
      contourConfig.outlineDashInactive?.split(',')[0] ??
        DEFAULT_SEGMENT_CONFIG.outlineDashInactive?.split(',')[0] ??
        '0'
    );
}

async function addNewSegmentation() {
  const newSegmentationId = `SEGMENTATION_${segmentationSequenceId++}`;

  segmentation.addSegmentations([
    {
      segmentationId: newSegmentationId,
      representation: {
        type: csToolsEnums.SegmentationRepresentations.Contour,
      },
    },
  ]);

  // Add the segmentation representation to the toolgroup

  for (let i = 0; i < toolGroupIds.length; i++) {
    const toolGroupId = toolGroupIds[i];
    const [uid] = await segmentation.addSegmentationRepresentations(
      toolGroupId,
      [
        {
          segmentationId: newSegmentationId,
          type: csToolsEnums.SegmentationRepresentations.Contour,
        },
      ]
    );

    segmentationRepresentationUIDs[toolGroupId].push(uid);
  }

  // Update global state
  segmentationIds.push(newSegmentationId);
  activeSegmentationId = newSegmentationId;

  updateSegmentationDropdownOptions(newSegmentationId);
  updateActiveSegmentationState();
}

function updateActiveSegmentationState() {
  const index = segmentationIds.indexOf(activeSegmentationId);

  toolGroupIds.forEach((toolGroupId) => {
    const uid = segmentationRepresentationUIDs[toolGroupId][index];

    segmentation.activeSegmentation.setActiveSegmentationRepresentation(
      toolGroupId,
      uid
    );
  });

  segmentation.segmentIndex.setActiveSegmentIndex(
    activeSegmentationId,
    activeSegmentIndex
  );

  updateInputsForCurrentSegmentation();
}

function getSegmentsVisibilityState(activeSegmentationId: string) {
  let segmentsVisibility = segmentVisibilityMap.get(activeSegmentationId);

  if (!segmentsVisibility) {
    segmentsVisibility = new Array(segmentIndexes.length + 1).fill(true);
    segmentVisibilityMap.set(activeSegmentationId, segmentsVisibility);
  }

  return segmentsVisibility;
}

function getCurrentSegmentationConfig(
  toolGroupdId: string
): cstTypes.RepresentationConfig {
  const segmentationIndex = segmentationIds.indexOf(activeSegmentationId);

  const segmentationRepresentationUID =
    segmentationRepresentationUIDs[toolGroupdId][segmentationIndex];

  const segmentationConfig =
    segmentation.config.getSegmentationRepresentationSpecificConfig(
      toolGroupdId,
      segmentationRepresentationUID
    ) ?? {};

  // Add CONTOUR object because getSegmentationRepresentationSpecificConfig
  // can return an empty object
  if (!segmentationConfig.CONTOUR) {
    segmentationConfig.CONTOUR = {};
  }

  return segmentationConfig;
}

function updateCurrentSegmentationConfig(config) {
  const segmentationIndex = segmentationIds.indexOf(activeSegmentationId);

  toolGroupIds.forEach((toolGroupId) => {
    const segmentationRepresentationUID =
      segmentationRepresentationUIDs[toolGroupId][segmentationIndex];

    const segmentationConfig = getCurrentSegmentationConfig(toolGroupId);

    Object.assign(segmentationConfig.CONTOUR, config);

    segmentation.config.setSegmentationRepresentationSpecificConfig(
      toolGroupId,
      segmentationRepresentationUID,
      segmentationConfig
    );
  });
}

// ============================= //

const cancelDrawingEventListener = (evt) => {
  const { element, key } = evt.detail;
  if (key === 'Escape') {
    cornerstoneTools.cancelActiveManipulations(element);
  }
};

elements.forEach((element) => {
  element.addEventListener(
    csToolsEnums.Events.KEY_DOWN,
    cancelDrawingEventListener
  );
});

const Splines = {
  CatmullRomSplineROI: {
    splineType: SplineContourSegmentationTool.SplineTypes.CatmullRom,
  },
  LinearSplineROI: {
    splineType: SplineContourSegmentationTool.SplineTypes.Linear,
  },
  BSplineROI: {
    splineType: SplineContourSegmentationTool.SplineTypes.BSpline,
  },
};

const SplineToolNames = Object.keys(Splines);
const splineToolsNames = [...SplineToolNames];
let selectedToolName = splineToolsNames[0];

addButtonToToolbar({
  title: 'Add Segmentation',
  onClick: async () => addNewSegmentation(),
});

addDropdownToToolbar({
  id: segmentationsDropDownId,
  labelText: 'Active Segmentation',
  options: { values: [], defaultValue: '' },
  onSelectedValueChange: (nameAsStringOrNumber) => {
    activeSegmentationId = String(nameAsStringOrNumber);
    updateActiveSegmentationState();
  },
});

addDropdownToToolbar({
  labelText: 'Segment Index',
  options: { values: segmentIndexes, defaultValue: segmentIndexes[0] },
  onSelectedValueChange: (nameAsStringOrNumber) => {
    activeSegmentIndex = Number(nameAsStringOrNumber);
    updateActiveSegmentationState();
  },
});

addDropdownToToolbar({
  options: { values: splineToolsNames, defaultValue: selectedToolName },
  onSelectedValueChange: (newSelectedToolNameAsStringOrNumber) => {
    const newSelectedToolName = String(newSelectedToolNameAsStringOrNumber);
    const toolGroup = ToolGroupManager.getToolGroup(stackToolGroupId);

    // Set the old tool passive
    toolGroup.setToolPassive(selectedToolName);

    // Set the new tool active
    toolGroup.setToolActive(newSelectedToolName, {
      bindings: [
        {
          mouseButton: MouseBindings.Primary, // Left Click
        },
      ],
    });

    selectedToolName = <string>newSelectedToolName;
  },
});

addToggleButtonToToolbar({
  title: 'Show/Hide All Segments',
  onClick: function (toggle) {
    const segmentationIndex = segmentationIds.indexOf(activeSegmentationId);
    const segmentsVisibility = getSegmentsVisibilityState(activeSegmentationId);

    toolGroupIds.forEach((toolGroupId) => {
      const segmentationRepresentationUID =
        segmentationRepresentationUIDs[toolGroupId][segmentationIndex];

      segmentation.config.visibility.setSegmentationVisibility(
        toolGroupId,
        segmentationRepresentationUID,
        !toggle
      );
    });

    segmentsVisibility.fill(!toggle);
  },
});

addButtonToToolbar({
  title: 'Show/Hide Current Segment',
  onClick: function () {
    const segmentationIndex = segmentationIds.indexOf(activeSegmentationId);
    const segmentsVisibility = getSegmentsVisibilityState(activeSegmentationId);
    const visible = !segmentsVisibility[activeSegmentIndex];

    toolGroupIds.forEach((toolGroupId) => {
      const representationUID =
        segmentationRepresentationUIDs[toolGroupId][segmentationIndex];

      segmentation.config.visibility.setSegmentVisibility(
        toolGroupId,
        representationUID,
        activeSegmentIndex,
        visible
      );
    });

    segmentsVisibility[activeSegmentIndex] = visible;
  },
});

addSliderToToolbar({
  id: 'outlineWidthActive',
  title: 'Outline Thickness (active)',
  range: [0.1, 10],
  step: 0.1,
  defaultValue: 1,
  onSelectedValueChange: (value) => {
    updateCurrentSegmentationConfig({ outlineWidthActive: Number(value) });
  },
});

addSliderToToolbar({
  id: 'outlineWidthInactive',
  title: 'Outline Thickness  (inactive)',
  range: [0.1, 10],
  step: 0.1,
  defaultValue: 1,
  onSelectedValueChange: (value) => {
    updateCurrentSegmentationConfig({ outlineWidthInactive: Number(value) });
  },
});

addSliderToToolbar({
  id: 'outlineOpacity',
  title: 'Outline Opacity (active)',
  range: [0, 1],
  step: 0.05,
  defaultValue: 1,
  onSelectedValueChange: (value) => {
    updateCurrentSegmentationConfig({ outlineOpacity: Number(value) });
  },
});

addSliderToToolbar({
  id: 'outlineOpacityInactive',
  title: 'Outline Opacity (inactive)',
  range: [0, 1],
  step: 0.05,
  defaultValue: 1,
  onSelectedValueChange: (value) => {
    updateCurrentSegmentationConfig({ outlineOpacityInactive: Number(value) });
  },
});

addSliderToToolbar({
  id: 'fillAlpha',
  title: 'Fill Alpha (active)',
  range: [0, 1],
  step: 0.05,
  defaultValue: 0.5,
  onSelectedValueChange: (value) => {
    updateCurrentSegmentationConfig({ fillAlpha: Number(value) });
  },
});

addSliderToToolbar({
  id: 'fillAlphaInactive',
  title: 'Fill Alpha (inactive)',
  range: [0, 1],
  step: 0.05,
  defaultValue: 0.5,
  onSelectedValueChange: (value) => {
    updateCurrentSegmentationConfig({ fillAlphaInactive: Number(value) });
  },
});

addSliderToToolbar({
  id: 'outlineDashActive',
  title: 'Outline Dash (active)',
  range: [0, 10],
  step: 1,
  defaultValue: 0,
  onSelectedValueChange: (value) => {
    const outlineDash = value === '0' ? undefined : `${value},${value}`;
    updateCurrentSegmentationConfig({ outlineDashActive: outlineDash });
  },
});

addSliderToToolbar({
  id: 'outlineDashInactive',
  title: 'Outline Dash (inactive)',
  range: [0, 10],
  step: 1,
  defaultValue: 0,
  onSelectedValueChange: (value) => {
    const outlineDash = value === '0' ? undefined : `${value},${value}`;
    updateCurrentSegmentationConfig({ outlineDashInactive: outlineDash });
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
  cornerstoneTools.addTool(SplineContourSegmentationTool);
  cornerstoneTools.addTool(PanTool);
  cornerstoneTools.addTool(ZoomTool);
  cornerstoneTools.addTool(StackScrollMouseWheelTool);
  cornerstoneTools.addTool(TrackballRotateTool);

  // Define tool groups to add the segmentation display tool to
  const stackToolGroup = ToolGroupManager.createToolGroup(stackToolGroupId);
  const volumeToolGroup = ToolGroupManager.createToolGroup(volumeToolGroupId);

  [stackToolGroup, volumeToolGroup].forEach((toolGroup) => {
    toolGroup.addTool(SegmentationDisplayTool.toolName);
    toolGroup.addTool(PlanarFreehandContourSegmentationTool.toolName);
    toolGroup.addTool(SplineContourSegmentationTool.toolName);
    toolGroup.addTool(StackScrollMouseWheelTool.toolName);
    toolGroup.addTool(PanTool.toolName);
    toolGroup.addTool(ZoomTool.toolName);

    toolGroup.addToolInstance(
      'CatmullRomSplineROI',
      SplineContourSegmentationTool.toolName,
      {
        spline: {
          type: SplineContourSegmentationTool.SplineTypes.CatmullRom,
        },
      }
    );

    toolGroup.addToolInstance(
      'LinearSplineROI',
      SplineContourSegmentationTool.toolName,
      {
        spline: {
          type: SplineContourSegmentationTool.SplineTypes.Linear,
        },
      }
    );

    toolGroup.addToolInstance(
      'BSplineROI',
      SplineContourSegmentationTool.toolName,
      {
        spline: {
          type: SplineContourSegmentationTool.SplineTypes.BSpline,
        },
      }
    );

    toolGroup.setToolEnabled(SegmentationDisplayTool.toolName);

    toolGroup.setToolActive(splineToolsNames[0], {
      bindings: [
        {
          mouseButton: MouseBindings.Primary, // Left Click
        },
      ],
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

    toolGroup.setToolActive(StackScrollMouseWheelTool.toolName);
    toolGroup.setToolPassive(PlanarFreehandContourSegmentationTool.toolName);
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
  const renderingEngine = new RenderingEngine(renderingEngineId);

  // Create the viewports
  const viewportInputArray = [
    {
      viewportId: viewportIds[0],
      type: ViewportType.STACK,
      element: elements[0],
      defaultOptions: {
        background: <Types.Point3>[0.2, 0, 0.2],
      },
    },
    {
      viewportId: viewportIds[1],
      type: ViewportType.ORTHOGRAPHIC,
      element: elements[1],
      defaultOptions: {
        orientation: Enums.OrientationAxis.CORONAL,
        background: <Types.Point3>[0.2, 0, 0.2],
      },
    },
    {
      viewportId: viewportIds[2],
      type: ViewportType.ORTHOGRAPHIC,
      element: elements[2],
      defaultOptions: {
        orientation: Enums.OrientationAxis.SAGITTAL,
        background: <Types.Point3>[0.2, 0, 0.2],
      },
    },
  ];

  renderingEngine.setViewports(viewportInputArray);

  stackToolGroup.addViewport(viewportIds[0], renderingEngineId);
  volumeToolGroup.addViewport(viewportIds[1], renderingEngineId);
  volumeToolGroup.addViewport(viewportIds[2], renderingEngineId);

  // Set the volume to load
  volume.load();

  // Get the stack viewport that was created
  const stackViewport = <Types.IStackViewport>(
    renderingEngine.getViewport(viewportIds[0])
  );

  // Set the stack on the viewport
  stackViewport.setStack(imageIds);

  // Set volumes on the viewports
  await setVolumesForViewports(
    renderingEngine,
    [{ volumeId }],
    viewportIds.slice(1)
  );

  // Render the image
  renderingEngine.render();

  // Add the first segmentation that can be edited by the user
  addNewSegmentation();

  // Get the entire global segmentation configuration,
  // update it and set as the new default config
  const globalSegmentationConfig = segmentation.config.getGlobalConfig();

  Object.assign(
    globalSegmentationConfig.representations.CONTOUR,
    DEFAULT_SEGMENT_CONFIG
  );

  segmentation.config.setGlobalConfig(globalSegmentationConfig);
  updateInputsForCurrentSegmentation();
}

run();
