import type { NaturalizedInstance } from './types';

const ECG_SOP_CLASS_UIDS = new Set([
  '1.2.840.10008.5.1.4.1.1.9.1.1',
  '1.2.840.10008.5.1.4.1.1.9.1.2',
  '1.2.840.10008.5.1.4.1.1.9.1.3',
  '1.2.840.10008.5.1.4.1.1.9.2.1',
  '1.2.840.10008.5.1.4.1.1.9.3.1',
]);

/**
 * Returns true when the instance is an ECG / waveform SOP class (12-lead,
 * general, ambulatory, hemodynamic, or basic voice/audio waveform), so the
 * default split rules route it to an ECG viewport rather than an image stack.
 *
 * @param instance - the naturalized DICOM instance to classify.
 * @returns true if the instance is a waveform/ECG SOP class.
 */
export function isEcgInstance(instance: NaturalizedInstance): boolean {
  return ECG_SOP_CLASS_UIDS.has(instance.SOPClassUID ?? '');
}
