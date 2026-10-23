import type { NaturalizedInstance } from './types';

/**
 * SOP Class UIDs that carry renderable pixel data.
 *
 * This is the same set OHIF's `isImage` recognizes, listed by name so drift from
 * it is visible in review rather than hidden in a wall of UIDs. Getting it wrong
 * is not a subtle failure: an instance no rule claims produces **no display set
 * at all**, so a missing entry silently drops a whole series (and a spurious one
 * builds an image display set over an object with no pixels).
 */
const IMAGE_STORAGE_SOP_CLASS_UIDS = new Set([
  '1.2.840.10008.5.1.4.1.1.1', // Computed Radiography Image Storage
  '1.2.840.10008.5.1.4.1.1.1.1', // Digital X-Ray Image Storage - For Presentation
  '1.2.840.10008.5.1.4.1.1.1.1.1', // Digital X-Ray Image Storage - For Processing
  '1.2.840.10008.5.1.4.1.1.1.2', // Digital Mammography X-Ray Image Storage - For Presentation
  '1.2.840.10008.5.1.4.1.1.1.2.1', // Digital Mammography X-Ray Image Storage - For Processing
  '1.2.840.10008.5.1.4.1.1.1.3', // Digital Intra-Oral X-Ray Image Storage - For Presentation
  '1.2.840.10008.5.1.4.1.1.1.3.1', // Digital Intra-Oral X-Ray Image Storage - For Processing
  '1.2.840.10008.5.1.4.1.1.2', // CT Image Storage
  '1.2.840.10008.5.1.4.1.1.2.1', // Enhanced CT Image Storage
  '1.2.840.10008.5.1.4.1.1.2.2', // Legacy Converted Enhanced CT Image Storage
  '1.2.840.10008.5.1.4.1.1.3.1', // Ultrasound Multi-frame Image Storage
  '1.2.840.10008.5.1.4.1.1.4', // MR Image Storage
  '1.2.840.10008.5.1.4.1.1.4.1', // Enhanced MR Image Storage
  '1.2.840.10008.5.1.4.1.1.4.3', // Enhanced MR Color Image Storage
  '1.2.840.10008.5.1.4.1.1.4.4', // Legacy Converted Enhanced MR Image Storage
  '1.2.840.10008.5.1.4.1.1.6.1', // Ultrasound Image Storage
  '1.2.840.10008.5.1.4.1.1.6.2', // Enhanced US Volume Storage
  '1.2.840.10008.5.1.4.1.1.7', // Secondary Capture Image Storage
  '1.2.840.10008.5.1.4.1.1.7.1', // Multi-frame Single Bit Secondary Capture Image Storage
  '1.2.840.10008.5.1.4.1.1.7.2', // Multi-frame Grayscale Byte Secondary Capture Image Storage
  '1.2.840.10008.5.1.4.1.1.7.3', // Multi-frame Grayscale Word Secondary Capture Image Storage
  '1.2.840.10008.5.1.4.1.1.7.4', // Multi-frame True Color Secondary Capture Image Storage
  '1.2.840.10008.5.1.4.1.1.12.1', // X-Ray Angiographic Image Storage
  '1.2.840.10008.5.1.4.1.1.12.1.1', // Enhanced XA Image Storage
  '1.2.840.10008.5.1.4.1.1.12.2', // X-Ray Radiofluoroscopic Image Storage
  '1.2.840.10008.5.1.4.1.1.12.2.1', // Enhanced XRF Image Storage
  '1.2.840.10008.5.1.4.1.1.13.1.1', // X-Ray 3D Angiographic Image Storage
  '1.2.840.10008.5.1.4.1.1.13.1.2', // X-Ray 3D Craniofacial Image Storage
  '1.2.840.10008.5.1.4.1.1.13.1.3', // Breast Tomosynthesis Image Storage
  '1.2.840.10008.5.1.4.1.1.13.1.4', // Breast Projection X-Ray Image Storage - For Presentation
  '1.2.840.10008.5.1.4.1.1.13.1.5', // Breast Projection X-Ray Image Storage - For Processing
  '1.2.840.10008.5.1.4.1.1.14.1', // Intravascular OCT Image Storage - For Presentation
  '1.2.840.10008.5.1.4.1.1.14.2', // Intravascular OCT Image Storage - For Processing
  '1.2.840.10008.5.1.4.1.1.20', // Nuclear Medicine Image Storage
  '1.2.840.10008.5.1.4.1.1.77.1.1', // VL Endoscopic Image Storage
  '1.2.840.10008.5.1.4.1.1.77.1.1.1', // Video Endoscopic Image Storage
  '1.2.840.10008.5.1.4.1.1.77.1.2', // VL Microscopic Image Storage
  '1.2.840.10008.5.1.4.1.1.77.1.2.1', // Video Microscopic Image Storage
  '1.2.840.10008.5.1.4.1.1.77.1.3', // VL Slide-Coordinates Microscopic Image Storage
  '1.2.840.10008.5.1.4.1.1.77.1.4', // VL Photographic Image Storage
  '1.2.840.10008.5.1.4.1.1.77.1.4.1', // Video Photographic Image Storage
  '1.2.840.10008.5.1.4.1.1.77.1.5.1', // Ophthalmic Photography 8 Bit Image Storage
  '1.2.840.10008.5.1.4.1.1.77.1.5.2', // Ophthalmic Photography 16 Bit Image Storage
  '1.2.840.10008.5.1.4.1.1.77.1.5.4', // Ophthalmic Tomography Image Storage
  '1.2.840.10008.5.1.4.1.1.77.1.6', // VL Whole Slide Microscopy Image Storage
  '1.2.840.10008.5.1.4.1.1.128', // Positron Emission Tomography Image Storage
  '1.2.840.10008.5.1.4.1.1.128.1', // Legacy Converted Enhanced PET Image Storage
  '1.2.840.10008.5.1.4.1.1.130', // Enhanced PET Image Storage
  '1.2.840.10008.5.1.4.1.1.481.1', // RT Image Storage
]);

/**
 * Returns true when the instance is an image storage SOP class (the set OHIF's
 * `isImage` recognizes), i.e. an instance that carries pixel data and can be
 * rendered. Used by the default split rules to keep non-image objects (e.g.
 * presentation states, structured reports, MR spectroscopy) out of
 * image-oriented display sets.
 *
 * @param instance - the naturalized DICOM instance to classify.
 * @returns true when the instance's SOP class is a known image storage class.
 */
export function isImageInstance(instance: NaturalizedInstance): boolean {
  return IMAGE_STORAGE_SOP_CLASS_UIDS.has(instance.SOPClassUID ?? '');
}
