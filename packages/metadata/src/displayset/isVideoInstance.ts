import { isTrue } from '../safeFunctions/values';
import type { DisplaySetContext } from './displaySetContext';
import { getContextValue } from './metadataContext';
import type { NaturalizedInstance } from './types';

/**
 * Returns true when the instance is video. By default: a SOP class of
 * `videoSopClassUids`; else any available transfer syntax
 * (`AvailableTransferSyntaxUID`, `TransferSyntaxUID`) in
 * `videoTransferSyntaxUids`; else, only when no transfer syntax is known, a
 * secondary capture of `longVideoSopClassUids` with at least
 * `longVideoMinFrames` frames that is not grayscale (`PhotometricInterpretation`
 * does not start with `MONOCHROME`).
 *
 * The test is the `isVideo` entry of `context`, else of the active metadata
 * context (`setMetadataContext`), so a customized list or expression applies,
 * and the answer is the same as in the rules.
 *
 * @param instance - the naturalized DICOM instance to classify.
 * @param context - the metadata context; defaults to the active context.
 */
export function isVideoInstance(
  instance: NaturalizedInstance,
  context?: DisplaySetContext
): boolean {
  return isTrue(getContextValue('isVideo', instance, context));
}
