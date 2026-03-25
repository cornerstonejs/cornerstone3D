import vtkMath from '@kitware/vtk.js/Common/Core/Math';
import { MPR_CAMERA_VALUES } from '../../../constants';
import { OrientationAxis } from '../../../enums';
import { getConfiguration } from '../../../init';
import type { IImageVolume, Point3 } from '../../../types';
import { getCubeSizeInView } from '../../../utilities/getPlaneCubeIntersectionDimensions';
import type {
  Volume3DCamera,
  Volume3DVtkVolumeAdapterContext,
} from './3dViewportTypes';

const VOLUME_3D_RADIUS_MULTIPLIER = 10;

export function getInitialVolume3DCamera(
  ctx: Volume3DVtkVolumeAdapterContext,
  imageVolume: IImageVolume
): Partial<Volume3DCamera> | undefined {
  const imageData = imageVolume.imageData;

  if (!imageData) {
    return;
  }

  const vtkCamera = ctx.vtk.renderer.getActiveCamera();
  const orientation = getOrientationVectors({
    fallbackViewPlaneNormal: vtkCamera.getViewPlaneNormal() as Point3,
    fallbackViewUp: vtkCamera.getViewUp() as Point3,
    imageVolume,
    orientation: ctx.viewport.options.orientation,
  });
  const { viewPlaneNormal, viewUp } = orientation;
  const bounds = imageData.getBounds();
  const focalPoint = [0, 0, 0] as Point3;
  const dimensions = imageData.getDimensions();
  const middleIJK = dimensions.map((dimension) =>
    Math.floor(dimension / 2)
  ) as Point3;

  imageData.indexToWorld(middleIJK, focalPoint);

  let { widthWorld, heightWorld } = getCubeSizeInView(
    imageData,
    viewPlaneNormal,
    viewUp
  );

  const spacing = imageData.getSpacing();
  widthWorld = Math.max(spacing[0], widthWorld - spacing[0]);
  heightWorld = Math.max(spacing[1], heightWorld - spacing[1]);

  const canvasWidth =
    ctx.vtk.canvas.width || ctx.viewport.element.clientWidth || 1;
  const canvasHeight =
    ctx.vtk.canvas.height || ctx.viewport.element.clientHeight || 1;
  const boundsAspectRatio = widthWorld / heightWorld;
  const canvasAspectRatio = canvasWidth / canvasHeight;
  const scaleFactor = boundsAspectRatio / canvasAspectRatio;
  const insetImageMultiplier = getConfiguration().rendering?.useLegacyCameraFOV
    ? 1.1
    : 1;
  const parallelScale =
    scaleFactor < 1
      ? (insetImageMultiplier * heightWorld) / 2
      : (insetImageMultiplier * heightWorld * scaleFactor) / 2;
  const radius = getBoundsRadius(bounds) * VOLUME_3D_RADIUS_MULTIPLIER;
  const distance = insetImageMultiplier * radius;
  const viewUpToUse =
    Math.abs(vtkMath.dot(viewUp, viewPlaneNormal)) > 0.999
      ? ([-viewUp[2], viewUp[0], viewUp[1]] as Point3)
      : viewUp;
  const position = [
    focalPoint[0] + distance * viewPlaneNormal[0],
    focalPoint[1] + distance * viewPlaneNormal[1],
    focalPoint[2] + distance * viewPlaneNormal[2],
  ] as Point3;

  if ('setPhysicalScale' in vtkCamera) {
    (
      vtkCamera as typeof vtkCamera & {
        setPhysicalScale(value: number): void;
        setPhysicalTranslation(x: number, y: number, z: number): void;
      }
    ).setPhysicalScale(radius);
    (
      vtkCamera as typeof vtkCamera & {
        setPhysicalScale(value: number): void;
        setPhysicalTranslation(x: number, y: number, z: number): void;
      }
    ).setPhysicalTranslation(-focalPoint[0], -focalPoint[1], -focalPoint[2]);
  }

  return {
    focalPoint,
    parallelProjection: ctx.viewport.options.parallelProjection ?? true,
    parallelScale,
    position,
    viewAngle: 90,
    viewPlaneNormal,
    viewUp: viewUpToUse,
  };
}

function getOrientationVectors(args: {
  fallbackViewPlaneNormal: Point3;
  fallbackViewUp: Point3;
  imageVolume: IImageVolume;
  orientation: Volume3DVtkVolumeAdapterContext['viewport']['options']['orientation'];
}): Pick<Volume3DCamera, 'viewPlaneNormal' | 'viewUp'> {
  const { fallbackViewPlaneNormal, fallbackViewUp, imageVolume, orientation } =
    args;

  if (!orientation) {
    return {
      viewPlaneNormal: fallbackViewPlaneNormal,
      viewUp: fallbackViewUp,
    };
  }

  if (typeof orientation === 'object' && orientation.viewPlaneNormal) {
    return {
      viewPlaneNormal: [...orientation.viewPlaneNormal] as Point3,
      viewUp: orientation.viewUp
        ? ([...orientation.viewUp] as Point3)
        : fallbackViewUp,
    };
  }

  if (orientation === OrientationAxis.ACQUISITION) {
    const { direction } = imageVolume;

    return {
      viewPlaneNormal: direction.slice(6, 9).map((x) => -x) as Point3,
      viewUp: direction.slice(3, 6).map((x) => -x) as Point3,
    };
  }

  const cameraValues =
    orientation === OrientationAxis.AXIAL_REFORMAT
      ? MPR_CAMERA_VALUES.axial
      : orientation === OrientationAxis.SAGITTAL_REFORMAT
        ? MPR_CAMERA_VALUES.sagittal
        : orientation === OrientationAxis.CORONAL_REFORMAT
          ? MPR_CAMERA_VALUES.coronal
          : typeof orientation === 'string'
            ? MPR_CAMERA_VALUES[orientation]
            : undefined;

  if (!cameraValues) {
    return {
      viewPlaneNormal: fallbackViewPlaneNormal,
      viewUp: fallbackViewUp,
    };
  }

  return {
    viewPlaneNormal: [...cameraValues.viewPlaneNormal] as Point3,
    viewUp: [...cameraValues.viewUp] as Point3,
  };
}

function getBoundsRadius(bounds: number[]): number {
  const width = (bounds[1] - bounds[0]) ** 2;
  const height = (bounds[3] - bounds[2]) ** 2;
  const depth = (bounds[5] - bounds[4]) ** 2;

  return Math.sqrt(width + height + depth || 1) * 0.5;
}
