import type { PlanarViewport, Types } from '@cornerstonejs/core';
import {
  RenderingEngine,
  Enums,
  getRenderingEngine,
  utilities,
} from '@cornerstonejs/core';
import {
  initDemo,
  createImageIdsAndCacheMetaData,
  setTitleAndDescription,
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
  SliceIntersectionTool,
} = cornerstoneTools;

const { MouseBindings } = csToolsEnums;
const { ViewportType, OrientationAxis } = Enums;

const volumeId = 'cornerstoneStreamingImageVolume:WC_SI_CT';
const mprDataId = 'worldCrosshairAndSliceIntersections:ct-mpr';
const toolGroupId = 'WC_SI_TOOLGROUP_ID';
const viewportIds = ['CT_AXIAL', 'CT_SAGITTAL', 'CT_CORONAL'];
const orientations = [
  OrientationAxis.AXIAL,
  OrientationAxis.SAGITTAL,
  OrientationAxis.CORONAL,
];
const renderingEngineId = 'myRenderingEngine';

// ======== Set up page ======== //
setTitleAndDescription(
  'World Crosshair + Slice Intersections',
  'Both tools enabled together on native PLANAR_NEXT (generic) viewports and fully independent: the WorldCrosshairTool owns the persistent reference point, the SliceIntersectionTool owns the plane intersection lines. Dragging a line scrolls the source plane but never moves the reference point; the lines are never centered on the point.'
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
  - Click empty image space to set the reference point (yellow marker).
  - Drag an intersection line: only the source viewport plane scrolls; the reference point stays fixed in world space.
  - Scroll a viewport: the point moves off-slice (dashed marker with distance) while the intersection lines follow the cameras.
  - The two tools share nothing: clearing the point does not affect the lines and vice versa.
  `;

content.append(instructions);

addButtonToToolbar({
  title: 'Clear Reference Point',
  onClick: () => {
    ToolGroupManager.getToolGroup(toolGroupId)
      .getToolInstance(WorldCrosshairTool.toolName)
      .clearWorldPoint();
  },
});

/**
 * Runs the demo
 */
async function run() {
  await initDemo();

  cornerstoneTools.addTool(WorldCrosshairTool);
  cornerstoneTools.addTool(SliceIntersectionTool);

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

  // WorldCrosshairTool is added first so clicks in empty space set the
  // reference point; clicks near a line are handled by the
  // SliceIntersectionTool.
  toolGroup.addTool(WorldCrosshairTool.toolName);
  toolGroup.addTool(SliceIntersectionTool.toolName, {
    sourcePolicy: 'allLinked',
  });

  toolGroup.setToolActive(WorldCrosshairTool.toolName, {
    bindings: [{ mouseButton: MouseBindings.Primary }],
  });
  toolGroup.setToolActive(SliceIntersectionTool.toolName, {
    bindings: [{ mouseButton: MouseBindings.Primary }],
  });

  renderingEngine.render();
}

run();
