---
id: visibility
title: Visibility
---

# Visibility

Annotations can have their visibility changed. You can use
the visibility API to show/hide annotations.

## API

There are various APIs for showing and hiding annotations along with get/set methods

```js
import { annotations } from '@cornerstonejs/tools';

// changing an annotation visibility to be visible (implicit visible param).
annotations.visibility.setAnnotationVisibility(annotationUID);

// changing an annotation visibility to NOT be visible.
annotations.visibility.setAnnotationVisibility(annotationUID, false);

// get all the hidden annotations uids.
annotations.visibility.getAnnotationUIDsHidden();

// get the number of hidden annotations.
annotations.visibility.getAnnotationUIDsHiddenCount();

// show all annotation(hidden)
annotations.visibility.showAllAnnotations();

// get if an annotation is visible or not.
// Possible results are: undefined if there is no annotation for given UID, true if visible and false if not.
annotations.visibility.isAnnotationVisible(annotationUID);
```

## Read more

:::note TIP
Read more about the visibility API [here](/api/tools/namespace/annotation#visibility)
:::
