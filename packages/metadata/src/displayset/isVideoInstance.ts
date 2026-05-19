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

const VIDEO_TRANSFER_SYNTAX_UIDS = new Set([
  '1.2.840.10008.1.2.4.102',
  '1.2.840.10008.1.2.4.103',
  '1.2.840.10008.1.2.4.104',
  '1.2.840.10008.1.2.4.105',
  '1.2.840.10008.1.2.4.106',
  '1.2.840.10008.1.2.4.107',
  '1.2.840.10008.1.2.4.108',
]);

function getTransferSyntaxUid(
  instance: NaturalizedInstance
): string | undefined {
  const tsuid =
    instance.AvailableTransferSyntaxUID ||
    instance.TransferSyntaxUID ||
    instance['00083002'];
  return Array.isArray(tsuid) ? tsuid[0] : tsuid;
}

/** Heuristic aligned with OHIF dicom-video SOP class handler. */
export function isVideoInstance(instance: NaturalizedInstance): boolean {
  const tsuid = getTransferSyntaxUid(instance);
  if (tsuid && VIDEO_TRANSFER_SYNTAX_UIDS.has(tsuid)) {
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
