---
id: tools-introduction
---

# Introduction

`CornerstoneTools3D` is a JavasScript library that works with the `CornerstoneCore3D` library to provide a set of tools for image annotation, segmentation and manipulation. This library also provides a framework for creating new tools, managing all tools in a consistent, cohesive manner, importing/exporting tool measurement data along with various Segmentation editing tools.

`CornerstoneTools3D` is not stand-alone library; it builds on top of `CornerstoneCore3D`; a standards compliant, fast, and extensible JavaScript library that displays interactive medical images.

## What is new?

As seen in `CornerstoneCore3D` [documentation](./core-introduction.md), our GPU rendered images use the
image metadata (such as direction and origin) to place the image at the correct position in the 3D world.
In fact, both our [Volume Viewports](./concepts/)

 at the exact
location, with the exact orientation and direction in the 3D


With a rendering library where everything exists in 3D space (even our stack viewports are rendered at the actual position and normal direction in space), rather than a 2D plane, we need to rethink how we do tool interactions. We are building a framework similar to CornerstoneTools called `CornerstoneTools3D` which will sit on top of the new rendering library.

- Tool data is now stored in 3D patient space in a particular DICOM Frame of Reference (FoR). Previously, tools were attached to individual images by their unique image ID.
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

## Migration plans

The following will not be migrated at the current time, as we do not need these for our immediate goals of planar annotation tools. They could be added in future work:

<table>
<thead>
  <tr>
    <th>Feature</th>
    <th>Reason</th>
  </tr>
</thead>
<tbody>
  <tr>
    <td>Cornerstone Modules</td>
    <td>In CornerstoneTools these are namespaced plugins used to store tool-wide metadata in a custom manner, whilst also having initialization hooks for enabled/disabled events. They are not necessary for simple planar tools and as such will not be available in the first version.</td>
  </tr>
  <tr>
    <td>Cursor State/Module</td>
    <td>Cursors are polish that are not a priority for this first leg of work.</td>
  </tr>
  <tr>
    <td>Styling configuration (i.e. textStyle/toolStyle/toolColors)</td>
    <td>In the first pass we shall focus on the functionality, and there is no plan to migrate these customization options yet.</td>
  </tr>
  <tr>
    <td>Mixins</td>
    <td>Mixins are self registering addons for tools introduced in CornerstoneTools 3.0+. We found there are more useful design patterns for making tools by composition, such as wrapping common utility functions. We intend to deprecate this feature.</td>
  </tr>
  <tr>
    <td>Registered third party content other than tools (custom manipulators, utils, etc).</td>
    <td>We feel utils should just be wrapped up in NPM libraries and imported, and the old framework was probably too heavy for its use cases.</td>
  </tr>
</tbody>
</table>
