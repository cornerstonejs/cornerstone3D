---
id: geometryLoader
title: Geometry Loaders
---

# Geometry Loaders

This section describes the geometry loaders that are available in Cornerstone Core.

If you read the Segmentation rendering [section](../cornerstone-tools/segmentation/index.md)
you can see that a Segmentation ca be rendered as a Volume (Labelmap), or it can be
rendered as a Contour, Surface, or Mesh.

:::note TIP
Similar relationship structure has been adapted in popular medical imaging softwares
such as [3D Slicer](https://www.slicer.org/) with the addition of [polymorph segmentation](https://github.com/PerkLab/PolySeg).
:::

In Cornerstone3D we are using the same concept of a Segmentation Representation, and for loading the data in format of geometry, we are using the Geometry Loader.

Geometry loaders are used to load geometry data from a file or URL. Currently,
we only support loading and caching the Contour geometry using the `createAndCacheGeometry` (which accepts only the data, so no loading yet) however, additional loaders such as XML, JSON, OBJ, STL, PLY, etc. can be added in the future so that the user can load the geometry data in different formats.
