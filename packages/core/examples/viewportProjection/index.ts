import type {
  PlanarViewport,
  ProjectionPosition,
  ProjectionScale,
  ProjectionSnapshot,
  Types,
  GenericVolumeViewport3D,
} from '@cornerstonejs/core';
import {
  CONSTANTS,
  Enums,
  getRenderingEngine,
  RenderingEngine,
  utilities,
  viewportProjection,
} from '@cornerstonejs/core';
import {
  addButtonToToolbar,
  createImageIdsAndCacheMetaData,
  ctVoiRange,
  getLocalUrl,
  initDemo,
  setTitleAndDescription,
} from '../../../../utils/demo/helpers';

console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const { Events, OrientationAxis, ViewportType } = Enums;

const renderingEngineId = 'viewportProjectionRenderingEngine';
const planarViewportId = 'PROJECTION_PLANAR_NEXT';
const volumeViewportId = 'PROJECTION_VOLUME_3D_NEXT';
const planarDataId = 'viewport-projection:planar';
const volumeDataId = 'viewport-projection:volume3d';
const volumeId = 'cornerstoneStreamingImageVolume:VIEWPORT_PROJECTION_VOLUME';
const viewportWidthPx = 560;
const viewportHeightPx = 420;
const volumePresetName = 'CT-Bone';

const projectionInfo = new Map<string, HTMLPreElement>();
let projectionUpdateCount = 0;
let lastProjectionAction = 'initial load';

type CanvasSizedProjectionSnapshot = ProjectionSnapshot & {
  canvasHeight?: number;
  canvasWidth?: number;
};
type PlanarProjectionPatch = {
  pan?: Types.Point2;
  rotation?: number;
  zoom?: number;
};
type Volume3DProjectionPatch = {
  camera?: Parameters<GenericVolumeViewport3D['setViewState']>[0];
};

setTitleAndDescription(
  'Viewport Projection Service',
  'Shows how Planar Next and Volume 3D Next viewports expose projection snapshots and write compatible presentation changes through the shared projection service.'
);

const content = document.getElementById('content');
const viewportGrid = document.createElement('div');
viewportGrid.style.display = 'flex';
viewportGrid.style.flexWrap = 'wrap';
viewportGrid.style.gap = '12px';
viewportGrid.style.marginTop = '12px';
content.appendChild(viewportGrid);

const planarElement = createViewportPanel(
  'Planar Next',
  planarViewportId,
  'rgb(20, 44, 50)'
);
const volumeElement = createViewportPanel(
  'Volume 3D Next',
  volumeViewportId,
  'rgb(45, 34, 56)'
);

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
  element.style.width = `${viewportWidthPx}px`;
  element.style.height = `${viewportHeightPx}px`;
  element.style.background = backgroundColor;
  panel.appendChild(element);

  const info = document.createElement('pre');
  info.id = `${viewportId}-projection-info`;
  info.style.margin = '0';
  info.style.minHeight = '154px';
  info.style.fontSize = '12px';
  info.style.whiteSpace = 'pre-wrap';
  panel.appendChild(info);
  projectionInfo.set(viewportId, info);

  viewportGrid.appendChild(panel);

  return element;
}

/**
 * Returns a rounded number string for compact projection diagnostics.
 */
function formatNumber(value: number | undefined): string {
  return typeof value === 'number' && Number.isFinite(value)
    ? value.toFixed(2)
    : 'n/a';
}

/**
 * Formats a 2D or 3D point without assuming which projection space produced it.
 */
function formatPoint(point?: Types.Point2 | Types.Point3): string {
  if (!point) {
    return 'n/a';
  }

  return `[${point.map((value) => formatNumber(value)).join(', ')}]`;
}

/**
 * Formats the semantic scale tag exposed by a projection snapshot.
 */
function formatScale(scale?: ProjectionScale): string {
  if (!scale) {
    return 'n/a';
  }

  if ('value' in scale) {
    return `${scale.kind} (${formatNumber(scale.value)})`;
  }

  if (scale.kind === 'physical') {
    return `${scale.kind} (${formatNumber(scale.mmPerCanvasPixel)} mm/px)`;
  }

  return `${scale.kind} (${formatNumber(scale.pixelsPerCanvasPixel)} px/px)`;
}

/**
 * Formats the semantic position tag exposed by a projection snapshot.
 */
function formatPosition(position?: ProjectionPosition): string {
  if (!position) {
    return 'n/a';
  }

  if (position.kind === 'focalPoint') {
    return `${position.kind} ${formatPoint(position.worldPoint)}`;
  }

  if (position.kind === 'imagePoint') {
    return `${position.kind} image=${formatPoint(
      position.imagePoint
    )} canvas=${formatPoint(position.canvasPoint)}`;
  }

  return `${position.kind} world=${formatPoint(
    position.worldPoint
  )} canvas=${formatPoint(position.canvasPoint)}`;
}

/**
 * Lists enabled coordinate spaces from a projection snapshot.
 */
function formatSpaces(snapshot?: ProjectionSnapshot): string {
  if (!snapshot) {
    return 'none';
  }

  return (
    Object.entries(snapshot.spaces)
      .filter(([, enabled]) => enabled)
      .map(([space]) => space)
      .join(', ') || 'none'
  );
}

/**
 * Reads the world coordinate below the center canvas point when available.
 */
function getCenterWorld(
  snapshot?: ProjectionSnapshot
): Types.Point3 | undefined {
  if (!snapshot?.transforms?.canvasToWorld) {
    return;
  }

  const canvasSizedSnapshot = snapshot as CanvasSizedProjectionSnapshot;

  return snapshot.transforms.canvasToWorld([
    (canvasSizedSnapshot.canvasWidth ?? 0) / 2,
    (canvasSizedSnapshot.canvasHeight ?? 0) / 2,
  ]);
}

/**
 * Converts a projection snapshot into the compact text shown below a viewport.
 */
function formatSnapshot(label: string, snapshot?: ProjectionSnapshot): string {
  const presentation = snapshot?.presentation;

  return [
    label,
    `lastAction: ${lastProjectionAction}`,
    `snapshotRefresh: ${projectionUpdateCount}`,
    `adapter: ${snapshot?.adapterId ?? 'none'}`,
    `viewportType: ${snapshot?.viewportType ?? 'n/a'}`,
    `spaces: ${formatSpaces(snapshot)}`,
    `scale: ${formatScale(presentation?.scale)}`,
    `position: ${formatPosition(presentation?.position)}`,
    `rotation: ${formatNumber(presentation?.rotation)}`,
    `rendererCamera: ${snapshot?.rendererCamera ? 'yes' : 'no'}`,
    `center canvas -> world: ${formatPoint(getCenterWorld(snapshot))}`,
  ].join('\n');
}

/**
 * Looks up the Planar Next viewport used by this example.
 */
function getPlanarViewport(): PlanarViewport {
  return getRenderingEngine(renderingEngineId).getViewport(
    planarViewportId
  ) as PlanarViewport;
}

/**
 * Looks up the Volume 3D Next viewport used by this example.
 */
function getVolumeViewport(): GenericVolumeViewport3D {
  return getRenderingEngine(renderingEngineId).getViewport(
    volumeViewportId
  ) as GenericVolumeViewport3D;
}

/**
 * Refreshes projection snapshots through the projection service and updates the page.
 */
function updateProjectionInfo(action = 'manual snapshot refresh'): void {
  projectionUpdateCount += 1;
  lastProjectionAction = action;

  const planarSnapshot = viewportProjection.get(getPlanarViewport());
  const volumeSnapshot = viewportProjection.get(getVolumeViewport());
  const planarInfo = projectionInfo.get(planarViewportId);
  const volumeInfo = projectionInfo.get(volumeViewportId);

  if (planarInfo) {
    planarInfo.innerText = formatSnapshot('Planar projection', planarSnapshot);
  }

  if (volumeInfo) {
    volumeInfo.innerText = formatSnapshot(
      'Volume 3D projection',
      volumeSnapshot
    );
  }
}

/**
 * Applies a Planar presentation patch through the projection service before mutating the viewport.
 */
function applyPlanarProjectionPatch(): void {
  const viewport = getPlanarViewport();
  const nextViewState = viewportProjection.withPresentation<
    Parameters<PlanarViewport['setViewState']>[0],
    PlanarProjectionPatch
  >(viewport, {
    pan: [40, -24],
    rotation: 25,
    zoom: 1.55,
  });

  if (!nextViewState) {
    return;
  }

  viewport.setViewState(nextViewState);
  viewport.render();
  updateProjectionInfo('patch planar projection');
}

/**
 * Applies a Volume 3D camera patch through the projection service before mutating the viewport.
 */
function applyVolumeProjectionPatch(): void {
  const viewport = getVolumeViewport();
  const snapshot = viewportProjection.get(viewport);
  const parallelScale = snapshot?.rendererCamera?.parallelScale;

  if (typeof parallelScale !== 'number') {
    return;
  }

  const nextViewState = viewportProjection.withPresentation<
    Parameters<GenericVolumeViewport3D['setViewState']>[0],
    Volume3DProjectionPatch
  >(viewport, {
    camera: {
      parallelScale: parallelScale * 0.75,
    },
  });

  if (!nextViewState) {
    return;
  }

  viewport.setViewState(nextViewState);
  viewport.render();
  updateProjectionInfo('zoom 3d projection');
}

/**
 * Restores both viewports and refreshes the projection diagnostics.
 */
function resetProjectionViewports(): void {
  getPlanarViewport().resetViewState();
  getVolumeViewport().resetViewState();
  updateProjectionInfo('reset projection viewports');
}

/**
 * Applies a volume-rendering preset to the current Volume 3D actor.
 */
function applyVolumeRenderingPreset(viewport: GenericVolumeViewport3D): void {
  const preset = CONSTANTS.VIEWPORT_PRESETS.find(
    ({ name }) => name === volumePresetName
  );
  const actorEntry = viewport.getDefaultActor();

  if (!preset || !actorEntry?.actor) {
    return;
  }

  utilities.applyPreset(actorEntry.actor as never, preset);
}

addButtonToToolbar({
  title: 'Patch Planar Projection',
  onClick: applyPlanarProjectionPatch,
});

addButtonToToolbar({
  title: 'Zoom 3D Projection',
  onClick: applyVolumeProjectionPatch,
});

addButtonToToolbar({
  title: 'Refresh Snapshots',
  onClick: () => updateProjectionInfo('manual snapshot refresh'),
});

addButtonToToolbar({
  title: 'Reset',
  onClick: resetProjectionViewports,
});

/**
 * Runs the projection service demo.
 */
async function run() {
  await initDemo();

  const [planarImageIds, volumeImageIds] = await Promise.all([
    createImageIdsAndCacheMetaData({
      StudyInstanceUID:
        '1.3.6.1.4.1.14519.5.2.1.7009.2403.334240657131972136850343327463',
      SeriesInstanceUID:
        '1.3.6.1.4.1.14519.5.2.1.7009.2403.226151125820845824875394858561',
      wadoRsRoot:
        getLocalUrl() || 'https://d14fa38qiwhyfd.cloudfront.net/dicomweb',
    }),
    createImageIdsAndCacheMetaData({
      StudyInstanceUID:
        '1.3.6.1.4.1.14519.5.2.1.7009.2403.871108593056125491804754960339',
      SeriesInstanceUID:
        '1.3.6.1.4.1.14519.5.2.1.7009.2403.367700692008930469189923116409',
      wadoRsRoot: 'https://d14fa38qiwhyfd.cloudfront.net/dicomweb',
    }),
  ]);
  const middleImageIndex = Math.floor(planarImageIds.length / 2);
  const renderingEngine = new RenderingEngine(renderingEngineId);

  renderingEngine.enableElement({
    viewportId: planarViewportId,
    type: ViewportType.PLANAR_NEXT,
    element: planarElement,
    defaultOptions: {
      background: [0.08, 0.17, 0.2] as Types.Point3,
    },
  });
  renderingEngine.enableElement({
    viewportId: volumeViewportId,
    type: ViewportType.VOLUME_3D_NEXT,
    element: volumeElement,
    defaultOptions: {
      background: [0.18, 0.13, 0.22] as Types.Point3,
      orientation: OrientationAxis.CORONAL,
      parallelProjection: true,
    },
  });

  const planarViewport = getPlanarViewport();
  const volumeViewport = getVolumeViewport();

  utilities.genericViewportDataSetMetadataProvider.add(planarDataId, {
    imageIds: planarImageIds,
    kind: 'planar',
    initialImageIdIndex: middleImageIndex,
  });
  utilities.genericViewportDataSetMetadataProvider.add(volumeDataId, {
    imageIds: volumeImageIds,
    volumeId,
  });

  await Promise.all([
    planarViewport.setDisplaySets({
      displaySetId: planarDataId,
      options: {},
    }),
    volumeViewport.setDisplaySets({
      displaySetId: volumeDataId,
      options: {
        renderMode: 'vtkVolume3d',
      },
    }),
  ]);

  planarViewport.setDisplaySetPresentation(planarDataId, {
    voiRange: ctVoiRange,
  });
  volumeViewport.setDisplaySetPresentation(volumeDataId, {
    sampleDistanceMultiplier: 1,
  });
  applyVolumeRenderingPreset(volumeViewport);

  planarElement.addEventListener(Events.CAMERA_MODIFIED, () =>
    updateProjectionInfo('planar camera modified')
  );
  volumeElement.addEventListener(Events.CAMERA_MODIFIED, () =>
    updateProjectionInfo('volume camera modified')
  );

  planarViewport.render();
  volumeViewport.render();
  updateProjectionInfo('initial render');
}

run();
