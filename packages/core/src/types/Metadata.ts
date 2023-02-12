import type { VOI } from './voi';

/**
 * Metadata for images, More information can be found in the
 * {@link https://dicom.nema.org/medical/dicom/current/output/chtml/part03/sect_C.7.6.3.html#table_C.7-11c}
 */
type Metadata = {
  /** Number of bits allocated for each pixel sample. Each sample shall have the same number of bits allocated */
  BitsAllocated: number;
  /** Number of bits stored for each pixel sample */
  BitsStored: number;
  SamplesPerPixel: number;
  /** Most significant bit for pixel sample data */
  HighBit: number;
  /** Specifies the intended interpretation of the pixel data */
  PhotometricInterpretation: string;
  /** Data representation of the pixel samples. */
  PixelRepresentation: number;
  /** Image Modality */
  Modality: string;
  /** SeriesInstanceUID of the volume */
  SeriesInstanceUID?: string;
  /** The direction cosines of the first row and the first column with respect to the patient */
  ImageOrientationPatient: Array<number>;
  /** Physical distance in the patient between the center of each pixel */
  PixelSpacing: Array<number>;
  /** Uniquely identifies the Frame of Reference for a Series */
  FrameOfReferenceUID: string;
  /** Number of columns in the image. */
  Columns: number;
  /** Number of rows in the image. */
  Rows: number;
  /** Window Level/Center for the image */
  voiLut: Array<VOI>;
  /** VOILUTFunction for the image which is LINEAR or SAMPLED_SIGMOID */
  VOILUTFunction: string;
};

export default Metadata;
