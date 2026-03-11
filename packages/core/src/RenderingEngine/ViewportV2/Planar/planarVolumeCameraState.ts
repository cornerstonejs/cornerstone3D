import { vec3 } from 'gl-matrix';
import type vtkPlane from '@kitware/vtk.js/Common/DataModel/Plane';
import vtkPlaneFactory from '@kitware/vtk.js/Common/DataModel/Plane';
import type vtkRenderer from '@kitware/vtk.js/Rendering/Core/Renderer';
import type vtkVolumeMapper from '@kitware/vtk.js/Rendering/Core/VolumeMapper';
import { RENDERING_DEFAULTS } from '../../../constants';
import type { ICamera, IImageVolume, Point3 } from '../../../types';
import getSpacingInNormalDirection from '../../../utilities/getSpacingInNormalDirection';
import {
  getCpuEquivalentParallelScale,
  getOrthogonalVolumeSliceGeometry,
} from './planarAdapterCoordinateTransforms';
import { getPlanarCameraVectors } from './planarCameraOrientation';
import { rotatePlanarViewUp } from './planarCameraPresentation';
import type { PlanarCamera, PlanarCameraState } from './PlanarViewportV2Types';

const MIN_CAMERA_DISTANCE = 1;
const MIN_SLICE_SPACING = 1e-6;
type PlanarViewState = Pick<
  PlanarCamera,
  'imageIdIndex' | 'orientation' | 'pan' | 'rotation' | 'zoom'
>;

function getSafeCanvasDimension(value: number): number {
  return Math.max(value || 0, 1);
}

function normalizePoint(point: Point3): Point3 {
  return vec3.normalize(vec3.create(), point as unknown as vec3) as Point3;
}

function buildImageVolumeCorners(imageVolume: IImageVolume): Point3[] {
  const imageData = imageVolume.imageData;

  if (!imageData) {
    return [];
  }

  const [dx, dy, dz] = imageData.getDimensions();
  const cornersIdx = [
    [0, 0, 0],
    [dx - 1, 0, 0],
    [0, dy - 1, 0],
    [dx - 1, dy - 1, 0],
    [0, 0, dz - 1],
    [dx - 1, 0, dz - 1],
    [0, dy - 1, dz - 1],
    [dx - 1, dy - 1, dz - 1],
  ] as Point3[];

  return cornersIdx.map((it) => imageData.indexToWorld(it)) as Point3[];
}

function getImageVolumeCenter(imageVolume: IImageVolume): Point3 {
  const imageData = imageVolume.imageData;

  if (imageData) {
    const [dx, dy, dz] = imageData.getDimensions();

    return imageData.indexToWorld([
      (dx - 1) / 2,
      (dy - 1) / 2,
      (dz - 1) / 2,
    ]) as Point3;
  }

  const corners = buildImageVolumeCorners(imageVolume);

  if (!corners.length) {
    return [0, 0, 0];
  }

  const center = vec3.create();

  for (const corner of corners) {
    vec3.add(center, center, corner as unknown as vec3);
  }

  return vec3.scale(center, center, 1 / corners.length) as Point3;
}

function getSliceMetrics(args: {
  imageVolume: IImageVolume;
  viewPlaneNormal: Point3;
}) {
  const { imageVolume, viewPlaneNormal } = args;
  const corners = buildImageVolumeCorners(imageVolume);
  const spacingInNormalDirection = Math.max(
    getSpacingInNormalDirection(imageVolume, viewPlaneNormal),
    MIN_SLICE_SPACING
  );

  if (!corners.length) {
    return {
      min: 0,
      max: 0,
      spacingInNormalDirection,
      maxImageIdIndex: 0,
    };
  }

  const projectedValues = corners.map((corner) =>
    vec3.dot(corner as unknown as vec3, viewPlaneNormal as unknown as vec3)
  );
  const min = Math.min(...projectedValues);
  const max = Math.max(...projectedValues);
  const maxImageIdIndex = Math.max(
    0,
    Math.round((max - min) / spacingInNormalDirection)
  );

  return {
    min,
    max,
    spacingInNormalDirection,
    maxImageIdIndex,
  };
}

function clampImageIdIndex(
  imageIdIndex: number | undefined,
  maxImageIdIndex: number
): number {
  if (typeof imageIdIndex !== 'number') {
    return Math.round(maxImageIdIndex / 2);
  }

  return Math.min(Math.max(0, imageIdIndex), maxImageIdIndex);
}

function getBaseParallelScale(args: {
  imageVolume: IImageVolume;
  viewPlaneNormal: Point3;
  viewUp: Point3;
  canvasWidth: number;
  canvasHeight: number;
}) {
  const { imageVolume, viewPlaneNormal, viewUp, canvasWidth, canvasHeight } =
    args;
  const geometry = getOrthogonalVolumeSliceGeometry({
    dimensions: imageVolume.dimensions,
    direction: imageVolume.direction,
    spacing: imageVolume.spacing,
    viewPlaneNormal,
    viewUp,
  });

  if (!geometry) {
    return MIN_CAMERA_DISTANCE;
  }

  return getCpuEquivalentParallelScale({
    canvasHeight: getSafeCanvasDimension(canvasHeight),
    canvasWidth: getSafeCanvasDimension(canvasWidth),
    columnPixelSpacing: geometry.columnPixelSpacing,
    columns: geometry.columns,
    rowPixelSpacing: geometry.rowPixelSpacing,
    rows: geometry.rows,
  });
}

function getResolvedPanOffset(args: {
  baseCamera: PlanarCameraState;
  canvasWidth: number;
  canvasHeight: number;
  pan?: [number, number];
  rotation?: number;
  zoom?: number;
}) {
  const {
    baseCamera,
    canvasWidth,
    canvasHeight,
    pan = [0, 0],
    rotation,
    zoom = 1,
  } = args;
  const viewPlaneNormal = normalizePoint(baseCamera.viewPlaneNormal);
  const viewUp = normalizePoint(
    rotatePlanarViewUp({
      rotation,
      viewPlaneNormal,
      viewUp: baseCamera.viewUp,
    }) as Point3
  );
  let right = vec3.cross(
    vec3.create(),
    viewUp as unknown as vec3,
    viewPlaneNormal as unknown as vec3
  );

  if (vec3.length(right) === 0) {
    right = vec3.fromValues(1, 0, 0);
  }

  right = vec3.normalize(vec3.create(), right);

  const safeZoom = Math.max(zoom, 0.001);
  const [panX, panY] = pan;
  const parallelScale = baseCamera.parallelScale / safeZoom;
  const safeCanvasWidth = getSafeCanvasDimension(canvasWidth);
  const safeCanvasHeight = getSafeCanvasDimension(canvasHeight);
  const worldHeight = parallelScale * 2;
  const worldWidth = worldHeight * (safeCanvasWidth / safeCanvasHeight);
  const deltaWorld = vec3.create();

  vec3.scaleAndAdd(
    deltaWorld,
    deltaWorld,
    right,
    (panX * worldWidth) / safeCanvasWidth
  );
  vec3.scaleAndAdd(
    deltaWorld,
    deltaWorld,
    viewUp as unknown as vec3,
    (-panY * worldHeight) / safeCanvasHeight
  );

  return {
    deltaWorld: deltaWorld as Point3,
    parallelScale,
    viewPlaneNormal,
    viewUp,
  };
}

export function createPlanarVolumeCameraState(args: {
  canvasWidth: number;
  canvasHeight: number;
  imageIdIndex?: number;
  imageVolume: IImageVolume;
  orientation?: PlanarCamera['orientation'];
}): {
  baseCamera: PlanarCameraState;
  currentImageIdIndex: number;
  maxImageIdIndex: number;
} {
  const { canvasWidth, canvasHeight, imageIdIndex, imageVolume, orientation } =
    args;
  const cameraValues = getPlanarCameraVectors({
    imageVolume,
    orientation,
  });

  if (!cameraValues) {
    return {
      baseCamera: {
        focalPoint: [0, 0, 0],
        parallelScale: MIN_CAMERA_DISTANCE,
        position: [0, 0, MIN_CAMERA_DISTANCE],
        viewPlaneNormal: [0, 0, 1],
        viewUp: [0, -1, 0],
      },
      currentImageIdIndex: 0,
      maxImageIdIndex: 0,
    };
  }

  const viewPlaneNormal = normalizePoint(cameraValues.viewPlaneNormal);
  const viewUp = normalizePoint(cameraValues.viewUp);
  const { max, maxImageIdIndex, min, spacingInNormalDirection } =
    getSliceMetrics({
      imageVolume,
      viewPlaneNormal,
    });
  const currentImageIdIndex = clampImageIdIndex(imageIdIndex, maxImageIdIndex);
  const center = getImageVolumeCenter(imageVolume);
  const centerProjection = vec3.dot(
    center as unknown as vec3,
    viewPlaneNormal as unknown as vec3
  );
  const targetProjection = Math.min(
    max,
    min + currentImageIdIndex * spacingInNormalDirection
  );
  const scalarOffset = targetProjection - centerProjection;
  const focalPoint = vec3.scaleAndAdd(
    vec3.create(),
    center as unknown as vec3,
    viewPlaneNormal as unknown as vec3,
    scalarOffset
  ) as Point3;
  const cameraDistance = Math.max(max - min, spacingInNormalDirection, 1);
  const position = vec3.scaleAndAdd(
    vec3.create(),
    focalPoint as unknown as vec3,
    viewPlaneNormal as unknown as vec3,
    cameraDistance
  ) as Point3;

  return {
    baseCamera: {
      focalPoint,
      parallelScale: getBaseParallelScale({
        imageVolume,
        viewPlaneNormal,
        viewUp,
        canvasWidth,
        canvasHeight,
      }),
      position,
      viewPlaneNormal,
      viewUp,
    },
    currentImageIdIndex,
    maxImageIdIndex,
  };
}

export function resolvePlanarVolumeCamera(args: {
  baseCamera?: PlanarCameraState;
  canvasWidth: number;
  canvasHeight: number;
  viewState?: Pick<PlanarViewState, 'pan' | 'rotation' | 'zoom'>;
}): ICamera | undefined {
  const { baseCamera, canvasWidth, canvasHeight, viewState } = args;

  if (!baseCamera) {
    return;
  }
  const { deltaWorld, parallelScale, viewPlaneNormal, viewUp } =
    getResolvedPanOffset({
      baseCamera,
      canvasWidth,
      canvasHeight,
      pan: viewState?.pan,
      rotation: viewState?.rotation,
      zoom: viewState?.zoom,
    });

  return {
    focalPoint: vec3.subtract(
      vec3.create(),
      baseCamera.focalPoint as unknown as vec3,
      deltaWorld as unknown as vec3
    ) as Point3,
    parallelProjection: true,
    parallelScale,
    position: vec3.subtract(
      vec3.create(),
      baseCamera.position as unknown as vec3,
      deltaWorld as unknown as vec3
    ) as Point3,
    viewPlaneNormal,
    viewUp,
  };
}

export function applyPlanarVolumeCameraToRenderer(args: {
  baseCamera?: PlanarCameraState;
  canvas: HTMLCanvasElement;
  renderer: vtkRenderer;
  viewState?: Pick<PlanarViewState, 'pan' | 'rotation' | 'zoom'>;
}): ICamera | undefined {
  const { baseCamera, canvas, renderer, viewState } = args;
  const resolvedCamera = resolvePlanarVolumeCamera({
    baseCamera,
    canvasWidth: canvas.clientWidth || canvas.width,
    canvasHeight: canvas.clientHeight || canvas.height,
    viewState,
  });

  if (!resolvedCamera) {
    return;
  }

  const vtkCamera = renderer.getActiveCamera();

  vtkCamera.setParallelProjection(true);
  vtkCamera.setDirectionOfProjection(
    -resolvedCamera.viewPlaneNormal[0],
    -resolvedCamera.viewPlaneNormal[1],
    -resolvedCamera.viewPlaneNormal[2]
  );
  vtkCamera.setParallelScale(resolvedCamera.parallelScale);
  vtkCamera.setFocalPoint(...resolvedCamera.focalPoint);
  vtkCamera.setPosition(...resolvedCamera.position);
  vtkCamera.setViewUp(...resolvedCamera.viewUp);

  return resolvedCamera;
}

export function setPlanarVolumeCameraClippingRange(
  renderer: vtkRenderer
): void {
  const camera = renderer.getActiveCamera();

  if (camera.getParallelProjection()) {
    camera.setClippingRange(
      -RENDERING_DEFAULTS.MAXIMUM_RAY_DISTANCE,
      RENDERING_DEFAULTS.MAXIMUM_RAY_DISTANCE
    );
    return;
  }

  camera.setClippingRange(
    RENDERING_DEFAULTS.MINIMUM_SLAB_THICKNESS,
    RENDERING_DEFAULTS.MAXIMUM_RAY_DISTANCE
  );
}

function ensureClippingPlanes(mapper: vtkVolumeMapper): vtkPlane[] {
  const existingClippingPlanes = mapper.getClippingPlanes();

  if (existingClippingPlanes.length >= 2) {
    return existingClippingPlanes as vtkPlane[];
  }

  mapper.addClippingPlane(vtkPlaneFactory.newInstance());
  mapper.addClippingPlane(vtkPlaneFactory.newInstance());

  return mapper.getClippingPlanes() as vtkPlane[];
}

export function updatePlanarVolumeClippingPlanes(args: {
  camera: Pick<ICamera, 'focalPoint' | 'viewPlaneNormal'>;
  mapper: vtkVolumeMapper;
  slabThickness?: number;
}): void {
  const {
    camera,
    mapper,
    slabThickness = RENDERING_DEFAULTS.MINIMUM_SLAB_THICKNESS,
  } = args;
  const clippingPlanes = ensureClippingPlanes(mapper);
  const scaledDistance = camera.viewPlaneNormal.map(
    (value) => value * slabThickness
  ) as Point3;
  const clipPlane1Origin = [
    camera.focalPoint[0] - scaledDistance[0],
    camera.focalPoint[1] - scaledDistance[1],
    camera.focalPoint[2] - scaledDistance[2],
  ] as Point3;
  const clipPlane2Origin = [
    camera.focalPoint[0] + scaledDistance[0],
    camera.focalPoint[1] + scaledDistance[1],
    camera.focalPoint[2] + scaledDistance[2],
  ] as Point3;

  clippingPlanes[0].setNormal(...camera.viewPlaneNormal);
  clippingPlanes[0].setOrigin(...clipPlane1Origin);
  clippingPlanes[1].setNormal(
    -camera.viewPlaneNormal[0],
    -camera.viewPlaneNormal[1],
    -camera.viewPlaneNormal[2]
  );
  clippingPlanes[1].setOrigin(...clipPlane2Origin);
}

export function getPlanarVolumeTargetFocalPoint(args: {
  baseCamera?: PlanarCameraState;
  canvasWidth: number;
  canvasHeight: number;
  imageVolume: IImageVolume;
  orientation?: PlanarCamera['orientation'];
  viewState?: Pick<
    PlanarViewState,
    'imageIdIndex' | 'pan' | 'rotation' | 'zoom'
  >;
  sliceIndex?: number;
}): Point3 | undefined {
  const {
    baseCamera,
    canvasWidth,
    canvasHeight,
    imageVolume,
    orientation,
    sliceIndex,
    viewState,
  } = args;

  if (!baseCamera) {
    return;
  }

  if (sliceIndex === undefined || sliceIndex === viewState?.imageIdIndex) {
    return resolvePlanarVolumeCamera({
      baseCamera,
      canvasWidth,
      canvasHeight,
      viewState,
    })?.focalPoint as Point3 | undefined;
  }

  const { baseCamera: nextBaseCamera } = createPlanarVolumeCameraState({
    canvasWidth,
    canvasHeight,
    imageIdIndex: sliceIndex,
    imageVolume,
    orientation,
  });

  return resolvePlanarVolumeCamera({
    baseCamera: nextBaseCamera,
    canvasWidth,
    canvasHeight,
    viewState,
  })?.focalPoint as Point3 | undefined;
}
