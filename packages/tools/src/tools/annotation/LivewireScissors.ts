import { Types } from '@cornerstonejs/core';
import { LivewireImage } from './LivewireImage';
import { BucketQueue } from './bucketQueue';

const TWO_THIRD_PI = 2 / (3 * Math.PI);

/**
 * @param grayscale - The input grayscale
 * @returns A gradient object
 */
function computeGradient(grayscale) {
  // Returns a 2D array of gradient magnitude values for grayscale. The values
  // are scaled between 0 and 1, and then flipped, so that it works as a cost
  // function.
  const height = grayscale.height;
  const width = grayscale.width;
  const gradient = new Array(height);

  let max = 0; // Maximum gradient found, for scaling purposes
  let x = 0;
  let y = 0;

  for (y = 0; y < height - 1; y++) {
    gradient[y] = new Array(width);

    for (x = 0; x < width - 1; x++) {
      gradient[y][x] = grayscale.gradMagnitude(x, y);
      max = Math.max(gradient[y][x], max);
    }

    gradient[y][width - 1] = gradient[y][height - 2];
  }

  gradient[height - 1] = new Array(width);
  for (let i = 0; i < gradient[0].length; i++) {
    gradient[height - 1][i] = gradient[height - 2][i];
  }

  // Flip and scale
  for (y = 0; y < height; y++) {
    for (x = 0; x < width; x++) {
      gradient[y][x] = 1 - gradient[y][x] / max;
    }
  }

  return gradient;
}

/**
 * @param grayscale - The input grayscale
 * @returns A laplace object
 */
function computeLaplace(grayscale): number[][] {
  const height = grayscale.height;
  const width = grayscale.width;
  const { data } = grayscale;

  // Returns a 2D array of Laplacian of Gaussian values
  const laplace = new Array(height);

  // Make the edges low cost here.
  laplace[0] = new Array(width);
  laplace[1] = new Array(width);
  laplace[0].fill(1);
  laplace[1].fill(1);

  for (let y = 2; y < height - 2; y++) {
    laplace[y] = new Array(width);
    // Pad left, ditto
    laplace[y][0] = 1;
    laplace[y][1] = 1;

    for (let x = 2; x < data[y].length - 2; x++) {
      // Threshold needed to get rid of clutter.
      laplace[y][x] = grayscale.laplace(x, y) > 0.33 ? 0 : 1;
    }

    // Pad right, ditto
    laplace[y][data[y].length - 2] = 1;
    laplace[y][data[y].length - 1] = 1;
  }

  laplace[height - 2] = new Array(width);
  laplace[height - 1] = new Array(width);
  laplace[height - 2].fill(1);
  laplace[height - 1].fill(1);

  return laplace;
}

/**
 * Compute the X gradient.
 *
 * @param {object} grayscale The values.
 * @returns {Array} The gradient.
 */
function computeGradX(grayscale) {
  // Returns 2D array of x-gradient values for grayscale
  const width = grayscale.width;
  const height = grayscale.height;
  const gradX = [];

  for (let y = 0; y < height; y++) {
    gradX[y] = [];

    for (let x = 0; x < width - 1; x++) {
      gradX[y][x] = grayscale.dx(x, y);
    }

    gradX[y][width - 1] = gradX[y][width - 2];
  }

  return gradX;
}

/**
 * Compute the Y gradient.
 *
 * @param {object} grayscale The values.
 * @returns {Array} The gradient.
 */
function computeGradY(grayscale) {
  // Returns 2D array of y-gradient values for grayscale
  const width = grayscale.width;
  const height = grayscale.height;
  const gradY = [];

  for (let y = 0; y < height - 1; y++) {
    gradY[y] = [];

    for (let x = 0; x < width; x++) {
      gradY[y][x] = grayscale.dy(x, y);
    }
  }

  gradY[height - 1] = [];

  for (let i = 0; i < width; i++) {
    gradY[height - 1][i] = gradY[height - 2][i];
  }

  return gradY;
}

/**
 * Compute the gradient unit vector.
 *
 * @param {Array} gradX The X gradient.
 * @param {Array} gradY The Y gradient.
 * @param {number} px The point X.
 * @param {number} py The point Y.
 * @param {object} out The result.
 */
function gradUnitVector(gradX, gradY, px, py, out: Types.Point2) {
  // Returns the gradient vector at (px,py), scaled to a magnitude of 1
  const ox = gradX[py][px];
  const oy = gradY[py][px];

  let gvm = Math.sqrt(ox * ox + oy * oy);
  gvm = Math.max(gvm, 1e-100); // To avoid possible divide-by-0 errors

  out[0] = ox / gvm;
  out[1] = oy / gvm;
}

/**
 * Compute the gradient direction.
 *
 * @param {Array} gradX The X gradient.
 * @param {Array} gradY The Y gradient.
 * @param {number} px The point X.
 * @param {number} py The point Y.
 * @param {number} qx The q X.
 * @param {number} qy The q Y.
 * @returns {number} The direction.
 */
function gradDirection(gradX, gradY, px, py, qx, qy) {
  const __dgpuv: Types.Point2 = [-1, -1];
  const __gdquv: Types.Point2 = [-1, -1];
  // Compute the gradiant direction, in radians, between to points
  gradUnitVector(gradX, gradY, px, py, __dgpuv);
  gradUnitVector(gradX, gradY, qx, qy, __gdquv);

  let dp = __dgpuv[1] * (qx - px) - __dgpuv[0] * (qy - py);
  let dq = __gdquv[1] * (qx - px) - __gdquv[0] * (qy - py);

  // Make sure dp is positive, to keep things consistent
  if (dp < 0) {
    dp = -dp;
    dq = -dq;
  }

  if (px !== qx && py !== qy) {
    // It's going diagonally between pixels
    dp *= Math.SQRT1_2;
    dq *= Math.SQRT1_2;
  }

  return TWO_THIRD_PI * (Math.acos(dp) + Math.acos(dq));
}

/**
 * Compute the sides.
 *
 * @param {number} dist The distance.
 * @param {Array} gradX The X gradient.
 * @param {Array} gradY The Y gradient.
 * @param {object} grayscale The value.
 * @returns {object} The sides.
 */
function computeSides(dist, gradX, gradY, grayscale) {
  // Returns 2 2D arrays, containing inside and outside grayscale values.
  // These grayscale values are the intensity just a little bit along the
  // gradient vector, in either direction, from the supplied point. These
  // values are used when using active-learning Intelligent Scissors

  const sides: {
    inside: number[][];
    outside: number[][];
  } = {
    inside: [],
    outside: [],
  };

  // Current gradient unit vector
  const guv: Types.Point2 = [-1, -1];

  for (let y = 0; y < gradX.length; y++) {
    sides.inside[y] = [];
    sides.outside[y] = [];

    for (let x = 0; x < gradX[y].length; x++) {
      gradUnitVector(gradX, gradY, x, y, guv);

      // (x, y) rotated 90 = (y, -x)

      let ix = Math.round(x + dist * guv[1]);
      let iy = Math.round(y - dist * guv[0]);
      let ox = Math.round(x - dist * guv[1]);
      let oy = Math.round(y + dist * guv[0]);

      ix = Math.max(Math.min(ix, gradX[y].length - 1), 0);
      ox = Math.max(Math.min(ox, gradX[y].length - 1), 0);
      iy = Math.max(Math.min(iy, gradX.length - 1), 0);
      oy = Math.max(Math.min(oy, gradX.length - 1), 0);

      sides.inside[y][x] = grayscale.data[iy][ix];
      sides.outside[y][x] = grayscale.data[oy][ox];
    }
  }

  return sides;
}

/**
 * Gaussian blur an input buffer.
 *
 * @param {Array} buffer The input buffer.
 * @param {Array} out The result.
 */
function gaussianBlur(buffer, out: number[]) {
  // Smooth values over to fill in gaps in the mapping
  out[0] = 0.4 * buffer[0] + 0.5 * buffer[1] + 0.1 * buffer[1];
  out[1] =
    0.25 * buffer[0] + 0.4 * buffer[1] + 0.25 * buffer[2] + 0.1 * buffer[3];

  for (let i = 2; i < buffer.length - 2; i++) {
    out[i] =
      0.05 * buffer[i - 2] +
      0.25 * buffer[i - 1] +
      0.4 * buffer[i] +
      0.25 * buffer[i + 1] +
      0.05 * buffer[i + 2];
  }

  const len = buffer.length;
  out[len - 2] =
    0.25 * buffer[len - 1] +
    0.4 * buffer[len - 2] +
    0.25 * buffer[len - 3] +
    0.1 * buffer[len - 4];
  out[len - 1] =
    0.4 * buffer[len - 1] + 0.5 * buffer[len - 2] + 0.1 * buffer[len - 3];
}

/**
 * Scissors
 *
 * Ref: Eric N. Mortensen, William A. Barrett, Interactive Segmentation with
 *   Intelligent Scissors, Graphical Models and Image Processing, Volume 60,
 *   Issue 5, September 1998, Pages 349-384, ISSN 1077-3169,
 *   DOI: 10.1006/gmip.1998.0480.
 *
 * {@link http://www.sciencedirect.com/science/article/B6WG4-45JB8WN-9/2/6fe59d8089fd1892c2bfb82283065579}
 *
 * Highly inspired from {@link http://code.google.com/p/livewire-javascript/}
 */
export class LivewireScissors {
  private width: number;
  private height: number;
  private searchGranBits: number;
  private searchGran: number;
  private pointsPerPost: number;

  private grayscale: any;
  private laplace: number[][];
  private gradient: number[][];
  private gradX: number[][];
  private gradY: number[][];

  private working: boolean;
  private trained: boolean;
  private trainingPoints: Types.Point2[];
  private edgeWidth: number;
  private trainingLength: number;
  private edgeGran: number;
  private inside: number[][];
  private outside: number[][];
  private edgeTraining: number[];
  private gradPointsNeeded: number;
  private gradGran: number;
  private gradTraining: number[];
  private insideGran: number;
  private insideTraining: number[];
  private outsideGran: number;
  private outsideTraining: number[];

  /** A* algorithm related data */
  private visited: boolean[][];
  private parents: Types.Point2[][];
  private cost: number[][];
  private priorityQueue: BucketQueue<Types.Point2>;

  constructor() {
    this.width = -1;
    this.height = -1;

    this.searchGranBits = 8; // Bits of resolution for BucketQueue.
    this.searchGran = 1 << this.searchGranBits; //bits.
    this.pointsPerPost = 500;

    // Precomputed image data. All in ranges 0 >= x >= 1 and
    //   all inverted (1 - x).
    this.grayscale = null; // Grayscale of image
    this.laplace = null; // Laplace zero-crossings (either 0 or 1).
    this.gradient = null; // Gradient magnitudes.
    this.gradX = null; // X-differences.
    this.gradY = null; // Y-differences.

    // Matrix mapping point => parent along shortest-path to root.
    this.parents = null;

    // Currently computing shortest path?
    this.working = false;

    // Begin Training:
    this.trained = false;
    this.trainingPoints = null;

    this.edgeWidth = 2;
    this.trainingLength = 32;

    this.edgeGran = 256;
    this.edgeTraining = null;

    this.gradPointsNeeded = 32;
    this.gradGran = 1024;
    this.gradTraining = null;

    this.insideGran = 256;
    this.insideTraining = null;

    this.outsideGran = 256;
    this.outsideTraining = null;
  }
  // End Training

  // Begin training methods //
  private _getTrainingIdx(granularity, value) {
    return Math.round((granularity - 1) * value);
  }

  private _getTrainedEdge(edge) {
    return this.edgeTraining[this._getTrainingIdx(this.edgeGran, edge)];
  }

  private _getTrainedGrad(grad) {
    return this.gradTraining[this._getTrainingIdx(this.gradGran, grad)];
  }

  private _getTrainedInside(inside) {
    return this.insideTraining[this._getTrainingIdx(this.insideGran, inside)];
  }

  private _getTrainedOutside(outside) {
    return this.outsideTraining[
      this._getTrainingIdx(this.outsideGran, outside)
    ];
  }
  // End training methods //

  /**
   * Sets working flag
   */
  public setWorking(working) {
    this.working = working;
  }

  public setDimensions(width, height) {
    this.width = width;
    this.height = height;
  }

  public setData(data) {
    if (this.width === -1 || this.height === -1) {
      // The width and height should have already been set
      throw new Error('Dimensions have not been set.');
    }

    this.grayscale = new LivewireImage(data, this.width, this.height);
    this.laplace = computeLaplace(this.grayscale);
    this.gradient = computeGradient(this.grayscale);
    this.gradX = computeGradX(this.grayscale);
    this.gradY = computeGradY(this.grayscale);

    const sides = computeSides(
      this.edgeWidth,
      this.gradX,
      this.gradY,
      this.grayscale
    );
    this.inside = sides.inside;
    this.outside = sides.outside;
    this.edgeTraining = [];
    this.gradTraining = [];
    this.insideTraining = [];
    this.outsideTraining = [];
  }

  /**
   * Grab the last handful of points for training
   */
  public findTrainingPoints(point: Types.Point2): Types.Point2[] {
    const points = [];

    if (this.parents !== null) {
      for (let i = 0; i < this.trainingLength && point; i++) {
        points.push(point);
        point = this.parents[point[0]][point[1]];
      }
    }

    return points;
  }

  /**
   * Reset training state
   */
  public resetTraining() {
    this.trained = false;
  }

  /**
   * Compute training weights and measures
   */
  public doTraining(point: Types.Point2) {
    this.trainingPoints = this.findTrainingPoints(point);

    if (this.trainingPoints.length < 8) {
      return; // Not enough points, I think. It might crash if length = 0.
    }

    const buffer = [];

    this._calculateTraining(
      buffer,
      this.edgeGran,
      this.grayscale,
      this.edgeTraining
    );

    this._calculateTraining(
      buffer,
      this.gradGran,
      this.gradient,
      this.gradTraining
    );

    this._calculateTraining(
      buffer,
      this.insideGran,
      this.inside,
      this.insideTraining
    );

    this._calculateTraining(
      buffer,
      this.outsideGran,
      this.outside,
      this.outsideTraining
    );

    if (this.trainingPoints.length < this.gradPointsNeeded) {
      // If we have two few training points, the gradient weight map might not
      // be smooth enough, so average with normal weights.
      this._addInStaticGrad(this.trainingPoints.length, this.gradPointsNeeded);
    }

    this.trained = true;
  }

  private _calculateTraining(buffer, granularity, input, output) {
    let i = 0;
    // Build a map of raw-weights to trained-weights by favoring input values
    buffer.length = granularity;
    for (i = 0; i < granularity; i++) {
      buffer[i] = 0;
    }

    let maxVal = 1;
    for (i = 0; i < this.trainingPoints.length; i++) {
      const point = this.trainingPoints[i];
      const idx = this._getTrainingIdx(granularity, input[point[1]][point[0]]);
      buffer[idx] += 1;

      maxVal = Math.max(maxVal, buffer[idx]);
    }

    // Invert and scale.
    for (i = 0; i < granularity; i++) {
      buffer[i] = 1 - buffer[i] / maxVal;
    }

    // Blur it, as suggested. Gets rid of static.
    gaussianBlur(buffer, output);
  }

  private _addInStaticGrad(have, need) {
    // Average gradient raw-weights to trained-weights map with standard weight
    // map so that we don't end up with something to spiky
    for (let i = 0; i < this.gradGran; i++) {
      this.gradTraining[i] = Math.min(
        this.gradTraining[i],
        1 - (i * (need - have)) / (need * this.gradGran)
      );
    }
  }

  private _gradDirection(px, py, qx, qy) {
    return gradDirection(this.gradX, this.gradY, px, py, qx, qy);
  }

  /**
   * Return a weighted distance between two points used by the A* algorithm
   */
  private _getDistance(pointA: Types.Point2, pointB: Types.Point2) {
    const [aX, aY] = pointA;
    const [bX, bY] = pointB;

    // Weighted distance function
    let grad = this.gradient[bY][bX];

    if (aX === bX || aY === bY) {
      // The distance is Euclidean-ish; non-diagonal edges should be shorter
      grad *= Math.SQRT1_2;
    }

    const lap = this.laplace[bY][bX];
    const dir = this._gradDirection(aX, aY, bX, bY);

    if (this.trained) {
      const gradT = this._getTrainedGrad(grad);
      const edgeT = this._getTrainedEdge(this.grayscale.data[aY][aX]);
      const insideT = this._getTrainedInside(this.inside[aY][aX]);
      const outsideT = this._getTrainedOutside(this.outside[aY][aX]);

      return 0.3 * gradT + 0.3 * lap + 0.1 * (dir + edgeT + insideT + outsideT);
    } else {
      // Normal weights
      return 0.43 * grad + 0.43 * lap + 0.11 * dir;
    }
  }

  /**
   * Get up to 8 neighbors points
   * @param point - Reference point
   * @returns Up to eight neighbor points
   */
  private _getNeighborPoints(point: Types.Point2): Types.Point2[] {
    const list: Types.Point2[] = [];

    const sx = Math.max(point[0] - 1, 0);
    const sy = Math.max(point[1] - 1, 0);
    const ex = Math.min(point[0] + 1, this.grayscale.width - 1);
    const ey = Math.min(point[1] + 1, this.grayscale.height - 1);

    let idx = 0;
    for (let y = sy; y <= ey; y++) {
      for (let x = sx; x <= ex; x++) {
        if (x !== point[0] || y !== point[1]) {
          list[idx++] = [x, y];
        }
      }
    }

    return list;
  }

  private _costFunction = (point: Types.Point2): number => {
    return Math.round(this.searchGran * this.cost[point[1]][point[0]]);
  };

  private _arePointsEqual = (
    pointA: Types.Point2,
    pointB: Types.Point2
  ): boolean => {
    return (
      pointA === pointB ||
      (pointA && pointB && pointA[0] === pointB[0] && pointA[1] === pointB[1])
    );
  };

  public setPoint(sp: Types.Point2): void {
    this.setWorking(true);
    this.visited = new Array(this.height);
    this.parents = new Array(this.height);
    this.cost = new Array(this.height);

    for (let y = 0; y < this.height; y++) {
      this.visited[y] = new Array(this.width);
      this.visited[y].fill(false);

      this.parents[y] = new Array(this.width);

      this.cost[y] = new Array(this.width);
      this.cost[y].fill(Number.MAX_VALUE);
    }

    this.cost[sp[1]][sp[0]] = 0;

    this.priorityQueue = new BucketQueue<Types.Point2>({
      numBits: this.searchGranBits,
      getPriority: this._costFunction,
      areEqual: this._arePointsEqual,
    });

    this.priorityQueue.push(sp);
  }

  /**
   * Runs a variation of Dijkstra algorithm to update the cost of
   * up to 500 (pointsPerPost) nodes
   */
  public doWork(): Types.Point2[][] {
    if (!this.working) {
      return;
    }

    let numPoints = 0;
    const parentPointsPairs: Types.Point2[][] = [];

    while (!this.priorityQueue.isEmpty() && numPoints < this.pointsPerPost) {
      const point = this.priorityQueue.pop();
      const [pX, pY] = point;
      const neighborsPoints = this._getNeighborPoints(point);

      parentPointsPairs.push([point, this.parents[pY][pX]]);

      this.visited[pY][pX] = true;

      // Update the cost of all neighbors that have a cost higher than the new one
      for (let i = 0, len = neighborsPoints.length; i < len; i++) {
        const neighborPoint = neighborsPoints[i];
        const [neighborX, neighborY] = neighborPoint;
        const dist = this._getDistance(point, neighborPoint);
        const neighborCost = this.cost[pY][pX] + dist;

        if (neighborCost < this.cost[neighborY][neighborX]) {
          if (this.cost[neighborY][neighborX] !== Number.MAX_VALUE) {
            // Already in priority queue. Must be remove so it can be re-added.
            this.priorityQueue.remove(neighborPoint);
          }

          this.cost[neighborY][neighborX] = neighborCost;
          this.parents[neighborY][neighborX] = point;
          this.priorityQueue.push(neighborPoint);
        }
      }

      numPoints++;
    }

    return parentPointsPairs;
  }
}
