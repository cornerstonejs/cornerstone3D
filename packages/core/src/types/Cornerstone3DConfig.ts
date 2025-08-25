import type { RenderingEngineModeType } from '../types';

interface Cornerstone3DConfig {
  gpuTier?: { tier?: number };
  /**
   * Whether the device is mobile or not.
   */
  isMobile?: boolean;

  rendering?: {
    // vtk.js supports 8bit integer textures and 32bit float textures.
    // However, if the client has norm16 textures (it can be seen by visiting
    // the webGl report at https://webglreport.com/?v=2), vtk will be default
    // to use it to improve memory usage. However, if the client don't have
    // it still another level of optimization can happen by setting the
    // preferSizeOverAccuracy since it will reduce the size of the texture to half
    // float at the cost of accuracy in rendering. This is a tradeoff that the
    // client can decide.
    //
    // Read more in the following Pull Request:
    // 1. HalfFloat: https://github.com/Kitware/vtk-js/pull/2046
    // 2. Norm16: https://github.com/Kitware/vtk-js/pull/2058
    preferSizeOverAccuracy?: boolean;
    useCPURendering?: boolean;
    /**
     * flag to control whether to use fallback behavior for z-spacing calculation in
     * volume viewports when the necessary metadata is missing. If enabled,
     * we will fall back to using slice thickness or a default value of 1 to render
     * the volume viewport when z-spacing cannot be calculated from images
     * This can help improve the usability and robustness of the visualization
     * in scenarios where the metadata is incomplete or missing, but
     * it might be wrong assumption in certain scenarios.
     */
    strictZSpacingForVolumeViewport?: boolean;

    /**
     * The rendering engine mode to use.
     * 'contextPool' is the a rendering engine that uses sequential rendering, pararllization and has enhanced support/performance for multi-monitor and high resolution displays.
     * 'tiled' is a rendering engine that uses tiled rendering.
     */
    renderingEngineMode?: RenderingEngineModeType;

    /**
     * The number of WebGL contexts to create. This is used for parallel rendering.
     * The default value is 7, which is suitable for mobile/desktop.
     */
    webGlContextCount?: number;
    volumeRendering?: {
      /** Multiplier for the calculated sample distance */
      sampleDistanceMultiplier?: number;
    };
  };

  debug: {
    /**
     * Wether or not to show the stats overlay for debugging purposes, stats include:
     * - FPS Frames rendered in the last second. The higher the number the better.
     * - MS Milliseconds needed to render a frame. The lower the number the better.
     * - MB MBytes of allocated memory. (Run Chrome with --enable-precise-memory-info)
     */
    statsOverlay?: boolean;
  };

  /**
   * This function returns an imported module for the given module id.
   * It allows replacing broken packing system imports with external importers
   * that perform lazy imports.
   */
  // eslint-disable-next-line
  peerImport?: (moduleId: string) => Promise<any>;
}

export type { Cornerstone3DConfig as default };
