/**
 * ViewportType enum for cornerstone-render which defines the type of viewport.
 * Every type gives a next viewport: planar, 3D, video, whole slide or ECG.
 * `STACK`, `ORTHOGRAPHIC` and `PERSPECTIVE` were removed in 6.0: use
 * `PLANAR_NEXT` for a stack or a volume, and `VOLUME_3D_NEXT` with
 * `parallelProjection: false` for a perspective view.
 *
 * @deprecated Use `ViewportTypes` from `@cornerstonejs/core` enums instead:
 * - Built-ins: `Enums.ViewportTypes.PLANAR_NEXT`, `Enums.ViewportTypes.VOLUME_3D_NEXT`, etc.
 * - Extensions: `registerViewportType({ name: 'PET', ... })` then `Enums.ViewportTypes.PET`
 * - Types: augment `ViewportTypeRegistry` / `ViewportTypeConstants`
 *
 * This enum remains for backward compatibility but is not extended at runtime.
 */
enum ViewportType {
  /** The next 3D viewport, the same viewport as `VOLUME_3D_NEXT`. */
  VOLUME_3D = 'volume3d',
  VOLUME_3D_NEXT = 'volume3dNext',
  PLANAR_NEXT = 'planarNext',
  /** The next video viewport, the same viewport as `VIDEO_NEXT`. */
  VIDEO = 'video',
  VIDEO_NEXT = 'videoNext',
  /**
   * Whole slide imaging viewport: the next whole slide viewport, the same
   * viewport as `WHOLE_SLIDE_NEXT`.
   */
  WHOLE_SLIDE = 'wholeSlide',
  WHOLE_SLIDE_NEXT = 'wholeSlideNext',
  /**
   * ECG waveform viewport for displaying DICOM ECG traces: the next ECG
   * viewport, the same viewport as `ECG_NEXT`.
   */
  ECG = 'ecg',
  ECG_NEXT = 'ecgNext',
}

export default ViewportType;
