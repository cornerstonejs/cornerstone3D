---
id: index
title: Behaviour
summary: Formal, test-backed behaviour definitions for Cornerstone3D algorithms and subsystems — the guarantees they provide, how to use them, and the volumes and test cases that lock each behaviour in
---

import DocCardList from '@theme/DocCardList';
import {useCurrentSidebarCategory} from '@docusaurus/theme-common';

# Behaviour

Behaviour definitions are the **source-of-truth specifications** for
Cornerstone3D algorithms and subsystems whose correctness matters for
downstream tools and integrations. Each page documents:

- the **guarantees** the implementation must satisfy,
- **usage** for contributors and advanced integrators,
- and the **volumes and test cases** that lock the behaviour in.

Concept guides explain how a feature works from a user or integrator
perspective. Migration guides describe what changed between releases.
Behaviour definitions sit between the two: they are precise enough to
regress against in unit tests and stable enough to cite when reviewing
PRs or debugging subtle geometry bugs.

When you add or change an algorithm whose output must be deterministic,
orientation-independent, or mathematically exact (for example voxel
ownership on oblique planes), add a behaviour page here and link the
relevant tests and volumes on that page.

<DocCardList items={useCurrentSidebarCategory().items.filter(item => item.docId !== 'behaviour/index')}/>
