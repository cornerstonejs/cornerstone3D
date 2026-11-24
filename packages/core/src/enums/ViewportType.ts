/**
 * ViewportType enum for cornerstone-render which defines the type of viewport.
 * Every type gives a viewport of one family: planar, 3D, video, whole slide or
 * ECG. `STACK`, `ORTHOGRAPHIC` and `PERSPECTIVE` were removed in 6.0: use
 * `PLANAR` for a stack or a volume, and `VOLUME_3D` with
 * `parallelProjection: false` for a perspective view.
 *
 * @deprecated Use `ViewportTypes` from `@cornerstonejs/core` enums instead:
 * - Built-ins: `Enums.ViewportTypes.PLANAR`, `Enums.ViewportTypes.VOLUME_3D`, etc.
 * - Extensions: `registerViewportType({ name: 'PET', ... })` then `Enums.ViewportTypes.PET`
 * - Types: augment `ViewportTypeRegistry` / `ViewportTypeConstants`
 *
 * This enum remains for backward compatibility but is not extended at runtime.
 */
enum ViewportType {
  /** The planar viewport: a stack of images or a slice of a volume. */
  PLANAR = 'planar',
  /** The 3D viewport. */
  VOLUME_3D = 'volume3d',
  /** The video viewport. */
  VIDEO = 'video',
  /** The whole slide imaging viewport. */
  WHOLE_SLIDE = 'wholeSlide',
  /** The ECG waveform viewport for displaying DICOM ECG traces. */
  ECG = 'ecg',
}

export default ViewportType;
