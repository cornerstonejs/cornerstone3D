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
import { annotation } from '@cornerstonejs/tools';

// changing an annotation visibility to be visible (implicit visible param).
annotation.visibility.setAnnotationVisibility(annotationUID);

// changing an annotation visibility to NOT be visible.
annotation.visibility.setAnnotationVisibility(annotationUID, false);

// show all annotation(hidden)
annotation.visibility.showAllAnnotations();

// get if an annotation is visible or not.
// Possible results are: undefined if there is no annotation for given UID, true if visible and false if not.
annotation.visibility.isAnnotationVisible(annotationUID);
```

## Read more

:::note TIP
Read more about the visibility API [here](/api/tools/namespace/annotation#visibility)
:::
