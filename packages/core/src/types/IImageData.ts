import type { vtkImageData } from '@kitware/vtk.js/Common/DataModel/ImageData';
import { Point3, Scaling, Mat3 } from '../types';
import IImageCalibration from './IImageCalibration';

/**
 * IImageData of an image, which stores actual scalarData and metaData about the image.
 * IImageData is different from vtkImageData.
 */
interface IImageData {
  /** image dimensions */
  dimensions: Point3;
  /** image direction */
  direction: Mat3;
  /** image spacing */
  spacing: Point3;
  /** image origin */
  origin: Point3;
  /** image scalarData which stores the array of pixelData */
  scalarData: Float32Array | Uint16Array | Uint8Array | Int16Array;
  /** vtkImageData object */
  imageData: vtkImageData;
  /** image metadata - currently only modality */
  metadata: { Modality: string };
  /** image scaling for scaling pixelArray */
  scaling?: Scaling;
  /** whether the image has pixel spacing and it is not undefined */
  hasPixelSpacing?: boolean;

  calibration?: IImageCalibration;

  /** preScale object */
  preScale?: {
    /** boolean flag to indicate whether the image has been scaled */
    scaled?: boolean;
    /** scaling parameters */
    scalingParameters?: {
      /** modality of the image */
      modality?: string;
      /** rescale slop */
      rescaleSlope?: number;
      /** rescale intercept */
      rescaleIntercept?: number;
      /** PT suvbw */
      suvbw?: number;
    };
  };
}

export default IImageData;
