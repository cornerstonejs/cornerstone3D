---
id: synchronizers
title: Synchronizers
---


# Synchronizers

Synchronizers can be used to link particular actions across viewports (e.g. sync pan/zoom interaction), but they can also be used to tie any callback to a particular event. We expect these to be largely similar to their current state in CornerstoneTools. Synchronizers require:

An event to listen for

A function to call when that event is raised on a source viewport

An array of source viewports (currently given as DOM elements, but this will become viewport UIDs)

An array of target viewports (currently given as DOM elements, but this will become viewport UIDs)

The provided function receives the event, source viewports, and target viewports, and is often used to check “some value” on the source viewport. The function then updates the target viewports, often using public API exposed by the core library, to match that state/value.

Similar to the Tool Groups implementation describe above, we intend to make a Synchronization Manager which contains synchronizer groups, that contain one or more synchronizers and can be attached to individual viewports (e.g. all axial viewports in a 3x3 PET/CT layout should sync their pan/zoom and window/level, all CT viewports and the fusion viewport should sync window/level). The goal of this will be to simplify the API of the Synchronizer framework in CornerstoneTools. We have not yet finalized the Synchronizer Manager API, but expect it to be similar to the API for Tool Groups.
