import { vec3 } from 'gl-matrix';
import { ActorRenderMode } from '../../../types';
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
import {
  getDimensionGroupReferenceContext,
  type ViewportNextReferenceContext,
} from '../viewportNextReferenceCompatibility';
import type { LoadedData } from '../ViewportArchitectureTypes';
import type { PlanarRendering } from './planarRuntimeTypes';
import {
  getPlanarReferencedImageId,
  getPlanarViewReference,
  getPlanarViewReferenceId,
  isPlanarPlaneViewable,
} from './planarViewReference';
import { resolvePlanarViewportView } from './PlanarResolvedView';
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
    fallbackContexts: ViewportNextReferenceContext[]
  ): ViewportNextReferenceContext[] {
    const referenceContexts = this.getAllPlanarReferenceContexts();

    if (!referenceContexts.length) {
      return fallbackContexts;
    }

    return referenceContexts.map((referenceContext) =>
      this.getViewportNextReferenceContext(referenceContext)
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

  private getViewportNextReferenceContext(
    referenceContext: PlanarReferenceContext
  ): ViewportNextReferenceContext {
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

    if (
      rendering.renderMode === ActorRenderMode.CPU_IMAGE ||
      rendering.renderMode === ActorRenderMode.VTK_IMAGE
    ) {
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
    const nextImageIdIndex = this.resolveVolumeReferenceImageIdIndex(
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
      (typeof nextImageIdIndex === 'number'
        ? this.host.getVolumeSliceWorldPointForImageIdIndex(nextImageIdIndex)
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

    this.host.setViewState(viewStatePatch);

    return true;
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

  private resolveVolumeReferenceImageIdIndex(
    referenceContext: PlanarReferenceContext,
    viewRef: ViewReference,
    effectiveViewPlaneNormal: Point3,
    isOppositeNormal: boolean
  ): number | undefined {
    const { rendering } = referenceContext;

    if (
      rendering.renderMode !== ActorRenderMode.CPU_VOLUME &&
      rendering.renderMode !== ActorRenderMode.VTK_VOLUME_SLICE
    ) {
      return;
    }

    const imageIds = this.getImageIdsForReferenceContext(referenceContext);
    const maxImageIdIndex = rendering.maxImageIdIndex;

    if (
      typeof viewRef.sliceIndex === 'number' &&
      viewRef.volumeId === referenceContext.data.volumeId &&
      viewRef.viewPlaneNormal
    ) {
      const targetSliceIndex = isOppositeNormal
        ? maxImageIdIndex - viewRef.sliceIndex
        : viewRef.sliceIndex;

      return Math.min(Math.max(0, targetSliceIndex), maxImageIdIndex);
    }

    const referencedImageIndex = this.findImageIdIndexByReference(
      imageIds,
      viewRef.referencedImageId,
      viewRef.referencedImageURI
    );

    if (typeof referencedImageIndex === 'number') {
      return referencedImageIndex;
    }

    const targetPoint =
      viewRef.cameraFocalPoint ?? viewRef.planeRestriction?.point;

    if (targetPoint) {
      const referencedImageId = getClosestImageId(
        rendering.imageVolume,
        targetPoint,
        effectiveViewPlaneNormal
      );

      return this.findImageIdIndexByReference(imageIds, referencedImageId);
    }

    if (typeof viewRef.sliceIndex === 'number') {
      return Math.min(Math.max(0, viewRef.sliceIndex), maxImageIdIndex);
    }
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
