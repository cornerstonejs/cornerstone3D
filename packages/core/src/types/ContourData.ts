import type { ContourType } from '../enums';
import type Point3 from './Point3';

type PublicContourSetData = ContourSetData;

interface ContourSetData {
  id: string;
  data: ContourData[];
  frameOfReferenceUID: string;
  color?: Point3;
  segmentIndex?: number;
}

interface ContourData {
  points: Point3[];
  type: ContourType;
  color: Point3;
  segmentIndex: number;
}

export type { PublicContourSetData, ContourSetData, ContourData };
