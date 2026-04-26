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
 * All functions accept the current PlanarViewState, the active PlanarRendering,
 * and a PlanarViewportRenderContext so they can reconstruct the render camera
 * on demand via `getPlanarResolvedICameraForReference`.
 */
import { vec3 } from 'gl-matrix';
import { ActorRenderMode } from '../../../types';
import type {
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
import { getDimensionGroupReferenceContext } from '../viewportNextReferenceCompatibility';
import type {
  PlanarViewState,
  PlanarPayload,
  PlanarViewportRenderContext,
} from './PlanarViewportTypes';
import { resolvePlanarViewportView } from './PlanarResolvedView';
import type { PlanarRendering } from './planarRuntimeTypes';

/**
 * Returns the imageId that the viewport is currently displaying (or would
 * display at a given `sliceIndex` override).
 *
 * For image-based paths (cpuImage, vtkImage) this is a direct index lookup.
 * For volume paths (cpuVolume, vtkVolume) the computed camera's focalPoint
 * and viewPlaneNormal are used to find the closest imageId in the volume's
 * imageId list via `getClosestImageId`.
 *
 * @param args.viewState - The current semantic PlanarViewState.
 * @param args.data - The loaded PlanarPayload (provides imageIds and volumeId).
 * @param args.rendering - The active render-path state.
 * @param args.renderContext - The viewport render context (provides canvas refs).
 * @param args.viewRefSpecifier - Optional overrides (e.g. a specific sliceIndex).
 * @returns The referenced imageId, or undefined if no rendering is active.
 */
export function getPlanarReferencedImageId(args: {
  viewState: PlanarViewState;
  data?: PlanarPayload;
  frameOfReferenceUID?: string;
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

  if (
    rendering.renderMode === ActorRenderMode.CPU_IMAGE ||
    rendering.renderMode === ActorRenderMode.VTK_IMAGE
  ) {
    const imageIdIndex =
      typeof viewRefSpecifier?.sliceIndex === 'number'
        ? Math.min(
            Math.max(0, viewRefSpecifier.sliceIndex),
            imageIds.length - 1
          )
        : args.viewState?.slice?.kind === 'stackIndex'
          ? Math.min(
              Math.max(0, args.viewState.slice.imageIdIndex),
              imageIds.length - 1
            )
          : getCurrentSliceIndex(rendering);

    return imageIds[imageIdIndex];
  }

  const resolvedView = getPlanarResolvedViewForReference({
    viewState: args.viewState,
    data: args.data,
    frameOfReferenceUID: args.frameOfReferenceUID,
    renderContext: args.renderContext,
    rendering,
    sliceIndex: viewRefSpecifier?.sliceIndex,
  })?.toICamera();

  if (!resolvedView?.focalPoint || !resolvedView.viewPlaneNormal) {
    return imageIds[
      Math.min(getCurrentSliceIndex(rendering), imageIds.length - 1)
    ];
  }

  return getClosestImageId(
    rendering.imageVolume,
    resolvedView.focalPoint,
    resolvedView.viewPlaneNormal
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
  viewState: PlanarViewState;
  dataId?: string;
  frameOfReferenceUID: string;
  data?: PlanarPayload;
  rendering?: PlanarRendering;
  renderContext: PlanarViewportRenderContext;
  viewRefSpecifier?: ViewReferenceSpecifier;
}): ViewReference {
  const { frameOfReferenceUID, rendering, viewRefSpecifier } = args;
  const { dimensionGroupNumber } = getDimensionGroupReferenceContext(
    args.data?.imageVolume
  );
  const sliceIndex =
    viewRefSpecifier?.sliceIndex ??
    (rendering ? getCurrentSliceIndex(rendering) : undefined);
  const rangeEndSliceIndex = viewRefSpecifier?.rangeEndSliceIndex;
  const targetCamera = getPlanarResolvedViewForReference({
    ...args,
    sliceIndex,
  })?.toICamera();
  const cameraFocalPoint = toPoint3(targetCamera?.focalPoint);
  const viewPlaneNormal = toPoint3(targetCamera?.viewPlaneNormal);
  const viewUp = toPoint3(targetCamera?.viewUp);
  const inPlaneVector2 =
    viewUp && viewPlaneNormal
      ? toPoint3(
          vec3.cross(
            vec3.create(),
            viewUp as unknown as vec3,
            viewPlaneNormal as unknown as vec3
          ) as Point3
        )
      : undefined;
  const viewReference: ViewReference = {
    FrameOfReferenceUID: frameOfReferenceUID,
    dataId: args.dataId,
    dimensionGroupNumber,
    cameraFocalPoint,
    viewPlaneNormal,
    viewUp,
    sliceIndex,
    planeRestriction:
      viewPlaneNormal && viewUp && cameraFocalPoint
        ? {
            FrameOfReferenceUID: frameOfReferenceUID,
            point: toPoint3(viewRefSpecifier?.points?.[0]) || cameraFocalPoint,
            inPlaneVector1: viewUp,
            inPlaneVector2,
          }
        : undefined,
  };
  const referencedImageId = getPlanarReferencedImageId(args);
  const rangeEndReferencedImageId =
    typeof sliceIndex === 'number' &&
    typeof rangeEndSliceIndex === 'number' &&
    rangeEndSliceIndex > sliceIndex
      ? getPlanarReferencedImageId({
          ...args,
          viewRefSpecifier: {
            ...viewRefSpecifier,
            sliceIndex: rangeEndSliceIndex,
          },
        })
      : undefined;

  if (
    rendering &&
    (rendering.renderMode === ActorRenderMode.CPU_VOLUME ||
      rendering.renderMode === ActorRenderMode.VTK_VOLUME_SLICE) &&
    viewRefSpecifier?.forFrameOfReference !== false
  ) {
    viewReference.volumeId = args.data?.volumeId;
  }

  if (referencedImageId) {
    viewReference.referencedImageId = referencedImageId;
    viewReference.referencedImageURI = imageIdToURI(referencedImageId);
  }

  if (
    rangeEndReferencedImageId &&
    typeof rangeEndSliceIndex === 'number' &&
    typeof sliceIndex === 'number' &&
    rangeEndSliceIndex > sliceIndex
  ) {
    viewReference.multiSliceReference = {
      FrameOfReferenceUID: frameOfReferenceUID,
      referencedImageId: rangeEndReferencedImageId,
      referencedImageURI: imageIdToURI(rangeEndReferencedImageId),
      sliceIndex: rangeEndSliceIndex,
    };
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
  viewState: PlanarViewState;
  frameOfReferenceUID?: string;
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
    rendering.renderMode === ActorRenderMode.CPU_VOLUME ||
    rendering.renderMode === ActorRenderMode.VTK_VOLUME_SLICE
  ) {
    const resolvedView = getPlanarResolvedViewForReference({
      ...args,
      sliceIndex: viewRefSpecifier?.sliceIndex,
    })?.toICamera();
    const sliceIndex =
      viewRefSpecifier?.sliceIndex ?? getCurrentSliceIndex(rendering);
    const volumeId = args.data?.volumeId;

    if (!volumeId || !resolvedView?.viewPlaneNormal) {
      return null;
    }

    return getVolumeViewReferenceId({
      sliceIndex,
      viewPlaneNormal: resolvedView.viewPlaneNormal as Point3,
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
  viewState: PlanarViewState;
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

  const resolvedView = getPlanarResolvedViewForReference(args)?.toICamera();
  const { focalPoint, viewPlaneNormal } = resolvedView || {};

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
  viewState: PlanarViewState;
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
      viewState: args.viewState,
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

  const resolvedView = getPlanarResolvedViewForReference(args)?.toICamera();

  if (!resolvedView?.viewPlaneNormal) {
    return false;
  }

  if (
    viewRef.viewPlaneNormal &&
    !isEqual(viewRef.viewPlaneNormal, resolvedView.viewPlaneNormal) &&
    !isEqual(
      vec3.negate(
        vec3.create(),
        resolvedView.viewPlaneNormal as unknown as vec3
      ) as unknown as Point3,
      viewRef.viewPlaneNormal
    )
  ) {
    return Boolean(options.withOrientation);
  }

  if (viewRef.referencedImageId || viewRef.referencedImageURI) {
    const referencedImageURI =
      viewRef.referencedImageURI ||
      imageIdToURI(viewRef.referencedImageId as string);
    const currentSliceIndex = args.rendering
      ? getCurrentSliceIndex(args.rendering)
      : 0;
    const currentReferencedImageId = imageIds[currentSliceIndex];

    if (
      currentReferencedImageId &&
      imageIdToURI(currentReferencedImageId) === referencedImageURI
    ) {
      return true;
    }

    const foundSliceIndex = imageIds.findIndex(
      (imageId) => imageIdToURI(imageId) === referencedImageURI
    );

    if (foundSliceIndex === -1) {
      return false;
    }

    if (options.withNavigation) {
      return true;
    }

    const rangeEndSliceIndex =
      viewRef.multiSliceReference &&
      imageIds.findIndex(
        (imageId) =>
          imageIdToURI(imageId) ===
          imageIdToURI(viewRef.multiSliceReference.referencedImageId)
      );

    if (rangeEndSliceIndex !== undefined && rangeEndSliceIndex >= 0) {
      return (
        foundSliceIndex <= currentSliceIndex &&
        currentSliceIndex <= rangeEndSliceIndex
      );
    }

    return currentSliceIndex === foundSliceIndex;
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

function toPoint3(point: Point3 | undefined): Point3 | undefined {
  if (!point) {
    return;
  }

  return [point[0], point[1], point[2]];
}

/**
 * Resolves the current shared planar camera object for spatial reference
 * queries. This reuses the same construction path as `PlanarViewport`.
 */
function getPlanarResolvedViewForReference(
  args: Parameters<typeof resolvePlanarViewportView>[0]
) {
  return resolvePlanarViewportView(args);
}
