/**
 * The viewport type strings of the library. The `*Next` strings are the 5.x
 * strings of the same types: the rendering engine still makes the viewport
 * for one (a stored layout, for example), and the viewport has the plain
 * string as its `type`.
 */
export interface CoreViewportTypeRegistry {
  planar: 'planar';
  volume3d: 'volume3d';
  video: 'video';
  wholeSlide: 'wholeSlide';
  ecg: 'ecg';
  /** @deprecated Use `'planar'`. */
  planarNext: 'planarNext';
  /** @deprecated Use `'volume3d'`. */
  volume3dNext: 'volume3dNext';
  /** @deprecated Use `'video'`. */
  videoNext: 'videoNext';
  /** @deprecated Use `'wholeSlide'`. */
  wholeSlideNext: 'wholeSlideNext';
  /** @deprecated Use `'ecg'`. */
  ecgNext: 'ecgNext';
}

/**
 * The names of `Enums.ViewportTypes`. The `_NEXT` names are the 5.x names of
 * the same types, with the plain strings as their values.
 */
export interface CoreViewportTypeConstants {
  readonly PLANAR: 'planar';
  readonly VOLUME_3D: 'volume3d';
  readonly VIDEO: 'video';
  readonly WHOLE_SLIDE: 'wholeSlide';
  readonly ECG: 'ecg';
  /** @deprecated Use `PLANAR`. */
  readonly PLANAR_NEXT: 'planar';
  /** @deprecated Use `VOLUME_3D`. */
  readonly VOLUME_3D_NEXT: 'volume3d';
  /** @deprecated Use `VIDEO`. */
  readonly VIDEO_NEXT: 'video';
  /** @deprecated Use `WHOLE_SLIDE`. */
  readonly WHOLE_SLIDE_NEXT: 'wholeSlide';
  /** @deprecated Use `ECG`. */
  readonly ECG_NEXT: 'ecg';
}

/**
 * Extensions can augment this interface to add additional runtime viewport type
 * strings, e.g. `interface ViewportTypeRegistry { 'myOrg:pet': 'myOrg:pet' }`.
 */
export interface ViewportTypeRegistry extends CoreViewportTypeRegistry {}

/**
 * Extensions augment this interface to add names on `Enums.ViewportTypes`.
 * `ViewportTypesMap` and the runtime `Enums.ViewportTypes` object are typed
 * from this interface — update it once, e.g.:
 *
 * `interface ViewportTypeConstants { readonly PET: 'myOrg:pet' }`
 */
export interface ViewportTypeConstants extends CoreViewportTypeConstants {}

export type ViewportType = ViewportTypeRegistry[keyof ViewportTypeRegistry];
