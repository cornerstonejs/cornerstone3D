---
id: cache
title: Cache
---


# Cache

The Cache API’s role is to keep track of created volumes, manage memory usage, and alert the host application when trying to allocate data that would exceed application defined limits.
Volumes can be created, cached, filled with data, and destroyed by interacting with the Cache API. The Cache API allows us to keep data in memory when changing layouts or contents of viewports, and to share the same underlying data between many viewports (e.g. in a PET/CT Fusion layout, the inverted PT and the fused PT would share the same underlying data stored in the Cache).
