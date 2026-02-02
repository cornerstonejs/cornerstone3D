import type { Types } from '@cornerstonejs/core';
import {
  RenderingEngine,
  Enums,
  volumeLoader,
  setVolumesForViewports,
} from '@cornerstonejs/core';
import {
  initDemo,
  createImageIdsAndCacheMetaData,
  setTitleAndDescription,
  setCtTransferFunctionForVolumeActor,
  addDropdownToToolbar,
} from '../../../../utils/demo/helpers';
import * as cornerstoneTools from '@cornerstonejs/tools';

// This is for debugging purposes
console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const {
  LengthTool,
  ProbeTool,
  RectangleROITool,
  EllipticalROITool,
  CircleROITool,
  BidirectionalTool,
  AngleTool,
  ArrowAnnotateTool,
  PanTool,
  ZoomTool,
  WindowLevelTool,
  StackScrollTool,
  ToolGroupManager,
  Enums: csToolsEnums,
} = cornerstoneTools;

const { ViewportType } = Enums;
const { MouseBindings } = csToolsEnums;

const renderingEngineId = 'myRenderingEngine';
const toolGroupId = 'ORTHOGRAPHIC_TOOL_GROUP';
const volumeName = 'CT_VOLUME_ID';
const volumeLoaderScheme = 'cornerstoneStreamingImageVolume';
const volumeId = `${volumeLoaderScheme}:${volumeName}`;

const viewportIds = {
  axial: 'AXIAL_ORTHO',
  sagittal: 'SAGITTAL_ORTHO',
  coronal: 'CORONAL_ORTHO',
};

setTitleAndDescription(
  'Volume Orthographic Viewport with Tools',
  'Displays axial, sagittal, and coronal orthographic viewports using ContextPool rendering engine with annotation and manipulation tools.'
);

const toolsNames = [
  LengthTool.toolName,
  ProbeTool.toolName,
  RectangleROITool.toolName,
  EllipticalROITool.toolName,
  CircleROITool.toolName,
  BidirectionalTool.toolName,
  AngleTool.toolName,
  ArrowAnnotateTool.toolName,
  WindowLevelTool.toolName,
];

let selectedToolName = toolsNames[0];

addDropdownToToolbar({
  options: { values: toolsNames, defaultValue: selectedToolName },
  onSelectedValueChange: (newSelectedToolNameAsStringOrNumber) => {
    const newSelectedToolName = String(newSelectedToolNameAsStringOrNumber);
    const toolGroup = ToolGroupManager.getToolGroup(toolGroupId);

    toolGroup.setToolActive(newSelectedToolName, {
      bindings: [
        {
          mouseButton: MouseBindings.Primary,
        },
      ],
    });

    toolGroup.setToolPassive(selectedToolName);
    selectedToolName = newSelectedToolName;
  },
});

const content = document.getElementById('content');
const container = document.createElement('div');
container.style.display = 'grid';
container.style.gridTemplateColumns = 'repeat(3, 1fr)';
container.style.gap = '5px';
container.style.width = '100%';
container.style.height = '500px';

const axialElement = document.createElement('div');
axialElement.id = 'axial-element';
axialElement.style.width = '100%';
axialElement.style.height = '100%';
axialElement.oncontextmenu = () => false;

const sagittalElement = document.createElement('div');
sagittalElement.id = 'sagittal-element';
sagittalElement.style.width = '100%';
sagittalElement.style.height = '100%';
sagittalElement.oncontextmenu = () => false;

const coronalElement = document.createElement('div');
coronalElement.id = 'coronal-element';
coronalElement.style.width = '100%';
coronalElement.style.height = '100%';
coronalElement.oncontextmenu = () => false;

container.appendChild(axialElement);
container.appendChild(sagittalElement);
container.appendChild(coronalElement);
content.appendChild(container);

const instructions = document.createElement('p');
instructions.innerText = `Left Click: Selected tool from dropdown
Middle Click: Pan
Right Click: Zoom
Mouse Wheel: Scroll through slices`;
content.appendChild(instructions);

async function run() {
  // Uses default ContextPool rendering engine mode
  await initDemo();

  cornerstoneTools.addTool(LengthTool);
  cornerstoneTools.addTool(ProbeTool);
  cornerstoneTools.addTool(RectangleROITool);
  cornerstoneTools.addTool(EllipticalROITool);
  cornerstoneTools.addTool(CircleROITool);
  cornerstoneTools.addTool(BidirectionalTool);
  cornerstoneTools.addTool(AngleTool);
  cornerstoneTools.addTool(ArrowAnnotateTool);
  cornerstoneTools.addTool(PanTool);
  cornerstoneTools.addTool(ZoomTool);
  cornerstoneTools.addTool(WindowLevelTool);
  cornerstoneTools.addTool(StackScrollTool);

  const toolGroup = ToolGroupManager.createToolGroup(toolGroupId);

  toolGroup.addTool(LengthTool.toolName);
  toolGroup.addTool(ProbeTool.toolName);
  toolGroup.addTool(RectangleROITool.toolName);
  toolGroup.addTool(EllipticalROITool.toolName);
  toolGroup.addTool(CircleROITool.toolName);
  toolGroup.addTool(BidirectionalTool.toolName);
  toolGroup.addTool(AngleTool.toolName);
  toolGroup.addTool(ArrowAnnotateTool.toolName);
  toolGroup.addTool(PanTool.toolName);
  toolGroup.addTool(ZoomTool.toolName);
  toolGroup.addTool(WindowLevelTool.toolName);
  toolGroup.addTool(StackScrollTool.toolName);

  toolGroup.setToolActive(LengthTool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Primary,
      },
    ],
  });

  toolGroup.setToolActive(PanTool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Auxiliary,
      },
    ],
  });

  toolGroup.setToolActive(ZoomTool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Secondary,
      },
    ],
  });

  toolGroup.setToolActive(StackScrollTool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Wheel,
      },
    ],
  });

  toolGroup.setToolPassive(ProbeTool.toolName);
  toolGroup.setToolPassive(RectangleROITool.toolName);
  toolGroup.setToolPassive(EllipticalROITool.toolName);
  toolGroup.setToolPassive(CircleROITool.toolName);
  toolGroup.setToolPassive(BidirectionalTool.toolName);
  toolGroup.setToolPassive(AngleTool.toolName);
  toolGroup.setToolPassive(ArrowAnnotateTool.toolName);
  toolGroup.setToolPassive(WindowLevelTool.toolName);

  const imageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.334240657131972136850343327463',
    SeriesInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.226151125820845824875394858561',
    wadoRsRoot: 'https://d14fa38qiwhyfd.cloudfront.net/dicomweb',
  });

  const renderingEngine = new RenderingEngine(renderingEngineId);

  const viewportInputs = [
    {
      viewportId: viewportIds.axial,
      type: ViewportType.ORTHOGRAPHIC,
      element: axialElement,
      defaultOptions: {
        orientation: Enums.OrientationAxis.AXIAL,
        background: [0, 0, 0] as Types.Point3,
      },
    },
    {
      viewportId: viewportIds.sagittal,
      type: ViewportType.ORTHOGRAPHIC,
      element: sagittalElement,
      defaultOptions: {
        orientation: Enums.OrientationAxis.SAGITTAL,
        background: [0, 0, 0] as Types.Point3,
      },
    },
    {
      viewportId: viewportIds.coronal,
      type: ViewportType.ORTHOGRAPHIC,
      element: coronalElement,
      defaultOptions: {
        orientation: Enums.OrientationAxis.CORONAL,
        background: [0, 0, 0] as Types.Point3,
      },
    },
  ];

  renderingEngine.setViewports(viewportInputs);

  Object.values(viewportIds).forEach((viewportId) =>
    toolGroup.addViewport(viewportId, renderingEngineId)
  );

  const volume = await volumeLoader.createAndCacheVolume(volumeId, {
    imageIds,
  });
  volume.load();

  await setVolumesForViewports(
    renderingEngine,
    [{ volumeId, callback: setCtTransferFunctionForVolumeActor }],
    Object.values(viewportIds)
  );

  renderingEngine.renderViewports(Object.values(viewportIds));
}

run();
