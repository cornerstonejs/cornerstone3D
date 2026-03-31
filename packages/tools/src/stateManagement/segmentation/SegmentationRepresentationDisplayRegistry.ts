import type { Types } from '@cornerstonejs/core';
import type SegmentationRepresentations from '../../enums/SegmentationRepresentations';
import type { SegmentationRepresentation } from '../../types/SegmentationStateTypes';

type SegmentationRepresentationUpdateFunction = (
  segmentationId: string
) => Promise<void>;

export type SegmentationRepresentationDisplay = {
  getUpdateFunction: (
    viewport: Types.IVolumeViewport | Types.IStackViewport
  ) => SegmentationRepresentationUpdateFunction | void | null;
  render: (
    viewport: Types.IVolumeViewport | Types.IStackViewport,
    representation: SegmentationRepresentation
  ) => Promise<void>;
  removeRepresentation: (
    viewportId: string,
    segmentationId: string,
    renderImmediate?: boolean
  ) => void;
};

const segmentationRepresentationDisplays = new Map<
  SegmentationRepresentations,
  SegmentationRepresentationDisplay
>();

export function registerSegmentationRepresentationDisplay(
  representationType: SegmentationRepresentations,
  display: SegmentationRepresentationDisplay
): void {
  segmentationRepresentationDisplays.set(representationType, display);
}

export function getSegmentationRepresentationDisplay(
  representationType: SegmentationRepresentations
): SegmentationRepresentationDisplay | undefined {
  return segmentationRepresentationDisplays.get(representationType);
}
