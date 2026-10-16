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
 * Frame Content (PS3.3 C.7.6.16.2.2) for frames in stacks, for example one
 * stack for each time point of a 4D series. `stackIds` gives the StackID of
 * each frame. In each stack, InStackPositionNumber is 1 to n in frame order.
 * The dimensions are STACK_ID_DIMENSION, then IN_STACK_POSITION_DIMENSION, and
 * the first Dimension Index Value is the rank of the StackID (numeric order).
 *
 * A reader places such frames by their source image references, not by a
 * position in the patient, so the stacks need no Frame of Reference.
 */
export function getStackFrameContents(stackIds: string[]): FrameContent[] {
  const stackOrder = [...new Set(stackIds)].sort(
    (a, b) => Number(a) - Number(b) || a.localeCompare(b)
  );
  const positions = new Map<string, number>();
  return stackIds.map((stackId) => {
    const position = (positions.get(stackId) ?? 0) + 1;
    positions.set(stackId, position);
    return {
      StackID: stackId,
      InStackPositionNumber: position,
      DimensionIndexValues: [stackOrder.indexOf(stackId) + 1, position],
    };
  });
}
