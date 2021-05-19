import { IVolume, Metadata, Point3, IImageVolume } from '../../types';
export declare class ImageVolume implements IImageVolume {
    readonly uid: string;
    dimensions: Point3;
    direction: Array<number>;
    metadata: Metadata;
    origin: Point3;
    scalarData: Float32Array | Uint8Array;
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
    vtkImageData?: any;
    vtkOpenGLTexture: any;
    loadStatus?: Record<string, any>;
    imageIds?: Array<string>;
    constructor(props: IVolume);
}
export default ImageVolume;
