import { Types } from '@cornerstonejs/core';

type ITouchPoints = {
  /** page coordinates of the point */
  page: Types.Point2;
  /** client coordinates of the point */
  client: Types.Point2;
  /** canvas coordinates of the point */
  canvas: Types.Point2;
  /** world coordinates of the point */
  world: Types.Point3;

  /** Native Touch object properties which are JSON serializable*/
  touch: {
    identifier: string;
    radiusX: number;
    radiusY: number;
    force: number;
    rotationAngle: number;
  };
};

export default ITouchPoints;
