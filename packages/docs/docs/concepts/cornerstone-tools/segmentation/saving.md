---
id: saving
title: Saving and Replacing
summary: How a stored segmentation, structure set or report either starts a new series or becomes the next revision of an existing one, and what makes a viewer show the revision instead of the original
---

# Saving and Replacing

A segmentation is stored as a derived DICOM object: a SEG instance built from the
images it was drawn on. A structure set (RTSTRUCT) and a measurement report (SR)
are derived objects in the same way, and everything on this page applies to all
three.

There are two ways to store one, and the difference is a single option.

## A new series

With no predecessor, the adapter builds the object on a dcmjs derivation, and
that derivation invents the series it belongs to: a fresh `SeriesInstanceUID`,
the description `Research Derived series`, the number `99`, and the current UTC
date and time. The stored object is the first instance of a series of its own.

This is what you want for a segmentation the user has just created.

## A revision of an existing series

Pass `predecessorImageId` — the image id of the instance the new object
supersedes — and the object joins that instance's series instead:

```js
const { dataset } = generateSegmentation(
  referencedImages,
  labelmaps3D,
  metaData,
  { predecessorImageId }
);
```

`generateRTSSFromRepresentation` and `MeasurementReport.generateReport` take the
same option. All three read it through the `PredecessorSequence` metadata
module, which supplies three things:

| What                           | Taken from                                   | Effect                                                                      |
| ------------------------------ | -------------------------------------------- | --------------------------------------------------------------------------- |
| The series attributes          | the predecessor's General Series module      | The revision lands in the same series, with the same number and description |
| `InstanceNumber`               | the predecessor's, plus one                  | The revision sorts after the instance it supersedes                         |
| `PredecessorDocumentsSequence` | the predecessor's study, series and SOP UIDs | The revision names what it supersedes                                       |

Only the attributes the predecessor actually carries are copied, so a gap in the
predecessor never clears a value the derivation has already set.

## Which instance a viewer shows

Nothing in the stored object marks one instance as "the" segmentation of a
series. What the revision carries is enough for a viewer to decide:

- it is in the **same series** as the predecessor, so a viewer that lists one
  entry per series has a single entry for the whole chain;
- it has a **higher `InstanceNumber`**;
- it names its predecessor in **`PredecessorDocumentsSequence`**, so the order of
  a chain of revisions is recoverable however the instances are numbered.

A viewer that shows the most recently created instance of the series therefore
shows the revision, and the original stays retrievable behind it. The
application that stores the object is responsible for stamping the instance level
creation date and time on every save; the series level `SeriesDate` and
`SeriesTime` belong to the series that already exists and must not be restamped.

## Recording the predecessor

`Segmentation.predecessorImageId` holds the instance a segmentation was loaded
from, or was last stored as, and `Annotation.predecessorImageId` does the same
for an annotation. Read it when the user saves, and a second save writes a second
revision rather than a second series.

## When the predecessor cannot be used

The module answers `undefined` if no metadata provider holds the image id — a
stale id, or an instance that was never ingested. Every caller merges that answer
as a no-op, so the save still succeeds, but the object starts a new series and
names no predecessor. The module logs a warning naming the image id, and that
warning is the only report the caller gets.

The module throws if a provider holds the image id but carries no
`StudyInstanceUID`, or no `SeriesInstanceUID`. Both attributes are Type 1 in
`PredecessorDocumentsSequence`. The module cannot write the sequence without
them, and a stored object that names an empty predecessor is worse for the user
than a save that fails and says why.
