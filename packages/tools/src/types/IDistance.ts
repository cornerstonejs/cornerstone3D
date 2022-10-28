/**
 * Distance in page, client, canvas and world
 * coordinates.
 */
type IDistance = {
  /** page distance */
  page: number;
  /** client distance */
  client: number;
  /** canvas distance */
  canvas: number;
  /** world distance */
  world: number;
};

export default IDistance;
