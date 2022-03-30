---
id: selection
title: Selection
---

# Selection

Annotations can be selected and deselected. This is achieved by holding down the `Shift` key (by default) and clicking on annotations.

## API

There are various APIs for selecting and deselecting annotations along with get/set methods

```js
import { annotations } from '@cornerstone/tools';

// selection of an annotation
annotations.selection.setAnnotationSelected(annotation);

// get all the selected annotations
annotations.selection.getAnnotationsSelected();

// get all selected annotations from a specific tool
annotations.selection.getAnnotationsSelectedByToolName(toolName);
```

## Read more

:::note TIP
Read more about the selection API [here](/api/tools/namespace/annotation#selection)
:::
