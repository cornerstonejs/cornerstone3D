import type { GeometryType } from '../enums';
import type { IContourSet } from './IContourSet';

// interface IGeometry can be array of IContourSet
interface IGeometry {
  id: string;
  type: GeometryType;
  data: IContourSet; // | Array<IClosedSurface> , etc
  sizeInBytes: number;
}

export default IGeometry;
