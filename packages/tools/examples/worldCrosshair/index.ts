import type { PlanarViewport, Types } from '@cornerstonejs/core';
import {
  RenderingEngine,
  Enums,
  getRenderingEngine,
  utilities,
  eventTarget,
} from '@cornerstonejs/core';
import {
  initDemo,
  createImageIdsAndCacheMetaData,
  setTitleAndDescription,
  addDropdownToToolbar,
  addManipulationBindings,
  addButtonToToolbar,
  ctVoiRange,
  getLocalUrl,
} from '../../../../utils/demo/helpers';
import * as cornerstoneTools from '@cornerstonejs/tools';

// This is for debugging purposes
console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const {
  ToolGroupManager,
  Enums: csToolsEnums,
  WorldCrosshairTool,
} = cornerstoneTools;

const { MouseBindings } = csToolsEnums;
const { ViewportType, OrientationAxis } = Enums;

const volumeId = 'cornerstoneStreamingImageVolume:WORLD_CROSSHAIR_CT';
const mprDataId = 'worldCrosshair:ct-mpr';
const toolGroupId = 'WORLD_CROSSHAIR_TOOLGROUP_ID';
const viewportIds = ['CT_AXIAL', 'CT_SAGITTAL', 'CT_CORONAL'];
const orientations = [
  OrientationAxis.AXIAL,
  OrientationAxis.SAGITTAL,
  OrientationAxis.CORONAL,
];
const renderingEngineId = 'myRenderingEngine';

// ======== Set up page ======== //
setTitleAndDescription(
  'World Crosshair (Reference Point)',
  'The WorldCrosshairTool stores one persistent world-space reference point, running on native PLANAR_NEXT (generic) viewports. Click to set the point; it stays fixed in world space while you scroll, pan and zoom. Points off the current slice are drawn dashed with their signed distance.'
);

const size = '500px';
const content = document.getElementById('content');
const viewportGrid = document.createElement('div');

viewportGrid.style.display = 'flex';
viewportGrid.style.flexDirection = 'row';

const elements = viewportIds.map(() => {
  const element = document.createElement('div');
  element.style.width = size;
  element.style.height = size;
  element.oncontextmenu = (e) => e.preventDefault();
  viewportGrid.appendChild(element);
  return element;
});

content.appendChild(viewportGrid);

const instructions = document.createElement('p');
instructions.innerText = `
  - Click (or click + drag) to set the reference point. Linked viewports jump to it.
  - Scroll / pan / zoom any viewport: the point does NOT move in world space.
  - When the point is off the displayed slice it is drawn dashed with its distance in mm.
  - Hold Shift and move the mouse to update the point continuously.
  - Double click the marker to jump all linked viewports back to it.
  `;

content.append(instructions);

const statusLine = document.createElement('p');
statusLine.innerText = 'Reference point: (none)';
content.append(statusLine);

eventTarget.addEventListener(
  csToolsEnums.Events.WORLD_CROSSHAIR_POINT_CHANGED,
  ((evt: CustomEvent) => {
    const { worldPoint } = evt.detail;
    statusLine.innerText = `Reference point: (${worldPoint
      .map((v: number) => v.toFixed(1))
      .join(', ')})`;
  }) as EventListener
);

eventTarget.addEventListener(
  csToolsEnums.Events.WORLD_CROSSHAIR_POINT_CLEARED,
  (() => {
    statusLine.innerText = 'Reference point: (none)';
  }) as EventListener
);

function getWorldCrosshairInstance() {
  return ToolGroupManager.getToolGroup(toolGroupId).getToolInstance(
    WorldCrosshairTool.toolName
  );
}

addButtonToToolbar({
  title: 'Clear Reference Point',
  onClick: () => {
    getWorldCrosshairInstance().clearWorldPoint();
  },
});

addButtonToToolbar({
  title: 'Jump To Reference Point',
  onClick: () => {
    getWorldCrosshairInstance().jumpLinkedViewportsToWorldPoint();
  },
});

addDropdownToToolbar({
  labelText: 'Off-slice display',
  options: {
    values: ['projectedWithDistance', 'projected', 'hide'],
    defaultValue: 'projectedWithDistance',
  },
  onSelectedValueChange: (selectedValue) => {
    const instance = getWorldCrosshairInstance();
    instance.configuration = {
      ...instance.configuration,
      offSliceDisplay: selectedValue,
    };
    cornerstoneTools.utilities.triggerAnnotationRenderForViewportIds(
      viewportIds
    );
  },
});

addDropdownToToolbar({
  labelText: 'Jump mode',
  options: {
    values: ['sliceOnly', 'centered'],
    defaultValue: 'sliceOnly',
  },
  onSelectedValueChange: (selectedValue) => {
    const instance = getWorldCrosshairInstance();
    instance.configuration = {
      ...instance.configuration,
      jumpMode: selectedValue,
    };
  },
});

/**
 * Runs the demo
 */
async function run() {
  await initDemo();

  cornerstoneTools.addTool(WorldCrosshairTool);

  const imageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.334240657131972136850343327463',
    SeriesInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.226151125820845824875394858561',
    wadoRsRoot:
      getLocalUrl() || 'https://d14fa38qiwhyfd.cloudfront.net/dicomweb',
  });

  const renderingEngine = new RenderingEngine(renderingEngineId);

  viewportIds.forEach((viewportId, index) => {
    renderingEngine.enableElement({
      viewportId,
      type: ViewportType.PLANAR_NEXT,
      element: elements[index],
      defaultOptions: {
        orientation: orientations[index],
        background: <Types.Point3>[0, 0, 0],
      },
    });
  });

  // One shared volume display set across the three MPR viewports.
  utilities.genericViewportDisplaySetMetadataProvider.add(mprDataId, {
    imageIds,
    kind: 'planar',
    volumeId,
    initialImageIdIndex: Math.floor(imageIds.length / 2),
  });

  await Promise.all(
    viewportIds.map((viewportId, index) => {
      const viewport = getRenderingEngine(renderingEngineId).getViewport(
        viewportId
      ) as PlanarViewport;
      return viewport.setDisplaySets({
        displaySetId: mprDataId,
        options: { orientation: orientations[index] },
      });
    })
  );

  viewportIds.forEach((viewportId) => {
    const viewport = getRenderingEngine(renderingEngineId).getViewport(
      viewportId
    ) as PlanarViewport;
    viewport.setDisplaySetPresentation(mprDataId, { voiRange: ctVoiRange });
  });

  const toolGroup = ToolGroupManager.createToolGroup(toolGroupId);
  addManipulationBindings(toolGroup);

  viewportIds.forEach((viewportId) => {
    toolGroup.addViewport(viewportId, renderingEngineId);
  });

  // clickToSet lets a plain primary click set the reference point; the tool
  // otherwise requires Shift, which would not match the instructions above.
  toolGroup.addTool(WorldCrosshairTool.toolName, { clickToSet: true });
  toolGroup.setToolActive(WorldCrosshairTool.toolName, {
    bindings: [{ mouseButton: MouseBindings.Primary }],
  });

  renderingEngine.render();
}

run();
