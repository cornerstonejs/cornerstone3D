import {
  cache,
  getEnabledElementByViewportId,
  type Types,
} from '@cornerstonejs/core';
import type { PlanarViewport } from '@cornerstonejs/core';
import type {
  RepresentationsData,
  Segmentation,
} from '../../../types/SegmentationStateTypes';
import type {
  LabelmapLayer,
  LabelmapSegmentationDataStack,
  LabelmapSegmentationDataVolume,
} from '../../../types/LabelmapTypes';
import getViewportLabelmapRenderMode from '../helpers/getViewportLabelmapRenderMode';
import { ensureLabelmapState } from './normalizeLabelmapSegmentationData';
import { getLabelmaps } from './labelmapLayerStore';
import { getLabelmapForSegment } from './labelmapSegmentBindings';
import { getReferencedImageIdToCurrentImageIdMap } from './labelmapPrimaryLayerFields';
import {
  StackLabelmapImageReferences,
  ViewableLabelmapImages,
  getLabelmapImageIdSources,
} from './stackLabelmapImageReferences';

type GetSegmentation = (segmentationId: string) => Segmentation | undefined;

class LabelmapImageReferenceResolver {
  private readonly getSegmentation: GetSegmentation;
  private readonly stackLabelmapImageIdReferenceMap = new Map<
    string,
    Map<string, string>
  >();
  private readonly labelmapImageIdReferenceMap = new Map<string, string[]>();
  // Index mapping each segmentationId to the set of keys it owns in
  // labelmapImageIdReferenceMap, so removeSegmentation can purge entries in
  // O(k) without scanning the whole map.
  private readonly keysBySegmentationId = new Map<string, Set<string>>();
  // Memo of already-performed isReferenceViewable scans. Each scan resolves
  // every labelmap imageId against the viewport's current image via full
  // metadata resolution (image plane, slice basis), which costs tens of ms
  // for multi-layer labelmaps - and the segmentation data-modified pipeline
  // re-enters this on EVERY brush/erase drag event. Scan keys include the
  // viewport id and a signature of the labelmap imageId set, so adding/removing
  // a layer (which changes the set) naturally forces a fresh scan.
  private readonly completedScanResultsBySegmentationId = new Map<
    string,
    Map<string, string | undefined>
  >();
  // The labelmap images of the images of the stack of each viewport, by
  // segmentation, made once for the image ids of the stack and of the
  // labelmap (see stackLabelmapImageReferences), so a scroll looks its image
  // up instead of checking every labelmap image against it.
  private readonly stackImageReferencesBySegmentationId = new Map<
    string,
    WeakMap<object, StackLabelmapImageReferences>
  >();
  private readonly viewableImagesBySegmentationId = new Map<
    string,
    WeakMap<object, ViewableLabelmapImages>
  >();

  constructor(getSegmentation: GetSegmentation) {
    this.getSegmentation = getSegmentation;
  }

  reset(): void {
    this.stackLabelmapImageIdReferenceMap.clear();
    this.labelmapImageIdReferenceMap.clear();
    this.keysBySegmentationId.clear();
    this.completedScanResultsBySegmentationId.clear();
    this.stackImageReferencesBySegmentationId.clear();
    this.viewableImagesBySegmentationId.clear();
  }

  removeSegmentation(segmentationId: string): void {
    this.stackLabelmapImageIdReferenceMap.delete(segmentationId);
    this.completedScanResultsBySegmentationId.delete(segmentationId);
    this.stackImageReferencesBySegmentationId.delete(segmentationId);
    this.viewableImagesBySegmentationId.delete(segmentationId);
    const keys = this.keysBySegmentationId.get(segmentationId);
    if (keys) {
      for (const key of keys) {
        this.labelmapImageIdReferenceMap.delete(key);
      }
      this.keysBySegmentationId.delete(segmentationId);
    }
  }

  private setLabelmapImageIds(
    segmentationId: string,
    key: string,
    labelmapImageIds: string[]
  ): void {
    this.labelmapImageIdReferenceMap.set(key, labelmapImageIds);
    let keys = this.keysBySegmentationId.get(segmentationId);
    if (!keys) {
      keys = new Set();
      this.keysBySegmentationId.set(segmentationId, keys);
    }
    keys.add(key);
  }

  getLabelmapImageIds(representationData: RepresentationsData) {
    const labelmapData = representationData.Labelmap;
    let labelmapImageIds;

    if (!labelmapData) {
      return;
    }

    if (labelmapData?.labelmaps) {
      const imageIds = Object.values(labelmapData.labelmaps).flatMap(
        (layer) => {
          if (layer.imageIds?.length) {
            return layer.imageIds;
          }

          if (layer.volumeId) {
            return (cache.getVolume(layer.volumeId) as Types.IImageVolume)
              ?.imageIds;
          }

          return [];
        }
      );

      return Array.from(new Set(imageIds.filter(Boolean)));
    }

    if ((labelmapData as LabelmapSegmentationDataStack).imageIds) {
      labelmapImageIds = (labelmapData as LabelmapSegmentationDataStack)
        .imageIds;
    } else if ((labelmapData as LabelmapSegmentationDataVolume).volumeId) {
      const volumeId = (labelmapData as LabelmapSegmentationDataVolume)
        .volumeId;

      const volume = cache.getVolume(volumeId) as Types.IImageVolume;
      labelmapImageIds = volume.imageIds;
    }

    return labelmapImageIds;
  }

  getLabelmapImageIdsForImageId(imageId: string, segmentationId: string) {
    const segmentation = this.getSegmentation(segmentationId);
    if (!segmentation?.representationData?.Labelmap) {
      return;
    }

    ensureLabelmapState(segmentation);
    return getReferencedImageIdToCurrentImageIdMap(segmentation).get(imageId);
  }

  /**
   * Finds the labelmap image of the image on display of a viewport and keeps
   * it as the reference of that image. A viewport without an image on
   * display, as a 3D viewport, has none: the answer is undefined, as on the
   * legacy 3D viewport, whose scan found no image.
   */
  updateLabelmapSegmentationImageReferences(
    viewportId: string,
    segmentationId: string
  ): string | undefined {
    const segmentation = this.getSegmentation(segmentationId);
    if (!segmentation) {
      return;
    }

    if (!this.stackLabelmapImageIdReferenceMap.has(segmentationId)) {
      this.stackLabelmapImageIdReferenceMap.set(segmentationId, new Map());
    }

    const { representationData } = segmentation;
    if (!representationData.Labelmap) {
      return;
    }

    const enabledElement = getEnabledElementByViewportId(viewportId);
    if (
      !enabledElement ||
      typeof (enabledElement.viewport as PlanarViewport).getCurrentImageId !==
        'function'
    ) {
      return;
    }

    const viewport = enabledElement.viewport as PlanarViewport;
    const referenceImageId = viewport.getCurrentImageId();
    const viewableImages = this.getViewableLabelmapImages(
      segmentationId,
      viewport,
      getLabelmapImageIdSources(representationData.Labelmap)
    );

    if (!referenceImageId || !viewableImages.getLabelmapImageIds().length) {
      return;
    }

    const viewableImageIds = viewableImages.getViewableImageIds(
      referenceImageId,
      viewport
    );

    viewableImageIds.forEach((labelmapImageId) => {
      this.stackLabelmapImageIdReferenceMap
        .get(segmentationId)
        .set(referenceImageId, labelmapImageId);
      this.updateLabelmapImageIdReferenceMap({
        segmentationId,
        referenceImageId,
        labelmapImageId,
      });
    });

    return viewableImageIds[viewableImageIds.length - 1];
  }

  /**
   * The labelmap images of the stack of a viewport for a segmentation, made
   * again when the image ids of the stack or of the labelmap layers change.
   */
  private getStackImageReferences(
    segmentationId: string,
    viewport: PlanarViewport,
    layers: LabelmapLayer[]
  ): StackLabelmapImageReferences {
    let byViewport =
      this.stackImageReferencesBySegmentationId.get(segmentationId);

    if (!byViewport) {
      byViewport = new WeakMap();
      this.stackImageReferencesBySegmentationId.set(segmentationId, byViewport);
    }

    const stackImageIds = viewport.getImageIds();
    let references = byViewport.get(viewport);

    if (!references?.isFor(stackImageIds, layers)) {
      references = new StackLabelmapImageReferences(stackImageIds, layers);
      byViewport.set(viewport, references);
    }

    return references;
  }

  private getViewableLabelmapImages(
    segmentationId: string,
    viewport: PlanarViewport,
    sources: ReturnType<typeof getLabelmapImageIdSources>
  ): ViewableLabelmapImages {
    let byViewport = this.viewableImagesBySegmentationId.get(segmentationId);

    if (!byViewport) {
      byViewport = new WeakMap();
      this.viewableImagesBySegmentationId.set(segmentationId, byViewport);
    }

    let viewableImages = byViewport.get(viewport);

    if (!viewableImages?.isFor(sources)) {
      viewableImages = new ViewableLabelmapImages(sources);
      byViewport.set(viewport, viewableImages);
    }

    return viewableImages;
  }

  /** Signature of one isReferenceViewable scan: the viewport's current image
   *  plus a cheap fingerprint of the labelmap imageId set (count + endpoints),
   *  so layer additions/removals invalidate naturally. */
  private generateScanKey(
    kind: 'current' | 'all',
    viewport: PlanarViewport,
    labelmapImageIds: string[]
  ): string | undefined {
    const referenceImageId =
      typeof viewport.getCurrentImageId === 'function'
        ? viewport.getCurrentImageId()
        : undefined;
    if (!referenceImageId) {
      return;
    }
    return `${kind}|${viewport.id}|${referenceImageId}|${
      labelmapImageIds.length
    }|${labelmapImageIds[0]}|${labelmapImageIds[labelmapImageIds.length - 1]}`;
  }

  private hasCompletedScan(segmentationId: string, scanKey: string): boolean {
    return !!this.completedScanResultsBySegmentationId
      .get(segmentationId)
      ?.has(scanKey);
  }

  private markCompletedScan(
    segmentationId: string,
    scanKey: string,
    result?: string
  ): void {
    let results = this.completedScanResultsBySegmentationId.get(segmentationId);
    if (!results) {
      results = new Map();
      this.completedScanResultsBySegmentationId.set(segmentationId, results);
    }
    results.set(scanKey, result);
  }

  getCurrentLabelmapImageIdsForViewport(
    viewportId: string,
    segmentationId: string
  ): string[] | undefined {
    const enabledElement = getEnabledElementByViewportId(viewportId);

    if (!enabledElement) {
      return;
    }

    const { viewport } = enabledElement;
    const viewportRenderMode = getViewportLabelmapRenderMode(viewport);

    if (
      viewportRenderMode !== 'image' ||
      typeof (viewport as PlanarViewport).getCurrentImageId !== 'function'
    ) {
      return;
    }

    const referenceImageId = (viewport as PlanarViewport).getCurrentImageId();
    const segmentation = this.getSegmentation(segmentationId);
    if (!segmentation) {
      return;
    }

    ensureLabelmapState(segmentation);

    const stackImageReferences = this.getStackImageReferences(
      segmentationId,
      viewport as PlanarViewport,
      getLabelmaps(segmentation) ?? []
    );
    const currentIndex = stackImageReferences.getImageIndex(referenceImageId);
    const resolvedImageIds = stackImageReferences.getLabelmapImageIds(
      referenceImageId,
      viewport
    );
    const key = this.generateMapKey({
      segmentationId,
      referenceImageId,
    });
    this.setLabelmapImageIds(segmentationId, key, resolvedImageIds);

    if (!this.stackLabelmapImageIdReferenceMap.has(segmentationId)) {
      this.stackLabelmapImageIdReferenceMap.set(segmentationId, new Map());
    }

    const activeSegmentIndex = Object.keys(segmentation.segments).find(
      (segmentIndex) => segmentation.segments[segmentIndex].active
    );
    const activeImageId = activeSegmentIndex
      ? getLabelmapForSegment(segmentation, Number(activeSegmentIndex))
          ?.imageIds?.[currentIndex]
      : undefined;

    this.stackLabelmapImageIdReferenceMap
      .get(segmentationId)
      .set(referenceImageId, activeImageId ?? resolvedImageIds[0]);

    return resolvedImageIds;
  }

  getCurrentLabelmapImageIdForViewport(
    viewportId: string,
    segmentationId: string
  ): string | undefined {
    const enabledElement = getEnabledElementByViewportId(viewportId);

    if (!enabledElement) {
      return;
    }

    const { viewport } = enabledElement;
    const viewportRenderMode = getViewportLabelmapRenderMode(viewport);

    if (
      viewportRenderMode !== 'image' ||
      typeof (viewport as PlanarViewport).getCurrentImageId !== 'function'
    ) {
      return;
    }

    const currentImageId = (viewport as PlanarViewport).getCurrentImageId();
    const currentImageIds = this.getCurrentLabelmapImageIdsForViewport(
      viewportId,
      segmentationId
    );
    if (!currentImageIds?.length) {
      return;
    }

    const segmentation = this.getSegmentation(segmentationId);
    const currentIndex = (viewport as PlanarViewport)
      .getImageIds()
      .indexOf(currentImageId);
    const activeSegmentIndex = segmentation
      ? Object.keys(segmentation.segments).find(
          (segmentIndex) => segmentation.segments[segmentIndex].active
        )
      : undefined;
    const activeImageId =
      segmentation && activeSegmentIndex
        ? getLabelmapForSegment(segmentation, Number(activeSegmentIndex))
            ?.imageIds?.[currentIndex]
        : undefined;

    return activeImageId ?? currentImageIds[0];
  }

  getStackSegmentationImageIdsForViewport(
    viewportId: string,
    segmentationId: string
  ): string[] {
    const segmentation = this.getSegmentation(segmentationId);

    if (!segmentation) {
      return [];
    }

    this.updateAllLabelmapSegmentationImageReferences(
      viewportId,
      segmentationId
    );
    const enabledElement = getEnabledElementByViewportId(viewportId);
    const imageIds =
      (
        enabledElement?.viewport as PlanarViewport | undefined
      )?.getImageIds?.() ?? [];
    const imageIdMap = getReferencedImageIdToCurrentImageIdMap(segmentation);

    return imageIds.flatMap((imageId) => imageIdMap.get(imageId) ?? []);
  }

  private updateLabelmapSegmentationReferences(
    segmentationId: string,
    viewport: PlanarViewport,
    labelmapImageIds: string[],
    updateCallback?: (
      viewport: PlanarViewport,
      segmentationId: string,
      labelmapImageIds: string[]
    ) => void
  ): string | undefined {
    const referenceImageId = viewport.getCurrentImageId();

    let viewableLabelmapImageIdFound = false;
    for (const labelmapImageId of labelmapImageIds) {
      const viewableImageId = viewport.isReferenceViewable(
        { referencedImageId: labelmapImageId },
        { asOverlay: true }
      );

      if (viewableImageId) {
        viewableLabelmapImageIdFound = true;
        this.stackLabelmapImageIdReferenceMap
          .get(segmentationId)
          .set(referenceImageId, labelmapImageId);
        this.updateLabelmapImageIdReferenceMap({
          segmentationId,
          referenceImageId,
          labelmapImageId,
        });
      }
    }

    updateCallback?.(viewport, segmentationId, labelmapImageIds);

    return viewableLabelmapImageIdFound
      ? this.stackLabelmapImageIdReferenceMap
          .get(segmentationId)
          .get(referenceImageId)
      : undefined;
  }

  /**
   * @deprecated Compatibility path for the old stack-labelmap API. New labelmap
   * layers should carry referencedImageIds so callers can use
   * getReferencedImageIdToCurrentImageIdMap without scanning every stack image
   * against every labelmap image.
   */
  private updateAllLabelmapSegmentationImageReferences(
    viewportId: string,
    segmentationId: string
  ): void {
    const segmentation = this.getSegmentation(segmentationId);
    if (!segmentation) {
      return;
    }

    if (!this.stackLabelmapImageIdReferenceMap.has(segmentationId)) {
      this.stackLabelmapImageIdReferenceMap.set(segmentationId, new Map());
    }

    const { representationData } = segmentation;
    if (!representationData.Labelmap) {
      return;
    }

    const labelmapImageIds = this.getLabelmapImageIds(representationData);
    const enabledElement = getEnabledElementByViewportId(viewportId);
    if (!enabledElement || !labelmapImageIds?.length) {
      return;
    }

    const stackViewport = enabledElement.viewport as PlanarViewport;

    const scanKey = this.generateScanKey(
      'all',
      stackViewport,
      labelmapImageIds
    );
    if (scanKey && this.hasCompletedScan(segmentationId, scanKey)) {
      return;
    }
    if (scanKey) {
      this.markCompletedScan(segmentationId, scanKey);
    }

    this.updateLabelmapSegmentationReferences(
      segmentationId,
      stackViewport,
      labelmapImageIds,
      (stackViewport, segmentationId, labelmapImageIds) => {
        const imageIds = stackViewport.getImageIds();
        imageIds.forEach((referenceImageId, index) => {
          for (const labelmapImageId of labelmapImageIds) {
            const viewableImageId = stackViewport.isReferenceViewable(
              { referencedImageId: labelmapImageId, sliceIndex: index },
              { asOverlay: true, withNavigation: true }
            );

            if (viewableImageId) {
              this.stackLabelmapImageIdReferenceMap
                .get(segmentationId)
                .set(referenceImageId, labelmapImageId);
              this.updateLabelmapImageIdReferenceMap({
                segmentationId,
                referenceImageId,
                labelmapImageId,
              });
            }
          }
        });
      }
    );
  }

  private updateLabelmapImageIdReferenceMap({
    segmentationId,
    referenceImageId,
    labelmapImageId,
  }): void {
    const key = this.generateMapKey({ segmentationId, referenceImageId });

    if (!this.labelmapImageIdReferenceMap.has(key)) {
      this.setLabelmapImageIds(segmentationId, key, [labelmapImageId]);
      return;
    }

    const currentValues = this.labelmapImageIdReferenceMap.get(key) ?? [];
    const newValues = Array.from(new Set([...currentValues, labelmapImageId]));
    this.setLabelmapImageIds(segmentationId, key, newValues);
  }

  private generateMapKey({ segmentationId, referenceImageId }) {
    return `${segmentationId}-${referenceImageId}`;
  }
}

export default LabelmapImageReferenceResolver;
