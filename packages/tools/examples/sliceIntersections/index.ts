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
  addDropdownToToolbar,
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

const volumeId = 'cornerstoneStreamingImageVolume:SLICE_INTERSECTION_CT';
const mprDataId = 'sliceIntersections:ct-mpr';
const toolGroupId = 'SLICE_INTERSECTION_TOOLGROUP_ID';
const viewportIds = ['CT_AXIAL', 'CT_SAGITTAL', 'CT_CORONAL'];
const orientations = [
  OrientationAxis.AXIAL,
  OrientationAxis.SAGITTAL,
  OrientationAxis.CORONAL,
];
const renderingEngineId = 'myRenderingEngine';

// ======== Set up page ======== //
setTitleAndDescription(
  'Slice Intersections',
  'The SliceIntersectionTool renders the intersection line of other viewports slice planes with the current viewport plane, running on native PLANAR_NEXT (generic) viewports. Every line is a true plane-plane intersection: there is no shared crosshair center. Drag a line to scroll the source plane; use the handles to rotate it or change its slab thickness.'
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
  - The default source policy is 'activeViewport': click or scroll a viewport to make it the active source; its slice plane is drawn in the other viewports.
  - Drag an intersection line to translate the source viewport slice plane along its normal.
  - Hover a line and drag its round handles (quarter points) to rotate the source plane.
  - Drag the hollow handles near the line midpoint to change the source viewport slab thickness (dashed boundary lines).
  - Switch the source policy in the toolbar to compare behaviors.
  `;

content.append(instructions);

addDropdownToToolbar({
  labelText: 'Source policy',
  options: {
    values: [
      'activeViewport',
      'mprTriad',
      'selectedViewports',
      'allLinked',
      'debugAll',
    ],
    defaultValue: 'activeViewport',
  },
  onSelectedValueChange: (selectedValue) => {
    const instance = ToolGroupManager.getToolGroup(toolGroupId).getToolInstance(
      SliceIntersectionTool.toolName
    );
    instance.setSourcePolicy(selectedValue);
  },
});

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

  // 'selectedViewports' policy demo data: the axial and sagittal viewports.
  toolGroup.addTool(SliceIntersectionTool.toolName, {
    selectedSourceViewportIds: [viewportIds[0], viewportIds[1]],
  });

  toolGroup.setToolActive(SliceIntersectionTool.toolName, {
    bindings: [{ mouseButton: MouseBindings.Primary }],
  });

  renderingEngine.render();
}

run();
