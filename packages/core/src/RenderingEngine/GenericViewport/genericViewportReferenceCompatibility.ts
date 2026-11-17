import { vec3 } from 'gl-matrix';
import type { mat3 } from 'gl-matrix';
import type {
  CPUIImageData,
  Point3,
  ReferenceCompatibleOptions,
  ViewReference,
} from '../../types';
import type { PlaneRestriction } from '../../types/IViewport';
import { MetadataModules } from '../../enums';
import * as metaData from '../../metaData';
import getSpacingInNormalDirection from '../../utilities/getSpacingInNormalDirection';
import imageIdToURI from '../../utilities/imageIdToURI';
import isEqual from '../../utilities/isEqual';

export type GenericViewportReferenceContext = {
  allowAnyImageReference?: boolean;
  cameraFocalPoint?: Point3;
  currentImageIdIndex?: number;
  dataId?: string;
  dataIds?: string[];
  dimensionGroupNumber?: number;
  frameOfReferenceUID?: string;
  imageIds?: string[];
  /**
   * Image URIs that name the data as a whole and not one of its slices: the
   * images of a whole slide, or a video without a frame number. A reference
   * to one of them shows on every slice.
   */
  imageURIs?: string[];
  numDimensionGroups?: number;
  viewPlaneNormal?: Point3;
  volumeId?: string;
  volumeIds?: string[];
};

/**
 * Standard GenericViewport compatibility predicate for view references.
 */
export function isGenericViewportReferenceViewable(
  viewRef: ViewReference,
  contexts: GenericViewportReferenceContext[],
  options: ReferenceCompatibleOptions = {}
): boolean {
  if (!viewRef) {
    return false;
  }

  return contexts.some((context) =>
    isReferenceViewableInContext(viewRef, context, options)
  );
}

export function getDimensionGroupReferenceContext(
  value: unknown
): Pick<
  GenericViewportReferenceContext,
  'dimensionGroupNumber' | 'numDimensionGroups'
> {
  const candidate = value as
    | {
        dimensionGroupNumber?: unknown;
        numDimensionGroups?: unknown;
      }
    | undefined;
  const dimensionGroupNumber = toPositiveInteger(
    candidate?.dimensionGroupNumber
  );
  const numDimensionGroups = toPositiveInteger(candidate?.numDimensionGroups);

  return {
    dimensionGroupNumber,
    numDimensionGroups,
  };
}

function isReferenceViewableInContext(
  viewRef: ViewReference,
  context: GenericViewportReferenceContext,
  options: ReferenceCompatibleOptions
): boolean {
  if (!isFrameOfReferenceCompatible(viewRef, context)) {
    return false;
  }

  if (!isDataIdCompatible(viewRef, context)) {
    return false;
  }

  if (!isVolumeIdCompatible(viewRef, context)) {
    return false;
  }

  if (!isPlaneCompatible(viewRef, context, options)) {
    return false;
  }

  if (!isReferencedImageCompatible(viewRef, context, options)) {
    return false;
  }

  if (!isDimensionGroupCompatible(viewRef, context, options)) {
    return false;
  }

  return isSliceIndexCompatible(viewRef, context, options);
}

function isFrameOfReferenceCompatible(
  viewRef: ViewReference,
  context: GenericViewportReferenceContext
): boolean {
  return (
    !viewRef.FrameOfReferenceUID ||
    viewRef.FrameOfReferenceUID === context.frameOfReferenceUID
  );
}

function isDataIdCompatible(
  viewRef: ViewReference,
  context: GenericViewportReferenceContext
): boolean {
  if (!viewRef.dataId) {
    return true;
  }

  return getContextDataIds(context).includes(viewRef.dataId);
}

function isVolumeIdCompatible(
  viewRef: ViewReference,
  context: GenericViewportReferenceContext
): boolean {
  if (!viewRef.volumeId) {
    return true;
  }

  return getContextVolumeIds(context).includes(viewRef.volumeId);
}

function isPlaneCompatible(
  viewRef: ViewReference,
  context: GenericViewportReferenceContext,
  options: ReferenceCompatibleOptions
): boolean {
  // The restriction and the top level orientation are two separate limits, and
  // the code applies both. A restriction that pins no orientation, which is
  // what one point gives, therefore does not make every view compatible.
  if (
    viewRef.planeRestriction &&
    !isPlaneRestrictionViewable(viewRef.planeRestriction, context, options)
  ) {
    return false;
  }

  if (!viewRef.viewPlaneNormal) {
    return true;
  }

  const { viewPlaneNormal } = context;

  if (!viewPlaneNormal) {
    return false;
  }

  return (
    isEqual(viewRef.viewPlaneNormal, viewPlaneNormal) ||
    isEqual(
      vec3.negate(vec3.create(), viewPlaneNormal as unknown as vec3) as Point3,
      viewRef.viewPlaneNormal
    ) ||
    Boolean(options.withOrientation)
  );
}

function isPlaneRestrictionViewable(
  planeRestriction: PlaneRestriction,
  context: GenericViewportReferenceContext,
  options: ReferenceCompatibleOptions
): boolean {
  if (planeRestriction.FrameOfReferenceUID !== context.frameOfReferenceUID) {
    return false;
  }

  if (options.withOrientation) {
    return true;
  }

  const { cameraFocalPoint, viewPlaneNormal } = context;

  if (!cameraFocalPoint || !viewPlaneNormal) {
    return false;
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

  if (options.withNavigation) {
    return true;
  }

  const pointVector = vec3.sub(
    vec3.create(),
    planeRestriction.point as unknown as vec3,
    cameraFocalPoint as unknown as vec3
  );

  return isEqual(0, vec3.dot(pointVector, viewPlaneNormal as unknown as vec3));
}

function isReferencedImageCompatible(
  viewRef: ViewReference,
  context: GenericViewportReferenceContext,
  options: ReferenceCompatibleOptions
): boolean {
  if (
    viewRef.planeRestriction &&
    viewRef.volumeId &&
    getContextVolumeIds(context).includes(viewRef.volumeId)
  ) {
    return true;
  }

  const referencedImageURIs = getReferencedImageURIs(viewRef);

  if (!referencedImageURIs.length) {
    return true;
  }

  if (
    context.imageURIs?.some((imageURI) =>
      referencedImageURIs.includes(imageURI)
    )
  ) {
    return true;
  }

  const imageURIEntries = context.imageIds?.length
    ? getImageIdsURIEntries(context.imageIds)
    : [];

  if (!imageURIEntries.length) {
    return false;
  }

  const currentImageIdIndex = context.currentImageIdIndex ?? 0;
  const currentImageURIEntry = imageURIEntries[currentImageIdIndex];

  if (imageURIEntryMatches(currentImageURIEntry, referencedImageURIs)) {
    return true;
  }

  if (
    options.asOverlay &&
    viewRef.referencedImageId &&
    context.imageIds?.[currentImageIdIndex] &&
    isImageOnOverlayGeometry(
      context.imageIds[currentImageIdIndex],
      viewRef.referencedImageId
    )
  ) {
    return true;
  }

  const foundSliceIndex = imageURIEntries.findIndex((imageURIEntry) =>
    imageURIEntryMatches(imageURIEntry, referencedImageURIs)
  );

  if (foundSliceIndex === -1) {
    return false;
  }

  if (context.allowAnyImageReference) {
    return true;
  }

  if (options.withNavigation) {
    return true;
  }

  const rangeEndSliceIndex = getReferencedImageRangeEndIndex(
    imageURIEntries,
    viewRef
  );

  if (rangeEndSliceIndex !== undefined) {
    const start = Math.min(foundSliceIndex, rangeEndSliceIndex);
    const end = Math.max(foundSliceIndex, rangeEndSliceIndex);

    return start <= currentImageIdIndex && currentImageIdIndex <= end;
  }

  return currentImageIdIndex === foundSliceIndex;
}

function isDimensionGroupCompatible(
  viewRef: ViewReference,
  context: GenericViewportReferenceContext,
  options: ReferenceCompatibleOptions
): boolean {
  const hasDimensionGroupRestriction =
    typeof viewRef.dimensionGroupNumber !== 'undefined';
  const dimensionGroupNumber = toPositiveInteger(viewRef.dimensionGroupNumber);

  if (!hasDimensionGroupRestriction) {
    return true;
  }

  if (!dimensionGroupNumber) {
    return false;
  }

  if (context.dimensionGroupNumber === dimensionGroupNumber) {
    return true;
  }

  const rangeEndDimensionGroupNumber = getRangeEndDimensionGroupNumber(
    viewRef,
    dimensionGroupNumber
  );

  if (
    rangeEndDimensionGroupNumber !== undefined &&
    typeof context.dimensionGroupNumber === 'number' &&
    dimensionGroupNumber <= context.dimensionGroupNumber &&
    context.dimensionGroupNumber <= rangeEndDimensionGroupNumber
  ) {
    return true;
  }

  if (!options.withNavigation) {
    return false;
  }

  return (
    typeof context.numDimensionGroups === 'number' &&
    dimensionGroupNumber <= context.numDimensionGroups
  );
}

function isSliceIndexCompatible(
  viewRef: ViewReference,
  context: GenericViewportReferenceContext,
  options: ReferenceCompatibleOptions
): boolean {
  const sliceIndex = viewRef.sliceIndex as
    | number
    | [number, number]
    | undefined;

  if (sliceIndex === undefined) {
    return true;
  }

  const { currentImageIdIndex } = context;

  if (Array.isArray(sliceIndex)) {
    if (typeof currentImageIdIndex === 'number') {
      return (
        sliceIndex[0] <= currentImageIdIndex &&
        currentImageIdIndex <= sliceIndex[1]
      );
    }

    return false;
  }

  if (!Number.isFinite(sliceIndex)) {
    return false;
  }

  if (currentImageIdIndex === sliceIndex) {
    return true;
  }

  const rangeEndSliceIndex = getRangeEndSliceIndex(viewRef);

  if (
    rangeEndSliceIndex !== undefined &&
    typeof currentImageIdIndex === 'number' &&
    sliceIndex <= currentImageIdIndex &&
    currentImageIdIndex <= rangeEndSliceIndex
  ) {
    return true;
  }

  if (!options.withNavigation) {
    return false;
  }

  return isIndexInImageRange(sliceIndex, context.imageIds);
}

/**
 * The 0-based last slice of a reference over a range of slices: the slice
 * index of its `multiSliceReference`, when it comes after the first slice.
 */
function getRangeEndSliceIndex(viewRef: ViewReference): number | undefined {
  const rangeEndSliceIndex = viewRef.multiSliceReference?.sliceIndex;

  if (
    typeof viewRef.sliceIndex !== 'number' ||
    typeof rangeEndSliceIndex !== 'number' ||
    rangeEndSliceIndex <= viewRef.sliceIndex
  ) {
    return;
  }

  return rangeEndSliceIndex;
}

/**
 * The last dimension group of a reference over a range: the dimension group
 * of its `multiSliceReference`, or else the first dimension group moved by
 * the number of slices of the range.
 */
function getRangeEndDimensionGroupNumber(
  viewRef: ViewReference,
  dimensionGroupNumber: number
): number | undefined {
  const rangeEndDimensionGroupNumber = toPositiveInteger(
    viewRef.multiSliceReference?.dimensionGroupNumber
  );

  if (rangeEndDimensionGroupNumber) {
    return rangeEndDimensionGroupNumber > dimensionGroupNumber
      ? rangeEndDimensionGroupNumber
      : undefined;
  }

  const rangeEndSliceIndex = getRangeEndSliceIndex(viewRef);

  if (rangeEndSliceIndex === undefined) {
    return;
  }

  return (
    dimensionGroupNumber + rangeEndSliceIndex - (viewRef.sliceIndex as number)
  );
}

function getReferencedImageURIs(viewRef: ViewReference): string[] {
  return uniqueStrings([
    viewRef.referencedImageURI,
    ...(viewRef.referencedImageId
      ? getImageIdCompatibleURIs(viewRef.referencedImageId)
      : []),
  ]);
}

function getReferencedImageRangeEndIndex(
  imageURIEntries: string[][],
  viewRef: ViewReference
): number | undefined {
  const rangeEndImageURI =
    viewRef.multiSliceReference &&
    getReferencedImageURIs(viewRef.multiSliceReference);

  if (!rangeEndImageURI?.length) {
    return;
  }

  const rangeEndSliceIndex = imageURIEntries.findIndex((imageURIEntry) =>
    imageURIEntryMatches(imageURIEntry, rangeEndImageURI)
  );

  return rangeEndSliceIndex === -1 ? undefined : rangeEndSliceIndex;
}

// Cache the compatible URIs for a given imageId. imageId -> URI is a pure,
// stable mapping, so memoizing it avoids re-parsing the same strings on every
// reference-compatibility check (these run once per labelmap image while
// resolving stack segmentation references).
const imageIdCompatibleURIsCache = new Map<string, string[]>();

// Cache the per-imageId URI entries for a given imageIds array, keyed on the
// array reference. Reference compatibility is evaluated once per labelmap image
// when resolving stack segmentation references, so without this the full
// imageId -> URI mapping is rebuilt O(labelmapImages x stackImages) times per
// scroll/brush stroke. The imageIds array is replaced (not mutated) when the
// dataset changes, so reference identity is a safe, self-invalidating key.
const imageIdsURIEntriesCache = new WeakMap<string[], string[][]>();

function getImageIdsURIEntries(imageIds: string[]): string[][] {
  let entries = imageIdsURIEntriesCache.get(imageIds);

  if (!entries) {
    entries = imageIds.map((imageId) => getImageIdCompatibleURIs(imageId));
    imageIdsURIEntriesCache.set(imageIds, entries);
  }

  return entries;
}

function getImageIdCompatibleURIs(imageId: string): string[] {
  let uris = imageIdCompatibleURIsCache.get(imageId);

  if (!uris) {
    uris = uniqueStrings([imageIdToURI(imageId), getLegacyImageIdURI(imageId)]);
    imageIdCompatibleURIsCache.set(imageId, uris);
  }

  return uris;
}

function getLegacyImageIdURI(imageId: string): string {
  const colonIndex = imageId.indexOf(':');

  return colonIndex === -1 ? imageId : imageId.substring(colonIndex + 1);
}

function imageURIEntryMatches(
  imageURIEntry: string[] | undefined,
  referencedImageURIs: string[]
): boolean {
  return Boolean(
    imageURIEntry?.some((imageURI) => referencedImageURIs.includes(imageURI))
  );
}

function getContextDataIds(context: GenericViewportReferenceContext): string[] {
  return uniqueStrings([context.dataId, ...(context.dataIds || [])]);
}

function getContextVolumeIds(
  context: GenericViewportReferenceContext
): string[] {
  return uniqueStrings([context.volumeId, ...(context.volumeIds || [])]);
}

function isIndexInImageRange(index: number, imageIds?: string[]): boolean {
  if (!imageIds?.length) {
    return true;
  }

  return index >= 0 && index < imageIds.length;
}

function uniqueStrings(values: Array<string | undefined>): string[] {
  return Array.from(
    new Set(
      values.filter((value): value is string => typeof value === 'string')
    )
  );
}

function toPositiveInteger(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    return;
  }

  return value;
}

/**
 * Whether an overlay image, as a labelmap image, lies on the image shown, as
 * the legacy stack viewport matches images for `asOverlay`: the same
 * orientation, position, rows and columns in the image plane module, or the
 * same rows and columns when either image has no orientation.
 */
export function isImageOnOverlayGeometry(
  currentImageId: string,
  overlayImageId: string
): boolean {
  const overlayPlane = metaData.get(
    MetadataModules.IMAGE_PLANE,
    overlayImageId
  );
  const currentPlane = metaData.get(
    MetadataModules.IMAGE_PLANE,
    currentImageId
  );

  if (!overlayPlane || !currentPlane) {
    return false;
  }

  const sameSize =
    overlayPlane.rows === currentPlane.rows &&
    overlayPlane.columns === currentPlane.columns;

  if (
    !overlayPlane.imageOrientationPatient ||
    !currentPlane.imageOrientationPatient
  ) {
    return sameSize;
  }

  return (
    isEqual(
      overlayPlane.imageOrientationPatient,
      currentPlane.imageOrientationPatient
    ) &&
    Boolean(
      overlayPlane.imagePositionPatient && currentPlane.imagePositionPatient
    ) &&
    isEqual(
      overlayPlane.imagePositionPatient,
      currentPlane.imagePositionPatient
    ) &&
    sameSize
  );
}

/**
 * Whether a point lies within half a slice spacing of the plane of an image,
 * as the legacy stack viewport checks `asNearbyProjection`: the spacing is
 * the spacing of the image data along its normal, the third column of its
 * direction.
 */
export function isPointNearImagePlane(
  point: Point3,
  imageData: Pick<CPUIImageData, 'spacing' | 'direction' | 'origin'>
): boolean {
  const { spacing, direction, origin } = imageData;
  const viewPlaneNormal = direction.slice(6, 9) as Point3;
  const sliceThickness = getSpacingInNormalDirection(
    { direction: direction as unknown as mat3, spacing },
    viewPlaneNormal
  );
  const distanceToPlane = vec3.dot(
    vec3.subtract(
      vec3.create(),
      point as unknown as vec3,
      origin as unknown as vec3
    ),
    viewPlaneNormal as unknown as vec3
  );

  return Math.abs(distanceToPlane) <= sliceThickness / 2;
}
