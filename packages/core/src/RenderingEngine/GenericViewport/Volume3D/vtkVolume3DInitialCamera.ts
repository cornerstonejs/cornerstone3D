import vtkMath from '@kitware/vtk.js/Common/Core/Math';
import type vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';
import { vec3 } from 'gl-matrix';
import { MPR_CAMERA_VALUES } from '../../../constants';
import { OrientationAxis } from '../../../enums';
import { getConfiguration } from '../../../init';
import type { ICamera, IImageVolume, Point3 } from '../../../types';
import { getCubeSizeInView } from '../../../utilities/getPlaneCubeIntersectionDimensions';
import hasNaNValues from '../../../utilities/hasNaNValues';
import { getVolumeCenterIJK } from '../../helpers/getVolumeCenterIJK';
import type {
  Volume3DCamera,
  Volume3DVtkVolumeAdapterContext,
} from './viewport3DTypes';

const VOLUME_3D_RADIUS_MULTIPLIER = 10;

/**
 * The view angle in degrees of the fit of a 3D viewport, at a mount and at a
 * reset.
 *
 * @internal
 */
export const VOLUME_3D_FIT_VIEW_ANGLE = 90;

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
  const { focalPoint, parallelScale, position, radius, viewUpToUse } =
    getVolume3DFitCamera(
      ctx,
      { imageData, bounds: imageData.getBounds() },
      viewPlaneNormal,
      viewUp
    );

  setVolume3DPhysicalCamera(ctx, radius, focalPoint);

  return {
    focalPoint,
    parallelProjection: ctx.viewport.options.parallelProjection ?? true,
    parallelScale,
    position,
    viewAngle: VOLUME_3D_FIT_VIEW_ANGLE,
    viewPlaneNormal,
    viewUp: viewUpToUse,
  };
}

/**
 * The camera that fits content in the canvas, as the legacy viewports fit it
 * in `resetCamera`. The extent of the content along the view up and the view
 * right fills the canvas, and the camera stands ten bounding radii away along
 * the view plane normal. With image data the extent is that of the image cube
 * and the focal point is its centre voxel. Without image data the extent and
 * the centre are those of the bounds.
 *
 * @internal
 */
export function getVolume3DFitCamera(
  ctx: Pick<Volume3DVtkVolumeAdapterContext, 'viewport' | 'vtk'>,
  content: { imageData?: vtkImageData; bounds: number[] },
  viewPlaneNormal: Point3,
  viewUp: Point3
): {
  focalPoint: Point3;
  parallelScale: number;
  position: Point3;
  radius: number;
  viewUpToUse: Point3;
} {
  const { imageData, bounds } = content;
  const focalPoint = [
    (bounds[0] + bounds[1]) / 2,
    (bounds[2] + bounds[3]) / 2,
    (bounds[4] + bounds[5]) / 2,
  ] as Point3;

  if (imageData) {
    const middleIJK = getVolumeCenterIJK(
      imageData.getDimensions(),
      imageData.getDirection(),
      viewPlaneNormal
    ) as Point3;

    imageData.indexToWorld(middleIJK, focalPoint);
  }

  const { widthWorld, heightWorld } = imageData
    ? getCubeSizeInView(imageData, viewPlaneNormal, viewUp)
    : getBoundsSizeInView(bounds, viewPlaneNormal, viewUp);

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

  return { focalPoint, parallelScale, position, radius, viewUpToUse };
}

/**
 * The focal point of a camera reset, as the legacy viewport chooses it: the
 * centre of the content when it resets the pan and the centre; the focal
 * point of the camera when it keeps the pan or both; with `resetToCenter`
 * false and `resetPan` true, the centre moved along the view plane normal
 * onto the plane of the focal point of the camera.
 *
 * @internal
 */
export function getResetFocalPoint(
  centeredFocalPoint: Point3,
  camera: Pick<ICamera, 'focalPoint' | 'viewPlaneNormal'>,
  { resetPan, resetToCenter }: { resetPan: boolean; resetToCenter: boolean }
): Point3 {
  if (resetToCenter && resetPan) {
    return centeredFocalPoint;
  }

  if (!resetPan) {
    return hasNaNValues(camera.focalPoint)
      ? centeredFocalPoint
      : camera.focalPoint;
  }

  const distanceAlongNormal = vec3.dot(
    vec3.subtract(vec3.create(), centeredFocalPoint, camera.focalPoint),
    camera.viewPlaneNormal
  );

  return [
    ...vec3.scaleAndAdd(
      vec3.create(),
      centeredFocalPoint,
      camera.viewPlaneNormal,
      -distanceAlongNormal
    ),
  ] as Point3;
}

/**
 * Sets the physical scale and translation of the vtk.js camera to the radius
 * and the focal point of a fit, as the legacy reset does.
 *
 * @internal
 */
export function setVolume3DPhysicalCamera(
  ctx: Pick<Volume3DVtkVolumeAdapterContext, 'vtk'>,
  radius: number,
  focalPoint: Point3
): void {
  const vtkCamera = ctx.vtk.renderer.getActiveCamera();

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
}

/**
 * The view plane normal and the view up of an orientation of the viewport
 * options: a named axis, a reformat axis, the acquisition plane of the volume
 * or orientation vectors. The fallback vectors answer when there is no
 * orientation or it names none of these.
 *
 * @internal
 */
export function getOrientationVectors(args: {
  fallbackViewPlaneNormal: Point3;
  fallbackViewUp: Point3;
  imageVolume?: IImageVolume;
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
    if (!imageVolume) {
      return {
        viewPlaneNormal: fallbackViewPlaneNormal,
        viewUp: fallbackViewUp,
      };
    }

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

/**
 * The width and the height of bounds in the view: their extent along the view
 * right and the view up, as the legacy viewports measure content that is not
 * an image.
 */
function getBoundsSizeInView(
  bounds: number[],
  viewPlaneNormal: Point3,
  viewUp: Point3
): { widthWorld: number; heightWorld: number } {
  const viewRight = vec3.normalize(
    vec3.create(),
    vec3.cross(vec3.create(), viewUp, viewPlaneNormal)
  );
  const viewUpUnit = vec3.normalize(vec3.create(), viewUp);
  const along = { right: [] as number[], up: [] as number[] };

  for (const x of [bounds[0], bounds[1]]) {
    for (const y of [bounds[2], bounds[3]]) {
      for (const z of [bounds[4], bounds[5]]) {
        along.right.push(vec3.dot([x, y, z], viewRight));
        along.up.push(vec3.dot([x, y, z], viewUpUnit));
      }
    }
  }

  return {
    widthWorld: Math.max(...along.right) - Math.min(...along.right),
    heightWorld: Math.max(...along.up) - Math.min(...along.up),
  };
}

function getBoundsRadius(bounds: number[]): number {
  const width = (bounds[1] - bounds[0]) ** 2;
  const height = (bounds[3] - bounds[2]) ** 2;
  const depth = (bounds[5] - bounds[4]) ** 2;

  return Math.sqrt(width + height + depth || 1) * 0.5;
}
