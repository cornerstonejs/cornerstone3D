import type { VOI } from './voi'

type Metadata = {
  BitsAllocated: number
  BitsStored: number
  SamplesPerPixel: number
  HighBit: number
  PhotometricInterpretation: string
  PixelRepresentation: number
  Modality: string
  ImageOrientationPatient: Array<number>
  PixelSpacing: Array<number>
  FrameOfReferenceUID: string
  Columns: number
  Rows: number
  voiLut: Array<VOI>
}

export default Metadata
