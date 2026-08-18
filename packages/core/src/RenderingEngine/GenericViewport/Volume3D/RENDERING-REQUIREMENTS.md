# Volumetric handling — requirements

Top-level requirements specification for the **FUBerlin–MGH collaboration on volumetric
handling**. This document is deliberately the _highest_ level in the set: it states the
three goals, the approach chosen for each, and the top-level EARS requirements that every
lower-level spec must trace to. It carries no implementation detail that is not
load-bearing on a requirement.

The analysis this is derived from, and which the lower-level specs elaborate:

- [`RENDERING-Volume3D-overview.md`](./RENDERING-Volume3D-overview.md) — the three render
  paths, how a mode is selected today, preset fidelity differences
- [`RENDERING-vtkVolume3d-webgl.md`](./RENDERING-vtkVolume3d-webgl.md) — **gl**
- [`RENDERING-webgpuVolume3d.md`](./RENDERING-webgpuVolume3d.md) — **gpu**
- [`RENDERING-fuberlinVolume3D-mview.md`](./RENDERING-fuberlinVolume3D-mview.md) — **mview**
- [`RENDERING-performance-compare.md`](./RENDERING-performance-compare.md) — why the three
  differ interactively
- [`RENDERING-large-volumes.md`](./RENDERING-large-volumes.md) — capability limits, LOD,
  bricking, server-side storage
- [`RENDERING-PLAN.md`](./RENDERING-PLAN.md) — the phased sequencing

## The three goals

| Goal   | Statement                                                                                               | Owning section                                                                         | Plan phases         |
| ------ | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ------------------- |
| **G1** | Match mview's 3D interaction performance on low-end hardware, **without** matching its fidelity defects | [§2 Interaction performance](#2-goal-g1--interaction-performance)                      | 1, 2, (3, 5)        |
| **G2** | Handle volumes larger than GPU-accessible memory, in every view kind, progressively and without a cliff | [§3 Large volumes](#3-goal-g2--large-volume-handling)                                  | 3, 4a, 4b           |
| **G3** | Choose rendering characteristics automatically, and state the few remaining controls in clinician terms | [§4 Automatic selection](#4-goal-g3--automatic-selection-of-rendering-characteristics) | 0 — grows with each |

They interlock in one direction: **G3 is the mechanism through which G1 and G2 reach a
user.** G1 produces quality profiles, G2 produces representations, and G3 is what chooses
among them. G3 therefore cannot be deferred to the end — it is introduced as a stub with
G1 and extended by every subsequent phase.

## 1. Cross-cutting requirements

These constrain every requirement in §2–§4 and are not restated there.

### 1.1 The quality criterion

The standard is **lossless at the resolution actually being displayed, up to the full
resolution of the device — or disclosed as lossy.** Not "always full resolution", and not
"quietly reduced either". With `p` = pane pixels spanned by the volume ÷ voxels across, a
representation with `p ≤ 1` is lossless _for that view_ at that given position or along that ray.

> **VOL-X-1** The volumetric rendering subsystem shall, for each viewport, either present
> an image whose sampling density is not less than the sampling density of the region of
> the display that the image occupies up to the full resolution of the display device, or
> disclose that the viewport is currently lossy.

The disclosure half of that requirement is elaborated in [§1.5](#15-disclosure-of-lossy-and-substituted-state);
it is what makes every reduction in §2–§4 permissible.

### 1.2 Fidelity is not traded for speed silently

> **VOL-X-2** The subsystem shall render a given volume, transfer function and camera with
> the same apparent opacity and the same shading model regardless of the active quality
> profile, resolution level or residency scheme.

> **VOL-X-2.1** The subsystem shall apply sample-distance opacity correction such that
> transmittance along a ray depends on the path length through the volume and not on the
> sample distance used to march it.

> **VOL-X-2.2** When a viewport transitions between interaction quality and still quality,
> the subsystem shall not change the apparent density or brightness of the rendered image.

Rationale: mview's interactive speed is partly a fidelity defect. Omitting the correction
raises per-sample alpha (CT-Bone: 0.7157 against the corrected 0.395), which makes rays
terminate ~2.5× sooner _and_ makes its interactive and still frames differ in density. G1
must not reproduce that. The corollary is a positive one: because gl and gpu do correct,
they can trade ray steps aggressively during interaction with no brightness pop — a lever
mview does not have.

### 1.3 Failures are legible

> **VOL-X-5** Where the subsystem bounds coverage for cost reasons — a residency budget, a
> level cap, a brick limit — it shall record what was omitted, rather than presenting a
> bounded result as a complete one. This shall be available for view in the lossy indicator extended view.

### 1.5 Disclosure of lossy and substituted state

One indication per viewport, in one consistent place, covering every way that viewport's
displayed image departs from what was asked for. A clinician should not have to know which of
several mechanisms degraded the image in order to find out that one of them did. The
indication is **progressive rather than binary**: it doubles as the loading state, so "not yet
lossless" and "still arriving" are the same display, and the user can see whether waiting
will help.

The indicator needs to be able to present additional information to show exactly what information
is available already, and when possible, to increase the amount of data loaded or coming along.

Lossiness is a property of a view, not of a volume — pane size, orientation and the level
bound for that view all enter into it — so viewports over one volume are indicated
independently.

> **VOL-X-8** While a viewport is presenting an image that does not satisfy the
> sampling-density clause of VOL-X-1, the subsystem shall present a persistent indication
> of that state, at a single fixed location associated with that viewport.

> **VOL-X-8.1** While the user is performing a continuous camera interaction — zoom, pan,
> rotate, scroll — the subsystem shall indicate changes in lossiness by a change in that
> indication that is perceptible without being obtrusive: no modal, no transient toast, no
> layout shift, and no element that occludes the image.

> **VOL-X-8.2** When a viewport becomes lossless per VOL-X-1, the subsystem shall change or
> clear the indication such that the lossless state is distinguishable from every lossy
> state.

> **VOL-X-8.3** The indication shall distinguish a transient reduction that will resolve
> without user action — interaction quality, an incomplete progressive load — from a
> standing limitation that will not, such as a device or budget ceiling.

> **VOL-X-8.4** The indication shall, on request, yield the current state of loss levels, and
> where possible allow the user to adjust those.

> **VOL-X-8.5** While a representation is refining toward the level required by VOL-X-1, the
> indication shall convey that loading is in progress.

> **VOL-X-8.6** The indication shall express lossiness as a progressive state rather than a
> binary flag, such that a user can tell whether waiting will improve the image.

> **VOL-X-8.7** The subsystem shall evaluate lossiness per viewport, such that viewports
> displaying the same volume indicate their own states independently — a sagittal and a
> coronal reformat each indicating a lossy state while an axial view of the same volume
> indicates none.

> **VOL-X-9** Where the subsystem cannot honour a nominated rendering input — an unknown or
> unsupported transfer function or preset, an unsupported blend mode, an unsupported colour
> map, an unsupported interpolation — it shall render using a defined known replacement and
> shall warn at the same location as VOL-X-8.

> **VOL-X-9.1** The warning shall identify what was requested and what was substituted for
> it.

> **VOL-X-9.2** The warning shall persist for as long as the substitution is in effect.

> **VOL-X-9.3** If no defined replacement exists for a nominated input, then the subsystem
> shall refuse per VOL-X-3 rather than render an image whose appearance is undefined.

The indication surface itself is a viewer concern — a viewport overlay or action-corner
element in OHIF — while the state it reports is produced by the rendering subsystem.

### 1.6 Representation substitutability

\*\*A reduced-resolution or partially-loaded volume/image instance shall present the same interface
and same size information as a full resolution volume. It shall be distinguishable by
querying the volume for what data has been loaded.

> **VOL-X-10** The subsystem shall present the same volume identity, geometry and metadata
> regardless of which resolution level or residency scheme is currently resident —
> including frame of reference, patient-coordinate mapping, extent in patient space,
> orientation, and the number of instances or frames reported for the volume, the series
> and each orientation.

> **VOL-X-10.1** A change of resident level or residency scheme shall not invalidate,
> displace, rescale, reindex or renumber any segmentation, annotation, measurement,
> reference line, scroll position or thumbnail associated with the volume.

> **VOL-X-10.2** A change of resident level or residency scheme shall not be signalled as a
> change of display-set or volume identity, and shall not require consumers to re-resolve
> the volume.

> **VOL-X-10.3** Where a consumer addresses voxels by index or by patient coordinate, the
> subsystem shall answer in the volume's nominal acquired grid, resampling from the
> resident representation as required.

> **VOL-X-11** The subsystem shall expose, for a volume and for a region within it, the
> level of detail actually resident, distinguishable from the nominal acquired grid.

> **VOL-X-11.1** Where a consumer reads voxel data, it shall be able to determine the level
> of detail that produced the values it read.

> **VOL-X-11.2** If voxel data is requested at a finer resolution than is resident, then
> the subsystem shall report the resident level together with the values returned, rather
> than returning interpolated values without disclosure.

The tension between X-10 and X-11 is deliberate and is the whole point: the _nominal_ view
of the volume never changes, so consumers need no level awareness; the _actual_ level is
always queryable, so consumers that care — a measurement recording its provenance, a
quality indicator, an analysis that should decline to run on coarse data — can find out.

### 1.7 Derived results against a lossy representation

The division that matters is **whether a result depends on voxel values**. A length, an
angle, an annotation graphic and its label depend only on geometry, which VOL-X-10 holds
invariant across levels — so they are unaffected by lossiness and should simply display. A
mean HU, an SUV, ROI statistics, a histogram or a threshold-driven segmentation edit read
voxels, so their value depends on which level answered.

What to _do_ about the second category is workflow-dependent and therefore configurable:
some workflows want the value computed and shown provisionally, some want it not attempted
at all, and some should not display annotations against a sufficiently lossy representation
in the first place. The requirements below fix the defaults and require the policy to be
configurable, not the other way round.

> **VOL-X-12** The subsystem shall classify each derived result as voxel-value-dependent or
> not, and shall govern that result's computation, display and persistence according to that
> classification together with the level of detail of the representation it would be
> computed from.

> **VOL-X-12.1** The subsystem shall display results that do not depend on voxel values —
> geometric measurements, annotation graphics, labels, reference lines — irrespective of the
> level of detail resident.

> **VOL-X-12.2** While a voxel-value-dependent result has been computed from a
> representation that is lossy for the current view, the subsystem shall display that result
> with a lossy indication attached to the result itself, and shall not persist or export it.

> **VOL-X-12.3** Where configured to do so, the subsystem shall decline to compute a
> voxel-value-dependent result while the representation is lossy, and shall report that it
> has declined rather than display a provisional value.

> **VOL-X-12.4** When a representation refines such that it is no longer lossy for the
> current view, the subsystem shall recompute the affected voxel-value-dependent results,
> clear their lossy indication, and permit their persistence.

> **VOL-X-12.5** Where a voxel-value-dependent result is persisted or exported, the
> subsystem shall record the level of detail from which it was computed.

> **VOL-X-12.6** Where a workflow requires it, the subsystem shall be configurable to
> suppress the display of annotations while the representation is lossier than a stated
> threshold.

> **VOL-X-12.7** The behaviours required by VOL-X-12.2, VOL-X-12.3 and VOL-X-12.6 shall be
> configurable per workflow and per result type through the viewer's existing customization
> mechanism, with VOL-X-12.1 and VOL-X-12.2 as the defaults.

VOL-X-12.2 and VOL-X-8 have different subjects, each with one consistent location of its
own: **VOL-X-8 indicates the state of a viewport's display of a volume, VOL-X-12.2 indicates
the state of a computed result.** A measurement list showing three values of which one is
provisional needs the indication on that value; the viewport indication says nothing about
which results were derived when.

---

## 2. Goal G1 — interaction performance

### 2.1 Approach

**One renderer** used with a variable quality rate. This can be controlled at both the
input side and the output side, and may in fact use different quality rates at different
parts of the image. This may or may not contribute to lossiness depending on the transfer
function and display resolution. Then, the controller for this would continually optimize the
quality rate to achieve the specified performance and load capabilities.

For example, an interactive quality rate of 20 fps might be desired. This might
initially try rendering at one quality, and then reduce the display resolution being
rendered. If this continues to not have sufficient quality, a lower resolution version
of the volume internal voxel data might be used as well.

---

## 3. Goal G2 — large volume handling

### 3.1 Approach

**A multi-resolution, bricked representation with view-driven residency, precomputed
server-side where possible.** Three levers, each applied where it is actually strong:

| Lever                              | Applied to                                                             |
| ---------------------------------- | ---------------------------------------------------------------------- |
| Reduced-resolution level (pyramid) | 3D DVR context and interaction; the guarantee that _something_ renders |
| Bricks with view-driven residency  | MPR first — no ray-ordering problem, no page table — then 3D DVR       |
| Acquisition-axis slab              | Axial MPR scrolling; zoomed-in full-resolution 3D stills               |

Three structural facts shape this:

1. **MPR inverts the priorities.** It is the fidelity-critical view and the cheapest to
   render — O(pixels) against DVR's O(pixels × ~1500). LOD effort belongs on the 3D pane;
   MPR must not be reduced for interaction. But MPR is also what keeps full-resolution data
   resident, which is what stops a reduced 3D volume from being a memory win — hence the
   server-side half of this goal.
2. **Bricked DVR needs single-pass page-table indirection.** vtk.js's existing chunked
   multi-volume path composites chunks back-to-front by _centroid_, which is incorrect for
   an axis-aligned brick decomposition of one volume viewed obliquely. MPR has no such
   constraint — one sample per output pixel, disjoint screen regions.
3. **"Lossless 3D" is surface-dominated.** With a transfer function whose outer regions are
   transparent, the visually significant data is a thin shell — O(area), not O(volume). For
   a 2048³ volume at 128³ bricks, roughly 12–18% of bricks need full resolution, plus a
   coarse level for context. The min/max acceleration grid that makes a surface renderer
   possible is the same structure that decides brick residency, which is why the surface
   work sequences before the large-volume work.

### 3.2 Top-level requirements

> **VOL-C-1** The viewer shall display volumetric studies whose full-resolution voxel grid
> exceeds the device's maximum 3D texture dimension, its available GPU memory, or its
> available host memory, at a fidelity satisfying VOL-X-1 for the current view.

> **VOL-C-2** When a volumetric display set is opened, the viewer shall present a
> diagnostic-fidelity single-plane MPR image without having fetched the whole study.

> **VOL-C-3** While a volumetric representation is incompletely resident, the viewer shall
> present the coarsest complete representation available and shall refine it as finer data
> arrives, in any orientation, for both MPR and 3D views.

> **VOL-C-4** The viewer shall present a 3D DVR image that is lossless per VOL-X-1 over the
> visible surface, for transfer functions whose transparent-to-opaque transition occupies a
> bounded value interval.

### 3.3 Derived requirements

**Capability and budget**

> **VOL-C-1.1** If the largest axis of the selected representation exceeds the backend's 3D
> texture dimension limit, then the subsystem shall select a coarser level or a bricked
> residency scheme, and shall not issue the oversized allocation.

> **VOL-C-1.2** The volume upload pipeline shall not require transient host memory
> exceeding «TBD — target ~1×» the byte size of the volume being uploaded.

> **VOL-C-1.3** While the resident representations would exceed the configured memory
> budget, the subsystem shall evict the representation whose absence least degrades the
> currently displayed images, and shall record the eviction.

**Representation identity**

> **VOL-C-1.4** The subsystem shall identify volume representations internally by volume
> _and_ resolution level, such that concurrent views of one volume may bind different
> levels, while presenting one unchanging volume identity externally per VOL-X-10.

> **VOL-C-1.5** While a viewport displays a thin MPR, the subsystem shall bind a level
> satisfying `p ≤ 1` for that pane and shall not reduce it for interaction.

> **VOL-C-1.6** Where a viewport displays a thick-slab or MIP reformat, the subsystem shall
> treat it as a 3D view for quality-profile purposes.

**Missing data**

> **VOL-C-3.1** If data required by a view is not resident, then the subsystem shall render
> the affected region from the coarsest resident level, request the missing data, and shall
> not report an error or leave the region blank.

> **VOL-C-3.2** When missing data arrives, the subsystem shall refine the affected region
> without a full re-upload of the representation.

> **VOL-C-3.3** While a representation is refining toward losslessness, the subsystem shall
> reflect that progress in the VOL-X-8 indication, and shall mark the reduction as transient
> per VOL-X-8.3.

> **VOL-C-3.4** While a representation is incompletely resident, the subsystem shall satisfy
> VOL-X-10 — the volume's identity, geometry, instance counts and dependent objects shall be
> those of the complete volume.

**Precomputed server-side representation**

> **VOL-C-2.1** Where a precomputed multi-resolution representation exists for a series,
> the viewer shall obtain resolution levels and bricks from it rather than deriving them on
> the client.

> **VOL-C-2.2** The precomputed representation shall be discoverable through the data
> source as a capability, declaring at minimum its levels, brick size, data type, value
> scaling, geometry and `FrameOfReferenceUID`.

> **VOL-C-2.3** The precomputed representation shall permit retrieval of an individual
> brick in a bounded number of range requests.

> **VOL-C-2.4** Where a series' geometry is not a regular rectilinear grid, the generator
> shall either resample and label the output as derived and interpolated, or skip the series
> and record why.

> **VOL-C-2.5** The generator shall produce the representation within the ingestion pass
> that already decodes frames, and shall not require a second decode pass.

> **VOL-C-2.6** If a precomputed representation is absent or expired, then the viewer shall
> satisfy VOL-C-1 through VOL-C-4 from the original series alone, at reduced performance.

C-2.6 is what keeps the client and server halves independently shippable. C-2.2 is the
coupling point between them and should be specified before either side is built.

**Surface-dominated losslessness**

> **VOL-C-4.1** The subsystem shall maintain a coarse acceleration structure recording the
> value range of each block of each volume, and shall use it for empty-space skipping,
> surface localisation and brick residency decisions.

> **VOL-C-4.2** When selecting bricks for full-resolution residency, the subsystem shall
> prioritise blocks whose value range spans the transfer function's opacity onset.

### 3.4 Verification

| Requirement    | Verified by                                                                                                                                                      |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| VOL-C-1        | Reference oversized studies — 512²×2000, 1024²×2000, 1024²×4096 — render on low-end integrated hardware                                                          |
| VOL-C-2        | Time to first diagnostic MPR pixel per orientation, and bytes fetched, against a full-study load                                                                 |
| VOL-C-3        | Time-to-lossless and resident brick fraction for a bone-preset 3D view; refinement observed without re-upload                                                    |
| VOL-C-4        | Shell brick fraction measured against the presets actually in use — the 12–18% figure depends on ramp steepness                                                  |
| VOL-C-1.2      | Peak host memory during load, per path, against the volume size                                                                                                  |
| VOL-X-10       | Segmentations, measurements, scroll position and instance counts unchanged across a scripted level change and a progressive load, byte-for-byte where applicable |
| VOL-X-11       | Resident level queryable per region and consistent with the data actually returned                                                                               |
| VOL-X-12.2     | A voxel-dependent measurement taken on a lossy representation is flagged at the result and rejected by persistence and export paths                              |
| VOL-X-12.4     | The same measurement recomputes, clears its flag and becomes persistable when the level refines, without user action                                             |
| VOL-X-12.7     | Each configurable behaviour exercised through the customization mechanism, defaults confirmed when unconfigured                                                  |
| VOL-C-2.3, 2.5 | A brick retrieved from object storage in the declared number of requests; generation wall-time and peak memory as a fraction of existing ingestion cost          |

---

## 4. Goal G3 — automatic selection of rendering characteristics

### 4.1 Approach

**A rendering decision engine: capability probe → pure policy → ordered fallback →
observable decision.** Configuration and URL parameters become _override inputs to a
policy_ rather than the whole policy, and an override that cannot be satisfied is logged
and degraded rather than obeyed into a blank viewport.

The gap today is total: selection is a string threaded from config or URL to a resolver
that matches on it. There is no capability probing, no limit checking and no fallback
anywhere in that chain — which is why the most common field failure is a blank viewport on
hardware whose 3D texture limit is 256.

Users express intent, not mechanism. The policy owns backend, render path, level, residency
and quality profile; the user owns a small number of controls stated in terms a clinician
can reason about — a target interactive frame rate, and the device characteristics the
browser will not tell us.

That second category is not a concession, it is a necessity: **there is no reliable way to
query available GPU memory from a browser.** The probe establishes hard limits (texture
dimensions, binding counts, adapter class); it cannot establish how much VRAM a machine has
or how much of it another application is using. A clinician cannot supply a sampling
distance, but they can pick their GPU from a list and say how much memory it has — so the
one input the policy most needs and can least measure is exactly the one a human can
supply. Persisting it turns a one-time answer into a standing capability record.

These are **installation-wide settings, not per-viewport or per-study ones** — the machine's
capability and the user's frame-rate tolerance do not change between studies. They belong in
the viewer's general settings surface next to the keyboard mappings, which is also where a
user will look for them. Today that surface is `UserPreferencesModal`, driven by
`userPreferencesCustomization`, organised as sections (Language, Hotkeys, tool bindings)
rather than tabs — so a rendering tab is an addition to that component, and the level-2
viewer spec should decide whether the existing sections become tabs at the same time.

### 4.2 Top-level requirements

> **VOL-S-1** The viewer shall select backend, render path, resolution level, residency
> scheme and quality profile automatically, from measured device capability, the volume, the
> pane, the view kind and the interaction state.

> **VOL-S-2** The viewer shall not require the user to configure renderer, memory or
> sampling settings in order to obtain a correct image at the best quality the device can
> sustain.

> **VOL-S-3** The viewer shall keep the rendered image within the quality criterion
> (VOL-X-1) and the frame budget (VOL-P-1) as the camera, layout and residency change,
> without user intervention.

> **VOL-S-4** Where the viewer offers control over rendering behaviour, it shall express
> that control in terms a clinician can understand and answer without knowledge of rendering
> internals.

### 4.3 Derived requirements

**Probe**

> **VOL-S-1.1** The subsystem shall probe device capability once per session and cache a
> snapshot that is readable synchronously at viewport mount time.

> **VOL-S-1.2** The probe shall establish, at minimum: backend availability, 3D texture
> dimension limits per backend, sampled-texture and buffer limits, filtering support for the
> scalar texture format, adapter class, and a coarse host memory budget.

**Policy**

> **VOL-S-1.3** The policy shall be a deterministic function of the capability snapshot, the
> request, the volume, the pane and the view kind, with no side effects.

> **VOL-S-1.4** The policy shall be verifiable against recorded capability snapshots from
> real target hardware, without that hardware being present.

> **VOL-S-1.5** The policy shall take the view kind as an input, and shall not apply a 3D
> view's reductions to a diagnostic MPR view (VOL-C-1.5).

**Overrides and fallback**

> **VOL-S-1.6** Where a deployment configuration or URL parameter requests a specific
> backend or render path, the policy shall honour it when it is satisfiable.

> **VOL-S-1.7** If a requested backend or render path is not satisfiable, then the policy
> shall select the next entry in the fallback chain and record the transition and its reason.

> **VOL-S-1.8** If no render path can present a 3D view on the device, then the viewer shall
> degrade the layout to the views it can present, and shall report that it has done so.

**Adaptation**

> **VOL-S-3.1** While measured interaction frame time exceeds the frame budget over «TBD»
> consecutive frames, the subsystem shall step the quality profile down.

> **VOL-S-3.2** While measured interaction frame time is below «TBD» of the frame budget,
> the subsystem shall step the quality profile up, to no finer than the quality criterion
> requires.

> **VOL-S-3.3** The subsystem shall not change quality profile or resolution level more than
> once per «TBD» ms, and shall apply hysteresis such that a steady scene converges to a
> stable profile.

> **VOL-S-3.4** When the camera settles, the subsystem shall progress toward the finest
> representation satisfying VOL-X-1 that the memory budget permits.

**Observability and user-facing state**

> **VOL-S-1.9** The subsystem shall expose the decision record required by VOL-X-4 per
> viewport, including rejected alternatives.

> **VOL-S-2.1** Where a user preference between interaction speed and image fidelity is
> offered, it shall be expressed in those terms (VOL-S-4.1) and shall bound the policy
> rather than replace it.

> **VOL-S-2.2** Where a device profile has been established for a browser installation, the
> viewer shall reuse it in subsequent sessions rather than re-deriving it by degradation.

**Controls a clinician can answer**

> **VOL-S-4.1** The viewer shall provide a target interactive frame-rate control, expressed
> in frames per second, and the policy shall treat its value as the interaction frame budget
> referenced by VOL-P-1 and VOL-S-3.

> **VOL-S-4.2** Where the capability probe cannot establish a device limit, the viewer shall
> allow the user to state it in terms of recognisable device characteristics — such as a
> selection of GPU model or class and an amount of GPU memory — and the policy shall use the
> stated value.

> **VOL-S-4.3** The viewer shall persist these settings per browser installation, such that
> they survive page refresh and application restart without being re-entered.

> **VOL-S-4.3.1** These settings shall apply to the whole browser installation — every
> viewport, layout, mode, study and session — and shall not be settable per viewport, per
> study or per mode.

> **VOL-S-4.3.2** The viewer shall present these settings in its general settings surface,
> as a sibling of the keyboard-mapping settings, and shall apply the same commit, cancel and
> restore-defaults semantics as the settings it sits beside.

> **VOL-S-4.4** Each control shall be expressed in units the user can observe or read off
> their machine — frames per second, gigabytes, a GPU name — and shall not require renderer,
> sampling, texture or memory-layout terminology.

> **VOL-S-4.5** If a user-stated device characteristic exceeds a probed hard limit, then the
> policy shall use the probed limit and shall disclose the conflict per VOL-X-9.

> **VOL-S-4.6** When a control's value changes, the viewer shall re-evaluate the policy for
> mounted viewports and repaint, without requiring a reload.

> **VOL-S-4.7** The viewer shall accept deployment-supplied defaults for each control
> through the existing customization mechanism, with a user-supplied value taking precedence
> over the deployment default and a probed hard limit taking precedence over both.

### 4.4 Verification

| Requirement | Verified by                                                                                                                  |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------- |
| VOL-S-1     | Recorded capability snapshots from low-end integrated, mid and discrete hardware, checked in as policy test fixtures         |
| VOL-S-1.7   | Every unsupported combination in the fixture matrix yields a logged fallback or a legible error — never a blank viewport     |
| VOL-S-3.3   | A steady scene converges to one profile; a scripted camera sequence produces no oscillation                                  |
| VOL-S-2.2   | A second session on a recorded device reaches its profile without a visible degradation sequence                             |
| VOL-S-4.1   | Measured interaction frame rate tracks the control's value across its range on each hardware class                           |
| VOL-S-4.3   | Settings survive refresh and restart; a change made in one study takes effect in every other study and mode without re-entry |
| VOL-S-4.4   | Review of every control's label, units and help text with a clinical user — no rendering terminology present                 |
| VOL-S-4.5   | A deliberately overstated GPU-memory value does not produce an allocation failure                                            |

---

## 5. Open items

Decisions rather than analysis; each one bounds requirements above.

| #   | Item                                                                                                                                                                                                        | Bounds                            |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| 1   | Definition of **reference low-end hardware**, and the study, camera and preset that constitute the benchmark case                                                                                           | VOL-P-1                           |
| 2   | Settle-time budget, adaptation thresholds, hysteresis interval, memory budget fractions — every `«TBD»` above                                                                                               | VOL-P-3, VOL-S-3.x, VOL-C-1.2/1.3 |
| 3   | WebGL2 driver overhead and shared-context contention on target hardware are unquantified — the main risk to the factor-of-2 threshold                                                                       | VOL-P-1                           |
| 4   | Whether surface rendering is acceptable as a **standard** display mode, not only an interaction proxy — a clinical call                                                                                     | VOL-P-1.9                         |
| 5   | Server-side format: transposed orthogonal stacks (no client changes, orthogonal only) versus a chunked pyramid (subsumes the client-side options, needs a loader). Decide before investing in client bricks | VOL-C-2.x                         |
| 6   | Shell fraction for VOL-C-4 depends on transfer-function ramp steepness — validate against the presets actually in use                                                                                       | VOL-C-4                           |
| 7   | Whether a diagnostic reformat may ever be served from a through-plane-decimated representation                                                                                                              | VOL-X-1.3, VOL-C-1.5              |
| 8   | mview's missing opacity correction and shading terms should be fixed regardless — it is a prerequisite for a meaningful A/B, and fixing it removes mview's early-termination advantage                      | VOL-X-2, VOL-P-1                  |
| 9   | `@mview/webgpu-volume-standalone` is not declared or installed in this tree, so the mview path cannot build — this blocks any measurement against the reference                                             | VOL-P-1 verification              |
| 10  | Where the lossy/substituted indication lives, and its visual vocabulary — a clinical review item, since it must read as informative during every rotate without becoming an alarm                           | VOL-X-8, VOL-X-9                  |
| 11  | Which of the existing measurement, annotation and segmentation tools are voxel-value-dependent — the classification VOL-X-12 turns on, and it has to be enumerated per tool rather than inferred            | VOL-X-12                          |
| 11a | The threshold at which a representation is "too lossy" to display annotations against (VOL-X-12.6), and whether it is stated as a level count, a value of `p`, or a per-workflow choice                     | VOL-X-12.6                        |
| 12  | Default target interactive frame rate, and its permitted range                                                                                                                                              | VOL-S-4.1                         |
| 13  | Source and maintenance of the GPU model/class list offered by VOL-S-4.2 — a curated list ages, a free-text memory figure does not but is easier to get wrong                                                | VOL-S-4.2                         |
| 14  | Whether the existing user-preferences sections (Language, Hotkeys, tool bindings) become tabs when the rendering tab is added, or the rendering settings arrive as a fourth section                         | VOL-S-4.3.2                       |

## 6. Traceability and what the existing specs need

| Document                           | Relationship to this spec                                                                       | Update needed                                                                                                                                                                       |
| ---------------------------------- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `RENDERING-Volume3D-overview.md`   | Baseline: what the three paths do today; source of VOL-X-2's fidelity targets                   | none expected — descriptive                                                                                                                                                         |
| `RENDERING-performance-compare.md` | Evidence for VOL-P-1's factor-of-2 estimate and VOL-P-1.3's direction of trade                  | none expected — analytical                                                                                                                                                          |
| `RENDERING-large-volumes.md`       | Source of VOL-X-1 and of the lever-to-view mapping in §3.1                                      | none expected — analytical                                                                                                                                                          |
| `RENDERING-PLAN.md`                | Sequencing; phases and deliverables need restating as discharging named requirements            | **yes** — annotate each phase and deliverable with the VOL-\* requirements it discharges                                                                                            |
| Per-phase specs (to be written)    | Level-2 EARS, one document per phase, each requirement tracing to a VOL-\* here                 | **to write** — decision engine, gl interaction profile, surface path, brick residency, generator                                                                                    |
| Viewer-side spec (to be written)   | §1.5 disclosure, §1.7 result gating and §4.3's controls are OHIF concerns, not Cornerstone ones | **to write** — indication surface, per-tool voxel-dependence classification and gating customizations, rendering tab in `UserPreferencesModal`, persistence, customization defaults |

Identifier scheme: `VOL-X-*` cross-cutting, `VOL-P-*` performance (G1), `VOL-C-*` capacity
(G2), `VOL-S-*` selection (G3). Level-2 specs extend the same numbering (`VOL-P-1.4.2`) so
a requirement's ancestry is readable from its identifier.
