import type { Types } from '@cornerstonejs/core';
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
  addDropdownToToolbar,
  addSliderToToolbar,
  setCtTransferFunctionForVolumeActor,
  getLocalUrl,
  addButtonToToolbar,
  addManipulationBindings,
  labelmapTools,
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
  BrushTool,
  utilities: cstUtils,
} = cornerstoneTools;

const { MouseBindings } = csToolsEnums;
const { ViewportType } = Enums;
const { segmentation: segmentationUtils } = cstUtils;

// Define a unique id for the volume
const volumeName = 'CT_VOLUME_ID'; // Id of the volume less loader prefix
const volumeLoaderScheme = 'cornerstoneStreamingImageVolume'; // Loader id which defines which volume loader to use
const volumeId = `${volumeLoaderScheme}:${volumeName}`; // VolumeId with loader id + volume id
const segmentationId = 'MY_SEGMENTATION_ID';
const toolGroupId = 'MY_TOOLGROUP_ID';

// ======== Set up page ======== //
setTitleAndDescription(
  'Labelmap Segmentation Dynamic Threshold',
  'Here we demonstrate dynamic threshold with preview'
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
const previewColors = {
  0: [255, 255, 255, 128],
  1: [0, 255, 255, 192],
  2: [255, 0, 255, 255],
};

const configuration = {
  preview: {
    enabled: true,
    previewColors,
  },
};

const viewportIds = ['CT_AXIAL', 'CT_SAGITTAL', 'CT_CORONAL'];
const viewportId1 = viewportIds[0];
const viewportId2 = viewportIds[1];
const viewportId3 = viewportIds[2];

const defaultThresholdOption = [...labelmapTools.thresholdOptions.keys()][2];
const thresholdArgs = labelmapTools.thresholdOptions.get(
  defaultThresholdOption
);

interpolationTools.set('ThresholdSphereIsland', {
  baseTool: BrushTool.toolName,
  configuration: {
    ...configuration,
    activeStrategy: 'THRESHOLD_INSIDE_SPHERE_WITH_ISLAND_REMOVAL',
    strategySpecificConfiguration: {
      THRESHOLD: { ...thresholdArgs },
    },
  },
});

interpolationTools.set('ThresholdCircle', {
  baseTool: BrushTool.toolName,
  configuration: {
    ...configuration,
    activeStrategy: 'THRESHOLD_INSIDE_CIRCLE',
    strategySpecificConfiguration: {
      THRESHOLD: { ...thresholdArgs },
    },
  },
});

interpolationTools.set('ThresholdSphere', {
  baseTool: BrushTool.toolName,
  configuration: {
    ...configuration,
    activeStrategy: 'THRESHOLD_INSIDE_SPHERE',
    strategySpecificConfiguration: {
      THRESHOLD: { ...thresholdArgs },
    },
  },
});

const optionsValues = [...interpolationTools.keys()];

// ============================= //
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
  },
});

addDropdownToToolbar({
  options: {
    map: labelmapTools.thresholdOptions,
  },
  onSelectedValueChange: (name, thresholdArgs) => {
    segmentationUtils.setBrushThresholdForToolGroup(
      toolGroupId,
      thresholdArgs.threshold,
      thresholdArgs
    );
  },
});

addSliderToToolbar({
  title: 'Brush Size',
  range: [5, 100],
  defaultValue: 25,
  onSelectedValueChange: (valueAsStringOrNumber) => {
    const value = Number(valueAsStringOrNumber);
    segmentationUtils.setBrushSizeForToolGroup(toolGroupId, value);
  },
});

// ============================= //
addDropdownToToolbar({
  options: { values: ['1', '2', '3'], defaultValue: '1' },
  labelText: 'Segment',
  onSelectedValueChange: (segmentIndex) => {
    segmentation.segmentIndex.setActiveSegmentIndex(
      segmentationId,
      Number(segmentIndex)
    );
  },
});

addButtonToToolbar({
  title: 'Reject Preview',
  onClick: () => {
    const toolGroup = ToolGroupManager.getToolGroup(toolGroupId);
    const activeName = toolGroup.getActivePrimaryMouseButtonTool();
    const brush = toolGroup.getToolInstance(activeName);
    brush.rejectPreview?.(element1);
  },
});

// ============================= //

async function addSegmentationsToState() {
  // Create a segmentation of the same resolution as the source data
  volumeLoader.createAndCacheDerivedLabelmapVolume(volumeId, {
    volumeId: segmentationId,
    // The following doesn't quite work yet
    // TODO, allow RLE to be used instead of scalars.
    voxelRepresentation: Enums.VoxelManagerEnum.RLE,
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
}

/**
 * Runs the demo
 */
async function run() {
  // Init Cornerstone and related libraries
  await initDemo();

  // Add tools to Cornerstone3D
  cornerstoneTools.addTool(BrushTool);

  // Define tool groups to add the segmentation display tool to
  const toolGroup = ToolGroupManager.createToolGroup(toolGroupId);

  // Manipulation Tools
  addManipulationBindings(toolGroup);

  // Segmentation Tools
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
    [{ volumeId, callback: setCtTransferFunctionForVolumeActor }],
    [viewportId1, viewportId2, viewportId3]
  );

  const seg = [{ segmentationId }];
  // Add the segmentation representation to the toolgroup
  await segmentation.addLabelmapRepresentationToViewportMap({
    [viewportId1]: seg,
    [viewportId2]: seg,
    [viewportId3]: seg,
  });

  // Render the image
  renderingEngine.render();
}

run();
