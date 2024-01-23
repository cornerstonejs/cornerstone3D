import { Types, getWebWorkerManager } from '@cornerstonejs/core';
import { Annotation, ContourSegmentationData } from '../../../../types';
import { getAnnotation } from '../../..';

const workerManager = getWebWorkerManager();

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

  const { dimensions, origin, direction, spacing } = segmentationVolume;
  const scalarData = segmentationVolume.getScalarData();

  const annotationUIDsInSegmentMap = new Map<number, Annotation[]>();

  segmentIndices.forEach((index) => {
    const annotationUIDsInSegment = annotationMap.get(index);

    const annotations = Array.from(annotationUIDsInSegment).map((uid) => {
      const annotation = getAnnotation(uid);

      return annotation;
    });

    annotationUIDsInSegmentMap.set(index, annotations);
  });

  const newScalarData = await workerManager.executeTask(
    'polySeg',
    'convertContourToLabelmap',
    {
      segmentIndices,
      dimensions,
      scalarData,
      origin,
      direction,
      spacing,
      annotationUIDsInSegmentMap,
    },
    {
      callbacks: [
        (progress) => {
          console.debug('progress', progress);
        },
      ],
    }
  );

  segmentationVolume.imageData
    .getPointData()
    .getScalars()
    .setData(newScalarData);
  segmentationVolume.imageData.modified();

  return {
    volumeId: segmentationVolume.volumeId,
  };
}
