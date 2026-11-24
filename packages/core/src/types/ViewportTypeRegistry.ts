/**
 * The viewport type strings of the library.
 */
export interface CoreViewportTypeRegistry {
  planar: 'planar';
  volume3d: 'volume3d';
  video: 'video';
  wholeSlide: 'wholeSlide';
  ecg: 'ecg';
}

/**
 * The names of `Enums.ViewportTypes`.
 */
export interface CoreViewportTypeConstants {
  readonly PLANAR: 'planar';
  readonly VOLUME_3D: 'volume3d';
  readonly VIDEO: 'video';
  readonly WHOLE_SLIDE: 'wholeSlide';
  readonly ECG: 'ecg';
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
