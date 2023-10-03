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
import { annotations } from '@cornerstonejs/tools';

// All methods to deal with annotation state can be accessed via
annotations.state.XYZ;

// All methods for annotation selection can be accessed via
annotations.selection.XYZ;

// All methods for annotation locking can be accessed via
annotations.locking.XYZ;

// All methods for annotation styling can be accessed via
annotations.config.XYZ;
```

Let's start by looking deeper into each of these methods.

<DocCardList items={useCurrentSidebarCategory().items}/>
