import {
  RenderingEngine,
  Types,
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
} from '../../../../utils/demo/helpers';
import * as cornerstoneTools from '@cornerstonejs/tools';
import { debounce } from '../../src/utilities';

// This is for debugging purposes
console.warn(
  'Click on index.ts to open the source code for this example --------->'
);

const {
  SegmentationDisplayTool,
  ToolGroupManager,
  Enums: csToolsEnums,
  segmentation,
  PanTool,
  ZoomTool,
  StackScrollMouseWheelTool,
  ThresholdPreviewTool,
} = cornerstoneTools;

const { MouseBindings } = csToolsEnums;
const { ViewportType } = Enums;

// Define a unique id for the volume
const VOLUME_NAME = 'CT_VOLUME_ID'; // Id of the volume less loader prefix
const VOLUME_LOADER_SCHEME = 'cornerstoneStreamingImageVolume'; // Loader id which defines which volume loader to use
const VOLUME_ID = `${VOLUME_LOADER_SCHEME}:${VOLUME_NAME}`; // VolumeId with loader id + volume id
const segmentationId = 'MY_SEGMENTATION_ID';
const toolGroupId = 'MY_TOOLGROUP_ID';
const THRESHOLD_RANGE = [-2000, 2000];
const LOWER_THRESHOLD = -150;
const UPPER_THRESHOLD = -70;
const thresholdOptions = [
  'CT Fat: (-150, -70)',
  'CT Bone: (200, 1000)',
  'Adipose: (-190, -30)',
  'Muscle: (-29, 150)',
];
const debounceWaitTime = 1000;

// ======== Set up page ======== //
setTitleAndDescription(
  'Threshold preview Tool',
  'Here we demonstrate threshold preview tool'
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

const lowerThresholdValueElement = document.createElement('p');
const upperThresholdValueElement = document.createElement('p');

lowerThresholdValueElement.innerText = `Lower Threshold Value: ${LOWER_THRESHOLD}`;
upperThresholdValueElement.innerText = `Upper Threshold Value: ${UPPER_THRESHOLD}`;

content.append(lowerThresholdValueElement);
content.append(upperThresholdValueElement);

const instructions = document.createElement('p');
instructions.innerText = `
  Left Click: Use selected Segmentation Tool.
  Middle Click: Pan
  Right Click: Zoom
  Mouse wheel: Scroll Stack
  `;

content.append(instructions);

type ThresholdElementsValue = string | number | undefined | null;

/**
 * Updates the threshold elements value
 * @param newThreshold - [string, string] lower and upper threshold values
 * @returns void *
 */
const updateThresholdElementsValue = (
  newThreshold: [ThresholdElementsValue, ThresholdElementsValue]
) => {
  const [lowerThreshold, upperThreshold] = newThreshold;

  if (lowerThreshold !== undefined && lowerThreshold !== null) {
    lowerThresholdValueElement.innerText = `Lower Threshold Value: ${lowerThreshold}`;
  }
  if (upperThreshold !== undefined && upperThreshold !== null) {
    upperThresholdValueElement.innerText = `Upper Threshold Value: ${upperThreshold}`;
  }
};

// ============================= //

// https://www.ncbi.nlm.nih.gov/pmc/articles/PMC4309522/

/**
 * Debounced function to set the threshold
 * @param values - The values to set the threshold to (lower, upper)
 * @param thresholdToUpdate - The threshold to update (lower, upper, both)
 * @returns void
 */
const debouncedSetThreshold = debounce(
  (
    newThreshold: [string, string],
    thresholdToUpdate: 'lower' | 'upper' | 'both'
  ): void => {
    const toolGroup = ToolGroupManager.getToolGroup(toolGroupId);
    const labelmapThresholdPreview = toolGroup.getToolInstance(
      'LabelmapThresholdPreview'
    );
    const [currentLowerThreshold, currentUpperThreshold] =
      labelmapThresholdPreview.getThreshold();
    const [newLowerThreshold, newUpperThreshold] = newThreshold;

    if (thresholdToUpdate === 'lower') {
      labelmapThresholdPreview.setThreshold([
        Number.parseInt(newLowerThreshold),
        currentUpperThreshold,
      ]);
    } else if (thresholdToUpdate === 'upper') {
      labelmapThresholdPreview.setThreshold([
        currentLowerThreshold,
        Number.parseInt(newUpperThreshold),
      ]);
    } else if (thresholdToUpdate === 'both') {
      labelmapThresholdPreview.setThreshold([
        Number.parseInt(newLowerThreshold),
        Number.parseInt(newUpperThreshold),
      ]);
    }
  },
  500
); // Adjust the debounce delay as needed

addDropdownToToolbar({
  options: { values: thresholdOptions, defaultValue: thresholdOptions[0] },
  onSelectedValueChange: (nameAsStringOrNumber) => {
    const toolGroup = ToolGroupManager.getToolGroup(toolGroupId);
    const thresholdPreviewToolInstance =
      toolGroup._toolInstances['LabelmapThresholdPreview'];
    const name = String(nameAsStringOrNumber);

    if (name === thresholdOptions[0]) {
      updateThresholdElementsValue([-150, -70]);
      thresholdPreviewToolInstance.setThreshold([-150, -70]);
    } else if (name === thresholdOptions[1]) {
      updateThresholdElementsValue([200, 1000]);
      thresholdPreviewToolInstance.setThreshold([200, 1000]);
    } else if (name === thresholdOptions[2]) {
      updateThresholdElementsValue([-190, -30]);
      thresholdPreviewToolInstance.setThreshold([-190, -30]);
    } else if (name === thresholdOptions[3]) {
      updateThresholdElementsValue([-29, 150]);
      thresholdPreviewToolInstance.setThreshold([-29, 150]);
    }
  },
});

addSliderToToolbar({
  // title: `Lower Threshold value: ${LOWER_THRESHOLD}`,
  title: `Lower Threshold`,
  range: THRESHOLD_RANGE,
  defaultValue: LOWER_THRESHOLD,
  onSelectedValueChange: (value: string) => {
    updateThresholdElementsValue([value, undefined]);
    debouncedSetThreshold([value, undefined], 'lower');
  },
});

addSliderToToolbar({
  title: `Upper threshold`,
  range: THRESHOLD_RANGE,
  defaultValue: UPPER_THRESHOLD,
  onSelectedValueChange: (value: string) => {
    updateThresholdElementsValue([undefined, value]);
    debouncedSetThreshold([undefined, value], 'upper');
  },
});
// ============================= //

async function addSegmentationsToState() {
  // Create a segmentation of the same resolution as the source data
  // using volumeLoader.createAndCacheDerivedVolume.
  await volumeLoader.createAndCacheDerivedVolume(VOLUME_ID, {
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
}

/**
 * Runs the demo
 */
async function run() {
  // Init Cornerstone and related libraries
  await initDemo();

  // Add tools to Cornerstone3D
  cornerstoneTools.addTool(PanTool);
  cornerstoneTools.addTool(ZoomTool);
  cornerstoneTools.addTool(StackScrollMouseWheelTool);
  cornerstoneTools.addTool(SegmentationDisplayTool);
  cornerstoneTools.addTool(ThresholdPreviewTool);

  // Define tool groups to add the segmentation display tool to
  const toolGroup = ToolGroupManager.createToolGroup(toolGroupId);

  // Manipulation Tools
  toolGroup.addTool(PanTool.toolName);
  toolGroup.addTool(ZoomTool.toolName);
  toolGroup.addTool(StackScrollMouseWheelTool.toolName);

  // Segmentation Tools
  toolGroup.addTool(SegmentationDisplayTool.toolName);
  toolGroup.addTool(ThresholdPreviewTool.toolName);

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
  // As the Stack Scroll mouse wheel is a tool using the `mouseWheelCallback`
  // hook instead of mouse buttons, it does not need to assign any mouse button.
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
  const volume = await volumeLoader.createAndCacheVolume(VOLUME_ID, {
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

  const callback = (event) => {
    toolGroup.setToolEnabled(ThresholdPreviewTool.toolName);
  };
  // Set the volume to load
  volume.load(callback);

  // Set volumes on the viewports
  await setVolumesForViewports(
    renderingEngine,
    [{ volumeId: VOLUME_ID, callback: setCtTransferFunctionForVolumeActor }],
    [viewportId1, viewportId2, viewportId3]
  );

  // // Add the segmentation representation to the toolgroup
  await segmentation.addSegmentationRepresentations(toolGroupId, [
    {
      segmentationId,
      type: csToolsEnums.SegmentationRepresentations.Labelmap,
    },
  ]);

  // Render the image
  renderingEngine.renderViewports([viewportId1, viewportId2, viewportId3]);
}

run();
