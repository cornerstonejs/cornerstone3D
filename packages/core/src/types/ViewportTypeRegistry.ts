export interface CoreViewportTypeRegistry {
  stack: 'stack';
  orthographic: 'orthographic';
  perspective: 'perspective';
  volume3d: 'volume3d';
  volume3dNext: 'volume3dNext';
  planarNext: 'planarNext';
  video: 'video';
  videoNext: 'videoNext';
  wholeSlide: 'wholeSlide';
  wholeSlideNext: 'wholeSlideNext';
  ecg: 'ecg';
  ecgNext: 'ecgNext';
}

export interface CoreViewportTypeConstants {
  readonly STACK: 'stack';
  readonly ORTHOGRAPHIC: 'orthographic';
  readonly PERSPECTIVE: 'perspective';
  readonly VOLUME_3D: 'volume3d';
  readonly VOLUME_3D_NEXT: 'volume3dNext';
  readonly PLANAR_NEXT: 'planarNext';
  readonly VIDEO: 'video';
  readonly VIDEO_NEXT: 'videoNext';
  readonly WHOLE_SLIDE: 'wholeSlide';
  readonly WHOLE_SLIDE_NEXT: 'wholeSlideNext';
  readonly ECG: 'ecg';
  readonly ECG_NEXT: 'ecgNext';
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
