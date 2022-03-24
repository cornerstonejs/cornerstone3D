---
id: index
title: Cornerstone Tools
---

import DocCardList from '@theme/DocCardList';
import {useCurrentSidebarCategory} from '@docusaurus/theme-common';


# Tools Introduction



## Tools

As seen in `CornerstoneCore3D` [documentation](./core-introduction.md), our GPU rendered images use the
image metadata (such as direction and origin) to place the image at the correct position in the 3D world.
In fact, both our [Volume Viewports](./concepts/)

at the exact
location, with the exact orientation and direction in the 3D

With a rendering library where everything exists in 3D space (even our stack viewports are rendered at the actual position and normal direction in space), rather than a 2D plane, we need to rethink how we do tool interactions. We are building a framework similar to CornerstoneTools called `CornerstoneTools3D` which will sit on top of the new rendering library.

- Annotations are now stored in 3D patient space in a particular DICOM Frame of Reference (FoR). Previously, tools were attached to individual images by their unique image ID.
  In general, all images in a single DICOM study exist in the same FoR (e.g. both PET and CT in a PET/CT acquisition). Transformation matrices can be produced which can convert between frames of references. This is performed in order to map tools between imaging timepoints or between co-registered series (e.g. contrast CT to non-contrast CT).

- A single Scene can include multiple imaging Volumes (e.g. a fusion scene would include both PET and CT, and possibly a segmentation volume).
  This impacts the tool library since previous APIs for setting e.g. the "viewport" parameters (e.g. window/level) in Cornerstone are no longer sensible, since they only affect one volume.

- Navigating in the volume is performed in 3D space by moving the camera. This means that helpers used for scrolling to images in the stack will be removed (i.e. scrollToIndex). For StackViewports a new volume actor is created for each slice and camera is modified accordingly.

- You can use the following tools to create an annotation in 3D:
  - Probe
  - Length
  - Bidirectional
  - Rectangle ROI
  - Elliptical ROI

We are currently working on re-building the segmentation rendering in 3D and adding 3D segmentation editing tools to `Cornerstone-Tools`.
You can subscribe to our newsletter to get notified instantly of new additions and changes.


<DocCardList items={useCurrentSidebarCategory().items}/>
