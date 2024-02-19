import { Types, utilities } from '@cornerstonejs/core';

import { BucketQueue } from '../BucketQueue';

const { isEqual } = utilities;
const MAX_UINT32 = 4294967295;
const TWO_THIRD_PI = 2 / (3 * Math.PI);

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
 * Implementation based on MIT licensed code at:
 * {@link http://code.google.com/p/livewire-javascript/}
 */
export class LivewireScissors {
  private searchGranularityBits: number;
  private searchGranularity: number;

  /** Width of the image */
  public readonly width: number;

  /** Height of the image */
  public readonly height: number;

  /** Grayscale image */
  private grayscalePixelData: Types.PixelDataTypedArray;

  // Laplace zero-crossings (either 0 or 1).
  private laplace: Float32Array;

  /** Gradient vector magnitude for each pixel */
  private gradMagnitude: Float32Array;

  /** Gradient of each pixel in the x-direction */
  private gradXNew: Float32Array;

  /** Gradient of each pixel in the y-direction */
  private gradYNew: Float32Array;

  /** Dijkstra - start point */
  private startPoint: Types.Point2;

  /** Dijkstra - store the state of a pixel (visited/unvisited) */
  private visited: boolean[];

  /** Dijkstra - map a point to its parent along the shortest path to root (start point) */
  private parents: Uint32Array;

  /** Dijkstra - store the cost to go from the start point to each node */
  private costs: Float32Array;

  /** Dijkstra - BucketQueue to sort items by priority */
  private priorityQueueNew: BucketQueue<number>;

  constructor(
    grayscalePixelData: Types.PixelDataTypedArray,
    width: number,
    height: number
  ) {
    const numPixels = grayscalePixelData.length;

    this.searchGranularityBits = 8; // Bits of resolution for BucketQueue.
    this.searchGranularity = 1 << this.searchGranularityBits; //bits.

    this.width = width;
    this.height = height;

    this.grayscalePixelData = grayscalePixelData;
    this.laplace = null;
    this.gradXNew = null;
    this.gradYNew = null;

    this.laplace = this._computeLaplace();
    this.gradMagnitude = this._computeGradient();
    this.gradXNew = this._computeGradientX();
    this.gradYNew = this._computeGradientY();

    this.visited = new Array(numPixels);
    this.parents = new Uint32Array(numPixels);
    this.costs = new Float32Array(numPixels);
  }

  public startSearch(startPoint: Types.Point2): void {
    const startPointIndex = this._getPointIndex(startPoint[1], startPoint[0]);

    this.startPoint = null;
    this.visited.fill(false);
    this.parents.fill(MAX_UINT32);
    this.costs.fill(Infinity);
    this.priorityQueueNew = new BucketQueue<number>({
      numBits: this.searchGranularityBits,
      getPriority: this._getPointCost,
    });

    this.startPoint = startPoint;
    this.costs[startPointIndex] = 0;
    this.priorityQueueNew.push(startPointIndex);
  }

  /**
   * Finds a nearby point with a minimum cost nearby
   *
   * @param testPoint - to look nearby
   * @param delta - how long a distance to look
   * @returns A point having the minimum weighted distance from the testPoint
   */
  public findMinNearby(testPoint: Types.Point2, delta = 2) {
    const [x, y] = testPoint;
    const { costs } = this;

    const xRange = [
      Math.max(0, x - delta),
      Math.min(x + delta + 1, this.width),
    ];
    const yRange = [
      Math.max(0, y - delta),
      Math.min(y + delta + 1, this.height),
    ];
    let minValue = costs[this._getPointIndex(y, x)] * 0.8;

    let minPoint = testPoint;
    for (let xTest = xRange[0]; xTest < xRange[1]; xTest++) {
      for (let yTest = yRange[0]; yTest < yRange[1]; yTest++) {
        // Cost values are 0...1, with 1 being a poor choice for the
        // livewire fitting - thus, we want to minimize our value, so the
        // distance cost should be low for the center point.
        const distanceCost =
          1 -
          (Math.abs(xTest - testPoint[0]) + Math.abs(yTest - testPoint[1])) /
            delta /
            2;
        const weightCost = costs[this._getPointIndex(yTest, xTest)];

        const weight = weightCost * 0.8 + distanceCost * 0.2;
        if (weight < minValue) {
          minPoint = [xTest, yTest];
          minValue = weight;
        }
      }
    }
    return minPoint;
  }

  /**
   * Runs Dijsktra until it finds a path from the start point to the target
   * point. Once it reaches the target point all the state is preserved in order
   * to save processing time the next time the method is called for a new target
   * point. The search is restarted whenever `startSearch` is called.
   * @param targetPoint - Target point
   * @returns An array with all points for the shortest path found that goes
   * from startPoint to targetPoint.
   */
  public findPathToPoint(targetPoint: Types.Point2): Types.Point2[] {
    if (!this.startPoint) {
      throw new Error('There is no search in progress');
    }

    const {
      startPoint,
      _getPointIndex: index,
      _getPointCoordinate: coord,
    } = this;
    const startPointIndex = index(startPoint[1], startPoint[0]);
    const targetPointIndex = index(targetPoint[1], targetPoint[0]);
    const {
      visited: visited,
      parents: parents,
      costs: cost,
      priorityQueueNew: priorityQueue,
    } = this;

    if (targetPointIndex === startPointIndex) {
      return [];
    }

    // Stop searching until there are no more items in the queue or it has
    // reached the target point. In case it reaches the target all the remaining
    // items will stay in the queue then once the user moves the mouse to a new
    // location the search can continue from where it left off.
    while (
      !priorityQueue.isEmpty() &&
      parents[targetPointIndex] === MAX_UINT32
    ) {
      const pointIndex = priorityQueue.pop();

      if (visited[pointIndex]) {
        continue;
      }

      const point = coord(pointIndex);
      const neighborsPoints = this._getNeighborPoints(point);

      visited[pointIndex] = true;

      // Update the cost of all neighbors that have higher costs
      for (let i = 0, len = neighborsPoints.length; i < len; i++) {
        const neighborPoint = neighborsPoints[i];
        const neighborPointIndex = index(neighborPoint[1], neighborPoint[0]);
        const dist = this._getWeightedDistance(point, neighborPoint);
        const neighborCost = cost[pointIndex] + dist;

        if (neighborCost < cost[neighborPointIndex]) {
          if (cost[neighborPointIndex] !== Infinity) {
            // The item needs to be removed from the priority queue and
            // re-added in order to be moved to the right bucket.
            priorityQueue.remove(neighborPointIndex);
          }

          cost[neighborPointIndex] = neighborCost;
          parents[neighborPointIndex] = pointIndex;
          priorityQueue.push(neighborPointIndex);
        }
      }
    }

    const pathPoints = [];
    let pathPointIndex = targetPointIndex;

    while (pathPointIndex !== MAX_UINT32) {
      pathPoints.push(coord(pathPointIndex));
      pathPointIndex = parents[pathPointIndex];
    }

    return pathPoints.reverse();
  }

  /**
   * Convert a point coordinate (x,y) into a point index
   * @param index - Point index
   * @returns Point coordinate (x,y)
   */
  private _getPointIndex = (row: number, col: number) => {
    const { width } = this;
    return row * width + col;
  };

  /**
   * Convert a point index into a point coordinate (x,y)
   * @param index - Point index
   * @returns Point coordinate (x,y)
   */
  private _getPointCoordinate = (index: number): Types.Point2 => {
    const x = index % this.width;
    const y = Math.floor(index / this.width);

    return [x, y];
  };

  /**
   * Calculate the delta X between a given point and its neighbor at the right
   * @param x - Point x-coordinate
   * @param y - Point y-coordinate
   * @returns Delta Y between the given point and its neighbor at the right
   */
  private _getDeltaX(x: number, y: number) {
    const { grayscalePixelData: data, width } = this;
    let index = this._getPointIndex(y, x);

    // If it is at the end, back up one
    if (x + 1 === width) {
      index--;
    }

    return data[index + 1] - data[index];
  }

  /**
   * Calculate the delta Y between a given point and its neighbor at the bottom
   * @param x - Point x-coordinate
   * @param y - Point y-coordinate
   * @returns Delta Y between the given point and its neighbor at the bottom
   */
  private _getDeltaY(x: number, y: number) {
    const { grayscalePixelData: data, width, height } = this;
    let index = this._getPointIndex(y, x);

    // If it is at the end, back up one
    if (y + 1 === height) {
      index -= width;
    }

    return data[index] - data[index + width];
  }

  private _getGradientMagnitude(x: number, y: number): number {
    const dx = this._getDeltaX(x, y);
    const dy = this._getDeltaY(x, y);

    return Math.sqrt(dx * dx + dy * dy);
  }

  /**
   *  Calculate the Laplacian of Gaussian (LoG) value for a given pixel
   *
   *     Kernel Indexes           Laplacian of Gaussian Kernel
   *   __  __  02  __  __              0   0   1   0   0
   *   __  11  12  13  __              0   1   2   1   0
   *   20  21  22  23  24              1   2 -16   2   1
   *   __  31  32  33  __              0   1   2   1   0
   *   __  __  42  __  __              0   0   1   0   0
   */
  private _getLaplace(x: number, y: number): number {
    const { grayscalePixelData: data, _getPointIndex: index } = this;

    // Points related to the kernel indexes
    const p02 = data[index(y - 2, x)];
    const p11 = data[index(y - 1, x - 1)];
    const p12 = data[index(y - 1, x)];
    const p13 = data[index(y - 1, x + 1)];
    const p20 = data[index(y, x - 2)];
    const p21 = data[index(y, x - 1)];
    const p22 = data[index(y, x)];
    const p23 = data[index(y, x + 1)];
    const p24 = data[index(y, x + 2)];
    const p31 = data[index(y + 1, x - 1)];
    const p32 = data[index(y + 1, x)];
    const p33 = data[index(y + 1, x + 1)];
    const p42 = data[index(y + 2, x)];

    // Laplacian of Gaussian
    let lap = p02;
    lap += p11 + 2 * p12 + p13;
    lap += p20 + 2 * p21 - 16 * p22 + 2 * p23 + p24;
    lap += p31 + 2 * p32 + p33;
    lap += p42;

    return lap;
  }

  /**
   * Returns a 2D array of gradient magnitude values for grayscale. The values
   * are scaled between 0 and 1, and then flipped, so that it works as a cost
   * function.
   * @returns A gradient object
   */
  private _computeGradient(): Float32Array {
    const { width, height } = this;
    const gradient = new Float32Array(width * height);

    let pixelIndex = 0;
    let max = 0;
    let x = 0;
    let y = 0;

    for (y = 0; y < height - 1; y++) {
      for (x = 0; x < width - 1; x++) {
        gradient[pixelIndex] = this._getGradientMagnitude(x, y);
        max = Math.max(gradient[pixelIndex], max);
        pixelIndex++;
      }

      // Make the last column the same as the previous one because there is
      // no way to calculate `dx` since x+1 gets out of bounds
      gradient[pixelIndex] = gradient[pixelIndex - 1];
      pixelIndex++;
    }

    // Make the last row the same as the previous one because there is
    // no way to calculate `dy` since y+1 gets out of bounds
    for (let len = gradient.length; pixelIndex < len; pixelIndex++) {
      gradient[pixelIndex] = gradient[pixelIndex - width];
    }

    // Flip and scale
    for (let i = 0, len = gradient.length; i < len; i++) {
      gradient[i] = 1 - gradient[i] / max;
    }

    return gradient;
  }

  /**
   * Returns a 2D array of Laplacian of Gaussian values
   *
   * @param grayscale - The input grayscale
   * @returns A laplace object
   */
  private _computeLaplace(): Float32Array {
    const { width, height, _getPointIndex: index } = this;
    const laplace = new Float32Array(width * height);

    // Make the first two rows low cost
    laplace.fill(1, 0, index(2, 0));

    for (let y = 2; y < height - 2; y++) {
      // Make the first two columns low cost
      laplace[index(y, 0)] = 1;
      laplace[index(y, 1)] = 1;

      for (let x = 2; x < width - 2; x++) {
        // Threshold needed to get rid of clutter.
        laplace[index(y, x)] = this._getLaplace(x, y) > 0.33 ? 0 : 1;
      }

      // Make the last two columns low cost
      laplace[index(y, width - 2)] = 1;
      laplace[index(y, width - 1)] = 1;
    }

    // Make the last two rows low cost
    laplace.fill(1, index(height - 2, 0));

    return laplace;
  }

  /**
   * Returns 2D array of x-gradient values for grayscale
   *
   * @param grayscale - Grayscale pixel data
   * @returns 2D x-gradient array
   */
  private _computeGradientX(): Float32Array {
    const { width, height } = this;
    const gradX = new Float32Array(width * height);
    let pixelIndex = 0;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        gradX[pixelIndex++] = this._getDeltaX(x, y);
      }
    }

    return gradX;
  }

  /**
   * Compute the Y gradient.
   *
   * @param grayscale - Grayscale pixel data
   * @returns 2D array of y-gradient values for grayscale
   */
  private _computeGradientY(): Float32Array {
    const { width, height } = this;
    const gradY = new Float32Array(width * height);
    let pixelIndex = 0;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        gradY[pixelIndex++] = this._getDeltaY(x, y);
      }
    }

    return gradY;
  }

  /**
   * Compute the gradient unit vector.
   * @param px - Point x-coordinate
   * @param py - Point y-coordinate
   * @returns Gradient vector at (px, py), scaled to a magnitude of 1
   */
  private _getGradientUnitVector(px: number, py: number) {
    const { gradXNew, gradYNew, _getPointIndex: index } = this;

    const pointGradX = gradXNew[index(py, px)];
    const pointGradY = gradYNew[index(py, px)];
    let gradVecLen = Math.sqrt(
      pointGradX * pointGradX + pointGradY * pointGradY
    );

    // To avoid possible divide-by-0 errors
    gradVecLen = Math.max(gradVecLen, 1e-100);

    return [pointGradX / gradVecLen, pointGradY / gradVecLen];
  }

  /**
   * Compute the gradient direction, in radians, between two points
   *
   * @param px - Point `p` x-coordinate of point p.
   * @param py - Point `p` y-coordinate of point p.
   * @param qx - Point `q` x-coordinate of point q.
   * @param qy - Point `q` y-coordinate of point q.
   * @returns Gradient direction
   */
  private _getGradientDirection(
    px: number,
    py: number,
    qx: number,
    qy: number
  ): number {
    const dgpUnitVec = this._getGradientUnitVector(px, py);
    const gdqUnitVec = this._getGradientUnitVector(qx, qy);

    let dp = dgpUnitVec[1] * (qx - px) - dgpUnitVec[0] * (qy - py);
    let dq = gdqUnitVec[1] * (qx - px) - gdqUnitVec[0] * (qy - py);

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
    dq = Math.min(Math.max(dq, -1), 1);

    const direction =
      TWO_THIRD_PI * (Math.acos(Math.min(dp, 1)) + Math.acos(dq));
    if (isNaN(direction) || !isFinite(direction)) {
      console.warn('Found non-direction:', px, py, qx, qy, dp, dq, direction);
      return 1;
    }
    return direction;
  }

  /** Gets the cost to go from A to B */
  public getCost(pointA, pointB): number {
    return this._getWeightedDistance(pointA, pointB);
  }

  /**
   * Return a weighted distance between two points
   */
  private _getWeightedDistance(pointA: Types.Point2, pointB: Types.Point2) {
    const { _getPointIndex: index, width, height } = this;
    const [aX, aY] = pointA;
    const [bX, bY] = pointB;
    // Assign a cost of 1 to any points outside the image, prevents using invalid
    // points
    if (bX < 0 || bX >= width || bY < 0 || bY >= height) {
      return 1;
    }
    // Use a cost of 0 if the point was outside and is now going inside
    if (aX < 0 || aY < 0 || aX >= width || aY >= height) {
      return 0;
    }

    const bIndex = index(bY, bX);

    // Weighted distance function
    let gradient = this.gradMagnitude[bIndex];

    if (aX === bX || aY === bY) {
      // The distance is Euclidean-ish; non-diagonal edges should be shorter
      gradient *= Math.SQRT1_2;
    }

    const laplace = this.laplace[bIndex];
    const direction = this._getGradientDirection(aX, aY, bX, bY);

    return 0.43 * gradient + 0.43 * laplace + 0.11 * direction;
  }

  /**
   * Get up to 8 neighbors points
   * @param point - Reference point
   * @returns Up to eight neighbor points
   */
  private _getNeighborPoints(point: Types.Point2): Types.Point2[] {
    const { width, height } = this;
    const list: Types.Point2[] = [];

    const sx = Math.max(point[0] - 1, 0);
    const sy = Math.max(point[1] - 1, 0);
    const ex = Math.min(point[0] + 1, width - 1);
    const ey = Math.min(point[1] + 1, height - 1);

    for (let y = sy; y <= ey; y++) {
      for (let x = sx; x <= ex; x++) {
        if (x !== point[0] || y !== point[1]) {
          list.push([x, y]);
        }
      }
    }

    return list;
  }

  private _getPointCost = (pointIndex: number): number => {
    return Math.round(this.searchGranularity * this.costs[pointIndex]);
  };

  /**
   * Create a livewire scissor instance from RAW pixel data
   * @param pixelData - Raw pixel data
   * @param width - Width of the image
   * @param height - Height of the image
   * @param voiRange - VOI Range
   * @returns A LivewireScissors instance
   */
  public static createInstanceFromRawPixelData(
    pixelData: Float32Array,
    width: number,
    height: number,
    voiRange: Types.VOIRange
  ) {
    const numPixels = pixelData.length;
    const grayscalePixelData = new Float32Array(numPixels);
    const { lower: minPixelValue, upper: maxPixelValue } = voiRange;
    const pixelRange = maxPixelValue - minPixelValue;

    for (let i = 0, len = pixelData.length; i < len; i++) {
      // Grayscale values must be between 0 and 1
      grayscalePixelData[i] = Math.max(
        0,
        Math.min(1, (pixelData[i] - minPixelValue) / pixelRange)
      );
    }

    return new LivewireScissors(grayscalePixelData, width, height);
  }
}
