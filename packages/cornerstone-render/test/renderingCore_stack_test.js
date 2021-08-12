import * as cornerstone3D from '../src/index'

// nearest neighbor interpolation
import * as imageURI_64_33_20_5_1_1_0_nearest from './groundTruth/imageURI_64_33_20_5_1_1_0_nearest.png'
import * as imageURI_64_64_20_5_1_1_0_nearest from './groundTruth/imageURI_64_64_20_5_1_1_0_nearest.png'
import * as imageURI_64_64_30_10_5_5_0_nearest from './groundTruth/imageURI_64_64_30_10_5_5_0_nearest.png'
import * as imageURI_256_256_100_100_1_1_0_nearest from './groundTruth/imageURI_256_256_100_100_1_1_0_nearest.png'
import * as imageURI_256_256_100_100_1_1_0_CT_nearest from './groundTruth/imageURI_256_256_100_100_1_1_0_CT_nearest.png'
import * as imageURI_64_64_54_10_5_5_0_nearest from './groundTruth/imageURI_64_64_54_10_5_5_0_nearest.png'
import * as imageURI_64_64_0_10_5_5_0_nearest from './groundTruth/imageURI_64_64_0_10_5_5_0_nearest.png'
import * as imageURI_100_100_0_10_1_1_1_nearest_color from './groundTruth/imageURI_100_100_0_10_1_1_1_nearest_color.png'
import * as imageURI_11_11_4_1_1_1_0_nearest_invert_90deg from './groundTruth/imageURI_11_11_4_1_1_1_0_nearest_invert_90deg.png'

// linear interpolation
import * as imageURI_11_11_4_1_1_1_0 from './groundTruth/imageURI_11_11_4_1_1_1_0.png'
import * as imageURI_256_256_50_10_1_1_0 from './groundTruth/imageURI_256_256_50_10_1_1_0.png'
import * as imageURI_100_100_0_10_1_1_1_linear_color from './groundTruth/imageURI_100_100_0_10_1_1_1_linear_color.png'

import { setCTWWWC } from '../../demo/src/helpers/transferFunctionHelpers'
// import { User } from ... doesn't work right now since we don't have named exports set up

const {
  cache,
  RenderingEngine,
  VIEWPORT_TYPE,
  ORIENTATION,
  INTERPOLATION_TYPE,
  Utilities,
  registerImageLoader,
  unregisterAllImageLoaders,
  metaData,
  EVENTS,
} = cornerstone3D

const { calibratedPixelSpacingMetadataProvider } = Utilities

const { fakeImageLoader, fakeMetaDataProvider, compareImages, downloadURI } =
  Utilities.testUtils

const renderingEngineUID = 'RENDERING_ENGINE_UID'

const scene1UID = 'SCENE_1'
const viewportUID = 'VIEWPORT'
const viewportUID2 = 'VIEWPORT2'

const AXIAL = 'AXIAL'

const DOMElements = []

function createCanvas(renderingEngine, orientation, width, height) {
  const canvas = document.createElement('canvas')

  canvas.style.width = `${width}px`
  canvas.style.height = `${height}px`
  document.body.appendChild(canvas)
  DOMElements.push(canvas)

  renderingEngine.setViewports([
    {
      sceneUID: scene1UID,
      viewportUID: viewportUID,
      type: VIEWPORT_TYPE.STACK,
      canvas: canvas,
      defaultOptions: {
        background: [1, 0, 1], // pinkish background
      },
    },
  ])
  return canvas
}

describe('Stack Viewport Nearest Neighbor Interpolation --- ', function () {
  beforeEach(function () {
    cache.purgeCache()

    this.renderingEngine = new RenderingEngine(renderingEngineUID)
    registerImageLoader('fakeImageLoader', fakeImageLoader)
    metaData.addProvider(fakeMetaDataProvider, 10000)
  })

  afterEach(function () {
    cache.purgeCache()
    this.renderingEngine.destroy()
    metaData.removeProvider(fakeMetaDataProvider)
    unregisterAllImageLoaders()
    DOMElements.forEach((el) => {
      if (el.parentNode) {
        el.parentNode.removeChild(el)
      }
    })
  })

  it('Should render one stack viewport of square size properly: nearest', function (done) {
    const canvas = createCanvas(this.renderingEngine, AXIAL, 256, 256)

    // imageId : imageLoaderScheme: imageURI_rows_colums_barStart_barWidth_xSpacing_ySpacing_rgbFlag
    const imageId = 'fakeImageLoader:imageURI_64_64_20_5_1_1_0'

    const vp = this.renderingEngine.getViewport(viewportUID)
    canvas.addEventListener(EVENTS.IMAGE_RENDERED, () => {
      const image = canvas.toDataURL('image/png')
      compareImages(
        image,
        imageURI_64_64_20_5_1_1_0_nearest,
        'imageURI_64_64_20_5_1_1_0_nearest'
      ).then(done, done.fail)
    })

    try {
      vp.setStack([imageId], 0)
      vp.setProperties({ interpolationType: INTERPOLATION_TYPE.NEAREST })
      this.renderingEngine.render()
    } catch (e) {
      done.fail(e)
    }
  })

  it('Should render one stack viewport of rectangle size properly: nearest', function (done) {
    const canvas = createCanvas(this.renderingEngine, AXIAL, 256, 256)

    const imageId = 'fakeImageLoader:imageURI_64_33_20_5_1_1_0'

    const vp = this.renderingEngine.getViewport(viewportUID)

    canvas.addEventListener(EVENTS.IMAGE_RENDERED, () => {
      const image = canvas.toDataURL('image/png')
      compareImages(
        image,
        imageURI_64_33_20_5_1_1_0_nearest,
        'imageURI_64_33_20_5_1_1_0_nearest'
      ).then(done, done.fail)
    })

    try {
      vp.setStack([imageId], 0)
      vp.setProperties({ interpolationType: INTERPOLATION_TYPE.NEAREST })
      this.renderingEngine.render()
    } catch (e) {
      done.fail(e)
    }
  })

  it('Should render one stack viewport of square size and 5mm spacing properly: nearest', function (done) {
    const canvas = createCanvas(this.renderingEngine, AXIAL, 256, 256)

    const imageId = 'fakeImageLoader:imageURI_64_64_30_10_5_5_0'

    const vp = this.renderingEngine.getViewport(viewportUID)

    canvas.addEventListener(EVENTS.IMAGE_RENDERED, () => {
      const image = canvas.toDataURL('image/png')

      compareImages(
        image,
        imageURI_64_64_30_10_5_5_0_nearest,
        'imageURI_64_64_30_10_5_5_0_nearest'
      ).then(done, done.fail)
    })

    try {
      vp.setStack([imageId], 0)
      vp.setProperties({ interpolationType: INTERPOLATION_TYPE.NEAREST })
      this.renderingEngine.render()
    } catch (e) {
      done.fail(e)
    }
  })

  it('Should use enableElement API to render one stack viewport of square size and 5mm spacing properly: nearest', function (done) {
    const canvas = document.createElement('canvas')

    canvas.style.width = `256px`
    canvas.style.height = `256px`
    document.body.appendChild(canvas)
    DOMElements.push(canvas)

    // const canvas = createCanvas(this.renderingEngine, AXIAL, 256, 256)

    const imageId = 'fakeImageLoader:imageURI_64_64_30_10_5_5_0'

    this.renderingEngine.enableElement({
      sceneUID: scene1UID,
      viewportUID: viewportUID,
      type: VIEWPORT_TYPE.STACK,
      canvas: canvas,
      defaultOptions: {
        background: [1, 0, 1], // pinkish background
      },
    })

    const vp = this.renderingEngine.getViewport(viewportUID)

    canvas.addEventListener(EVENTS.IMAGE_RENDERED, () => {
      const image = canvas.toDataURL('image/png')

      compareImages(
        image,
        imageURI_64_64_30_10_5_5_0_nearest,
        'imageURI_64_64_30_10_5_5_0_nearest'
      ).then(done, done.fail)
    })

    try {
      vp.setStack([imageId], 0)
      vp.setProperties({ interpolationType: INTERPOLATION_TYPE.NEAREST })
      this.renderingEngine.render()
    } catch (e) {
      done.fail(e)
    }
  })

  it('Should render one stack viewport, first slice correctly: nearest', function (done) {
    const canvas = createCanvas(this.renderingEngine, AXIAL, 256, 256)

    const imageId1 = 'fakeImageLoader:imageURI_64_64_0_10_5_5_0'
    const imageId2 = 'fakeImageLoader:imageURI_64_64_10_20_5_5_0'
    const imageId3 = 'fakeImageLoader:imageURI_64_64_20_30_5_5_0'

    const vp = this.renderingEngine.getViewport(viewportUID)

    canvas.addEventListener(EVENTS.IMAGE_RENDERED, () => {
      const image = canvas.toDataURL('image/png')

      compareImages(
        image,
        imageURI_64_64_0_10_5_5_0_nearest,
        'imageURI_64_64_0_10_5_5_0_nearest'
      ).then(done, done.fail)
    })

    try {
      vp.setStack([imageId1, imageId2, imageId3], 0)
      vp.setProperties({ interpolationType: INTERPOLATION_TYPE.NEAREST })
      this.renderingEngine.render()
    } catch (e) {
      done.fail(e)
    }
  })
  it('Should render one stack viewport, last slice correctly: nearest', function (done) {
    const canvas = createCanvas(this.renderingEngine, AXIAL, 256, 256)

    const imageId1 = 'fakeImageLoader:imageURI_64_64_0_10_5_5_0'
    const imageId2 = 'fakeImageLoader:imageURI_64_64_10_20_5_5_0'
    const imageId3 = 'fakeImageLoader:imageURI_64_64_54_10_5_5_0'

    const vp = this.renderingEngine.getViewport(viewportUID)

    canvas.addEventListener(EVENTS.IMAGE_RENDERED, () => {
      const image = canvas.toDataURL('image/png')

      compareImages(
        image,
        imageURI_64_64_54_10_5_5_0_nearest,
        'imageURI_64_64_54_10_5_5_0_nearest'
      ).then(done, done.fail)
    })

    try {
      vp.setStack([imageId1, imageId2, imageId3], 2)
      vp.setProperties({ interpolationType: INTERPOLATION_TYPE.NEAREST })
      this.renderingEngine.render()
    } catch (e) {
      done.fail(e)
    }
  })

  it('Should render one stack viewport with CT presets correctly: nearest', function (done) {
    const canvas = createCanvas(this.renderingEngine, AXIAL, 256, 256)

    const imageId = 'fakeImageLoader:imageURI_256_256_100_100_1_1_0'

    const vp = this.renderingEngine.getViewport(viewportUID)

    canvas.addEventListener(EVENTS.IMAGE_RENDERED, () => {
      const image = canvas.toDataURL('image/png')

      compareImages(
        image,
        imageURI_256_256_100_100_1_1_0_CT_nearest,
        'imageURI_256_256_100_100_1_1_0_CT_nearest'
      ).then(done, done.fail)
    })

    try {
      vp.setStack([imageId], 0)
      vp.setProperties({
        voiRange: { lower: -160, upper: 240 },
        interpolationType: INTERPOLATION_TYPE.NEAREST,
      })
      this.renderingEngine.render()
    } catch (e) {
      done.fail(e)
    }
  })

  it('Should render one stack viewport with multiple imageIds of different size and different spacing: nearest', function (done) {
    const canvas = createCanvas(this.renderingEngine, AXIAL, 256, 256)

    const imageId1 = 'fakeImageLoader:imageURI_256_256_100_100_1_1_0'
    const imageId2 = 'fakeImageLoader:imageURI_64_64_30_10_5_5_0'

    const vp = this.renderingEngine.getViewport(viewportUID)

    canvas.addEventListener(EVENTS.IMAGE_RENDERED, () => {
      const image = canvas.toDataURL('image/png')

      compareImages(
        image,
        imageURI_256_256_100_100_1_1_0_nearest,
        'imageURI_256_256_100_100_1_1_0_nearest'
      ).then(done, done.fail)
    })

    try {
      vp.setStack([imageId1, imageId2], 0)
      vp.setProperties({ interpolationType: INTERPOLATION_TYPE.NEAREST })
      this.renderingEngine.render()
    } catch (e) {
      done.fail(e)
    }
  })

  it('Should render one stack viewport with multiple imageIds of different size and different spacing, second slice: nearest', function (done) {
    const canvas = createCanvas(this.renderingEngine, AXIAL, 256, 256)

    const imageId1 = 'fakeImageLoader:imageURI_256_256_100_100_1_1_0'
    const imageId2 = 'fakeImageLoader:imageURI_64_64_30_10_5_5_0'

    const vp = this.renderingEngine.getViewport(viewportUID)

    canvas.addEventListener(EVENTS.IMAGE_RENDERED, () => {
      const image = canvas.toDataURL('image/png')

      compareImages(
        image,
        imageURI_64_64_30_10_5_5_0_nearest,
        'imageURI_64_64_30_10_5_5_0_nearest'
      ).then(done, done.fail)
    })

    try {
      vp.setStack([imageId1, imageId2], 1)
      vp.setProperties({ interpolationType: INTERPOLATION_TYPE.NEAREST })
      this.renderingEngine.render()
    } catch (e) {
      done.fail(e)
    }
  })
})

describe('Stack Viewport Linear Interpolation --- ', () => {
  beforeEach(function () {
    cache.purgeCache()

    this.renderingEngine = new RenderingEngine(renderingEngineUID)
    registerImageLoader('fakeImageLoader', fakeImageLoader)
    metaData.addProvider(fakeMetaDataProvider, 10000)
  })

  afterEach(function () {
    cache.purgeCache()
    this.renderingEngine.destroy()
    metaData.removeProvider(fakeMetaDataProvider)
    unregisterAllImageLoaders()
    DOMElements.forEach((el) => {
      if (el.parentNode) {
        el.parentNode.removeChild(el)
      }
    })
  })

  it('Should render one stack viewport with linear interpolation correctly', function (done) {
    const canvas = createCanvas(this.renderingEngine, AXIAL, 256, 256)

    const imageId1 = 'fakeImageLoader:imageURI_11_11_4_1_1_1_0'
    const vp = this.renderingEngine.getViewport(viewportUID)
    canvas.addEventListener(EVENTS.IMAGE_RENDERED, () => {
      const image = canvas.toDataURL('image/png')
      compareImages(
        image,
        imageURI_11_11_4_1_1_1_0,
        'imageURI_11_11_4_1_1_1_0'
      ).then(done, done.fail)
    })
    try {
      vp.setStack([imageId1], 0)
      this.renderingEngine.render()
    } catch (e) {
      done.fail(e)
    }
  })

  it('Should render one stack viewport with multiple images with linear interpolation correctly', function (done) {
    const canvas = createCanvas(this.renderingEngine, AXIAL, 256, 256)

    const imageId1 = 'fakeImageLoader:imageURI_11_11_4_1_1_1_0'
    const imageId2 = 'fakeImageLoader:imageURI_256_256_50_10_1_1_0'

    const vp = this.renderingEngine.getViewport(viewportUID)
    canvas.addEventListener(EVENTS.IMAGE_RENDERED, () => {
      const image = canvas.toDataURL('image/png')
      // downloadURI(image, 'imageURI_256_256_50_10_1_1_0')
      compareImages(
        image,
        imageURI_256_256_50_10_1_1_0,
        'imageURI_256_256_50_10_1_1_0'
      ).then(done, done.fail)
    })
    try {
      vp.setStack([imageId1, imageId2], 1)
      this.renderingEngine.render()
    } catch (e) {
      done.fail(e)
    }
  })
})

describe('Color Stack Images', () => {
  beforeEach(function () {
    cache.purgeCache()

    this.renderingEngine = new RenderingEngine(renderingEngineUID)
    registerImageLoader('fakeImageLoader', fakeImageLoader)
    metaData.addProvider(fakeMetaDataProvider, 10000)
  })

  afterEach(function () {
    cache.purgeCache()
    this.renderingEngine.destroy()
    metaData.removeProvider(fakeMetaDataProvider)
    unregisterAllImageLoaders()
    DOMElements.forEach((el) => {
      if (el.parentNode) {
        el.parentNode.removeChild(el)
      }
    })
  })

  it('Should render color images: linear', function (done) {
    const canvas = createCanvas(this.renderingEngine, AXIAL, 512, 512)

    // color image generation with 10 strips of different colors
    const imageId1 = 'fakeImageLoader:imageURI_100_100_0_10_1_1_1'
    const vp = this.renderingEngine.getViewport(viewportUID)
    canvas.addEventListener(EVENTS.IMAGE_RENDERED, () => {
      const image = canvas.toDataURL('image/png')
      // downloadURI(image, 'imageURI_100_100_0_10_1_1_1_linear_color')
      compareImages(
        image,
        imageURI_100_100_0_10_1_1_1_linear_color,
        'imageURI_100_100_0_10_1_1_1_linear_color'
      ).then(done, done.fail)
    })

    try {
      vp.setStack([imageId1], 0)
      this.renderingEngine.render()
    } catch (e) {
      done.fail(e)
    }
  })

  it('Should render color images: nearest', function (done) {
    const canvas = createCanvas(this.renderingEngine, AXIAL, 512, 512)

    // color image generation with 10 strips of different colors
    const imageId1 = 'fakeImageLoader:imageURI_100_100_0_10_1_1_1'
    const vp = this.renderingEngine.getViewport(viewportUID)
    canvas.addEventListener(EVENTS.IMAGE_RENDERED, () => {
      const image = canvas.toDataURL('image/png')
      // downloadURI(image, 'imageURI_100_100_0_10_1_1_1_nearest_color')
      compareImages(
        image,
        imageURI_100_100_0_10_1_1_1_nearest_color,
        'imageURI_100_100_0_10_1_1_1_nearest_color'
      ).then(done, done.fail)
    })

    try {
      vp.setStack([imageId1], 0)
      vp.setProperties({ interpolationType: INTERPOLATION_TYPE.NEAREST })
      this.renderingEngine.render()
    } catch (e) {
      done.fail(e)
    }
  })
})

describe('Stack Viewport Calibration and Scaling --- ', () => {
  beforeEach(function () {
    cache.purgeCache()

    this.renderingEngine = new RenderingEngine(renderingEngineUID)
    registerImageLoader('fakeImageLoader', fakeImageLoader)
    metaData.addProvider(fakeMetaDataProvider, 10000)
    metaData.addProvider(
      calibratedPixelSpacingMetadataProvider.get.bind(
        calibratedPixelSpacingMetadataProvider
      ),
      11000
    )
  })

  afterEach(function () {
    cache.purgeCache()
    this.renderingEngine.destroy()
    metaData.removeProvider(fakeMetaDataProvider)
    unregisterAllImageLoaders()
    DOMElements.forEach((el) => {
      if (el.parentNode) {
        el.parentNode.removeChild(el)
      }
    })
  })

  it('Should be able to render a stack viewport with PET modality scaling', function (done) {
    const canvas = createCanvas(this.renderingEngine, AXIAL, 256, 256)

    const imageId1 = 'fakeImageLoader:imageURI_11_11_4_1_1_1_0_1'

    const vp = this.renderingEngine.getViewport(viewportUID)
    canvas.addEventListener(EVENTS.IMAGE_RENDERED, () => {
      expect(vp.scaling.PET).toEqual({
        suvbwToSuvlbm: 1,
        suvbwToSuvbsa: 1,
      })
      done()
    })
    try {
      vp.setStack([imageId1], 0)
      this.renderingEngine.render()
    } catch (e) {
      done.fail(e)
    }
  })

  it('Should be able to calibrate the pixel spacing', function (done) {
    const canvas = createCanvas(this.renderingEngine, AXIAL, 256, 256)

    const imageId1 = 'fakeImageLoader:imageURI_11_11_4_1_1_1_0'

    const vp = this.renderingEngine.getViewport(viewportUID)
    canvas.addEventListener(EVENTS.IMAGE_RENDERED, (evt) => {
      calibratedPixelSpacingMetadataProvider.add(imageId1, [2, 2])

      // Use the second image for calibration. It will decoded into 2x2 pixel spacing
      vp.calibrateSpacing(imageId1)
    })

    canvas.addEventListener(EVENTS.IMAGE_SPACING_CALIBRATED, (evt) => {
      const { rowScale, columnScale } = evt.detail
      expect(rowScale).toBe(2)
      expect(columnScale).toBe(2)
      done()
    })
    try {
      vp.setStack([imageId1], 0)
      this.renderingEngine.render()
    } catch (e) {
      done.fail(e)
    }
  })

  it('Should be able to use setPropertise API', function (done) {
    const canvas = createCanvas(this.renderingEngine, AXIAL, 256, 256)

    const imageId1 = 'fakeImageLoader:imageURI_11_11_4_1_1_1_0'

    const vp = this.renderingEngine.getViewport(viewportUID)
    canvas.addEventListener(EVENTS.IMAGE_RENDERED, (evt) => {
      const image = canvas.toDataURL('image/png')

      let props = vp.getProperties()
      expect(props.rotation).toBe(90)
      expect(props.interpolationType).toBe(INTERPOLATION_TYPE.NEAREST)
      expect(props.invert).toBe(true)

      compareImages(
        image,
        imageURI_11_11_4_1_1_1_0_nearest_invert_90deg,
        'imageURI_11_11_4_1_1_1_0_nearest_invert_90deg'
      ).then(done, done.fail)

      vp.resetProperties()
      props = vp.getProperties()
      expect(props.rotation).toBe(0)
      expect(props.interpolationType).toBe(INTERPOLATION_TYPE.LINEAR)
      expect(props.invert).toBe(false)
    })
    try {
      vp.setStack([imageId1], 0)
      vp.setProperties({
        interpolationType: INTERPOLATION_TYPE.NEAREST,
        invert: true,
        rotation: 90,
      })

      this.renderingEngine.render()
    } catch (e) {
      done.fail(e)
    }
  })
})
