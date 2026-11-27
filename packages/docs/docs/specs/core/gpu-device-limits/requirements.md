---
id: gpu-device-limits-requirements
title: GPU device limits
summary: What the user gets when the viewer fits volumes to the texture size and the GPU memory of the device, and when the GPU fails
---

# GPU device limits

## Scope

This specification gives the user requirements of the automatic GPU settings
(`auto`): how the viewer fits the volumes of a page to the texture size and to
the GPU memory of the device, and what happens when the GPU fails. It names no
class, file or algorithm.

The "user" is the person who reads the images. The "application" is the
program that a developer builds on Cornerstone3D, for example a viewer that
shows a dialog to the user.

The implementation requirements are in the
[implementation specification](./implementation.md). That document can change
when a better approach appears.

Change rule: change a requirement of this document only when the requirement
describes the behaviour wrongly, or when the intended behaviour for the user
changes. An implementation that is inconvenient is not a reason to change a
requirement.

Related documents:

- [Viewport fidelity](../viewport-fidelity.md): how the user learns that a
  volume shows reduced.

## When the limits apply

- **GPULIM-U-1** The limits apply only when the application permits a reduced
  display of a volume. When the application does not permit it, or when the
  device renders without a GPU (a software renderer or CPU rendering), every
  volume draws at full resolution, as in a version with no limits.
- **GPULIM-U-2** `auto` is the default. An application can select a fixed
  preset in place of `auto`.

## The texture size of the device

- **GPULIM-U-3** The viewer tests the largest texture size that the device
  draws correctly. The test runs once for each device and browser, at the
  start or at the first view, and the browser keeps the result. A later page
  load does not test again.
- **GPULIM-U-4** A volume never gets a texture size that a test on the device
  failed.
- **GPULIM-U-5** The application can set a smaller largest texture size, for
  a test or for a known problem of a device. The viewer then tests no size
  above it.
- **GPULIM-U-6** The application can ask for a new test, for example after a
  driver update. The result of the new test replaces the old result.

## The GPU memory limit

- **GPULIM-U-7** The memory limit applies to all volumes of the page
  together. The limit comes from the first of these that exists:
  1. a hard limit that the application sets
  2. the limit that the user set
  3. a start value that the application sets
  4. the start value of the device: 1 GB for a phone or a tablet, 2 GB for
     another GPU, and 0.5 GB for a device that fails the texture size 2048
- **GPULIM-U-8** The user can set the memory limit, for example in a dialog
  after a failure. The new limit applies at once to the volumes on screen. The
  limit stays after a page reload, until the user sets a different limit or
  resets it.
- **GPULIM-U-9** Nothing raises or lowers the memory limit by itself. The
  viewer records the sizes that worked and the sizes that failed, and the
  application can show that record to the user.

## The share of each display set

- **GPULIM-U-10** A display set that fits a fair share of the memory limit
  draws at full resolution. Only a display set that is larger than its share
  draws reduced. The large display sets share the remaining memory equally.
- **GPULIM-U-11** The share of a display set does not depend on the order in
  which the display sets load. When a display set comes or goes, the other
  display sets get their new shares.

## Reduced and refused volumes

- **GPULIM-U-12** When the limits reduce a volume, the user can see that the
  image is reduced, and why (see [Viewport fidelity](../viewport-fidelity.md)).
  When the memory limit is the cause, the application can offer the user a
  larger memory limit.
- **GPULIM-U-13** A view that must draw a volume at full resolution, and that
  the limits cannot hold, draws nothing in place of a wrong image. It tries
  again at the next render, for example after the user sets a larger limit.

## GPU failures

- **GPULIM-U-14** After a GPU memory failure (a lost context, a tab that
  stopped, or an out of memory during a large allocation), the application
  learns what failed, how often that size worked and failed before, the
  largest size that worked, and a suggested memory limit. The viewer does not
  apply the suggestion; the user picks a limit (see GPULIM-U-8 and
  GPULIM-U-9).
- **GPULIM-U-15** A failure that the start of a page found, because the tab
  stopped during an allocation, reaches the application when the application
  is ready to show it. A tab that the system stopped finds its own failure at
  its next load, at once.
- **GPULIM-U-16** After a failure, no tab of the site creates a WebGL context
  or allocates a large texture until WebGL works again: while the browser
  blocks WebGL for the site, and, in a browser that does not block, for two
  minutes after a second failure within two minutes. The images on screen
  stay, and loading goes on. When the wait ends, every tab learns it and its
  views draw again. A page that lost its context reloads then.
- **GPULIM-U-17** While WebGL waits, a page keeps GPU rendering. It does not
  switch to CPU rendering by itself.
- **GPULIM-U-18** After a failure, the user can start one calibration run,
  after a warning that the run causes a failure and the wait. The run finds
  the largest memory that works, and the result is offered as a limit.
  Nothing applies it. A run that stops the tab still records its result.
- **GPULIM-U-19** When a failure happens at the smallest limit (128 MB), the
  application can offer CPU rendering. The viewer does not switch by itself.
- **GPULIM-U-20** The application can read, for a memory dialog: the limit
  and its source, the GPU memory that the page holds, the sizes that worked
  and failed, the last failure, the last calibration, the suggested limit,
  and whether WebGL waits and until when.
