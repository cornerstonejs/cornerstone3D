import type { PlanarViewport, Types } from '@cornerstonejs/core';
import {
  RenderingEngine,
  Enums,
  cache,
  getRenderingEngine,
  utilities,
  eventTarget,
} from '@cornerstonejs/core';
import {
  initDemo,
  createImageIdsAndCacheMetaData,
  setTitleAndDescription,
  addManipulationBindings,
  addToggleButtonToToolbar,
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
const { ViewportType, OrientationAxis, BlendModes } = Enums;

// ----------------------------------------------------------------------------
// Identifiers
// ----------------------------------------------------------------------------
const renderingEngineId = 'WC_MIP_ENGINE';
const toolGroupId = 'WC_MIP_TOOLGROUP';

const wadoRsRoot =
  getLocalUrl() || 'https://d14fa38qiwhyfd.cloudfront.net/dicomweb';
const StudyInstanceUID =
  '1.3.6.1.4.1.14519.5.2.1.7009.2403.334240657131972136850343327463';
const ctSeriesInstanceUID =
  '1.3.6.1.4.1.14519.5.2.1.7009.2403.226151125820845824875394858561';
const ptSeriesInstanceUID =
  '1.3.6.1.4.1.14519.5.2.1.7009.2403.879445243400782656317561081015';

const ctVolumeId = 'cornerstoneStreamingImageVolume:WC_MIP_CT';
const ptVolumeId = 'cornerstoneStreamingImageVolume:WC_MIP_PT';

const ctMprDataId = 'worldCrosshairMip:ct-mpr';
const ptMipDataId = 'worldCrosshairMip:pt-mip';

const ptVoiRange = { lower: 0, upper: 5 };

/** Fallback PT MIP slab thickness (mm) when the volume extent is unknown. */
const FALLBACK_MIP_SLAB_THICKNESS_MM = 400;

type ViewportSpec = {
  viewportId: string;
  title: string;
  orientation: Enums.OrientationAxis;
  isMip?: boolean;
};

const viewportSpecs: ViewportSpec[] = [
  {
    viewportId: 'CT_AXIAL',
    title: 'CT Axial',
    orientation: OrientationAxis.AXIAL,
  },
  {
    viewportId: 'CT_SAGITTAL',
    title: 'CT Sagittal',
    orientation: OrientationAxis.SAGITTAL,
  },
  {
    viewportId: 'CT_CORONAL',
    title: 'CT Coronal',
    orientation: OrientationAxis.CORONAL,
  },
  {
    viewportId: 'PT_MIP',
    title: 'PT Coronal MIP (full-volume slab)',
    orientation: OrientationAxis.CORONAL,
    isMip: true,
  },
];

const viewportIds = viewportSpecs.map(({ viewportId }) => viewportId);

// ======== Set up page ======== //
setTitleAndDescription(
  'World Crosshair on MIP',
  'The WorldCrosshairTool running on native PLANAR_NEXT viewports including a PET maximum intensity projection (full-volume slab). Clicking the MIP snaps the reference point to the hottest voxel along the line of sight - the lesion the projection actually shows - and the CT viewports jump to that anatomy. Inside the slab the MIP marker renders solid instead of dashed.'
);

const size = '380px';
const content = document.getElementById('content');
const viewportGrid = document.createElement('div');

viewportGrid.style.display = 'flex';
viewportGrid.style.flexDirection = 'row';
viewportGrid.style.gap = '4px';

const elements = viewportSpecs.map((spec) => {
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
  element.style.width = size;
  element.style.height = size;
  element.oncontextmenu = (e) => e.preventDefault();
  panel.appendChild(element);

  viewportGrid.appendChild(panel);
  return element;
});

content.appendChild(viewportGrid);

const instructions = document.createElement('p');
instructions.innerText = `
  - Click a hot lesion on the PT MIP: the reference point snaps to the hottest voxel along the line of sight and the CT viewports jump to it.
  - On the MIP the marker renders solid whenever the point lies inside the rendered slab; on the CT slices it dashes with its distance when off-slice.
  - Hold Shift and move the mouse over the MIP to sweep the point through the hottest anatomy under the cursor.
  - Toggle "Snap to intensity (MIP)" off to compare: the point then lands on the arbitrary central slab plane instead of the lesion.
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

addToggleButtonToToolbar({
  title: 'Snap to intensity (MIP)',
  defaultToggle: true,
  onClick: (toggle) => {
    const instance = getWorldCrosshairInstance();
    instance.configuration = {
      ...instance.configuration,
      snapToSlabIntensity: toggle,
    };
  },
});

addButtonToToolbar({
  title: 'Clear Reference Point',
  onClick: () => {
    getWorldCrosshairInstance().clearWorldPoint();
  },
});

/**
 * The slab must cover the whole PT volume so the MIP projects through all of
 * it: use the physical diagonal, which bounds the extent along any normal.
 */
function computeFullVolumeSlabThickness(volumeId: string): number {
  const volume = cache.getVolume(volumeId);
  if (!volume?.dimensions || !volume.spacing) {
    return FALLBACK_MIP_SLAB_THICKNESS_MM;
  }

  const physicalExtent = volume.dimensions.map(
    (dimension, index) => dimension * volume.spacing[index]
  );
  return Math.ceil(Math.hypot(...physicalExtent));
}

/**
 * Runs the demo
 */
async function run() {
  await initDemo();

  cornerstoneTools.addTool(WorldCrosshairTool);

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

  viewportSpecs.forEach((spec, index) => {
    renderingEngine.enableElement({
      viewportId: spec.viewportId,
      type: ViewportType.PLANAR_NEXT,
      element: elements[index],
      defaultOptions: {
        orientation: spec.orientation,
        background: <Types.Point3>[0, 0, 0],
      },
    });
  });

  // One shared CT MPR display set and one PT MIP display set.
  utilities.genericViewportDisplaySetMetadataProvider.add(ctMprDataId, {
    imageIds: ctImageIds,
    kind: 'planar',
    volumeId: ctVolumeId,
    initialImageIdIndex: Math.floor(ctImageIds.length / 2),
  });
  utilities.genericViewportDisplaySetMetadataProvider.add(ptMipDataId, {
    imageIds: ptImageIds,
    kind: 'planar',
    volumeId: ptVolumeId,
    initialImageIdIndex: Math.floor(ptImageIds.length / 2),
  });

  function getViewport(viewportId: string): PlanarViewport {
    return getRenderingEngine(renderingEngineId).getViewport(
      viewportId
    ) as PlanarViewport;
  }

  await Promise.all(
    viewportSpecs.map((spec) =>
      getViewport(spec.viewportId).setDisplaySets({
        displaySetId: spec.isMip ? ptMipDataId : ctMprDataId,
        options: { orientation: spec.orientation },
      })
    )
  );

  viewportSpecs.forEach((spec) => {
    const viewport = getViewport(spec.viewportId);
    if (spec.isMip) {
      // The MIP: maximum intensity blending through a slab covering the
      // whole PT volume, displayed as classic inverted-gray PET.
      viewport.setDisplaySetPresentation(ptMipDataId, {
        voiRange: ptVoiRange,
        invert: true,
        blendMode: BlendModes.MAXIMUM_INTENSITY_BLEND,
        slabThickness: computeFullVolumeSlabThickness(ptVolumeId),
      });
    } else {
      viewport.setDisplaySetPresentation(ctMprDataId, {
        voiRange: ctVoiRange,
      });
    }
    viewport.render();
  });

  const toolGroup = ToolGroupManager.createToolGroup(toolGroupId);
  addManipulationBindings(toolGroup);

  viewportIds.forEach((viewportId) => {
    toolGroup.addViewport(viewportId, renderingEngineId);
  });

  // clickToSet lets a plain primary click set the reference point; on the
  // MIP viewport the point snaps to the hottest voxel along the view normal
  // within the slab (snapToSlabIntensity, on by default).
  toolGroup.addTool(WorldCrosshairTool.toolName, { clickToSet: true });
  toolGroup.setToolActive(WorldCrosshairTool.toolName, {
    bindings: [{ mouseButton: MouseBindings.Primary }],
  });

  renderingEngine.render();
}

run();
