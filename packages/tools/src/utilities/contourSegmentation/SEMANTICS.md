# Contour Segmentation Operation Semantics

This document defines the exact behavior of every contour-segmentation editing
operation in `@cornerstonejs/tools`. It is the spec the boolean-op pipeline
(`clipperBooleanOps.ts` + `polylineSetOps.ts` + the four `polylineXxx.ts`
wrappers + the interactive-edit paths in `sharedOperations.ts` and
`mergeMultipleAnnotations.ts`) must obey.

Where this document and the implementation disagree, the document is right and
the code is a bug. Where this document and the tests disagree, treat as a bug
in this document and update it.

---

## 1. Model

### 1.1 Polygon-with-holes

A polygon is a simple closed outer ring plus zero or more simple closed hole
rings:

```
type Polygon = {
  outer: Point2[];       // simple closed polyline, CW, ≥ 3 vertices
  holes?: Point2[][];    // each simple closed, CCW, fully inside outer,
                         // pairwise non-overlapping
};
```

A **point is inside a polygon** iff it is inside `outer` AND outside every hole.
The "solid area" of a polygon is the set of points inside it under this rule.

### 1.2 Segment

A segment is a labeled collection of polygons within a segmentation, keyed by
`segmentIndex`. Inside one segment, on a single view reference, polygons
**must not have overlapping solid areas** — if two pieces touch or overlap
in their solid regions, they should have been unioned already. The pipeline
is responsible for enforcing this.

**Polygons may nest spatially without limit.** A polygon B sitting entirely
inside a hole of polygon A is a top-level polygon in the segment, treated
exactly as if it were anywhere else. B is independently editable, can have
its own holes, and those holes can contain further top-level polygons, and
so on. There is no "depth limit" and no parent-child relationship at the
data layer — nesting is purely a spatial coincidence.

Consequence: the segment is a flat list of polygons-with-holes (per §1.1).
"Same-segment polygon inside a hole" is a spatial observation, not a
structural one. Clipper's `PolyTreeD` is used internally to compute the
nesting at op-output time; we then flatten it back to the segment's
flat-list representation.

### 1.3 View reference

Identifies a slice / frame-of-reference. Operations only combine polygons
sharing the same view reference. Polygons on different view references pass
through untouched, even when their canvas-space coordinates would otherwise
coincide (different slices of a volume).

### 1.4 Segment independence

Segments do not interact. Drawing, editing, or running a Combine Contour
operation on segment N **never** touches segment M. Two segments may claim
overlapping space — a pixel can be both "lung" and "tumor" — and the pipeline
makes no attempt to enforce mutual exclusivity.

---

## 2. Universal invariants

These hold for every operation, cursor- or toolbar-driven.

| #   | Invariant                                                                                                                                                                                         |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I1  | No cross-view interaction.                                                                                                                                                                        |
| I2  | Holes are not solid. A point in a hole is OUTSIDE the polygon.                                                                                                                                    |
| I3  | Both sides' holes are respected. Holes in either input subtract from that input's solid before any boolean op.                                                                                    |
| I4  | Identical inputs collapse algebraically: `A−A=∅`, `A⊕A=∅`, `A∪A=A`, `A∩A=A`.                                                                                                                      |
| I5  | Disjoint inputs do not interact: `∪={A,B}`, `−=A`, `∩=∅`, `⊕={A,B}`.                                                                                                                              |
| I6  | Output windings are normalized: outers CW, holes CCW.                                                                                                                                             |
| I7  | Annotation identity is not preserved through any boolean op — output polygons are fresh annotations; inputs are removed.                                                                          |
| I8  | Empty inputs short-circuit. `∅ op X` and `X op ∅` follow the algebra; Clipper is not invoked.                                                                                                     |
| I9  | Outputs have pairwise non-overlapping solid areas within a segment per §1.2 — Clipper's `PolyTreeD` guarantees this.                                                                              |
| I10 | Spatial nesting is unbounded. A polygon may sit inside another's hole, which itself sits inside a third's hole, etc., with no limit. Each remains a top-level polygon in the segment's flat list. |

---

## 3. Cursor interactions (basic, no holes)

Each cursor gesture has a **fixed polarity**. The user cannot accidentally
cross polarities mid-stroke.

### 3.1 Shift + drag = REMOVE

Polarity: **always subtractive**. Total segment area `≤` original total
segment area. Never grows any contour.

The cursor may start **anywhere** — inside an existing polygon's solid,
inside one of its holes, or completely outside any polygon. The starting
position does NOT change the polarity; this is purely a subtractive gesture.

Mechanic: the stroke is collected as a closed polygon, then a single
Difference op runs on the whole segment with the stroke as the clip.
Every polygon on the same plane is in the operation; polygons that have no
spatial overlap with the stroke pass through unchanged as an algebraic
consequence (`A − B = A` when `A ∩ B = ∅`), not because they are filtered out.

Mapped op: `segment := segment − {stroke}`.

| Stroke vs single existing polygon T                                | Result                                                                              |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| Stroke fully outside T                                             | No-op                                                                               |
| Stroke fully inside T's solid (no edge crossings, no hole touched) | New hole carved in T, hole shape = stroke outline                                   |
| Stroke fully inside an existing hole of T                          | No-op (already empty)                                                               |
| Stroke crosses T's outer edge                                      | T shrinks; the bitten-off piece is discarded                                        |
| Stroke straddles a hole edge of T                                  | Hole grows into the solid; T's outer unchanged in that region                       |
| Stroke fully covers T (and all its holes)                          | T removed entirely                                                                  |
| Stroke overlaps multiple polygons in the segment                   | Each is independently subtracted; some may vanish, others shrink, others gain holes |

**Hole effects under REMOVE.** Subtracting solid is the operation that changes
hole topology, in any of these ways:

- **New hole created** — a stroke entirely inside solid carves a hole.
- **Existing hole grows** — a stroke that removes solid bordering a hole
  enlarges the hole.
- **Two holes merge** — a stroke that removes the solid bridge between two
  existing holes turns them into one larger hole.
- **Hole merges with the exterior (hole "breaks out")** — a stroke that
  carves a channel from a hole's edge through to T's outer boundary makes
  the hole no longer a hole: it becomes part of T's outer concavity. T's
  hole count drops by one and T's outer ring becomes more complex.
- **Polygon disappears** — if the subtraction removes all remaining solid.

### 3.2 Normal drag (cursor starts OFF any existing contour edge) = ADD

Polarity: **always additive**. Total segment area `≥` original total
segment area. Never shrinks any contour.

The cursor may start **anywhere except on an existing contour edge** —
starting on an edge invokes the edit-drag path (§3.3) instead. Valid
starting positions include:

- Inside an existing polygon's solid area
- Inside an existing polygon's hole
- Completely outside any polygon (in empty space)

The starting position does NOT change the polarity; this is purely an
additive gesture.

Mechanic: the stroke is collected as a NEW closed polygon, then a single
Union op runs on the whole segment with the stroke as the clip. Every
polygon on the same plane is in the operation; polygons that have no
spatial overlap with the stroke survive in the result as themselves, as an
algebraic consequence (`A ∪ B` includes both when `A ∩ B = ∅`), not because
they are filtered out. If the stroke overlaps nothing, it appears in the
result as a fresh disjoint polygon — including the case where the stroke
sits inside another polygon's hole without touching the hole boundary,
which produces a new top-level polygon nested in the hole per §1.2.

Mapped op: `segment := segment ∪ {stroke}`.

| Stroke vs single existing polygon T                             | Result                                                                    |
| --------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Stroke fully outside T (and not touching any other polygon)     | New disjoint polygon added to segment                                     |
| Stroke fully inside T's solid                                   | No-op (already covered)                                                   |
| Stroke fully inside a hole of T, touching the hole boundary     | Hole shrinks; if stroke fully covers the hole, hole disappears            |
| Stroke fully inside a hole of T, not touching the hole boundary | New top-level polygon added, nested in the hole (per §1.2)                |
| Stroke crosses T's outer edge                                   | T grows to include the stroke                                             |
| Stroke straddles a hole edge of T                               | Hole shrinks in the source direction                                      |
| Stroke fully covers T                                           | T replaced by stroke outline (or unioned with anything T was overlapping) |
| Stroke overlaps multiple polygons in the segment                | Those polygons union with the stroke into one polygon                     |
| Stroke bridges a gap between two polygons                       | The two polygons merge into one through the bridge                        |

**Hole effects under ADD.** Adding solid only shrinks holes — it can never
grow, create, or merge them with each other. Specifically:

- **Existing hole shrinks** — a stroke that fills part of a hole reduces
  the hole's area; T's outer is unchanged.
- **Existing hole disappears** — a stroke that fully covers a hole removes
  it. The hole is gone; T's hole count drops by one.
- **Hole "absorbed" into outer** — if the filling stroke also extends out
  of the hole into T's solid, the hole is filled via the connection; same
  net effect as "disappears."
- **New nested polygon instead of shrinking** — a stroke that lands inside
  a hole without touching the hole's boundary becomes a separate top-level
  polygon nested in the hole (per §1.2). T's hole is unchanged.
- **Holes never merge with each other under ADD.** Merging holes requires
  removing the solid between them — that is REMOVE territory.

### 3.3 Click + drag on contour edge = LOCAL EDIT

Polarity: **direct deformation**. NOT a boolean op. May add or remove area
depending on the direction the handle moves.

This path does not invoke the Clipper pipeline unless rule 3.4 triggers.

- Expanding (handle pulled outward): area added locally to the polygon's outer.
- Contracting (handle pushed inward): area removed locally.
- Holes are unaffected unless the edit reaches a hole boundary, at which point
  3.4 applies.

### 3.4 Edit drag with topology change = MERGE or SPLIT (never XOR)

When an edit causes the polygon to self-intersect, or causes the edited
polygon to overlap a sibling polygon in the same segment, the result is the
**UNION** of all touching pieces.

| Topology event                                                  | Result                                                                                    |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Outer ring pinches into a figure-eight                          | Polygon splits into two polygons (one outer ring becomes two)                             |
| Edited polygon's outer now overlaps sibling B (same segment)    | New polygon = (edited polygon) ∪ B; sibling B removed                                     |
| Edited polygon's outer touches one of its own holes             | Hole opens to the boundary; that hole disappears, replaced by an indentation in the outer |
| Edited polygon's outer crosses a polygon in a different segment | No interaction (segment independence)                                                     |

The user explicitly does not want XOR here: an edit overlapping an existing
polygon means "merge these", not "punch out their intersection."

---

## 4. Cursor interactions involving existing holes

Extending §3 to the case where the target polygon already has holes.

### 4.1 Shift + drag (subtract) with target holes

| Stroke location                                                                            | Result                                                                                                                                                                                          |
| ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stroke fully inside an existing hole, no nested same-segment polygon present               | No-op (subtracting from empty space)                                                                                                                                                            |
| Stroke fully inside an existing hole AND overlapping a same-segment polygon B nested there | Subtract from B per §3.1; surrounding polygon T unchanged                                                                                                                                       |
| Stroke fully inside T's solid (no hole touched)                                            | New hole carved (§3.1 baseline)                                                                                                                                                                 |
| Stroke fully inside T's solid AND encompassing an entire existing hole                     | New larger hole, merging the old one                                                                                                                                                            |
| Stroke straddles a hole edge and surrounding solid                                         | Hole grows in the source direction (parts of solid bordering the hole become hole)                                                                                                              |
| Stroke straddles T's outer AND an interior hole                                            | Outer shrinks where stroke extends outside; hole grows where stroke extends into solid bordering the hole; the part of the stroke inside the hole is a no-op (assuming no nested polygon there) |
| Stroke fully covers T (outer + all holes)                                                  | T removed entirely                                                                                                                                                                              |

### 4.2 Normal drag (union) with target holes

Recall (§1.2): a same-segment polygon that ends up nested inside a hole is a
top-level polygon, not a child of the surrounding polygon. The stroke can
therefore land "inside" a hole without modifying the polygon that owns the
hole.

| Stroke location                                                                                         | Result                                                                                                                                                                              |
| ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stroke fully inside an existing hole, not touching the hole boundary or any nested same-segment polygon | New top-level polygon added to segment, spatially nested inside the hole. Surrounding polygon T unchanged.                                                                          |
| Stroke fully inside an existing hole AND overlapping a same-segment polygon B nested in that hole       | Union with B per §3.2; T unchanged                                                                                                                                                  |
| Stroke straddles a hole edge                                                                            | Hole shape is reshaped: where the stroke extends out of the hole into solid, the hole boundary is rewritten to follow the stroke. Effectively the hole "shrinks" in that direction. |
| Stroke fully covers an existing hole AND extends into T's solid                                         | Hole disappears (filled in via the connection through T's solid)                                                                                                                    |
| Stroke fully inside T's solid                                                                           | No-op                                                                                                                                                                               |
| Stroke fully outside T (disjoint)                                                                       | New disjoint polygon added (§3.2 baseline)                                                                                                                                          |
| Stroke straddles T's outer AND a hole                                                                   | Outer grows where stroke extends outward; hole reshaped where stroke crosses the hole boundary                                                                                      |
| Stroke fully covers T (outer + all holes)                                                               | Result = stroke (T replaced)                                                                                                                                                        |

### 4.3 Edit drag with target holes (3.4 extended)

| Topology event                                                     | Result                                                                    |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| Outer edit ring crosses into a hole and back out                   | Hole opens, becomes an indentation in the outer                           |
| Outer edit ring completely engulfs a hole                          | Hole survives, just sits further inside                                   |
| Hole annotation itself is edited (rare — usually not user-exposed) | Same rules recursively, with the hole's outer playing the role of "outer" |

---

## 5. Combine Contour (explicit segment-to-segment ops)

The toolbar operations between two whole segments A and B. Either may contain
multiple polygons; each polygon may have holes.

### 5.0 Applicability — what counts as "participating"

**The only criterion for a polygon to participate in an op is matching view
reference (same plane).** Spatial overlap is NOT required.

Within a view-reference group, every polygon in A is part of the subject set
and every polygon in B is part of the clip set, regardless of whether they
spatially overlap each other. Clipper runs once per group. Polygons sit
exactly where the geometry says they sit, and the algebra of the chosen op
decides what's in the result.

Concrete cases that follow directly from "same plane is sufficient":

- A and B are entirely disjoint (no spatial overlap). They are still both
  in the operation. `A ∪ B` returns both; `A − B` returns A; `A ∩ B` is
  empty; `A ⊕ B` returns both.
- A has a hole H, B sits entirely inside H (B does not overlap A's solid).
  Both are still in the operation. `A ∪ B` returns A with its hole AND B
  as a separate top-level polygon spatially nested inside the hole (per
  §1.2 / §6 Case E). `A − B` returns A unchanged (B has nothing to subtract
  from inside A's empty region). `A ∩ B` is empty. `A ⊕ B` = `A ∪ B`.
- A consists of two disjoint polygons P₁ and P₂, B overlaps only P₁. Both
  P₁ and P₂ are subjects; P₂ passes through unchanged because the algebra
  says so, not because it was filtered out.

The phrasing "passes through unchanged" elsewhere in this document is an
algebraic outcome, never an inclusion gate. Implementations must NOT skip a
polygon just because it doesn't overlap anything in the opposite set.

### 5.1 Union: `A := A ∪ B`

> Result is every region covered by EITHER A or B.
> A hole survives only where the opposite side is also not solid.

**Hole effects:** same polarity as §3.2 (ADD). Holes in A or B can only
**shrink** or **disappear** under Union — wherever the opposite side is
solid, that part of the hole gets filled. Two holes do not merge with each
other under Union. (Same logic as the cursor ADD rule: filling solid never
opens or enlarges empty space.)

### 5.2 Subtract: `A := A − B`

> Result is every region of A that is NOT covered by B.
> A's solid is reduced wherever B is solid; A's existing holes are
> independently unaffected by overlaps with B's holes (subtracting empty
> space from empty space is a no-op).

**Hole effects:** same polarity as §3.1 (REMOVE). Subtraction can:

- create new holes in A (where B sits fully inside A's solid),
- enlarge existing A holes (where B extends into solid bordering a hole),
- merge two A holes into one (where B removes the bridge of solid between
  them), and
- merge an A hole with the exterior — the hole "breaks out" when B carves
  a channel from the hole's edge through to A's outer boundary, making
  that hole stop being a hole and become part of A's outer concavity.

B's holes are irrelevant to whether B subtracts at a point: B's "solid"
(per §1.1) is what subtracts. A point inside one of B's holes is not part
of B's solid, so B does not subtract there.

### 5.3 Intersect: `A := A ∩ B`

> Result is every region covered by BOTH A and B.
> Holes from either side are subtracted from the intersection.

### 5.4 XOR: `A := A ⊕ B`

> Result is every region covered by EXACTLY ONE of A or B.
> Equivalent to `(A ∪ B) − (A ∩ B)`.

---

## 6. Exhaustive case matrix

Let A and B be single polygons-with-holes on the same view reference.
`A_o` = outer of A, `A_h` = hole set of A; likewise for B.

### Case A — Disjoint (`A_o ∩ B_o = ∅`)

| Op  | Result               |
| --- | -------------------- |
| ∪   | {A, B} (two outputs) |
| −   | {A}                  |
| ∩   | ∅                    |
| ⊕   | {A, B}               |

### Case B — Edge-crossing (`A_o` and `B_o` boundaries intersect)

| Op  | Result                                                                                                                      |
| --- | --------------------------------------------------------------------------------------------------------------------------- |
| ∪   | Single merged outer; holes from A or B survive only where they remain entirely outside the opposite side's solid            |
| −   | A_o clipped by B_o; A's holes that lie fully outside B are preserved; A's holes that intersect B_o's solid grow accordingly |
| ∩   | Overlap region of A_o and B_o, minus any A or B hole intersecting that region                                               |
| ⊕   | Symmetric difference: (A − B) ∪ (B − A)                                                                                     |

### Case C — A_o fully contains B_o, no edge crossings (B inside A's solid)

| Op  | Result                                           |
| --- | ------------------------------------------------ |
| ∪   | A unchanged (B already covered)                  |
| −   | A with B carved as a new hole                    |
| ∩   | B (any A_h overlapping B subtracted from result) |
| ⊕   | A with B as a hole (same as `−` in this case)    |

### Case D — B_o fully contains A_o (symmetric to C)

| Op  | Result                                           |
| --- | ------------------------------------------------ |
| ∪   | B unchanged                                      |
| −   | ∅ (A removed)                                    |
| ∩   | A (any B_h overlapping A subtracted from result) |
| ⊕   | B with A as a hole                               |

### Case E — B_o is fully inside a hole of A (B in A's empty region)

Per §1.2, B remains a top-level polygon in the result and may itself carry
holes containing further top-level polygons recursively.

| Op  | Result                                                                                                                                        |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| ∪   | A's outer unchanged; A's hole still present; B (with its own holes if any) added as a separate top-level polygon spatially nested in the hole |
| −   | A unchanged (subtracting from empty space)                                                                                                    |
| ∩   | ∅ (no solid overlap)                                                                                                                          |
| ⊕   | Same as ∪ (since ∩ is empty)                                                                                                                  |

### Case F — A_o fully inside a hole of B (symmetric to E)

| Op  | Result                                         |
| --- | ---------------------------------------------- |
| ∪   | B with A as nested island in the relevant hole |
| −   | A unchanged                                    |
| ∩   | ∅                                              |
| ⊕   | Same as ∪                                      |

### Case G — Identical (same outer, same holes)

| Op  | Result |
| --- | ------ |
| ∪   | A      |
| −   | ∅      |
| ∩   | A      |
| ⊕   | ∅      |

### Case H — Same outer, different holes

| Op  | Result                                                                     |
| --- | -------------------------------------------------------------------------- |
| ∪   | outer = A_o; holes = pointwise intersection of A_h and B_h                 |
| −   | outer = A_o; solid = A_solid − B_solid (often a thin region; may be empty) |
| ∩   | outer = A_o; holes = pointwise union of A_h and B_h                        |
| ⊕   | symmetric difference of A_h and B_h (within shared outer)                  |

### Case I — Two disjoint polygons in A versus one B that bridges them

| Op  | Result                                                  |
| --- | ------------------------------------------------------- |
| ∪   | Single merged polygon spanning both A pieces and B      |
| −   | Each A piece independently clipped by B                 |
| ∩   | The two overlap regions (one per A piece)               |
| ⊕   | Holes/disjoint regions where exactly one side was solid |

### Case J — Arbitrarily nested polygons (hole inside an island inside a hole inside an island …)

Per §1.2, each "island inside a hole" is a separate top-level polygon. The
output of every op is a flat list of polygons-with-holes; nesting depth
shows up only as spatial coincidence. A polygon never has a hole-inside-a-
hole in its own data structure — that structure decomposes into separate
polygons.

Concretely, a four-level nest "A contains hole H₁ contains island B contains
hole H₂ contains island C" comes out of any op as three flat top-level
polygons in the segment: {A with hole H₁, B with hole H₂, C}. Their spatial
nesting is implicit in the geometry.

---

## 7. Suggested unit tests

### 7.1 `test/clipperBooleanOps.spec.ts` — pure geometry

```ts
import {
  applyBoolean,
  BooleanOp,
  type PolygonWithHoles,
} from '../clipperBooleanOps';

const square = (x: number, y: number, size: number): [number, number][] => [
  [x, y],
  [x + size, y],
  [x + size, y + size],
  [x, y + size],
];
const poly = (
  outer: [number, number][],
  ...holes: [number, number][][]
): PolygonWithHoles => ({ outer, holes: holes.length ? holes : undefined });

describe('applyBoolean', () => {
  describe('Union', () => {
    it('disjoint polygons → two outputs', () => {
      const r = applyBoolean(
        [poly(square(0, 0, 10))],
        [poly(square(20, 0, 10))],
        BooleanOp.Union
      );
      expect(r).toHaveLength(2);
    });
    it('edge-crossing → single merged polygon', () => {
      const r = applyBoolean(
        [poly(square(0, 0, 10))],
        [poly(square(5, 0, 10))],
        BooleanOp.Union
      );
      expect(r).toHaveLength(1);
    });
    it('A contains B → A unchanged (no extra hole)', () => {
      const r = applyBoolean(
        [poly(square(0, 0, 100))],
        [poly(square(40, 40, 20))],
        BooleanOp.Union
      );
      expect(r).toHaveLength(1);
      expect(r[0].holes ?? []).toHaveLength(0);
    });
    it('B inside a hole of A → result has nested island polygon', () => {
      const r = applyBoolean(
        [poly(square(0, 0, 100), square(20, 20, 60))],
        [poly(square(40, 40, 20))],
        BooleanOp.Union
      );
      // Expect 2 polygons: outer "donut" A, plus the B island sitting inside the hole.
      expect(r).toHaveLength(2);
    });
    it('three-deep nesting (A hole H1 island B hole H2 island C) flattens to 3 top-level polygons', () => {
      const A = poly(square(0, 0, 100), square(10, 10, 80));
      const B = poly(square(20, 20, 60), square(30, 30, 40));
      const C = poly(square(40, 40, 20));
      const r = applyBoolean([A], [B, C], BooleanOp.Union);
      expect(r).toHaveLength(3);
    });
    it('A === B → A', () => {
      const r = applyBoolean(
        [poly(square(0, 0, 10))],
        [poly(square(0, 0, 10))],
        BooleanOp.Union
      );
      expect(r).toHaveLength(1);
    });
    it('same outer, different holes → outer preserved, holes = intersection of hole sets', () => {
      const r = applyBoolean(
        [poly(square(0, 0, 100), square(10, 10, 30))],
        [poly(square(0, 0, 100), square(60, 60, 30))],
        BooleanOp.Union
      );
      // Holes don't intersect → output has no holes
      expect(r[0].holes ?? []).toHaveLength(0);
    });
    it('B fills part of an A hole → A hole shrinks; outer unchanged', () => {
      /* ... */
    });
    it('B fully covers an A hole (and extends into A solid) → A hole disappears', () => {
      /* ... */
    });
    it('Two A polygons + B bridging them → polygons merge into one', () => {
      /* ... */
    });
    it('Two holes in A do NOT merge under Union (Union cannot bridge empty regions)', () => {
      /* ... */
    });
  });

  describe('Difference', () => {
    it('disjoint → A', () => {
      /* ... */
    });
    it('edge-crossing → A clipped', () => {
      /* ... */
    });
    it('A contains B → A with B as new hole', () => {
      const r = applyBoolean(
        [poly(square(0, 0, 100))],
        [poly(square(40, 40, 20))],
        BooleanOp.Difference
      );
      expect(r).toHaveLength(1);
      expect(r[0].holes).toHaveLength(1);
    });
    it('B contains A → empty', () => {
      const r = applyBoolean(
        [poly(square(40, 40, 20))],
        [poly(square(0, 0, 100))],
        BooleanOp.Difference
      );
      expect(r).toHaveLength(0);
    });
    it('B inside hole of A → A unchanged', () => {
      const a = poly(square(0, 0, 100), square(20, 20, 60));
      const r = applyBoolean(
        [a],
        [poly(square(40, 40, 20))],
        BooleanOp.Difference
      );
      expect(r).toHaveLength(1);
      expect(r[0].holes).toHaveLength(1);
    });
    it('A === B → empty', () => {
      /* ... */
    });
    it('B straddles A hole boundary → hole grows', () => {
      /* ... */
    });
    it('B bridges two A holes → A ends with one merged hole', () => {
      /* ... */
    });
    it('B carves a channel from A hole to A outer → hole merges with exterior; result has no hole', () => {
      // A = 100x100 square with a 20x20 hole at (40,40). B = a thin strip
      // from (40,0) to (60,100) — connects the hole to A's top edge.
      // Expected: result is a single polygon with no hole and a concave
      // outer ring (a "C" shape).
      /* ... */
    });
    it('B fully inside A solid AND enclosing an existing A hole → existing hole gets absorbed into the new larger hole', () => {
      /* ... */
    });
  });

  describe('Intersection', () => {
    it('disjoint → empty', () => {
      /* ... */
    });
    it('edge-crossing → overlap region', () => {
      /* ... */
    });
    it('A contains B → B', () => {
      const r = applyBoolean(
        [poly(square(0, 0, 100))],
        [poly(square(40, 40, 20))],
        BooleanOp.Intersection
      );
      expect(r).toHaveLength(1);
      // result outer ~= B's outer
    });
    it('B inside hole of A → empty', () => {
      /* ... */
    });
    it('A hole overlaps B → hole subtracted from result', () => {
      /* ... */
    });
  });

  describe('XOR', () => {
    it('disjoint → both', () => {
      /* ... */
    });
    it('A contains B → A with B as hole', () => {
      /* ... */
    });
    it('A === B → empty', () => {
      /* ... */
    });
    it('same outer different holes → XOR of holes', () => {
      /* ... */
    });
  });

  describe('Edge guarantees', () => {
    it('empty subject + Union → clips returned', () => {
      /* ... */
    });
    it('empty clip + Difference → subjects returned', () => {
      /* ... */
    });
    it('polygon with <3 vertices is dropped', () => {
      /* ... */
    });
    it('result outer winding is CW', () => {
      /* ... */
    });
    it('result hole winding is CCW', () => {
      /* ... */
    });
  });
});
```

### 7.2 `test/polylineSetOps.spec.ts` — view-reference grouping

```ts
describe('runBooleanOpByView', () => {
  it('different view references never interact (subtract)', () => {
    const a = [{ polyline: square(0, 0, 10), viewReference: V1 }];
    const b = [{ polyline: square(0, 0, 10), viewReference: V2 }];
    const r = runBooleanOpByView(a, b, BooleanOp.Difference);
    expect(r).toEqual(a);
  });
  it('union: B-only view-references pass through', () => {
    /* ... */
  });
  it('intersect: A-only view-references drop', () => {
    /* ... */
  });
  it('subtract: A-only view-references pass through', () => {
    /* ... */
  });
  it('holes survive canvas round-trip', () => {
    /* ... */
  });
});
```

### 7.3 `test/cursorInteractions.spec.ts` — §3 / §4 (integration)

These need a real viewport + annotation state, so they are heavier:

```ts
describe('Shift+drag (subtract polarity)', () => {
  it('stroke fully outside target → no-op', () => {
    /* ... */
  });
  it('stroke fully inside solid → new hole carved', () => {
    /* ... */
  });
  it('stroke fully inside an existing hole → no-op', () => {
    /* ... */
  });
  it('stroke straddling target outer → target shrinks', () => {
    /* ... */
  });
  it('stroke straddling a hole edge → hole grows', () => {
    /* ... */
  });
  it('stroke covering entire target → target removed', () => {
    /* ... */
  });
});

describe('Normal drag (union polarity)', () => {
  it('stroke disjoint → new polygon added', () => {
    /* ... */
  });
  it('stroke inside solid → no-op', () => {
    /* ... */
  });
  it('stroke inside a hole → hole shrinks', () => {
    /* ... */
  });
  it('stroke straddling target outer → target grows', () => {
    /* ... */
  });
  it('stroke bridging two polygons → they merge', () => {
    /* ... */
  });
});

describe('Edit drag (topology change)', () => {
  it('outer self-intersection (figure-eight) → polygon splits', () => {
    /* ... */
  });
  it('edit overlapping sibling polygon → polygons merge (no XOR)', () => {
    /* ... */
  });
  it('outer touches one of its own holes → hole opens into indentation', () => {
    /* ... */
  });
  it('edit crossing another segment → no interaction', () => {
    /* ... */
  });
});
```

### 7.4 `test/combineContour.spec.ts` — §5 (toolbar ops)

One test per cell of the §6 matrix per operation. ~40 cases total.

---

## 8. Implementation notes

The current pipeline implements §5 and §6 by calling
`Clipper.booleanOpDWithPolyTree` with `FillRule.EvenOdd` once per
view-reference group. EvenOdd means: a point is solid iff an odd number of
paths wind around it. Feeding outers and holes into the same path set under
EvenOdd makes Clipper treat the nested hole as an empty cutout regardless of
its winding direction. The result `PolyTreeD` flattens into our
`PolygonWithHoles[]` per §1.1 via `polyTreeToPolygons`.

For §3 / §4 (cursor), the same machinery runs with:

- Subject = the target polygon (plus all its existing holes)
- Clip = the cursor stroke (single polygon, no holes)
- Operation = Difference (shift+drag) or Union (normal drag)

§3.3 / §3.4 are implemented elsewhere — direct polyline edit of the outer
ring, with §3.4 triggering when a self-intersection is detected post-edit.
That detection currently lives in the freehand tool, not the boolean-op
pipeline.
