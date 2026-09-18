---
id: crosshairs
title: Crosshairs
summary: What the user expects from the crosshairs control - the intersection lines, the control points that appear on hover, the slab thickness boundary lines, and the behaviour on oblique planes
---

# Crosshairs

## Scope

This specification describes the crosshairs control from the point of view of
the user. It covers the intersection lines, the control points, and the slab
thickness of the plane. It does not cover the reference point marker, which is
a separate control.

Change rule:

- A user requirement changes in two cases only: the requirement describes the
  behaviour wrongly, or the intended user-facing behaviour itself changes. An
  implementation that is inconvenient is never a reason to change a user
  requirement.
- An implementation requirement changes freely when a better approach appears.

## Description

The crosshairs show the user where the other views cut the image of the current
view. Each other view contributes one line. The colour of a line names the
plane of that view: red for axial, yellow for sagittal, green for coronal.

The lines are a control, and not only an indicator. The user drags a line to
move the plane that the line represents. The user rotates the plane with the
round control points. The user changes the slab thickness of the plane with the
hollow control points.

A plane does not need to stay parallel to an anatomical axis. The user rotates
a plane, and the plane becomes oblique. Every requirement in this
specification holds for an oblique plane.

## User requirements

### Lines (CROSSHAIRS-LINE)

- **CROSSHAIRS-LINE-1** The user sees one line for each other view of the same
  data. The user does not see a line for the view under the cursor, and the
  user does not see a line for a view of the same plane.
- **CROSSHAIRS-LINE-2** The user drags a line, and every view of that plane
  moves to the new position. No other view moves.
- **CROSSHAIRS-LINE-3** The user sees the colour of a line, and the user knows
  which plane the line represents.

### Control points on hover (CROSSHAIRS-HOVER)

- **CROSSHAIRS-HOVER-1** The lines carry no control point until the user moves
  the cursor onto a line. The image stays clear while the user reads it.
- **CROSSHAIRS-HOVER-2** The user moves the cursor onto a line, and the control
  points of that line appear: the round points for the rotation, and the hollow
  points for the slab thickness.
- **CROSSHAIRS-HOVER-3** The user moves the cursor from the line to a control
  point of that same line, and the control points stay visible for the whole
  travel. The control points never disappear under the cursor.
- **CROSSHAIRS-HOVER-4** The user reaches every control point that the user
  sees. A control point that the user cannot reach is a defect.
- **CROSSHAIRS-HOVER-5** Two lines cross each other, and the user hovers near
  the point where the lines cross. The control points of the closest line
  appear.
- **CROSSHAIRS-HOVER-6** The application removes a control, and the user gets
  no hover response for that control. The user never selects something that
  does nothing.

### Slab thickness (CROSSHAIRS-SLAB)

- **CROSSHAIRS-SLAB-1** The slab of a plane is thicker than the minimum, and
  the user sees two dashed lines, one on each side of the centre line. The two
  dashed lines show the two boundaries of the slab.
- **CROSSHAIRS-SLAB-2** The hollow control points sit on the dashed boundary
  lines. The user reads the position of a hollow control point, and the user
  knows the boundary that the control point moves.
- **CROSSHAIRS-SLAB-3** The user hovers a dashed boundary line, and the control
  points of that plane appear. The dashed line is part of the control.
- **CROSSHAIRS-SLAB-4** The user hovers the space between the centre line and a
  dashed boundary line, and nothing appears. That space belongs to the image,
  and not to the control.
- **CROSSHAIRS-SLAB-5** The user drags a hollow control point, and the dashed
  boundary line follows the cursor. The control point stays under the cursor.
- **CROSSHAIRS-SLAB-6** The slab is at the minimum, and the user sees no dashed
  line. The hollow control points still appear near the line, because the user
  must be able to make the slab thicker again.

### Oblique planes (CROSSHAIRS-OBLIQUE)

- **CROSSHAIRS-OBLIQUE-1** The user rotates a plane in one view, and the line
  of that plane in a third view becomes oblique. All of the requirements above
  hold in that third view.
- **CROSSHAIRS-OBLIQUE-2** The plane is oblique, and the hollow control points
  stay on the dashed boundary lines. The user does not search for a control
  point that left the line.
- **CROSSHAIRS-OBLIQUE-3** The angle of the plane changes the position of the
  dashed lines, and the control points move with those lines. The user needs no
  knowledge of the angle.

## Implementation requirements

- **CROSSHAIRS-IMPL-1** The `SliceIntersectionTool` implements this control on
  the generic planar viewports.
- **CROSSHAIRS-IMPL-2** The hollow control points take the position from the
  dashed boundary lines that the tool draws. A projection of the slab offset
  gives the wrong position on an oblique plane, so the tool does not use one.
- **CROSSHAIRS-IMPL-3** The `sliceIntersections` example carries a slab
  thickness slider and a toggle for the slab thickness control points. A
  developer reproduces every requirement above with that example.

## Past defects

This section records the defects that the requirements above prevent. A new
defect of the same kind gets a new line here.

- The control points disappeared before the cursor reached them, because the
  hover region held the centre line only. Fixed in
  [PR 2920](https://github.com/cornerstonejs/cornerstone3D/pull/2920).
  Requirement: CROSSHAIRS-HOVER-3.
- The hollow control points left the dashed boundary lines on an oblique plane,
  because the tool computed the position from the slab offset instead of the
  drawn line. Fixed in
  [PR 2920](https://github.com/cornerstonejs/cornerstone3D/pull/2920).
  Requirement: CROSSHAIRS-OBLIQUE-2.
- A hover on a dashed boundary line selected a plane although the application
  had removed the slab control. Fixed in
  [PR 2920](https://github.com/cornerstonejs/cornerstone3D/pull/2920).
  Requirement: CROSSHAIRS-HOVER-6.
- A hover near the point where two dashed boundary lines cross selected the
  wrong plane. Fixed in
  [PR 2920](https://github.com/cornerstonejs/cornerstone3D/pull/2920).
  Requirement: CROSSHAIRS-HOVER-5.
