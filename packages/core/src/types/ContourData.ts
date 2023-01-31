import { ContourType } from '../enums';
import Point3 from './Point3';

type PublicContourSetData = ContourSetData;

type ContourSetData = {
  id: string;
  data: ContourData[];
  frameOfReferenceUID: string;
  color?: Point3;
};

type ContourData = {
  points: Point3[];
  type: ContourType;
  color?: Point3;
};

export type { PublicContourSetData, ContourSetData, ContourData };
