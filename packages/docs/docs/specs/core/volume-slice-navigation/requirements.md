---
id: volume-slice-navigation-requirements
title: Volume slice navigation requirements
summary: What a user must be able to see when the user steps through the slices of a volume
---

# Volume slice navigation requirements

## Scope

This specification gives the user requirements for the navigation through the
slices of a volume in a planar view, in any orientation. It applies to the
Generic Viewport and to the legacy volume viewport. It names no class, file or
algorithm.

The implementation requirements are in the
[volume slice navigation implementation specification](./implementation.md).
That document can change when a better approach appears.

Change rule: change a requirement of this document only when the requirement
describes the behaviour wrongly, or when the intended behaviour for the user
changes. An implementation that is inconvenient is not a reason to change a
requirement.

## Requirements

- **VSN-U-1** When the user steps through all of the slices of a volume one
  slice at a time, from the first slice to the last slice, each voxel of the
  volume shows on exactly one slice. This holds for an acquisition
  orientation, for a standard orientation, and for an oblique orientation.
- **VSN-U-2** No voxel shows on two adjacent slices. For example, a
  segmentation that the user paints on one oblique slice does not show on the
  next slice or on the previous slice.
- **VSN-U-3** The first slice shows the voxels at one edge of the volume, and
  the last slice shows the voxels at the opposite edge. The user can see the
  edge voxels without a step outside the volume.
- **VSN-U-4** When the view is parallel to the acquired images, each slice
  shows one acquired image, and the number of slices is the number of acquired
  images.
- **VSN-U-5** The first slice and the last slice are at the same distance
  from the centre of the volume. The two edges of the volume show in the same
  way.
