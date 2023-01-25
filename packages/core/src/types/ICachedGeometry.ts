import IGeometry from './IGeometry';
import { IGeometryLoadObject } from './ILoadObject';

interface ICachedGeometry {
  geometryId: string;
  geometryLoadObject: IGeometryLoadObject;
  loaded: boolean;
  timeStamp: number;
  sizeInBytes: number;
  geometry?: IGeometry;
}

export default ICachedGeometry;
