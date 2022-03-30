import { Types } from '@cornerstonejs/core';

/**
 * Points in page, client, canvas and world
 * coordinates.
 */
type IPoints = {
  /** page coordinates of the point */
  page: Types.Point2;
  /** client coordinates of the point */
  client: Types.Point2;
  /** canvas coordinates of the point */
  canvas: Types.Point2;
  /** world coordinates of the point */
  world: Types.Point3;
};

export default IPoints;
