import type { Types } from '@cornerstonejs/core';

import RectangleROIStartEndThreshold from './RectangleROIStartEndThreshold';

function validateAnnotation(annotation) {
  if (!annotation?.data) {
    throw new Error('Tool data is empty');
  }

  if (!annotation.metadata || !annotation.metadata.referencedImageId) {
    throw new Error('Tool data is not associated with any imageId');
  }
}

type ContourSequence = {
  NumberOfContourPoints: number;
  ContourImageSequence: Types.NormalModule[];
  ContourGeometricType: string;
  ContourData: string[];
};

type ContourSequenceProvider = {
  getContourSequence: (
    annotation,
    metadataProvider
  ) => ContourSequence | ContourSequence[];
};

class AnnotationToPointData {
  static TOOL_NAMES: Record<string, ContourSequenceProvider> = {};

  constructor() {
    // empty
  }

  static convert(annotation, segment, metadataProvider) {
    validateAnnotation(annotation);

    const { toolName } = annotation.metadata;
    const toolClass = AnnotationToPointData.TOOL_NAMES[toolName];

    if (!toolClass) {
      throw new Error(
        `Unknown tool type: ${toolName}, cannot convert to RTSSReport`
      );
    }

    // Each toolData should become a list of contours, ContourSequence
    // contains a list of contours with their pointData, their geometry
    // type and their length.
    const contourSequence = toolClass.getContourSequence(
      annotation,
      metadataProvider
    );

    // Todo: random rgb color for now, options should be passed in
    const color = segment.color?.slice(0, 3) || [
      Math.floor(Math.random() * 255),
      Math.floor(Math.random() * 255),
      Math.floor(Math.random() * 255),
    ];

    return {
      ReferencedROINumber: segment.segmentIndex,
      ROIDisplayColor: color,
      ContourSequence: Array.isArray(contourSequence)
        ? contourSequence
        : [contourSequence],
    };
  }

  static register(toolClass) {
    AnnotationToPointData.TOOL_NAMES[toolClass.toolName] = toolClass;
  }
}

AnnotationToPointData.register(RectangleROIStartEndThreshold);

export default AnnotationToPointData;
