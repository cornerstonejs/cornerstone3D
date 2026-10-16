import { Enums } from '@cornerstonejs/core';
import { utilities as metadataUtilities } from '@cornerstonejs/metadata';
import { vec3 } from 'gl-matrix';

const { isEqual, toFiniteNumber } = metadataUtilities;
const { MetadataModules } = Enums;

// Per-component tolerance (mm, or cosine) for the same position or orientation.
const GEOMETRY_TOLERANCE = 1e-3;
// The values that the image plane providers write when the instance has none.
const DEFAULT_POSITION = [0, 0, 0];
const DEFAULT_ORIENTATION = [1, 0, 0, 0, 1, 0];
const DEFAULT_PIXEL_SPACING = [1, 1];

/** `values` as `length` finite numbers, or undefined. */
function toFiniteVector(values, length: number): number[] | undefined {
  const numbers = toFiniteNumber(values as ArrayLike<number>);
  return Array.isArray(numbers) &&
    numbers.length === length &&
    numbers.every(Number.isFinite)
    ? numbers
    : undefined;
}

interface SourceFrame {
  position?: number[];
  orientation?: number[];
  sliceThickness?: number;
  pixelSpacing?: number[];
}

/**
 * The geometry of a source image: position and orientation from the
 * imagePlaneModule, or from the instance when the module has no value. With
 * `withPixelMeasures`, also the first positive Slice Thickness, and the Pixel
 * Spacing of the instance, or else of the plane module.
 *
 * The plane providers write a default position, orientation or Pixel Spacing
 * when the instance has none, and set `usingDefaultValues`. That flag does not
 * tell which value is a default. With the flag, a plane value equal to its
 * default is not used, so the instance value, or no value, applies. A missing
 * value then stays missing and is never a made-up value. For the orientation,
 * the calibrated provider also sets `isDefaultValueSetForRowCosine` and
 * `isDefaultValueSetForColumnCosine`; when present, these flags decide.
 *
 * An image without a FrameOfReferenceUID, in the plane module or the instance,
 * has no position and no orientation: a position without a Frame of Reference
 * has no meaning, and the providers write made-up values for such images, for
 * example `[0, 0, frameNumber]` for a multiframe.
 *
 * The LABELMAP export and the BINARY export use this function to give each
 * SEG frame the geometry of its own source image. The instance is read only
 * when the plane module is incomplete or when the pixel measures are
 * necessary.
 */
function getSourceFrame(
  image: { imageId?: string } | undefined,
  metadata,
  withPixelMeasures = false
): SourceFrame {
  const imageId = image?.imageId;
  const plane = metadata?.get?.(MetadataModules.IMAGE_PLANE, imageId) ?? {};
  const { rowCosines, columnCosines, usingDefaultValues } = plane;
  const notDefault = (value: number[] | undefined, defaultValue: number[]) =>
    usingDefaultValues && isEqual(value, defaultValue) ? undefined : value;
  const cosineFlags = [
    plane.isDefaultValueSetForRowCosine,
    plane.isDefaultValueSetForColumnCosine,
  ];
  const planeOrientation =
    toOrientation(plane.imageOrientationPatient) ??
    (rowCosines && columnCosines
      ? toOrientation([...rowCosines, ...columnCosines])
      : undefined);
  let position = notDefault(
    toFiniteVector(plane.imagePositionPatient, 3),
    DEFAULT_POSITION
  );
  let orientation = cosineFlags.some((flag) => flag !== undefined)
    ? cosineFlags.some(Boolean)
      ? undefined
      : planeOrientation
    : notDefault(planeOrientation, DEFAULT_ORIENTATION);
  if (
    position &&
    orientation &&
    plane.frameOfReferenceUID &&
    !withPixelMeasures
  ) {
    return { position, orientation };
  }

  const instance = metadata?.get?.(MetadataModules.IMAGE_DATA, imageId) ?? {};
  if (plane.frameOfReferenceUID || instance.FrameOfReferenceUID) {
    position ??= toFiniteVector(instance.ImagePositionPatient, 3);
    orientation ??= toOrientation(instance.ImageOrientationPatient);
  } else {
    position = orientation = undefined;
  }
  if (!withPixelMeasures) {
    return { position, orientation };
  }

  return {
    position,
    orientation,
    sliceThickness: [plane.sliceThickness, instance.SliceThickness]
      .map(Number)
      .find((thickness) => thickness > 0),
    pixelSpacing:
      toFiniteVector(instance.PixelSpacing, 2) ??
      notDefault(toFiniteVector(plane.pixelSpacing, 2), DEFAULT_PIXEL_SPACING),
  };
}

/** The unit normal of the plane with the given ImageOrientationPatient. */
const sliceNormal = (orientation: number[]) => {
  const normal = vec3.cross(
    [0, 0, 0],
    orientation.slice(0, 3) as vec3,
    orientation.slice(3, 6) as vec3
  );
  return vec3.normalize(normal, normal) as number[];
};

/**
 * `values` as an ImageOrientationPatient, or undefined when the values are
 * not 6 finite numbers or the cosines are collinear, so that no normal exists.
 */
function toOrientation(values): number[] | undefined {
  const orientation = toFiniteVector(values, 6);
  return orientation &&
    vec3.length(sliceNormal(orientation) as vec3) > GEOMETRY_TOLERANCE
    ? orientation
    : undefined;
}

export { GEOMETRY_TOLERANCE, getSourceFrame, sliceNormal, toFiniteVector };
export type { SourceFrame };
