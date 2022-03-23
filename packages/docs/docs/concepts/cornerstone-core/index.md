---
id: index
title: Cornerstone Core
---

import DocCardList from '@theme/DocCardList';
import {useCurrentSidebarCategory} from '@docusaurus/theme-common';


# Core Introduction

- 3D rendering of medical images

  - _New engine:_ We have re-architectured the rendering engine for Cornerstone which implemented a `WebGL` rendering, and have created a wrapper around [vtk.js](https://github.com/kitware/vtk-js)
  - _Shared Texture:_ Our rendering engine can optimally share textures between canvases, so for complex scenarios that may require > 10 viewports, we share the texture between the viewports that _might_ look into the same data from different
    angles (axial, sagittal, or coronal) or fuse them on top of each other.

- Streaming of Volume data
  - We have added a new volume loader which implements a progressive loading of volumes
    to the GPU. You don't need to wait for all of the volume to load to have an initial view. Below, you can see
    streaming of two volumes that are simultaneously loaded into the scenes for a 3x3 PET/CT fusion layout with a MIP view on the right.


<DocCardList items={useCurrentSidebarCategory().items}/>
