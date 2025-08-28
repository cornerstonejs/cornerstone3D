# Tool consistency of using label instead of text

## What Changed

In version 4.x, all of the tools now consistently use `annotation.data.label` instead of `annotation.data.text`.
Previously, the arrow and label, and key image tools used a mixture of text and label leading
to inconsistencies between the displayed values.

To support better consistency between the shape of the annotation data created,
the addNewAnnotation methods have been changed to call the createAnnotation
method instead of each tool creating their own data.

## What you need to change?

If you were previously using the `ArrowAnnotateTool`, `LabelTool` or `KeyImageTool`
text field, you need to use the label field instead.

It is additionally recommended for any annotation tools that you have defined
outside CS3D to modify the addNewAnnotation method to call the `this.createAnnotation`
method instead of creating your annotation data manually. This will help ensure
consistency with any new changes to the basic shape of annotation data.

## Why We Changed This

The inconsistency in label naming occasionally caused the wrong label to be used
where people expected text to be set or label to be set and changed the wrong value.
This allows treating all annotations the same way.

Creating annotations consistently allows for updating all annotations when
new fields are added or field values are modified.
