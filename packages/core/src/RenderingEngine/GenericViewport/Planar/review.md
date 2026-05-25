2.4 Camera projection helpers exist but are not exported
resolvePlanarICamera, derivePlanarPresentation, applyPlanarICameraToRenderer are in planarRenderCamera.ts but not in the top-level barrel. A downstream consumer that wants to compute a camera from a view-state (e.g. a custom synchronizer) has no stable entry point. Either commit to exporting them or make them genuinely internal — right now they're advertised in the type system (PlanarResolvedICamera is exported) without being constructible.

BW> These should be exported as helper modules, probably indicating that they are a little less stable than the core behaviour.

BW> Would it be possible to make an external handler/plugin to allow differentiating between camera types in a generic fashion? Something like being able to get the camera of a given type given the current parameters, or the underlying/base camera type. That would allow pluging in the transforms earlier by keyword/type and being able to transform bidirectionally on different viewport types things like the stack viewport camera types versus the 3d camera types. That might be a way to get different types of pan values. Not quite sure this works, but if it does, I think it would resolve some of the export size differences since there would be mroe smaller exports, but they would allow for better re-use.

2.5 ResolvedViewportView snapshots aren't cached, but tools call them in tight loops
PlanarViewport.getResolvedView() (PlanarViewport.ts L795-L810) calls resolvePlanarViewportView and constructs a fresh PlanarStackResolvedView or PlanarVolumeResolvedView on every call. The class caches sliceBasis and presentation per-instance, but the instance is thrown away the moment the caller returns.

canvasToWorld, worldToCanvas, getZoom, getPan, getRotation, getScale, getViewPresentation, getCameraForEvent all call getResolvedView() — frequently more than once per call (getViewPresentation calls getZoom, getScale, getPan, getRotation separately and each rebuilds). For a mouse-drag tool that calls canvasToWorld twice plus worldToCanvas once per move event, you're doing 3+ resolvePlanarViewportView constructions per move, each of which builds a PlanarSliceBasis from scratch (gl-matrix allocations, orientation math).

This is the kind of regression that doesn't show up in screenshot tests but shows up as scroll/pan/window-level latency on mid-range hardware. Cache the resolved view on the viewport, invalidate on setViewState / resize / binding change.

BW> Definitely a concern in mouse move etc. You will need to test on slower hardware.

2.6 Two-layer state machine in the legacy adapter
PlanarLegacyCompatibilityController (~830 lines) maintains its own properties, globalDefaultProperties, perImageIdDefaultProperties maps keyed by dataId and imageId. This is parallel to data state owned by PlanarMountedData and view state owned by PlanarViewport. No single source of truth, and the divergence cases are real:

Mixing legacy setStack() with modern addData() is undefined.
perImageIdDefaultProperties grows unbounded as users scroll a long stack (cleared on destroy() so not a permanent leak, but real memory pressure during long sessions).
Per-imageId caches are tempting for window/level memory, but unless they participate in cache eviction, they tie viewport memory to study size.
Recommend either documenting "do not mix legacy and modern APIs on the same viewport" loudly, or unifying them.

Likely bugs
Aliased viewState arrays leak from getViewState() — PlanarViewport.ts L784-L789. Only displayArea is cloned; scale, anchorCanvas, anchorWorld, slice.sliceWorldPoint are shared by reference.
Bogus fallback camera in getCameraForEvent() — PlanarViewport.ts L1735-L1745 — when no resolved view. Those values ride into CAMERA_MODIFIED payloads as previousCamera.
setPan fallback uses currentPan = [0,0] instead of the actual anchor-derived pan — PlanarViewport.ts L735.
setViewPresentation fires two state writes — PlanarViewport.ts L925-L929 → two CAMERA_MODIFIED events, two render requests.
renderImageObject collisions — PlanarViewport.ts L405-L416 registers metadata under image.imageId with no de-duplication; back-to-back calls overwrite silently.
displayArea.scaleMode precedence is subtle — planarRenderCamera.ts L127-L129 and planarViewState.ts L68-L70. displayArea.scaleMode silently overrides viewState.scaleMode. Setting either one alone is fine; setting both can produce surprising results.
No validation that user-supplied OrientationVectors are orthonormal in clonePlanarOrientation. Bad input renders silently wrong.
Smells
Constructor throws after partial DOM mutation. this.element.style.position/overflow/background are written (PlanarViewport.ts L141-L143) before the renderer check (L177-L181). Leaves a host element in a half-initialized state if construction fails.
Many as unknown as ICamera / as unknown as vec3 casts — fine in isolation but indicate the type system is not actually checking the shape. PlanarResolvedICamera extends ICamera with presentationScale, scale, scaleMode, flipHorizontal, flipVertical — either ICamera should be updated, or the resolved type should not be cast back.
BW> For the vec3, suggest defining a new point type that is valid input for both vec3 methods/results and valid for passing as a Point
time.txt (4640 lines) is checked in at repo root. Looks like a Playwright JSON dump from the author's machine (path /Users/alireza/...). Strip before merge.
tests/todo.md ships TODOs in the repo. Move to the PR description or an issue.
PlanarViewport.type === PLANAR_NEXT is hard-coded (L109) but the legacy adapters report STACK / ORTHOGRAPHIC / etc. This duality is what every consumer's viewport.type === ... branch will hit; document the rule plainly.
createHydrateSegmentationSynchronizer uses an OHIF-flavored Surface/Labelmap branch that is mirrored inside cs3d's labelmap render plan. The PR adds significant complexity here; would want explicit test coverage for stack-labelmap with the lazy brush path (added in LazyBrushEditController.ts), particularly the failure modes documented there.
Performance hotspots worth profiling before merge
CPU slice samplers allocate fresh typed arrays per render frame — PlanarCPUVolumeSampler.ts L550, L755 — new SliceArrayConstructor(width _ height _ components) on every sample. For 512² × 1 component that's ~1 MB / frame; scrolling produces a steady stream into GC. Pool by (w, h, components) shape.
Per-pixel scalar loop with Math.min/Math.max calls inline — PlanarCPUVolumeSampler.ts L585-L617. Already has a deferred path (DEFERRED_VIEWPORT_RESAMPLE_DELAY_MS); promote it for large viewports or offload to a worker.
drawImageSync redraws full canvas — CpuVolumeSliceRenderPath.ts L466 — regardless of whether anything but pan/zoom changed. The renderingInvalidated flag is plumbed but doesn't gate the actual pixel write.
getResolvedView() rebuild storm discussed in §2.5.
VTK actor lifecycle and event-listener cleanup do look correct (removeStreamingSubscriptions?.(), removeEventListener on IMAGE_VOLUME_MODIFIED, bindings.clear() in destroy). No leak found there.
