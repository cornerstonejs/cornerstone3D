---
id: locking
title: Locking
---

# Locking

Annotations can be locked to avoid accidental changes. You can use
the locking API to lock/unlock annotations.

## API

There are various APIs for locking and unlocking annotations along with get/set methods

```js
import { annotations } from '@cornerstonejs/tools';

// locking of an annotation
annotations.locking.setAnnotationLocked(annotation, (locked = true));

// get all the locked annotations
annotations.locking.getAnnotationsLocked();

// unlock all annotations
annotations.locking.unlockAllAnnotations();
```

## Read more

:::note TIP
Read more about the locking API [here](/api/tools/namespace/annotation#locking)
:::
