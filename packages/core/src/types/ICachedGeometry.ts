import IGeometry from './IGeometry.js';
import { IGeometryLoadObject } from './ILoadObject.js';

interface ICachedGeometry {
  geometryId: string;
  geometryLoadObject: IGeometryLoadObject;
  loaded: boolean;
  timeStamp: number;
  sizeInBytes: number;
  geometry?: IGeometry;
}

export default ICachedGeometry;
