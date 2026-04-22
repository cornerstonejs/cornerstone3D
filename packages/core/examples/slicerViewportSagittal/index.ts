import type { Types } from '@cornerstonejs/core';
import { RenderingEngine, Enums } from '@cornerstonejs/core';
import * as cornerstoneTools from '@cornerstonejs/tools';
import {
  initDemo,
  setTitleAndDescription,
  addButtonToToolbar,
  addDropdownToToolbar,
} from '../../../../utils/demo/helpers';

console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const { ViewportType } = Enums;
const {
  ToolGroupManager,
  PanTool,
  ZoomTool,
  StackScrollTool,
  LengthTool,
  ProbeTool,
} = cornerstoneTools;
const { MouseBindings } = cornerstoneTools.Enums;

const renderingEngineId = 'myRenderingEngine';
const viewportId = 'SLICER_SAGITTAL';
const toolGroupId = 'slicerSagittalToolGroup';

const SLICER_SERVER = 'http://localhost:2016';

// Same Orthanc-backed study as the axial example. Slicer fetches the
// DICOMweb data itself via `DICOMUtils.importFromDICOMWeb`.
const wadoRsRoot = 'http://localhost:8042/dicom-web';
const StudyInstanceUID =
  '1.3.6.1.4.1.14519.5.2.1.7009.2403.871108593056125491804754960339';

setTitleAndDescription(
  'Slicer Remote Viewport — Sagittal',
  'Sagittal view of a DICOMweb study rendered by a locally-running 3D ' +
    'Slicer WebServer (http://localhost:2016). Same SETUP.md as the ' +
    'axial slicerViewport example. Scroll-wheel scrolls through ' +
    'sagittal slices, right-drag zooms, middle-drag pans.'
);

const content = document.getElementById('content');
const element = document.createElement('div');
element.id = 'cornerstone-element';
element.style.width = '500px';
element.style.height = '500px';
content.appendChild(element);

element.oncontextmenu = (e) => e.preventDefault();

let activeLeftTool = LengthTool.toolName;

function setActiveLeftTool(newToolName: string) {
  const toolGroup = ToolGroupManager.getToolGroup(toolGroupId);
  if (activeLeftTool) {
    toolGroup.setToolPassive(activeLeftTool);
  }
  toolGroup.setToolActive(newToolName, {
    bindings: [{ mouseButton: MouseBindings.Primary }],
  });
  activeLeftTool = newToolName;
}

async function run() {
  await initDemo();

  cornerstoneTools.addTool(PanTool);
  cornerstoneTools.addTool(ZoomTool);
  cornerstoneTools.addTool(StackScrollTool);
  cornerstoneTools.addTool(LengthTool);
  cornerstoneTools.addTool(ProbeTool);

  const toolGroup = ToolGroupManager.createToolGroup(toolGroupId);
  toolGroup.addTool(PanTool.toolName);
  toolGroup.addTool(ZoomTool.toolName);
  toolGroup.addTool(StackScrollTool.toolName);
  toolGroup.addTool(LengthTool.toolName);
  toolGroup.addTool(ProbeTool.toolName);

  toolGroup.setToolActive(PanTool.toolName, {
    bindings: [{ mouseButton: MouseBindings.Auxiliary }],
  });
  toolGroup.setToolActive(ZoomTool.toolName, {
    bindings: [{ mouseButton: MouseBindings.Secondary }],
  });
  toolGroup.setToolActive(StackScrollTool.toolName, {
    bindings: [{ mouseButton: MouseBindings.Wheel }],
  });
  toolGroup.setToolPassive(LengthTool.toolName);
  toolGroup.setToolPassive(ProbeTool.toolName);

  const renderingEngine = new RenderingEngine(renderingEngineId);
  renderingEngine.enableElement({
    viewportId,
    type: ViewportType.SLICER,
    element,
    defaultOptions: {
      background: [0, 0, 0] as Types.Point3,
    },
  });

  toolGroup.addViewport(viewportId, renderingEngineId);

  const viewport = renderingEngine.getViewport(
    viewportId
  ) as Types.ISlicerViewport;

  viewport.setServer(SLICER_SERVER);

  try {
    await viewport.loadDicomStudy({ wadoRsRoot, StudyInstanceUID });
    // Switch to sagittal after the study is in Slicer. setSliceParams
    // re-queries the volume's extent along the sagittal axis and fetches
    // the mid-slice PNG.
    await viewport.setSliceParams({ orientation: 'sagittal' });
  } catch (err) {
    console.error(
      'Failed to load volume into Slicer. Is Slicer running on ' +
        `${SLICER_SERVER}? See ../slicerViewport/SETUP.md.`,
      err
    );
    return;
  }

  setActiveLeftTool(LengthTool.toolName);

  addDropdownToToolbar({
    options: {
      values: ['axial', 'sagittal', 'coronal'],
      defaultValue: 'sagittal',
    },
    onSelectedValueChange: (value) => {
      viewport.setSliceParams({
        orientation: value as 'axial' | 'sagittal' | 'coronal',
      });
    },
  });

  addDropdownToToolbar({
    options: {
      values: [LengthTool.toolName, ProbeTool.toolName],
      defaultValue: LengthTool.toolName,
    },
    onSelectedValueChange: (value) => {
      setActiveLeftTool(value as string);
    },
  });

  addButtonToToolbar({
    title: 'Reset View',
    onClick: () => {
      viewport.resetCamera();
      viewport.render();
    },
  });

  addButtonToToolbar({
    title: 'Previous Slice',
    onClick: () => viewport.scroll(-1),
  });
  addButtonToToolbar({
    title: 'Next Slice',
    onClick: () => viewport.scroll(1),
  });
}

run();
