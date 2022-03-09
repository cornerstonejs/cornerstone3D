---
id: tools-configuration
---


# Configuration

### @Tools

This requires all of the above [Cornerstone-core configurations](./core-configuration.md), as well as the following:

```js
// Import "from" will change depending on package publishing strategy
import * as csTools3d from '@ohif/cornerstone-tools'

// Wire up listeners for renderingEngine
csTools3d.init()
```
