import vtkDataArray from '@kitware/vtk.js/Common/Core/DataArray';
import vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';
import vtkImageSlice from '@kitware/vtk.js/Rendering/Core/ImageSlice';
import { type Types, utilities } from '@cornerstonejs/core';
import { vec3 } from 'gl-matrix';
import { DIRECTION_ALIGNMENT_TOLERANCE } from '../../../stateManagement/segmentation/helpers/labelmapImageMapperSupport';

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
  getCamera?: () => Pick<
    Types.ICamera,
    'focalPoint' | 'viewPlaneNormal' | 'viewUp'
  >;
  getResolvedView?: () =>
    | {
        toICamera?: () => Pick<
          Types.ICamera,
          'focalPoint' | 'viewPlaneNormal' | 'viewUp'
        >;
      }
    | undefined;
};

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

function getSliceRenderingCamera(
  viewport: SliceRenderingViewport
):
  | Pick<Types.ICamera, 'focalPoint' | 'viewPlaneNormal' | 'viewUp'>
  | undefined {
  const resolvedCamera = viewport.getResolvedView?.()?.toICamera?.();
  const normalizedResolvedCamera =
    normalizeSliceRenderingCamera(resolvedCamera);

  if (normalizedResolvedCamera) {
    return normalizedResolvedCamera;
  }

  const legacyCamera = viewport.getCamera?.();
  const normalizedLegacyCamera = normalizeSliceRenderingCamera(legacyCamera);

  return normalizedLegacyCamera;
}

function normalizeSliceRenderingCamera(
  camera: unknown
):
  | Pick<Types.ICamera, 'focalPoint' | 'viewPlaneNormal' | 'viewUp'>
  | undefined {
  const candidate = camera as Partial<Types.ICamera> | undefined;
  const focalPoint = toPoint3(candidate?.focalPoint);
  const viewPlaneNormal = toPoint3(candidate?.viewPlaneNormal);
  const viewUp = toPoint3(candidate?.viewUp);

  if (!focalPoint || !viewPlaneNormal || !viewUp) {
    return;
  }

  return {
    focalPoint,
    viewPlaneNormal,
    viewUp,
  };
}

function toPoint3(value: unknown): Types.Point3 | undefined {
  const candidate = value as ArrayLike<number> | undefined;

  if (!candidate || typeof candidate.length !== 'number') {
    return;
  }

  if (candidate.length < 3) {
    return;
  }

  const point = [
    Number(candidate[0]),
    Number(candidate[1]),
    Number(candidate[2]),
  ] as Types.Point3;

  return point.every(Number.isFinite) ? point : undefined;
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
  const camera = getSliceRenderingCamera(viewport);

  if (!camera) {
    return;
  }

  const { viewPlaneNormal, viewUp, focalPoint } = camera;
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
  const camera = getSliceRenderingCamera(viewport);

  if (!camera) {
    return;
  }

  const zDirection = vec3.normalize(
    vec3.create(),
    camera.viewPlaneNormal as unknown as vec3
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

export {
  applyPlanarOverlayDepthOffset,
  createSliceImageData,
  getSliceRenderingCamera,
  getSliceState,
};
export type { ImageMapperSliceState, SliceRenderingViewport };
