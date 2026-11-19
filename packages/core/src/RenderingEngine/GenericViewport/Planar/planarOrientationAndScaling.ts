import MetadataModules from '../../../enums/MetadataModules';
import * as metaData from '../../../metaData';
import type {
  OrientationVectors,
  Point3,
  PTScaling,
  Scaling,
} from '../../../types';
import type { PlanarOrientation } from './PlanarViewportTypes';

const ORIENTATION_VECTOR_EPSILON = 1e-6;
const ORIENTATION_DOT_EPSILON = 1e-3;

export function isPlanarOrientationVectors(
  orientation: PlanarOrientation | undefined
): orientation is OrientationVectors {
  return Boolean(
    orientation &&
      typeof orientation === 'object' &&
      'viewPlaneNormal' in orientation
  );
}

function normalizeOrientationVector(
  vector: Point3 | undefined,
  fieldName: string
): Point3 {
  const [x, y, z] = vector || [];
  const length = Math.hypot(x, y, z);

  if (
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    !Number.isFinite(z) ||
    length < ORIENTATION_VECTOR_EPSILON
  ) {
    throw new Error(
      `[PlanarViewport] Invalid orientation vector ${fieldName}. Expected a finite non-zero Point3.`
    );
  }

  return [x / length, y / length, z / length];
}

export function clonePlanarOrientation(
  orientation: PlanarOrientation | undefined
): PlanarOrientation | undefined {
  if (!isPlanarOrientationVectors(orientation)) {
    return orientation;
  }

  const clone: OrientationVectors = {
    viewPlaneNormal: normalizeOrientationVector(
      orientation.viewPlaneNormal,
      'viewPlaneNormal'
    ),
  };

  if (orientation.viewUp) {
    clone.viewUp = normalizeOrientationVector(orientation.viewUp, 'viewUp');

    const dot =
      clone.viewPlaneNormal[0] * clone.viewUp[0] +
      clone.viewPlaneNormal[1] * clone.viewUp[1] +
      clone.viewPlaneNormal[2] * clone.viewUp[2];

    if (Math.abs(dot) > ORIENTATION_DOT_EPSILON) {
      throw new Error(
        '[PlanarViewport] Invalid orientation vectors. viewPlaneNormal and viewUp must be orthogonal.'
      );
    }
  }

  return clone;
}

/**
 * The scaling of the image of an image id, as the legacy stack viewport kept
 * it: for a PT image with a scaling module, the ratios from SUV body weight
 * to SUV lean body mass and to SUV body surface area. Empty for any other
 * image.
 */
export function getPlanarImageScaling(imageId: string | undefined): Scaling {
  const scaling: Scaling = {};

  if (!imageId) {
    return scaling;
  }

  const modality = metaData.get(
    MetadataModules.GENERAL_SERIES,
    imageId
  )?.modality;
  const scalingFactor = metaData.get(MetadataModules.SCALING, imageId);

  if (modality !== 'PT' || !scalingFactor) {
    return scaling;
  }

  const { suvbw, suvlbm, suvbsa } = scalingFactor;
  const ptScaling = {} as PTScaling;

  if (suvlbm) {
    ptScaling.suvbwToSuvlbm = suvlbm / suvbw;
  }

  if (suvbsa) {
    ptScaling.suvbwToSuvbsa = suvbsa / suvbw;
  }

  scaling.PT = ptScaling;

  return scaling;
}
