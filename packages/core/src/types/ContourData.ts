import { ContourType } from '../enums';
import Point3 from './Point3';

type PublicContourSetData = Array<{
  points: Point3[];
  type: ContourType;
  color?: Point3;
}>;

type ContourData = {
  points: Point3[];
  type: ContourType;
  color?: Point3;
};

export type { PublicContourSetData, ContourData };
