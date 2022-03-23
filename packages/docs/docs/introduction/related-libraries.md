---
id: related-libraries
---

# Related Libraries

In this section we will explain the relationship between different libraries that
we maintain and use.

## cornerstone-core & cornerstone-tools

[`cornerstone-core`](https://github.com/cornerstonejs/cornerstone) and [`cornerstone-tools`](https://github.com/cornerstonejs/cornerstoneTools) are two packages that we have been developing
and maintaining since 2014. Since the significance of
improvements in `cornerstone3D` over `cornerstone-core` and `cornerstone3DTools` over `cornerstone-tools`
is much greater, in long term we will switch our focus to `cornerstone3D` and
provide adequate documentation for how to upgrade from legacy `cornerstone`
to the new `cornerstone3D`. In the meantime, we will continue to maintain
the legacy `cornerstone` packages and take care of potential critical bugs.




## OHIF Viewer

[Open Health Imaging Foundation (OHIF)](https://ohif.org/) image viewer is an open source image viewer
that is being used in academic and commercial projects such as [The Cancer Imaging Archive (TCIA)](https://www.cancerimagingarchive.net/) and [NCI Imaging Data Commons](https://datacommons.cancer.gov/repository/imaging-data-commons).
It is an extensible web imaging
platform with zero footprint and installation required. Currently, OHIF relies on the `cornerstone-core` and `cornerstone-tools` libraries for its image rendering and annotation features and OHIF team has been actively maintaining
these libraries for the past several years.

As `cornerstone3D` and `cornerstone3DTools` will replace
`cornerstone-core` and `cornerstone-tools` in the future, OHIF in its next stable release (v3)
will move towards using `cornerstone3D` and `cornerstone3DTools` instead of `cornerstone-core` and `cornerstone-tools`.
You can see OHIF's roadmap for the next stable release [here](https://ohif.org/roadmap/).



## react-vtkjs-viewport

[`react-vtkjs-viewport`](https://github.com/OHIF/react-vtkjs-viewport) is our first iteration
to enable 3D rendering using [vtk-js](https://github.com/kitware/vtk-js) in React. It has been
developed by the OHIF team and is being used in the current main OHIF Viewer for the MPR
views. One of the main motivations that prompted the development of the `cornerstone3D` was
the desire to able to decouple the rendering from the UI by React similar to `cornerstone-core`.
In addition, `react-vtkjs-viewport`'s memory management was a major challenge for more complex
scenarios such as a PET/CT fusion with 10 viewports. In future, `cornerstone3D` will replace
`react-vtkjs-viewport` and provide 3D functionalities in a more efficient and scalable way.
