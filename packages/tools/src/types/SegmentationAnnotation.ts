import { Annotation } from './AnnotationTypes';

export type SegmentationAnnotationData = {
  segmentationData: {
    segmentationId: string;
    segmentIndex: number;
    segmentationRepresentationUID: string;
  };
};

export type SegmentationAnnotation = Annotation & SegmentationAnnotationData;
