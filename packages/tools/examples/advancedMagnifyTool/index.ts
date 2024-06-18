import {
  RenderingEngine,
  Types,
  Enums,
  cache,
  volumeLoader,
} from '@cornerstonejs/core';
import {
  initDemo,
  createImageIdsAndCacheMetaData,
  setCtTransferFunctionForVolumeActor,
  setTitleAndDescription,
  addDropdownToToolbar,
} from '../../../../utils/demo/helpers/index.js';
import * as cornerstoneTools from '@cornerstonejs/tools';

// This is for debugging purposes
console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const {
  WindowLevelTool,
  StackScrollMouseWheelTool,
  LengthTool,
  ProbeTool,
  RectangleROITool,
  EllipticalROITool,
  CircleROITool,
  BidirectionalTool,
  AngleTool,
  CobbAngleTool,
  ToolGroupManager,
  ArrowAnnotateTool,
  AdvancedMagnifyTool,
  SegmentationDisplayTool,
  segmentation,
  Enums: csToolsEnums,
} = cornerstoneTools;

const { ViewportType } = Enums;
const { MouseBindings, KeyboardBindings } = csToolsEnums;
const renderingEngineId = 'myRenderingEngine';
const segmentationId = 'SEGMENTATION_ID_1';
const volumeName = 'CT_VOLUME_ID'; // Id of the volume less loader prefix
const volumeLoaderScheme = 'cornerstoneStreamingImageVolume'; // Loader id which defines which volume loader to use
const volumeId = `${volumeLoaderScheme}:${volumeName}`; // VolumeId with loader id + volume id
const toolGroupIds = new Set<string>();

const viewportsInfo = [
  {
    toolGroupId: 'STACK_TOOLGROUP_ID',
    segmentationEnabled: false,
    viewportInput: {
      viewportId: 'CT_STACK_AXIAL',
      type: ViewportType.STACK,
      element: null,
      defaultOptions: {
        background: <Types.Point3>[0.2, 0, 0.2],
      },
    },
  },
  {
    toolGroupId: 'VOLUME_TOOLGROUP_ID',
    viewportInput: {
      viewportId: 'CT_VOLUME_SAGITTAL',
      type: ViewportType.ORTHOGRAPHIC,
      element: null,
      defaultOptions: {
        orientation: Enums.OrientationAxis.SAGITTAL,
        background: <Types.Point3>[0.2, 0, 0.2],
      },
    },
  },
  {
    toolGroupId: 'VOLUME_TOOLGROUP_ID',
    viewportInput: {
      viewportId: 'CT_VOLUME_CORONAL',
      type: ViewportType.ORTHOGRAPHIC,
      element: null,
      defaultOptions: {
        orientation: Enums.OrientationAxis.CORONAL,
        background: <Types.Point3>[0.2, 0, 0.2],
      },
    },
  },
];

// ======== Set up page ======== //
setTitleAndDescription(
  'Advanced Magnifying Glass',
  'Advanced magnifying glass that works on stack and volume viewports'
);

const content = document.getElementById('content');
const viewportGrid = document.createElement('div');

viewportGrid.style.display = 'grid';
viewportGrid.style.gridTemplateColumns = `auto auto auto`;
viewportGrid.style.width = '100%';
viewportGrid.style.height = '500px';
viewportGrid.style.paddingTop = '5px';
viewportGrid.style.gap = '5px';

content.appendChild(viewportGrid);

const info = document.createElement('div');
content.appendChild(info);

const addInstruction = (instruction) => {
  const node = document.createElement('p');
  node.innerText = instruction;
  info.appendChild(node);
};

addInstruction(
  'Viewports: Stack/Axial (left) | Volume/Sagittal + Segmentation (middle) | Volume/Coronal + Segmentation (right)'
);
addInstruction('Left Click to use selected tool');
addInstruction('Ctrl + Left Click to activate the magnifying glass');
addInstruction(
  'Shift + Right Click close to the magnifying glass border to change the zoom factor'
);
addInstruction('Click + Drag on the magnifying glass border to move it');

// ============================= //

const toolsNames = [
  LengthTool.toolName,
  ProbeTool.toolName,
  RectangleROITool.toolName,
  EllipticalROITool.toolName,
  CircleROITool.toolName,
  BidirectionalTool.toolName,
  AngleTool.toolName,
  CobbAngleTool.toolName,
  ArrowAnnotateTool.toolName,
];
let selectedToolName = toolsNames[0];

addDropdownToToolbar({
  options: { values: toolsNames, defaultValue: selectedToolName },
  onSelectedValueChange: (newSelectedToolNameAsStringOrNumber) => {
    const newSelectedToolName = String(newSelectedToolNameAsStringOrNumber);

    Array.from(toolGroupIds).forEach((toolGroupId) => {
      const toolGroup = ToolGroupManager.getToolGroup(toolGroupId);

      // Set the new tool active
      toolGroup.setToolActive(newSelectedToolName, {
        bindings: [
          {
            mouseButton: MouseBindings.Primary, // Left Click
          },
        ],
      });

      // Set the old tool passive
      toolGroup.setToolPassive(selectedToolName);
    });

    selectedToolName = <string>newSelectedToolName;
  },
});

/**
 * Adds two concentric circles to each axial slice of the demo segmentation.
 */
function fillSegmentationWithCircles(segmentationVolume, centerOffset) {
  const scalarData = segmentationVolume.scalarData;

  const { dimensions } = segmentationVolume;
  const pixelsPerSlice = dimensions[0] * dimensions[1];

  const innerRadius = dimensions[0] / 32;
  const outerRadius = dimensions[0] / 16;

  const center = [
    dimensions[0] / 2 + centerOffset[0],
    dimensions[1] / 2 + centerOffset[1],
    dimensions[2] / 2 + centerOffset[2],
  ];

  const [cX, cY, cZ] = center;

  for (let z = 0; z < dimensions[2]; z++) {
    for (let y = 0; y < dimensions[1]; y++) {
      for (let x = 0; x < dimensions[0]; x++) {
        const voxelIndex = z * pixelsPerSlice + y * dimensions[0] + x;
        const distanceFromCenter = Math.sqrt(
          (x - cX) * (x - cX) + (y - cY) * (y - cY) + (z - cZ) * (z - cZ)
        );

        if (distanceFromCenter < innerRadius) {
          scalarData[voxelIndex] = 1;
        } else if (distanceFromCenter < outerRadius) {
          scalarData[voxelIndex] = 2;
        }
      }
    }
  }
}

async function addSegmentationsToState(volumeId: string) {
  let segmentationVolume = cache.getVolume(segmentationId);

  if (segmentationVolume) {
    return;
  }

  // Create a segmentation of the same resolution as the source data
  // using volumeLoader.createAndCacheDerivedVolume.
  segmentationVolume = await volumeLoader.createAndCacheDerivedVolume(
    volumeId,
    {
      volumeId: segmentationId,
    }
  );
  // Add the segmentations to state
  segmentation.addSegmentations([
    {
      segmentationId: segmentationId,
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

  // Add some data to the segmentations
  fillSegmentationWithCircles(segmentationVolume, [0, 0, 0]);
}

async function initializeVolumeViewport(
  viewport: Types.IVolumeViewport,
  volumeId: string,
  imageIds: string[]
) {
  let volume = cache.getVolume(volumeId) as any;

  if (!volume) {
    volume = await volumeLoader.createAndCacheVolume(volumeId, {
      imageIds,
    });

    // Set the volume to load
    volume.load();

    // Add some segmentations based on the source data volume
    await addSegmentationsToState(volumeId);
  }

  // Set the volume on the viewport
  await viewport.setVolumes([
    { volumeId, callback: setCtTransferFunctionForVolumeActor },
  ]);

  return volume;
}

async function initializeViewport(
  renderingEngine,
  toolGroup,
  viewportInfo,
  imageIds
) {
  const { viewportInput } = viewportInfo;
  const element = document.createElement('div');

  // Disable right click context menu so we can have right click tools
  element.oncontextmenu = (e) => e.preventDefault();

  element.id = viewportInput.viewportId;
  element.style.overflow = 'hidden';

  viewportInput.element = element;
  viewportGrid.appendChild(element);

  const { viewportId } = viewportInput;
  const { id: renderingEngineId } = renderingEngine;

  renderingEngine.enableElement(viewportInput);

  // Set the tool group on the viewport
  toolGroup.addViewport(viewportId, renderingEngineId);

  // Get the stack viewport that was created
  const viewport = <Types.IViewport>renderingEngine.getViewport(viewportId);

  if (viewportInput.type === ViewportType.STACK) {
    // Set the stack on the viewport
    (<Types.IStackViewport>viewport).setStack(imageIds);
  } else if (viewportInput.type === ViewportType.ORTHOGRAPHIC) {
    await initializeVolumeViewport(
      viewport as Types.IVolumeViewport,
      volumeId,
      imageIds
    );

    // Add the segmentation representations to toolgroup1
    await segmentation.addSegmentationRepresentations(toolGroup.id, [
      {
        segmentationId,
        type: csToolsEnums.SegmentationRepresentations.Labelmap,
      },
    ]);
  } else {
    throw new Error('Invalid viewport type');
  }
}

function initializeToolGroup(toolGroupId, segmentationEnabled = true) {
  let toolGroup = ToolGroupManager.getToolGroup(toolGroupId);

  if (toolGroup) {
    return toolGroup;
  }

  // Define a tool group, which defines how mouse events map to tool commands for
  // Any viewport using the group
  toolGroup = ToolGroupManager.createToolGroup(toolGroupId);

  // Add the tools to the tool group
  toolGroup.addTool(WindowLevelTool.toolName);
  toolGroup.addTool(StackScrollMouseWheelTool.toolName);
  toolGroup.addTool(LengthTool.toolName);
  toolGroup.addTool(ProbeTool.toolName);
  toolGroup.addTool(RectangleROITool.toolName);
  toolGroup.addTool(EllipticalROITool.toolName);
  toolGroup.addTool(CircleROITool.toolName);
  toolGroup.addTool(BidirectionalTool.toolName);
  toolGroup.addTool(AngleTool.toolName);
  toolGroup.addTool(CobbAngleTool.toolName);
  toolGroup.addTool(ArrowAnnotateTool.toolName);
  toolGroup.addTool(AdvancedMagnifyTool.toolName);

  if (segmentationEnabled) {
    toolGroup.addTool(SegmentationDisplayTool.toolName);
    toolGroup.setToolEnabled(SegmentationDisplayTool.toolName);
  }

  // Set the initial state of the tools, here we set one tool active on left click.
  // This means left click will draw that tool.
  // toolGroup.setToolActive(LengthTool.toolName, {
  toolGroup.setToolActive(LengthTool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Primary, // Left Click
      },
    ],
  });

  toolGroup.setToolActive(WindowLevelTool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Secondary, // Right Click
      },
    ],
  });

  toolGroup.setToolActive(AdvancedMagnifyTool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Primary, // Left Click
        modifierKey: KeyboardBindings.Ctrl,
      },
    ],
  });

  // As the Stack Scroll mouse wheel is a tool using the `mouseWheelCallback`
  // hook instead of mouse buttons, it does not need to assign any mouse button.
  toolGroup.setToolActive(StackScrollMouseWheelTool.toolName);

  // We set all the other tools passive here, this means that any state is rendered, and editable
  // But aren't actively being drawn (see the toolModes example for information)
  toolGroup.setToolPassive(ProbeTool.toolName);
  toolGroup.setToolPassive(RectangleROITool.toolName);
  toolGroup.setToolPassive(EllipticalROITool.toolName);
  toolGroup.setToolPassive(CircleROITool.toolName);
  toolGroup.setToolPassive(BidirectionalTool.toolName);
  toolGroup.setToolPassive(AngleTool.toolName);
  toolGroup.setToolPassive(CobbAngleTool.toolName);
  toolGroup.setToolPassive(ArrowAnnotateTool.toolName);

  return toolGroup;
}

/**
 * Runs the demo
 */
async function run() {
  // Init Cornerstone and related libraries
  await initDemo();

  // Add tools to Cornerstone3D
  cornerstoneTools.addTool(SegmentationDisplayTool);

  // Add tools to Cornerstone3D
  cornerstoneTools.addTool(WindowLevelTool);
  cornerstoneTools.addTool(StackScrollMouseWheelTool);
  cornerstoneTools.addTool(LengthTool);
  cornerstoneTools.addTool(ProbeTool);
  cornerstoneTools.addTool(RectangleROITool);
  cornerstoneTools.addTool(EllipticalROITool);
  cornerstoneTools.addTool(CircleROITool);
  cornerstoneTools.addTool(BidirectionalTool);
  cornerstoneTools.addTool(AngleTool);
  cornerstoneTools.addTool(CobbAngleTool);
  cornerstoneTools.addTool(ArrowAnnotateTool);
  cornerstoneTools.addTool(AdvancedMagnifyTool);

  const imageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.334240657131972136850343327463',
    SeriesInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.226151125820845824875394858561',
    wadoRsRoot: 'https://d3t6nz73ql33tx.cloudfront.net/dicomweb',
  });

  // Instantiate a rendering engine
  const renderingEngine = new RenderingEngine(renderingEngineId);

  for (let i = 0; i < viewportsInfo.length; i++) {
    const viewportInfo = viewportsInfo[i];
    const { toolGroupId, segmentationEnabled = true } = viewportInfo;
    const toolGroup = initializeToolGroup(toolGroupId, segmentationEnabled);

    toolGroupIds.add(toolGroupId);

    await initializeViewport(
      renderingEngine,
      toolGroup,
      viewportInfo,
      imageIds
    );
  }
}

run();
