import type { vtkImageData } from '@kitware/vtk.js/Common/DataModel/ImageData';
import { Point3, Scaling } from '../types';

/**
 * IImageData of an image, which stores actual scalarData and metaData about the image.
 * IImageData is different from vtkImageData.
 */
interface IImageData {
  /** image dimensions */
  dimensions: Point3;
  /** image direction */
  direction: Float32Array;
  /** image spacing */
  spacing: Point3;
  /** image origin */
  origin: Point3;
  /** image scalarData which stores the array of pixelData */
  scalarData: Float32Array;
  /** vtkImageData object */
  imageData: vtkImageData;
  /** image metadata - currently only modality */
  metadata: { Modality: string };
  /** image scaling for scaling pixelArray */
  scaling?: Scaling;
  /** whether the image has pixel spacing and it is not undefined */
  hasPixelSpacing?: boolean;
}

export default IImageData;
