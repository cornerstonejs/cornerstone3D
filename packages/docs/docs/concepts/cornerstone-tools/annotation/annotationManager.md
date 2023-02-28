---
id: annotationManager
title: Annotation Manager
---

The Annotation Manager is a singleton class that manages annotations in Cornerstone Tools.
We use the Annotation Manager to store annotations, retrieve annotations, and save and restore annotations.

## Default Annotation Manager
The default Annotation Manager, `FrameOfReferenceSpecificAnnotationManager`, stores annotations based on the FrameOfReferenceUID.
This means that annotations are stored separately for each FrameOfReferenceUID.

Currently in our rendering pipeline, if two VolumeViewports share the same
FrameOfReferenceUID, they will share the same annotations. However, StackViewports
works on the per imageId basis, so annotations are not shared between StackViewports.

### GroupKey
Annotation groups are identified by a groupKey. The groupKey is a string that is used to identify the group of annotations.
As mentioned above, the default Annotation Manager stores annotations based on the FrameOfReferenceUID, so the groupKey is the `FrameOfReferenceUID`.



## Custom Annotation Manager

You can create your own custom Annotation Manager by implementing the `IAnnotationManager` interface:

```ts
interface IAnnotationManager {
  getGroupKey: (annotationGroupSelector: any) => string;
  getAnnotations: (
    groupKey: string,
    toolName?: string
  ) => Annotations | GroupSpecificAnnotations | undefined;
  addAnnotation: (annotation: Annotation, groupKey?: string) => void;
  removeAnnotation: (annotationUID: string) => void;
  removeAnnotations: (groupKey: string, toolName?: string) => void;
  saveAnnotations: (
    groupKey?: string,
    toolName?: string
  ) => AnnotationState | GroupSpecificAnnotations | Annotations;
  restoreAnnotations: (
    state: AnnotationState | GroupSpecificAnnotations | Annotations,
    groupKey?: string,
    toolName?: string
  ) => void;
  getNumberOfAllAnnotations: () => number;
  removeAllAnnotations: () => void;
}
```

To use the Annotation Manager, you can set it as the default Annotation Manager using

```js
import { annotation } from '@cornerstonejs/tools';
import myCustomAnnotationManager from './myCustomAnnotationManager';

annotation.state.setAnnotationManager(myCustomAnnotationManager);
```

The most important method in a custom Annotation Manager is the `getGroupKey` method.
This method is used to determine the groupKey for a given element. For instance,
if you have a usecase to show two separate annotations (e.g. two different readers)
on two viewports that share the same FrameOfReferenceUID, you can use the `getGroupKey`
method to return a different groupKey for each viewport given the element. (certainly
you don't want to share the same annotations between the two viewports).
