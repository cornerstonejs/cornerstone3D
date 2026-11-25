---
id: gpu-device-limits-implementation
title: GPU device limits - implementation
summary: The record of the device, the edge probe, the memory ledger, the allocation tracker, the fair share, the failures, the wait for WebGL and the calibration run of the auto GPU settings
---

# GPU device limits - implementation

## Scope

This document gives the implementation requirements of the automatic GPU
settings (`auto`). Each requirement cites the user requirement of the
[specification](./requirements.md) that it satisfies.

Change rule: change an implementation requirement freely when a better
approach appears, as long as the user requirements stay satisfied.

## The settings and the configuration

- **GPULIM-I-1** `gpuSettingsForRender()` returns `undefined` when
  `rendering.lossyDownsampling.final` is off, when `useCPURendering` is on, or
  when the renderer class is `none` or `software`. Every render path reads the
  settings there, so one check covers them all. (GPULIM-U-1)
- **GPULIM-I-2** The renderer class comes from the renderer string: `mobile`
  for Mali, Adreno, PowerVR, Apple GPU (except on a Mac with no touch screen),
  Immortalis, Xclipse and Vivante; `desktop` for any other GPU. The speed of
  `auto` is the speed of `low-tablet` for `mobile` and of `medium` for
  `desktop`. (GPULIM-U-7)
- **GPULIM-I-3** `rendering.autoGpuSettings` holds `hardMemoryBytes`,
  `startMemoryBytes` and `maxTextureEdge`. A size below 128 MB, or an edge
  that is not a positive number, logs a warning and is ignored.
  `getGpuMemoryLimit()` returns the limit and its source (`hardConfig`,
  `hardUser`, `user`, `config`, `start`). `setGpuMemoryLimit({ bytes, hard })`
  refuses a value below 128 MB, stores the value, and fires
  `VOLUME_TEXTURE_LIMITS_CHANGED`. When the store refuses the write, the page
  keeps the value until the next write that the store keeps.
  (GPULIM-U-5, GPULIM-U-7, GPULIM-U-8)

## The record of the device

- **GPULIM-I-4** The record of one renderer is in `localStorage`, under a key
  from the FNV-1a hash of the renderer string, through the
  `CapabilityStorage` interface. Each write reads the store again and merges
  the change, so a change of another tab stays. A new probe version
  (`RENDERING_CAPABILITIES_PROBE_VERSION`, now 5) discards the earlier
  records. The record holds the texel formats, `MAX_3D_TEXTURE_SIZE`, the
  reliable edge and the failed edge, the largest total and the smallest failed
  total of the memory categories, the limit of the user, and the history of
  the GPU memory (GPULIM-I-16). The history is an optional field, so a record
  of version 5 without it stays valid.
  (GPULIM-U-3, GPULIM-U-8, GPULIM-U-9)

## The edge probe

- **GPULIM-I-5** The startup probe runs in its own small WebGL2 context, at
  the first detection of the capabilities, and only when the record holds no
  formats. It tests the texel formats at an edge of 8, then searches the edge
  with an N x 4 x 4 texture on each of the three axes. The search starts at
  the minimum of `maxTextureEdge`, `MAX_3D_TEXTURE_SIZE` and 2048, starts below
  a failed edge of the record, and halves on each failure down to 16. A stored
  reliable edge does not raise the start: a search replaces it.
  (GPULIM-U-3, GPULIM-U-4, GPULIM-U-5)
- **GPULIM-I-6** The probe tests no edge above 2048. When the test at 2048
  passes and `MAX_3D_TEXTURE_SIZE` is larger, the record stores
  `MAX_3D_TEXTURE_SIZE` as the reliable edge, with `assumed: true`. The edge of
  `auto` is the minimum of the reliable edge and `maxTextureEdge`, read at each
  use. (GPULIM-U-3, GPULIM-U-5)

  Known limit: no device is available to test an edge above 2048. An assumed
  edge that is wrong shows as a context loss or a gray image, and the record
  does not connect that failure to the edge. A retest (GPULIM-I-8) or a
  smaller `maxTextureEdge` is the remedy.

- **GPULIM-I-7** A context lost during the test of an edge stores that edge as
  failed, and ends the search. The next search starts below it.
  (GPULIM-U-4)
- **GPULIM-I-8** The render path creates no probe context. The edge search
  runs again only in two cases: the startup probe could not run, or the
  application called `retestRenderingCapabilities({ edge: true })`. Then the
  render window runs the search once in this page, in its own context, before
  its next render, and restores the state of that context after the search.
  The reliable edge of the record applies until the search ends. A changed
  edge fires `VOLUME_TEXTURE_LIMITS_CHANGED` after the render.
  (GPULIM-U-3, GPULIM-U-6)

## The memory of the page

- **GPULIM-I-9** The GPU memory ledger holds the bytes of each texture, canvas,
  render buffer and context of the page. A texture uses the size that vtk.js
  states after the allocation. A context costs an estimate of 32 MB, a canvas
  4 bytes for each pixel, and a render buffer 8 bytes for each pixel. Only the
  context pool rendering engine books the canvases and the render buffers.
  (GPULIM-U-7)
- **GPULIM-I-10** `gpuTextureBytesPerVoxel` is the one count of the bytes of a
  voxel of a texture. The strategy, the texture store and the allocation
  tracker use it. A 16-bit voxel (`Int16Array`, `Uint16Array`) takes 2 bytes
  when the upload gets the norm16 extension, or when
  `rendering.preferSizeOverAccuracy` is on, and 4 bytes otherwise.
  `Uint8Array` takes 1 byte, and every other type 4 bytes. (GPULIM-U-10)

## The fair share

- **GPULIM-I-11** Under `auto`, the texture memory of a volume is its share of
  the memory limit:
  1. The display sets are the volumes whose texture set a viewport holds (a
     claim in the texture store), and the volume that the strategy provisions.
  2. The budget is the limit less the ledger bytes that are not textures of a
     display set. A display set that the strategy cannot reduce (a dynamic
     volume, or more than one component) takes its full need from the budget
     first.
  3. `fairShares` gives its full need to each display set whose need is at
     most budget / count of the display sets still open, takes those needs out
     of the budget, and repeats until no more display sets fit. The display
     sets that remain share the rest equally.
  4. A share is never less than 32 MB.

  `reductionCauseOf` reads the same share. (GPULIM-U-10, GPULIM-U-12)

- **GPULIM-I-12** After a change of the claims, the texture store compares the
  set of display sets with the set at the last check, after the current work.
  When the set changed and at least one display set stayed, and `auto`
  applies, the store fires `VOLUME_TEXTURE_LIMITS_CHANGED`, so the strategies
  provision again with the new shares. (GPULIM-U-11)
- **GPULIM-I-13** The mapper check (`gridFitsGpuSettings`) uses the memory
  limit of the whole page, not the share, so a mapper never refuses a grid that
  the strategy chose. A full-resolution reslice texture that the check refuses
  draws nothing, and the next render tries the upload again. (GPULIM-U-13)

## The allocation tracker

- **GPULIM-I-14** An allocation of 64 MB or more on a visible page, with GPU
  settings that apply, writes a pending record of the tab before the
  allocation. The first draw that samples the texture starts a timer of 5 s.
  At the end of the timer, the pending record goes and the total counts as a
  success. With no draw in 30 s, the pending record goes and nothing is
  recorded. A context loss while the record is pending, or within 5 s of the
  allocation, records the total as a failure, except within 1 s after a
  startup probe that followed the allocation, except on a hidden page, and
  except during a calibration run and for 5 s after it (GPULIM-I-21). A
  success or a failure also goes in the history (GPULIM-I-16), and a failure
  is reported (GPULIM-I-17).
  (GPULIM-U-9, GPULIM-U-14)
- **GPULIM-I-15** A start that finds a pending record of the same renderer,
  older than 60 s, records its total as a crash (`gpuBytes`). A pending record
  of another renderer stays for 7 days. `pagehide` and a hidden page remove the
  pending record of the tab.

  The id of the tab is in `sessionStorage` (`cornerstone3D.tabId`), and a
  pending record states the id of its page load. A start that finds the
  record of its own tab from an earlier page load records it as a crash at
  once, whatever its age, because a page that closes normally removes it. A
  tab that the browser duplicates shares the id, so a duplicate that loads
  while the first tab waits on a large allocation records that allocation as
  a crash. No heartbeat refreshes a pending record: it lives at most 35 s
  (the 30 s render timeout and the 5 s settle), under the 60 s rule.
  (GPULIM-U-9, GPULIM-U-15)

## The history and the failures

- **GPULIM-I-16** The history of the record holds:
  - for each bucket of `GPU_MEMORY_BUCKETS_GB` (0.125, 0.25, 0.5, 1, 1.5, 2,
    3, 4, 6, 8, 12, 16, 24 and 32 GB) and for the bucket above 32 GB, the
    successes and the failures of the page totals in it. A total goes in the
    smallest bucket that holds it;
  - the largest page total and the largest single texture that worked, each
    with a count. A size larger by more than 5 % replaces it, with a count of
    1. A size within 5 % adds 1 and keeps the larger value;
  - the last failure, and the result of the last calibration.

  A settled allocation, a context loss during an allocation, an out of
  memory and a crash found at a start write it. `resetGpuMemoryLimit` clears
  it. `getGpuMemoryHistory()` returns a copy, with every bucket in order.
  (GPULIM-U-9, GPULIM-U-20)

- **GPULIM-I-17** A failure fires `GPU_MEMORY_FAILURE`. Its detail holds the
  kind (`contextLost`, `crash`, `outOfMemory`), the page total and the
  texture, the limit in force and its source, the successes and the failures
  at or above the bucket of the failure, the largest load that worked, the
  suggested limit, `canCalibrate`, `mustReload` (a lost context),
  `noGpuSizeWorks` (a failure at 128 MB or below), the end of a wait for
  WebGL, the rendering engine and context of a lost context, and the
  history. The suggested limit is:
  1. the current limit after a one-off failure: the size worked at least
     twice, and this is its first failure;
  2. else, after a calibration, its largest success;
  3. else, the largest load that worked below the failed size;
  4. else, the lower end of the largest bucket with a success below the
     bucket of the failure;

  rounded down to a bucket size, and never below 128 MB.
  `getLastGpuMemoryFailure()` returns the detail until
  `acknowledgeGpuMemoryFailure()`. A crash found at a start is reported once
  the detection ends, so an application that subscribes later reads it
  there. A lost context or an out of memory is kept for the page only.
  (GPULIM-U-14, GPULIM-U-15)

- **GPULIM-I-18** Outside Chromium, a large allocation reads every error that
  waits after `texStorage3D`, because an earlier error can hide
  `OUT_OF_MEMORY`. An out of memory removes the pending record, counts as a
  failure, and is reported. The texture releases its storage and refuses that
  shape until its shape changes, for example after a new limit, so a render
  does not fail again with the same size. The volume mapper skips a texture
  with no storage, as one that the GPU settings refuse. Chromium is left out:
  it reports an out of memory as a lost context, and its `getError()` waits
  for the GPU process. (GPULIM-U-13, GPULIM-U-14)

## The wait for WebGL

- **GPULIM-I-19** The wait is `cornerstone3D.webglBlockedUntil` in the
  capability storage: `{ until, reason, at }`, with `reason` one of `chrome`,
  `cooldown` and `calibration`. The times of the failures of the last two
  minutes are in `cornerstone3D.gpuMemoryFailureTimes`. Both are outside the
  keys of the record, so a reset of the record leaves them. An end more than
  2 minutes and 5 s away is removed and ignored. A shorter wait never shortens
  a longer one. A wait starts:
  - outside Chromium, at the second failure within two minutes in any tab of
    the site, for two minutes (`cooldown`);
  - in Chromium, when a 1 x 1 test context, created 1 s after a failure, is
    refused (`chrome`). A context that works is lost at once. A refused
    context at any other time, for example at the start of a page or in a
    render window, starts it too, from the last failure. At the end of a
    `chrome` wait the test context runs again, and a refusal adds 30 s;
  - before each step of a calibration run (`calibration`).

  Another tab follows the wait through the `storage` event.
  `WEBGL_AVAILABILITY_CHANGED` fires at the start and at the end, with
  `sourceTab` `self` or `other`. A crash found at a start starts no wait,
  because it happened in an earlier page. (GPULIM-U-16)

- **GPULIM-I-20** While WebGL waits:
  - the detection creates no context. The profile comes from the record of
    the last renderer, with `webgl` true and `webglBlocked` true, so `init`
    keeps GPU rendering, and the profile is detected again when the wait
    ends;
  - a render window asks for no context, returns `null` where vtk.js would
    throw on a refused context, and skips its render until it has a context.
    The engines keep the image on screen;
  - `gridFitsGpuSettings` refuses a texture of 64 MB or more, whatever the GPU
    settings, and the next render tries again.

  When the wait ends, `whenWebGLAvailable()` resolves and every rendering
  engine renders. (GPULIM-U-16, GPULIM-U-17)

## The calibration run and the status

- **GPULIM-I-21** `canRunGpuMemoryCalibration()` is true when the history holds
  a failure, WebGL works and does not wait, and no run is under way.
  `runGpuMemoryCalibration()` allocates R8 3D textures of at most 256 MB in a
  context of its own, on a canvas outside the page, from 90 % of the failed
  size of the last failure, adding 10 % of the first step each step, up to
  32 GB. Each step samples every texture in one frame and waits for the GPU;
  a lost context or `OUT_OF_MEMORY` ends the run. Before each step, the run
  stores `cornerstone3D.gpuMemoryCalibration` (the tab, the page load, the
  step, the target and the last size that worked) and starts a `calibration`
  wait. The result goes in the history, and `GPU_MEMORY_CALIBRATED` fires. A
  run with no failure ends its wait. A start that finds the record of an
  earlier page of its tab, or an old record of another tab, records the last
  size that worked and the target of the step as the failure.
  (GPULIM-U-18)
- **GPULIM-I-22** `getGpuMemoryStatus()` states whether the GPU settings
  apply, the limit, its source and whether it is hard, the start of the
  device, the class of the renderer, the bytes of the page from the ledger,
  `noGpuSizeWorks`, `cpuRecommended`, `canCalibrate`, and the wait.
  `noGpuSizeWorks` is true after a failure at 128 MB or below, or after a
  calibration that failed at its first step at or below 128 MB.
  `setGpuMemoryLimit` and `resetGpuMemoryLimit` fire
  `GPU_MEMORY_LIMIT_CHANGED` with the limit before and after, then
  `VOLUME_TEXTURE_LIMITS_CHANGED`. (GPULIM-U-19, GPULIM-U-20)
