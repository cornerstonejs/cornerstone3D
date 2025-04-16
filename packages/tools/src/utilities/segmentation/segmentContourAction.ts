import { getEnabledElement, type Types, utilities } from '@cornerstonejs/core';

import type { Annotation } from '../../types/AnnotationTypes';
import {
  state as annotationState,
  config as annotationConfig,
} from '../../stateManagement/annotation';
import contourAndFindLargestBidirectional from './contourAndFindLargestBidirectional';
import createBidirectionalToolData from './createBidirectionalToolData';
import BidirectionalTool from '../../tools/annotation/BidirectionalTool';
import { getSegmentations } from '../../stateManagement/segmentation/getSegmentations';
import { getActiveSegmentIndex } from '../../stateManagement/segmentation/getActiveSegmentIndex';

export type Segment = {
  segmentationId: string;
  segmentIndex: number;
  label: string;
  style?: Record<string, unknown>;
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
  console.warn(
    'Deprecation Alert: There is a new getSegmentLargestBidirectional function that handles volume, stack and individual segment cases properly. This function is deprecated and will be removed in a future version.'
  );
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
  const segmentationsList = getSegmentations();
  const { segmentIndex, segmentationId } = segment;
  const bidirectionals = annotationState.getAnnotations(
    this.toolName || BidirectionalTool.toolName,
    FrameOfReferenceUID
  );
  let hasExistingActiveSegment = false;
  const existingLargestBidirectionals = bidirectionals.filter(
    (existingBidirectionalItem) => {
      const segment = existingBidirectionalItem.data.segment as
        | Segment
        | undefined;
      if (!segment) {
        return false;
      }
      if (
        segment.segmentationId === segmentationId &&
        segment.segmentIndex === segmentIndex
      ) {
        hasExistingActiveSegment = true;
        existingBidirectionalItem.data.segment = segment;
      }
      return true;
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
    const segments: Segment[] = [];
    const updateSegment = existingLargestBidirectional.data.segment as Segment;
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
    utilities.jumpToSlice(element, {
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
  const segmentationsList = getSegmentations();
  if (!segmentationsList.length) {
    return;
  }
  const segmentationId =
    configuration.segmentationId || segmentationsList[0].segmentationId;
  const segmentIndex =
    configuration.segmentIndex ?? getActiveSegmentIndex(segmentationId);
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
