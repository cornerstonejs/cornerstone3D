---
id: faq
title: Frequently Asked Questions
summary: Answers to common questions about the differences between Cornerstone legacy and Cornerstone3D, including design choices, architectural changes, and feature comparisons
---

# Frequently Asked Questions

### What is the difference between Cornerstone (legacy) and Cornerstone3D (alpha) and react-vtkjs-viewport?

Although Cornerstone (legacy) has gpu-accelerated rendering through webgl, it only handles
2D rendering of medical images. To address this issue, we created [react-vtkjs-viewport](https://github.com/OHIF/react-vtkjs-viewport) which enabled 3D rendering of medical images by moving the
rendering functionalities to [`vtk.js`](https://github.com/kitware/vtk-js), a powerful rendering library. However, vtk.js uses WebGL instances per viewport, and this does not scale for situations like PET/CT hanging protocols which may require > 10 viewports on-screen simultaneously, due to GPU memory constraints (textures are not shared across canvases) and WebGL context limits (a maximum of 16 contexts can exist per browser tab). In addition, `vtk.js` does not provide support for SVG annotation tools.

To satisfy complex imaging use cases, we have chosen to build Cornerstone rendering engine from the ground up for efficient GPU memory usage. This rendering engine abstracts many of the technicalities of `vtk.js`; it processes data offscreen in one WebGL canvas, and transfers the resulting images to on-screen canvases.

This approach allows us to efficiently share GPU texture memory between different views/representations of the same data. For example, in a PET/CT Fusion MPR hanging protocol, only one PET volume is stored in the GPU memory and is used when rendering both the inverted PET and fusion PET viewports.

### What are the feature parity between Cornerstone and Cornerstone3D?

The following will not be migrated at the current time

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
    <td>Mixins</td>
    <td>Mixins are self registering addons for tools introduced in CornerstoneTools 3.0+. We found there are more useful design patterns for making tools by composition, such as wrapping common utility functions. We intend to deprecate this feature.</td>
  </tr>
  <tr>
    <td>Registered third-party content other than tools (custom manipulators, utils, etc).</td>
    <td>We feel utils should just be wrapped up in NPM libraries and imported, and the old framework was probably too heavy for its use cases.</td>
  </tr>
</tbody>
</table>
