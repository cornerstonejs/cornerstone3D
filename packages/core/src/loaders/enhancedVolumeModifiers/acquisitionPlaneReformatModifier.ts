import { vec3 } from 'gl-matrix';
import * as metaData from '../../metaData';
import { MPR_CAMERA_VALUES } from '../../constants';
import type { ImageVolumeProps, Mat3 } from '../../types';
import type {
  EnhancedVolumeModifier,
  EnhancedVolumeModifierContext,
} from './types';

/**
 * EnhancedVolumeModifier that reformats the volume to match the acquisition-related view.
 *
 * Algorithm:
 * 1. Extract 6 possible vectors from acquisition: row, column, scanAxisNormal, and their negatives
 * 2. For each standard view (axial, sagittal, coronal), find the best orthogonal pair
 *    (viewPlaneNormal, viewUp) from the 6 vectors that maximizes dot product alignment
 * 3. Choose the reformat view with the best overall alignment
 * 4. Construct direction matrix from the chosen vectors
 */
export const acquisitionPlaneReformatModifier: EnhancedVolumeModifier = {
  name: 'AcquisitionPlaneReformatModifier',
  apply(volumeProps, context) {
    console.log('[AcquisitionPlaneReformatModifier] Starting application', {
      volumeId: context.volumeId,
      imageIdsCount: context.imageIds?.length,
    });

    const { imageIds } = context;

    if (!imageIds || imageIds.length === 0) {
      console.log(
        '[AcquisitionPlaneReformatModifier] No imageIds provided, skipping'
      );
      return volumeProps;
    }

    // Get the image plane module from the first image to get acquisition orientation
    const imagePlaneModule = metaData.get('imagePlaneModule', imageIds[0]);

    if (!imagePlaneModule || !imagePlaneModule.imageOrientationPatient) {
      console.log(
        '[AcquisitionPlaneReformatModifier] Missing imagePlaneModule or imageOrientationPatient, skipping'
      );
      return volumeProps;
    }

    const { imageOrientationPatient } = imagePlaneModule;

    // ImageOrientationPatient is a 6-element array:
    // [rowX, rowY, rowZ, colX, colY, colZ]
    if (imageOrientationPatient.length !== 6) {
      console.log(
        '[AcquisitionPlaneReformatModifier] Invalid imageOrientationPatient length:',
        imageOrientationPatient.length
      );
      return volumeProps;
    }

    console.log(
      '[AcquisitionPlaneReformatModifier] Original direction matrix:',
      volumeProps.direction
    );
    console.log(
      '[AcquisitionPlaneReformatModifier] ImageOrientationPatient:',
      imageOrientationPatient
    );

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

    console.log(
      '[AcquisitionPlaneReformatModifier] Acquisition vectors:',
      acquisitionVectors.map((v) => ({ name: v.name, vec: Array.from(v.vec) }))
    );

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
    let bestViewName = '';

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

      console.log(
        `[AcquisitionPlaneReformatModifier] ${standardView.name} view - best score: ${bestPairScore}`
      );

      if (
        bestPairScore > bestAlignment &&
        bestPairViewPlaneNormal &&
        bestPairViewUp
      ) {
        bestAlignment = bestPairScore;
        bestViewPlaneNormal = bestPairViewPlaneNormal;
        bestViewUp = bestPairViewUp;
        bestViewName = standardView.name;
      }
    }

    if (!bestViewPlaneNormal || !bestViewUp) {
      console.log(
        '[AcquisitionPlaneReformatModifier] Could not find valid orthogonal pair, using original direction'
      );
      return volumeProps;
    }

    // Calculate viewRight as cross product of viewUp and viewPlaneNormal
    const viewRight = vec3.create();
    vec3.cross(viewRight, bestViewUp, bestViewPlaneNormal);
    vec3.normalize(viewRight, viewRight);

    // Ensure right-handed coordinate system
    const checkCross = vec3.create();
    vec3.cross(checkCross, viewRight, bestViewUp);
    if (vec3.dot(checkCross, bestViewPlaneNormal) < 0) {
      vec3.negate(viewRight, viewRight);
    }

    console.log('[AcquisitionPlaneReformatModifier] Best alignment:', {
      viewName: bestViewName,
      score: bestAlignment,
      viewPlaneNormal: Array.from(bestViewPlaneNormal),
      viewUp: Array.from(bestViewUp),
      viewRight: Array.from(viewRight),
    });

    // Construct the direction matrix
    // Direction matrix format: [rowX, rowY, rowZ, colX, colY, colZ, normalX, normalY, normalZ]
    // Where row = viewRight, col = viewUp, normal = viewPlaneNormal
    const direction: Mat3 = [
      viewRight[0],
      viewRight[1],
      viewRight[2],
      bestViewUp[0],
      bestViewUp[1],
      bestViewUp[2],
      bestViewPlaneNormal[0],
      bestViewPlaneNormal[1],
      bestViewPlaneNormal[2],
    ] as Mat3;

    console.log(
      '[AcquisitionPlaneReformatModifier] New direction matrix:',
      direction
    );
    console.log(
      '[AcquisitionPlaneReformatModifier] Direction changed:',
      JSON.stringify(volumeProps.direction) !== JSON.stringify(direction)
    );

    // Update ImageOrientationPatient in metadata to match the new direction matrix
    // ImageOrientationPatient is the first 6 elements of the direction matrix:
    // [rowX, rowY, rowZ, colX, colY, colZ]
    const newImageOrientationPatient: number[] = [
      direction[0], // rowX (viewRight X)
      direction[1], // rowY (viewRight Y)
      direction[2], // rowZ (viewRight Z)
      direction[3], // colX (viewUp X)
      direction[4], // colY (viewUp Y)
      direction[5], // colZ (viewUp Z)
    ];

    console.log(
      '[AcquisitionPlaneReformatModifier] Updated ImageOrientationPatient:',
      newImageOrientationPatient
    );

    // Return updated volumeProps with acquisition-aligned direction matrix and metadata
    return {
      ...volumeProps,
      direction,
      metadata: {
        ...volumeProps.metadata,
        //    ImageOrientationPatient: newImageOrientationPatient,
      },
    };
  },
};
