/**
 * Interface representing information about a rotation matrix
 * @interface
 */
interface RotationMatrixInformation {
  /** Whether the matrix represents a standard basis (identity matrix) */
  isStandard: boolean;
  /** The rotation matrix as a flat array of 9 numbers [m11, m12, m13, m21, m22, m23, m31, m32, m33] */
  rotationMatrix: number[];
}

/**
 * Helper function to validate a 3x3 matrix input
 * @param matrix - The input matrix as a flat array
 * @throws {Error} If matrix is not a valid 3x3 matrix (array of 9 numbers)
 */
function validate3x3Matrix(matrix: number[]): void {
  if (!Array.isArray(matrix) || matrix.length !== 9) {
    throw new Error('Matrix must be an array of 9 numbers');
  }
  if (!matrix.every((n) => typeof n === 'number' && !isNaN(n))) {
    throw new Error('Matrix must contain only valid numbers');
  }
}

/**
 * Calculates the inverse of a 3x3 matrix
 * @param matrix - The input matrix as a flat array of 9 numbers [m11, m12, m13, m21, m22, m23, m31, m32, m33]
 * @returns The inverse matrix as a flat array of 9 numbers
 * @throws {Error} If matrix is not invertible or invalid
 */
export function inverse3x3Matrix(matrix: number[]): number[] {
  validate3x3Matrix(matrix);

  // First, convert the flat array into a 2D matrix for easier handling
  const mat = [
    [matrix[0], matrix[1], matrix[2]],
    [matrix[3], matrix[4], matrix[5]],
    [matrix[6], matrix[7], matrix[8]],
  ];

  // Calculate the determinant
  const determinant =
    mat[0][0] * (mat[1][1] * mat[2][2] - mat[1][2] * mat[2][1]) -
    mat[0][1] * (mat[1][0] * mat[2][2] - mat[1][2] * mat[2][0]) +
    mat[0][2] * (mat[1][0] * mat[2][1] - mat[1][1] * mat[2][0]);

  // Check if matrix is invertible
  if (Math.abs(determinant) < 1e-10) {
    throw new Error('Matrix is not invertible (determinant is zero)');
  }

  // Calculate the adjugate matrix
  const adjugate = [
    // First row
    [
      mat[1][1] * mat[2][2] - mat[1][2] * mat[2][1],
      -(mat[0][1] * mat[2][2] - mat[0][2] * mat[2][1]),
      mat[0][1] * mat[1][2] - mat[0][2] * mat[1][1],
    ],
    // Second row
    [
      -(mat[1][0] * mat[2][2] - mat[1][2] * mat[2][0]),
      mat[0][0] * mat[2][2] - mat[0][2] * mat[2][0],
      -(mat[0][0] * mat[1][2] - mat[0][2] * mat[1][0]),
    ],
    // Third row
    [
      mat[1][0] * mat[2][1] - mat[1][1] * mat[2][0],
      -(mat[0][0] * mat[2][1] - mat[0][1] * mat[2][0]),
      mat[0][0] * mat[1][1] - mat[0][1] * mat[1][0],
    ],
  ];

  // Calculate inverse by dividing adjugate by determinant
  const inverse = [];
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      inverse.push(adjugate[i][j] / determinant);
    }
  }

  return inverse;
}

/**
 * Normalizes a 3D vector
 * @param v - Array of 3 numbers representing a vector
 * @returns Normalized vector
 */
function normalizeVector(v: number[]): number[] {
  const magnitude = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
  return v.map((component) => component / magnitude);
}

/**
 * Checks if a set of direction vectors forms a standard basis
 * @param directions - Array of 9 numbers representing three 3D vectors [x1,x2,x3,y1,y2,y3,z1,z2,z3]
 * @returns Object containing whether the basis is standard and the corresponding rotation matrix
 * @throws {Error} If directions array is invalid
 */
export function checkStandardBasis(
  directions: number[]
): RotationMatrixInformation {
  validate3x3Matrix(directions);

  // Extract and normalize vectors
  const xVector = directions.slice(0, 3);
  const yVector = directions.slice(3, 6);
  const zVector = directions.slice(6, 9);

  const normalizedX = normalizeVector(xVector);
  const normalizedY = normalizeVector(yVector);
  const normalizedZ = normalizeVector(zVector);

  // Standard basis vectors for comparison
  const standardBasis = {
    x: [1, 0, 0],
    y: [0, 1, 0],
    z: [0, 0, 1],
  };

  // Check if vectors match standard basis (allowing for small numerical errors)
  const epsilon = 1e-10;
  const isStandard =
    normalizedX.every(
      (val, i) => Math.abs(val - standardBasis.x[i]) < epsilon
    ) &&
    normalizedY.every(
      (val, i) => Math.abs(val - standardBasis.y[i]) < epsilon
    ) &&
    normalizedZ.every((val, i) => Math.abs(val - standardBasis.z[i]) < epsilon);

  const rotationMatrix = isStandard
    ? [...standardBasis.x, ...standardBasis.y, ...standardBasis.z]
    : inverse3x3Matrix([...normalizedX, ...normalizedY, ...normalizedZ]);

  return {
    isStandard,
    rotationMatrix,
  };
}

/**
 * Rotates a single point around a given origin using a rotation matrix
 * @param point - Array of 3 numbers representing a point [x,y,z]
 * @param origin - Array of 3 numbers representing the rotation origin [x,y,z]
 * @param rotationMatrix - Array of 9 numbers representing the rotation matrix
 * @returns Rotated point as an array of 3 numbers
 */
function rotatePoint(
  point: number[],
  origin: number[],
  rotationMatrix: number[]
): number[] {
  const x = point[0] - origin[0];
  const y = point[1] - origin[1];
  const z = point[2] - origin[2];
  return [
    rotationMatrix[0] * x +
      rotationMatrix[1] * y +
      rotationMatrix[2] * z +
      origin[0],
    rotationMatrix[3] * x +
      rotationMatrix[4] * y +
      rotationMatrix[5] * z +
      origin[1],
    rotationMatrix[6] * x +
      rotationMatrix[7] * y +
      rotationMatrix[8] * z +
      origin[2],
  ];
}

/**
 * Rotates an array of points around a given origin using a rotation matrix
 * @param rotationMatrix - Array of 9 numbers representing the rotation matrix
 * @param origin - Array of 3 numbers representing the rotation origin [x,y,z]
 * @param points - Array of points in format [x1,y1,z1,x2,y2,z2,...]
 * @returns Array of rotated points in the same format as input
 * @throws {Error} If any input array is invalid
 */
export function rotatePoints(
  rotationMatrix: number[],
  origin: number[],
  points: number[]
): number[] {
  const rotatedPoints: number[] = [];
  for (let i = 0; i < points.length; i += 3) {
    const point = points.slice(i, i + 3);
    const rotated = rotatePoint(point, origin, rotationMatrix);
    rotatedPoints.push(...rotated);
  }

  return rotatedPoints;
}
