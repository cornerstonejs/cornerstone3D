import type { Types } from '@cornerstonejs/core';
import { RenderingEngine, Enums } from '@cornerstonejs/core';
import * as cornerstoneTools from '@cornerstonejs/tools';
import {
  initDemo,
  setTitleAndDescription,
  addButtonToToolbar,
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
const toolGroupId = 'slicerFourUpToolGroup';

const SLICER_SERVER = 'http://localhost:2016';
const wadoRsRoot = 'http://localhost:8042/dicom-web';
const StudyInstanceUID = '1.3.6.1.4.1.5962.1.2.370.1672334394.26545';
const SeriesInstanceUID = '1.3.6.1.4.1.5962.1.3.370.2.1672334394.26545';

type Orientation = 'axial' | 'sagittal' | 'coronal';

interface Pane {
  id: string;
  label: string;
  mode: 'slice' | 'threeD';
  orientation?: Orientation;
}

// Classic Slicer four-up layout: three orthogonal slices + 3D volume
// rendering. The 3D pane fetches from Slicer's `/slicer/threeD` endpoint,
// which renders whatever is in Slicer's 3D widget — so we enable volume
// rendering on the loaded CT and apply the CT-AAA preset.
const PANES: Pane[] = [
  { id: 'SLICER_AX', label: 'Axial', mode: 'slice', orientation: 'axial' },
  {
    id: 'SLICER_SAG',
    label: 'Sagittal',
    mode: 'slice',
    orientation: 'sagittal',
  },
  {
    id: 'SLICER_COR',
    label: 'Coronal',
    mode: 'slice',
    orientation: 'coronal',
  },
  { id: 'SLICER_3D', label: '3D', mode: 'threeD' },
];

setTitleAndDescription(
  'Slicer Remote Viewport — Four Up',
  '2x2 grid of SlicerViewports driven by a single 3D Slicer WebServer: ' +
    'axial, sagittal, coronal, and a 3D volume rendering of the same ' +
    'study. One viewport imports the study into Slicer and enables ' +
    'volume rendering; the slice panes sync from the already-loaded ' +
    'volume and the 3D pane fetches from Slicer /threeD. See ' +
    '../slicerViewport/SETUP.md for Slicer + Orthanc setup.'
);

const content = document.getElementById('content');
const grid = document.createElement('div');
grid.style.display = 'grid';
grid.style.gridTemplateColumns = '500px 500px';
grid.style.gridTemplateRows = '500px 500px';
grid.style.gap = '6px';
content.appendChild(grid);

const paneElements: Record<string, HTMLDivElement> = {};
for (const pane of PANES) {
  const wrapper = document.createElement('div');
  wrapper.style.position = 'relative';

  const label = document.createElement('div');
  label.textContent = pane.label;
  label.style.position = 'absolute';
  label.style.top = '4px';
  label.style.left = '8px';
  label.style.color = '#fff';
  label.style.fontFamily = 'sans-serif';
  label.style.fontSize = '14px';
  label.style.pointerEvents = 'none';
  label.style.textShadow = '0 0 3px #000';
  label.style.zIndex = '1';

  const el = document.createElement('div');
  el.id = `cornerstone-${pane.id}`;
  el.style.width = '500px';
  el.style.height = '500px';
  el.style.background = '#000';
  el.oncontextmenu = (e) => e.preventDefault();

  wrapper.appendChild(el);
  wrapper.appendChild(label);
  grid.appendChild(wrapper);
  paneElements[pane.id] = el;
}

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
  for (const pane of PANES) {
    renderingEngine.enableElement({
      viewportId: pane.id,
      type: ViewportType.SLICER,
      element: paneElements[pane.id],
      defaultOptions: {
        background: [0, 0, 0] as Types.Point3,
      },
    });
    toolGroup.addViewport(pane.id, renderingEngineId);
  }

  const viewports = PANES.map(
    (p) =>
      renderingEngine.getViewport(p.id) as unknown as Types.ISlicerViewport
  );
  viewports.forEach((vp, i) => {
    vp.setServer(SLICER_SERVER);
    vp.setRenderMode(PANES[i].mode);
  });

  // Pane 0 imports the study into Slicer's scene (scene-wide side
  // effect) and enables volume rendering so the 3D pane has something
  // to render. The remaining slice panes set their orientation (which
  // re-queries geometry along the chosen axis for non-axial panes) or
  // call syncFromSlicer to pick up the loaded volume. The 3D pane just
  // needs syncFromSlicer to trigger its first /threeD fetch.
  try {
    await viewports[0].loadDicomStudy({
      wadoRsRoot,
      StudyInstanceUID,
      SeriesInstanceUID,
    });
    await viewports[0].enableVolumeRendering();

    for (let i = 1; i < viewports.length; i++) {
      const pane = PANES[i];
      if (pane.mode === 'threeD') {
        await viewports[i].syncFromSlicer();
      } else if (pane.orientation && pane.orientation !== 'axial') {
        await viewports[i].setSliceParams({ orientation: pane.orientation });
      } else {
        await viewports[i].syncFromSlicer();
      }
    }
  } catch (err) {
    console.error(
      'Failed to load volume into Slicer. Is Slicer running on ' +
        `${SLICER_SERVER}? See ../slicerViewport/SETUP.md.`,
      err
    );
    return;
  }

  setActiveLeftTool(LengthTool.toolName);

  addButtonToToolbar({
    title: 'Reset All',
    onClick: () => {
      viewports.forEach((vp) => {
        vp.resetCamera();
        vp.render();
      });
    },
  });
}

run();
