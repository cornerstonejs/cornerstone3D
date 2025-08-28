# Tool consistency of using label instead of text

## What Changed

In version 4.x, all of the tools now consistently use `data.label` instead of `data.text`. Previously, the Arrow and Label tools
used data.text as well as data.label allowing for inconsistencies on what got displayed.

To support this, the consistent use of `createAnnotation` from `AnnotationDisplayTool`
is used inside the `addNewAnnotation`, and this method has been enhanced to support
setting the point value as well as setting additional attributes.

## Why We Changed This

The inconsistency in label naming occasionally caused the wrong label to be used
where people expected text to be set or label to be set and changed the wrong value.
This allows treating all annotations the same way.

Creating annotations consistently allows for updating all annotations when
new fields are added or field values are modified.
