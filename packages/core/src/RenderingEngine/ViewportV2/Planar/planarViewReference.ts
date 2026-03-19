/**
 * planarViewReference -- Spatial reference queries for cross-viewport
 * synchronization and navigation.
 *
 * These functions let external consumers (tools, synchronizers, navigation
 * controllers) ask questions about the planar viewport's current spatial
 * state without reaching into internal rendering details:
 *
 *   - "Which imageId is currently displayed?" (`getPlanarReferencedImageId`)
 *   - "What is the full ViewReference for this viewport?" (`getPlanarViewReference`)
 *   - "What is the stable identifier for this view?" (`getPlanarViewReferenceId`)
 *   - "Can this viewport display a given plane?" (`isPlanarPlaneViewable`)
 *   - "Can this viewport display a given ViewReference?" (`isPlanarReferenceViewable`)
 *
 * All functions accept the current PlanarCamera, the active PlanarRendering,
 * and a PlanarViewportRenderContext so they can reconstruct the render camera
 * on demand via `getPlanarRenderCameraForReference`.
 */
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
import getVolumeViewReferenceId from '../../../utilities/getVolumeViewReferenceId';
import { updatePlaneRestriction } from '../../../utilities/updatePlaneRestriction';
import type {
  PlanarCamera,
  PlanarPayload,
  PlanarViewportRenderContext,
} from './PlanarViewportV2Types';
import type { PlanarRendering } from './planarRuntimeTypes';
import {
  createPlanarImageSliceBasis,
  createPlanarVolumeSliceBasis,
} from './planarSliceBasis';
import { resolvePlanarRenderCamera } from './planarRenderCamera';

/**
 * Returns the imageId that the viewport is currently displaying (or would
 * display at a given `sliceIndex` override).
 *
 * For image-based paths (cpu2d, vtkImage) this is a direct index lookup.
 * For volume paths (cpuVolume, vtkVolume) the resolved camera's focalPoint
 * and viewPlaneNormal are used to find the closest imageId in the volume's
 * imageId list via `getClosestImageId`.
 *
 * @param args.camera - The current semantic PlanarCamera.
 * @param args.data - The loaded PlanarPayload (provides imageIds and volumeId).
 * @param args.rendering - The active render-path state.
 * @param args.renderContext - The viewport render context (provides canvas refs).
 * @param args.viewRefSpecifier - Optional overrides (e.g. a specific sliceIndex).
 * @returns The referenced imageId, or undefined if no rendering is active.
 */
export function getPlanarReferencedImageId(args: {
  camera: PlanarCamera;
  data?: PlanarPayload;
  rendering?: PlanarRendering;
  renderContext: PlanarViewportRenderContext;
  viewRefSpecifier?: ViewReferenceSpecifier;
}): string | undefined {
  const { rendering, viewRefSpecifier } = args;

  if (!rendering) {
    return;
  }

  const imageIds = getImageIds(args.data);

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

  const resolvedCamera = getTargetVolumeSpatialCamera({
    camera: args.camera,
    renderContext: args.renderContext,
    rendering,
    sliceIndex: viewRefSpecifier?.sliceIndex,
  });

  if (!resolvedCamera?.focalPoint || !resolvedCamera.viewPlaneNormal) {
    return imageIds[
      Math.min(getCurrentSliceIndex(rendering), imageIds.length - 1)
    ];
  }

  return getClosestImageId(
    rendering.imageVolume,
    resolvedCamera.focalPoint,
    resolvedCamera.viewPlaneNormal
  );
}

/**
 * Constructs a full `ViewReference` describing the viewport's current
 * spatial state. This is the primary output consumed by cross-viewport
 * synchronization (e.g. crosshairs, reference lines).
 *
 * The ViewReference includes:
 *   - `FrameOfReferenceUID` -- the DICOM frame of reference.
 *   - `cameraFocalPoint`, `viewPlaneNormal`, `viewUp` -- orientation.
 *   - `sliceIndex` -- current slice position.
 *   - `planeRestriction` -- the plane equation for viewable-plane checks.
 *   - `referencedImageId` / `referencedImageURI` -- for image-level sync.
 *   - `volumeId` -- for volume-level sync (volume paths only).
 *
 * For volume paths, uses `getTargetVolumeSpatialCamera` to compute the
 * camera at a potentially overridden sliceIndex (from viewRefSpecifier).
 *
 * @returns A ViewReference suitable for `isReferenceViewable` comparisons.
 */
export function getPlanarViewReference(args: {
  camera: PlanarCamera;
  frameOfReferenceUID: string;
  data?: PlanarPayload;
  rendering?: PlanarRendering;
  renderContext: PlanarViewportRenderContext;
  viewRefSpecifier?: ViewReferenceSpecifier;
}): ViewReference {
  const { frameOfReferenceUID, rendering, viewRefSpecifier } = args;
  const resolvedCamera = getPlanarRenderCameraForReference(args);
  const targetCamera =
    rendering &&
    (rendering.renderMode === 'cpuVolume' ||
      rendering.renderMode === 'vtkVolume')
      ? getTargetVolumeSpatialCamera({
          camera: args.camera,
          renderContext: args.renderContext,
          rendering,
          sliceIndex: viewRefSpecifier?.sliceIndex,
        }) || resolvedCamera
      : resolvedCamera;
  const viewReference: ViewReference = {
    FrameOfReferenceUID: frameOfReferenceUID,
    cameraFocalPoint: targetCamera?.focalPoint,
    viewPlaneNormal: targetCamera?.viewPlaneNormal,
    viewUp: targetCamera?.viewUp,
    sliceIndex:
      viewRefSpecifier?.sliceIndex ??
      (rendering ? getCurrentSliceIndex(rendering) : undefined),
    planeRestriction:
      targetCamera?.viewPlaneNormal &&
      targetCamera.viewUp &&
      targetCamera.focalPoint
        ? {
            FrameOfReferenceUID: frameOfReferenceUID,
            point: viewRefSpecifier?.points?.[0] || targetCamera.focalPoint,
            inPlaneVector1: targetCamera.viewUp,
            inPlaneVector2: vec3.cross(
              vec3.create(),
              targetCamera.viewUp as unknown as vec3,
              targetCamera.viewPlaneNormal as unknown as vec3
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
    viewReference.volumeId = args.data?.volumeId;
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

/**
 * Returns a stable string identifier for the current view. Used for
 * deduplication and caching in synchronization logic.
 *
 * For volume paths: `volume:{volumeId}:normal:{vpn}:slice:{index}`.
 * For image paths: `imageId:{referencedImageId}`.
 *
 * @returns A view reference ID string, or null if no rendering is active.
 */
export function getPlanarViewReferenceId(args: {
  camera: PlanarCamera;
  data?: PlanarPayload;
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
    const resolvedCamera = getPlanarRenderCameraForReference(args);
    const sliceIndex =
      viewRefSpecifier?.sliceIndex ?? getCurrentSliceIndex(rendering);
    const volumeId = args.data?.volumeId;

    if (!volumeId || !resolvedCamera?.viewPlaneNormal) {
      return null;
    }

    return getVolumeViewReferenceId({
      sliceIndex,
      viewPlaneNormal: resolvedCamera.viewPlaneNormal as Point3,
      volumeId,
    });
  }

  const referencedImageId = getPlanarReferencedImageId(args);

  return referencedImageId ? `imageId:${referencedImageId}` : null;
}

/**
 * Tests whether a given plane (defined by a PlaneRestriction) is viewable
 * in this viewport's current orientation.
 *
 * The check verifies:
 *   1. Frame of reference matches.
 *   2. The plane's in-plane vectors are perpendicular to this viewport's
 *      viewPlaneNormal (i.e. the plane is parallel to the viewing direction).
 *   3. The plane passes through (or near) the current focal point.
 *
 * The `options.withOrientation` and `options.withNavigation` flags allow
 * early-out at different strictness levels.
 *
 * @returns true if the plane is viewable in this viewport.
 */
export function isPlanarPlaneViewable(args: {
  camera: PlanarCamera;
  frameOfReferenceUID: string;
  planeRestriction: PlaneRestriction;
  rendering?: PlanarRendering;
  renderContext: PlanarViewportRenderContext;
  options?: ReferenceCompatibleOptions;
}): boolean {
  const { frameOfReferenceUID, options, planeRestriction } = args;

  if (planeRestriction.FrameOfReferenceUID !== frameOfReferenceUID) {
    return false;
  }

  const resolvedCamera = getPlanarRenderCameraForReference(args);
  const { focalPoint, viewPlaneNormal } = resolvedCamera || {};

  if (!focalPoint || !viewPlaneNormal) {
    return false;
  }

  if (options?.withOrientation) {
    return true;
  }

  if (
    planeRestriction.inPlaneVector1 &&
    !isEqual(
      0,
      vec3.dot(
        viewPlaneNormal as unknown as vec3,
        planeRestriction.inPlaneVector1 as unknown as vec3
      )
    )
  ) {
    return false;
  }

  if (
    planeRestriction.inPlaneVector2 &&
    !isEqual(
      0,
      vec3.dot(
        viewPlaneNormal as unknown as vec3,
        planeRestriction.inPlaneVector2 as unknown as vec3
      )
    )
  ) {
    return false;
  }

  if (options?.withNavigation) {
    return true;
  }

  const { point } = planeRestriction;
  const pointVector = vec3.sub(
    vec3.create(),
    point as unknown as vec3,
    focalPoint as unknown as vec3
  );

  return isEqual(0, vec3.dot(pointVector, viewPlaneNormal as unknown as vec3));
}

/**
 * Tests whether a given ViewReference is viewable in this viewport.
 *
 * Delegates to `isPlanarPlaneViewable` if the view reference carries a
 * planeRestriction. Otherwise checks orientation compatibility (viewPlaneNormal
 * match, allowing negation for flipped views) and optionally verifies that
 * the referenced imageId exists in this viewport's image set.
 *
 * @param args.viewRef - The ViewReference to test.
 * @param args.options - Strictness flags:
 *   `withOrientation` -- only check that the orientation could display it
 *     (ignoring slice position).
 *   `withNavigation` -- check that the viewport could navigate to show it.
 * @returns true if the reference is viewable.
 */
export function isPlanarReferenceViewable(args: {
  camera: PlanarCamera;
  frameOfReferenceUID: string;
  imageIds: string[];
  rendering?: PlanarRendering;
  renderContext: PlanarViewportRenderContext;
  options?: ReferenceCompatibleOptions;
  viewRef: ViewReference;
}): boolean {
  const { frameOfReferenceUID, imageIds, options = {}, viewRef } = args;

  if (!viewRef) {
    return false;
  }

  if (viewRef.planeRestriction) {
    return isPlanarPlaneViewable({
      camera: args.camera,
      frameOfReferenceUID,
      options,
      planeRestriction: viewRef.planeRestriction,
      renderContext: args.renderContext,
      rendering: args.rendering,
    });
  }

  if (
    viewRef.FrameOfReferenceUID &&
    viewRef.FrameOfReferenceUID !== frameOfReferenceUID
  ) {
    return false;
  }

  const resolvedCamera = getPlanarRenderCameraForReference(args);

  if (!resolvedCamera?.viewPlaneNormal) {
    return false;
  }

  if (
    viewRef.viewPlaneNormal &&
    !isEqual(viewRef.viewPlaneNormal, resolvedCamera.viewPlaneNormal) &&
    !isEqual(
      vec3.negate(
        vec3.create(),
        resolvedCamera.viewPlaneNormal as unknown as vec3
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

  const currentSliceIndex = args.rendering
    ? getCurrentSliceIndex(args.rendering)
    : 0;
  const { sliceIndex } = viewRef;

  if (Array.isArray(sliceIndex)) {
    return (
      sliceIndex[0] <= currentSliceIndex && currentSliceIndex <= sliceIndex[1]
    );
  }

  return sliceIndex === undefined || sliceIndex === currentSliceIndex;
}

/** Extracts the current slice index from any PlanarRendering variant. */
function getCurrentSliceIndex(rendering: PlanarRendering): number {
  return rendering.currentImageIdIndex;
}

/** Extracts the imageId list from a PlanarPayload, preferring volume imageIds. */
function getImageIds(payload?: PlanarPayload): string[] {
  return payload?.imageVolume?.imageIds || payload?.imageIds || [];
}

/**
 * Resolves the current ICamera for spatial reference queries.
 *
 * Prefers the cached `renderCamera` on the rendering (which is set after
 * each render cycle). If no cached camera exists (e.g. before first render),
 * builds a sliceBasis from the rendering's current state and resolves a
 * fresh ICamera through the standard pipeline.
 *
 * This function is called by all spatial reference queries to avoid
 * duplicating the camera resolution logic.
 */
function getPlanarRenderCameraForReference(args: {
  camera: PlanarCamera;
  rendering?: PlanarRendering;
  renderContext: PlanarViewportRenderContext;
}): ICamera | undefined {
  const { rendering, renderContext } = args;

  if (!rendering) {
    return;
  }

  if (rendering.renderCamera) {
    return rendering.renderCamera;
  }

  const { canvasHeight, canvasWidth } = getPlanarCanvasDimensions({
    rendering,
    renderContext,
  });
  const camera = rendering.requestedCamera || args.camera;

  if (rendering.renderMode === 'cpu2d') {
    const image = rendering.enabledElement?.image;

    if (!image) {
      return;
    }

    const sliceBasis = createPlanarImageSliceBasis({
      image,
      canvasWidth,
      canvasHeight,
    });

    return resolvePlanarRenderCamera({
      sliceBasis,
      camera,
      canvasWidth,
      canvasHeight,
    });
  }

  if (rendering.renderMode === 'vtkImage') {
    const image = rendering.currentImage;

    if (!image) {
      return;
    }

    const sliceBasis = createPlanarImageSliceBasis({
      image,
      canvasWidth,
      canvasHeight,
    });

    return resolvePlanarRenderCamera({
      sliceBasis,
      camera,
      canvasWidth,
      canvasHeight,
    });
  }

  if (
    rendering.renderMode === 'cpuVolume' ||
    rendering.renderMode === 'vtkVolume'
  ) {
    const { sliceBasis } = createPlanarVolumeSliceBasis({
      canvasWidth,
      canvasHeight,
      imageIdIndex: rendering.currentImageIdIndex,
      imageVolume: rendering.imageVolume,
      orientation: camera?.orientation,
    });

    return resolvePlanarRenderCamera({
      sliceBasis,
      camera,
      canvasWidth,
      canvasHeight,
    });
  }
}

/**
 * Resolves the ICamera for a volume rendering at a potentially different
 * slice index than the current one. Used when building a ViewReference
 * for a hypothetical slice position (e.g. from a viewRefSpecifier override).
 *
 * If the requested sliceIndex matches the current one (or is unspecified),
 * delegates to the standard `getPlanarRenderCameraForReference`.
 */
function getTargetVolumeSpatialCamera(args: {
  camera: PlanarCamera;
  renderContext: PlanarViewportRenderContext;
  rendering: Extract<
    PlanarRendering,
    { renderMode: 'cpuVolume' | 'vtkVolume' }
  >;
  sliceIndex?: number;
}): ICamera | undefined {
  const { camera, renderContext, rendering, sliceIndex } = args;

  if (
    typeof sliceIndex !== 'number' ||
    sliceIndex === rendering.currentImageIdIndex
  ) {
    return getPlanarRenderCameraForReference({
      camera,
      rendering,
      renderContext,
    });
  }

  const { canvasHeight, canvasWidth } = getPlanarCanvasDimensions({
    rendering,
    renderContext,
  });
  const { sliceBasis } = createPlanarVolumeSliceBasis({
    canvasHeight,
    canvasWidth,
    imageIdIndex: sliceIndex,
    imageVolume: rendering.imageVolume,
    orientation: (rendering.requestedCamera || camera).orientation,
  });

  return resolvePlanarRenderCamera({
    sliceBasis,
    canvasHeight,
    canvasWidth,
    camera: rendering.requestedCamera || camera,
  });
}

/**
 * Returns the canvas dimensions appropriate for the rendering's render mode.
 * CPU paths use the offscreen canvas dimensions; VTK paths use the on-screen
 * element dimensions (clientWidth/clientHeight), falling back to canvas
 * width/height.
 */
function getPlanarCanvasDimensions(args: {
  rendering: PlanarRendering;
  renderContext: PlanarViewportRenderContext;
}) {
  const { rendering, renderContext } = args;

  if (
    rendering.renderMode === 'cpu2d' ||
    rendering.renderMode === 'cpuVolume'
  ) {
    return {
      canvasWidth: renderContext.cpu.canvas.width,
      canvasHeight: renderContext.cpu.canvas.height,
    };
  }

  return {
    canvasWidth:
      renderContext.vtk.canvas.clientWidth || renderContext.vtk.canvas.width,
    canvasHeight:
      renderContext.vtk.canvas.clientHeight || renderContext.vtk.canvas.height,
  };
}
