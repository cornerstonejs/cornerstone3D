import {
  RenderingEngine,
  Enums,
  imageLoader,
  cache,
  metaData,
  utilities as csUtils,
} from '@cornerstonejs/core';
import {
  initDemo,
  createImageIdsAndCacheMetaData,
  setTitleAndDescription,
  createInfoSection,
  addButtonToToolbar,
  addManipulationBindings,
} from '../../../../utils/demo/helpers';
import * as cornerstoneTools from '@cornerstonejs/tools';

console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const {
  OneClickSegmentTool,
  WindowLevelTool,
  segmentation,
  ToolGroupManager,
  Enums: csToolsEnums,
} = cornerstoneTools;

const { ViewportType, Events: csCoreEvents } = Enums;
const { MouseBindings, KeyboardBindings } = csToolsEnums;

const oneClickToolName = OneClickSegmentTool.toolName;

/**
 * Primary mouse binding = one-click lesion segmentation. `OneClickSegmentTool`
 * needs NO configuration: it derives a one-sided intensity threshold
 * dynamically from the click (a hot lesion is segmented down from its core, so
 * the brightest voxels are never left as holes) and only accepts clicks on a
 * coherent, lesion-scale region.
 */
const oneClickToolMap = new Map([[oneClickToolName, { selected: true }]]);

const WADO_RS_ROOT = 'https://d14fa38qiwhyfd.cloudfront.net/dicomweb';

/** Whole-body PET (FDG) — single series, no CT. */
const STUDY_INSTANCE_UID =
  '1.3.6.1.4.1.14519.5.2.1.7009.2403.871108593056125491804754960339';
const SERIES_INSTANCE_UID =
  '1.3.6.1.4.1.14519.5.2.1.7009.2403.780462962868572737240023906400';

const renderingEngineId = 'oneClickSegmentRenderingEngine';
const viewportId = 'ONE_CLICK_PT';
const segmentationId = 'ONE_CLICK_SEGMENT_PT';
const toolGroupId = 'ONE_CLICK_SEGMENT_TOOL_GROUP';

let toolGroup;
let viewport;
let renderingEngine;

setTitleAndDescription(
  'One-Click Segment Tool (PET lesion segmentation)',
  'Single-click lesion segmentation on a whole-body PET series. Hover to scout candidates (the cursor previews whether a click will produce a meaningful, lesion-scale segment), click once to segment, then Shrink/Expand to fine-tune. Nothing to configure.'
);

const content = document.getElementById('content');

const viewportGrid = document.createElement('div');
viewportGrid.style.display = 'grid';
viewportGrid.style.gridTemplateColumns = '500px';
viewportGrid.style.gap = '10px';
viewportGrid.style.gridTemplateRows = '500px auto';

const element = document.createElement('div');
element.oncontextmenu = (e) => e.preventDefault();
element.style.width = '500px';
element.style.height = '500px';

const stackStatus = document.createElement('div');
/** Plain object only — never assign from `element.style` (CSSStyleDeclaration breaks Object.assign). */
Object.assign(stackStatus.style, {
  fontSize: '12px',
  fontFamily: 'ui-monospace, monospace',
  color: '#333',
  maxWidth: '500px',
  lineHeight: '1.35',
});

viewportGrid.appendChild(element);
viewportGrid.appendChild(stackStatus);
content.appendChild(viewportGrid);

function updateStackStatusLabel() {
  if (!viewport) {
    return;
  }
  const imageIds = viewport.getImageIds?.() ?? [];
  if (!imageIds.length) {
    stackStatus.textContent = 'No instances loaded';
    return;
  }
  const idx = viewport.getCurrentImageIdIndex?.() ?? 0;
  const imageId = imageIds[idx];
  let positionExtra = '';
  try {
    const { imagePositionPatient } = metaData.get('imagePlaneModule', imageId);
    if (
      Array.isArray(imagePositionPatient) &&
      imagePositionPatient.length >= 3
    ) {
      const [x, y, z] = imagePositionPatient.map((v) => Number(v).toFixed(1));
      positionExtra = ` · IPP (${x}, ${y}, ${z}) mm`;
    }
  } catch {
    // metadata may not be ready for every id
  }
  stackStatus.textContent = `Instance ${idx + 1} / ${imageIds.length}${positionExtra}`;
}

// prettier-ignore
createInfoSection(content)
  .addInstruction('Hover to scout: the cursor tells you what a click will do. A green plus = a lesion-scale region was confirmed here (one click segments it). A gray dashed circle = still evaluating (or nothing to segment yet). A red no-entry = not segmentable here (flat tissue, noise, or a sprawling non-lesion structure) — clicks there do nothing.')
  .addInstruction('Primary click on a plus: segment the lesion in 3D. The threshold is one-sided and derived from the click, so the hottest core is always included (no interior holes).')
  .addInstruction('Shrink / Expand: step the last segment along its measured growth curve — each press visibly shrinks or grows the region (the previous result is cleared and refilled, so both directions retrace exactly). Esc cancels a long-running fill.')
  .addInstruction('Window/Level (Shift+drag) changes what you see and therefore what a click captures.')
  .addInstruction('Middle mouse / Ctrl+drag: Pan · Right click: Zoom · Wheel / Alt+drag: Stack scroll');

// ==[ Cursor legend ]=========================================================

/**
 * A small inline legend mirroring the three hover cursors, so the meaning of
 * plus / evaluating / blocked is visible without hovering the image.
 */
function appendCursorLegend(container: HTMLElement) {
  const legend = document.createElement('div');
  Object.assign(legend.style, {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '18px',
    alignItems: 'center',
    margin: '4px 0 8px',
    fontSize: '13px',
    fontFamily: 'ui-monospace, monospace',
  });

  const entries: Array<{ svg: string; label: string }> = [
    {
      label: 'segmentable (click to segment)',
      svg: "<circle cx='11' cy='11' r='8' fill='none' stroke='#00b46a' stroke-width='2'/><path d='M11 7v8M7 11h8' stroke='#00b46a' stroke-width='2' stroke-linecap='round'/>",
    },
    {
      label: 'evaluating',
      svg: "<circle cx='11' cy='11' r='8' fill='none' stroke='#8a9099' stroke-width='2' stroke-dasharray='4 3'/>",
    },
    {
      label: 'not a lesion here',
      svg: "<circle cx='11' cy='11' r='8' fill='none' stroke='#ff5a5a' stroke-width='2'/><path d='M5 5l12 12' stroke='#ff5a5a' stroke-width='2' stroke-linecap='round'/>",
    },
  ];

  for (const { svg, label } of entries) {
    const item = document.createElement('span');
    Object.assign(item.style, {
      display: 'inline-flex',
      alignItems: 'center',
      gap: '6px',
    });
    item.innerHTML =
      `<svg width='22' height='22' viewBox='0 0 22 22' aria-hidden='true'>${svg}</svg>` +
      `<span>${label}</span>`;
    legend.appendChild(item);
  }

  container.appendChild(legend);
}

async function addSegmentationToState(imageIds: string[]) {
  const segImages =
    await imageLoader.createAndCacheDerivedLabelmapImages(imageIds);

  segmentation.addSegmentations([
    {
      segmentationId,
      representation: {
        type: csToolsEnums.SegmentationRepresentations.Labelmap,
        data: {
          imageIds: segImages.map((it) => it.imageId),
        },
      },
    },
  ]);
}

async function run() {
  await initDemo({});

  cornerstoneTools.addTool(OneClickSegmentTool);
  cornerstoneTools.addTool(WindowLevelTool);

  toolGroup = ToolGroupManager.createToolGroup(toolGroupId);

  addManipulationBindings(toolGroup, { toolMap: oneClickToolMap });

  toolGroup.addTool(WindowLevelTool.toolName);
  toolGroup.setToolActive(WindowLevelTool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Primary,
        modifierKey: KeyboardBindings.Shift,
      },
      {
        numTouchPoints: 1,
        modifierKey: KeyboardBindings.Shift,
      },
    ],
  });

  renderingEngine = new RenderingEngine(renderingEngineId);
  renderingEngine.setViewports([
    {
      viewportId,
      type: ViewportType.STACK,
      element,
    },
  ]);
  viewport = renderingEngine.getViewport(viewportId);
  toolGroup.addViewport(viewportId, renderingEngineId);

  // Esc cancels a long-running fill.
  document.addEventListener('keydown', (evt) => {
    if (evt.key !== 'Escape') {
      return;
    }
    const toolInstance = toolGroup?.getToolInstance?.(oneClickToolName) as {
      cancelActiveOperation?: () => boolean;
    } | null;
    if (toolInstance?.cancelActiveOperation?.() === true) {
      evt.preventDefault();
      console.info('[oneClickSegment] cancel requested (Esc)');
    }
  });

  const toolbar = document.getElementById('demo-toolbar');
  appendCursorLegend(toolbar);
  const operationsToolbar = document.createElement('div');
  Object.assign(operationsToolbar.style, {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '12px',
    alignItems: 'center',
    marginBottom: '8px',
    width: '100%',
  });
  toolbar.append(operationsToolbar);

  addButtonToToolbar({
    title: 'Shrink',
    container: operationsToolbar,
    onClick: () => {
      toolGroup.getToolInstance(oneClickToolName).shrink();
    },
  });

  addButtonToToolbar({
    title: 'Expand',
    container: operationsToolbar,
    onClick: () => {
      toolGroup.getToolInstance(oneClickToolName).expand();
    },
  });

  addButtonToToolbar({
    title: 'Clear segmentation',
    container: operationsToolbar,
    onClick: () => {
      const segmentationData =
        segmentation.state.getSegmentation(segmentationId);
      const labelmapData = segmentationData?.representationData?.Labelmap;
      if (labelmapData && 'imageIds' in labelmapData && labelmapData.imageIds) {
        labelmapData.imageIds.forEach((imageId) => {
          const image = cache.getImage(imageId);
          image?.voxelManager?.clear();
        });
        segmentation.triggerSegmentationEvents.triggerSegmentationDataModified(
          segmentationId
        );
      }
    },
  });

  // Load the single PET series directly (no CT, no series discovery).
  const imageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID: STUDY_INSTANCE_UID,
    SeriesInstanceUID: SERIES_INSTANCE_UID,
    wadoRsRoot: WADO_RS_ROOT,
  });

  if (!imageIds.length) {
    stackStatus.textContent = 'Failed to load PET series (no instances).';
    return;
  }

  // Sort into through-plane (spatial) order. The one-click 3D flood fill relies
  // on adjacent stack indices being adjacent slices in patient space, so the
  // stack must be sorted by position rather than left in load/instance order.
  let sortedImageIds = imageIds;
  try {
    sortedImageIds = csUtils.sortImageIdsAndGetSpacing(imageIds).sortedImageIds;
  } catch (err) {
    console.warn(
      '[oneClickSegment] could not sort images by position; using load order',
      err
    );
  }

  await addSegmentationToState(sortedImageIds);

  const mid = Math.max(
    0,
    Math.min(Math.floor(sortedImageIds.length / 2), sortedImageIds.length - 1)
  );
  await viewport.setStack(sortedImageIds, mid);
  cornerstoneTools.utilities.stackContextPrefetch.enable(element);

  await segmentation.addSegmentationRepresentations(viewportId, [
    {
      segmentationId,
      type: csToolsEnums.SegmentationRepresentations.Labelmap,
    },
  ]);
  segmentation.activeSegmentation.setActiveSegmentation(
    viewportId,
    segmentationId
  );
  segmentation.segmentIndex.setActiveSegmentIndex(segmentationId, 1);

  element.addEventListener(
    csCoreEvents.STACK_NEW_IMAGE,
    updateStackStatusLabel
  );

  renderingEngine.render();
  updateStackStatusLabel();
}

run();
