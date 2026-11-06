---
id: ecg-requirements
title: ECG display requirements
summary: What a clinician must see and be able to do when Cornerstone3D shows a DICOM ECG
---

# ECG display requirements

## Scope

This specification gives the user requirements of the ECG display: what a
clinician sees, and what a clinician can do. It names no class, file or
algorithm.

The code design is in the
[Generic Viewport code design](../generic-viewport-code-design.md), section
GENVIEW-ECG. That section can change when a better design appears.

Change rule: change a requirement of this document only when the requirement
describes the behaviour wrongly, or when the intended behaviour for the
clinician changes. An implementation that is inconvenient is not a reason to
change a requirement.

## Paper scale and grid

- **ECG-U-1** At zoom 1 and at the nominal screen scale (96 pixels for each
  inch), the trace shows 25 mm/s and 10 mm/mV by default. The clinician can
  change the sweep speed and the sensitivity.
- **ECG-U-2** With a calibrated sensitivity, the grid shows a minor block of
  1 mm and a major block of 5 mm.
- **ECG-U-3** Each lead shows its amplitude from its own channel sensitivity.
  An amplitude that the clinician reads or measures in mV on a lead is the
  value that the device recorded on that lead.

## Layout and navigation

- **ECG-U-4** The clinician can select a trace layout, for example 12x1, 6x2,
  3x4 or 3x4 with a rhythm strip. In a layout with more than one column, each
  column shows its own time window of the record.
- **ECG-U-5** Each trace shows the label of its lead.
- **ECG-U-6** When the clinician hides a lead, no other lead moves in time or
  to another column. In a layout with one lead for each row, the rows below
  the hidden lead move up.
- **ECG-U-7** The clinician can scroll the time window through the record.

## Annotations

- **ECG-U-8** An annotation stays on the lead where the clinician made it. When
  the clinician hides that lead, the annotation does not show. The annotation
  shows again when the lead shows. The annotation is not lost.
- **ECG-U-9** An annotation shows in every viewport that shows the same ECG.
