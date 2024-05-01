import type { TierResult, GetGPUTier } from 'detect-gpu';

type Cornerstone3DConfig = {
  /**
   * It is used to store the device information,
   * we use it if provided if not a network call is performed.
   * Its type is the `TierResult` in the `detect-gpu` library.
   * https://github.com/pmndrs/detect-gpu/blob/master/src/index.ts#L82
   */
  gpuTier?: TierResult;

  /**
   * Whether the device is mobile or not.
   */
  isMobile: boolean;
  /**
   * When the `gpuTier` is not provided, the `detectGPUConfig` is passed as
   * an argument to the `getGPUTier` method.
   * Its type is the `GetGPUTier` in the `detect-gpu` library.
   * https://github.com/pmndrs/detect-gpu/blob/master/src/index.ts#L20
   */
  detectGPUConfig: GetGPUTier;
  rendering: {
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
    preferSizeOverAccuracy: boolean;
    // Whether the EXT_texture_norm16 extension is supported by the browser.
    // WebGL 2 report (link: https://webglreport.com/?v=2) can be used to check
    // if the browser supports this extension.
    // In case the browser supports this extension, instead of using 32bit float
    // textures, 16bit float textures will be used to reduce the memory usage where
    // possible.
    // Norm16 may not work currently due to the two active bugs in chrome + safari
    // https://bugs.chromium.org/p/chromium/issues/detail?id=1408247
    // https://bugs.webkit.org/show_bug.cgi?id=252039
    useNorm16Texture: boolean;
    useCPURendering: boolean;
    /**
     * flag to control whether to use fallback behavior for z-spacing calculation in
     * volume viewports when the necessary metadata is missing. If enabled,
     * we will fall back to using slice thickness or a default value of 1 to render
     * the volume viewport when z-spacing cannot be calculated from images
     * This can help improve the usability and robustness of the visualization
     * in scenarios where the metadata is incomplete or missing, but
     * it might be wrong assumption in certain scenarios.
     */
    strictZSpacingForVolumeViewport: boolean;
  };
  /**
   * This flag controls whether to enable cache optimization or not. Basically,
   * when we have a stack viewport (image stack) and we convert it to a volume
   * the volume will be cached as well as the stack. However, if we can optimize this
   * by going back to the image cache and create a view at the correct offset
   * of the bigger volume array buffer, this will save memory. This will get enabled
   * if cornerstone3D is configured to use SharedArrayBuffer, the reason is that
   * when we modify the image cache then the images are referring to a different
   * buffer (SharedArrayBuffer) and some systems don't support shared array
   * buffers.
   */
  enableCacheOptimization: boolean;
};

export default Cornerstone3DConfig;
