import { getEnabledElement, type Types } from '@cornerstonejs/core';

import type { Annotation } from '../../types/AnnotationTypes';
import * as segmentation from '../../stateManagement/segmentation';
import {
  state as annotationState,
  config as annotationConfig,
} from '../../stateManagement/annotation';
import { jumpToSlice } from '../viewport';
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
  element: HTMLDivElement,
  configuration: SegmentContourActionConfiguration
) {
  const enabledElement = getEnabledElement(element);
  const segment = (configuration.getSegment || defaultGetSegment)(
    enabledElement,
    configuration
  );
  if (!segment) {
    return;
  }
  const FrameOfReferenceUID = enabledElement.viewport.getFrameOfReferenceUID();
  const segmentationsList = segmentation.state.getSegmentations();
  const { segmentIndex, segmentationId } = segment;
  const bidirectionals = annotationState.getAnnotations(
    this.toolName || BidirectionalTool.toolName,
    FrameOfReferenceUID
  );
  let hasExistingActiveSegment = false;
  const existingSegments = bidirectionals.filter((it) => {
    const { segment } = it.data;
    if (!segment) {
      return;
    }
    if (
      segment.segmentationId === segmentationId &&
      segment.segmentIndex === segmentIndex
    ) {
      hasExistingActiveSegment = true;
      it.data.segment = segment;
    }
    return !!segment;
  });
  if (!hasExistingActiveSegment) {
    // Just create a dummy annotation object containing just enough information
    // to create a real one.
    existingSegments.push({
      data: { segment },
    } as unknown as Annotation);
  }

  let newBidirectional;
  existingSegments.forEach((annotation) => {
    const segments = [];
    const { segment: updateSegment } = annotation.data;
    const { segmentIndex, segmentationId } = updateSegment;
    segments[segmentIndex] = updateSegment;
    annotationState.removeAnnotation(annotation.annotationUID);
    const bidirectionalData = contourAndFindLargestBidirectional({
      ...segmentationsList.find(
        (segmentation) => segmentation.segmentationId === segmentationId
      ),
      segments,
    });

    if (!bidirectionalData) {
      return;
    }
    const bidirectionalToolData = createBidirectionalToolData(
      bidirectionalData,
      enabledElement.viewport
    );
    bidirectionalToolData.annotationUID = annotation.annotationUID;
    bidirectionalToolData.data.segment = updateSegment;

    const annotationUID = annotationState.addAnnotation(
      bidirectionalToolData,
      FrameOfReferenceUID
    );

    if (
      updateSegment.segmentIndex === segment.segmentIndex &&
      updateSegment.segmentationId === segment.segmentationId
    ) {
      newBidirectional = bidirectionalData;
      const { style } = segment;
      if (style) {
        annotationConfig.style.setAnnotationStyles(annotationUID, style);
      }
    }
  });

  if (newBidirectional) {
    const { referencedImageId } = newBidirectional;
    const imageIds = enabledElement.viewport.getImageIds();
    const imageIndex = imageIds.findIndex(
      (imageId) => imageId === referencedImageId
    );

    // TODO - figure out why this is reversed
    jumpToSlice(element, {
      imageIndex: imageIds.length - 1 - imageIndex,
    });
    enabledElement.viewport.render();
  } else {
    console.warn('No bidirectional found');
  }

  return newBidirectional;
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
