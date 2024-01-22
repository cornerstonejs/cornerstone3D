import { Types, utilities } from '@cornerstonejs/core';
import { ContourSegmentationData } from '../../../../types';
import { getAnnotation } from '../../..';
import { getBoundingBoxAroundShapeWorld } from '../../../../utilities/boundingBox';
import { pointInShapeCallback } from '../../../../utilities';
import { isPointInsidePolyline3D } from '../../../../utilities/math/polyline';

export async function convertContourToVolumeLabelmap(
  contourRepresentationData: ContourSegmentationData,
  segmentationVolume: Types.IImageVolume,
  options: {
    segmentIndices?: number[];
    segmentationRepresentationUID?: string;
  } = {}
) {
  const annotationMap = contourRepresentationData.annotationUIDsMap;

  const segmentIndices = options.segmentIndices?.length
    ? options.segmentIndices
    : Array.from(annotationMap.keys());

  const segmentationVoxelManager =
    utilities.VoxelManager.createVolumeVoxelManager(
      segmentationVolume.dimensions,
      segmentationVolume.getScalarData()
    );

  for (const index of segmentIndices) {
    const annotationUIDsInSegment = annotationMap.get(index);

    // Combine bounding boxes for all annotations in the segment
    const combinedBoundingBox = [
      [Infinity, -Infinity],
      [Infinity, -Infinity],
      [Infinity, -Infinity],
    ];

    const annotations = Array.from(annotationUIDsInSegment).map((uid) => {
      const annotation = getAnnotation(uid);
      const bounds = getBoundingBoxAroundShapeWorld(
        annotation.data.contour.polyline
      );

      // Update combined bounding box
      for (let dim = 0; dim < 3; dim++) {
        combinedBoundingBox[dim][0] = Math.min(
          combinedBoundingBox[dim][0],
          bounds[dim][0]
        );
        combinedBoundingBox[dim][1] = Math.max(
          combinedBoundingBox[dim][1],
          bounds[dim][1]
        );
      }

      return annotation;
    });

    const [iMin, jMin, kMin] = utilities.transformWorldToIndex(
      segmentationVolume.imageData,
      [
        combinedBoundingBox[0][0],
        combinedBoundingBox[1][0],
        combinedBoundingBox[2][0],
      ]
    );

    const [iMax, jMax, kMax] = utilities.transformWorldToIndex(
      segmentationVolume.imageData,
      [
        combinedBoundingBox[0][1],
        combinedBoundingBox[1][1],
        combinedBoundingBox[2][1],
      ]
    );

    // Run the pointInShapeCallback for the combined bounding box
    pointInShapeCallback(
      segmentationVolume.imageData,
      (pointLPS) => {
        // Check if the point is inside any of the polylines for this segment
        return annotations.some((annotation) =>
          isPointInsidePolyline3D(
            pointLPS as Types.Point3,
            annotation.data.contour.polyline
          )
        );
      },
      ({ pointIJK }) => {
        segmentationVoxelManager.setAtIJKPoint(pointIJK as Types.Point3, index);
      },
      [
        [iMin, iMax],
        [jMin, jMax],
        [kMin, kMax],
      ]
    );
  }

  return {
    volumeId: segmentationVolume.volumeId,
  };
}
