import { vec3 } from 'gl-matrix';
import {
  isImageRenderMode,
  isVolumeRenderMode,
} from '../../helpers/renderBackendRegistry';
import type {
  ICamera,
  IImageVolume,
  Point3,
  ReferenceCompatibleOptions,
  ViewReference,
  ViewReferenceSpecifier,
} from '../../../types';
import type { PlaneRestriction } from '../../../types/IViewport';
import getClosestImageId from '../../../utilities/getClosestImageId';
import imageIdToURI from '../../../utilities/imageIdToURI';
import isEqual from '../../../utilities/isEqual';
import {
  getDimensionGroupReferenceContext,
  type GenericViewportReferenceContext,
} from '../genericViewportReferenceCompatibility';
import type { LoadedData } from '../ViewportArchitectureTypes';
import type { PlanarRendering } from './planarRuntimeTypes';
import { getVolumeImageIdIndexWorldPoint } from './planarSliceBasis';
import {
  getPlanarReferencedImageId,
  getPlanarViewReference,
  getPlanarViewReferenceId,
  isPlanarPlaneViewable,
} from './planarViewReference';
import { resolvePlanarViewportView } from './PlanarResolvedView';
import { normalizePlanarScale, type PlanarScale } from './planarCameraScale';
import type { PlanarDataBinding } from './PlanarMountedData';
import type {
  PlanarPayload,
  PlanarViewportRenderContext,
  PlanarViewState,
} from './PlanarViewportTypes';

export type PlanarReferenceContext = {
  dataId: string;
  data: LoadedData<PlanarPayload>;
  frameOfReferenceUID: string;
  rendering: PlanarRendering;
};

type PlanarResolvedViewLike = {
  getFrameOfReferenceUID(): string;
  toICamera(): ICamera<unknown>;
};

export type PlanarViewReferenceHost = {
  viewportId: string;
  viewportType: string;
  getActiveDataId(): string | undefined;
  getBinding(dataId: string): PlanarDataBinding | undefined;
  getBindings(): Iterable<[string, PlanarDataBinding]>;
  getCurrentBinding(): PlanarDataBinding | undefined;
  getRenderContext(): PlanarViewportRenderContext;
  getResolvedView(args?: {
    frameOfReferenceUID?: string;
    sliceIndex?: number;
  }): PlanarResolvedViewLike | undefined;
  getViewState(): PlanarViewState;
  getVolumeSliceWorldPointForImageIdIndex(
    imageIdIndex: number
  ): Point3 | undefined;
  promoteSourceDataId(dataId: string): void;
  render(): void;
  setImageIdIndex(imageIdIndex: number): Promise<string>;
  setViewState(viewStatePatch: Partial<PlanarViewState>): void;
  updateBindingsCameraState(): void;
};

class PlanarViewReferenceController {
  constructor(private readonly host: PlanarViewReferenceHost) {}

  getVolumeId(
    viewRefSpecifier: ViewReferenceSpecifier = {}
  ): string | undefined {
    return (
      this.getPlanarReferenceContext(viewRefSpecifier)?.data.volumeId ??
      this.getCurrentPlanarReferenceContext()?.data.volumeId
    );
  }

  getCurrentImageId(
    viewRefSpecifier: ViewReferenceSpecifier = {}
  ): string | undefined {
    const referenceContext = this.getPlanarReferenceContext(viewRefSpecifier);

    return getPlanarReferencedImageId({
      viewState: this.host.getViewState(),
      data: referenceContext?.data,
      frameOfReferenceUID: referenceContext?.frameOfReferenceUID,
      rendering: referenceContext?.rendering,
      renderContext: this.host.getRenderContext(),
      viewRefSpecifier,
    });
  }

  getViewReference(
    viewRefSpecifier: ViewReferenceSpecifier = {}
  ): ViewReference {
    const referenceContext = this.getPlanarReferenceContext(viewRefSpecifier);

    return getPlanarViewReference({
      viewState: this.host.getViewState(),
      dataId: referenceContext?.dataId,
      frameOfReferenceUID:
        referenceContext?.frameOfReferenceUID ?? this.getFrameOfReferenceUID(),
      data: referenceContext?.data,
      rendering: referenceContext?.rendering,
      renderContext: this.host.getRenderContext(),
      viewRefSpecifier,
    });
  }

  getViewReferenceId(viewRefSpecifier: ViewReferenceSpecifier = {}): string {
    const referenceContext = this.getPlanarReferenceContext(viewRefSpecifier);

    return getPlanarViewReferenceId({
      viewState: this.host.getViewState(),
      frameOfReferenceUID: referenceContext?.frameOfReferenceUID,
      data: referenceContext?.data,
      rendering: referenceContext?.rendering,
      renderContext: this.host.getRenderContext(),
      viewRefSpecifier,
    });
  }

  setViewReference(viewRef: ViewReference): void {
    if (!viewRef) {
      return;
    }

    const targetContext = this.resolveViewReferenceContext(viewRef);

    if (!targetContext) {
      return;
    }

    const didActivateBinding = this.activatePlanarReferenceContext(
      targetContext.dataId
    );
    const didApplyReference = this.applyViewReferenceToCurrentBinding(viewRef);

    if (didActivateBinding && !didApplyReference) {
      this.host.render();
    }
  }

  getFrameOfReferenceUID(): string {
    const frameOfReferenceUID = this.resolveFrameOfReferenceUID();

    return (
      this.host
        .getResolvedView({
          frameOfReferenceUID,
        })
        ?.getFrameOfReferenceUID() ?? frameOfReferenceUID
    );
  }

  resolveFrameOfReferenceUID(): string {
    const binding = this.host.getCurrentBinding();

    return (
      binding?.getFrameOfReferenceUID() ??
      `${this.host.viewportType}-viewport-${this.host.viewportId}`
    );
  }

  isPlaneViewable(
    planeRestriction: PlaneRestriction,
    options?: ReferenceCompatibleOptions
  ): boolean {
    return isPlanarPlaneViewable({
      viewState: this.host.getViewState(),
      frameOfReferenceUID: this.getFrameOfReferenceUID(),
      options,
      planeRestriction,
      rendering: this.getCurrentPlanarRendering(),
      renderContext: this.host.getRenderContext(),
    });
  }

  getReferenceViewContexts(
    fallbackContexts: GenericViewportReferenceContext[]
  ): GenericViewportReferenceContext[] {
    const referenceContexts = this.getAllPlanarReferenceContexts();

    if (!referenceContexts.length) {
      return fallbackContexts;
    }

    return referenceContexts.map((referenceContext) =>
      this.getGenericViewportReferenceContext(referenceContext)
    );
  }

  getPlanarReferenceContext(
    viewRefSpecifier: ViewReferenceSpecifier = {}
  ): PlanarReferenceContext | undefined {
    if (viewRefSpecifier.volumeId) {
      return (
        this.findPlanarReferenceContextByVolumeId(viewRefSpecifier.volumeId) ??
        this.getCurrentPlanarReferenceContext()
      );
    }

    return this.getCurrentPlanarReferenceContext();
  }

  private getCurrentPlanarReferenceContext():
    | PlanarReferenceContext
    | undefined {
    const activeDataId = this.host.getActiveDataId();

    if (activeDataId) {
      const activeContext =
        this.getPlanarReferenceContextByDataId(activeDataId);

      if (activeContext) {
        return activeContext;
      }
    }

    for (const [dataId] of this.host.getBindings()) {
      return this.getPlanarReferenceContextByDataId(dataId);
    }
  }

  private getPlanarReferenceContextByDataId(
    dataId: string
  ): PlanarReferenceContext | undefined {
    const binding = this.host.getBinding(dataId);

    if (!binding) {
      return;
    }

    return {
      dataId,
      data: binding.data as LoadedData<PlanarPayload>,
      frameOfReferenceUID:
        binding.getFrameOfReferenceUID() ??
        `${this.host.viewportType}-viewport-${this.host.viewportId}`,
      rendering: binding.rendering as PlanarRendering,
    };
  }

  private getAllPlanarReferenceContexts(): PlanarReferenceContext[] {
    const contexts: PlanarReferenceContext[] = [];

    for (const [dataId] of this.host.getBindings()) {
      const referenceContext = this.getPlanarReferenceContextByDataId(dataId);

      if (referenceContext) {
        contexts.push(referenceContext);
      }
    }

    return contexts;
  }

  private getGenericViewportReferenceContext(
    referenceContext: PlanarReferenceContext
  ): GenericViewportReferenceContext {
    const resolvedView = resolvePlanarViewportView({
      viewState: this.host.getViewState(),
      data: referenceContext.data,
      frameOfReferenceUID: referenceContext.frameOfReferenceUID,
      rendering: referenceContext.rendering,
      renderContext: this.host.getRenderContext(),
    })?.toICamera();
    const volumeId = referenceContext.data.volumeId;

    return {
      dataId: referenceContext.dataId,
      dataIds: [referenceContext.data.id],
      frameOfReferenceUID: referenceContext.frameOfReferenceUID,
      imageIds: this.getImageIdsForReferenceContext(referenceContext),
      currentImageIdIndex: referenceContext.rendering.currentImageIdIndex,
      volumeId,
      volumeIds: volumeId ? [volumeId] : undefined,
      cameraFocalPoint: resolvedView?.focalPoint,
      viewPlaneNormal: resolvedView?.viewPlaneNormal,
      ...getDimensionGroupReferenceContext(referenceContext.data.imageVolume),
    };
  }

  private findPlanarReferenceContextByVolumeId(
    volumeId: string
  ): PlanarReferenceContext | undefined {
    for (const [dataId, binding] of this.host.getBindings()) {
      const bindingData = binding.data as LoadedData<PlanarPayload>;

      if (bindingData.volumeId === volumeId) {
        return this.getPlanarReferenceContextByDataId(dataId);
      }
    }
  }

  private findPlanarReferenceContextByImageReference(
    referencedImageId?: string,
    referencedImageURI?: string
  ): PlanarReferenceContext | undefined {
    const targetImageURI =
      referencedImageURI ||
      (referencedImageId ? imageIdToURI(referencedImageId) : undefined);

    if (!targetImageURI) {
      return;
    }

    for (const referenceContext of this.getAllPlanarReferenceContexts()) {
      if (
        this.getImageIdsForReferenceContext(referenceContext).some(
          (imageId) => imageIdToURI(imageId) === targetImageURI
        )
      ) {
        return referenceContext;
      }
    }
  }

  private resolveViewReferenceContext(
    viewRef: ViewReference
  ): PlanarReferenceContext | undefined {
    if (viewRef.dataId) {
      const dataContext = this.getPlanarReferenceContextByDataId(
        viewRef.dataId
      );

      if (dataContext) {
        return dataContext;
      }
    }

    if (viewRef.volumeId) {
      const volumeContext = this.findPlanarReferenceContextByVolumeId(
        viewRef.volumeId
      );

      if (volumeContext) {
        return volumeContext;
      }
    }

    const imageContext = this.findPlanarReferenceContextByImageReference(
      viewRef.referencedImageId,
      viewRef.referencedImageURI
    );

    if (imageContext) {
      return imageContext;
    }

    const currentReferenceContext = this.getCurrentPlanarReferenceContext();

    if (
      viewRef.FrameOfReferenceUID &&
      currentReferenceContext?.frameOfReferenceUID !==
        viewRef.FrameOfReferenceUID
    ) {
      return;
    }

    return currentReferenceContext;
  }

  private activatePlanarReferenceContext(dataId: string): boolean {
    if (this.host.getActiveDataId() === dataId) {
      return false;
    }

    this.host.promoteSourceDataId(dataId);
    this.host.updateBindingsCameraState();

    return true;
  }

  private applyViewReferenceToCurrentBinding(viewRef: ViewReference): boolean {
    const referenceContext = this.getCurrentPlanarReferenceContext();

    if (
      !referenceContext ||
      (viewRef.FrameOfReferenceUID &&
        referenceContext.frameOfReferenceUID !== viewRef.FrameOfReferenceUID)
    ) {
      return false;
    }

    const { rendering } = referenceContext;

    if (isImageRenderMode(rendering.renderMode)) {
      return this.applyImageViewReference(referenceContext, viewRef);
    }

    return this.applyVolumeViewReference(referenceContext, viewRef);
  }

  private applyImageViewReference(
    referenceContext: PlanarReferenceContext,
    viewRef: ViewReference
  ): boolean {
    const imageIds = this.getImageIdsForReferenceContext(referenceContext);
    const referencedImageIndex = this.findImageIdIndexByReference(
      imageIds,
      viewRef.referencedImageId,
      viewRef.referencedImageURI
    );

    if (typeof referencedImageIndex === 'number') {
      this.host.setImageIdIndex(referencedImageIndex);
      return true;
    }

    if (typeof viewRef.sliceIndex === 'number') {
      this.host.setImageIdIndex(viewRef.sliceIndex);
      return true;
    }

    return false;
  }

  private applyVolumeViewReference(
    referenceContext: PlanarReferenceContext,
    viewRef: ViewReference
  ): boolean {
    const normalizedViewRef = this.normalizeVolumeViewReference(
      referenceContext,
      viewRef
    );
    const resolvedView = this.host
      .getResolvedView({
        frameOfReferenceUID: referenceContext.frameOfReferenceUID,
      })
      ?.toICamera();

    if (!resolvedView?.viewPlaneNormal) {
      return false;
    }

    const currentViewPlaneNormal = resolvedView.viewPlaneNormal as Point3;
    const refViewPlaneNormal = normalizedViewRef.viewPlaneNormal;
    const shouldReorient =
      refViewPlaneNormal &&
      !this.areNormalsEqual(currentViewPlaneNormal, refViewPlaneNormal) &&
      !this.areNormalsOpposite(currentViewPlaneNormal, refViewPlaneNormal);
    const effectiveViewPlaneNormal =
      refViewPlaneNormal ?? currentViewPlaneNormal;
    const isOppositeNormal =
      !shouldReorient &&
      this.areNormalsOpposite(currentViewPlaneNormal, effectiveViewPlaneNormal);
    const sliceTarget = this.resolveVolumeReferenceSliceTarget(
      referenceContext,
      normalizedViewRef,
      effectiveViewPlaneNormal,
      isOppositeNormal
    );
    const viewStatePatch: Partial<PlanarViewState> = {};

    if (shouldReorient && refViewPlaneNormal) {
      viewStatePatch.orientation = {
        viewPlaneNormal: [...refViewPlaneNormal] as Point3,
        ...(normalizedViewRef.viewUp
          ? {
              viewUp: [...normalizedViewRef.viewUp] as Point3,
            }
          : {}),
      };
    }

    const sliceWorldPoint =
      normalizedViewRef.cameraFocalPoint ??
      sliceTarget?.sliceWorldPoint ??
      (typeof sliceTarget?.imageIdIndex === 'number'
        ? this.host.getVolumeSliceWorldPointForImageIdIndex(
            sliceTarget.imageIdIndex
          )
        : undefined);

    if (sliceWorldPoint) {
      viewStatePatch.slice = {
        kind: 'volumePoint',
        sliceWorldPoint: [...sliceWorldPoint] as Point3,
      };
    }

    if (!Object.keys(viewStatePatch).length) {
      return false;
    }

    if (viewStatePatch.orientation) {
      const scale = this.getReorientationScale(
        referenceContext,
        resolvedView,
        viewStatePatch
      );

      if (scale) {
        viewStatePatch.scale = scale;
      }
    }

    this.host.setViewState(viewStatePatch);

    return true;
  }

  /**
   * Reorienting through a view reference must not change the on-screen world
   * scale. The fit parallel scale is recomputed from the new plane's
   * projected extent -- which varies with obliquity -- while the relative
   * zoom is carried over, so a rotating view reference would otherwise pulse
   * in and out as it sweeps the volume. Resolves the hypothetical post-patch
   * view and returns a rescaled relative zoom that preserves the absolute
   * parallel scale (a no-op when the resolved scale is unaffected).
   */
  private getReorientationScale(
    referenceContext: PlanarReferenceContext,
    currentCamera: ICamera<unknown>,
    viewStatePatch: Partial<PlanarViewState>
  ): PlanarScale | undefined {
    const currentParallelScale = currentCamera.parallelScale;

    if (
      typeof currentParallelScale !== 'number' ||
      !(currentParallelScale > 0)
    ) {
      return;
    }

    const currentViewState = this.host.getViewState();
    const nextCamera = resolvePlanarViewportView({
      viewState: { ...currentViewState, ...viewStatePatch },
      data: referenceContext.data,
      frameOfReferenceUID: referenceContext.frameOfReferenceUID,
      rendering: referenceContext.rendering,
      renderContext: this.host.getRenderContext(),
    })?.toICamera();
    const nextParallelScale = nextCamera?.parallelScale;

    if (typeof nextParallelScale !== 'number' || !(nextParallelScale > 0)) {
      return;
    }

    const ratio = nextParallelScale / currentParallelScale;

    if (!Number.isFinite(ratio) || Math.abs(ratio - 1) < 1e-9) {
      return;
    }

    const [scaleX, scaleY] = normalizePlanarScale(currentViewState.scale);

    return [scaleX * ratio, scaleY * ratio];
  }

  private normalizeVolumeViewReference(
    referenceContext: PlanarReferenceContext,
    viewRef: ViewReference
  ): ViewReference {
    if (!viewRef.planeRestriction || viewRef.viewPlaneNormal) {
      return viewRef;
    }

    const orientation = this.deriveOrientationFromPlaneRestriction(
      referenceContext,
      viewRef.planeRestriction
    );

    return {
      ...viewRef,
      cameraFocalPoint:
        viewRef.cameraFocalPoint ?? viewRef.planeRestriction.point,
      ...orientation,
    };
  }

  private deriveOrientationFromPlaneRestriction(
    referenceContext: PlanarReferenceContext,
    planeRestriction: PlaneRestriction
  ): Pick<ViewReference, 'viewPlaneNormal' | 'viewUp'> {
    const resolvedView = this.host
      .getResolvedView({
        frameOfReferenceUID: referenceContext.frameOfReferenceUID,
      })
      ?.toICamera();
    const currentViewPlaneNormal = resolvedView?.viewPlaneNormal as
      | Point3
      | undefined;
    const currentViewUp = resolvedView?.viewUp as Point3 | undefined;
    const { inPlaneVector1, inPlaneVector2 } = planeRestriction;
    const result: Pick<ViewReference, 'viewPlaneNormal' | 'viewUp'> = {};

    if (
      currentViewPlaneNormal &&
      this.isPlaneRestrictionCompatibleWithNormal(
        planeRestriction,
        currentViewPlaneNormal
      )
    ) {
      result.viewPlaneNormal = [...currentViewPlaneNormal] as Point3;
      if (inPlaneVector1) {
        result.viewUp = [...inPlaneVector1] as Point3;
      } else if (currentViewUp) {
        result.viewUp = [...currentViewUp] as Point3;
      }

      return result;
    }

    let derivedViewPlaneNormal: Point3 | undefined;

    if (inPlaneVector1 && inPlaneVector2) {
      const cross = vec3.cross(
        vec3.create(),
        inPlaneVector2 as unknown as vec3,
        inPlaneVector1 as unknown as vec3
      );

      if (vec3.length(cross) > 0) {
        vec3.normalize(cross, cross);
        derivedViewPlaneNormal = [...cross] as Point3;
      }
    } else if (inPlaneVector1 && currentViewPlaneNormal) {
      const cross = vec3.cross(
        vec3.create(),
        currentViewPlaneNormal as unknown as vec3,
        inPlaneVector1 as unknown as vec3
      );

      if (vec3.length(cross) > 0) {
        vec3.normalize(cross, cross);
        derivedViewPlaneNormal = [...cross] as Point3;
      }
    }

    if (derivedViewPlaneNormal) {
      result.viewPlaneNormal = derivedViewPlaneNormal;
    }

    if (inPlaneVector1) {
      result.viewUp = [...inPlaneVector1] as Point3;
    } else if (currentViewUp) {
      result.viewUp = [...currentViewUp] as Point3;
    }

    return result;
  }

  private isPlaneRestrictionCompatibleWithNormal(
    planeRestriction: PlaneRestriction,
    viewPlaneNormal: Point3
  ): boolean {
    return (
      (!planeRestriction.inPlaneVector1 ||
        isEqual(
          0,
          vec3.dot(
            viewPlaneNormal as unknown as vec3,
            planeRestriction.inPlaneVector1 as unknown as vec3
          )
        )) &&
      (!planeRestriction.inPlaneVector2 ||
        isEqual(
          0,
          vec3.dot(
            viewPlaneNormal as unknown as vec3,
            planeRestriction.inPlaneVector2 as unknown as vec3
          )
        ))
    );
  }

  /**
   * Resolves the slice a volume view reference targets, in one of two forms:
   *
   *  - `sliceIndex`-based references address the CAMERA (scroll) ordering —
   *    the domain of `getResolvedView({ sliceIndex })` / the slice basis — and
   *    resolve to an `imageIdIndex` in that domain (with the opposite-normal
   *    flip preserved).
   *  - imageId-anchored references (`referencedImageId` / a plane point
   *    snapped via `getClosestImageId`) address the volume's imageId LIST
   *    ordering, which runs along the scan axis — for the acquisition
   *    orientation that is the OPPOSITE of the camera ordering. Those resolve
   *    directly to the slice's exact world center (`sliceWorldPoint`), which
   *    is ordering-independent; feeding the list index into the camera-order
   *    basis instead would navigate to the mirrored slice.
   */
  private resolveVolumeReferenceSliceTarget(
    referenceContext: PlanarReferenceContext,
    viewRef: ViewReference,
    effectiveViewPlaneNormal: Point3,
    isOppositeNormal: boolean
  ): { imageIdIndex?: number; sliceWorldPoint?: Point3 } | undefined {
    const { rendering } = referenceContext;

    if (!isVolumeRenderMode(rendering.renderMode)) {
      return;
    }

    // isVolumeRenderMode() is not a type guard; volume-kind renderings share
    // the volume-slice shape.
    const volumeRendering = rendering as unknown as {
      maxImageIdIndex: number;
      imageVolume: IImageVolume;
    };
    const imageIds = this.getImageIdsForReferenceContext(referenceContext);
    const maxImageIdIndex = volumeRendering.maxImageIdIndex;

    if (
      typeof viewRef.sliceIndex === 'number' &&
      viewRef.volumeId === referenceContext.data.volumeId &&
      viewRef.viewPlaneNormal
    ) {
      const targetSliceIndex = isOppositeNormal
        ? maxImageIdIndex - viewRef.sliceIndex
        : viewRef.sliceIndex;

      return {
        imageIdIndex: Math.min(Math.max(0, targetSliceIndex), maxImageIdIndex),
      };
    }

    const referencedImageIndex = this.findImageIdIndexByReference(
      imageIds,
      viewRef.referencedImageId,
      viewRef.referencedImageURI
    );

    if (typeof referencedImageIndex === 'number') {
      return this.toVolumeSliceTarget(
        volumeRendering.imageVolume,
        referencedImageIndex
      );
    }

    const targetPoint =
      viewRef.cameraFocalPoint ?? viewRef.planeRestriction?.point;

    if (targetPoint) {
      const referencedImageId = getClosestImageId(
        volumeRendering.imageVolume,
        targetPoint,
        effectiveViewPlaneNormal
      );
      const closestImageIndex = this.findImageIdIndexByReference(
        imageIds,
        referencedImageId
      );

      if (typeof closestImageIndex === 'number') {
        return this.toVolumeSliceTarget(
          volumeRendering.imageVolume,
          closestImageIndex
        );
      }

      return;
    }

    if (typeof viewRef.sliceIndex === 'number') {
      return {
        imageIdIndex: Math.min(
          Math.max(0, viewRef.sliceIndex),
          maxImageIdIndex
        ),
      };
    }
  }

  /**
   * Converts an index into the volume's imageId list to a slice target. The
   * exact world center is preferred; when the volume has no vtkImageData to
   * compute it from, falls back to treating the index as a camera-order
   * index (the previous behavior).
   */
  private toVolumeSliceTarget(
    imageVolume: Parameters<typeof getVolumeImageIdIndexWorldPoint>[0],
    imageIdListIndex: number
  ): { imageIdIndex?: number; sliceWorldPoint?: Point3 } {
    const sliceWorldPoint = getVolumeImageIdIndexWorldPoint(
      imageVolume,
      imageIdListIndex
    );

    return sliceWorldPoint
      ? { sliceWorldPoint }
      : { imageIdIndex: imageIdListIndex };
  }

  private getImageIdsForReferenceContext(
    referenceContext: PlanarReferenceContext
  ): string[] {
    return (
      referenceContext.data.imageVolume?.imageIds ||
      referenceContext.data.imageIds
    );
  }

  private findImageIdIndexByReference(
    imageIds: string[],
    referencedImageId?: string,
    referencedImageURI?: string
  ): number | undefined {
    const targetImageURI =
      referencedImageURI ||
      (referencedImageId ? imageIdToURI(referencedImageId) : undefined);

    if (!targetImageURI) {
      return;
    }

    const foundImageIdIndex = imageIds.findIndex(
      (imageId) => imageIdToURI(imageId) === targetImageURI
    );

    return foundImageIdIndex >= 0 ? foundImageIdIndex : undefined;
  }

  private getCurrentPlanarRendering(): PlanarRendering | undefined {
    return this.host.getCurrentBinding()?.rendering as
      | PlanarRendering
      | undefined;
  }

  private areNormalsEqual(
    currentViewPlaneNormal?: Point3,
    targetViewPlaneNormal?: Point3
  ): boolean {
    return Boolean(
      currentViewPlaneNormal &&
        targetViewPlaneNormal &&
        isEqual(currentViewPlaneNormal, targetViewPlaneNormal)
    );
  }

  private areNormalsOpposite(
    currentViewPlaneNormal?: Point3,
    targetViewPlaneNormal?: Point3
  ): boolean {
    if (!currentViewPlaneNormal || !targetViewPlaneNormal) {
      return false;
    }

    return isEqual(
      vec3.negate(
        vec3.create(),
        currentViewPlaneNormal as unknown as vec3
      ) as unknown as Point3,
      targetViewPlaneNormal
    );
  }
}

export default PlanarViewReferenceController;
