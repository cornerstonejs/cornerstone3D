---
id: index
title: Cornerstone Tools
summary: Framework for creating and managing interactive tools for manipulating and annotating medical images in 3D space, with annotations stored in patient coordinates
---

import DocCardList from '@theme/DocCardList';
import {useCurrentSidebarCategory} from '@docusaurus/theme-common';

# Tools Introduction

## Tools

With `Cornerstone3D` core library where each image renders in physical space (even our stack viewports are rendered at the actual position and normal direction in space), rather than any arbitrary 2D plane, we built a `Tools` library to be able to create and manipulate tools in 3D space.
In `Cornerstone3DTools`, annotations are now stored in 3D patient space in a particular DICOM Frame of Reference (FoR). In general, all images in a single DICOM study exist in the same FoR (e.g. both PET and CT in a PET/CT acquisition). Let's take a look at some concepts
that we will use in this library.

<DocCardList items={useCurrentSidebarCategory().items}/>
