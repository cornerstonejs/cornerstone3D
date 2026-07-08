import type {
  PlanarViewport,
  ProjectionScale,
  Types,
} from '@cornerstonejs/core';
import {
  Enums,
  getRenderingEngine,
  RenderingEngine,
  utilities,
  viewportProjection,
} from '@cornerstonejs/core';
import * as cornerstoneTools from '@cornerstonejs/tools';
import {
  addButtonToToolbar,
  addDropdownToToolbar,
  createImageIdsAndCacheMetaData,
  ctVoiRange,
  getLocalUrl,
  initDemo,
  setTitleAndDescription,
} from '../../../../utils/demo/helpers';
import { KeyboardBindings } from '../../src/enums';

console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const {
  PanTool,
  PlanarRotateTool,
  StackScrollTool,
  ToolGroupManager,
  WindowLevelTool,
  ZoomTool,
  Enums: csToolsEnums,
} = cornerstoneTools;

const { Events, ViewportType } = Enums;
const { MouseBindings } = csToolsEnums;

const renderingEngineId = 'viewportProjectionSynchronizerRenderingEngine';
const toolGroupId = 'VIEWPORT_PROJECTION_SYNCHRONIZER_TOOL_GROUP';
const leftViewportId = 'PROJECTION_SYNC_LEFT';
const rightViewportId = 'PROJECTION_SYNC_RIGHT';
const leftDataId = 'viewport-projection-sync:left';
const rightDataId = 'viewport-projection-sync:right';
const viewportIds = [leftViewportId, rightViewportId] as const;
const viewportWidthPx = 512;
const viewportHeightPx = 512;

type SyncMode = 'left to right' | 'right to left' | 'off';

const syncModes: SyncMode[] = ['left to right', 'right to left', 'off'];

type ProjectionSyncPresentation = {
  pan?: Types.Point2;
  rotation?: number;
  scale?: Types.Point2;
  zoom?: number;
};

const projectionSelector = {
  rotation: true,
  zoom: true,
  scale: true,
  pan: true,
};

let syncMode: SyncMode = 'left to right';
let isSynchronizing = false;

const projectionInfo = new Map<string, HTMLPreElement>();

setTitleAndDescription(
  'Viewport Projection Synchronizer',
  'Demonstrates a custom tool-driven synchronizer that copies Planar Next view presentation through the viewport projection service.'
);

const content = document.getElementById('content');
const viewportGrid = document.createElement('div');
viewportGrid.style.display = 'flex';
viewportGrid.style.flexWrap = 'wrap';
viewportGrid.style.gap = '12px';
viewportGrid.style.marginTop = '12px';
content.appendChild(viewportGrid);

const leftElement = createViewportPanel(
  'Left Planar Next',
  leftViewportId,
  'rgb(20, 42, 49)'
);
const rightElement = createViewportPanel(
  'Right Planar Next',
  rightViewportId,
  'rgb(48, 36, 45)'
);

const instructions = document.createElement('p');
instructions.innerText =
  'Left drag: window/level. Middle drag: pan. Right drag: zoom. Shift + wheel: rotate. The selected sync direction copies projection presentation only.';
content.append(instructions);

/**
 * Creates a labelled viewport element and its matching projection info panel.
 */
function createViewportPanel(
  title: string,
  viewportId: string,
  backgroundColor: string
): HTMLDivElement {
  const panel = document.createElement('div');
  panel.style.display = 'flex';
  panel.style.flexDirection = 'column';
  panel.style.gap = '6px';

  const heading = document.createElement('div');
  heading.innerText = title;
  heading.style.fontWeight = '600';
  panel.appendChild(heading);

  const element = document.createElement('div');
  element.id = viewportId;
  element.oncontextmenu = (event) => event.preventDefault();
  element.style.width = `${viewportWidthPx}px`;
  element.style.height = `${viewportHeightPx}px`;
  element.style.background = backgroundColor;
  panel.appendChild(element);

  const info = document.createElement('pre');
  info.id = `${viewportId}-projection-info`;
  info.style.margin = '0';
  info.style.minHeight = '118px';
  info.style.fontSize = '12px';
  info.style.whiteSpace = 'pre-wrap';
  panel.appendChild(info);
  projectionInfo.set(viewportId, info);

  viewportGrid.appendChild(panel);

  return element;
}

/**
 * Returns the Planar Next viewport for a viewport id.
 */
function getViewport(viewportId: string): PlanarViewport {
  return getRenderingEngine(renderingEngineId).getViewport(
    viewportId
  ) as PlanarViewport;
}

/**
 * Formats a number for stable projection diagnostics.
 */
function formatNumber(value: number | undefined): string {
  return typeof value === 'number' && Number.isFinite(value)
    ? value.toFixed(2)
    : 'n/a';
}

/**
 * Formats a 2D point in the presentation payload.
 */
function formatPoint(point?: Types.Point2): string {
  if (!point) {
    return 'n/a';
  }

  return `[${point.map((value) => formatNumber(value)).join(', ')}]`;
}

/**
 * Formats the semantic projection scale tag for display.
 */
function formatScale(scale?: ProjectionScale): string {
  if (!scale) {
    return 'n/a';
  }

  return 'value' in scale
    ? `${scale.kind} (${formatNumber(scale.value)})`
    : scale.kind;
}

/**
 * Refreshes projection diagnostics for both synchronized viewports.
 */
function updateProjectionInfo(): void {
  for (const viewportId of viewportIds) {
    const viewport = getViewport(viewportId);
    const snapshot = viewportProjection.get(viewport);
    const presentation =
      viewportProjection.getPresentation<ProjectionSyncPresentation>(viewport, {
        selector: projectionSelector,
      });
    const info = projectionInfo.get(viewportId);

    if (!info) {
      continue;
    }

    info.innerText = [
      `adapter: ${snapshot?.adapterId ?? 'none'}`,
      `scale tag: ${formatScale(snapshot?.presentation.scale)}`,
      `presentation zoom: ${formatNumber(presentation?.zoom)}`,
      `presentation pan: ${formatPoint(presentation?.pan)}`,
      `presentation rotation: ${formatNumber(presentation?.rotation)}`,
      `sync mode: ${syncMode}`,
    ].join('\n');
  }
}

/**
 * Copies selected presentation fields from one Planar Next viewport to another.
 */
function syncProjection(
  sourceViewportId: string,
  targetViewportId: string
): void {
  if (isSynchronizing || syncMode === 'off') {
    return;
  }

  const sourceViewport = getViewport(sourceViewportId);
  const targetViewport = getViewport(targetViewportId);
  const sourcePresentation =
    viewportProjection.getPresentation<ProjectionSyncPresentation>(
      sourceViewport,
      {
        selector: projectionSelector,
      }
    );

  if (!sourcePresentation) {
    return;
  }

  const nextTargetState = viewportProjection.withPresentation<
    Parameters<PlanarViewport['setViewState']>[0],
    ProjectionSyncPresentation
  >(targetViewport, sourcePresentation);

  if (!nextTargetState) {
    return;
  }

  isSynchronizing = true;
  targetViewport.setViewState(nextTargetState);
  targetViewport.render();
  isSynchronizing = false;
  updateProjectionInfo();
}

/**
 * Applies the currently selected one-way projection sync direction.
 */
function syncSelectedDirection(): void {
  if (syncMode === 'left to right') {
    syncProjection(leftViewportId, rightViewportId);
  } else if (syncMode === 'right to left') {
    syncProjection(rightViewportId, leftViewportId);
  }
}

/**
 * Handles camera changes from one viewport and syncs when it is the source.
 */
function handleCameraModified(sourceViewportId: string): void {
  if (sourceViewportId === leftViewportId && syncMode === 'left to right') {
    syncProjection(leftViewportId, rightViewportId);
  } else if (
    sourceViewportId === rightViewportId &&
    syncMode === 'right to left'
  ) {
    syncProjection(rightViewportId, leftViewportId);
  }

  updateProjectionInfo();
}

/**
 * Resets both viewports and refreshes the projection diagnostics.
 */
function resetProjectionSync(): void {
  for (const viewportId of viewportIds) {
    const viewport = getViewport(viewportId);

    viewport.resetViewState();
    viewport.render();
  }

  updateProjectionInfo();
}

addDropdownToToolbar({
  labelText: 'Projection Sync',
  options: {
    values: syncModes,
    defaultValue: syncMode,
  },
  onSelectedValueChange: (value) => {
    syncMode = value as SyncMode;
    syncSelectedDirection();
    updateProjectionInfo();
  },
});

addButtonToToolbar({
  title: 'Copy Projection Once',
  onClick: syncSelectedDirection,
});

addButtonToToolbar({
  title: 'Reset Both',
  onClick: resetProjectionSync,
});

/**
 * Adds the manipulation tools used to drive projection changes.
 */
function configureTools(): void {
  cornerstoneTools.addTool(PanTool);
  cornerstoneTools.addTool(PlanarRotateTool);
  cornerstoneTools.addTool(StackScrollTool);
  cornerstoneTools.addTool(WindowLevelTool);
  cornerstoneTools.addTool(ZoomTool);

  const toolGroup = ToolGroupManager.createToolGroup(toolGroupId);

  toolGroup.addTool(PanTool.toolName);
  toolGroup.addTool(PlanarRotateTool.toolName);
  toolGroup.addTool(StackScrollTool.toolName, { loop: false });
  toolGroup.addTool(WindowLevelTool.toolName);
  toolGroup.addTool(ZoomTool.toolName);

  toolGroup.setToolActive(WindowLevelTool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Primary,
      },
    ],
  });
  toolGroup.setToolActive(PanTool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Auxiliary,
      },
    ],
  });
  toolGroup.setToolActive(ZoomTool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Secondary,
      },
    ],
  });
  toolGroup.setToolActive(StackScrollTool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Wheel,
      },
    ],
  });
  toolGroup.setToolActive(PlanarRotateTool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Wheel,
        modifierKey: KeyboardBindings.Shift,
      },
    ],
  });
}

/**
 * Runs the projection synchronizer demo.
 */
async function run() {
  await initDemo();
  configureTools();

  const imageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.334240657131972136850343327463',
    SeriesInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.226151125820845824875394858561',
    wadoRsRoot:
      getLocalUrl() || 'https://d14fa38qiwhyfd.cloudfront.net/dicomweb',
  });
  const middleImageIndex = Math.floor(imageIds.length / 2);
  const renderingEngine = new RenderingEngine(renderingEngineId);

  renderingEngine.enableElement({
    viewportId: leftViewportId,
    type: ViewportType.PLANAR_NEXT,
    element: leftElement,
    defaultOptions: {
      background: [0.08, 0.17, 0.2] as Types.Point3,
    },
  });
  renderingEngine.enableElement({
    viewportId: rightViewportId,
    type: ViewportType.PLANAR_NEXT,
    element: rightElement,
    defaultOptions: {
      background: [0.19, 0.14, 0.18] as Types.Point3,
    },
  });

  const toolGroup = ToolGroupManager.getToolGroup(toolGroupId);
  viewportIds.forEach((viewportId) => {
    toolGroup.addViewport(viewportId, renderingEngineId);
  });

  utilities.genericViewportDisplaySetMetadataProvider.add(leftDataId, {
    imageIds,
    kind: 'planar',
    initialImageIdIndex: middleImageIndex,
  });
  utilities.genericViewportDisplaySetMetadataProvider.add(rightDataId, {
    imageIds,
    kind: 'planar',
    initialImageIdIndex: middleImageIndex,
  });

  const leftViewport = getViewport(leftViewportId);
  const rightViewport = getViewport(rightViewportId);

  await Promise.all([
    leftViewport.setDisplaySets({
      displaySetId: leftDataId,
      options: {},
    }),
    rightViewport.setDisplaySets({
      displaySetId: rightDataId,
      options: {},
    }),
  ]);

  leftViewport.setDisplaySetPresentation(leftDataId, { voiRange: ctVoiRange });
  rightViewport.setDisplaySetPresentation(rightDataId, {
    voiRange: ctVoiRange,
  });
  const initialRightViewState = viewportProjection.withPresentation<
    Parameters<PlanarViewport['setViewState']>[0],
    ProjectionSyncPresentation
  >(rightViewport, {
    pan: [32, -18],
    rotation: 12,
    zoom: 1.25,
  });

  if (initialRightViewState) {
    rightViewport.setViewState(initialRightViewState);
  }

  leftElement.addEventListener(Events.CAMERA_MODIFIED, () => {
    handleCameraModified(leftViewportId);
  });
  rightElement.addEventListener(Events.CAMERA_MODIFIED, () => {
    handleCameraModified(rightViewportId);
  });

  cornerstoneTools.utilities.stackPrefetch.enable(leftViewport.element);
  cornerstoneTools.utilities.stackPrefetch.enable(rightViewport.element);

  leftViewport.render();
  rightViewport.render();
  updateProjectionInfo();
}

run();
