import type IGeometry from './IGeometry';
import type { IGeometryLoadObject } from './ILoadObject';

interface ICachedGeometry {
  geometryId: string;
  geometryLoadObject: IGeometryLoadObject;
  loaded: boolean;
  timeStamp: number;
  sizeInBytes: number;
  geometry?: IGeometry;
}

export type { ICachedGeometry as default };
