import {
  DERIVATION_CODE_SEGMENTATION,
  PURPOSE_OF_REFERENCE_SOURCE_IMAGE,
} from './codes';

export interface SourceImageReference {
  ReferencedSOPClassUID?: string;
  ReferencedSOPInstanceUID: string;
  ReferencedFrameNumber?: number;
}

/**
 * An Image SOP Instance Reference (PS3.3 C.10.5) to one frame of a source
 * image. ReferencedFrameNumber is written only for a multi-frame source, because
 * PS3.3 forbids it for a SOP Class that is not multi-frame.
 *
 * @param source.numberOfFrames - NumberOfFrames of the source instance.
 * @param source.frameNumber - 1-based frame of the source instance.
 */
export function createSourceImageReference(source: {
  sopClassUID?: string;
  sopInstanceUID: string;
  numberOfFrames?: number;
  frameNumber?: number;
}): SourceImageReference {
  const reference: SourceImageReference = {
    ReferencedSOPInstanceUID: source.sopInstanceUID,
  };
  if (source.sopClassUID) {
    reference.ReferencedSOPClassUID = source.sopClassUID;
  }
  const { frameNumber } = source;
  const isMultiframe =
    Number(source.numberOfFrames) > 1 || Number(frameNumber) > 1;
  if (isMultiframe && Number.isInteger(frameNumber) && frameNumber > 0) {
    reference.ReferencedFrameNumber = frameNumber;
  }
  return reference;
}

/**
 * A Derivation Image item (PS3.3 C.7.6.16.2.6) for a segmentation frame of the
 * given source frame, with the Derivation Code and the Purpose of Reference
 * that the macro requires.
 */
export function createDerivationImageItem(reference: SourceImageReference) {
  return {
    DerivationCodeSequence: [{ ...DERIVATION_CODE_SEGMENTATION }],
    SourceImageSequence: [
      {
        ...reference,
        PurposeOfReferenceCodeSequence: [
          { ...PURPOSE_OF_REFERENCE_SOURCE_IMAGE },
        ],
      },
    ],
  };
}
