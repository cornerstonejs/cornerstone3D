---
id: annotationGroups
title: Annotation Groups
---

# Annotation Groups

In order to indicate that annotations are related to each other, there is
an `AnnotationGroup` class that can be used to group annotations. Currrently,
the grouping is very basic and isn't saved/restored automatically within the
adapters. The requirements for enhanced grouping are still being gathered, but the basic
capability is there to use. Annotations can be added to a group, and navigated
between them by finding the next/previous annotation.

## Creating a new group

To create a new annotation group, just create an instance of AnnotationGroup.

## Adding an annotation to a group

Annotations can automatically be added to a group if the group is active, and
has had the addListeners method called on it. Alternatively, they can be added
manually by calling the add method on the annotation group.

For example:

```javascript
const group = new cornerstoneTools.annotation.AnnotationGroup();
group.add(annotation.annotationUID);
```

## Setting visibility of annotations

Annotations can be shown/hidden by calling the setVisibility method on the
annotation group. This takes an optional second parameter which will prevent
hiding for any filtered elements (those where the filter function returns false).
There is a default filter function provided that excludes any members of the
current group which are visible because of visibility flags in the group. This
allows overlapping groups to be used, with the annotations only being hidden when
all annotations groups are not visible.

```javascript
// Toggle visibility of group members only.
// Need the other information to fire events
group.setVisibility(!group.isVisible, { viewportId, renderingEngineId });
```
