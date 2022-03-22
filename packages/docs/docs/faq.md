---
id: faq
---

# Frequently Asked Questions

<br />


## How does Cornerstone-3D relate to cornerstone-core and cornerstone-tools library?

Cornerstone-3D is developed by the same team that developed `cornerstone-core` and `cornerstone-tools`. Cornerstone-3D, and Cornerstone-3D-Tools provide the
following advantages:

- **Rendering**: new rendering engine for to enable advanced visualizations using [vtk.js](https://github.com/kitware/vtk-js)
- **Optimal Memory Usage**: enables image rendering with high performance and low memory usage for complex scenarios that may require > 10 viewports using shared textures
- **Volume Streaming**: streaming of volumes and progressively loading them to the GPU to enable faster initial view and interaction
- **3D annotation tools**: addition of 3D annotation tools for volumes even for reconstructed views
- **SVG Annotations**: addition of SVG annotations which significantly guarantees crisp rendering of annotations on high resolution monitors


### What is the difference between Cornerstone (legacy) and Cornerstone 3D (alpha) and react-vtkjs-viewport?

Although Cornerstone (legacy) has gpu-accelerated rendering through webgl, it only handles
2D rendering of medical images. To address this issue, we created [react-vtkjs-viewport](https://github.com/OHIF/react-vtkjs-viewport) which enabled 3D rendering of medical images by moving the
rendering functionalities to [`vtk.js`](https://github.com/kitware/vtk-js), a powerful rendering library. However, vtk.js uses WebGL instances per viewport, and this does not scale for situations like PET/CT hanging protocols which may require > 10 viewports on-screen simultaneously, due to GPU memory constraints (textures are not shared across canvases) and WebGL context limits (a maximum of 16 contexts can exist per browser tab).

To satisfy complex imaging use cases, we have chosen to build Cornerstone rendering engine from the ground up for efficient GPU memory usage. This rendering engine abstracts many of the technicalities of `vtk.js`; it processes data offscreen in one WebGL canvas, and transfers the resulting images to on-screen canvases.

This approach allows us to efficiently share GPU texture memory between different views/representations of the same data. For example, in a PET/CT Fusion MPR hanging protocol, only one PET volume is stored in the GPU memory and is used when rendering both the inverted PET and fusion PET viewports.
