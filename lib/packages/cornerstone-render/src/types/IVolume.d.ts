import { vtkImageData } from 'vtk.js/Sources/Common/DataModel/ImageData';
import Point3 from './Point3';
import Metadata from './Metadata';
interface IVolume {
    uid: string;
    metadata: Metadata;
    dimensions: Point3;
    spacing: Point3;
    origin: Point3;
    direction: Array<number>;
    scalarData: Float32Array | Uint8Array;
    sizeInBytes?: number;
    vtkImageData?: vtkImageData;
    scaling?: {
        PET?: {
            SUVlbmFactor?: number;
            SUVbsaFactor?: number;
            suvbwToSuvlbm?: number;
            suvbwToSuvbsa?: number;
        };
    };
}
export default IVolume;
