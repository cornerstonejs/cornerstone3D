import { vec3 } from 'gl-matrix';
import { PlanarRenderModeId } from './planarRenderModeIds';
import type {
  ICamera,
  IDynamicImageVolume,
  Point3,
  ReferenceCompatibleOptions,
  ViewReference,
  ViewReferenceSpecifier,
} from '../../../types';
import type { PlaneRestriction } from '../../../types/IViewport';
import cache from '../../../cache/cache';
import getClosestImageId from '../../../utilities/getClosestImageId';
import { calculateMinimalDistanceForStackViewport } from '../../../utilities/getClosestStackImageIndexForPoint';
import calculateSpacingBetweenImageIds from '../../../utilities/calculateSpacingBetweenImageIds';
import * as metaData from '../../../metaData';
import { MetadataModules } from '../../../enums';
import imageIdToURI from '../../../utilities/imageIdToURI';
import isEqual from '../../../utilities/isEqual';
import getImagesFrameOfReferenceUID, {
  isEarlierImagesFrameOfReferenceUID,
} from '../../../utilities/getImagesFrameOfReferenceUID';
import getViewSlabDepth from '../../../utilities/getViewSlabDepth';
import {
  isImageRenderMode,
  isVolumeRenderMode,
} from '../../helpers/renderBackendRegistry';
import { getViewportLocalFrameOfReferenceUID } from '../../helpers/getViewportLocalFrameOfReferenceUID';
import {
  getDimensionGroupReferenceContext,
  isViewReferenceViewable,
  type ViewReferenceContext,
} from '../viewReferenceCompatibility';
import type { LoadedData } from '../ViewportArchitectureTypes';
import type { PlanarRendering } from './planarRuntimeTypes';
import { getVolumeImageIdIndexWorldPoint } from './planarSliceBasis';
import {
  getPlanarReferencedImageId,
  getPlanarViewReference,
  getPlanarViewReferenceId,
  hasNonFiniteViewReferenceGeometry,
  isPlanarPlaneViewable,
  namesOnlyFrameOfReferencePlaneOrPoints,
} from './planarViewReference';
import { resolvePlanarViewportView } from './PlanarResolvedView';
import type { PlanarDataBinding } from './PlanarMountedData';
import type {
  PlanarDisplaySetAppearance,
  PlanarPayload,
  PlanarViewportRenderContext,
  PlanarViewState,
} from './PlanarViewportTypes';

/** The tolerance of the legacy `VolumeViewport.isInAcquisitionPlane` of 5.x. */
const PARALLEL_COSINE = 0.99;

/** The image ids of a volume in the reverse order, one list for each. */
const reversedImageIds = new WeakMap<string[], string[]>();

export type PlanarReferenceContext = {
  displaySetId: string;
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
  getSourceDisplaySetId(): string | undefined;
  getBinding(displaySetId: string): PlanarDataBinding | undefined;
  getBindings(): Iterable<[string, PlanarDataBinding]>;
  getCurrentBinding(): PlanarDataBinding | undefined;
  getDisplaySetAppearance(
    displaySetId: string
  ): PlanarDisplaySetAppearance | undefined;
  getRenderContext(): PlanarViewportRenderContext;
  getResolvedView(args?: {
    frameOfReferenceUID?: string;
    sliceIndex?: number;
  }): PlanarResolvedViewLike | undefined;
  getViewState(): PlanarViewState;
  getVolumeSliceWorldPointForImageIdIndex(
    imageIdIndex: number
  ): Point3 | undefined;
  setImageIdIndex(imageIdIndex: number): Promise<string>;
  setViewState(viewStatePatch: Partial<PlanarViewState>): void;
};

class PlanarViewReferenceController {
  constructor(private readonly host: PlanarViewReferenceHost) {}

  /**
   * The volume id of the binding that shows the volume of
   * `viewRefSpecifier.volumeId`, and undefined when no binding shows it, as
   * the legacy volume viewport. Without a volume id, that of the current
   * binding. A binding in an image render mode (a stack) shows no volume,
   * so it gives undefined, though its data keeps the id that its images
   * would get as a volume.
   */
  getVolumeId(
    viewRefSpecifier: ViewReferenceSpecifier = {}
  ): string | undefined {
    const referenceContext = viewRefSpecifier.volumeId
      ? this.findPlanarReferenceContextByVolumeId(viewRefSpecifier.volumeId)
      : this.getCurrentPlanarReferenceContext();

    if (
      !referenceContext ||
      isImageRenderMode(referenceContext.rendering?.renderMode)
    ) {
      return;
    }

    return referenceContext.data.volumeId;
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
      displaySetId: referenceContext?.displaySetId,
      frameOfReferenceUID:
        referenceContext?.frameOfReferenceUID ?? this.getFrameOfReferenceUID(),
      data: referenceContext?.data,
      rendering: referenceContext?.rendering,
      renderContext: this.host.getRenderContext(),
      viewRefSpecifier,
      referencePlaneThickness: this.getReferenceSlabDepth(referenceContext),
    });
  }

  /**
   * The depth in mm that a new annotation of the view takes as its
   * `referencePlaneThickness`: twice the `slabThickness` of the appearance
   * of the display set of the reference, because a slab of `T` shows the
   * slices within about `T` of the plane, as the legacy volume viewport
   * doubled its slab. Undefined in stack mode and without a slab.
   */
  private getReferenceSlabDepth(
    referenceContext: PlanarReferenceContext | undefined
  ): number | undefined {
    if (
      !referenceContext ||
      !isVolumeRenderMode(referenceContext.rendering?.renderMode)
    ) {
      return;
    }

    const slabThickness = this.host.getDisplaySetAppearance(
      referenceContext.displaySetId
    )?.slabThickness;

    return typeof slabThickness === 'number'
      ? getViewSlabDepth(slabThickness * 2)
      : undefined;
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

  /**
   * Moves the view to a reference. The source stays what it is: a reference
   * of an overlay moves the source to its plane and its point, and a
   * reference never makes the display set that it names the source, also
   * while a new source mounts and its binding is not there yet.
   */
  setViewReference(viewRef: ViewReference): void {
    if (!viewRef || hasNonFiniteViewReferenceGeometry(viewRef)) {
      return;
    }

    this.selectDimensionGroup(viewRef);

    const targetContext = this.resolveViewReferenceContext(viewRef);

    if (!targetContext) {
      return;
    }

    const sourceContext = this.getCurrentPlanarReferenceContext();

    if (
      sourceContext &&
      sourceContext.displaySetId !== targetContext.displaySetId
    ) {
      this.applyViewReferenceToCurrentBinding(
        this.getSourceReferenceForOverlay(viewRef, sourceContext)
      );
      return;
    }

    this.applyViewReferenceToCurrentBinding(viewRef);
  }

  /**
   * Selects the time point of a reference on the dynamic volume that it
   * names, or on the volume on display when it names none: the time point
   * belongs to the referenced volume, for example the PET of a fusion. As on
   * the legacy volume viewport, the reference must be in the frame of
   * reference of the viewport and its time point one of the volume. A stack
   * shows no volume, so it selects nothing.
   */
  private selectDimensionGroup(viewRef: ViewReference): void {
    const { dimensionGroupNumber, FrameOfReferenceUID } = viewRef;
    const volumeId = this.getVolumeId({ volumeId: viewRef.volumeId });
    const volume = volumeId
      ? (cache.getVolume(volumeId) as IDynamicImageVolume | undefined)
      : undefined;

    if (
      !volume?.isDynamicVolume?.() ||
      !dimensionGroupNumber ||
      dimensionGroupNumber > volume.numDimensionGroups ||
      FrameOfReferenceUID !== this.getFrameOfReferenceUID()
    ) {
      return;
    }

    volume.dimensionGroupNumber = dimensionGroupNumber;
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
      this.getMadeUpFrameOfReferenceUID(
        binding?.data as LoadedData<PlanarPayload> | undefined
      )
    );
  }

  /**
   * The frame of reference of data without one: the one of its images
   * (`getImagesFrameOfReferenceUID`), or, without data or images, the one of
   * the viewport, `<5.x type string>-viewport-<id>`.
   */
  private getMadeUpFrameOfReferenceUID(
    data: LoadedData<PlanarPayload> | undefined
  ): string {
    const imageIds = data?.imageVolume?.imageIds || data?.imageIds;

    return imageIds?.length
      ? getImagesFrameOfReferenceUID(imageIds)
      : getViewportLocalFrameOfReferenceUID(
          this.host.viewportType,
          this.host.viewportId
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
    fallbackContexts: ViewReferenceContext[]
  ): ViewReferenceContext[] {
    const referenceContexts = this.getAllPlanarReferenceContexts();

    if (!referenceContexts.length) {
      return fallbackContexts;
    }

    return referenceContexts.map((referenceContext) =>
      this.toViewReferenceContext(referenceContext)
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
    const sourceDisplaySetId = this.host.getSourceDisplaySetId();

    if (sourceDisplaySetId) {
      const activeContext =
        this.getPlanarReferenceContextByDisplaySetId(sourceDisplaySetId);

      if (activeContext) {
        return activeContext;
      }
    }

    for (const [displaySetId] of this.host.getBindings()) {
      return this.getPlanarReferenceContextByDisplaySetId(displaySetId);
    }
  }

  private getPlanarReferenceContextByDisplaySetId(
    displaySetId: string
  ): PlanarReferenceContext | undefined {
    const binding = this.host.getBinding(displaySetId);

    if (!binding) {
      return;
    }

    const data = binding.data as LoadedData<PlanarPayload>;

    return {
      displaySetId,
      data,
      frameOfReferenceUID:
        binding.getFrameOfReferenceUID() ??
        this.getMadeUpFrameOfReferenceUID(data),
      rendering: binding.rendering as PlanarRendering,
    };
  }

  private getAllPlanarReferenceContexts(): PlanarReferenceContext[] {
    const contexts: PlanarReferenceContext[] = [];

    for (const [displaySetId] of this.host.getBindings()) {
      const referenceContext =
        this.getPlanarReferenceContextByDisplaySetId(displaySetId);

      if (referenceContext) {
        contexts.push(referenceContext);
      }
    }

    return contexts;
  }

  /**
   * The facts of a binding that a reference is checked against. A binding in
   * an image render mode (a stack) shows no volume, so its context has no
   * volume id, though its data keeps the id that its images would get as a
   * volume: a reference of that volume is then checked across modes, by its
   * image and its plane.
   */
  private toViewReferenceContext(
    referenceContext: PlanarReferenceContext
  ): ViewReferenceContext {
    const view = this.resolveReferenceView(referenceContext);
    const resolvedView = view?.toICamera();
    const volumeId = isImageRenderMode(referenceContext.rendering?.renderMode)
      ? undefined
      : referenceContext.data.volumeId;
    const maxImageIdIndex = this.getReferenceMaxImageIdIndex(
      referenceContext,
      view
    );

    return {
      displaySetId: referenceContext.displaySetId,
      displaySetIds: [referenceContext.data.id],
      frameOfReferenceUID: referenceContext.frameOfReferenceUID,
      imageIds: this.getImageIdsBySliceIndex(referenceContext),
      currentImageIdIndex: this.getReferenceImageIdIndex(
        referenceContext,
        view
      ),
      numberOfSlices:
        typeof maxImageIdIndex === 'number' ? maxImageIdIndex + 1 : undefined,
      volumeId,
      volumeIds: volumeId ? [volumeId] : undefined,
      cameraFocalPoint: resolvedView?.focalPoint,
      viewPlaneNormal: resolvedView?.viewPlaneNormal,
      ...getDimensionGroupReferenceContext(referenceContext.data.imageVolume),
    };
  }

  /**
   * The image ids that a reference is checked against, by slice index: the
   * check reads `imageIds[currentImageIdIndex]` as the image on display. The
   * image ids of a stack are in that order. The slices of a view of a volume
   * along its images can run against the order of the image ids, and the
   * image ids are then given in the reverse order. A view that cuts across
   * the images has no image for a slice, and gets the image ids as they are.
   */
  private getImageIdsBySliceIndex(
    referenceContext: PlanarReferenceContext
  ): string[] {
    const imageIds = this.getImageIdsForReferenceContext(referenceContext);
    const { data, rendering } = referenceContext;
    const direction = data.imageVolume?.direction;

    if (
      !direction ||
      imageIds.length < 2 ||
      isImageRenderMode(rendering.renderMode)
    ) {
      return imageIds;
    }

    const [first, last] = [0, imageIds.length - 1].map((sliceIndex) =>
      resolvePlanarViewportView({
        viewState: this.host.getViewState(),
        data,
        rendering,
        renderContext: this.host.getRenderContext(),
        sliceIndex,
      })?.getSliceBasis()
    );
    const scanAxis = direction.slice(6, 9) as Point3;

    if (
      !first ||
      !last ||
      Math.abs(vec3.dot(first.viewPlaneNormal, scanAxis)) < PARALLEL_COSINE
    ) {
      return imageIds;
    }

    const alongScanAxis = vec3.dot(
      vec3.sub(vec3.create(), last.sliceCenterWorld, first.sliceCenterWorld),
      scanAxis
    );

    if (alongScanAxis >= 0) {
      return imageIds;
    }

    if (!reversedImageIds.has(imageIds)) {
      reversedImageIds.set(imageIds, [...imageIds].reverse());
    }

    return reversedImageIds.get(imageIds);
  }

  /**
   * The view of a binding in the view state of the viewport: its slice basis,
   * its slice index and its number of slices, by the slice grid of the
   * orientation of the view state.
   */
  private resolveReferenceView(referenceContext: PlanarReferenceContext) {
    return resolvePlanarViewportView({
      viewState: this.host.getViewState(),
      data: referenceContext.data,
      frameOfReferenceUID: referenceContext.frameOfReferenceUID,
      rendering: referenceContext.rendering,
      renderContext: this.host.getRenderContext(),
    });
  }

  /**
   * The last slice index of the view of a binding in a volume render mode:
   * that of its view in the view state of the viewport, which is what
   * `getNumberOfSlices` answers once the binding draws. The rendering keeps
   * the number of the acquired images until its first draw, so a mount that
   * starts at a view reference reads the view that it is about to show.
   * Otherwise the last index that the rendering keeps.
   */
  private getReferenceMaxImageIdIndex(
    referenceContext: PlanarReferenceContext,
    view = this.resolveReferenceView(referenceContext)
  ): number | undefined {
    const { rendering } = referenceContext;

    if (isVolumeRenderMode(rendering?.renderMode)) {
      const maxImageIdIndex = view?.state.maxImageIdIndex;

      if (typeof maxImageIdIndex === 'number') {
        return maxImageIdIndex;
      }
    }

    return (rendering as { maxImageIdIndex?: number } | undefined)
      ?.maxImageIdIndex;
  }

  /**
   * The image index that a reference is checked against. For the source of a
   * stack it is the requested index of the view state, as the legacy stack
   * viewport checks against the index of the last request. For a volume it is
   * the slice index of its view in the view state, as `getSliceIndex`
   * answers. Otherwise it is the index that the rendering shows.
   */
  private getReferenceImageIdIndex(
    referenceContext: PlanarReferenceContext,
    view = this.resolveReferenceView(referenceContext)
  ): number {
    const { slice } = this.host.getViewState();
    const { rendering } = referenceContext;

    if (
      slice?.kind === 'stackIndex' &&
      referenceContext.displaySetId === this.host.getSourceDisplaySetId() &&
      isImageRenderMode(rendering.renderMode)
    ) {
      return slice.imageIdIndex;
    }

    if (
      isVolumeRenderMode(rendering.renderMode) &&
      typeof view?.state.currentImageIdIndex === 'number'
    ) {
      return view.state.currentImageIdIndex;
    }

    return rendering.currentImageIdIndex;
  }

  private findPlanarReferenceContextByVolumeId(
    volumeId: string
  ): PlanarReferenceContext | undefined {
    for (const [displaySetId, binding] of this.host.getBindings()) {
      const bindingData = binding.data as LoadedData<PlanarPayload>;

      if (bindingData.volumeId === volumeId) {
        return this.getPlanarReferenceContextByDisplaySetId(displaySetId);
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
    if (viewRef.displaySetId) {
      const dataContext = this.getPlanarReferenceContextByDisplaySetId(
        viewRef.displaySetId
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

  /**
   * The reference that the source takes for a reference of one of the
   * overlays of the viewport, as the legacy volume viewport took the
   * reference of another volume of its fusion: the plane and the point of the
   * reference move the view, and the source and the order of the layers
   * stay. A volume reads the image and the slice index of the overlay as it
   * reads those of another series. A stack goes by its images, so a stack
   * whose images do not hold the image of the reference goes to its image at
   * the point of the reference: the image and the slice index of the overlay
   * are left out.
   */
  private getSourceReferenceForOverlay(
    viewRef: ViewReference,
    sourceContext: PlanarReferenceContext
  ): ViewReference {
    if (!isImageRenderMode(sourceContext.rendering.renderMode)) {
      return viewRef;
    }

    const sourceImageIndex = this.findImageIdIndexByReference(
      this.getImageIdsForReferenceContext(sourceContext),
      viewRef.referencedImageId,
      viewRef.referencedImageURI
    );

    if (typeof sourceImageIndex === 'number') {
      return viewRef;
    }

    const {
      referencedImageId: _referencedImageId,
      referencedImageURI: _referencedImageURI,
      sliceIndex: _sliceIndex,
      ...reference
    } = viewRef;

    return reference;
  }

  /**
   * Whether a reference is in the frame of reference of a context: it names
   * none, or the same, or the name made up for the images of the context
   * before that name took a SHA-256 digest, when it names one of those images
   * (`isEarlierImagesFrameOfReferenceUID`), as a reference saved then.
   */
  private isInFrameOfReference(
    viewRef: ViewReference,
    referenceContext: PlanarReferenceContext
  ): boolean {
    if (
      !viewRef.FrameOfReferenceUID ||
      viewRef.FrameOfReferenceUID === referenceContext.frameOfReferenceUID
    ) {
      return true;
    }

    const imageIds = this.getImageIdsForReferenceContext(referenceContext);
    const referencedImageURI =
      viewRef.referencedImageURI ||
      (viewRef.referencedImageId
        ? imageIdToURI(viewRef.referencedImageId)
        : undefined);

    return (
      !!referencedImageURI &&
      !!imageIds?.some(
        (imageId) => imageIdToURI(imageId) === referencedImageURI
      ) &&
      isEarlierImagesFrameOfReferenceUID(viewRef.FrameOfReferenceUID, imageIds)
    );
  }

  private applyViewReferenceToCurrentBinding(viewRef: ViewReference): boolean {
    const referenceContext = this.getCurrentPlanarReferenceContext();

    if (
      !referenceContext ||
      !this.isInFrameOfReference(viewRef, referenceContext)
    ) {
      return false;
    }

    const { rendering } = referenceContext;

    if (
      rendering.renderMode === PlanarRenderModeId.CANVAS_FRAME ||
      rendering.renderMode === PlanarRenderModeId.VTK_FRAME
    ) {
      return this.applyImageViewReference(referenceContext, viewRef);
    }

    return this.applyVolumeViewReference(referenceContext, viewRef);
  }

  /**
   * Moves a stack to the image of a reference: the image that it names, else
   * its slice index, else the image nearest to its focal point. A reference
   * that names an image that the stack does not hold moves nothing, as on the
   * legacy stack viewport: it is not viewable on the stack, and its slice
   * index and its focal point belong to the images of another series.
   *
   * A reference of a volume that names no image, as a sagittal slice gives,
   * counts its slice index in the slices of the view of that volume, so the
   * slice index is not read. Such a reference moves the stack only when the
   * stack takes it with navigation (`isViewReferenceViewable`), as a volume
   * that it shows as an overlay, and then to the image at its focal point.
   * The legacy stack viewport went to the image at the slice index.
   *
   * A slice index counts only when the reference names no display set or the
   * display set of the stack (as `isSliceIndexOfContext` reads it), and only
   * for an image of the stack: a slice index of another display set, past
   * the last image or between two images moves nothing. A reference of a
   * display set that the viewport does not show, or one that names only a
   * frame of reference, a plane or points
   * (`namesOnlyFrameOfReferencePlaneOrPoints`), moves nothing either: the
   * stack does not take it with navigation, so `setViewReference` and
   * `isReferenceViewable(ref, { withNavigation: true })` agree.
   */
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

    if (viewRef.referencedImageId || viewRef.referencedImageURI) {
      return false;
    }

    if (
      viewRef.volumeId &&
      !isViewReferenceViewable(viewRef, this.getReferenceViewContexts([]), {
        withNavigation: true,
      })
    ) {
      return false;
    }

    if (
      !viewRef.volumeId &&
      viewRef.displaySetId &&
      !this.getPlanarReferenceContextByDisplaySetId(viewRef.displaySetId)
    ) {
      return false;
    }

    if (
      typeof viewRef.sliceIndex === 'number' &&
      !viewRef.volumeId &&
      (!viewRef.displaySetId ||
        viewRef.displaySetId === referenceContext.displaySetId)
    ) {
      if (
        !Number.isInteger(viewRef.sliceIndex) ||
        viewRef.sliceIndex < 0 ||
        viewRef.sliceIndex >= imageIds.length
      ) {
        return false;
      }

      this.host.setImageIdIndex(viewRef.sliceIndex);
      return true;
    }

    if (namesOnlyFrameOfReferencePlaneOrPoints(viewRef)) {
      return false;
    }

    const closestFrameIndex = this.findClosestFrameIndexOfFocalPoint(
      referenceContext,
      viewRef,
      imageIds
    );

    if (typeof closestFrameIndex === 'number') {
      this.host.setImageIdIndex(closestFrameIndex);
      return true;
    }

    return false;
  }

  /**
   * The image nearest to the focal point of a reference that has no slice
   * index, for example the reference that crosshairs send. The image must be
   * at most one slice spacing from the point, and a reference with a
   * `viewPlaneNormal` must be parallel to the plane of the image; otherwise
   * no image of the stack shows the reference.
   */
  private findClosestFrameIndexOfFocalPoint(
    referenceContext: PlanarReferenceContext,
    viewRef: ViewReference,
    imageIds: string[]
  ): number | undefined {
    const point = viewRef.cameraFocalPoint;

    if (!point || !imageIds.length) {
      return;
    }

    const stackLike = {
      getImageIds: () => imageIds,
      getCurrentImageIdIndex: () =>
        referenceContext.rendering.currentImageIdIndex ?? 0,
    };
    const closest = calculateMinimalDistanceForStackViewport(point, stackLike);

    if (!closest) {
      return;
    }

    const { index, distance } = closest;
    const neighbour = imageIds[index + 1] ?? imageIds[index - 1];
    const spacing = calculateSpacingBetweenImageIds(
      neighbour ? [imageIds[index], neighbour] : [imageIds[index]]
    );

    if (distance > spacing) {
      return;
    }

    if (viewRef.viewPlaneNormal) {
      const { rowCosines, columnCosines } = metaData.get(
        MetadataModules.IMAGE_PLANE,
        imageIds[index]
      );
      const normal = vec3.cross(vec3.create(), rowCosines, columnCosines);

      if (
        Math.abs(vec3.dot(normal, viewRef.viewPlaneNormal as vec3)) <
        PARALLEL_COSINE
      ) {
        return;
      }
    }

    return index;
  }

  /**
   * Turns a volume binding to the plane of a reference and moves it to the
   * slice of the reference. A reference with a slice index in another plane
   * than the view and no point moves nothing: its slice index counts in the
   * slices of its own plane, so it is no slice of this view, and
   * `isReferenceViewable(ref, { withNavigation: true, withOrientation: true })`
   * refuses it too. With a point, the point decides.
   */
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

    if (
      shouldReorient &&
      viewRef.sliceIndex !== undefined &&
      !isViewReferenceViewable(viewRef, this.getReferenceViewContexts([]), {
        withNavigation: true,
        withOrientation: true,
      })
    ) {
      return false;
    }

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
      sliceTarget?.imagePlanePoint ??
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
   *
   * As on the legacy volume viewport, a slice index counts only with the
   * volume id of the volume and a view plane normal. In the acquisition plane
   * a named image goes before a focal point (`imagePlanePoint`), and an image
   * of another series of the same frame of reference names the plane of its
   * image position.
   */
  private resolveVolumeReferenceSliceTarget(
    referenceContext: PlanarReferenceContext,
    viewRef: ViewReference,
    effectiveViewPlaneNormal: Point3,
    isOppositeNormal: boolean
  ):
    | {
        imageIdIndex?: number;
        sliceWorldPoint?: Point3;
        imagePlanePoint?: Point3;
      }
    | undefined {
    const { rendering } = referenceContext;

    if (
      rendering.renderMode !== PlanarRenderModeId.CANVAS_CPU_SLICE &&
      rendering.renderMode !== PlanarRenderModeId.VTK_GPU_VOLUME_SLICE &&
      rendering.renderMode !== PlanarRenderModeId.VTK_CPU_SLICE
    ) {
      return;
    }

    const imageIds = this.getImageIdsForReferenceContext(referenceContext);
    const maxImageIdIndex =
      this.getReferenceMaxImageIdIndex(referenceContext) ??
      rendering.maxImageIdIndex;

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
    const inAcquisitionPlane = this.showsAcquisitionPlane(
      rendering.imageVolume,
      effectiveViewPlaneNormal
    );

    if (typeof referencedImageIndex === 'number') {
      const target = this.toVolumeSliceTarget(
        rendering.imageVolume,
        referencedImageIndex
      );

      return inAcquisitionPlane && target.sliceWorldPoint
        ? { imagePlanePoint: target.sliceWorldPoint }
        : target;
    }

    const otherImagePoint = inAcquisitionPlane
      ? this.getOtherImagePlanePoint(referenceContext, viewRef)
      : undefined;

    if (otherImagePoint) {
      return { imagePlanePoint: otherImagePoint };
    }

    const targetPoint =
      viewRef.cameraFocalPoint ?? viewRef.planeRestriction?.point;

    if (targetPoint) {
      const referencedImageId = getClosestImageId(
        rendering.imageVolume,
        targetPoint,
        effectiveViewPlaneNormal
      );
      const closestImageIndex = this.findImageIdIndexByReference(
        imageIds,
        referencedImageId
      );

      if (typeof closestImageIndex === 'number') {
        return this.toVolumeSliceTarget(
          rendering.imageVolume,
          closestImageIndex
        );
      }
    }
  }

  /**
   * Whether a view plane normal shows the acquisition plane of a volume, with
   * the tolerance of the legacy `VolumeViewport.isInAcquisitionPlane`.
   */
  private showsAcquisitionPlane(
    imageVolume: { direction?: ArrayLike<number> } | undefined,
    viewPlaneNormal: Point3
  ): boolean {
    const direction = imageVolume?.direction;

    if (!direction) {
      return false;
    }

    return (
      Math.abs(
        vec3.dot(viewPlaneNormal as unknown as vec3, [
          direction[6],
          direction[7],
          direction[8],
        ])
      ) > PARALLEL_COSINE
    );
  }

  /**
   * The image position of an image that a reference names and the volume
   * does not hold, when the reference is of the frame of reference of the
   * volume: the plane of that image, which the legacy volume viewport went to.
   */
  private getOtherImagePlanePoint(
    referenceContext: PlanarReferenceContext,
    viewRef: ViewReference
  ): Point3 | undefined {
    if (
      !viewRef.referencedImageId ||
      viewRef.FrameOfReferenceUID !== referenceContext.frameOfReferenceUID
    ) {
      return;
    }

    const imagePlane = metaData.get(
      MetadataModules.IMAGE_PLANE,
      viewRef.referencedImageId
    ) as { imagePositionPatient?: Point3 } | undefined;
    const position = imagePlane?.imagePositionPatient;

    return position ? ([...position] as Point3) : undefined;
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
