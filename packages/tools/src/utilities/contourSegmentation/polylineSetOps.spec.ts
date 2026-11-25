/**
 * Unit tests for the view-reference grouping bridge (`runBooleanOpByView`).
 * Verifies SEMANTICS.md §1.3 (no cross-view interaction) and §5.0
 * (inclusion criterion is plane, never overlap).
 */

import { runBooleanOpByView } from './polylineSetOps';
import { BooleanOp } from './clipperBooleanOps';
import type { PolylineInfoCanvas } from './polylineInfoTypes';
import type { Types } from '@cornerstonejs/core';

type P = Types.Point2;

const square = (x: number, y: number, size: number): P[] => [
  [x, y],
  [x + size, y],
  [x + size, y + size],
  [x, y + size],
];

const V1: Types.ViewReference = {
  FrameOfReferenceUID: 'FOR-1',
  referencedImageId: 'img-1',
  viewPlaneNormal: [0, 0, 1],
};
const V2: Types.ViewReference = {
  FrameOfReferenceUID: 'FOR-1',
  referencedImageId: 'img-2',
  viewPlaneNormal: [0, 0, 1],
};

const info = (
  polyline: P[],
  viewReference: Types.ViewReference,
  holePolylines?: P[][]
): PolylineInfoCanvas =>
  holePolylines
    ? { polyline, viewReference, holePolylines }
    : { polyline, viewReference };

describe('runBooleanOpByView', () => {
  it('Difference: polygons on different views never interact', () => {
    const a = [info(square(0, 0, 10), V1)];
    const b = [info(square(0, 0, 10), V2)];
    const r = runBooleanOpByView(a, b, BooleanOp.Difference);
    expect(r).toHaveLength(1);
    expect(r[0].viewReference).toEqual(V1);
  });

  it('Union: B-only view groups pass through (commutative ops)', () => {
    const a = [info(square(0, 0, 10), V1)];
    const b = [info(square(0, 0, 10), V2)];
    const r = runBooleanOpByView(a, b, BooleanOp.Union);
    expect(r).toHaveLength(2);
    expect(r.map((p) => p.viewReference)).toEqual(
      expect.arrayContaining([V1, V2])
    );
  });

  it('XOR: A-only and B-only view groups both pass through', () => {
    const a = [info(square(0, 0, 10), V1)];
    const b = [info(square(0, 0, 10), V2)];
    const r = runBooleanOpByView(a, b, BooleanOp.Xor);
    expect(r).toHaveLength(2);
  });

  it('Intersection: only groups present on both sides contribute', () => {
    const a = [info(square(0, 0, 10), V1), info(square(0, 0, 10), V2)];
    const b = [info(square(5, 0, 10), V1)]; // only V1
    const r = runBooleanOpByView(a, b, BooleanOp.Intersection);
    expect(r).toHaveLength(1);
    expect(r[0].viewReference).toEqual(V1);
  });

  it('Difference: A-only view groups pass through; B-only dropped', () => {
    const a = [info(square(0, 0, 10), V1)];
    const b = [info(square(0, 0, 10), V2)]; // different view
    const r = runBooleanOpByView(a, b, BooleanOp.Difference);
    expect(r).toHaveLength(1);
    expect(r[0].viewReference).toEqual(V1);
  });

  it('§5.0: non-overlapping but same-plane polygons participate (Union of disjoint)', () => {
    // Both on V1, spatially disjoint. Union must return both.
    const a = [info(square(0, 0, 10), V1)];
    const b = [info(square(50, 50, 10), V1)];
    const r = runBooleanOpByView(a, b, BooleanOp.Union);
    expect(r).toHaveLength(2);
  });

  it('§5.0: B inside A hole, same plane, no overlap of solid — Union still returns both', () => {
    // A: 100x100 with hole 60x60 centered. B: 20x20 inside the hole.
    const a = [info(square(0, 0, 100), V1, [square(20, 20, 60)])];
    const b = [info(square(40, 40, 20), V1)];
    const r = runBooleanOpByView(a, b, BooleanOp.Union);
    expect(r).toHaveLength(2);
    // Both outputs are on V1
    expect(r.every((p) => p.viewReference === V1)).toBe(true);
    // One has a hole, one doesn't
    const withHole = r.filter((p) => p.holePolylines?.length);
    const noHole = r.filter((p) => !p.holePolylines?.length);
    expect(withHole).toHaveLength(1);
    expect(noHole).toHaveLength(1);
  });

  it('holes survive the canvas round-trip on Difference', () => {
    // A: 100x100. B: 20x20 fully inside → A − B = A with B as hole.
    const a = [info(square(0, 0, 100), V1)];
    const b = [info(square(40, 40, 20), V1)];
    const r = runBooleanOpByView(a, b, BooleanOp.Difference);
    expect(r).toHaveLength(1);
    expect(r[0].holePolylines).toHaveLength(1);
  });

  it('empty inputs short-circuit per algebra', () => {
    expect(runBooleanOpByView([], [], BooleanOp.Union)).toEqual([]);
    expect(
      runBooleanOpByView([], [info(square(0, 0, 10), V1)], BooleanOp.Difference)
    ).toEqual([]);
    expect(
      runBooleanOpByView(
        [info(square(0, 0, 10), V1)],
        [],
        BooleanOp.Intersection
      )
    ).toEqual([]);
    expect(
      runBooleanOpByView([info(square(0, 0, 10), V1)], [], BooleanOp.Difference)
    ).toHaveLength(1);
  });
});
