---
id: scope
---

# Scope

This is the scope of the project.



This repository contains three projects:

- `/packages/cornerstone-render`: The rendering library equivalent of `cornerstone-core`
- `/packages/cornerstone-tools`: The tool library equivalent of `cornerstone-tools`
- `/packages/cornerstone-image-loader-streaming-volume`: For streaming the volumes into the viewport and progressively loading them
- `/demo`: Consumes all of the above libraries to demonstrate functionality in various `react` demo apps.

In an effort to slowly and intentionally grow the API surface area of these libraries,
we at times rely on functionality in their predecessors. In that same vein, the `demo`
project has a `helpers` folder containing functionality that many consumers of
these libraries would benefit from. These helper functions demonstrate how a consumer can:

- register an external metadata provider
- register an image and volume loader
- add metadata to the provider
- sort the imageIds and lots of other useful utility functions


At a later date, those helpers may make their
way back into the rendering and tool libraries.


## Core

- 3D rendering of medical images
  - *New engine:* We have re-architectured the rendering engine for Cornerstone which implemented a `WebGL` rendering, and have created a wrapper around [vtk.js](https://github.com/kitware/vtk-js)
  - *Shared Texture:* Our rendering engine can optimally share textures between canvases, so for complex scenarios that may require > 10 viewports, we share the texture between the viewports that _might_ look into the same data from different
  angles (axial, sagittal, or coronal) or fuse them on top of each other.

- Streaming of Volume data
  - We have added a new volume loader which implements a progressive loading of volumes
  to the GPU. You don't need to wait for all of the volume to load to have an initial view. Below, you can see
  streaming of two volumes that are simultaneously loaded into the scenes for a 3x3 PET/CT fusion layout with a MIP view on the right.


## High level design considerations

These libraries expand upon and update the interfaces `cornerstone.js` provided
to better support volume rendering, 3D aware tools, and PET images support. These
interfaces and functionality are broadly identified as:

- Rendering / Renderer
- Image Loading / Image Loader
- Metadata Provider
- Tools

`@ohif/cornerstone-render` is a "rendering" library built on top of `vtk.js`.
which leverages `cornerstone`'s existing plumbing to integrate with image loaders and metadata providers. The `demo` package in this repository contains a simple "metadata provider", named "WADORSHeaderProvider", that allows for querying metadata by instance and
imageId.

This repository's `@ohif/cornerstone-tools` is a "tools" library that, once initialized, will listen for custom events emitted by `@ohif/cornerstone-render`. Please note, the event naming and handling overlaps the events and event handling in the `cornerstone-tools` library. If you attempt to use `cornerstone-tools` in tandem, you will likely encounter issues. As this is a possible use case, please don't hesitate to report any issues and propose potential solutions.


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
    <td>Styling configuration (i.e. textStyle/annotationStyle/toolColors)</td>
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
