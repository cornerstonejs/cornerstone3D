import { Types } from "@cornerstonejs/core";

export type PointInShape =
  {
    value: number;
    index: number;
    pointIJK: Types.Point3;
    pointLPS: Types.Point3;
  };

export type StatisticValue =
  {
    name: string,
    value: number,
    unit: null | string
  };

export default interface ICalculator {
  calculate: (points: PointInShape[]) => StatisticValue[];
}
