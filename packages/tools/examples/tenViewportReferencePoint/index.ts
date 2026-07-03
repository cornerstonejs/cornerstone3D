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

const volumeId = 'cornerstoneStreamingImageVolume:TEN_VIEWPORT_CT';
const mprDataId = 'tenViewportReferencePoint:ct-mpr';
const toolGroupId = 'TEN_VIEWPORT_TOOLGROUP_ID';
const renderingEngineId = 'myRenderingEngine';

// Ten viewports with mixed orientations.
const viewportConfigs: Array<{
  viewportId: string;
  orientation: Enums.OrientationAxis;
}> = [
  { viewportId: 'AXIAL_1', orientation: OrientationAxis.AXIAL },
  { viewportId: 'SAGITTAL_1', orientation: OrientationAxis.SAGITTAL },
  { viewportId: 'CORONAL_1', orientation: OrientationAxis.CORONAL },
  { viewportId: 'AXIAL_2', orientation: OrientationAxis.AXIAL },
  { viewportId: 'SAGITTAL_2', orientation: OrientationAxis.SAGITTAL },
  { viewportId: 'CORONAL_2', orientation: OrientationAxis.CORONAL },
  { viewportId: 'AXIAL_3', orientation: OrientationAxis.AXIAL },
  { viewportId: 'SAGITTAL_3', orientation: OrientationAxis.SAGITTAL },
  { viewportId: 'CORONAL_3', orientation: OrientationAxis.CORONAL },
  { viewportId: 'AXIAL_4', orientation: OrientationAxis.AXIAL },
];

const viewportIds = viewportConfigs.map(({ viewportId }) => viewportId);

// ======== Set up page ======== //
setTitleAndDescription(
  'Ten Viewport Reference Point',
  'A large grid of native PLANAR_NEXT (generic) viewports with both tools: the WorldCrosshairTool reference point appears in every linked viewport, while the SliceIntersectionTool uses the activeViewport source policy so only the active viewport draws its plane in the others. No line spaghetti.'
);

const size = '290px';
const content = document.getElementById('content');
const viewportGrid = document.createElement('div');

viewportGrid.style.display = 'grid';
viewportGrid.style.gridTemplateColumns = `repeat(5, ${size})`;
viewportGrid.style.gap = '2px';

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
  - Click anywhere to set the reference point: it appears in all ten linked viewports (dashed when off-slice).
  - Scroll viewports: the point stays fixed in world space.
  - Click or scroll a viewport to make it the active source: only its slice plane is drawn as a line in the other viewports (activeViewport policy), so ten viewports never draw ten sets of lines.
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

  viewportConfigs.forEach(({ viewportId, orientation }, index) => {
    renderingEngine.enableElement({
      viewportId,
      type: ViewportType.PLANAR_NEXT,
      element: elements[index],
      defaultOptions: {
        orientation,
        background: <Types.Point3>[0, 0, 0],
      },
    });
  });

  // One shared volume display set across all ten viewports.
  utilities.genericViewportDisplaySetMetadataProvider.add(mprDataId, {
    imageIds,
    kind: 'planar',
    volumeId,
    initialImageIdIndex: Math.floor(imageIds.length / 2),
  });

  await Promise.all(
    viewportConfigs.map(({ viewportId, orientation }) => {
      const viewport = getRenderingEngine(renderingEngineId).getViewport(
        viewportId
      ) as PlanarViewport;
      return viewport.setDisplaySets({
        displaySetId: mprDataId,
        options: { orientation },
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

  // WorldCrosshairTool first so empty-space clicks set the reference point.
  toolGroup.addTool(WorldCrosshairTool.toolName, {
    // In a large grid, jumping ten viewports on every click can be
    // disorienting; set the point without jumping.
    jumpOnSet: false,
  });
  toolGroup.addTool(SliceIntersectionTool.toolName, {
    sourcePolicy: 'activeViewport',
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
