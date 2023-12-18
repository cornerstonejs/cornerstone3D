import type { Types } from '@cornerstonejs/core';

import * as segmentation from '../../stateManagement/segmentation';
import * as annotation from '../../stateManagement/annotation';

import contourAndFindLargestBidirectional from './contourAndFindLargestBidirectional';
import createBidirectionalToolData from './createBidirectionalToolData';
import BidirectionalTool from '../../tools/annotation/BidirectionalTool';

export type Segment = {
  segmentationId: string;
  segmentIndex: number;
  label: string;

  style?: any;
  containedSegmentIndices?: (number) => boolean;
};

export type SegmentContourActionConfiguration = {
  getSegment?: (
    enabledElement: Types.IEnabledElement,
    configuration: SegmentContourActionConfiguration
  ) => Segment;

  /**
   * Optional map for data about each segment
   */
  segmentationId?: string;
  segmentData?: Map<number, Segment>;
  toolGroupId?: string;
};

export default function segmentContourAction(
  enabledElement: Types.IEnabledElement,
  configuration: SegmentContourActionConfiguration
) {
  const segment = (configuration.getSegment || defaultGetSegment)(
    enabledElement,
    configuration
  );
  if (!segment) {
    return;
  }
  const segmentationsList = segmentation.state.getSegmentations();
  const { segmentIndex, segmentationId } = segment;
  const segments = [];
  segments[segmentIndex] = segment;
  const bidirectionalData = contourAndFindLargestBidirectional({
    ...segmentationsList.find(
      (segmentation) => segmentation.segmentationId === segmentationId
    ),
    segments,
  });
  if (!bidirectionalData) {
    console.warn('No bidirectional data generated');
    return;
  }
  const bidirectionalToolData = createBidirectionalToolData(
    bidirectionalData,
    enabledElement.viewport
  );
  // There should be a spot for this type of data in the tools data, but not sure
  // where that might be.
  (bidirectionalToolData as any).segment = segment;
  const { FrameOfReferenceUID } = bidirectionalData;
  const bidirectionals = annotation.state.getAnnotations(
    this.toolName || BidirectionalTool.toolName,
    FrameOfReferenceUID
  );
  const existingLargest = bidirectionals.find((it) => {
    const segment = (it as any).segment;
    return (
      segment &&
      segment.segmentationId === segmentationId &&
      segment.segmentIndex === segmentIndex
    );
  });
  const annotationUID = annotation.state.addAnnotation(
    {
      ...existingLargest,
      ...bidirectionalToolData,
    },
    FrameOfReferenceUID
  );
  const { style } = segment;
  if (style) {
    console.log('Found style', style);
    annotation.config.style.setAnnotationStyles(annotationUID, style);
  } else {
    console.log('No style found in', configuration);
  }
  return bidirectionalData;
}

export function defaultGetSegment(
  enabledElement: Types.IEnabledElement,
  configuration: SegmentContourActionConfiguration
): Segment {
  const segmentationsList = segmentation.state.getSegmentations();
  if (!segmentationsList.length) {
    return;
  }
  const segmentationId =
    configuration.segmentationId || segmentationsList[0].segmentationId;
  const segmentIndex =
    segmentation.segmentIndex.getActiveSegmentIndex(segmentationId);
  if (!segmentIndex) {
    return;
  }
  const segmentData = configuration.segmentData?.get(segmentIndex);
  return {
    label: `Segment ${segmentIndex}`,
    segmentIndex,
    segmentationId,
    ...segmentData,
  };
}
