import { ContourSet } from '../cache/classes/ContourSet';
import { Surface } from '../cache/classes/Surface';
import { GeometryType } from '../enums';

// interface IGeometry can be array of IContourSet
interface IGeometry {
  id: string;
  type: GeometryType;
  data: ContourSet | Surface;
  sizeInBytes: number;
}

export default IGeometry;
