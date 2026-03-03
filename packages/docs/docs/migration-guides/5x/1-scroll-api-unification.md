# Scroll API Unification

## What Changed

Viewport scrolling now follows one consistent shape:

```ts
viewport.scroll(delta, options?)
```

This applies to:

- `StackViewport`
- `VolumeViewport`
- `VideoViewport`
- `WSIViewport`

## New API

### StackViewport

```ts
stackViewport.scroll(delta, {
  debounceLoading: true,
  loop: false,
});
```

### VolumeViewport

```ts
volumeViewport.scroll(delta, {
  volumeId: 'myVolumeId',
  // Optional: set to true to scroll by slab thickness
  scrollSlabs: true,
});
```

### VideoViewport

```ts
videoViewport.scroll(delta);
```

### WSIViewport

```ts
wsiViewport.scroll(delta);
```

## Migration Guide

### Stack viewport calls

```ts
// Before
stackViewport.scroll(delta, debounceLoading, loop);

// After
stackViewport.scroll(delta, {
  debounceLoading,
  loop,
});
```

### Volume viewport calls

```ts
// Before
volumeViewport.scroll(delta, volumeId, scrollSlabs);

// After
volumeViewport.scroll(delta, {
  volumeId,
  scrollSlabs,
});
```

### Utility scroll calls

No change to the utility shape:

```ts
utilities.scroll(viewport, {
  delta,
  debounceLoading,
  loop,
  volumeId,
  scrollSlabs,
});
```

## Backward Compatibility

Legacy positional overloads are still accepted for stack and volume viewports, but are deprecated:

- `stackViewport.scroll(delta, debounce, loop)`
- `volumeViewport.scroll(delta, volumeId, useSlabThickness)`

Prefer the object-based `options` form going forward.
