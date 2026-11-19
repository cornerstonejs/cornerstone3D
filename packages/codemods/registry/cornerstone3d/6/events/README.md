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
`const { STACK_NEW_IMAGE } = Enums.Events`.

- `STACK_NEW_IMAGE` and `VOLUME_NEW_IMAGE` become `NEW_IMAGE`.
- `IMAGE_LOAD_ERROR` becomes `IMAGE_LOAD_FAILED`.
- A destructured name is renamed with its uses; two that become one keep one
  entry. When the new name is taken in the file, the entry becomes
  `NEW_IMAGE: STACK_NEW_IMAGE`.
- `Types.EventTypes.StackNewImageEvent` and `VolumeNewImageEvent` become
  `NewImageEvent`, their `Detail` types `NewImageEventDetail`.

## Reported

- Review: each renamed event. `NEW_IMAGE` fires for the slices of a volume
  too; its detail has `imageIdIndex` where the volume event had
  `imageIndex`; `IMAGE_LOAD_FAILED` has no `imageIdIndex` and fires for a
  failed prefetch too.
- Manual: `PRE_STACK_NEW_IMAGE`, `STACK_VIEWPORT_SCROLL`, `PRESET_MODIFIED`,
  `ACTORS_CHANGED`, `CLIPPING_PLANES_UPDATED`, the two
  `DYNAMIC_VOLUME_TIME_POINT_*` events, their event types, and a string
  such as `'CORNERSTONE_STACK_NEW_IMAGE'` (a listener of it compiles and
  never runs).

## Development

From `packages/codemods`:

```sh
yarn test
npx codemod workflow validate -w registry/cornerstone3d/6/events
```

The fixtures of `.ts` files are in `tests/typescript` (parsed as TypeScript),
the others in `tests/tsx`. Each `metrics.json` holds the sites that a fixture
reports.
