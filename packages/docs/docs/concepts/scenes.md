---
id: scenes
title: Scenes
---


# Scenes

A scene defines a unique space in which data can be added. Viewports can then view this data from different perspectives (e.g. along the axial, sagittal and coronal views). A scene’s world space is in physical coordinates (mm), with the same Frame of Reference as its volumes.

Multiple scenes can occupy the same frame of reference, but contain different data. For example in a 3x3 PT/CT/Fusion layout there will be three scenes with the same frame of reference, but containing different data:

- The CT Scene - containing a CT volume
- The PT Scene - containing a PT volume
- The Fusion Scene - containing both CT + PT volume (fused)
