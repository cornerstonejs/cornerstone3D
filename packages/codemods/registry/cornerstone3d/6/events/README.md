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
- `IMAGE_LOAD_ERROR` becomes `IMAGE_LOAD_FAILED`.
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
  `NewImageEvent`, their `Detail` types `NewImageEventDetail`.

## Reported

- Review: each renamed event. `NEW_IMAGE` fires for the slices of a volume
  too; its detail has `imageIdIndex` where the volume event had
  `imageIndex`; `IMAGE_LOAD_FAILED` has no `imageIdIndex` and fires for a
  failed prefetch too.
- Manual: `PRE_STACK_NEW_IMAGE`, `STACK_VIEWPORT_SCROLL`, `PRESET_MODIFIED`,
  `ACTORS_CHANGED`, `CLIPPING_PLANES_UPDATED`, the two
  `DYNAMIC_VOLUME_TIME_POINT_*` events (also quoted, with a default or in
  brackets), their event types, a rest element or a key computed from code
  in a pattern of `Enums.Events`, and a string
  such as `'CORNERSTONE_STACK_NEW_IMAGE'`,
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
