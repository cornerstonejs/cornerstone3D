---
id: gpu-device-limits-implementation
title: GPU device limits - implementation
summary: The record of the device, the edge probe, the memory ledger, the allocation tracker and the fair share of the auto GPU settings
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
  reliable edge, the failed edge and the edge at which the last search
  started, and the largest total and the smallest failed total of the memory
  categories. The limit of the user has its own key beside the record
  (`<record key>.limit`, `null` after a reset), so a write of the record by
  another tab, merged into an earlier read, never brings back an earlier
  limit. A record of an earlier version that holds the limit is read until
  the user sets or resets it.
  (GPULIM-U-3, GPULIM-U-8, GPULIM-U-9)

## The edge probe

- **GPULIM-I-5** The startup probe runs in its own small WebGL2 context, at
  the first detection of the capabilities, and only when the record holds no
  formats. It tests the texel formats at an edge of 8, then searches the edge
  with an N x 4 x 4 texture on each of the three axes. The search starts at
  the minimum of `maxTextureEdge`, `MAX_3D_TEXTURE_SIZE` and 2048, starts below
  a failed edge of the record, and halves on each failure down to 16. A stored
  reliable edge does not raise the start: a search replaces it. A failed edge
  stays until a search passes at that edge or a retest clears it, so a search
  that starts below it keeps it. The search in a viewport context draws to a
  4 x 1 framebuffer, and it does not run when the driver cannot complete that
  framebuffer.
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
  runs again only in three cases: the startup probe could not run, the
  application called `retestRenderingCapabilities({ edge: true })`, or the
  last search started below the `maxTextureEdge` that applies now. Then the
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
  When the set changed, and at least one display set stayed or more than one
  display set remains, and `auto` applies, the store fires
  `VOLUME_TEXTURE_LIMITS_CHANGED`, so the strategies provision again with the
  new shares. Volumes that join in one batch were each sized before the other
  was claimed, so they provision again too. (GPULIM-U-11)
- **GPULIM-I-13** The mapper check (`gridFitsGpuSettings`) uses the memory
  limit of the whole page, not the share, so a mapper never refuses a grid that
  the strategy chose. A full-resolution reslice texture that the check refuses
  draws nothing, and the next render tries the upload again. (GPULIM-U-13)

## The allocation tracker

- **GPULIM-I-14** An allocation of 64 MB or more on a visible page, with GPU
  settings that apply, writes a pending record of the tab before the
  allocation. The first draw that samples the texture starts a timer of 5 s
  (the streaming mappers report their textures, and a plain volume mapper,
  for example after a projection converts it, reports itself). At the end of
  the timer, the pending record goes and the total counts as a success. With
  no draw in 30 s, the pending record goes and nothing is recorded. A new
  upload of the same owner replaces the earlier one, with its own total. A
  texture that is released or deleted cancels its allocation. A context loss
  while the record is pending, or within 5 s of the allocation, records the
  total as a failure once, however many contexts report the loss, except
  within 1 s after a startup probe that followed the allocation, and except
  on a hidden page.
  (GPULIM-U-9)
- **GPULIM-I-15** A start that finds a pending record of the same renderer,
  older than 60 s, records its total as a crash (`gpuBytes`). A pending record
  of another renderer stays for 7 days. `pagehide` and a hidden page remove the
  pending record of the tab. The record keeps the ids of the last 20 crash
  records that it counted (the key and the time), so a start removes a crash
  record only once the store holds its id, and a record that a refused
  removal leaves counts once. (GPULIM-U-9)
