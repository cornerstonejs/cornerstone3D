/**
 * Segmentation IOD helpers that belong in dcmjs (dcmjs-org/dcmjs#607).
 *
 * The code in this folder works on naturalized dcmjs datasets only. It imports
 * no Cornerstone package, so that it can move to dcmjs after the dcmjs 1.0
 * release, and the adapter can then import it from dcmjs.
 */
export {
  DERIVATION_CODE_SEGMENTATION,
  PURPOSE_OF_REFERENCE_SOURCE_IMAGE,
} from './codes';
export {
  createDerivationImageItem,
  createSourceImageReference,
} from './sourceReferences';
export type { SourceImageReference } from './sourceReferences';
export {
  FRAME_CONTENT_SEQUENCE_TAG,
  IN_STACK_POSITION_DIMENSION,
  POSITION_DIMENSION,
  STACK_ID_DIMENSION,
  getStackFrameContents,
} from './dimensions';
export type { Dimension, FrameContent } from './dimensions';
export {
  ensurePatientOrientation,
  removeDuplicateReferencedInstances,
  removeFrameOfReference,
  removePlaneMacros,
  toConformantSegment,
} from './conformance';
