import { vec3 } from 'gl-matrix';
import type {
  Point3,
  ReferenceCompatibleOptions,
  ViewReference,
} from '../../types';
import type { PlaneRestriction } from '../../types/IViewport';
import imageIdToURI from '../../utilities/imageIdToURI';
import isEqual from '../../utilities/isEqual';

export type ViewportNextReferenceContext = {
  allowAnyImageReference?: boolean;
  cameraFocalPoint?: Point3;
  currentImageIdIndex?: number;
  dataId?: string;
  dataIds?: string[];
  dimensionGroupNumber?: number;
  frameOfReferenceUID?: string;
  imageIds?: string[];
  imageURIs?: string[];
  numDimensionGroups?: number;
  viewPlaneNormal?: Point3;
  volumeId?: string;
  volumeIds?: string[];
};

/**
 * Standard ViewportNext compatibility predicate for view references.
 */
export function isViewportNextReferenceViewable(
  viewRef: ViewReference,
  contexts: ViewportNextReferenceContext[],
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
  ViewportNextReferenceContext,
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
  context: ViewportNextReferenceContext,
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
  context: ViewportNextReferenceContext
): boolean {
  return (
    !viewRef.FrameOfReferenceUID ||
    viewRef.FrameOfReferenceUID === context.frameOfReferenceUID
  );
}

function isDataIdCompatible(
  viewRef: ViewReference,
  context: ViewportNextReferenceContext
): boolean {
  if (!viewRef.dataId) {
    return true;
  }

  return getContextDataIds(context).includes(viewRef.dataId);
}

function isVolumeIdCompatible(
  viewRef: ViewReference,
  context: ViewportNextReferenceContext
): boolean {
  if (!viewRef.volumeId) {
    return true;
  }

  return getContextVolumeIds(context).includes(viewRef.volumeId);
}

function isPlaneCompatible(
  viewRef: ViewReference,
  context: ViewportNextReferenceContext,
  options: ReferenceCompatibleOptions
): boolean {
  if (viewRef.planeRestriction) {
    return isPlaneRestrictionViewable(
      viewRef.planeRestriction,
      context,
      options
    );
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
  context: ViewportNextReferenceContext,
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
  context: ViewportNextReferenceContext,
  options: ReferenceCompatibleOptions
): boolean {
  if (
    viewRef.planeRestriction &&
    viewRef.volumeId &&
    getContextVolumeIds(context).includes(viewRef.volumeId)
  ) {
    return true;
  }

  const referencedImageURI = getReferencedImageURI(viewRef);

  if (!referencedImageURI) {
    return true;
  }

  const imageURIs = getContextImageURIs(context);

  if (!imageURIs.length) {
    return false;
  }

  const currentImageIdIndex = context.currentImageIdIndex ?? 0;
  const currentImageURI = imageURIs[currentImageIdIndex];

  if (currentImageURI === referencedImageURI) {
    return true;
  }

  const foundSliceIndex = imageURIs.findIndex(
    (imageURI) => imageURI === referencedImageURI
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
    imageURIs,
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
  context: ViewportNextReferenceContext,
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
  context: ViewportNextReferenceContext,
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

  if (!options.withNavigation) {
    return false;
  }

  return isIndexInImageRange(sliceIndex, context.imageIds);
}

function getReferencedImageURI(viewRef: ViewReference): string | undefined {
  if (viewRef.referencedImageURI) {
    return viewRef.referencedImageURI;
  }

  if (viewRef.referencedImageId) {
    return imageIdToURI(viewRef.referencedImageId);
  }
}

function getReferencedImageRangeEndIndex(
  imageURIs: string[],
  viewRef: ViewReference
): number | undefined {
  const rangeEndImageURI =
    viewRef.multiSliceReference &&
    getReferencedImageURI(viewRef.multiSliceReference);

  if (!rangeEndImageURI) {
    return;
  }

  const rangeEndSliceIndex = imageURIs.findIndex(
    (imageURI) => imageURI === rangeEndImageURI
  );

  return rangeEndSliceIndex === -1 ? undefined : rangeEndSliceIndex;
}

function getContextImageURIs(context: ViewportNextReferenceContext): string[] {
  return uniqueStrings([
    ...(context.imageIds || []).map((imageId) => imageIdToURI(imageId)),
    ...(context.imageURIs || []),
  ]);
}

function getContextDataIds(context: ViewportNextReferenceContext): string[] {
  return uniqueStrings([context.dataId, ...(context.dataIds || [])]);
}

function getContextVolumeIds(context: ViewportNextReferenceContext): string[] {
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
