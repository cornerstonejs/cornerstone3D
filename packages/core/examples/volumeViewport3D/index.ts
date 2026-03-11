import type { Types } from '@cornerstonejs/core';
import {
  CONSTANTS,
  Enums,
  RenderingEngine,
  utilities,
  VolumeViewport3DV2,
} from '@cornerstonejs/core';
import {
  addTool,
  Enums as csToolsEnums,
  PanTool,
  ToolGroupManager,
  TrackballRotateTool,
  ZoomTool,
} from '@cornerstonejs/tools';
import {
  addButtonToToolbar,
  addDropdownToToolbar,
  createImageIdsAndCacheMetaData,
  initDemo,
  setTitleAndDescription,
} from '../../../../utils/demo/helpers';

console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const volumeName = 'CT_VOLUME_ID';
const volumeLoaderScheme = 'cornerstoneStreamingImageVolume';
const volumeId = `${volumeLoaderScheme}:${volumeName}`;
const volumeDataId = 'ct-volume-3d-v2';
const renderingEngineId = 'volumeViewport3dV2RenderingEngine';
const viewportId = '3D_VIEWPORT_V2';
const toolGroupId = 'VOLUME_3D_V2_TOOL_GROUP';
const volumeViewportType = Enums.ViewportType?.VOLUME_3D_V2 || 'volume3dV2';
const { MouseBindings } = csToolsEnums;

let viewport: VolumeViewport3DV2 | undefined;

setTitleAndDescription(
  '3D Volume Rendering With ViewportV2',
  'This example uses the dedicated 3D ViewportV2 path for GPU volume rendering.'
);

const size = '500px';
const content = document.getElementById('content');

if (!content) {
  throw new Error('Missing #content container');
}

const viewportGrid = document.createElement('div');
viewportGrid.style.display = 'flex';
viewportGrid.style.flexDirection = 'row';

const element = document.createElement('div');
element.oncontextmenu = () => false;
element.style.width = size;
element.style.height = size;

viewportGrid.appendChild(element);
content.appendChild(viewportGrid);

const instructions = document.createElement('p');
instructions.innerText =
  'Use the toolbar to change the preset and sampling distance. Interaction tools: left-drag rotates, middle-drag pans, and right-drag or mouse wheel zooms.';
content.append(instructions);

addButtonToToolbar({
  title: 'Apply random rotation',
  onClick: () => {
    if (!viewport) {
      return;
    }

    const vtkCamera = viewport.getRenderer().getActiveCamera();
    vtkCamera.azimuth(Math.random() * 360);
    vtkCamera.elevation((Math.random() - 0.5) * 90);
    viewport.getRenderer().resetCameraClippingRange();
    viewport.setCamera(viewport.getCamera());
  },
});

addDropdownToToolbar({
  options: {
    values: CONSTANTS.VIEWPORT_PRESETS.map((preset) => preset.name),
    defaultValue: 'CT-Bone',
  },
  onSelectedValueChange: (presetName) => {
    applyPreset(presetName as string);
  },
});

addDropdownToToolbar({
  options: {
    values: Array.from({ length: 16 }, (_, i) => i + 1),
    defaultValue: 1,
  },
  onSelectedValueChange: (sampleDistanceMultiplier) => {
    viewport?.setDataPresentation(volumeDataId, {
      sampleDistanceMultiplier: Number(sampleDistanceMultiplier),
    });
  },
});

function applyPreset(presetName: string): void {
  if (!viewport) {
    return;
  }

  const preset = CONSTANTS.VIEWPORT_PRESETS.find(
    (item) => item.name === presetName
  );
  const volumeActor = viewport.getDefaultActor()?.actor as
    | Types.VolumeActor
    | undefined;

  if (!preset || !volumeActor) {
    return;
  }

  utilities.applyPreset(volumeActor, preset);
  viewport.render();
}

async function run() {
  await initDemo();
  addTool(PanTool);
  addTool(TrackballRotateTool);
  addTool(ZoomTool);

  const toolGroup = ToolGroupManager.createToolGroup(toolGroupId);

  toolGroup.addTool(PanTool.toolName);
  toolGroup.addTool(TrackballRotateTool.toolName);
  toolGroup.addTool(ZoomTool.toolName);
  toolGroup.setToolActive(PanTool.toolName, {
    bindings: [{ mouseButton: MouseBindings.Auxiliary }],
  });
  toolGroup.setToolActive(TrackballRotateTool.toolName, {
    bindings: [{ mouseButton: MouseBindings.Primary }],
  });
  toolGroup.setToolActive(ZoomTool.toolName, {
    bindings: [
      { mouseButton: MouseBindings.Secondary },
      { mouseButton: MouseBindings.Wheel },
    ],
  });

  const imageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.871108593056125491804754960339',
    SeriesInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.367700692008930469189923116409',
    wadoRsRoot: 'https://d14fa38qiwhyfd.cloudfront.net/dicomweb',
  });

  const renderingEngine = new RenderingEngine(renderingEngineId);
  renderingEngine.enableElement({
    viewportId,
    type: volumeViewportType,
    element,
    defaultOptions: {
      background: CONSTANTS.BACKGROUND_COLORS.slicer3D as Types.Point3,
      orientation: Enums.OrientationAxis.CORONAL,
    },
  });

  viewport = renderingEngine.getViewport(viewportId) as VolumeViewport3DV2;
  toolGroup.addViewport(viewportId, renderingEngine.id);

  utilities.viewportV2DataSetMetadataProvider.add(volumeDataId, {
    imageIds,
    volumeId,
  });

  await viewport.setDataIds([volumeDataId]);
  viewport.setDataPresentation(volumeDataId, {
    sampleDistanceMultiplier: 1,
  });
  applyPreset('CT-Bone');
  viewport.render();
}

run();
