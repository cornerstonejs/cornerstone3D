import {
  RenderingEngine,
  Enums,
  volumeLoader,
  setVolumesForViewports,
  CONSTANTS,
  utilities,
  Types,
} from '@cornerstonejs/core';
import {
  initDemo,
  createImageIdsAndCacheMetaData,
  setTitleAndDescription,
} from '../../../../utils/demo/helpers';
import * as cornerstoneTools from '@cornerstonejs/tools';
import addDropDownToToolbar from '../../../../utils/demo/helpers/addDropdownToToolbar';
import setPetTransferFunction from '../../../../utils/demo/helpers/setPetTransferFunctionForVolumeActor';

async function getImageStacks() {
  const wadoRsRoot1 = 'https://d33do7qe4w26qo.cloudfront.net/dicomweb';
  const studyInstanceUID =
    '1.3.6.1.4.1.25403.345050719074.3824.20170125095258.1';
  const seriesInstanceUIDs = [
    '1.3.6.1.4.1.25403.345050719074.3824.20170125095258.7',
  ];
  const ctImageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID: studyInstanceUID,
    SeriesInstanceUID: seriesInstanceUIDs[0],
    wadoRsRoot: wadoRsRoot1,
  });

  const wadoRsRoot = 'https://d3t6nz73ql33tx.cloudfront.net/dicomweb';
  const StudyInstanceUID =
    '1.3.6.1.4.1.14519.5.2.1.7009.2403.334240657131972136850343327463';

  const ptImageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID,
    SeriesInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.879445243400782656317561081015',
    wadoRsRoot,
  });

  return [ctImageIds, ptImageIds];
}
// This is for debugging purposes
console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const {
  ToolGroupManager,
  Enums: csToolsEnums,
  OrientationMarkerTool,
  ZoomTool,
  PanTool,
  VolumeRotateMouseWheelTool,
  TrackballRotateTool,
} = cornerstoneTools;

const ctToolGroupId = 'CT_TOOLGROUP_ID';
const ptToolGroupId = 'PT_TOOLGROUP_ID';
let ctToolGroup;
let ptToolGroup;

addDropDownToToolbar({
  options: {
    values: Object.keys(OrientationMarkerTool.OVERLAY_MARKER_TYPES),
    defaultValue: OrientationMarkerTool.OVERLAY_MARKER_TYPES.AXES,
  },
  onSelectedValueChange: (value) => {
    [ctToolGroup, ptToolGroup].forEach((toolGroup) => {
      toolGroup.setToolDisabled(OrientationMarkerTool.toolName);
      toolGroup.setToolConfiguration(OrientationMarkerTool.toolName, {
        overlayMarkerType: OrientationMarkerTool.OVERLAY_MARKER_TYPES[value],
      });

      toolGroup.setToolEnabled(OrientationMarkerTool.toolName);
    });
  },
});

const { MouseBindings } = csToolsEnums;
const { ViewportType } = Enums;

// Define a unique id for the volume
const ctVolumeName = 'CT_VOLUME_ID'; // Id of the volume less loader prefix
const ptVolumeName = 'PT_VOLUME_ID'; // Id of the volume less loader prefix
const volumeLoaderScheme = 'cornerstoneStreamingImageVolume'; // Loader id which defines which volume loader to use
const ctVolumeId = `${volumeLoaderScheme}:${ctVolumeName}`;
const ptVolumeId = `${volumeLoaderScheme}:${ptVolumeName}`;
const toolGroupId = 'MY_TOOLGROUP_ID';

// ======== Set up page ======== //
setTitleAndDescription(
  'Orientation Marker',
  'Here we demonstrate Orientation marker tool working .'
);

const size = '500px';
const content = document.getElementById('content');
const viewportGrid = document.createElement('div');

viewportGrid.style.display = 'flex';
viewportGrid.style.display = 'flex';
viewportGrid.style.flexDirection = 'row';

const elements = [];
const numberOfElements = 3;
for (let i = 0; i < numberOfElements; i++) {
  const element = document.createElement('div');
  element.style.width = size;
  element.style.height = size;
  // Disable right click context menu so we can have right click tools
  element.oncontextmenu = (e) => e.preventDefault();
  viewportGrid.appendChild(element);
  elements.push(element);
}

content.appendChild(viewportGrid);

const instructions = document.createElement('p');
instructions.innerText = `
  `;

content.append(instructions);

const viewportIds = ['CT_AXIAL', 'CT_SAGITTAL', 'CT_CORONAL'].slice(
  0,
  numberOfElements
);

const renderingEngineId = 'myRenderingEngine';

/**
 * Runs the demo
 */
async function run() {
  // Define tool groups to add the segmentation display tool to
  ctToolGroup = ToolGroupManager.createToolGroup(ctToolGroupId);
  ptToolGroup = ToolGroupManager.createToolGroup(ptToolGroupId);

  // Init Cornerstone and related libraries
  await initDemo();

  // Add tools to Cornerstone3D
  cornerstoneTools.addTool(OrientationMarkerTool);
  cornerstoneTools.addTool(PanTool);
  cornerstoneTools.addTool(ZoomTool);
  cornerstoneTools.addTool(VolumeRotateMouseWheelTool);
  cornerstoneTools.addTool(TrackballRotateTool);

  ctToolGroup.addTool(OrientationMarkerTool.toolName);
  ctToolGroup.addTool(ZoomTool.toolName);
  ctToolGroup.addTool(PanTool.toolName);
  ctToolGroup.addTool(TrackballRotateTool.toolName);
  ctToolGroup.setToolActive(TrackballRotateTool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Primary, // Left Click
      },
    ],
  });
  ctToolGroup.setToolActive(ZoomTool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Secondary, // Left Click
      },
    ],
  });

  ptToolGroup.addTool(OrientationMarkerTool.toolName);
  ptToolGroup.addTool(ZoomTool.toolName);
  ptToolGroup.addTool(PanTool.toolName);
  ptToolGroup.addTool(VolumeRotateMouseWheelTool.toolName);
  ptToolGroup.setToolActive(VolumeRotateMouseWheelTool.toolName);

  // Instantiate a rendering engine
  const renderingEngine = new RenderingEngine(renderingEngineId);

  // Create the viewports
  const viewportInputArray = [
    {
      viewportId: viewportIds[0],
      type: ViewportType.ORTHOGRAPHIC,
      element: elements[0],
      defaultOptions: {
        orientation: Enums.OrientationAxis.AXIAL,
      },
    },
    {
      viewportId: viewportIds[1],
      type: ViewportType.ORTHOGRAPHIC,
      element: elements[1],
      defaultOptions: {
        orientation: Enums.OrientationAxis.SAGITTAL,
      },
    },
    {
      viewportId: viewportIds[2],
      type: ViewportType.ORTHOGRAPHIC,
      element: elements[2],
      defaultOptions: {
        orientation: Enums.OrientationAxis.CORONAL,
        background: [1, 1, 1],
      },
    },
  ];

  // @ts-ignore
  renderingEngine.setViewports(viewportInputArray);

  const [ctImageIds, ptImageIds] = await getImageStacks();

  // Define a volume in memory
  const ctVolume = await volumeLoader.createAndCacheEmptyVolume(ctVolumeId, {
    imageIds: ctImageIds,
  });
  const ptVolume = await volumeLoader.createAndCacheEmptyVolume(ptVolumeId, {
    imageIds: ptImageIds,
  });

  ctVolume.load();
  ptVolume.load();

  ctToolGroup.addViewport(viewportIds[0], renderingEngineId);
  ctToolGroup.addViewport(viewportIds[1], renderingEngineId);
  ptToolGroup.addViewport(viewportIds[2], renderingEngineId);

  const ctViewportIds = viewportIds.slice(0, 2);

  setVolumesForViewports(
    renderingEngine,
    [
      {
        volumeId: ctVolumeId,
        slabThickness: 300,
      },
    ],
    [...ctViewportIds]
  ).then(() => {
    ctViewportIds.forEach((viewportId) => {
      const volumeActor = renderingEngine
        .getViewport(viewportId)
        .getDefaultActor().actor as Types.VolumeActor;

      utilities.applyPreset(
        volumeActor,
        CONSTANTS.VIEWPORT_PRESETS.find((preset) => preset.name === 'CT-Bone')
      );

      const viewport = renderingEngine.getViewport(viewportId);

      viewport.render();
    });
  });

  setVolumesForViewports(
    renderingEngine,
    [
      {
        volumeId: ptVolumeId,
        callback: setPetTransferFunction,
        blendMode: Enums.BlendModes.MAXIMUM_INTENSITY_BLEND,
        slabThickness: 300,
      },
    ],
    [viewportIds[2]]
  ).then(() => {
    const viewport = renderingEngine.getViewport(viewportIds[2]);

    viewport.render();
  });

  ctToolGroup.setToolActive(OrientationMarkerTool.toolName);
  ptToolGroup.setToolActive(OrientationMarkerTool.toolName);

  // Render the image
  renderingEngine.render();
}

run();
