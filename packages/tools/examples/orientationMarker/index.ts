import type { VolumeViewport3D, PlanarViewport } from '@cornerstonejs/core';
import {
  RenderingEngine,
  Enums,
  volumeLoader,
  displaySetRegistry,
} from '@cornerstonejs/core';
import {
  initDemo,
  createImageIdsAndCacheMetaData,
  setTitleAndDescription,
} from '../../../../utils/demo/helpers';
import * as cornerstoneTools from '@cornerstonejs/tools';
import addDropDownToToolbar from '../../../../utils/demo/helpers/addDropdownToToolbar';
import { petPresentation } from '../../../../utils/demo/helpers/volumePresentationRecipes';
import { VolumeRotateTool } from '@cornerstonejs/tools';

async function getImageStacks() {
  const wadoRsRoot1 = 'https://d14fa38qiwhyfd.cloudfront.net/dicomweb';
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

  const wadoRsRoot = 'https://d14fa38qiwhyfd.cloudfront.net/dicomweb';
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
  StackScrollTool,
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
const ctDisplaySetId = 'CT_DISPLAY_SET';
const ptDisplaySetId = 'PT_DISPLAY_SET';
const toolGroupId = 'MY_TOOLGROUP_ID';

// ======== Set up page ======== //
setTitleAndDescription(
  'Orientation Marker',
  'Here we demonstrate Orientation marker tool working .'
);

const size = '512px';
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
  cornerstoneTools.addTool(StackScrollTool);
  cornerstoneTools.addTool(TrackballRotateTool);
  cornerstoneTools.addTool(VolumeRotateTool);

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
  ptToolGroup.addTool(StackScrollTool.toolName);
  ptToolGroup.addTool(VolumeRotateTool.toolName);
  ptToolGroup.setToolActive(VolumeRotateTool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Wheel,
      },
    ],
  });

  // Instantiate a rendering engine
  const renderingEngine = new RenderingEngine(renderingEngineId);

  // Create the viewports
  const viewportInputArray = [
    {
      viewportId: viewportIds[0],
      type: ViewportType.VOLUME_3D,
      element: elements[0],
      defaultOptions: {
        orientation: Enums.OrientationAxis.AXIAL,
      },
    },
    {
      viewportId: viewportIds[1],
      type: ViewportType.VOLUME_3D,
      element: elements[1],
      defaultOptions: {
        orientation: Enums.OrientationAxis.SAGITTAL,
      },
    },
    {
      viewportId: viewportIds[2],
      type: ViewportType.PLANAR,
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
  const ctVolume = await volumeLoader.createAndCacheVolume(ctVolumeId, {
    imageIds: ctImageIds,
  });
  const ptVolume = await volumeLoader.createAndCacheVolume(ptVolumeId, {
    imageIds: ptImageIds,
  });

  ctVolume.load();
  ptVolume.load();

  ctToolGroup.addViewport(viewportIds[0], renderingEngineId);
  ctToolGroup.addViewport(viewportIds[1], renderingEngineId);
  ptToolGroup.addViewport(viewportIds[2], renderingEngineId);

  const ctViewportIds = viewportIds.slice(0, 2);

  displaySetRegistry.add(ctDisplaySetId, {
    imageIds: ctImageIds,
    volumeId: ctVolumeId,
  });
  displaySetRegistry.add(ptDisplaySetId, {
    imageIds: ptImageIds,
    volumeId: ptVolumeId,
  });

  ctViewportIds.forEach((viewportId) => {
    const viewport = renderingEngine.getViewport<VolumeViewport3D>(viewportId);

    viewport.setDisplaySets({ displaySetId: ctDisplaySetId }).then(() => {
      viewport.setDisplaySetAppearance(ctDisplaySetId, {
        preset: 'CT-Bone',
      });

      viewport.render();
    });
  });

  const ptViewport = renderingEngine.getViewport<PlanarViewport>(
    viewportIds[2]
  );

  ptViewport.setDisplaySets({ displaySetId: ptDisplaySetId }).then(() => {
    ptViewport.setDisplaySetAppearance(ptDisplaySetId, {
      ...petPresentation(),
      blendMode: Enums.BlendModes.MAXIMUM_INTENSITY_BLEND,
      slabThickness: 300,
    });

    ptViewport.render();
  });

  ctToolGroup.setToolActive(OrientationMarkerTool.toolName);
  ptToolGroup.setToolActive(OrientationMarkerTool.toolName);

  // Render the image
  renderingEngine.render();
}

run();
