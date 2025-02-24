---
id: threshold-tools
title: 'Labelmap Thresholding Tools'
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# No Predefined Defaults

We no longer have any default thresholds.

```json
strategySpecificConfiguration: {
  THRESHOLD: {
    threshold: [-150, -70], // E.g. CT Fat; only used during threshold strategies.
  },
},
```

Now, it's simply:

```json
strategySpecificConfiguration: {}
```

It is up to you to configure the thresholding tools as you see fit.
