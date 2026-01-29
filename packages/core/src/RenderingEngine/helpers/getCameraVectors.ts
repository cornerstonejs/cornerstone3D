import * as metaData from '../../metaData';
import * as CONSTANTS from '../../constants';
import * as Enums from '../../enums';
import type * as Types from '../../types';
import type OrientationVectors from '../../types/OrientationVectors';

import { vec3 } from 'gl-matrix';

const { MPR_CAMERA_VALUES } = CONSTANTS;
const { OrientationAxis } = Enums;

export interface CameraPositionConfig {
  orientation?: Enums.OrientationAxis;
  useViewportNormal?: boolean;
}

/**
 * Calculate camera position values based on DICOM image orientation vectors.
 *
 * This function transforms rotated DICOM coordinate system vectors into the standard
 * orthogonal MPR camera coordinate system. It uses a best-fit algorithm to match
 * the input vectors with the reference MPR camera values, automatically handling
 * vector inversion when necessary.
 *
 * Algorithm:
 * 1. Normalize all input vectors to ensure consistent calculations
 * 2. Get reference camera values based on the specified orientation
 * 3. For each reference vector (viewRight, viewUp, viewPlaneNormal):
 *    - Calculate dot products with all available input vectors
 *    - Find the input vector with highest absolute dot product (best alignment)
 *    - Remove the matched input vector from further competition
 *    - Invert the vector if the dot product is negative
 * 4. Return the mapped camera coordinate system
 *
 * Note: The algorithm handles 45-degree rotations by ensuring each input vector
 * is only assigned once, preventing multiple reference vectors from competing
 * for the same input vector when dot products are similar.
 *
 * @param rowCosineVec - Row direction cosine vector from DICOM ImageOrientationPatient.
 *                       This represents the direction of the first row of pixels in the image
 *                       relative to the patient coordinate system.
 * @param colCosineVec - Column direction cosine vector from DICOM ImageOrientationPatient.
 *                       This represents the direction of the first column of pixels in the image
 *                       relative to the patient coordinate system.
 * @param scanAxisNormal - Normal vector perpendicular to the image plane.
 *                         Typically computed as the cross product of rowCosineVec and colCosineVec.
 * @param orientation - Target orientation axis (axial, sagittal, or coronal) that determines
 *                      which reference MPR camera values to use for mapping.
 *
 * @returns Object containing the mapped camera coordinate system:
 *          - viewPlaneNormal: Vector perpendicular to the viewing plane
 *          - viewUp: Vector pointing "up" in the camera coordinate system
 *          - viewRight: Vector pointing "right" in the camera coordinate system
 *
 * @example
 * ```typescript
 * const rowCosine = vec3.fromValues(1, 0, 0);
 * const colCosine = vec3.fromValues(0, 1, 0);
 * const scanNormal = vec3.fromValues(0, 0, 1);
 *
 * const cameraValues = calculateCameraPosition(
 *   rowCosine,
 *   colCosine,
 *   scanNormal,
 *   OrientationAxis.AXIAL
 * );
 * ```
 */
export function calculateCameraPosition(
  rowCosineVec: vec3,
  colCosineVec: vec3,
  scanAxisNormal: vec3,
  orientation: Enums.OrientationAxis
) {
  // Get reference MPR camera values based on orientation
  let referenceCameraValues;

  switch (orientation) {
    case OrientationAxis.AXIAL:
    case OrientationAxis.AXIAL_REFORMAT:
      referenceCameraValues = MPR_CAMERA_VALUES.axial;
      break;
    case OrientationAxis.SAGITTAL:
    case OrientationAxis.SAGITTAL_REFORMAT:
      referenceCameraValues = MPR_CAMERA_VALUES.sagittal;
      break;
    case OrientationAxis.CORONAL:
    case OrientationAxis.CORONAL_REFORMAT:
      referenceCameraValues = MPR_CAMERA_VALUES.coronal;
      break;
    default:
      // Default to axial if orientation is not recognized
      referenceCameraValues = MPR_CAMERA_VALUES.axial;
      break;
  }

  // Normalize input vectors
  const normalizedRowCosine = vec3.normalize(vec3.create(), rowCosineVec);
  const normalizedColCosine = vec3.normalize(vec3.create(), colCosineVec);
  const normalizedScanAxis = vec3.normalize(vec3.create(), scanAxisNormal);

  // Create array of input vectors for comparison
  const inputVectors = [
    normalizedRowCosine,
    normalizedColCosine,
    normalizedScanAxis,
  ];

  // Create array of reference vectors
  const referenceVectors = [
    vec3.fromValues(
      referenceCameraValues.viewRight[0],
      referenceCameraValues.viewRight[1],
      referenceCameraValues.viewRight[2]
    ),
    vec3.fromValues(
      referenceCameraValues.viewUp[0],
      referenceCameraValues.viewUp[1],
      referenceCameraValues.viewUp[2]
    ),
    vec3.fromValues(
      referenceCameraValues.viewPlaneNormal[0],
      referenceCameraValues.viewPlaneNormal[1],
      referenceCameraValues.viewPlaneNormal[2]
    ),
  ];

  // Track which input vectors have been used to avoid double assignment
  const usedInputIndices = new Set<number>();

  // Find best match for each reference vector, excluding already used input vectors
  const findBestMatch = (refVector: vec3) => {
    let bestMatch = 0;
    let bestDot = -2; // Start with value less than minimum possible dot product
    let shouldInvert = false;

    inputVectors.forEach((inputVec, index) => {
      // Skip if this input vector has already been assigned
      if (usedInputIndices.has(index)) {
        return;
      }

      const dot = vec3.dot(refVector, inputVec);
      const absDot = Math.abs(dot);

      if (absDot > bestDot) {
        bestDot = absDot;
        bestMatch = index;
        shouldInvert = dot < 0;
      }
    });

    // Mark this input vector as used
    usedInputIndices.add(bestMatch);

    const matchedVector = vec3.clone(inputVectors[bestMatch]);
    if (shouldInvert) {
      vec3.negate(matchedVector, matchedVector);
    }

    return matchedVector;
  };

  // Map reference vectors to input vectors in order of priority
  // This ensures each input vector is only used once, even for 45-degree rotations
  const viewRight = findBestMatch(referenceVectors[0]);
  const viewUp = findBestMatch(referenceVectors[1]);
  const viewPlaneNormal = findBestMatch(referenceVectors[2]);

  return {
    viewPlaneNormal: [
      viewPlaneNormal[0],
      viewPlaneNormal[1],
      viewPlaneNormal[2],
    ] as [number, number, number],
    viewUp: [viewUp[0], viewUp[1], viewUp[2]] as [number, number, number],
    viewRight: [viewRight[0], viewRight[1], viewRight[2]] as [
      number,
      number,
      number,
    ],
  };
}

/**
 * Calculate camera position values from viewport metadata.
 *
 * This is a convenience function that extracts DICOM image orientation data
 * from a viewport and automatically calculates the appropriate camera position
 * values. It handles the complete workflow from DICOM metadata extraction
 * to camera coordinate system calculation.
 *
 * Workflow:
 * 1. Extract current image ID from viewport
 * 2. Get ImageOrientationPatient from DICOM metadata
 * 3. Parse row and column cosine vectors from ImageOrientationPatient
 * 4. Calculate scan axis normal via cross product
 * 5. Auto-detect orientation if not provided
 * 6. Calculate and return camera position values
 *
 * @param viewport - Cornerstone3D volume viewport instance containing the image data.
 *                   Must have a valid current image ID with associated DICOM metadata.
 * @param config - Configuration object with orientation and normal source options.
 *                 - orientation: Optional target orientation axis. If not provided, the function
 *                   will automatically determine the best orientation based on the scan axis normal vector.
 *                 - useViewportNormal: If true, uses viewport.getCamera().viewPlaneNormal instead of
 *                   calculating from DICOM image orientation data.
 *
 * @returns Object containing the mapped camera coordinate system:
 *          - viewPlaneNormal: Vector perpendicular to the viewing plane
 *          - viewUp: Vector pointing "up" in the camera coordinate system
 *          - viewRight: Vector pointing "right" in the camera coordinate system
 *
 * @throws Will throw an error if the viewport doesn't have a current image ID
 *         or if the DICOM metadata is missing ImageOrientationPatient information.
 *
 * @example
 * ```typescript
 * // Auto-detect orientation
 * const cameraValues = getCameraVectors(viewport);
 *
 * // Force specific orientation
 * const axialCameraValues = getCameraVectors(viewport, { orientation: OrientationAxis.AXIAL });
 *
 * // Use viewport camera normal instead of image normal
 * const viewportCameraValues = getCameraVectors(viewport, { useViewportNormal: true });
 * ```
 */
export function getCameraVectors(
  viewport: Types.IBaseVolumeViewport,
  config?: CameraPositionConfig
) {
  if (!viewport.getActors()?.length) {
    return;
  }

  if (viewport.type !== Enums.ViewportType.ORTHOGRAPHIC) {
    console.warn('Viewport should be a volume viewport');
  }
  let imageId = viewport.getCurrentImageId();
  if (!imageId) {
    imageId = viewport.getImageIds()?.[0];
  }
  if (!imageId) {
    return;
  }
  const { imageOrientationPatient } = metaData.get('imagePlaneModule', imageId);
  const rowCosineVec = vec3.fromValues(
    imageOrientationPatient[0],
    imageOrientationPatient[1],
    imageOrientationPatient[2]
  );
  const colCosineVec = vec3.fromValues(
    imageOrientationPatient[3],
    imageOrientationPatient[4],
    imageOrientationPatient[5]
  );
  const scanAxisNormal = vec3.cross(vec3.create(), rowCosineVec, colCosineVec);
  let { orientation } = config || {};
  const { useViewportNormal } = config || {};
  let normalPlaneForOrientation = scanAxisNormal;
  if (useViewportNormal) {
    normalPlaneForOrientation = viewport.getCamera().viewPlaneNormal;
  }

  if (!orientation) {
    orientation = getOrientationFromScanAxisNormal(normalPlaneForOrientation);
  }

  // Use the new calculateCameraPosition function
  return calculateCameraPosition(
    rowCosineVec,
    colCosineVec,
    scanAxisNormal,
    orientation
  );
}

/**
 * Determine the orientation axis based on the scan axis normal vector.
 *
 * This function automatically identifies whether a scan axis normal vector
 * corresponds to axial, sagittal, or coronal orientation by comparing it
 * with the reference MPR camera view plane normals. It uses dot product
 * calculations to find the best alignment.
 *
 * The function is particularly useful when working with DICOM images that
 * don't have explicit orientation information or when you need to validate
 * the orientation of rotated image data.
 *
 * Algorithm:
 * 1. Normalize the input scan axis normal vector
 * 2. Get reference view plane normals for all three standard orientations
 * 3. Calculate absolute dot products between input and reference vectors
 * 4. Return the orientation with the highest dot product (best alignment)
 *
 * Reference orientations and their view plane normals:
 * - Axial: [0, 0, -1] (looking down from head to feet)
 * - Sagittal: [1, 0, 0] (looking from right to left side)
 * - Coronal: [0, -1, 0] (looking from front to back)
 *
 * @param scanAxisNormal - Normal vector perpendicular to the image plane.
 *                         This vector should represent the direction perpendicular
 *                         to the imaging plane in patient coordinate system.
 *
 * @returns The orientation axis (AXIAL, SAGITTAL, or CORONAL) that best
 *          matches the provided scan axis normal vector.
 *
 * @example
 * ```typescript
 * // For a typical axial scan (normal pointing in Z direction)
 * const axialNormal = vec3.fromValues(0, 0, 1);
 * const orientation = getOrientationFromScanAxisNormal(axialNormal);
 * // Returns: OrientationAxis.AXIAL
 *
 * // For a sagittal scan (normal pointing in X direction)
 * const sagittalNormal = vec3.fromValues(-1, 0, 0);
 * const orientation = getOrientationFromScanAxisNormal(sagittalNormal);
 * // Returns: OrientationAxis.SAGITTAL
 * ```
 */
export function getOrientationFromScanAxisNormal(
  scanAxisNormal: vec3
): Enums.OrientationAxis {
  // Normalize the input vector
  const normalizedScanAxis = vec3.normalize(vec3.create(), scanAxisNormal);

  // Get reference view plane normals for each orientation
  const axialNormal = vec3.fromValues(
    MPR_CAMERA_VALUES.axial.viewPlaneNormal[0],
    MPR_CAMERA_VALUES.axial.viewPlaneNormal[1],
    MPR_CAMERA_VALUES.axial.viewPlaneNormal[2]
  );
  const sagittalNormal = vec3.fromValues(
    MPR_CAMERA_VALUES.sagittal.viewPlaneNormal[0],
    MPR_CAMERA_VALUES.sagittal.viewPlaneNormal[1],
    MPR_CAMERA_VALUES.sagittal.viewPlaneNormal[2]
  );
  const coronalNormal = vec3.fromValues(
    MPR_CAMERA_VALUES.coronal.viewPlaneNormal[0],
    MPR_CAMERA_VALUES.coronal.viewPlaneNormal[1],
    MPR_CAMERA_VALUES.coronal.viewPlaneNormal[2]
  );

  // Calculate dot products to find best match
  const axialDot = Math.abs(vec3.dot(normalizedScanAxis, axialNormal));
  const sagittalDot = Math.abs(vec3.dot(normalizedScanAxis, sagittalNormal));
  const coronalDot = Math.abs(vec3.dot(normalizedScanAxis, coronalNormal));

  // Find the orientation with the highest dot product (best alignment)
  if (axialDot >= sagittalDot && axialDot >= coronalDot) {
    return OrientationAxis.AXIAL;
  } else if (sagittalDot >= coronalDot) {
    return OrientationAxis.SAGITTAL;
  } else {
    return OrientationAxis.CORONAL;
  }
}

/**
 * Calculate the best reformat orientation based on acquisition plane vectors.
 * This function finds the best alignment with standard views (axial, sagittal, coronal)
 * by matching acquisition plane vectors with standard MPR camera values.
 *
 * Algorithm:
 * 1. Extract 6 possible vectors from acquisition: row, column, scanAxisNormal, and their negatives
 * 2. For each standard view (axial, sagittal, coronal), find the best orthogonal pair
 *    (viewPlaneNormal, viewUp) from the 6 vectors that maximizes dot product alignment
 * 3. Choose the reformat view with the best overall alignment
 *
 * @param imageOrientationPatient - Array of 6 numbers representing the image orientation patient values.
 *                                  [rowX, rowY, rowZ, colX, colY, colZ]
 * @returns Object containing the best-matched viewPlaneNormal and viewUp vectors, or null if no valid match
 */
export function getAcquisitionPlaneReformatOrientation(
  imageOrientationPatient: number[]
): OrientationVectors | null {
  if (!imageOrientationPatient || imageOrientationPatient.length !== 6) {
    return null;
  }

  // Extract row and column direction cosines
  const rowVec = vec3.fromValues(
    imageOrientationPatient[0],
    imageOrientationPatient[1],
    imageOrientationPatient[2]
  );
  const colVec = vec3.fromValues(
    imageOrientationPatient[3],
    imageOrientationPatient[4],
    imageOrientationPatient[5]
  );

  // Calculate scan axis normal (perpendicular to the acquisition plane)
  const scanAxisNormal = vec3.create();
  vec3.cross(scanAxisNormal, rowVec, colVec);

  // Normalize all vectors
  vec3.normalize(rowVec, rowVec);
  vec3.normalize(colVec, colVec);
  vec3.normalize(scanAxisNormal, scanAxisNormal);

  // Create the 6 possible vectors: row, col, scanAxisNormal, and their negatives
  const negRowVec = vec3.create();
  vec3.negate(negRowVec, rowVec);
  const negColVec = vec3.create();
  vec3.negate(negColVec, colVec);
  const negScanAxisNormal = vec3.create();
  vec3.negate(negScanAxisNormal, scanAxisNormal);

  const acquisitionVectors = [
    { vec: rowVec, name: 'row' },
    { vec: colVec, name: 'col' },
    { vec: scanAxisNormal, name: 'scanAxis' },
    { vec: negRowVec, name: '-row' },
    { vec: negColVec, name: '-col' },
    { vec: negScanAxisNormal, name: '-scanAxis' },
  ];

  // Standard anatomical views
  const standardViews = [
    {
      name: 'axial',
      viewPlaneNormal: vec3.fromValues(
        MPR_CAMERA_VALUES.axial.viewPlaneNormal[0],
        MPR_CAMERA_VALUES.axial.viewPlaneNormal[1],
        MPR_CAMERA_VALUES.axial.viewPlaneNormal[2]
      ),
      viewUp: vec3.fromValues(
        MPR_CAMERA_VALUES.axial.viewUp[0],
        MPR_CAMERA_VALUES.axial.viewUp[1],
        MPR_CAMERA_VALUES.axial.viewUp[2]
      ),
    },
    {
      name: 'sagittal',
      viewPlaneNormal: vec3.fromValues(
        MPR_CAMERA_VALUES.sagittal.viewPlaneNormal[0],
        MPR_CAMERA_VALUES.sagittal.viewPlaneNormal[1],
        MPR_CAMERA_VALUES.sagittal.viewPlaneNormal[2]
      ),
      viewUp: vec3.fromValues(
        MPR_CAMERA_VALUES.sagittal.viewUp[0],
        MPR_CAMERA_VALUES.sagittal.viewUp[1],
        MPR_CAMERA_VALUES.sagittal.viewUp[2]
      ),
    },
    {
      name: 'coronal',
      viewPlaneNormal: vec3.fromValues(
        MPR_CAMERA_VALUES.coronal.viewPlaneNormal[0],
        MPR_CAMERA_VALUES.coronal.viewPlaneNormal[1],
        MPR_CAMERA_VALUES.coronal.viewPlaneNormal[2]
      ),
      viewUp: vec3.fromValues(
        MPR_CAMERA_VALUES.coronal.viewUp[0],
        MPR_CAMERA_VALUES.coronal.viewUp[1],
        MPR_CAMERA_VALUES.coronal.viewUp[2]
      ),
    },
  ];

  // Find best orthogonal pair for each standard view
  let bestAlignment = -Infinity;
  let bestViewPlaneNormal: vec3 | null = null;
  let bestViewUp: vec3 | null = null;

  for (const standardView of standardViews) {
    // Find the best orthogonal pair from acquisition vectors
    let bestPairScore = -Infinity;
    let bestPairViewPlaneNormal: vec3 | null = null;
    let bestPairViewUp: vec3 | null = null;

    // Try all pairs of acquisition vectors that are orthogonal
    for (let i = 0; i < acquisitionVectors.length; i++) {
      for (let j = 0; j < acquisitionVectors.length; j++) {
        if (i === j) continue;

        const v1 = acquisitionVectors[i].vec;
        const v2 = acquisitionVectors[j].vec;

        // Check if vectors are orthogonal (dot product should be close to 0)
        const dotProduct = Math.abs(vec3.dot(v1, v2));
        if (dotProduct > 0.1) continue; // Not orthogonal enough

        // Calculate alignment score: dot product of v1 with viewPlaneNormal + dot product of v2 with viewUp
        const score1 = Math.abs(vec3.dot(v1, standardView.viewPlaneNormal));
        const score2 = Math.abs(vec3.dot(v2, standardView.viewUp));
        const totalScore = score1 + score2;

        // Also try swapping v1 and v2
        const score1Swapped = Math.abs(
          vec3.dot(v2, standardView.viewPlaneNormal)
        );
        const score2Swapped = Math.abs(vec3.dot(v1, standardView.viewUp));
        const totalScoreSwapped = score1Swapped + score2Swapped;

        if (
          totalScoreSwapped > totalScore &&
          totalScoreSwapped > bestPairScore
        ) {
          bestPairScore = totalScoreSwapped;
          bestPairViewPlaneNormal = v2;
          bestPairViewUp = v1;
        } else if (totalScore > bestPairScore) {
          bestPairScore = totalScore;
          bestPairViewPlaneNormal = v1;
          bestPairViewUp = v2;
        }
      }
    }

    if (
      bestPairScore > bestAlignment &&
      bestPairViewPlaneNormal &&
      bestPairViewUp
    ) {
      bestAlignment = bestPairScore;
      bestViewPlaneNormal = bestPairViewPlaneNormal;
      bestViewUp = bestPairViewUp;
    }
  }

  if (!bestViewPlaneNormal || !bestViewUp) {
    return null;
  }

  // Return the orientation vectors
  return {
    viewPlaneNormal: [
      bestViewPlaneNormal[0],
      bestViewPlaneNormal[1],
      bestViewPlaneNormal[2],
    ] as [number, number, number],
    viewUp: [bestViewUp[0], bestViewUp[1], bestViewUp[2]] as [
      number,
      number,
      number,
    ],
  };
}
