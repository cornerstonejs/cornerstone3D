import { metaData, utilities as csUtils } from '@cornerstonejs/core';

const { sortImageIdsAndGetSpacing } = csUtils;

function approxEqual(a, b, tol = 1e-3) {
  return Math.abs(a - b) <= tol;
}

function getMedian(values) {
  if (!values?.length) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function projectOntoNormal(point, normal) {
  return point[0] * normal[0] + point[1] * normal[1] + point[2] * normal[2];
}

function hasFiniteValues(values, length) {
  return (
    Array.isArray(values) &&
    values.length >= length &&
    values.slice(0, length).every((value) => Number.isFinite(Number(value)))
  );
}

export default function validateAndSortVolumeIds(imageIds, options = {}) {
  const {
    maxSpacingVariationFraction = 0.1,
    minSpacingVariationAbsMm = 0.1,
  } = options;

  if (!imageIds?.length) {
    return { valid: false, sortedImageIds: [], reason: 'no instances' };
  }
  if (imageIds.length < 2) {
    return {
      valid: false,
      sortedImageIds: [...imageIds],
      reason: 'single-slice series',
    };
  }

  let sortedImageIds = [...imageIds];
  try {
    // Pass a copy: the sorter can reverse the array it is given in place.
    sortedImageIds = sortImageIdsAndGetSpacing([...imageIds]).sortedImageIds;
  } catch (err) {
    return {
      valid: false,
      sortedImageIds: [...imageIds],
      reason: `unable to sort by volumetric position: ${err?.message || err}`,
    };
  }

  const firstPlane = metaData.get('imagePlaneModule', sortedImageIds[0]);
  const firstFor = firstPlane?.frameOfReferenceUID;
  const firstIop = firstPlane?.imageOrientationPatient;
  if (
    !hasFiniteValues(firstIop, 6) ||
    !hasFiniteValues(firstPlane?.imagePositionPatient, 3) ||
    !firstFor
  ) {
    return {
      valid: false,
      sortedImageIds,
      reason: 'missing image-plane metadata (FOR/IOP/IPP)',
    };
  }

  const row = [firstIop[0], firstIop[1], firstIop[2]];
  const col = [firstIop[3], firstIop[4], firstIop[5]];
  const normal = [
    row[1] * col[2] - row[2] * col[1],
    row[2] * col[0] - row[0] * col[2],
    row[0] * col[1] - row[1] * col[0],
  ];
  const normalMag = Math.hypot(normal[0], normal[1], normal[2]);
  if (normalMag < 1e-6) {
    return { valid: false, sortedImageIds, reason: 'invalid orientation normal' };
  }
  normal[0] /= normalMag;
  normal[1] /= normalMag;
  normal[2] /= normalMag;

  const projectedPositions = [];
  for (const imageId of sortedImageIds) {
    const plane = metaData.get('imagePlaneModule', imageId);
    const forUid = plane?.frameOfReferenceUID;
    const iop = plane?.imageOrientationPatient;
    const ipp = plane?.imagePositionPatient;

    if (!forUid || forUid !== firstFor) {
      return {
        valid: false,
        sortedImageIds,
        reason: 'frame of reference changes between slices',
      };
    }
    if (!hasFiniteValues(iop, 6) || !hasFiniteValues(ipp, 3)) {
      return {
        valid: false,
        sortedImageIds,
        reason: 'missing per-slice orientation/position metadata',
      };
    }
    for (let i = 0; i < 6; i++) {
      if (!approxEqual(Number(iop[i]), Number(firstIop[i]), 1e-3)) {
        return {
          valid: false,
          sortedImageIds,
          reason: 'image orientation changes between slices',
        };
      }
    }
    projectedPositions.push(projectOntoNormal(ipp, normal));
  }

  const diffs = [];
  for (let i = 1; i < projectedPositions.length; i++) {
    const d = Math.abs(projectedPositions[i] - projectedPositions[i - 1]);
    // Any zero gap means a duplicate/co-located slice, even if other gaps are
    // valid (e.g. [0, 1, 1, 2]). Skipping zeros here would hide that.
    if (d <= 1e-6) {
      return {
        valid: false,
        sortedImageIds,
        reason: 'zero or duplicate slice spacing',
      };
    }
    diffs.push(d);
  }

  const medianSpacing = getMedian(diffs);
  const spacingTolerance = Math.max(
    minSpacingVariationAbsMm,
    medianSpacing * maxSpacingVariationFraction
  );
  const inconsistent = diffs.some(
    (d) => Math.abs(d - medianSpacing) > spacingTolerance
  );
  if (inconsistent) {
    return {
      valid: false,
      sortedImageIds,
      reason: `inconsistent slice spacing (median=${medianSpacing.toFixed(3)} mm)`,
    };
  }

  return { valid: true, sortedImageIds };
}
