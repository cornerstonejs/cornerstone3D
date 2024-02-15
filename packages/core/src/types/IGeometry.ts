import { GeometryType } from '../enums';
import { IContourSet } from './IContourSet';
import { ISurface } from './ISurface';

// interface IGeometry can be array of IContourSet
interface IGeometry {
  id: string;
  type: GeometryType;
  data: IContourSet | ISurface;
  sizeInBytes: number;
}

export default IGeometry;
