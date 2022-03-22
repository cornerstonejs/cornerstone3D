# Cornerstone-render

Cornerstone-3D is a lightweight Javascript library for visualization and manipulation of medical images in modern web browsers that support the HTML5 canvas element.

We have revisited the idea of image rendering in browsers, and re-built various functionalities to enable fast and performant visualization for most complex imaging use cases.

What is new?
- 3D rendering of medical images
  - New engine: We have re-architectured the rendering engine for Cornerstone which implemented a WebGL rendering, and have created a wrapper around vtk.js
  - Shared Texture: Our rendering engine can optimally share textures between canvases, so for complex scenarios that may require > 10 viewports, we share the texture between the viewports that might look into the same data from different angles (axial, sagittal, or coronal) or fuse them on top of each other.
