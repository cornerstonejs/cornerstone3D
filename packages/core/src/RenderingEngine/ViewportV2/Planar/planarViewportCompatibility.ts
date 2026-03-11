import { vec3 } from 'gl-matrix';
import type {
  ICamera,
  Point3,
  ReferenceCompatibleOptions,
  ViewReference,
  ViewReferenceSpecifier,
} from '../../../types';
import type { PlaneRestriction } from '../../../types/IViewport';
import getClosestImageId from '../../../utilities/getClosestImageId';
import imageIdToURI from '../../../utilities/imageIdToURI';
import isEqual from '../../../utilities/isEqual';
import { updatePlaneRestriction } from '../../../utilities/updatePlaneRestriction';
import {
  getPlanarVolumeSliceNavigationState,
  getPlanarVolumeSlicePoint,
} from '../../helpers/planarVolumeRendering';
import { getCpuVolumeCompatibilityCamera } from './CpuVolumeSliceRenderingAdapter';
import { getPlanarCpuImageCompatibilityCamera } from './CpuImageCanvasRenderingAdapter';
import { getPlanarCameraVectors } from './planarCameraOrientation';
import type {
  PlanarCamera,
  PlanarCpuVolumeAdapterContext,
  PlanarRendering,
  PlanarViewportRenderContext,
} from './PlanarViewportV2Types';

export function getPlanarCompatibilityCamera(args: {
  camera: PlanarCamera;
  rendering?: PlanarRendering;
  renderContext: PlanarViewportRenderContext;
}): PlanarCamera & ICamera {
  const { camera, rendering, renderContext } = args;

  if (!rendering) {
    return { ...camera };
  }

  if (rendering.renderMode === 'cpu2d') {
    return getPlanarCpuImageCompatibilityCamera({
      camera,
      image: rendering.runtime.enabledElement.image,
    });
  }

  if (rendering.renderMode === 'cpuVolume') {
    return {
      ...camera,
      ...getCpuVolumeCompatibilityCamera(
        renderContext as PlanarCpuVolumeAdapterContext,
        rendering
      ),
    };
  }

  const vtkCamera = renderContext.vtk.renderer.getActiveCamera();
  const cameraVectors =
    'imageVolume' in rendering.runtime && rendering.runtime.imageVolume
      ? getPlanarCameraVectors({
          imageVolume: rendering.runtime.imageVolume,
          orientation: camera.orientation,
        })
      : undefined;

  return {
    ...camera,
    focalPoint: [...vtkCamera.getFocalPoint()] as Point3,
    position: [...vtkCamera.getPosition()] as Point3,
    parallelProjection: true,
    parallelScale: vtkCamera.getParallelScale(),
    viewPlaneNormal:
      cameraVectors?.viewPlaneNormal ||
      ([...vtkCamera.getViewPlaneNormal()] as Point3),
    viewUp: cameraVectors?.viewUp || ([...vtkCamera.getViewUp()] as Point3),
  };
}

export function getPlanarReferencedImageId(args: {
  camera: PlanarCamera;
  rendering?: PlanarRendering;
  renderContext: PlanarViewportRenderContext;
  viewRefSpecifier?: ViewReferenceSpecifier;
}): string | undefined {
  const { rendering, viewRefSpecifier } = args;

  if (!rendering) {
    return;
  }

  const imageIds = getImageIds(rendering);

  if (!imageIds.length) {
    return;
  }

  if (rendering.renderMode === 'cpu2d' || rendering.renderMode === 'vtkImage') {
    const imageIdIndex =
      typeof viewRefSpecifier?.sliceIndex === 'number'
        ? Math.min(
            Math.max(0, viewRefSpecifier.sliceIndex),
            imageIds.length - 1
          )
        : getCurrentSliceIndex(rendering);

    return imageIds[imageIdIndex];
  }

  const compatibilityCamera = getPlanarCompatibilityCamera(args);

  if (!compatibilityCamera.focalPoint || !compatibilityCamera.viewPlaneNormal) {
    return imageIds[
      Math.min(getCurrentSliceIndex(rendering), imageIds.length - 1)
    ];
  }

  const targetFocalPoint = getTargetVolumeFocalPoint({
    camera: compatibilityCamera,
    rendering,
    sliceIndex: viewRefSpecifier?.sliceIndex,
  });

  return getClosestImageId(
    rendering.runtime.imageVolume,
    targetFocalPoint,
    compatibilityCamera.viewPlaneNormal
  );
}

export function getPlanarViewReference(args: {
  camera: PlanarCamera;
  frameOfReferenceUID: string;
  rendering?: PlanarRendering;
  renderContext: PlanarViewportRenderContext;
  viewRefSpecifier?: ViewReferenceSpecifier;
}): ViewReference {
  const { frameOfReferenceUID, rendering, viewRefSpecifier } = args;
  const compatibilityCamera = getPlanarCompatibilityCamera(args);
  const targetFocalPoint =
    rendering &&
    (rendering.renderMode === 'cpuVolume' ||
      rendering.renderMode === 'vtkVolume') &&
    compatibilityCamera.focalPoint &&
    compatibilityCamera.position &&
    compatibilityCamera.viewPlaneNormal
      ? getTargetVolumeFocalPoint({
          camera: compatibilityCamera,
          rendering,
          sliceIndex: viewRefSpecifier?.sliceIndex,
        })
      : compatibilityCamera.focalPoint;
  const viewReference: ViewReference = {
    FrameOfReferenceUID: frameOfReferenceUID,
    cameraFocalPoint: targetFocalPoint,
    viewPlaneNormal: compatibilityCamera.viewPlaneNormal,
    viewUp: compatibilityCamera.viewUp,
    sliceIndex:
      viewRefSpecifier?.sliceIndex ??
      (rendering ? getCurrentSliceIndex(rendering) : undefined),
    planeRestriction:
      compatibilityCamera.viewPlaneNormal &&
      compatibilityCamera.viewUp &&
      targetFocalPoint
        ? {
            FrameOfReferenceUID: frameOfReferenceUID,
            point: viewRefSpecifier?.points?.[0] || targetFocalPoint,
            inPlaneVector1: compatibilityCamera.viewUp,
            inPlaneVector2: vec3.cross(
              vec3.create(),
              compatibilityCamera.viewUp as unknown as vec3,
              compatibilityCamera.viewPlaneNormal as unknown as vec3
            ) as Point3,
          }
        : undefined,
  };
  const referencedImageId = getPlanarReferencedImageId(args);

  if (
    rendering &&
    (rendering.renderMode === 'cpuVolume' ||
      rendering.renderMode === 'vtkVolume') &&
    viewRefSpecifier?.forFrameOfReference !== false
  ) {
    viewReference.volumeId = rendering.runtime.payload.volumeId;
  }

  if (referencedImageId) {
    viewReference.referencedImageId = referencedImageId;
    viewReference.referencedImageURI = imageIdToURI(referencedImageId);
  }

  if (viewRefSpecifier?.points && viewReference.planeRestriction) {
    updatePlaneRestriction(viewRefSpecifier.points, viewReference);
  }

  return viewReference;
}

export function getPlanarViewReferenceId(args: {
  camera: PlanarCamera;
  rendering?: PlanarRendering;
  renderContext: PlanarViewportRenderContext;
  viewRefSpecifier?: ViewReferenceSpecifier;
}): string | null {
  const { rendering, viewRefSpecifier } = args;

  if (!rendering) {
    return null;
  }

  if (
    rendering.renderMode === 'cpuVolume' ||
    rendering.renderMode === 'vtkVolume'
  ) {
    const compatibilityCamera = getPlanarCompatibilityCamera(args);
    const sliceIndex =
      viewRefSpecifier?.sliceIndex ?? getCurrentSliceIndex(rendering);
    const volumeId = rendering.runtime.payload.volumeId;
    const formattedNormal = (compatibilityCamera.viewPlaneNormal || [])
      .map((value) => value.toFixed(3))
      .join(',');
    const querySeparator = volumeId.includes('?') ? '&' : '?';

    return `volumeId:${volumeId}${querySeparator}sliceIndex=${sliceIndex}&viewPlaneNormal=${formattedNormal}`;
  }

  const referencedImageId = getPlanarReferencedImageId(args);

  return referencedImageId ? `imageId:${referencedImageId}` : null;
}

export function isPlanarPlaneViewable(args: {
  camera: PlanarCamera;
  frameOfReferenceUID: string;
  planeRestriction: PlaneRestriction;
  rendering?: PlanarRendering;
  renderContext: PlanarViewportRenderContext;
  options?: ReferenceCompatibleOptions;
}): boolean {
  const {
    camera,
    frameOfReferenceUID,
    options,
    planeRestriction,
    renderContext,
    rendering,
  } = args;

  if (planeRestriction.FrameOfReferenceUID !== frameOfReferenceUID) {
    return false;
  }

  const compatibilityCamera = getPlanarCompatibilityCamera({
    camera,
    rendering,
    renderContext,
  });
  const { focalPoint, viewPlaneNormal } = compatibilityCamera;
  const { point, inPlaneVector1, inPlaneVector2 } = planeRestriction;

  if (!focalPoint || !viewPlaneNormal) {
    return false;
  }

  if (options?.withOrientation) {
    return true;
  }

  if (
    inPlaneVector1 &&
    !isEqual(
      0,
      vec3.dot(
        viewPlaneNormal as unknown as vec3,
        inPlaneVector1 as unknown as vec3
      )
    )
  ) {
    return false;
  }

  if (
    inPlaneVector2 &&
    !isEqual(
      0,
      vec3.dot(
        viewPlaneNormal as unknown as vec3,
        inPlaneVector2 as unknown as vec3
      )
    )
  ) {
    return false;
  }

  if (options?.withNavigation) {
    return true;
  }

  const pointVector = vec3.sub(
    vec3.create(),
    point as unknown as vec3,
    focalPoint as unknown as vec3
  );

  return isEqual(0, vec3.dot(pointVector, viewPlaneNormal as unknown as vec3));
}

export function isPlanarReferenceViewable(args: {
  camera: PlanarCamera;
  frameOfReferenceUID: string;
  imageIds: string[];
  rendering?: PlanarRendering;
  renderContext: PlanarViewportRenderContext;
  options?: ReferenceCompatibleOptions;
  viewRef: ViewReference;
}): boolean {
  const {
    camera,
    frameOfReferenceUID,
    imageIds,
    options = {},
    renderContext,
    rendering,
    viewRef,
  } = args;

  if (!viewRef) {
    return false;
  }

  if (viewRef.planeRestriction) {
    return isPlanarPlaneViewable({
      camera,
      frameOfReferenceUID,
      options,
      planeRestriction: viewRef.planeRestriction,
      renderContext,
      rendering,
    });
  }

  if (
    viewRef.FrameOfReferenceUID &&
    viewRef.FrameOfReferenceUID !== frameOfReferenceUID
  ) {
    return false;
  }

  const compatibilityCamera = getPlanarCompatibilityCamera({
    camera,
    rendering,
    renderContext,
  });

  if (
    viewRef.viewPlaneNormal &&
    !isEqual(viewRef.viewPlaneNormal, compatibilityCamera.viewPlaneNormal) &&
    !isEqual(
      vec3.negate(
        vec3.create(),
        compatibilityCamera.viewPlaneNormal as unknown as vec3
      ) as unknown as Point3,
      viewRef.viewPlaneNormal
    )
  ) {
    return Boolean(options.withOrientation);
  }

  if (options.withNavigation) {
    if (!viewRef.referencedImageId) {
      return true;
    }

    const referencedImageURI = imageIdToURI(viewRef.referencedImageId);

    return imageIds.some(
      (imageId) => imageIdToURI(imageId) === referencedImageURI
    );
  }

  const currentSliceIndex = rendering ? getCurrentSliceIndex(rendering) : 0;
  const { sliceIndex } = viewRef;

  if (Array.isArray(sliceIndex)) {
    return (
      sliceIndex[0] <= currentSliceIndex && currentSliceIndex <= sliceIndex[1]
    );
  }

  return sliceIndex === undefined || sliceIndex === currentSliceIndex;
}

function getCurrentSliceIndex(rendering: PlanarRendering): number {
  return rendering.runtime.currentImageIdIndex;
}

function getImageIds(rendering: PlanarRendering): string[] {
  return (
    rendering.runtime.payload.imageVolume?.imageIds ||
    rendering.runtime.payload.imageIds
  );
}

function getTargetVolumeFocalPoint(args: {
  camera: Pick<ICamera, 'focalPoint' | 'position' | 'viewPlaneNormal'>;
  rendering: Extract<
    PlanarRendering,
    { renderMode: 'cpuVolume' | 'vtkVolume' }
  >;
  sliceIndex?: number;
}): Point3 {
  const { camera, rendering, sliceIndex } = args;

  if (
    typeof sliceIndex !== 'number' ||
    sliceIndex === rendering.runtime.currentImageIdIndex
  ) {
    return camera.focalPoint as Point3;
  }

  const { sliceRange, spacingInNormalDirection } =
    getPlanarVolumeSliceNavigationState({
      actor: rendering.runtime.actor,
      camera: {
        focalPoint: camera.focalPoint as Point3,
        position: camera.position as Point3,
        viewPlaneNormal: camera.viewPlaneNormal as Point3,
      },
      imageVolume: rendering.runtime.imageVolume,
    });
  const { newFocalPoint } = getPlanarVolumeSlicePoint({
    camera: {
      focalPoint: camera.focalPoint as Point3,
      position: camera.position as Point3,
      viewPlaneNormal: camera.viewPlaneNormal as Point3,
    },
    delta: sliceIndex - rendering.runtime.currentImageIdIndex,
    sliceRange,
    spacingInNormalDirection,
  });

  return newFocalPoint;
}
