import { Surface } from '../cache/classes/Surface.js';
import { GeometryType } from '../enums/index.js';
import { IContourSet } from './IContourSet.js';

// interface IGeometry can be array of IContourSet
interface IGeometry {
  id: string;
  type: GeometryType;
  data: IContourSet | Surface;
  sizeInBytes: number;
}

export default IGeometry;
