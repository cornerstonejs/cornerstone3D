---
id: index
title: Annotations
---

import DocCardList from '@theme/DocCardList';
import {useCurrentSidebarCategory} from '@docusaurus/theme-common';

# Annotations

In `Cornerstone3DTools`, Annotation Tools keep their state in a `state` object. This object is a plain JavaScript object that is
used to store the state of the annotation instance. Information such as the statistics of the annotation, its data
and camera position are stored in this object.

There are various methods for adding/removing, selection, locking and unlocking of annotations. They can be accessed via the `annotations` name space in the `Cornerstone3DTools` by calling:

```js
import { annotation } from '@cornerstonejs/tools';

// All methods to deal with annotation state can be accessed via
annotation.state.XYZ;

// All methods for annotation selection can be accessed via
annotation.selection.XYZ;

// All methods for annotation locking can be accessed via
annotation.locking.XYZ;

// All methods for annotation styling can be accessed via
annotation.config.XYZ;

// The AnnotationGroup class allows for grouping of annotations
annotation.AnnotationGroup;
```

Let's start by looking deeper into each of these methods.

<DocCardList items={useCurrentSidebarCategory().items}/>
