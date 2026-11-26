---
id: volume-slice-navigation-requirements
title: Volume slice navigation requirements
summary: What a clinician sees when a viewport steps through the slices of a volume - which slices exist in each orientation, which slice a view opens on, what the slice number means, and when a standard orientation shows the acquired images
---

# Volume slice navigation requirements

## Scope

This specification gives the user requirements of the navigation through
the slices of a volume in a planar viewport: the slices that a view of a
volume has, the slice that it opens on, and what the slice number and the
number of slices mean. It names no class, file or algorithm. The design that
meets it is in the
[implementation specification](./implementation.md).

The "clinician" is the person who reads the images. A "slice" is the plane
that the viewport shows; a "voxel" is one sample of the volume, a box with
the spacing of the volume as its sides. A "one-step traversal" is a scroll
from the first slice of a view to its last, one slice at a time.

Change rule: change a requirement of this document only when the
requirement describes the behaviour wrongly, or when the intended behaviour
for the clinician changes. An implementation that is inconvenient is not a
reason to change a requirement.

## The slices of a view

- **VSN-U-1** A one-step traversal of the volume shows each voxel on exactly
  one slice, in every orientation. No voxel is skipped, and no voxel shows on
  two slices. So a voxel that the clinician paints on one slice shows on
  that slice only, not on the next or the previous one.
- **VSN-U-2** A view along an axis of the volume, such as an axial view of an
  axial series, has one slice for each plane of voxels, and each slice goes
  through the centres of the voxels of that plane. Its number of slices is
  the number of planes of voxels along that axis.
- **VSN-U-3** The first and the last slice of a view lie the same distance
  from the edges of the volume, and each lies inside the voxels of its edge.
  An oblique view has no slice outside the volume and no slab of the volume
  that no slice shows.

## The slice a view opens on

- **VSN-U-4** A view of a volume that asks for no slice opens on the middle
  slice counted along the view: of N slices, numbered from 1 in the order
  that a scroll forward shows them, slice `floor(N / 2) + 1`. An odd number
  of slices has one middle slice. An even number has two, and the view opens
  on the second of them in the order of the view, whichever way the view
  looks along the axis.
- **VSN-U-5** A view that asks for a slice, or for a point of the volume,
  opens on that slice, or on the slice that shows that point.

## The slice number

- **VSN-U-6** The slice number of a view is the slice on display, and the
  number of slices is the number of slices that a one-step traversal shows.
  A scroll by one slice moves the view by one slice number, and a jump to a
  slice number shows that slice.
- **VSN-U-7** A slice number belongs to its view: the same number in another
  orientation, or in the same orientation with another number of slices,
  names another plane. To come back to a plane later, the application keeps
  a view reference with its point and its orientation.

## Standard orientations of a tilted series

- **VSN-U-8** A series whose images are tilted from a standard orientation
  (axial, sagittal or coronal) so little that the plane of an image moves by
  less than half a slice across the image shows its acquired images when the
  clinician asks for that orientation. A series tilted further shows the
  true standard orientation, reformatted from the volume, as the legacy
  volume viewport showed it.
- **VSN-U-9** Images that cannot form a volume show as acquired, whatever
  standard orientation is asked for.
