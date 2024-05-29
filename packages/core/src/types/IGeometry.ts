import { GeometryType } from '../enums/index.js';
import { IContourSet } from './IContourSet.js';
import { ISurface } from './ISurface.js';

// interface IGeometry can be array of IContourSet
interface IGeometry {
  id: string;
  type: GeometryType;
  data: IContourSet | ISurface;
  sizeInBytes: number;
}

export default IGeometry;
