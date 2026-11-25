/**
 * The SOP class and transfer syntax lists that the default display set rules
 * read. Each list is also an entry of `defaultMetadataContext`, under the same
 * name, so a site changes a list with one overlay of the context, for example
 * `{ "imageSopClassUids": { "$push": ["1.2.3.4"] } }`. The code tests
 * (`isImageInstance`, `isVideoInstance`, ...) read the same constants.
 *
 * The lists do not overlap, except where a list says so.
 *
 * @module displayset/sopClassUidLists
 */

import { videoUIDs } from '../utilities/isVideoTransferSyntax';

const list = (uids: string[]): readonly string[] => uids;

/**
 * SOP classes that carry renderable pixel data. An instance that no rule
 * claims makes no display set, so a missing entry drops a whole series.
 */
export const imageSopClassUids = list([
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
  '1.2.840.10008.5.1.4.1.1.82.1', // Corneal Topography Map Storage
  '1.2.840.10008.5.1.4.1.1.128', // Positron Emission Tomography Image Storage
  '1.2.840.10008.5.1.4.1.1.128.1', // Legacy Converted Enhanced PET Image Storage
  '1.2.840.10008.5.1.4.1.1.130', // Enhanced PET Image Storage
  '1.2.840.10008.5.1.4.1.1.481.1', // RT Image Storage
  '1.2.840.10008.5.1.4.1.1.481.2', // RT Dose Storage
]);

/**
 * The SOP classes that DICOM defines as video only. The SOP class decides
 * alone, with any transfer syntax. A subset of {@link imageSopClassUids}.
 */
export const videoSopClassUids = list([
  '1.2.840.10008.5.1.4.1.1.77.1.1.1', // Video Endoscopic Image Storage
  '1.2.840.10008.5.1.4.1.1.77.1.2.1', // Video Microscopic Image Storage
  '1.2.840.10008.5.1.4.1.1.77.1.4.1', // Video Photographic Image Storage
]);

/** The video transfer syntaxes (MPEG-2, MPEG-4 AVC/H.264, HEVC/H.265). */
export const videoTransferSyntaxUids = list([...videoUIDs]);

/**
 * Secondary capture SOP classes that are video when they have at least
 * {@link longVideoMinFrames} frames, no transfer syntax is known, and the
 * image is not grayscale (`MONOCHROME1`, `MONOCHROME2`). A subset
 * of {@link imageSopClassUids}.
 */
export const longVideoSopClassUids = list([
  '1.2.840.10008.5.1.4.1.1.7', // Secondary Capture Image Storage
  '1.2.840.10008.5.1.4.1.1.7.4', // Multi-frame True Color Secondary Capture Image Storage
]);

/** The frame count from which a secondary capture with no transfer syntax is video. */
export const longVideoMinFrames = 90;

/** ECG and other waveform SOP classes. */
export const ecgSopClassUids = list([
  '1.2.840.10008.5.1.4.1.1.9.1.1', // 12-lead ECG Waveform Storage
  '1.2.840.10008.5.1.4.1.1.9.1.2', // General ECG Waveform Storage
  '1.2.840.10008.5.1.4.1.1.9.1.3', // Ambulatory ECG Waveform Storage
  '1.2.840.10008.5.1.4.1.1.9.2.1', // Hemodynamic Waveform Storage
  '1.2.840.10008.5.1.4.1.1.9.3.1', // Basic Cardiac Electrophysiology Waveform Storage
]);

/** Whole slide microscopy. A subset of {@link imageSopClassUids}. */
export const wholeSlideSopClassUids = list([
  '1.2.840.10008.5.1.4.1.1.77.1.6', // VL Whole Slide Microscopy Image Storage
]);

export const segmentationSopClassUids = list([
  '1.2.840.10008.5.1.4.1.1.66.4', // Segmentation Storage
  '1.2.840.10008.5.1.4.1.1.66.7', // Label Map Segmentation Storage
]);

export const rtStructureSetSopClassUids = list([
  '1.2.840.10008.5.1.4.1.1.481.3', // RT Structure Set Storage
]);

export const parametricMapSopClassUids = list([
  '1.2.840.10008.5.1.4.1.1.30', // Parametric Map Storage
]);

export const structuredReportSopClassUids = list([
  '1.2.840.10008.5.1.4.1.1.88.11', // Basic Text SR Storage
  '1.2.840.10008.5.1.4.1.1.88.22', // Enhanced SR Storage
  '1.2.840.10008.5.1.4.1.1.88.33', // Comprehensive SR Storage
  '1.2.840.10008.5.1.4.1.1.88.34', // Comprehensive 3D SR Storage
  '1.2.840.10008.5.1.4.1.1.88.67', // X-Ray Radiation Dose SR Storage
]);

export const encapsulatedDocumentSopClassUids = list([
  '1.2.840.10008.5.1.4.1.1.104.1', // Encapsulated PDF Storage
]);

export const bulkAnnotationSopClassUids = list([
  '1.2.840.10008.5.1.4.1.1.91.1', // Microscopy Bulk Simple Annotations Storage
]);

/** Empty in CS3D: a host adds its own chart SOP class, for example a private one. */
export const chartSopClassUids = list([]);
