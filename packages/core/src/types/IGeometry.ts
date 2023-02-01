import { ContourSet } from '../cache/classes/ContourSet';
import { GeometryType } from '../enums';

// interface IGeometry can be array of IContourSet
interface IGeometry {
  id: string;
  type: GeometryType;
  data: ContourSet; // | Array<IClosedSurface> , etc
  sizeInBytes: number;
}

export default IGeometry;
