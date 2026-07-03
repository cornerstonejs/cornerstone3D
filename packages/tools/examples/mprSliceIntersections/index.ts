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
  SliceIntersectionTool,
} = cornerstoneTools;

const { MouseBindings } = csToolsEnums;
const { ViewportType, OrientationAxis } = Enums;

const volumeId = 'cornerstoneStreamingImageVolume:MPR_SLICE_INTERSECTION_CT';
const mprDataId = 'mprSliceIntersections:ct-mpr';
const toolGroupId = 'MPR_SLICE_INTERSECTION_TOOLGROUP_ID';
const viewportIds = ['CT_AXIAL', 'CT_SAGITTAL', 'CT_CORONAL'];
const orientations = [
  OrientationAxis.AXIAL,
  OrientationAxis.SAGITTAL,
  OrientationAxis.CORONAL,
];
const renderingEngineId = 'myRenderingEngine';

// ======== Set up page ======== //
setTitleAndDescription(
  'MPR Slice Intersections (mprTriad)',
  'SliceIntersectionTool with the mprTriad source policy on native PLANAR_NEXT (generic) viewports: each viewport of the axial / sagittal / coronal triad shows the intersection lines of the other two canonical MPR planes, computed as true plane-plane intersections.'
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
  - Each viewport shows the slice planes of the other two canonical MPR viewports.
  - Drag a line to scroll that source plane; drag its round handles to rotate it.
  - Slab thickness handles (hollow) adjust the MIP slab of the source viewport.
  `;

content.append(instructions);

/**
 * Runs the demo
 */
async function run() {
  await initDemo();

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

  toolGroup.addTool(SliceIntersectionTool.toolName, {
    sourcePolicy: 'mprTriad',
  });

  toolGroup.setToolActive(SliceIntersectionTool.toolName, {
    bindings: [{ mouseButton: MouseBindings.Primary }],
  });

  renderingEngine.render();
}

run();
