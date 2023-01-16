type Cornerstone3DConfig = {
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
    hasNorm16TextureSupport: boolean;
    useCPURendering: boolean;
  };
};

export default Cornerstone3DConfig;
