import vtkDataArray from '@kitware/vtk.js/Common/Core/DataArray';
import vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';
import vtkImageMapper from '@kitware/vtk.js/Rendering/Core/ImageMapper';
import vtkImageSlice from '@kitware/vtk.js/Rendering/Core/ImageSlice';
import { Enums, type Types, utilities } from '@cornerstonejs/core';
import { vec3 } from 'gl-matrix';
import type { Segmentation } from '../../../types/SegmentationStateTypes';
import SegmentationRepresentations from '../../../enums/SegmentationRepresentations';
import {
  DIRECTION_ALIGNMENT_TOLERANCE,
  canRenderVolumeViewportLabelmapAsImage,
} from '../../../stateManagement/segmentation/helpers/labelmapImageMapperSupport';
import {
  getLabelmap,
  getOrCreateLabelmapVolume,
  getLabelmaps,
  getLabelmapForImageId,
  getLabelmapForVolumeId,
} from '../../../stateManagement/segmentation/helpers/labelmapSegmentationState';

const OVERLAY_RENDERER_SUFFIX = 'labelmap-image-mapper-overlay';
const PLANAR_OVERLAY_DEPTH_EPSILON = 1e-4;

type AxisMatch = {
  axis: number;
  sign: 1 | -1;
};

type ImageMapperSliceState = {
  key: string;
  xAxis: number;
  xSign: 1 | -1;
  yAxis: number;
  ySign: 1 | -1;
  sliceAxis: number;
  sliceIndex: number;
};

type SliceRenderingViewport = Types.IViewport & {
  getCamera(): Pick<Types.ICamera, 'focalPoint' | 'viewPlaneNormal' | 'viewUp'>;
};

type PlanarSliceRenderingViewport = SliceRenderingViewport & {
  addImages: (
    stackInputs: Array<{
      imageId: string;
      referencedId?: string;
      representationUID?: string;
      callback?: (args: { imageActor: vtkImageSlice }) => void;
    }>
  ) => void;
  getCurrentImageId: () => string | undefined;
  render: () => void;
  type: string;
};

function isPlanarSliceRenderingViewport(
  viewport: Types.IViewport
): viewport is PlanarSliceRenderingViewport {
  const compatibilityViewport =
    viewport as Partial<PlanarSliceRenderingViewport>;

  return (
    compatibilityViewport.type === Enums.ViewportType.PLANAR_V2 &&
    typeof compatibilityViewport.addImages === 'function' &&
    typeof compatibilityViewport.getCurrentImageId === 'function' &&
    typeof compatibilityViewport.render === 'function'
  );
}

function applyPlanarOverlayDepthOffset(
  actor: vtkImageSlice,
  viewPlaneNormal: Types.Point3,
  overlayOrder: number
): void {
  if (overlayOrder <= 0) {
    actor.setPosition(0, 0, 0);
    return;
  }

  const [x, y, z] = vec3.normalize(
    vec3.create(),
    viewPlaneNormal as unknown as vec3
  ) as Types.Point3;
  const offset = overlayOrder * PLANAR_OVERLAY_DEPTH_EPSILON;

  actor.setPosition(x * offset, y * offset, z * offset);
}

function matchAxis(
  vector: Types.Point3,
  axes: Types.Point3[]
): AxisMatch | undefined {
  let bestAxis = -1;
  let bestDot = 0;

  axes.forEach((axisVector, axis) => {
    const dot = vec3.dot(
      vector as unknown as vec3,
      axisVector as unknown as vec3
    );

    if (Math.abs(dot) > Math.abs(bestDot)) {
      bestAxis = axis;
      bestDot = dot;
    }
  });

  if (bestAxis === -1 || Math.abs(bestDot) < DIRECTION_ALIGNMENT_TOLERANCE) {
    return;
  }

  return {
    axis: bestAxis,
    sign: bestDot >= 0 ? 1 : -1,
  };
}

function getVolumeAxes(volume: Types.IImageVolume): Types.Point3[] {
  const { direction } = volume;

  return [
    [direction[0], direction[1], direction[2]],
    [direction[3], direction[4], direction[5]],
    [direction[6], direction[7], direction[8]],
  ] as Types.Point3[];
}

function getSliceState(
  viewport: SliceRenderingViewport,
  volume: Types.IImageVolume
): ImageMapperSliceState | undefined {
  const { viewPlaneNormal, viewUp, focalPoint } = viewport.getCamera();
  const xDirection = vec3.normalize(
    vec3.create(),
    vec3.cross(
      vec3.create(),
      viewPlaneNormal as unknown as vec3,
      viewUp as unknown as vec3
    )
  ) as Types.Point3;
  const yDirection = vec3.normalize(
    vec3.create(),
    viewUp as unknown as vec3
  ) as Types.Point3;
  const axes = getVolumeAxes(volume);

  const xAxis = matchAxis(xDirection, axes);
  const yAxis = matchAxis(yDirection, axes);
  const sliceAxis = matchAxis(viewPlaneNormal, axes);

  if (!xAxis || !yAxis || !sliceAxis) {
    return;
  }

  const distinctAxes = new Set([xAxis.axis, yAxis.axis, sliceAxis.axis]);
  if (distinctAxes.size !== 3) {
    return;
  }

  const continuousIndex = utilities.transformWorldToIndexContinuous(
    volume.imageData,
    focalPoint
  );
  const sliceIndex = Math.floor(continuousIndex[sliceAxis.axis] + 0.5 - 1e-6);

  if (sliceIndex < 0 || sliceIndex >= volume.dimensions[sliceAxis.axis]) {
    return;
  }

  return {
    key: [
      sliceAxis.axis,
      sliceIndex,
      xAxis.axis,
      xAxis.sign,
      yAxis.axis,
      yAxis.sign,
    ].join(':'),
    xAxis: xAxis.axis,
    xSign: xAxis.sign,
    yAxis: yAxis.axis,
    ySign: yAxis.sign,
    sliceAxis: sliceAxis.axis,
    sliceIndex,
  };
}

function createSliceImageData(
  volume: Types.IImageVolume,
  viewport: SliceRenderingViewport
): { imageData: vtkImageData; state: ImageMapperSliceState } | undefined {
  const state = getSliceState(viewport, volume);

  if (!state) {
    return;
  }

  const axisVectors = getVolumeAxes(volume);
  const { dimensions, spacing, voxelManager } = volume;
  const width = dimensions[state.xAxis];
  const height = dimensions[state.yAxis];
  const SliceDataConstructor = voxelManager.getConstructor();
  const pixelData = new SliceDataConstructor(width * height);

  const ijk: Types.Point3 = [0, 0, 0];
  ijk[state.sliceAxis] = state.sliceIndex;
  const xStart = state.xSign > 0 ? 0 : width - 1;
  const xStep = state.xSign > 0 ? 1 : -1;
  const yStart = state.ySign > 0 ? 0 : height - 1;
  const yStep = state.ySign > 0 ? 1 : -1;

  for (let y = 0, srcY = yStart; y < height; y++, srcY += yStep) {
    ijk[state.yAxis] = srcY;
    const rowOffset = y * width;
    for (let x = 0, srcX = xStart; x < width; x++, srcX += xStep) {
      ijk[state.xAxis] = srcX;
      pixelData[rowOffset + x] = Number(
        voxelManager.getAtIJK(ijk[0], ijk[1], ijk[2])
      );
    }
  }

  const originIndex: Types.Point3 = [0, 0, 0];
  originIndex[state.sliceAxis] = state.sliceIndex;
  originIndex[state.xAxis] = state.xSign > 0 ? 0 : width - 1;
  originIndex[state.yAxis] = state.ySign > 0 ? 0 : height - 1;

  const xDirection = axisVectors[state.xAxis].map(
    (value) => value * state.xSign
  ) as Types.Point3;
  const yDirection = axisVectors[state.yAxis].map(
    (value) => value * state.ySign
  ) as Types.Point3;
  const zDirection = vec3.normalize(
    vec3.create(),
    viewport.getCamera().viewPlaneNormal as unknown as vec3
  ) as Types.Point3;

  const scalarArray = vtkDataArray.newInstance({
    name: 'Pixels',
    numberOfComponents: 1,
    values: pixelData,
  });

  const imageData = vtkImageData.newInstance();
  imageData.setDimensions(width, height, 1);
  imageData.setSpacing([spacing[state.xAxis], spacing[state.yAxis], 1]);
  imageData.setDirection(
    new Float32Array([
      ...xDirection,
      ...yDirection,
      zDirection[0],
      zDirection[1],
      zDirection[2],
    ])
  );
  imageData.setOrigin(
    utilities.transformIndexToWorld(volume.imageData, originIndex)
  );
  imageData.getPointData().setScalars(scalarArray);
  imageData.modified();

  return {
    imageData,
    state,
  };
}

function createActorEntry(args: {
  imageData: vtkImageData;
  referencedId: string;
  representationUID: string;
}): Types.ActorEntry {
  const mapper = vtkImageMapper.newInstance();
  mapper.setInputData(args.imageData);
  const actor = vtkImageSlice.newInstance();
  actor.setMapper(mapper);

  return {
    uid: args.representationUID,
    actor,
    actorMapper: {
      actor,
      mapper,
      renderMode: 'vtkImage',
    },
    referencedId: args.referencedId,
    representationUID: args.representationUID,
  };
}

function getOverlayRendererId(viewportId: string): string {
  return `${viewportId}::${OVERLAY_RENDERER_SUFFIX}`;
}

function getOrCreateOverlayRenderer(viewport: Types.IVolumeViewport) {
  const renderingEngine = viewport.getRenderingEngine();
  const offscreenMultiRenderWindow =
    renderingEngine.getOffscreenMultiRenderWindow(viewport.id);
  const overlayRendererId = getOverlayRendererId(viewport.id);
  const baseRenderer = viewport.getRenderer();
  const baseViewport = baseRenderer.getViewport() as unknown as [
    number,
    number,
    number,
    number,
  ];

  let overlayRenderer =
    offscreenMultiRenderWindow.getRenderer(overlayRendererId);

  if (!overlayRenderer) {
    const renderWindow = offscreenMultiRenderWindow.getRenderWindow();

    if (renderWindow.getNumberOfLayers() < 2) {
      renderWindow.setNumberOfLayers(2);
    }

    offscreenMultiRenderWindow.addRenderer({
      viewport: baseViewport,
      id: overlayRendererId,
      background: [0, 0, 0],
    });

    overlayRenderer = offscreenMultiRenderWindow.getRenderer(overlayRendererId);
    overlayRenderer.setLayer(1);
    overlayRenderer.setPreserveDepthBuffer(false);
  }

  overlayRenderer.setActiveCamera(baseRenderer.getActiveCamera());
  overlayRenderer.setViewport(
    baseViewport[0],
    baseViewport[1],
    baseViewport[2],
    baseViewport[3]
  );

  return overlayRenderer;
}

function moveActorToOverlayRenderer(
  viewport: Types.IVolumeViewport,
  actorEntry: Types.ActorEntry
): void {
  const baseRenderer = viewport.getRenderer();
  const overlayRenderer = getOrCreateOverlayRenderer(viewport);

  baseRenderer.removeActor(actorEntry.actor as vtkImageSlice);
  overlayRenderer.addActor(actorEntry.actor as vtkImageSlice);
}

export function getVolumeLabelmapImageMapperRepresentationUIDs(
  viewport: Types.IViewport,
  segmentationId: string,
  segmentation: Segmentation
): string[] {
  if (!canRenderVolumeViewportLabelmapAsImage(viewport)) {
    return [];
  }

  return getLabelmaps(segmentation)
    .map((layer) => {
      const volume = getOrCreateLabelmapVolume(layer);
      if (!volume) {
        return;
      }

      const state = getSliceState(viewport as SliceRenderingViewport, volume);
      if (!state) {
        return;
      }

      return `${segmentationId}-${SegmentationRepresentations.Labelmap}-${layer.labelmapId}-${state.key}`;
    })
    .filter((value): value is string => !!value);
}

export function addVolumeLabelmapImageMapperActors(args: {
  viewport: Types.IViewport;
  segmentation: Segmentation;
  segmentationId: string;
}): void {
  const { viewport, segmentation, segmentationId } = args;

  if (!canRenderVolumeViewportLabelmapAsImage(viewport)) {
    return;
  }

  if (isPlanarSliceRenderingViewport(viewport)) {
    addPlanarLabelmapImageMapperActors({
      viewport,
      segmentation,
      segmentationId,
    });
    return;
  }

  getLabelmaps(segmentation).forEach((layer) => {
    const volume = getOrCreateLabelmapVolume(layer);
    if (!volume) {
      return;
    }

    const sliceData = createSliceImageData(volume, viewport);
    if (!sliceData) {
      return;
    }

    const representationUID = `${segmentationId}-${SegmentationRepresentations.Labelmap}-${layer.labelmapId}-${sliceData.state.key}`;
    const actorEntry = createActorEntry({
      imageData: sliceData.imageData,
      referencedId: layer.labelmapId,
      representationUID,
    });

    (viewport as Types.IVolumeViewport).addActor(actorEntry);
    moveActorToOverlayRenderer(viewport as Types.IVolumeViewport, actorEntry);
  });
}

export function updateVolumeLabelmapImageMapperActors(args: {
  viewport: Types.IViewport;
  segmentation: Segmentation;
  segmentationId: string;
  actorEntries?: Types.ActorEntry[];
}): void {
  const { viewport, segmentation, segmentationId, actorEntries } = args;

  if (!canRenderVolumeViewportLabelmapAsImage(viewport)) {
    return;
  }

  if (isPlanarSliceRenderingViewport(viewport)) {
    updatePlanarLabelmapImageMapperActors({
      viewport,
      segmentation,
      segmentationId,
      actorEntries,
    });
    return;
  }

  const actorEntriesByLabelmapId = new Map(
    (actorEntries ?? viewport.getActors())
      .filter((actorEntry) =>
        (actorEntry.representationUID as string | undefined)?.startsWith(
          `${segmentationId}-${SegmentationRepresentations.Labelmap}`
        )
      )
      .map((actorEntry) => [actorEntry.referencedId, actorEntry] as const)
  );

  getLabelmaps(segmentation).forEach((layer) => {
    const actorEntry = actorEntriesByLabelmapId.get(layer.labelmapId);

    if (!actorEntry) {
      return;
    }

    const volume = getOrCreateLabelmapVolume(layer);

    if (!volume) {
      return;
    }

    const sliceData = createSliceImageData(volume, viewport);

    if (!sliceData) {
      return;
    }

    const mapper = actorEntry.actor.getMapper() as vtkImageMapper;
    mapper.setInputData(sliceData.imageData);
    mapper.modified();
    actorEntry.actor.modified?.();
  });
}

export function removeVolumeLabelmapImageMapperActors(
  viewport: Types.IViewport,
  segmentationId: string
): void {
  if (!(viewport.type === Enums.ViewportType.ORTHOGRAPHIC)) {
    return;
  }

  if (!canRenderVolumeViewportLabelmapAsImage(viewport)) {
    return;
  }

  const renderingEngine = viewport.getRenderingEngine();
  const offscreenMultiRenderWindow =
    renderingEngine.getOffscreenMultiRenderWindow(viewport.id);
  const overlayRenderer = offscreenMultiRenderWindow.getRenderer(
    getOverlayRendererId(viewport.id)
  );

  if (!overlayRenderer) {
    return;
  }

  viewport
    .getActors()
    .filter((actorEntry) =>
      (actorEntry.representationUID as string | undefined)?.startsWith(
        `${segmentationId}-${SegmentationRepresentations.Labelmap}`
      )
    )
    .forEach((actorEntry) => {
      overlayRenderer.removeActor(actorEntry.actor as vtkImageSlice);
    });

  if (!overlayRenderer.getActors().length) {
    offscreenMultiRenderWindow.removeRenderer(
      getOverlayRendererId(viewport.id)
    );
  }
}

export function getLabelmapForActorReference(
  segmentation: Segmentation,
  referencedId?: string
) {
  if (!referencedId) {
    return;
  }

  return (
    getLabelmap(segmentation, referencedId) ??
    getLabelmapForImageId(segmentation, referencedId) ??
    getLabelmapForVolumeId(segmentation, referencedId) ??
    getLabelmaps(segmentation).find((layer) => layer.volumeId === referencedId)
  );
}

function addPlanarLabelmapImageMapperActors(args: {
  viewport: PlanarSliceRenderingViewport;
  segmentation: Segmentation;
  segmentationId: string;
}): void {
  const { viewport, segmentation, segmentationId } = args;
  const currentImageId = viewport.getCurrentImageId();

  if (!currentImageId) {
    return;
  }

  getLabelmaps(segmentation).forEach((layer, index) => {
    const volume = getOrCreateLabelmapVolume(layer);

    if (!volume) {
      return;
    }

    const sliceData = createSliceImageData(volume, viewport);

    if (!sliceData) {
      return;
    }

    viewport.addImages([
      {
        imageId: currentImageId,
        referencedId: layer.labelmapId,
        representationUID: `${segmentationId}-${SegmentationRepresentations.Labelmap}-${layer.labelmapId}-${sliceData.state.key}`,
        callback: ({ imageActor }) => {
          const mapper = imageActor.getMapper() as vtkImageMapper;

          mapper.setInputData(sliceData.imageData);
          mapper.modified();
          applyPlanarOverlayDepthOffset(
            imageActor,
            viewport.getCamera().viewPlaneNormal,
            index + 1
          );
        },
      },
    ]);
  });

  viewport.render();
}

function updatePlanarLabelmapImageMapperActors(args: {
  viewport: PlanarSliceRenderingViewport;
  segmentation: Segmentation;
  segmentationId: string;
  actorEntries?: Types.ActorEntry[];
}): void {
  const { viewport, segmentation, segmentationId, actorEntries } = args;
  const actorEntriesByLabelmapId = new Map(
    (actorEntries ?? viewport.getActors())
      .filter((actorEntry) =>
        (actorEntry.representationUID as string | undefined)?.startsWith(
          `${segmentationId}-${SegmentationRepresentations.Labelmap}`
        )
      )
      .map((actorEntry) => [actorEntry.referencedId, actorEntry] as const)
  );

  getLabelmaps(segmentation).forEach((layer, index) => {
    const actorEntry = actorEntriesByLabelmapId.get(layer.labelmapId);

    if (!actorEntry) {
      return;
    }

    const volume = getOrCreateLabelmapVolume(layer);

    if (!volume) {
      return;
    }

    const sliceData = createSliceImageData(volume, viewport);

    if (!sliceData) {
      return;
    }

    const mapper = actorEntry.actor.getMapper() as vtkImageMapper;

    mapper.setInputData(sliceData.imageData);
    mapper.modified();
    applyPlanarOverlayDepthOffset(
      actorEntry.actor as vtkImageSlice,
      viewport.getCamera().viewPlaneNormal,
      index + 1
    );
    actorEntry.actor.modified?.();
  });
}
