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
import { isEarlierImagesFrameOfReferenceUID } from '../../utilities/getImagesFrameOfReferenceUID';
import imageIdToURI from '../../utilities/imageIdToURI';
import isEqual from '../../utilities/isEqual';

export type ViewReferenceContext = {
  allowAnyImageReference?: boolean;
  cameraFocalPoint?: Point3;
  currentImageIdIndex?: number;
  displaySetId?: string;
  displaySetIds?: string[];
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
  /**
   * The number of slices of the view along its view plane normal, in which
   * the slice index of a reference counts. A view of a volume across its
   * images has more or fewer slices than images. Without it the slices are
   * the image ids.
   */
  numberOfSlices?: number;
  viewPlaneNormal?: Point3;
  volumeId?: string;
  volumeIds?: string[];
};

/**
 * Standard BaseViewport compatibility predicate for view references.
 */
export function isViewReferenceViewable(
  viewRef: ViewReference,
  contexts: ViewReferenceContext[],
  options: ReferenceCompatibleOptions = {}
): boolean {
  if (!viewRef) {
    return false;
  }

  return contexts.some((context) =>
    isReferenceViewableInContext(viewRef, context, options)
  );
}

/**
 * Whether a stack could show a view reference if it showed its images as a
 * volume, which the option `asVolume` asks. As on the legacy stack viewport,
 * a reference that names no image is viewable when it names a volume or a
 * frame of reference and is in the frame of reference of the stack. Its
 * plane and its slice index are not asked: a volume turns and moves to them.
 * A reference that names an image by its URI only is viewable so when the
 * stack has that image.
 */
export function isViewReferenceViewableAsVolume(
  viewRef: ViewReference,
  contexts: ViewReferenceContext[]
): boolean {
  if (
    !viewRef ||
    viewRef.referencedImageId ||
    !(viewRef.volumeId || viewRef.FrameOfReferenceUID)
  ) {
    return false;
  }

  return contexts.some(
    (context) =>
      isFrameOfReferenceCompatible(viewRef, context) &&
      (!viewRef.referencedImageURI || hasReferencedImage(viewRef, context)) &&
      (!viewRef.planeRestriction ||
        isPlaneRestrictionViewable(viewRef.planeRestriction, viewRef, context, {
          withOrientation: true,
        }))
  );
}

/**
 * The time point on display and the number of time points of a dynamic
 * volume or a video. A volume that says it is not dynamic, as a dynamic
 * volume of one time point does, has none, as on the 5.x volume viewport.
 */
export function getDimensionGroupReferenceContext(
  value: unknown
): Pick<ViewReferenceContext, 'dimensionGroupNumber' | 'numDimensionGroups'> {
  const candidate = value as
    | {
        dimensionGroupNumber?: unknown;
        numDimensionGroups?: unknown;
        isDynamicVolume?: () => boolean;
      }
    | undefined;
  if (candidate?.isDynamicVolume?.() === false) {
    return {
      dimensionGroupNumber: undefined,
      numDimensionGroups: undefined,
    };
  }
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
  context: ViewReferenceContext,
  options: ReferenceCompatibleOptions
): boolean {
  if (!isFrameOfReferenceCompatible(viewRef, context)) {
    return false;
  }

  if (
    !isDisplaySetIdCompatible(viewRef, context) ||
    !isVolumeIdCompatible(viewRef, context)
  ) {
    return isOtherDataReferenceViewable(viewRef, context, options);
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

  return (
    !isSliceIndexOfContext(viewRef, context) ||
    isSliceIndexCompatible(viewRef, context, options)
  );
}

/**
 * Whether the slice index of a reference counts in the slices of a context.
 * It does not across modes, where the reference names a volume and the
 * context shows none, or the other way round, as a stack and a volume of the
 * same display set: the slice index of a stack counts in its image ids, that
 * of a volume in the slices of its view, sorted by position. Such a reference
 * is checked by the image that it names and by its plane restriction. A
 * reference with neither keeps its slice index, the only place that it names.
 */
function isSliceIndexOfContext(
  viewRef: ViewReference,
  context: ViewReferenceContext
): boolean {
  return (
    Boolean(viewRef.volumeId) === Boolean(context.volumeId) ||
    (!getReferencedImageURIs(viewRef).length && !viewRef.planeRestriction)
  );
}

/**
 * Whether a reference of another display set or of another volume shows in a
 * context, as a stack and a volume of one series. The legacy stack and volume
 * viewports, which had no display set ids, took such a reference by the image
 * that it names, which the context must have, and the volume viewport took a
 * reference that names no image by its plane. The data of the reference is
 * not read, so its display set need not be registered any more, nor its
 * volume be in the cache. The plane of the reference must be one that the
 * context shows, and its slice index counts in the other data and is not
 * asked.
 */
function isOtherDataReferenceViewable(
  viewRef: ViewReference,
  context: ViewReferenceContext,
  options: ReferenceCompatibleOptions
): boolean {
  const isShown = getReferencedImageURIs(viewRef).length
    ? hasReferencedImage(viewRef, context)
    : isPlaneOfVolumeContext(viewRef, context, options);

  if (!isShown) {
    return false;
  }

  const {
    displaySetId: _displaySetId,
    volumeId: _volumeId,
    sliceIndex: _sliceIndex,
    ...reference
  } = viewRef;

  return (
    isPlaneCompatible(reference, context, options) &&
    isReferencedImageCompatible(reference, context, options) &&
    isDimensionGroupCompatible(reference, context, options)
  );
}

/**
 * Whether a reference that names no image names a plane of a context that
 * shows a volume: it has a view plane normal or a plane restriction, and,
 * without orientation and navigation, its point (that of its plane
 * restriction, else its focal point) lies on the slice on display. A stack
 * shows only the planes of its images, so it takes such a reference only as a
 * volume (`asVolume`).
 */
function isPlaneOfVolumeContext(
  viewRef: ViewReference,
  context: ViewReferenceContext,
  options: ReferenceCompatibleOptions
): boolean {
  if (
    !context.volumeId ||
    (!viewRef.viewPlaneNormal && !viewRef.planeRestriction)
  ) {
    return false;
  }

  const point = viewRef.planeRestriction?.point ?? viewRef.cameraFocalPoint;

  if (!point || options.withOrientation || options.withNavigation) {
    return true;
  }

  const { cameraFocalPoint, viewPlaneNormal } = context;

  return Boolean(
    cameraFocalPoint &&
      viewPlaneNormal &&
      isEqual(
        0,
        vec3.dot(
          vec3.sub(
            vec3.create(),
            point as unknown as vec3,
            cameraFocalPoint as unknown as vec3
          ),
          viewPlaneNormal as unknown as vec3
        )
      )
  );
}

/**
 * Whether the image that a reference names is among the image ids of a
 * context, or among the image URIs of its data as a whole.
 */
function hasReferencedImage(
  viewRef: ViewReference,
  context: ViewReferenceContext
): boolean {
  const referencedImageURIs = getReferencedImageURIs(viewRef);

  if (!referencedImageURIs.length) {
    return false;
  }

  if (
    context.imageURIs?.some((imageURI) =>
      referencedImageURIs.includes(imageURI)
    )
  ) {
    return true;
  }

  return getImageIndexOfURIs(context, referencedImageURIs) !== -1;
}

/**
 * Whether a reference is in the frame of reference of a context: it names
 * none, or one that `isFrameOfReferenceUIDOfContext` takes.
 */
function isFrameOfReferenceCompatible(
  viewRef: ViewReference,
  context: ViewReferenceContext
): boolean {
  return (
    !viewRef.FrameOfReferenceUID ||
    isFrameOfReferenceUIDOfContext(
      viewRef.FrameOfReferenceUID,
      viewRef,
      context
    )
  );
}

/**
 * Whether a frame of reference that a reference names, at its top or in its
 * plane restriction, is that of a context: the same, or the name made up for
 * the images of the context before that name took a SHA-256 digest, when the
 * reference names one of those images (`isEarlierImagesFrameOfReferenceUID`),
 * as a reference saved then.
 */
function isFrameOfReferenceUIDOfContext(
  frameOfReferenceUID: string | undefined,
  viewRef: ViewReference,
  context: ViewReferenceContext
): boolean {
  return (
    frameOfReferenceUID === context.frameOfReferenceUID ||
    (isEarlierImagesFrameOfReferenceUID(
      frameOfReferenceUID,
      context.imageIds
    ) &&
      getImageIndexOfURIs(context, getReferencedImageURIs(viewRef)) !== -1)
  );
}

/**
 * Whether a reference names the data of a context: its display set, or its
 * volume under another display set id. Two display sets of one volume show
 * the same voxels, so the plane and the slice index of the reference count in
 * both, as on the legacy volume viewport, which had no display set id.
 */
function isDisplaySetIdCompatible(
  viewRef: ViewReference,
  context: ViewReferenceContext
): boolean {
  if (!viewRef.displaySetId) {
    return true;
  }

  return (
    getContextDisplaySetIds(context).includes(viewRef.displaySetId) ||
    Boolean(
      viewRef.volumeId &&
        getContextVolumeIds(context).includes(viewRef.volumeId)
    )
  );
}

function isVolumeIdCompatible(
  viewRef: ViewReference,
  context: ViewReferenceContext
): boolean {
  if (!viewRef.volumeId) {
    return true;
  }

  return getContextVolumeIds(context).includes(viewRef.volumeId);
}

function isPlaneCompatible(
  viewRef: ViewReference,
  context: ViewReferenceContext,
  options: ReferenceCompatibleOptions
): boolean {
  // The restriction and the top level orientation are two separate limits, and
  // the code applies both. A restriction that pins no orientation, which is
  // what one point gives, therefore does not make every view compatible.
  if (
    viewRef.planeRestriction &&
    !isPlaneRestrictionViewable(
      viewRef.planeRestriction,
      viewRef,
      context,
      options
    )
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
    isAlongViewPlaneNormal(viewRef.viewPlaneNormal, viewPlaneNormal) ||
    Boolean(options.withOrientation)
  );
}

/**
 * Whether a normal is the view plane normal or its opposite, so that a
 * reference with that normal lies in the planes of the view.
 */
function isAlongViewPlaneNormal(
  normal: Point3,
  viewPlaneNormal: Point3
): boolean {
  return (
    isEqual(normal, viewPlaneNormal) ||
    isEqual(
      vec3.negate(vec3.create(), viewPlaneNormal as unknown as vec3) as Point3,
      normal
    )
  );
}

/**
 * Whether the plane restriction of a reference is viewable in a context: in
 * its frame of reference (`isFrameOfReferenceUIDOfContext`), then along the
 * view and, without `withNavigation`, through its focal point.
 */
function isPlaneRestrictionViewable(
  planeRestriction: PlaneRestriction,
  viewRef: ViewReference,
  context: ViewReferenceContext,
  options: ReferenceCompatibleOptions
): boolean {
  if (
    !isFrameOfReferenceUIDOfContext(
      planeRestriction.FrameOfReferenceUID,
      viewRef,
      context
    )
  ) {
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
  context: ViewReferenceContext,
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

  const isAnyImageViewable = Boolean(
    context.allowAnyImageReference || options.withNavigation
  );
  const rangeEndImageURIs = viewRef.multiSliceReference
    ? getReferencedImageURIs(viewRef.multiSliceReference)
    : [];

  if (!isAnyImageViewable && !rangeEndImageURIs.length) {
    return false;
  }

  const foundSliceIndex = getImageIndexOfURIs(context, referencedImageURIs);

  if (foundSliceIndex === -1) {
    return false;
  }

  if (isAnyImageViewable) {
    return true;
  }

  const rangeEndSliceIndex = getImageIndexOfURIs(context, rangeEndImageURIs);

  if (rangeEndSliceIndex === -1) {
    return false;
  }

  const start = Math.min(foundSliceIndex, rangeEndSliceIndex);
  const end = Math.max(foundSliceIndex, rangeEndSliceIndex);

  return start <= currentImageIdIndex && currentImageIdIndex <= end;
}

/**
 * Whether the time point (dimension group) of a reference is the one on
 * display, or one that navigation reaches. A context without a time point,
 * as a static volume or a stack, takes the reference as if it had none, as
 * the legacy viewports of 5.x did: the volume viewport checked the time
 * point only on a dynamic volume.
 */
function isDimensionGroupCompatible(
  viewRef: ViewReference,
  context: ViewReferenceContext,
  options: ReferenceCompatibleOptions
): boolean {
  const hasDimensionGroupRestriction =
    typeof viewRef.dimensionGroupNumber !== 'undefined';
  const dimensionGroupNumber = toPositiveInteger(viewRef.dimensionGroupNumber);

  if (
    !hasDimensionGroupRestriction ||
    typeof context.dimensionGroupNumber !== 'number'
  ) {
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

/**
 * Whether the slice index of a reference is the slice of the view, or one
 * that navigation reaches. The slice index of a reference in another plane
 * counts in the slices of that plane: with orientation and navigation the
 * view turns to that plane and goes to that slice, so the index is not
 * checked against the slices of the view, as on the legacy volume viewport.
 */
function isSliceIndexCompatible(
  viewRef: ViewReference,
  context: ViewReferenceContext,
  options: ReferenceCompatibleOptions
): boolean {
  const sliceIndex = viewRef.sliceIndex as
    | number
    | [number, number]
    | undefined;

  if (sliceIndex === undefined) {
    return true;
  }

  if (
    options.withOrientation &&
    options.withNavigation &&
    viewRef.viewPlaneNormal &&
    context.viewPlaneNormal &&
    !isAlongViewPlaneNormal(viewRef.viewPlaneNormal, context.viewPlaneNormal)
  ) {
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

  if (typeof context.numberOfSlices === 'number') {
    return sliceIndex >= 0 && sliceIndex < context.numberOfSlices;
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

/**
 * The index of the image URIs of a context: each URI to the first slice
 * whose image has it. It is made on the first lookup of a context and kept
 * with the context object. The viewports make their contexts anew for each
 * check (`getReferenceViewableCheck`), so an index lives as long as the facts
 * of the view that it was made from, and a check of the next view makes its
 * own.
 */
const contextImageURIIndexes = new WeakMap<
  ViewReferenceContext,
  Map<string, number>
>();

function getContextImageURIIndex(
  context: ViewReferenceContext
): Map<string, number> {
  let index = contextImageURIIndexes.get(context);

  if (!index) {
    index = new Map();

    const imageURIEntries = context.imageIds?.length
      ? getImageIdsURIEntries(context.imageIds)
      : [];

    imageURIEntries.forEach((imageURIEntry, sliceIndex) => {
      imageURIEntry.forEach((imageURI) => {
        if (!index.has(imageURI)) {
          index.set(imageURI, sliceIndex);
        }
      });
    });
    contextImageURIIndexes.set(context, index);
  }

  return index;
}

/**
 * The first slice of a context whose image has one of the image URIs, or -1
 * when none has: a lookup in the index of the context, at the cost of a
 * comparison for each URI and not of a pass over the images.
 */
function getImageIndexOfURIs(
  context: ViewReferenceContext,
  imageURIs: string[]
): number {
  if (!imageURIs.length) {
    return -1;
  }

  const index = getContextImageURIIndex(context);
  let firstSliceIndex = -1;

  imageURIs.forEach((imageURI) => {
    const sliceIndex = index.get(imageURI);

    if (
      sliceIndex !== undefined &&
      (firstSliceIndex === -1 || sliceIndex < firstSliceIndex)
    ) {
      firstSliceIndex = sliceIndex;
    }
  });

  return firstSliceIndex;
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

function getContextDisplaySetIds(context: ViewReferenceContext): string[] {
  return uniqueStrings([
    context.displaySetId,
    ...(context.displaySetIds || []),
  ]);
}

function getContextVolumeIds(context: ViewReferenceContext): string[] {
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
