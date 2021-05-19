import { vtkImageData } from 'vtk.js/Sources/Common/DataModel/ImageData';
import { Metadata, Point3, ImageLoadObject } from '../types';
interface IImageVolume {
    readonly uid: string;
    dimensions: Point3;
    direction: Array<number>;
    metadata: Metadata;
    origin: Point3;
    scalarData: any;
    scaling?: {
        PET?: {
            SUVlbmFactor?: number;
            SUVbsaFactor?: number;
            suvbwToSuvlbm?: number;
            suvbwToSuvbsa?: number;
        };
    };
    sizeInBytes?: number;
    spacing: Point3;
    numVoxels: number;
    vtkImageData?: vtkImageData;
    vtkOpenGLTexture: any;
    loadStatus?: Record<string, any>;
    imageIds?: Array<string>;
    convertToCornerstoneImage?: (imageId: string, imageIdIndex: number) => ImageLoadObject;
}
export default IImageVolume;
