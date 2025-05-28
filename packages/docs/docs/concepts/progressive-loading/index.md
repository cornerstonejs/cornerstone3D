---
id: index
title: Progressive Loading
summary: System for incrementally loading medical images, enabling faster initial display by loading smaller or lossy versions first, then enhancing quality as more data arrives
---

import DocCardList from '@theme/DocCardList';
import {useCurrentSidebarCategory} from '@docusaurus/theme-common';

# Progressive Loading

We have added a new progressive loader for both stack and volume images. For
stack images, the progressive loader can load a smaller or lossy image, while
for volumes, both smaller/lossy images and fully interleaved versions can be
loaded to speed up the loading process.

<DocCardList items={useCurrentSidebarCategory().items}/>
