---
id: statistics
title: 'Segmentation Statistics API'
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';


## Key Changes:

* Statistics calculation has been moved from brush tool methods to a dedicated utility function
* Statistics are now calculated asynchronously using web workers
* The function signature for getting statistics has changed completely
* Progress events are now emitted during statistics calculation

## Migration Steps:

### 1. Replace tool-based statistics methods with the standalone utility

**Before:**
```diff
- const toolGroup = ToolGroupManager.getToolGroup(toolGroupId);
- const activeName = toolGroup.getActivePrimaryMouseButtonTool();
- const brush = toolGroup.getToolInstance(activeName);
- const stats = brush.getStatistics(viewport.element, { indices });
```

**After:**
```diff
+ const stats = await segmentationUtils.getStatistics({
+   segmentationId,
+   segmentIndices: indices,
+   viewportId: viewport.id,
+ });
```

:::note
ViewportId is needed since some statistics calculations are performed regarding the base image in the viewport.
:::
