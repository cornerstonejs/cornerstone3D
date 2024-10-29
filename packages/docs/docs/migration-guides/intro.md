---
id: intro
title: 'The Journey Forward'
---

When we first designed Cornerstone3D's segmentation architecture roughly two years ago, we made what seemed like a natural choice: treating segmentations as tools bound to tool groups. This architecture served us well, powering countless medical imaging applications as we know. But as we pushed the boundaries of what's possible in medical image visualization, we began to encounter limitations we couldn’t ignore.

Segmentations, as we’ve realized, are more than just tools—they're core data structures that deserve to be treated as first-class citizens in our visualization pipeline. The tool group-centric approach, while elegantly simple, began to limit our ability to innovate. Supporting advanced use cases—such as volume rendering of surfaces, displaying multiple representations of the same segmentation across different viewports, offering viewport-specific customization, or even just hiding a segmentation in an MPR layout—was all constrained by the old model.

In breaking from this model, we realized we could also simplify how we handle voxel data across the board as well. Enter VoxelManager: a game-changer for memory efficiency and data clarity. Instead of clunky, memory-hogging scalar data arrays, VoxelManager uses a smarter, image-based approach to manage voxel data for both stacks and volumes. Now, instead of scattered data access images and volumes, we have a single source of truth—one that doesn’t just cut down on memory but also makes everything smoother and more intuitive.

With the new viewport-centric architecture, we’re unlocking doors that were previously closed—from sophisticated contour + labelmap + surface renderings to granular, viewport-specific control over segmentation appearances. And now, thanks to VoxelManager, we can now better handle complex data with the precision and efficiency our users need.

This migration guide will walk you through these changes, showing not only how to update your code but also how to leverage the new capabilities this architecture brings. The path forward may require some adaptation, but it leads to a more powerful, flexible, and maintainable system.

In the end, we chose progress over convenience—because it isn’t always the easy path, but it’s the only one that moves us forward.

<div style={{ textAlign: 'right' }}>
  <i>
    Alireza Sedghi, PhD
  </i>

</div>
