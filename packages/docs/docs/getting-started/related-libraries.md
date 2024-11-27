---
id: related-libraries
---

# Related Libraries

In this section we will explain various libraries that are related to `Cornerstone3D`.

## History

Before explaining the libraries, we will first discuss the history of `Cornerstone3D`.
Prior to `Cornerstone3D` we developed and maintained [`cornerstone-core`](https://github.com/cornerstonejs/cornerstone)
and [`cornerstone-tools`](https://github.com/cornerstonejs/cornerstoneTools)
since 2014. Since the significance of improvements in `Cornerstone3D` over `cornerstone-core` and `Cornerstone3DTools` over `cornerstone-tools`
is much greater, in long term we will switch our focus to `Cornerstone3D` and
provide adequate documentation for how to upgrade from legacy `cornerstone`
to the new `Cornerstone3D`. In the meantime, we will continue to maintain
the legacy `cornerstone` packages and take care of potential critical bugs.

In addition to the `cornerstone-core` and `cornerstone-tools` packages, we have also maintained
[`react-vtkjs-viewport`](https://github.com/OHIF/react-vtkjs-viewport) our first iteration
to enable 3D rendering using [vtk-js](https://github.com/kitware/vtk-js) in React.
`react-vtkjs-viewport` is currently being used in the current main OHIF Viewer for the MPR
views. One of the main motivations that prompted the development of the `Cornerstone3D` was
the desire to be able to decouple the rendering from the UI by React similar to `cornerstone-core`.
In addition, `react-vtkjs-viewport`'s memory management was a major challenge for more complex
scenarios such as a PET/CT fusion with 10 viewports. Similar to
legacy cornerstone, we will shift our efforts from `react-vtkjs-viewport` to use the new
`Cornerstone3D` and `Cornerstone3DTools` packages.

## Libraries

### vtk.js

[`vtk-js`](https://github.com/kitware/vtk-js) is an open-source javascript library for 3D computer graphics, image processing and visualization.
In the past, we have used `vtk-js` for rendering and interacting with 3D data
in `react-vtkjs-viewport` library. `Cornerstone3D`'s Rendering Engine has been designed
to use `vtk-js` for 3D rendering. `vtk-js` has annotation support using tools, but we have
decided to use `Cornerstone3DTools` for this purpose, and only rely on `vtk-js` for
the actual rendering. Our roadmap (not funded yet) includes enabling usage of `vtk-js`
3D annotation tools in `Cornerstone3D`.

### OHIF Viewer

[Open Health Imaging Foundation (OHIF)](https://ohif.org/) image viewer is an open source image viewer
that is being used in academic and commercial projects such as [The Cancer Imaging Archive (TCIA)](https://www.cancerimagingarchive.net/) and [NCI Imaging Data Commons](https://datacommons.cancer.gov/repository/imaging-data-commons).
It is an extensible web imaging
platform with zero footprint and installation required. Currently, OHIF 3.9 relies on the all the libraries in the `Cornerstone3D` monorepo for its image rendering and annotation features.
