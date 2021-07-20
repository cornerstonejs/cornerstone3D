import * as cornerstone3D from '../src/index'

// import { User } from ... doesn't work right now since we don't have named exports set up
const {
  cache,
  RenderingEngine,
  registerImageLoader,
  registerVolumeLoader,
  unregisterAllImageLoaders,
  metaData,
  Utilities,
} = cornerstone3D

const { fakeImageLoader, fakeMetaDataProvider, volumeLoader } =
  Utilities.testUtils

const renderingEngineUID = 'RENDERING_ENGINE_UID'

const scene1UID = 'SCENE_1'
const viewportUID = 'VIEWPORT'

const AXIAL = 'AXIAL'

const DOMElements = []

function createCanvas(renderingEngine, orientation, width, height) {
  const canvas = document.createElement('canvas')

  canvas.style.width = `${width}px`
  canvas.style.height = `${height}px`
  document.body.appendChild(canvas)
  DOMElements.push(canvas)

  return canvas
}

describe('Stack Viewport Nearest Neighbor Interpolation --- ', function () {
  beforeEach(function () {
    cache.purgeCache()

    this.renderingEngine = new RenderingEngine(renderingEngineUID)
    registerImageLoader('fakeImageLoader', fakeImageLoader)
    registerVolumeLoader('fakeVolumeLoader', volumeLoader)

    metaData.addProvider(fakeMetaDataProvider, 10000)
  })

  afterEach(function () {
    cache.purgeCache()
    this.renderingEngine.destroy()
    metaData.removeProvider(fakeMetaDataProvider)
    unregisterAllImageLoaders()
    // DOMElements.forEach((el) => {
    //   if (el.parentNode) {
    //     el.parentNode.removeChild(el)
    //   }
    // })
  })

  // it('Render stack from decached volume', function (done) {
  //   const canvas = createCanvas(this.renderingEngine, AXIAL, 256, 256)
  //   const canvas1 = createCanvas(this.renderingEngine, AXIAL, 256, 256)

  //   this.renderingEngine.setViewports([
  //     {
  //       sceneUID: scene1UID,
  //       viewportUID: viewportUID,
  //       type: VIEWPORT_TYPE.ORTHOGRAPHIC,
  //       canvas: canvas,
  //       defaultOptions: {
  //         orientation: ORIENTATION.AXIAL,
  //         background: [1, 0, 1], // pinkish background
  //       },
  //     },
  //     {
  //       sceneUID: 'stack',
  //       viewportUID: 'stack',
  //       type: VIEWPORT_TYPE.STACK,
  //       canvas: canvas1,
  //       defaultOptions: {
  //         background: [1, 0, 1], // pinkish background
  //       },
  //     },
  //   ])
  //   // fake volume generator follows the pattern of
  //   // volumeScheme:volumeURI_xSize_ySize_zSize_barStart_barWidth_xSpacing_ySpacing_zSpacing_rgbFlag
  //   const volumeId = 'fakeVolumeLoader:volumeURI_100_100_5_1_1_1_0'

  //   canvas.addEventListener(EVENTS.IMAGE_RENDERED, () => {
  //     const image = canvas.toDataURL('image/png')
  //     console.debug('volume', image)
  //     // compareImages(
  //     //   image,
  //     //   volumeURI_100_100_10_1_1_1_0_axial_nearest,
  //     //   'volumeURI_100_100_10_1_1_1_0_axial_nearest'
  //     // ).then(done, done.fail)
  //   })

  //   canvas1.addEventListener(EVENTS.IMAGE_RENDERED, () => {
  //     const image = canvas1.toDataURL('image/png')
  //     console.debug('stack', image)
  //     // compareImages(
  //     //   image,
  //     //   volumeURI_100_100_10_1_1_1_0_axial_nearest,
  //     //   'volumeURI_100_100_10_1_1_1_0_axial_nearest'
  //     // ).then(done, done.fail)
  //   })

  //   const callback = ({ volumeActor }) =>
  //     volumeActor.getProperty().setInterpolationTypeToNearest()

  //   try {
  //     createAndCacheVolume(volumeId, { imageIds: [] })
  //       .then(() => {
  //         const ctScene = this.renderingEngine.getScene(scene1UID)
  //         ctScene.setVolumes([{ volumeUID: volumeId, callback }])
  //         ctScene.render()

  //         const volume = cache.getVolume(volumeId)
  //         volume.decache()
  //         console.debug(
  //           'image cache after',
  //           Array.from(cache._imageCache.keys())
  //         )

  //         const vp = this.renderingEngine.getViewport('stack')
  //         console.debug('stack viewport', vp)
  //         vp.setStack(Array.from(cache._imageCache.keys()), 0, [callback])
  //         this.renderingEngine.render()
  //       })
  //       .catch((e) => done(e))
  //   } catch (e) {
  //     done.fail(e)
  //   }
  // })

  // it('Debug volume and stack side by side and setTimeOut', function (done) {
  //   const canvas = createCanvas(this.renderingEngine, AXIAL, 256, 256)
  //   const canvas1 = createCanvas(this.renderingEngine, AXIAL, 256, 256)

  //   this.renderingEngine.setViewports([
  //     {
  //       sceneUID: scene1UID,
  //       viewportUID: viewportUID,
  //       type: VIEWPORT_TYPE.STACK,
  //       canvas: canvas,
  //       defaultOptions: {
  //         background: [1, 0, 1], // pinkish background
  //       },
  //     },
  //     {
  //       sceneUID: 'volume',
  //       viewportUID: 'volume',
  //       type: VIEWPORT_TYPE.ORTHOGRAPHIC,
  //       canvas: canvas1,
  //       defaultOptions: {
  //         orientation: ORIENTATION.AXIAL,
  //         background: [1, 0, 1], // pinkish background
  //       },
  //     },
  //   ])
  //   // imageId : imageLoaderScheme: imageURI_rows_colums_barStart_barWidth_xSpacing_ySpacing_rgbFlag
  //   const imageId = 'fakeImageLoader:imageURI_64_64_20_5_1_1_0'
  //   const volumeId = 'fakeVolumeLoader:volumeURI_100_100_10_1_1_1_0'

  //   const vp = this.renderingEngine.getViewport(viewportUID)
  //   canvas.addEventListener(EVENTS.IMAGE_RENDERED, () => {
  //     // done()
  //     const image = canvas.toDataURL('image/png')
  //     console.debug('stack', image)
  //     // compareImages(
  //     //   image,
  //     //   imageURI_64_64_20_5_1_1_0_nearest,
  //     //   'imageURI_64_64_20_5_1_1_0_nearest'
  //     // ).then(done, done.fail)
  //   })

  //   canvas1.addEventListener(EVENTS.IMAGE_RENDERED, () => {
  //     // done()
  //     const image = canvas1.toDataURL('image/png')
  //     console.debug('volume,', image)
  //     // compareImages(
  //     //   image,
  //     //   imageURI_64_64_20_5_1_1_0_nearest,
  //     //   'imageURI_64_64_20_5_1_1_0_nearest'
  //     // ).then(done, done.fail)
  //   })

  //   setTimeout(() => {
  //     const image = this.renderingEngine._debugRender()
  //     console.debug(image)
  //   }, 3000)

  //   const callback = ({ volumeActor }) =>
  //     volumeActor.getProperty().setInterpolationTypeToNearest()

  //   try {
  //     vp.setStack([imageId], 0, [callback])
  //     createAndCacheVolume(volumeId, { imageIds: [] }).then(() => {
  //       const ctScene = this.renderingEngine.getScene('volume')
  //       ctScene.setVolumes([{ volumeUID: volumeId, callback }])
  //       ctScene.render()
  //     })
  //     this.renderingEngine.render()
  //   } catch (e) {
  //     done.fail(e)
  //   }
  // })
})
