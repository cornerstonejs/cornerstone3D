import type { NaturalizedInstance } from './types';

/** SOP Class UIDs that represent image storage (aligned with OHIF isImage). */
const IMAGE_STORAGE_SOP_CLASS_UIDS = new Set([
  '1.2.840.10008.5.1.4.1.1.1',
  '1.2.840.10008.5.1.4.1.1.1.1',
  '1.2.840.10008.5.1.4.1.1.1.1.1',
  '1.2.840.10008.5.1.4.1.1.2',
  '1.2.840.10008.5.1.4.1.1.2.1',
  '1.2.840.10008.5.1.4.1.1.2.2',
  '1.2.840.10008.5.1.4.1.1.4',
  '1.2.840.10008.5.1.4.1.1.4.1',
  '1.2.840.10008.5.1.4.1.1.4.2',
  '1.2.840.10008.5.1.4.1.1.4.3',
  '1.2.840.10008.5.1.4.1.1.4.4',
  '1.2.840.10008.5.1.4.1.1.7',
  '1.2.840.10008.5.1.4.1.1.7.1',
  '1.2.840.10008.5.1.4.1.1.7.2',
  '1.2.840.10008.5.1.4.1.1.7.3',
  '1.2.840.10008.5.1.4.1.1.7.4',
  '1.2.840.10008.5.1.4.1.1.12.1',
  '1.2.840.10008.5.1.4.1.1.12.1.1',
  '1.2.840.10008.5.1.4.1.1.12.2',
  '1.2.840.10008.5.1.4.1.1.12.2.1',
  '1.2.840.10008.5.1.4.1.1.13.1.1',
  '1.2.840.10008.5.1.4.1.1.13.1.2',
  '1.2.840.10008.5.1.4.1.1.13.1.3',
  '1.2.840.10008.5.1.4.1.1.13.1.4',
  '1.2.840.10008.5.1.4.1.1.13.1.5',
  '1.2.840.10008.5.1.4.1.1.13.1.6',
  '1.2.840.10008.5.1.4.1.1.128',
  '1.2.840.10008.5.1.4.1.1.77.1.1',
  '1.2.840.10008.5.1.4.1.1.77.1.1.1',
  '1.2.840.10008.5.1.4.1.1.77.1.2',
  '1.2.840.10008.5.1.4.1.1.77.1.2.1',
  '1.2.840.10008.5.1.4.1.1.77.1.3',
  '1.2.840.10008.5.1.4.1.1.77.1.4',
  '1.2.840.10008.5.1.4.1.1.77.1.4.1',
  '1.2.840.10008.5.1.4.1.1.128.1',
  '1.2.840.10008.5.1.4.1.1.128.2',
  '1.2.840.10008.5.1.4.1.1.128.3',
  '1.2.840.10008.5.1.4.1.1.128.4',
  '1.2.840.10008.5.1.4.1.1.128.5',
  '1.2.840.10008.5.1.4.1.1.77.1.6',
]);

/**
 * Returns true when the instance is an image storage SOP class (the set OHIF's
 * `isImage` recognizes), i.e. an instance that carries pixel data and can be
 * rendered. Used by the default split rules to keep non-image objects (e.g.
 * presentation states, structured reports) out of image-oriented display sets.
 *
 * @param instance - the naturalized DICOM instance to classify.
 * @returns true when the instance's SOP class is a known image storage class.
 */
export function isImageInstance(instance: NaturalizedInstance): boolean {
  return IMAGE_STORAGE_SOP_CLASS_UIDS.has(instance.SOPClassUID ?? '');
}
