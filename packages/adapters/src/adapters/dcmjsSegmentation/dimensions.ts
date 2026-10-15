const IMAGE_POSITION_PATIENT_TAG = 0x00200032;
const PLANE_POSITION_SEQUENCE_TAG = 0x00209113;
const STACK_ID_TAG = 0x00209056;
const IN_STACK_POSITION_NUMBER_TAG = 0x00209057;
export const FRAME_CONTENT_SEQUENCE_TAG = 0x00209111;

export interface Dimension {
  DimensionIndexPointer: number;
  FunctionalGroupPointer: number;
  DimensionDescriptionLabel: string;
}

export interface FrameContent {
  DimensionIndexValues: number[];
  StackID?: string;
  InStackPositionNumber?: number;
}

export const POSITION_DIMENSION: Dimension = Object.freeze({
  DimensionIndexPointer: IMAGE_POSITION_PATIENT_TAG,
  FunctionalGroupPointer: PLANE_POSITION_SEQUENCE_TAG,
  DimensionDescriptionLabel: 'ImagePositionPatient',
});
export const STACK_ID_DIMENSION: Dimension = Object.freeze({
  DimensionIndexPointer: STACK_ID_TAG,
  FunctionalGroupPointer: FRAME_CONTENT_SEQUENCE_TAG,
  DimensionDescriptionLabel: 'StackID',
});
export const IN_STACK_POSITION_DIMENSION: Dimension = Object.freeze({
  DimensionIndexPointer: IN_STACK_POSITION_NUMBER_TAG,
  FunctionalGroupPointer: FRAME_CONTENT_SEQUENCE_TAG,
  DimensionDescriptionLabel: 'InStackPositionNumber',
});

/**
 * Frame Content (PS3.3 C.7.6.16.2.2) for frames that form one stack, in the
 * given order: StackID `stackId`, and InStackPositionNumber 1 to n. The
 * dimensions are STACK_ID_DIMENSION, then IN_STACK_POSITION_DIMENSION.
 *
 * A reader places such frames by their source image references, not by a
 * position in the patient, so the stack needs no Frame of Reference.
 */
export function getStackFrameContents(
  frameCount: number,
  stackId = '1'
): FrameContent[] {
  return Array.from({ length: frameCount }, (_, index) => ({
    StackID: stackId,
    InStackPositionNumber: index + 1,
    DimensionIndexValues: [1, index + 1],
  }));
}
