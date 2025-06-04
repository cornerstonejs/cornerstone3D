import type { Types } from '@cornerstonejs/core';
import {
  subtractPolylineSets,
  intersectPolylines,
  xorPolylinesSets,
  unifyPolylineSets,
} from '../../contourSegmentation/unifyPolylineSets';

/**
 * Creates a circular polyline with specified center and radius
 */
function createCirclePolyline(
  center: Types.Point2,
  radius: number,
  numPoints: number = 32
): Types.Point2[] {
  const points: Types.Point2[] = [];

  for (let i = 0; i < numPoints; i++) {
    const angle = (i / numPoints) * 2 * Math.PI;
    const x = center[0] + radius * Math.cos(angle);
    const y = center[1] + radius * Math.sin(angle);
    points.push([x, y]);
  }

  return points;
}

/**
 * Test function to verify polyline operations with two intersecting circles
 */
export function testPolylineOperations(): void {
  console.log('=== Testing Polyline Operations with Intersecting Circles ===');

  // Create two intersecting circles
  const circle1 = createCirclePolyline([0, 0], 10, 32); // Circle at origin with radius 10
  const circle2 = createCirclePolyline([8, 0], 10, 32); // Circle offset by 8 units, overlapping

  const setA = [circle1];
  const setB = [circle2];

  console.log('Input:');
  console.log(`Circle 1: ${circle1.length} points, center (0,0), radius 10`);
  console.log(`Circle 2: ${circle2.length} points, center (8,0), radius 10`);
  console.log('Expected: Two circles with significant overlap\n');

  // Test 1: Union (should return one merged polyline)
  console.log('1. Testing unifyPolylineSets (Union):');
  const unionResult = unifyPolylineSets(setA, setB);
  console.log(`Result: ${unionResult.length} polyline(s)`);
  unionResult.forEach((polyline, index) => {
    console.log(`  Polyline ${index + 1}: ${polyline.length} points`);
  });
  console.log(`Expected: 1 polyline (merged shape)\n`);

  // Test 2: Subtraction A - B (should return one polyline - the crescent shape)
  console.log('2. Testing subtractPolylineSets (A - B):');
  const subtractResult = subtractPolylineSets(setA, setB);
  console.log(`Result: ${subtractResult.length} polyline(s)`);
  subtractResult.forEach((polyline, index) => {
    console.log(`  Polyline ${index + 1}: ${polyline.length} points`);
  });
  console.log(`Expected: 1 polyline (crescent shape - A minus B)\n`);

  // Test 3: Intersection (should return one polyline - the overlapping area)
  console.log('3. Testing intersectPolylines (A ∩ B):');
  const intersectResult = intersectPolylines(setA, setB);
  console.log(`Result: ${intersectResult.length} polyline(s)`);
  intersectResult.forEach((polyline, index) => {
    console.log(`  Polyline ${index + 1}: ${polyline.length} points`);
  });
  console.log(`Expected: 1 polyline (lens-shaped intersection)\n`);

  // Test 4: XOR (should return two polylines - the non-overlapping parts)
  console.log('4. Testing xorPolylinesSets (A ⊕ B):');
  const xorResult = xorPolylinesSets(setA, setB);
  console.log(`Result: ${xorResult.length} polyline(s)`);
  xorResult.forEach((polyline, index) => {
    console.log(`  Polyline ${index + 1}: ${polyline.length} points`);
  });
  console.log(`Expected: 2 polylines (two crescent shapes)\n`);

  // Verify mathematical relationships
  console.log('=== Verifying Mathematical Relationships ===');

  // Test: Intersection = Union - XOR
  console.log('Testing: Intersection = Union - XOR');
  const calculatedIntersection = subtractPolylineSets(unionResult, xorResult);
  console.log(
    `Calculated intersection: ${calculatedIntersection.length} polyline(s)`
  );
  console.log(`Direct intersection: ${intersectResult.length} polyline(s)`);
  console.log(
    `Match: ${
      calculatedIntersection.length === intersectResult.length ? 'YES' : 'NO'
    }\n`
  );

  // Summary
  console.log('=== Summary ===');
  console.log(`Union: ${unionResult.length} polyline(s) - Expected: 1`);
  console.log(
    `Subtraction: ${subtractResult.length} polyline(s) - Expected: 1`
  );
  console.log(
    `Intersection: ${intersectResult.length} polyline(s) - Expected: 1`
  );
  console.log(`XOR: ${xorResult.length} polyline(s) - Expected: 2`);

  const allCorrect =
    unionResult.length === 1 &&
    subtractResult.length === 1 &&
    intersectResult.length === 1 &&
    xorResult.length === 2;

  console.log(`\nAll operations correct: ${allCorrect ? 'YES' : 'NO'}`);

  if (!allCorrect) {
    console.log(
      '\n⚠️  Some operations returned unexpected number of polylines!'
    );
    console.log('This indicates issues with the polyline boolean operations.');
  } else {
    console.log('\n✅ All operations returned expected number of polylines!');
  }
}

/**
 * Test with non-intersecting circles
 */
export function testNonIntersectingCircles(): void {
  console.log('\n=== Testing Non-Intersecting Circles ===');

  const circle1 = createCirclePolyline([0, 0], 5, 32); // Circle at origin with radius 5
  const circle2 = createCirclePolyline([15, 0], 5, 32); // Circle far away, no overlap

  const setA = [circle1];
  const setB = [circle2];

  console.log('Input: Two non-intersecting circles');

  const unionResult = unifyPolylineSets(setA, setB);
  const subtractResult = subtractPolylineSets(setA, setB);
  const intersectResult = intersectPolylines(setA, setB);
  const xorResult = xorPolylinesSets(setA, setB);

  console.log(`Union: ${unionResult.length} polyline(s) - Expected: 2`);
  console.log(
    `Subtraction: ${subtractResult.length} polyline(s) - Expected: 1`
  );
  console.log(
    `Intersection: ${intersectResult.length} polyline(s) - Expected: 0`
  );
  console.log(`XOR: ${xorResult.length} polyline(s) - Expected: 2`);

  const allCorrect =
    unionResult.length === 2 &&
    subtractResult.length === 1 &&
    intersectResult.length === 0 &&
    xorResult.length === 2;

  console.log(`Non-intersecting test correct: ${allCorrect ? 'YES' : 'NO'}`);
}

/**
 * Run all tests
 */
export function runAllPolylineTests(): void {
  testPolylineOperations();
  testNonIntersectingCircles();
}
