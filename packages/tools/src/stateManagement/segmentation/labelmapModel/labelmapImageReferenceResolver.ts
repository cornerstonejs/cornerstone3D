import {
  cache,
  getEnabledElementByViewportId,
  type Types,
} from '@cornerstonejs/core';
import type {
  RepresentationsData,
  Segmentation,
} from '../../../types/SegmentationStateTypes';
import type {
  LabelmapSegmentationDataStack,
  LabelmapSegmentationDataVolume,
} from '../../../types/LabelmapTypes';
import getViewportLabelmapRenderMode from '../helpers/getViewportLabelmapRenderMode';
import { ensureLabelmapState } from './normalizeLabelmapSegmentationData';
import { getLabelmaps } from './labelmapLayerStore';
import { getLabelmapForSegment } from './labelmapSegmentBindings';
import { getReferencedImageIdToCurrentImageIdMap } from './labelmapLegacyAdapter';

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

  constructor(getSegmentation: GetSegmentation) {
    this.getSegmentation = getSegmentation;
  }

  reset(): void {
    this.stackLabelmapImageIdReferenceMap.clear();
    this.labelmapImageIdReferenceMap.clear();
    this.keysBySegmentationId.clear();
  }

  removeSegmentation(segmentationId: string): void {
    this.stackLabelmapImageIdReferenceMap.delete(segmentationId);
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
      return Array.from(
        new Set(
          Object.values(labelmapData.labelmaps)
            .flatMap((layer) => layer.imageIds ?? [])
            .filter(Boolean)
        )
      );
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

    const labelmapImageIds = this.getLabelmapImageIds(representationData);
    const enabledElement = getEnabledElementByViewportId(viewportId);
    if (!enabledElement || !labelmapImageIds?.length) {
      return;
    }

    return this.updateLabelmapSegmentationReferences(
      segmentationId,
      enabledElement.viewport as Types.IStackViewport,
      labelmapImageIds
    );
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
      typeof (viewport as Types.IStackViewport).getCurrentImageId !== 'function'
    ) {
      return;
    }

    const referenceImageId = (
      viewport as Types.IStackViewport
    ).getCurrentImageId();
    const segmentation = this.getSegmentation(segmentationId);
    if (!segmentation) {
      return;
    }

    ensureLabelmapState(segmentation);

    const viewportImageIds = (viewport as Types.IStackViewport).getImageIds();
    const currentIndex = viewportImageIds.indexOf(referenceImageId);
    const labelmapImageIds: string[] = [];

    getLabelmaps(segmentation).forEach((layer) => {
      const referencedImageIds =
        layer.referencedImageIds ?? viewportImageIds ?? [];
      const referencedIndices = referencedImageIds.reduce<number[]>(
        (indices, candidateImageId, index) => {
          if (candidateImageId === referenceImageId) {
            indices.push(index);
          }
          return indices;
        },
        []
      );

      if (referencedIndices.length) {
        referencedIndices.forEach((referencedIndex) => {
          if (layer.imageIds?.[referencedIndex]) {
            labelmapImageIds.push(layer.imageIds[referencedIndex]);
          }
        });
        return;
      }

      if (currentIndex !== -1 && layer.imageIds?.[currentIndex]) {
        labelmapImageIds.push(layer.imageIds[currentIndex]);
        return;
      }

      layer.imageIds?.some((candidateImageId) => {
        const viewableImageId = (
          viewport as Types.IStackViewport
        ).isReferenceViewable(
          { referencedImageId: candidateImageId },
          { asOverlay: true }
        );

        if (viewableImageId) {
          labelmapImageIds.push(candidateImageId);
        }

        return !!viewableImageId;
      });
    });

    const resolvedImageIds = Array.from(new Set(labelmapImageIds));
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
      typeof (viewport as Types.IStackViewport).getCurrentImageId !== 'function'
    ) {
      return;
    }

    const currentImageId = (
      viewport as Types.IStackViewport
    ).getCurrentImageId();
    const currentImageIds = this.getCurrentLabelmapImageIdsForViewport(
      viewportId,
      segmentationId
    );
    if (!currentImageIds?.length) {
      return;
    }

    const segmentation = this.getSegmentation(segmentationId);
    const currentIndex = (viewport as Types.IStackViewport)
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
    const imageIds = enabledElement?.viewport.getImageIds?.() ?? [];
    const imageIdMap = getReferencedImageIdToCurrentImageIdMap(segmentation);

    return imageIds.flatMap((imageId) => imageIdMap.get(imageId) ?? []);
  }

  private updateLabelmapSegmentationReferences(
    segmentationId: string,
    viewport: Types.IStackViewport,
    labelmapImageIds: string[],
    updateCallback?: (
      viewport: Types.IStackViewport,
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

    const stackViewport = enabledElement.viewport as Types.IStackViewport;

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
