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


Scenes are concepts that let Cornerstone-3D understands that which viewports are rendering the same volume.


## Volume Scenes
You don't create Scenes manually; instead you use the `renderingEngine` API for creating the `volumeViewports` and defining the same `SceneUID` for them. This way, Cornerstone-3D will utilize the same 3D array for rendering of different view orientations.


### Internal Scenes
In order to have a cohesive design, `StackViewports` also have a Scene; however, you don't need to assign a SceneUID to stackViewports, and an internal unique identifier will get assigned to it.
