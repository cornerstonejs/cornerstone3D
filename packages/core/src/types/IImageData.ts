import type { vtkImageData } from '@kitware/vtk.js/Common/DataModel/ImageData';
import type { Point3 } from './Point3';
import type { Scaling } from './ScalingParameters';
import type Mat3 from './Mat3';
import type { PixelDataTypedArray } from './PixelDataTypedArray';
import type RGB from './RGB';
import IImageCalibration from './IImageCalibration';
import { VoxelManager } from '../utilities';

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
  scalarData: PixelDataTypedArray;
  /** vtkImageData object */
  imageData: vtkImageData;
  /** image metadata - currently only modality */
  metadata: { Modality: string; FrameOfReferenceUID: string };
  /** image scaling for scaling pixelArray */
  scaling?: Scaling;
  /** whether the image has pixel spacing and it is not undefined */
  hasPixelSpacing?: boolean;

  voxelManager?: VoxelManager<number> | VoxelManager<RGB>;

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
