import { Surface } from '../cache/classes/Surface';
import { GeometryType } from '../enums';
import { IContourSet } from './IContourSet';

// interface IGeometry can be array of IContourSet
interface IGeometry {
  id: string;
  type: GeometryType;
  data: IContourSet | Surface;
  sizeInBytes: number;
}

export default IGeometry;
