import { cache, metaData, type Types } from '@cornerstonejs/core';
import { SegmentationRepresentations } from '../../../enums';
import { getSegmentation } from '../getSegmentation';
import { getLabelmaps } from '../labelmapModel';

/**
 * The source (referenced) imageIds a labelmap layer applies to.
 *
 * Prefer an explicit `referencedImageIds` list. Otherwise derive the source
 * images from each labelmap image's `referencedImageId` (a derived labelmap
 * image points back at the source image it overlays). We must NOT fall back to
 * the layer's own `imageIds`: those are the labelmap image ids, which never
 * equal the viewport's source image ids, so the suitability check would wrongly
 * fail for any layer created without an explicit `referencedImageIds` list
 * (e.g. via `createAndCacheDerivedLabelmapImage`). Returns `[]` when the source
 * cannot be determined yet, so callers stay permissive.
 */
function getLayerReferencedImageIds(layer): string[] {
  if (layer.referencedImageIds?.length) {
    return layer.referencedImageIds;
  }

  const labelmapImageIds =
    layer.imageIds ??
    (layer.volumeId
      ? (cache.getVolume(layer.volumeId) as Types.IImageVolume)?.imageIds
      : undefined) ??
    [];

  return labelmapImageIds
    .map(
      (labelmapImageId) => cache.getImage(labelmapImageId)?.referencedImageId
    )
    .filter(Boolean) as string[];
}

/**
 * The FrameOfReferenceUIDs a labelmap layer belongs to, taken from the
 * labelmap volume's own metadata (derived volumes copy it from their source)
 * and/or the imagePlaneModule of the source images the layer was derived from.
 * Returns `[]` when none can be determined yet, so callers stay permissive.
 */
function getLayerFrameOfReferenceUIDs(layer): string[] {
  const frameOfReferenceUIDs = new Set<string>();

  if (layer.volumeId) {
    const volumeFrameOfReference = (
      cache.getVolume(layer.volumeId) as Types.IImageVolume
    )?.metadata?.FrameOfReferenceUID;
    if (volumeFrameOfReference) {
      frameOfReferenceUIDs.add(volumeFrameOfReference);
    }
  }

  for (const referencedImageId of getLayerReferencedImageIds(layer)) {
    const imageFrameOfReference = (
      metaData.get('imagePlaneModule', referencedImageId) as
        | Types.ImagePlaneModule
        | undefined
    )?.frameOfReferenceUID;
    if (imageFrameOfReference) {
      frameOfReferenceUIDs.add(imageFrameOfReference);
    }
  }

  return [...frameOfReferenceUIDs];
}

/**
 * Volume viewports resample labelmaps geometrically, so a labelmap derived
 * from a DIFFERENT series is still a legitimate destination as long as it
 * shares the viewport's frame of reference (e.g. a PT-derived labelmap painted
 * on CT viewports, or a SEG overlaid on a series it does not reference). Only
 * a frame-of-reference mismatch is a reliable "does not belong" signal here.
 *
 * `getFrameOfReferenceUID` is read defensively: before `setVolumes` it is
 * undefined, and a half-torn-down viewport may throw - both mean "unknown",
 * so stay permissive.
 */
function volumeViewportSharesFrameOfReference(
  viewport: Types.IViewport,
  layers
): boolean {
  let viewportFrameOfReference: string | undefined;
  try {
    viewportFrameOfReference = viewport.getFrameOfReferenceUID?.();
  } catch (error) {
    return true;
  }

  if (!viewportFrameOfReference) {
    return true;
  }

  const labelmapFrameOfReferenceUIDs = layers.flatMap((layer) =>
    getLayerFrameOfReferenceUIDs(layer)
  );

  if (!labelmapFrameOfReferenceUIDs.length) {
    return true;
  }

  return labelmapFrameOfReferenceUIDs.includes(viewportFrameOfReference);
}

/**
 * Stack viewports render a labelmap by mapping each displayed imageId to the
 * labelmap image derived from it, so a stack that displays none of the
 * labelmap's source images genuinely cannot mount it - rendering it there only
 * disturbs the viewport (blanking it in the shared rendering engine, or
 * corrupting its image-index overlay). Hence the strict imageId-intersection
 * test. `getImageIds` is wrapped so a not-yet-initialized viewport reads as
 * "ids unknown" and stays permissive.
 */
function stackViewportReferencesImages(
  viewport: Types.IViewport,
  layers
): boolean {
  const referencedImageIds = layers.flatMap((layer) =>
    getLayerReferencedImageIds(layer)
  );

  if (!referencedImageIds.length) {
    return true;
  }

  let viewportImageIds: string[];
  try {
    viewportImageIds =
      (viewport as { getImageIds?: () => string[] }).getImageIds?.() ?? [];
  } catch (error) {
    return true;
  }

  if (!viewportImageIds.length) {
    return true;
  }

  const referencedImageIdSet = new Set(referencedImageIds);
  return viewportImageIds.some((imageId) => referencedImageIdSet.has(imageId));
}

/**
 * The single place that decides whether a segmentation overlay
 * (representation) is compatible with a viewport, i.e. whether the viewport is
 * a suitable destination for it. Any future compatibility rule - new
 * representation types, geometry checks, orientation constraints - belongs
 * here, so every caller (representation add, actor sync, ...) picks it up.
 *
 * Current rules:
 * - Non-labelmap representations (contour, surface, or an omitted type, which
 *   the state manager also treats as non-labelmap) have no viewport
 *   constraints and are always compatible.
 * - Labelmap on a stack viewport: the stack must actually display one of the
 *   labelmap's source images (see `stackViewportReferencesImages`); a stack
 *   showing an unrelated series cannot mount the labelmap and would only be
 *   disturbed by it.
 * - Labelmap on a volume viewport (including fusion): volume viewports
 *   resample labelmaps by geometry, so any labelmap sharing the viewport's
 *   FrameOfReferenceUID is compatible - even one derived from a series the
 *   viewport does not display (data-overlay and cross-series painting
 *   workflows rely on this). Only a differing frame of reference suppresses.
 *
 * Returns `true` whenever compatibility cannot be determined (unknown
 * segmentation, no source images or frame of reference derivable yet, viewport
 * not fully set up) so callers never wrongly suppress a representation that may
 * legitimately belong.
 */
export function isSegmentationOverlayCompatible(
  viewport: Types.IViewport | undefined,
  segmentationId: string,
  representationType: SegmentationRepresentations | undefined
): boolean {
  if (representationType !== SegmentationRepresentations.Labelmap) {
    return true;
  }

  if (!viewport) {
    return true;
  }

  const segmentation = getSegmentation(segmentationId);

  if (!segmentation) {
    return true;
  }

  const layers = getLabelmaps(segmentation);

  // Only BaseVolumeViewport exposes getAllVolumeIds, so its presence
  // discriminates volume from stack (and other image-based) viewports.
  const isVolumeViewport =
    typeof (viewport as { getAllVolumeIds?: () => string[] })
      .getAllVolumeIds === 'function';

  return isVolumeViewport
    ? volumeViewportSharesFrameOfReference(viewport, layers)
    : stackViewportReferencesImages(viewport, layers);
}
