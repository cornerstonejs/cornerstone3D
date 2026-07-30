import { videoUIDs } from '../utilities/isVideoTransferSyntax';
import type { NaturalizedInstance } from './types';

const VIDEO_SOP_CLASS_UIDS = new Set([
  '1.2.840.10008.5.1.4.1.1.77.1.2.1',
  '1.2.840.10008.5.1.4.1.1.77.1.4.1',
  '1.2.840.10008.5.1.4.1.1.77.1.1.1',
]);

const SECONDARY_CAPTURE_SOP_CLASS_UIDS = new Set([
  '1.2.840.10008.5.1.4.1.1.7',
  '1.2.840.10008.5.1.4.1.1.7.4',
]);

function getTransferSyntaxUids(instance: NaturalizedInstance): string[] {
  const tsuid =
    instance.AvailableTransferSyntaxUID ||
    instance.TransferSyntaxUID ||
    instance['00083002'];
  return (Array.isArray(tsuid) ? tsuid : [tsuid]).filter(
    (value): value is string => typeof value === 'string' && value.length > 0
  );
}

/**
 * Heuristic aligned with OHIF's dicom-video SOP class handler. An instance is
 * treated as video when it is encoded with a video transfer syntax (the shared
 * {@link videoUIDs} list, e.g. the MPEG2/MPEG4/HEVC families), declares a
 * dedicated video SOP class, or is a long multi-frame secondary capture.
 *
 * The transfer-syntax check reuses {@link videoUIDs} so it stays in sync with
 * `isVideoTransferSyntax` rather than maintaining a second, drifting list.
 *
 * @param instance - the naturalized DICOM instance to classify.
 * @returns true when the instance should be rendered as video.
 */
export function isVideoInstance(instance: NaturalizedInstance): boolean {
  const tsuids = getTransferSyntaxUids(instance);
  if (tsuids.some((tsuid) => videoUIDs.has(tsuid))) {
    return true;
  }

  if (instance.SOPClassUID === '1.2.840.10008.5.1.4.1.1.77.1.4.1') {
    return true;
  }

  if (VIDEO_SOP_CLASS_UIDS.has(instance.SOPClassUID ?? '')) {
    return true;
  }

  const numberOfFrames = Number(instance.NumberOfFrames) || 0;
  return (
    SECONDARY_CAPTURE_SOP_CLASS_UIDS.has(instance.SOPClassUID ?? '') &&
    numberOfFrames >= 90
  );
}
