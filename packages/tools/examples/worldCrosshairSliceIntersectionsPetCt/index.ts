import type {
  GenericVolumeViewport3D,
  PlanarViewport,
  Types,
} from '@cornerstonejs/core';
import {
  RenderingEngine,
  Enums,
  CONSTANTS,
  getRenderingEngine,
  utilities,
  eventTarget,
} from '@cornerstonejs/core';
import * as cornerstoneTools from '@cornerstonejs/tools';
import {
  initDemo,
  createImageIdsAndCacheMetaData,
  setTitleAndDescription,
  addManipulationBindings,
  addToggleButtonToToolbar,
  ctVoiRange,
  getLocalUrl,
} from '../../../../utils/demo/helpers';

console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const {
  ToolGroupManager,
  WorldCrosshairTool,
  SliceIntersectionTool,
  Enums: csToolsEnums,
} = cornerstoneTools;

const { MouseBindings, KeyboardBindings } = csToolsEnums;
const { ViewportType, OrientationAxis } = Enums;

// ----------------------------------------------------------------------------
// Identifiers
// ----------------------------------------------------------------------------
const renderingEngineId = 'WC_SI_PETCT_ENGINE';
const toolGroupId = 'WC_SI_PETCT_TOOLGROUP';
const toolGroup3dId = 'WC_SI_PETCT_3D_TOOLGROUP';
const ct3dViewportId = 'CT_3D';
const ct3dDataId = 'wc-si-petct:ct-3d';
const ct3dPresetName = 'CT-Bone';

const wadoRsRoot =
  getLocalUrl() || 'https://d14fa38qiwhyfd.cloudfront.net/dicomweb';
const StudyInstanceUID =
  '1.3.6.1.4.1.14519.5.2.1.7009.2403.334240657131972136850343327463';
const ctSeriesInstanceUID =
  '1.3.6.1.4.1.14519.5.2.1.7009.2403.226151125820845824875394858561';
const ptSeriesInstanceUID =
  '1.3.6.1.4.1.14519.5.2.1.7009.2403.879445243400782656317561081015';

const ctVolumeId = 'cornerstoneStreamingImageVolume:WC_SI_PETCT_CT';
const ptVolumeId = 'cornerstoneStreamingImageVolume:WC_SI_PETCT_PT';

const ctStackDataId = 'wc-si-petct:ct-stack';
const ctMprDataId = 'wc-si-petct:ct-mpr';
const ptStackDataId = 'wc-si-petct:pt-stack';
const ptMprDataId = 'wc-si-petct:pt-mpr';

const ptVoiRange = { lower: 0, upper: 5 };

type PlanarViewportSpec = {
  viewportId: string;
  title: string;
  orientation?: Enums.OrientationAxis;
  background: Types.Point3;
};

const ctViewportSpecs: PlanarViewportSpec[] = [
  {
    viewportId: 'CT_STACK',
    title: 'CT 2D (planar stack)',
    background: [0.04, 0.04, 0.08],
  },
  {
    viewportId: 'CT_AXIAL',
    title: 'CT Axial (volume slice)',
    orientation: OrientationAxis.AXIAL,
    background: [0.06, 0, 0],
  },
  {
    viewportId: 'CT_SAGITTAL',
    title: 'CT Sagittal (volume slice)',
    orientation: OrientationAxis.SAGITTAL,
    background: [0.06, 0.06, 0],
  },
  {
    viewportId: 'CT_CORONAL',
    title: 'CT Coronal (volume slice)',
    orientation: OrientationAxis.CORONAL,
    background: [0, 0.06, 0],
  },
];

const ptViewportSpecs: PlanarViewportSpec[] = [
  {
    viewportId: 'PT_STACK',
    title: 'PT 2D (planar stack)',
    background: [0.04, 0.04, 0.08],
  },
  {
    viewportId: 'PT_AXIAL',
    title: 'PT Axial (volume slice)',
    orientation: OrientationAxis.AXIAL,
    background: [0.06, 0, 0],
  },
  {
    viewportId: 'PT_SAGITTAL',
    title: 'PT Sagittal (volume slice)',
    orientation: OrientationAxis.SAGITTAL,
    background: [0.06, 0.06, 0],
  },
  {
    viewportId: 'PT_CORONAL',
    title: 'PT Coronal (volume slice)',
    orientation: OrientationAxis.CORONAL,
    background: [0, 0.06, 0],
  },
];

const allViewportSpecs = [...ctViewportSpecs, ...ptViewportSpecs];
const allViewportIds = allViewportSpecs.map(({ viewportId }) => viewportId);

// ----------------------------------------------------------------------------
// Page chrome
// ----------------------------------------------------------------------------
setTitleAndDescription(
  'World Crosshair + Slice Intersections (PET/CT, Generic Viewports)',
  'Both new tools running exclusively on native Generic viewports. Top row: CT as a 2D planar stack, axial/sagittal/coronal volume slices, and a 3D bone-preset volume rendering that mirrors the reference point as world-space intersecting lines. Bottom row: the PT series of the same study. Viewports showing the same plane (CT + PT + 2D stack) form one plane group: each viewport shows exactly one line per other plane, and dragging a line moves every viewport of that plane together. Each tool can be toggled on and off independently.'
);

const content = document.getElementById('content');

const VIEWPORT_SIZE_PX = 300;

function createRow(): HTMLDivElement {
  const row = document.createElement('div');
  row.style.display = 'flex';
  row.style.flexDirection = 'row';
  row.style.gap = '4px';
  row.style.marginTop = '4px';
  content.appendChild(row);
  return row;
}

function createViewportPanel(
  row: HTMLDivElement,
  spec: PlanarViewportSpec
): HTMLDivElement {
  const panel = document.createElement('div');
  panel.style.display = 'flex';
  panel.style.flexDirection = 'column';
  panel.style.gap = '2px';

  const heading = document.createElement('div');
  heading.innerText = spec.title;
  heading.style.fontWeight = '600';
  heading.style.fontSize = '12px';
  panel.appendChild(heading);

  const element = document.createElement('div');
  element.id = spec.viewportId;
  element.style.width = `${VIEWPORT_SIZE_PX}px`;
  element.style.height = `${VIEWPORT_SIZE_PX}px`;
  element.oncontextmenu = (e) => e.preventDefault();
  panel.appendChild(element);

  row.appendChild(panel);
  return element;
}

const ctRow = createRow();
const ctElements = ctViewportSpecs.map((spec) =>
  createViewportPanel(ctRow, spec)
);
const ct3dElement = createViewportPanel(ctRow, {
  viewportId: ct3dViewportId,
  title: 'CT 3D (bone preset)',
  background: [0.06, 0, 0.1],
});
const ptRow = createRow();
const ptElements = ptViewportSpecs.map((spec) =>
  createViewportPanel(ptRow, spec)
);
const allElements = [...ctElements, ...ptElements];

const instructions = document.createElement('p');
instructions.innerText = `
  - Reference Point (WorldCrosshairTool): the yellow crosshair (with an optional gap at its center) initializes automatically and moves ONLY with shift: hold Shift and move (or drag) the mouse. Linked viewports jump to it and the 3D view shows it as world-space lines. Scroll/pan/zoom never move it; off-slice the lines render dashed with an optional distance label.
  - Slice Intersections (SliceIntersectionTool): each viewport shows ONE line per other plane (red = axial, yellow = sagittal, green = coronal). Dragging a line scrolls EVERY viewport of that plane (CT and PT together); hover it for rotation handles (reorients the volume slices of that plane) and slab thickness handles near the line end.
  - Use the two toggle buttons to enable/disable each tool independently; they share no state.
  `;
content.append(instructions);

const statusLine = document.createElement('p');
statusLine.innerText = 'Reference point: (none)';
content.append(statusLine);

// ----------------------------------------------------------------------------
// Toolbar
// ----------------------------------------------------------------------------
function setToolToggled(toolName: string, enabled: boolean): void {
  const toolGroup = ToolGroupManager.getToolGroup(toolGroupId);
  if (!toolGroup) {
    return;
  }

  if (enabled) {
    toolGroup.setToolActive(toolName, {
      bindings: [{ mouseButton: MouseBindings.Primary }],
    });
  } else {
    toolGroup.setToolDisabled(toolName);
  }

  getRenderingEngine(renderingEngineId)?.render();
}

addToggleButtonToToolbar({
  title: 'Reference Point',
  defaultToggle: true,
  onClick: (toggle) => {
    setToolToggled(WorldCrosshairTool.toolName, toggle);
  },
});

addToggleButtonToToolbar({
  title: 'Slice Intersections',
  defaultToggle: true,
  onClick: (toggle) => {
    setToolToggled(SliceIntersectionTool.toolName, toggle);
  },
});

addToggleButtonToToolbar({
  title: 'Off-slice distance label',
  defaultToggle: true,
  onClick: (toggle) => {
    const instance = ToolGroupManager.getToolGroup(
      toolGroupId
    )?.getToolInstance(WorldCrosshairTool.toolName);
    if (!instance) {
      return;
    }
    instance.configuration = {
      ...instance.configuration,
      offSliceDisplay: toggle ? 'projectedWithDistance' : 'projected',
    };
    cornerstoneTools.utilities.triggerAnnotationRenderForViewportIds(
      allViewportIds
    );
  },
});

addToggleButtonToToolbar({
  title: 'Reference gap',
  defaultToggle: true,
  onClick: (toggle) => {
    const instance = ToolGroupManager.getToolGroup(
      toolGroupId
    )?.getToolInstance(WorldCrosshairTool.toolName);
    if (!instance) {
      return;
    }
    instance.configuration = {
      ...instance.configuration,
      centerGapRadius: toggle ? 12 : 0,
    };
    cornerstoneTools.utilities.triggerAnnotationRenderForViewportIds(
      allViewportIds
    );
  },
});

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

// ----------------------------------------------------------------------------
// Run
// ----------------------------------------------------------------------------
async function run() {
  await initDemo();

  cornerstoneTools.addTool(WorldCrosshairTool);
  cornerstoneTools.addTool(SliceIntersectionTool);

  const [ctImageIds, ptImageIds] = await Promise.all([
    createImageIdsAndCacheMetaData({
      StudyInstanceUID,
      SeriesInstanceUID: ctSeriesInstanceUID,
      wadoRsRoot,
    }),
    createImageIdsAndCacheMetaData({
      StudyInstanceUID,
      SeriesInstanceUID: ptSeriesInstanceUID,
      wadoRsRoot,
    }),
  ]);

  const renderingEngine = new RenderingEngine(renderingEngineId);

  allViewportSpecs.forEach((spec, index) => {
    renderingEngine.enableElement({
      viewportId: spec.viewportId,
      type: ViewportType.PLANAR_NEXT,
      element: allElements[index],
      defaultOptions: {
        ...(spec.orientation ? { orientation: spec.orientation } : {}),
        background: spec.background,
      },
    });
  });

  renderingEngine.enableElement({
    viewportId: ct3dViewportId,
    type: ViewportType.VOLUME_3D_NEXT,
    element: ct3dElement,
    defaultOptions: {
      orientation: OrientationAxis.CORONAL,
      background: <Types.Point3>[0.06, 0, 0.1],
    },
  });

  // ----------------------------------------------------------------------
  // Register display-set metadata: one stack + one shared MPR display set
  // per modality.
  // ----------------------------------------------------------------------
  utilities.genericViewportDisplaySetMetadataProvider.add(ctStackDataId, {
    imageIds: ctImageIds,
    kind: 'planar',
    initialImageIdIndex: Math.floor(ctImageIds.length / 2),
  });
  utilities.genericViewportDisplaySetMetadataProvider.add(ctMprDataId, {
    imageIds: ctImageIds,
    kind: 'planar',
    volumeId: ctVolumeId,
    initialImageIdIndex: Math.floor(ctImageIds.length / 2),
  });
  utilities.genericViewportDisplaySetMetadataProvider.add(ptStackDataId, {
    imageIds: ptImageIds,
    kind: 'planar',
    initialImageIdIndex: Math.floor(ptImageIds.length / 2),
  });
  utilities.genericViewportDisplaySetMetadataProvider.add(ptMprDataId, {
    imageIds: ptImageIds,
    kind: 'planar',
    volumeId: ptVolumeId,
    initialImageIdIndex: Math.floor(ptImageIds.length / 2),
  });
  utilities.genericViewportDisplaySetMetadataProvider.add(ct3dDataId, {
    imageIds: ctImageIds,
    volumeId: ctVolumeId,
  });

  // ----------------------------------------------------------------------
  // Mount display sets
  // ----------------------------------------------------------------------
  function getPlanarViewport(viewportId: string): PlanarViewport {
    return getRenderingEngine(renderingEngineId).getViewport(
      viewportId
    ) as PlanarViewport;
  }

  async function mountViewport(
    spec: PlanarViewportSpec,
    displaySetId: string,
    voiRange: { lower: number; upper: number },
    invert = false
  ): Promise<void> {
    const viewport = getPlanarViewport(spec.viewportId);
    await viewport.setDisplaySets({
      displaySetId,
      options: spec.orientation ? { orientation: spec.orientation } : {},
    });
    viewport.setDisplaySetPresentation(displaySetId, {
      voiRange,
      ...(invert ? { invert } : {}),
    });
    viewport.render();
  }

  await Promise.all([
    ...ctViewportSpecs.map((spec) =>
      mountViewport(
        spec,
        spec.orientation ? ctMprDataId : ctStackDataId,
        ctVoiRange
      )
    ),
    ...ptViewportSpecs.map((spec) =>
      mountViewport(
        spec,
        spec.orientation ? ptMprDataId : ptStackDataId,
        ptVoiRange,
        true
      )
    ),
  ]);

  // ----------------------------------------------------------------------
  // CT 3D volume rendering (bone preset)
  // ----------------------------------------------------------------------
  const ct3dViewport = getRenderingEngine(renderingEngineId).getViewport(
    ct3dViewportId
  ) as GenericVolumeViewport3D;
  await ct3dViewport.setDisplaySets({
    displaySetId: ct3dDataId,
    options: { renderMode: 'vtkVolume3d' },
  });
  ct3dViewport.setDisplaySetPresentation(ct3dDataId, {
    sampleDistanceMultiplier: 1,
  });

  const bonePreset = CONSTANTS.VIEWPORT_PRESETS.find(
    ({ name }) => name === ct3dPresetName
  );
  const ct3dActorEntry = ct3dViewport.getDefaultActor();
  if (bonePreset && ct3dActorEntry?.actor) {
    utilities.applyPreset(ct3dActorEntry.actor as never, bonePreset);
  }
  ct3dViewport.render();

  // ----------------------------------------------------------------------
  // Tool group: both tools across all eight planar viewports
  // ----------------------------------------------------------------------
  const toolGroup = ToolGroupManager.createToolGroup(toolGroupId);
  addManipulationBindings(toolGroup);

  allViewportIds.forEach((viewportId) => {
    toolGroup.addViewport(viewportId, renderingEngineId);
  });

  // WorldCrosshairTool is added first so clicks in empty space set the
  // reference point; clicks near an intersection line are handled by the
  // SliceIntersectionTool. The 3D viewport lives in its own tool group (for
  // trackball manipulation) and receives the point through the explicit
  // threeDViewportIds list.
  toolGroup.addTool(WorldCrosshairTool.toolName, {
    threeDViewportIds: [ct3dViewportId],
  });
  toolGroup.addTool(SliceIntersectionTool.toolName);

  // The default manipulation bindings put Zoom on Shift+Primary, which would
  // swallow shift+drag; the reference point owns ALL the shift interactions
  // (it initializes automatically and moves only with shift+move /
  // shift+drag), while plain clicks belong to the slice intersections.
  toolGroup.setToolActive(cornerstoneTools.ZoomTool.toolName, {
    bindings: [{ mouseButton: MouseBindings.Secondary }],
  });
  toolGroup.setToolActive(WorldCrosshairTool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Primary,
        modifierKey: KeyboardBindings.Shift,
      },
    ],
  });
  toolGroup.setToolActive(SliceIntersectionTool.toolName, {
    bindings: [{ mouseButton: MouseBindings.Primary }],
  });

  // 3D tool group: trackball rotate / pan / zoom for the CT 3D viewport.
  const toolGroup3d = ToolGroupManager.createToolGroup(toolGroup3dId);
  addManipulationBindings(toolGroup3d, { is3DViewport: true });
  // The default manipulation bindings put stack scrolling on the mouse
  // wheel, which has no meaning for a 3D volume rendering.
  toolGroup3d.setToolDisabled(cornerstoneTools.StackScrollTool.toolName);
  toolGroup3d.addViewport(ct3dViewportId, renderingEngineId);

  // Wheel zooms the 3D volume rendering through the native view-state API
  // (the generic 3D viewport has no legacy zoom surface for the ZoomTool).
  ct3dElement.addEventListener(
    'wheel',
    (evt) => {
      evt.preventDefault();
      const viewport = getRenderingEngine(renderingEngineId).getViewport(
        ct3dViewportId
      ) as GenericVolumeViewport3D;
      const vtkCamera = viewport.getVtkActiveCamera();
      const zoomFactor = evt.deltaY > 0 ? 1.1 : 1 / 1.1;
      viewport.setViewState({
        parallelScale: vtkCamera.getParallelScale() * zoomFactor,
      });
      viewport.render();
    },
    { passive: false }
  );

  renderingEngine.render();
}

run();
