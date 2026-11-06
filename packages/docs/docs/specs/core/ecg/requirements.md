---
id: ecg-requirements
title: ECG display requirements
summary: What a clinician must see and be able to do when Cornerstone3D shows a DICOM ECG
---

# ECG display requirements

## Scope

This specification gives the user requirements of the ECG display of the
Generic Viewport: what a clinician sees, and what a clinician can do. It names
no class, file or algorithm. The deprecated ECG display does not meet ECG-U-3,
ECG-U-7 and ECG-U-8.

The code design is in the
[Generic Viewport code design](../generic-viewport-code-design.md), section
GENVIEW-ECG. That section can change when a better design appears.

Change rule: change a requirement of this document only when the requirement
describes the behaviour wrongly, or when the intended behaviour for the
clinician changes. An implementation that is inconvenient is not a reason to
change a requirement.

## Paper scale and grid

- **ECG-U-1** By default, the record fits the viewport, and the sweep speed
  is 25 mm/s. The clinician can set the sweep speed in mm/s and the
  sensitivity in mm/mV. With a set sensitivity, the trace has the shape of a
  paper ECG at that sweep speed and sensitivity, at each zoom.
- **ECG-U-2** A minor block of the grid is one paper millimetre, and a major
  block is five minor blocks. In time, a minor block is 1/sweep speed seconds,
  for example 0.04 s at 25 mm/s. With a set sensitivity, a minor block in
  amplitude is 1/sensitivity mV, for example 0.1 mV at 10 mm/mV.
- **ECG-U-3** Each lead shows its amplitude from its own channel sensitivity.
  An amplitude that the clinician reads or measures in mV on a lead is the
  value that the device recorded on that lead.

## Layout and navigation

- **ECG-U-4** By default, the trace layout dynamically matches the waveform
  data: a standard 12-lead continuous recording opens in 3x4 with a rhythm
  strip, while a rhythm strip or telemetry recording with fewer leads opens in
  stacked rows. The clinician can select any trace layout, for example 12x1,
  6x2, 3x4 or 3x4 with a rhythm strip. In a layout with more than one column,
  each column shows its own time window of the record.
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
- **ECG-U-12** A point measurement on an ECG shows its time in ms and its
  amplitude in mV. A measurement along the time axis shows ms, and a
  measurement along the amplitude axis shows mV. A free length on an ECG shows
  px, because time and amplitude have different units.
- **ECG-U-13** A measurement along one axis with its two points on two
  different leads shows no value, and tells the clinician that the points are
  in different regions.

## Measurements of the device

- **ECG-U-10** The application can show the global measurements that the
  device recorded, for example the heart rate and the QT interval, each with
  its unit. A value for one lead, or a marker on the trace, is not a global
  measurement.
- **ECG-U-11** The application can show the findings that the device recorded,
  for example "Sinus rhythm". A marker on the trace, for example "QRS onset",
  is not a finding.
