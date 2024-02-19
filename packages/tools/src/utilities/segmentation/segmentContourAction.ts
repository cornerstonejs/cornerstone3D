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
  segmentIndex?: number;
  segmentData?: Map<number, Segment>;
  toolGroupId?: string;
};

export default function segmentContourAction(
  element: HTMLDivElement,
  configuration
) {
  const { data: configurationData } = configuration;
  const enabledElement = getEnabledElement(element);
  const segment = (configurationData.getSegment || defaultGetSegment)(
    enabledElement,
    configurationData
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
  const existingLargestBidirectionals = bidirectionals.filter(
    (existingBidirectionalItem) => {
      const { segment } = existingBidirectionalItem.data;
      if (!segment) {
        return;
      }
      if (
        segment.segmentationId === segmentationId &&
        segment.segmentIndex === segmentIndex
      ) {
        hasExistingActiveSegment = true;
        existingBidirectionalItem.data.segment = segment;
      }
      return !!segment;
    }
  );
  if (!hasExistingActiveSegment) {
    // Just create a dummy annotation object containing just enough information
    // to create a real one.
    existingLargestBidirectionals.push({
      data: { segment },
    } as unknown as Annotation);
  }

  let newBidirectional;
  existingLargestBidirectionals.forEach((existingLargestBidirectional) => {
    const segments = [];
    const { segment: updateSegment } = existingLargestBidirectional.data;
    const { segmentIndex, segmentationId } = updateSegment;
    segments[segmentIndex] = updateSegment;
    annotationState.removeAnnotation(
      existingLargestBidirectional.annotationUID
    );
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
    bidirectionalToolData.annotationUID =
      existingLargestBidirectional.annotationUID;
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
    const { sliceIndex } = newBidirectional;
    const imageIds = enabledElement.viewport.getImageIds();

    // TODO - figure out why this is reversed
    jumpToSlice(element, {
      imageIndex: imageIds.length - 1 - sliceIndex,
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
    configuration.segmentIndex ??
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
