import { describe, it, expect, beforeAll } from '@jest/globals';
import { vec3 } from 'gl-matrix';
import { getCubeSizeInView } from '../../src/utilities/getPlaneCubeIntersectionDimensions';

/**
 * Creates a mock vtkImageData with a transform following DICOM mapping convention.
 *
 * DICOM mapping formula: P(x,y,z) = O + (x·Δc)·c + (y·Δr)·r + (z·Δs)·s
 * Where:
 * - O = Origin (Image Position Patient / IPP)
 * - r = row unit vector (from IOP, first 3 values)
 * - c = column unit vector (from IOP, last 3 values)
 * - s = r × c (slice direction unit vector)
 * - Δr = Pixel Spacing row (mm/row) = PixelSpacing[0] = spacing[1]
 * - Δc = Pixel Spacing col (mm/col) = PixelSpacing[1] = spacing[0]
 * - Δs = slice spacing (mm/slice) = spacing[2]
 *
 * Index coordinates: (x, y, z) = (column, row, slice)
 *
 * @param extent - The extent of the image [xMin, xMax, yMin, yMax, zMin, zMax]
 * @param spacing - The spacing of the image [spacingX, spacingY, spacingZ]
 *                   where spacing[0] = Δc (column), spacing[1] = Δr (row), spacing[2] = Δs (slice)
 * @param origin - The origin of the image [originX, originY, originZ] (IPP)
 * @param direction - Direction array. Can be:
 *                    - 6 values: [r_x, r_y, r_z, c_x, c_y, c_z] (DICOM IOP format)
 *                    - 9 values: [dir0_x, dir0_y, dir0_z, dir1_x, dir1_y, dir1_z, dir2_x, dir2_y, dir2_z]
 *                      where dir1 is row (r) and dir0 is column (c) based on index mapping
 * @returns A mock vtkImageData object
 */
function createMockImageData(extent, spacing, origin, direction) {
  // Extract row and column direction cosines from the direction array
  // Test data format: [yDir, xDir, zDir] (9 elements) where:
  // - yDir (indices 0-2) maps to index[0] (column) → this is the column direction (c)
  // - xDir (indices 3-5) maps to index[1] (row) → this is the row direction (r)
  // - zDir (indices 6-8) maps to index[2] (slice) → not used, we compute s = r × c
  let r, c;

  if (direction.length === 6) {
    // DICOM IOP format: [r_x, r_y, r_z, c_x, c_y, c_z]
    r = vec3.fromValues(direction[0], direction[1], direction[2]); // row unit vector (first 3 values)
    c = vec3.fromValues(direction[3], direction[4], direction[5]); // column unit vector (last 3 values)
  } else if (direction.length === 9) {
    // 9-value format: [yDir, xDir, zDir] where yDir maps to column and xDir maps to row
    c = direction.slice(0, 3); // column unit vector (yDir, maps to index[0])
    r = direction.slice(3, 6); // row unit vector (xDir, maps to index[1])
  } else {
    throw new Error(
      `Invalid direction array length: ${direction.length}. Expected 6 (IOP) or 9 (3x3 matrix) values.`
    );
  }

  // Compute slice direction as s = r × c per DICOM convention
  const s = vec3.cross([0, 0, 0], r, c);

  // DICOM spacing mapping:
  // spacing[0] = Δc (column spacing, PixelSpacing[1]) - for index[0] (x/column)
  // spacing[1] = Δr (row spacing, PixelSpacing[0]) - for index[1] (y/row)
  // spacing[2] = Δs (slice spacing) - for index[2] (z/slice)
  const [deltaC, deltaR, deltaS] = spacing; // column spacing (for x/column index)

  return {
    getExtent: () => extent,
    getSpacing: () => spacing,
    getOrigin: () => origin,
    indexToWorld: (index, out) => {
      // DICOM index coordinates: (x, y, z) = (column, row, slice)
      // index[0] = x = column index → maps to column direction (c) with spacing[0] (Δc)
      // index[1] = y = row index → maps to row direction (r) with spacing[1] (Δr)
      // index[2] = z = slice index → maps to slice direction (s) with spacing[2] (Δs)
      const [x, y, z] = index;

      // Apply DICOM formula: P(x,y,z) = O + (x·Δc)·c + (y·Δr)·r + (z·Δs)·s
      // Start with origin
      const world = origin.slice(0, 3);

      // Add column component: (x·Δc)·c
      const colComponent = vec3.scale([0, 0, 0], c, x * deltaC);
      vec3.add(world, world, colComponent);

      // Add row component: (y·Δr)·r
      const rowComponent = vec3.scale([0, 0, 0], r, y * deltaR);
      vec3.add(world, world, rowComponent);

      // Add slice component: (z·Δs)·s
      const sliceComponent = vec3.scale([0, 0, 0], s, z * deltaS);
      vec3.add(world, world, sliceComponent);

      if (out) {
        out[0] = world[0];
        out[1] = world[1];
        out[2] = world[2];
        return out;
      }
      return world;
    },
  };
}

// Test data array containing extent, spacing, origin, direction, focalPoint, viewPlaneNormal, and viewUp
const testDataArray = [
  {
    name: 'Real-world DICOM image data',
    extent: [0, 255, 0, 255, 0, 0],
    spacing: [1, 1, 1],
    origin: [1.9022881388664, -123.8693759574, 159.93407607185],
    direction: [
      0,
      0.9762960076332092,
      -0.21643954515457153, // yDir
      -1.0000000168623835e-16,
      -0.21643954515457153,
      -0.9762960076332092, // xDir
      -1,
      2.164395496850332e-17,
      9.76295998356819e-17, // zDir
    ],
    focalPoint: [1.902288138866387, -26.60774876013437, 7.263925315014063],
    viewPlaneNormal: [1, -1.6454741948139594e-17, -9.872845168883756e-17],
    viewUp: [1.0000000168623835e-16, 0.21643954515457153, 0.9762960076332092],
  },
  {
    name: 'Real-world DICOM image data (512x512 with rotated orientation)',
    extent: [0, 511, 0, 511, 0, 0],
    spacing: [2, 2, 0.001],
    origin: [-511, -178, 3],
    direction: [
      1,
      6.123031769111886e-17,
      0, // yDir
      0,
      0,
      -1, // xDir
      -6.123031769111886e-17,
      1,
      0, // zDir
    ],
    focalPoint: [1, -177.99999999999997, -509],
    viewPlaneNormal: [6.133173666732035e-17, -1, -0],
    viewUp: [0, 0, 1],
  },
];

describe('getPlaneCubeIntersectionDimensions', () => {
  testDataArray.forEach((testData) => {
    describe(testData.name, () => {
      let mockImageData;

      beforeAll(() => {
        // Pass the direction array directly to createMockImageData
        // The function will extract the row and column direction cosines from it
        // Test data format: [yDir, xDir, zDir] (9 elements) where:
        // - yDir (dir0) maps to index[0] (column)
        // - xDir (dir1) maps to index[1] (row)
        // - zDir (dir2) maps to index[2] (slice)
        mockImageData = createMockImageData(
          testData.extent,
          testData.spacing,
          testData.origin,
          testData.direction
        );
      });

      it('Should compute view plane normal from world vector between (0,0,1) and (0,0,0)', () => {
        // Get world coordinates for index (0,0,0) and (0,0,1)
        const worldAtOrigin = mockImageData.indexToWorld([0, 0, 0]);
        const worldAtZ1 = mockImageData.indexToWorld([0, 0, 1]);

        // Compute the vector from (0,0,0) to (0,0,1) in world coordinates
        const zIndexDirection = vec3.sub(
          vec3.create(),
          worldAtZ1,
          worldAtOrigin
        );

        // Normalize to get the view plane normal
        const computedViewPlaneNormal = vec3.normalize(
          vec3.create(),
          zIndexDirection
        );

        // Normalize expected view plane normal for comparison
        const expectedViewPlaneNormal = vec3.normalize(vec3.create(), [
          ...testData.viewPlaneNormal,
        ]);

        // Verify the computed view plane normal matches expected
        expect(computedViewPlaneNormal[0]).toBeCloseTo(
          expectedViewPlaneNormal[0]
        );
        expect(computedViewPlaneNormal[1]).toBeCloseTo(
          expectedViewPlaneNormal[1]
        );
        expect(computedViewPlaneNormal[2]).toBeCloseTo(
          expectedViewPlaneNormal[2]
        );
      });

      it('Should compute view up from world vector between (0,1,0) and (0,0,0)', () => {
        // Get world coordinates for index (0,0,0) and (0,1,0)
        // Note: In VTK, index[1] maps to a column of the direction matrix
        // With our updated mapping: index[1] → zDir
        const worldAtOrigin = mockImageData.indexToWorld([0, 0, 0]);
        const worldAtIndex1_1 = mockImageData.indexToWorld([0, 1, 0]);

        // Compute the vector from (0,0,0) to (0,1,0) in world coordinates
        const index1Direction = vec3.sub(
          vec3.create(),
          worldAtIndex1_1,
          worldAtOrigin
        );

        // Based on test data analysis, viewUp appears to be the negative of the direction
        // from (0,1,0) to (0,0,0) for the second test case
        // Normalize the direction and negate it
        const computedViewUp = vec3.normalize(vec3.create(), index1Direction);
        vec3.scale(computedViewUp, computedViewUp, -1);

        // Normalize expected view up for comparison
        const expectedViewUp = vec3.normalize(vec3.create(), [
          ...testData.viewUp,
        ]);

        // Verify the computed view up matches expected
        expect(computedViewUp[0]).toBeCloseTo(expectedViewUp[0]);
        expect(computedViewUp[1]).toBeCloseTo(expectedViewUp[1]);
        expect(computedViewUp[2]).toBeCloseTo(expectedViewUp[2]);
      });

      it('Should have spacing[2] equal to the length of vector between (0,0,1) and (0,0,0)', () => {
        // Get world coordinates for index (0,0,0) and (0,0,1)
        const worldAtOrigin = mockImageData.indexToWorld([0, 0, 0]);
        const worldAtZ1 = mockImageData.indexToWorld([0, 0, 1]);

        // Compute the vector from (0,0,0) to (0,0,1) in world coordinates
        const zIndexDirection = vec3.sub(
          vec3.create(),
          worldAtZ1,
          worldAtOrigin
        );

        // Get the length of the vector (before normalization)
        const zIndexDirectionLength = vec3.length(zIndexDirection);

        // Verify spacing[2] matches the length
        expect(zIndexDirectionLength).toBeCloseTo(testData.spacing[2]);
      });

      it('Should have spacing[0] equal to the length of vector between (1,0,0) and (0,0,0)', () => {
        // Get world coordinates for index (0,0,0) and (1,0,0)
        // Note: index[0] maps to yDir with spacing[0]
        const worldAtOrigin = mockImageData.indexToWorld([0, 0, 0]);
        const worldAtIndex0_1 = mockImageData.indexToWorld([1, 0, 0]);

        // Compute the vector from (0,0,0) to (1,0,0) in world coordinates
        const index0Direction = vec3.sub(
          vec3.create(),
          worldAtIndex0_1,
          worldAtOrigin
        );

        // Get the length of the vector (before normalization)
        const index0DirectionLength = vec3.length(index0Direction);

        // Verify spacing[0] matches the length
        expect(index0DirectionLength).toBeCloseTo(testData.spacing[0]);
      });

      it('Should have spacing[1] equal to the length of vector between (0,1,0) and (0,0,0)', () => {
        // Get world coordinates for index (0,0,0) and (0,1,0)
        // Note: index[1] maps to xDir with spacing[1]
        const worldAtOrigin = mockImageData.indexToWorld([0, 0, 0]);
        const worldAtIndex1_1 = mockImageData.indexToWorld([0, 1, 0]);

        // Compute the vector from (0,0,0) to (0,1,0) in world coordinates
        const index1Direction = vec3.sub(
          vec3.create(),
          worldAtIndex1_1,
          worldAtOrigin
        );

        // Get the length of the vector (before normalization)
        const index1DirectionLength = vec3.length(index1Direction);

        // Verify spacing[1] matches the length
        expect(index1DirectionLength).toBeCloseTo(testData.spacing[1]);
      });

      // Test orthogonal views
      // direction array format: [yDir(0-2), xDir(3-5), zDir(6-8)]
      // where yDir maps to index[0] (column), xDir maps to index[1] (row), zDir maps to index[2] (slice)
      it('Should compute correct dimensions for orthogonal view aligned with x-axis (y-z plane)', () => {
        // For x-axis view (y-z plane): viewPlaneNormal = yDir (indices 0-2), viewUp = zDir (indices 6-8)
        // This gives viewRight along xDir (indices 3-5) for width along y dimension
        const viewPlaneNormal = vec3.normalize(
          vec3.create(),
          testData.direction.slice(0, 3)
        );
        const viewUp = vec3.normalize(
          vec3.create(),
          testData.direction.slice(6, 9)
        );

        const { widthWorld, heightWorld } = getCubeSizeInView(
          mockImageData,
          viewPlaneNormal,
          viewUp
        );

        // For x-axis view, we see the y-z plane
        // Width should be y dimension: (extent[3] - extent[2] + 1) * spacing[1]
        // Height should be z dimension: (extent[5] - extent[4] + 1) * spacing[2]
        const expectedWidth =
          (testData.extent[3] - testData.extent[2] + 1) * testData.spacing[1];
        const expectedHeight =
          (testData.extent[5] - testData.extent[4] + 1) * testData.spacing[2];

        expect(widthWorld).toBeCloseTo(expectedWidth);
        expect(heightWorld).toBeCloseTo(expectedHeight);
      });

      it('Should compute correct dimensions for orthogonal view aligned with y-axis (x-z plane)', () => {
        // For y-axis view (x-z plane): viewPlaneNormal = xDir (indices 3-5), viewUp = zDir (indices 6-8)
        // This gives viewRight along yDir (indices 0-2) for width along x dimension
        const viewPlaneNormal = vec3.normalize(
          vec3.create(),
          testData.direction.slice(3, 6)
        );
        const viewUp = vec3.normalize(
          vec3.create(),
          testData.direction.slice(6, 9)
        );

        const { widthWorld, heightWorld } = getCubeSizeInView(
          mockImageData,
          viewPlaneNormal,
          viewUp
        );

        // For y-axis view, we see the x-z plane
        // Width should be x dimension: (extent[1] - extent[0] + 1) * spacing[0]
        // Height should be z dimension: (extent[5] - extent[4] + 1) * spacing[2]
        const expectedWidth =
          (testData.extent[1] - testData.extent[0] + 1) * testData.spacing[0];
        const expectedHeight =
          (testData.extent[5] - testData.extent[4] + 1) * testData.spacing[2];

        expect(widthWorld).toBeCloseTo(expectedWidth);
        expect(heightWorld).toBeCloseTo(expectedHeight);
      });

      it('Should compute correct dimensions for orthogonal view aligned with z-axis (x-y plane)', () => {
        // For z-axis view (x-y plane): viewPlaneNormal = zDir (indices 6-8), viewUp = xDir (indices 3-5)
        // This gives viewRight along yDir (indices 0-2) for width along x dimension
        const viewPlaneNormal = vec3.normalize(
          vec3.create(),
          testData.direction.slice(6, 9)
        );
        const viewUp = vec3.normalize(
          vec3.create(),
          testData.direction.slice(3, 6)
        );

        const { widthWorld, heightWorld } = getCubeSizeInView(
          mockImageData,
          viewPlaneNormal,
          viewUp
        );

        // For z-axis view, we see the x-y plane
        // Width should be x dimension: (extent[1] - extent[0] + 1) * spacing[0]
        // Height should be y dimension: (extent[3] - extent[2] + 1) * spacing[1]
        const expectedWidth =
          (testData.extent[1] - testData.extent[0] + 1) * testData.spacing[0];
        const expectedHeight =
          (testData.extent[3] - testData.extent[2] + 1) * testData.spacing[1];

        expect(widthWorld).toBeCloseTo(expectedWidth);
        expect(heightWorld).toBeCloseTo(expectedHeight);
      });
    });
  });

  describe('Custom cuboid test case', () => {
    let mockImageData;

    beforeAll(() => {
      // Cuboid with origin [1,2,3] and side vectors [1,0,0], [0,-2,0], [0,0,3]
      // extent: [0, 1, 0, 2, 0, 3] actual, but note -1 on max value to conform
      // spacing: [1, 1, 1] (lengths of side vectors)
      // origin: [1, 2, 3]
      // direction: normalized side vectors as [columnDir, rowDir, sliceDir]
      //   columnDir = [1, 0, 0] (normalized [1,0,0])
      //   rowDir = [0, -1, 0] (normalized [0,-2,0])
      //   sliceDir = [0, 0, 1] (normalized [0,0,3])
      mockImageData = createMockImageData(
        [0, 0, 0, 1, 0, 2], // extent
        [1, 1, 1], // spacing: lengths of side vectors
        [4, 4, 4], // origin
        [1, 0, 0, 0, -1, 0, 0, 0, 1] // direction: [columnDir, rowDir, sliceDir]
      );
    });

    it('Should compute correct widthWorld and heightWorld for cuboid with custom view orientation', () => {
      // From the code: viewRight = viewPlaneNormal × viewUp
      //   So: viewPlaneNormal = viewUp × viewRight
      const viewRight = vec3.normalize(vec3.create(), [1, -2, 3]);
      const viewUp = vec3.normalize(vec3.create(), [0, -3, -2]);
      // Compute viewPlaneNormal such that viewRight = viewPlaneNormal × viewUp
      // Since A × B = -(B × A), we have: viewPlaneNormal = viewUp × viewRight
      const viewPlaneNormal = vec3.cross(vec3.create(), viewUp, viewRight);
      vec3.normalize(viewPlaneNormal, viewPlaneNormal);

      const { widthWorld, heightWorld } = getCubeSizeInView(
        mockImageData,
        viewPlaneNormal,
        viewUp
      );

      // Expected width: Projection of cuboid corners onto viewRight = [1, -2, 3] normalized
      // The width is the difference between max and min projections of all 8 corners, which
      // have lengths 1,2,3 so sqrt(1+2*2+3*3) = sqrt(14)
      const expectedWidth = Math.sqrt(14);

      expect(widthWorld).toBeCloseTo(expectedWidth);
    });
  });
});
