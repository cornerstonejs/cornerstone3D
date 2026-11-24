# Cornerstone3D 6.0 Events Migration

Rewrites the events that Cornerstone3D 6.0 removes and that have one event in
their place. Step 9 of the
[upgrade](https://www.cornerstonejs.org/docs/migration-guides/6x/upgrade-step-by-step#step-9-events).

## Usage

```sh
npx codemod @cornerstonejs/cornerstone3d-6-events
```

## Changes

An event is found through the core `Enums.Events`: `Enums.Events.X`,
`const { Events } = Enums`, or a name taken out with
`const { STACK_NEW_IMAGE } = Enums.Events`; and through the core export
`EVENTS`, which is the same enum: `EVENTS.X` of `import { EVENTS }` (also
under an alias), `cornerstone.EVENTS.X` of the namespace, or
`const { STACK_NEW_IMAGE } = EVENTS`.

- `STACK_NEW_IMAGE` and `VOLUME_NEW_IMAGE` become `NEW_IMAGE`.
- `VIEWPORT_NEW_IMAGE_SET` and `VOLUME_VIEWPORT_NEW_VOLUME` become
  `DISPLAY_SETS_CHANGED`.
- `IMAGE_LOAD_ERROR` becomes `IMAGE_LOAD_FAILED`.
- `STACK_SCROLL_OUT_OF_BOUNDS` and `VOLUME_VIEWPORT_SCROLL_OUT_OF_BOUNDS`
  become `SCROLL_OUT_OF_BOUNDS`. In a listener of one of them that the file
  shows (as for `NEW_IMAGE` below, or with its event typed
  `StackScrollOutOfBoundsEvent` or `VolumeScrollOutOfBoundsEvent`),
  `detail.direction` of the stack event becomes `detail.delta` and
  `detail.currentImageId` of the volume event `detail.imageId`. Two entries
  of one pattern of `Enums.Events` become one entry.
- In a listener of `STACK_NEW_IMAGE` or `VOLUME_NEW_IMAGE` that the file
  shows (given to `addEventListener` inline, by its name or as
  `this.listener`, or with its event typed `StackNewImageEvent` or
  `VolumeNewImageEvent`), the key of the detail that is `sliceIndex` in 6.0
  is written: `detail.imageIdIndex` of the stack event and
  `detail.imageIndex` of the volume event, plain, quoted in brackets or in a
  pattern of the detail (a shorthand keeps its local name when `sliceIndex`
  is taken or a use is not a plain name, and with a default value).
- A destructured name is renamed with its uses. When the pattern has
  `NEW_IMAGE` already, the entry goes and its uses take the local name of
  `NEW_IMAGE`, where that name means the same binding at each use. When the
  new name is taken in the file, or a use is not a plain name, the entry
  becomes `NEW_IMAGE: STACK_NEW_IMAGE`. An entry with a local name keeps it
  and only its key changes: `{ STACK_NEW_IMAGE: onImage }` becomes
  `{ NEW_IMAGE: onImage }`; a quoted key (`'STACK_NEW_IMAGE'`) and a string
  in brackets (`['STACK_NEW_IMAGE']`) keep their quotes, and a shorthand
  with a default value keeps its local name
  (`{ NEW_IMAGE: STACK_NEW_IMAGE = fallback }`).
- `Enums.Events['STACK_NEW_IMAGE']` becomes `Enums.Events['NEW_IMAGE']`.
- `Types.EventTypes.StackNewImageEvent` and `VolumeNewImageEvent` become
  `NewImageEvent`, their `Detail` types `NewImageEventDetail`;
  `StackViewportNewStackEvent` becomes `DisplaySetsChangedEvent`, its
  `Detail` type `DisplaySetsChangedEventDetail`; `StackScrollOutOfBoundsEvent`
  and `VolumeScrollOutOfBoundsEvent` become `ScrollOutOfBoundsEvent`, their
  `Detail` types `ScrollOutOfBoundsEventDetail`.

## Reported

- Review: each renamed event. `NEW_IMAGE` fires for the slices of a volume
  too; its detail has `sliceIndex` where the stack event had `imageIdIndex`
  and the volume event `imageIndex`; `DISPLAY_SETS_CHANGED` also fires when
  an overlay such as a labelmap is added or removed, so a listener that
  cares only for the source adds `if (!evt.detail.sourceChanged) return`;
  `IMAGE_LOAD_FAILED` has no `imageIdIndex` and fires for a failed prefetch
  too; `SCROLL_OUT_OF_BOUNDS` fires for a stack, a volume in any orientation
  and a video, on the element and on `eventTarget`, and not with `loop`, and
  its detail has `sliceIndex` (where the scroll stopped) and
  `numberOfSlices`, and no `imageIdIndex`, `currentStepIndex`,
  `desiredStepIndex`, `numScrollSteps` or `viewport`.
- Manual, with what to listen to instead (`NEW_IMAGE` for the slice that
  shows, `CAMERA_MODIFIED` for the camera): `STACK_VIEWPORT_SCROLL` and
  `VOLUME_VIEWPORT_SCROLL`.
- Manual: `PRE_STACK_NEW_IMAGE`, `PRESET_MODIFIED`,
  `ACTORS_CHANGED`, `CLIPPING_PLANES_UPDATED`, the two
  `DYNAMIC_VOLUME_TIME_POINT_*` events (also quoted, with a default or in
  brackets), their event types, a rest element or a key computed from code
  in a pattern of `Enums.Events`, and a string
  such as `'CORNERSTONE_STACK_NEW_IMAGE'`,
  `'CORNERSTONE_VIEWPORT_NEW_IMAGE_SET'`, `'STACK_SCROLL_OUT_OF_BOUNDS'`,
  `'DYNAMIC_VOLUME_TIME_POINT_LOADED'` or `'IMAGE_LOAD_ERROR'` (a listener
  of it compiles and never runs; a planar viewport no longer fires
  `IMAGE_LOAD_ERROR`).
- Manual, at line 1: `the file was not analysed:` with the reason, for a
  file whose names cannot be looked up (the tool cannot read it, or a name
  is declared twice in one scope). The file stays as it is. See the README
  of `@cornerstonejs/cornerstone3d-6`.

## Development

From `packages/codemods`:

```sh
yarn test
npx codemod workflow validate -w registry/cornerstone3d/6/events
```

The fixtures of `.ts` files are in `tests/typescript` (parsed as TypeScript),
the others in `tests/tsx`. Each `metrics.json` holds the sites that a fixture
reports.
