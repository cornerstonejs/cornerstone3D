import cornerstoneDICOMImageLoader from '@cornerstonejs/dicom-image-loader';
import type { Types } from '@cornerstonejs/core';
import {
  RenderingEngine,
  Enums,
  volumeLoader,
  setVolumesForViewports,
  cache,
} from '@cornerstonejs/core';
import {
  initDemo,
  createImageIdsAndCacheMetaData,
  setTitleAndDescription,
  setPetTransferFunctionForVolumeActor,
} from '../../../../utils/demo/helpers';
import * as cornerstoneTools from '@cornerstonejs/tools';
import createSecondStageLayout from './createSecondStageLayout';
import createFirstStageLayout from './createFirstStageLayout';

// This is for debugging purposes
console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const {
  PanTool,
  ZoomTool,
  StackScrollTool,
  CrosshairsTool,
  ToolGroupManager,
  Enums: csToolsEnums,
  utilities: csToolsUtilities,
} = cornerstoneTools;

const MAX_NUM_TIMEPOINTS = 40;

// If needed a checkbox may be added to the UI instead
const dynamicCineEnabled = true;

const { ViewportType } = Enums;
const { MouseBindings } = csToolsEnums;

const renderingEngineId = 'myRenderingEngine';
const viewportIds = [
  'PT_AXIAL_VOLUME',
  'PT_CORONAL_VOLUME',
  'PT_SAGITTAL_VOLUME',
  'PT_OBLIQUE_VOLUME',
];

const viewportColors = {
  [viewportIds[0]]: 'rgb(200, 0, 0)',
  [viewportIds[1]]: 'rgb(200, 200, 0)',
  [viewportIds[2]]: 'rgb(0, 200, 0)',
};

const viewportReferenceLineControllable = viewportIds.slice();
const viewportReferenceLineDraggableRotatable = viewportIds.slice();
const viewportReferenceLineSlabThicknessControlsOn = viewportIds.slice();

const inactiveViewportBorder = 'none';
const activeViewportBorder = 'none';
const defaultFramesPerSecond = 24;
const mprToolGroupId = 'VOLUME_MPR_TOOL_GROUP_ID';
const obliqueToolGroupId = 'VOLUME_OBLIQUE_TOOL_GROUP_ID';
const numViewports = 4;
let framesPerSecond = defaultFramesPerSecond;
let activeElement = null;

// ======== Set up page ======== //
setTitleAndDescription(
  'CINE Tool - 4D Volumes',
  'Show the usage of the CINE Tool and 4D volumes.'
);

function initLayout() {
  const content = document.getElementById('content');
  const stagesContainer = document.createElement('div');
  const firstStageContainer = createFirstStageLayout({
    onLoadTimePoints: loadTimePoints,
  });

  const secondStageContainer = createSecondStageLayout({
    initialFramesPerSecond: framesPerSecond,
    onFramesPerSecondUpdated,
    onCineStart: startCine,
    onCineStop: stopCine,
  });

  firstStageContainer.style.borderTop = 'dashed 1px #000';
  firstStageContainer.style.borderBottom = 'dashed 1px #000';
  secondStageContainer.style.borderBottom = 'dashed 1px #000';

  firstStageContainer.style.padding = '10px 0';
  secondStageContainer.style.padding = '10px 0';

  stagesContainer.append(firstStageContainer);
  stagesContainer.append(secondStageContainer);

  content.append(stagesContainer);

  // Removing it because it is not needed and to prevent any css applied to
  // it (eg: margin, padding, etc) from breaking the layout of this page
  document.getElementById('demo-toolbar').remove();
}

// Creates all viewports elements and add the instructions
function initViewportLayout() {
  const size = '500px';
  const content = document.getElementById('content');
  const viewportGrid = document.createElement('div');
  const elements = [];

  viewportGrid.style.display = 'flex';
  viewportGrid.style.flexDirection = 'row';

  for (let i = 0; i < numViewports; i++) {
    const element = document.createElement('div');

    element.id = 'cornerstone-element';
    element.style.width = size;
    element.style.height = size;
    element.style.padding = '1px';
    element.style.marginTop = '5px';
    element.style.border = inactiveViewportBorder;

    elements.push(element);
    viewportGrid.appendChild(element);

    element.addEventListener('click', function () {
      setActiveElement(this);
    });

    // Disable right click context menu so we can have right click tools
    element.oncontextmenu = (e) => e.preventDefault();
  }

  content.appendChild(viewportGrid);

  const instructions = document.createElement('p');
  instructions.innerHTML = `
    <b>Instructions</b>
    <ul>
      <li>Click on Play Clip to start the CINE tool</li>
      <li>Click on Stop Clip to stop the CINE tool</li>
      <li>Drag the frame slider to change the frames per second rate</li>
    </ul>
    <b>Tools</b>
    <ul>
      <li>Crosshairs: left button</li>
      <li>Pan: middle button</li>
      <li>Zoom: right button</li>
      <li>Scroll: scroll wheel</li>
    <ul>
  `;

  content.append(instructions);

  return elements;
}

function initViewports(volume, elements) {
  // Instantiate a rendering engine
  const renderingEngine = new RenderingEngine(renderingEngineId);
  const { volumeId } = volume;

  const viewportInputArray = [
    {
      viewportId: viewportIds[0],
      type: ViewportType.ORTHOGRAPHIC,
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
    {
      viewportId: viewportIds[3],
      type: ViewportType.ORTHOGRAPHIC,
      element: elements[3],
      defaultOptions: {
        orientation: {
          // Random oblique orientation
          viewUp: <Types.Point3>[
            -0.5962687530844388, 0.5453181550345819, -0.5891448751239446,
          ],
          viewPlaneNormal: <Types.Point3>[
            -0.5962687530844388, 0.5453181550345819, -0.5891448751239446,
          ],
        },
        background: <Types.Point3>[0.2, 0, 0.2],
      },
    },
  ];

  renderingEngine.setViewports(viewportInputArray);

  // Set volumes on the viewports
  setVolumesForViewports(
    renderingEngine,
    [{ volumeId, callback: setPetTransferFunctionForVolumeActor }],
    viewportIds
  );

  // Render the image
  renderingEngine.renderViewports(viewportIds);

  // Set the first viewport as active
  setActiveElement(elements[0]);

  return viewportIds;
}

async function createVolume(numTimePoints: number): any {
  const { metaDataManager } = cornerstoneDICOMImageLoader.wadors;

  if (numTimePoints < 1 || numTimePoints > MAX_NUM_TIMEPOINTS) {
    throw new Error('numTimePoints is out of range');
  }

  let imageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID:
      '1.3.6.1.4.1.12842.1.1.14.3.20220915.105557.468.2963630849',
    SeriesInstanceUID:
      '1.3.6.1.4.1.12842.1.1.22.4.20220915.124758.560.4125514885',
    wadoRsRoot: 'https://d33do7qe4w26qo.cloudfront.net/dicomweb',
  });

  const NUM_IMAGES_PER_TIME_POINT = 235;
  const TOTAL_NUM_IMAGES = MAX_NUM_TIMEPOINTS * NUM_IMAGES_PER_TIME_POINT;
  const numImagesToLoad = numTimePoints * NUM_IMAGES_PER_TIME_POINT;

  // Load the last N time points because they have a better image quality
  // and first ones are white or contains only a few black pixels
  const firstInstanceNumber = TOTAL_NUM_IMAGES - numImagesToLoad + 1;

  imageIds = imageIds.filter((imageId) => {
    const instanceMetaData = metaDataManager.get(imageId);
    const instanceTag = instanceMetaData['00200013'];
    const instanceNumber = parseInt(instanceTag.Value[0]);

    return instanceNumber >= firstInstanceNumber;
  });

  // Define a unique id for the volume
  const volumeLoaderScheme = 'cornerstoneStreamingDynamicImageVolume'; // Loader id which defines which volume loader to use
  const volumeName = 'PT_VOLUME_ID'; // Id of the volume less loader prefix
  const volumeId = `${volumeLoaderScheme}:${volumeName}`; // VolumeId with loader id + volume id

  // Define a volume in memory
  const volume = await volumeLoader.createAndCacheVolume(volumeId, {
    imageIds,
  });

  console.log(`A total of ${imageIds.length} images are going to be loaded`);

  return volume;
}

function getReferenceLineColor(viewportId) {
  return viewportColors[viewportId];
}

function getReferenceLineControllable(viewportId) {
  return viewportReferenceLineControllable.includes(viewportId);
}

function getReferenceLineDraggableRotatable(viewportId) {
  return viewportReferenceLineDraggableRotatable.includes(viewportId);
}

function getReferenceLineSlabThicknessControlsOn(viewportId) {
  return viewportReferenceLineSlabThicknessControlsOn.includes(viewportId);
}

function initCornerstoneTools() {
  cornerstoneTools.addTool(PanTool);
  cornerstoneTools.addTool(ZoomTool);
  cornerstoneTools.addTool(StackScrollTool);
}

function initCrosshairsTool(toolGroup) {
  cornerstoneTools.addTool(CrosshairsTool);

  toolGroup.addTool(CrosshairsTool.toolName, {
    getReferenceLineColor,
    getReferenceLineControllable,
    getReferenceLineDraggableRotatable,
    getReferenceLineSlabThicknessControlsOn,
  });

  toolGroup.setToolActive(CrosshairsTool.toolName, {
    bindings: [{ mouseButton: MouseBindings.Primary }],
  });
}

function initTools(toolGroup, options?) {
  // Add the tools to the tool group
  toolGroup.addTool(PanTool.toolName);
  toolGroup.addTool(ZoomTool.toolName);
  toolGroup.addTool(StackScrollTool.toolName);

  toolGroup.setToolActive(PanTool.toolName, {
    bindings: [{ mouseButton: MouseBindings.Auxiliary }],
  });

  toolGroup.setToolActive(ZoomTool.toolName, {
    bindings: [{ mouseButton: MouseBindings.Secondary }],
  });

  toolGroup.setToolActive(StackScrollTool.toolName, {
    bindings: [{ mouseButton: MouseBindings.Wheel }],
  });

  if ((options ?? {}).initCrosshairsTool === true) {
    initCrosshairsTool(toolGroup);
  }

  return toolGroup;
}

/**
 * Define a tool group, which defines how mouse events map to tool commands for
 * any viewport using the group
 */
function createToolGroups() {
  const mprToolGroup = ToolGroupManager.createToolGroup(mprToolGroupId);
  const obliqueToolGroup = ToolGroupManager.createToolGroup(obliqueToolGroupId);

  // Set the tool group on the viewport. Add only the first three viewports
  // because crosshairs can work with up to three viewports
  viewportIds.slice(0, 3).forEach((viewportId, i) => {
    mprToolGroup.addViewport(viewportId, renderingEngineId);
  });

  obliqueToolGroup.addViewport(viewportIds[3], renderingEngineId);

  return { mprToolGroup, obliqueToolGroup };
}

/**
 * Runs the demo
 */
async function loadTimePoints(numTimePoints) {
  // Init Cornerstone and related libraries
  await initDemo();

  // Increases cache size to 4GB to be able to store all PET/CT images
  cache.setMaxCacheSize(4 * 1024 * 1024 * 1024);

  // Creates all viewports elements and add the instructions
  const elements = initViewportLayout();

  // Create and load PT volume
  const volume = await createVolume(numTimePoints);

  // Initialize cornerstone viewports
  initViewports(volume, elements);

  const { mprToolGroup, obliqueToolGroup } = createToolGroups();

  // Initialize cornerstone tools
  initCornerstoneTools();
  initTools(mprToolGroup, { initCrosshairsTool: true });
  initTools(obliqueToolGroup);

  volume.load();
}

function startCine() {
  csToolsUtilities.cine.playClip(activeElement, {
    framesPerSecond,
    dynamicCineEnabled,
  });
}

function stopCine() {
  csToolsUtilities.cine.stopClip(activeElement);
}

function onFramesPerSecondUpdated(value) {
  framesPerSecond = Number(value);
  startCine();
}

/**
 * Updated active element's style and stores it
 * @param element - Cornerstone element
 */
function setActiveElement(element) {
  if (activeElement) {
    activeElement.style.border = inactiveViewportBorder;
  }

  activeElement = element;
  activeElement.style.border = activeViewportBorder;

  const { framesPerSecond: fps = defaultFramesPerSecond } =
    csToolsUtilities.cine.getToolState(activeElement) ?? {};

  const fpsSliderElem = <HTMLInputElement>document.querySelector('#fpsSlider');
  const fpsSliderLabelElem = <HTMLElement>(
    document.querySelector('#fpsSlider-label')
  );

  // Update all FPS related inputs/vars
  framesPerSecond = fps;
  fpsSliderElem.value = fps.toString();
  fpsSliderLabelElem.innerText = ` Time points per second: ${fps}`;
}

initLayout();
