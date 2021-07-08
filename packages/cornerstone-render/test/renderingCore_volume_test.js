import * as cornerstone3D from '../src/index'
// import { User } from ... doesn't work right now since we don't have named exports set up

// nearest neighbor interpolation
import * as volumeURI_100_100_10_1_1_1_0_axial_nearest from './groundTruth/volumeURI_100_100_10_1_1_1_0_axial_nearest.png'
import * as volumeURI_100_100_10_1_1_1_0_sagittal_nearest from './groundTruth/volumeURI_100_100_10_1_1_1_0_sagittal_nearest.png'
import * as volumeURI_100_100_10_1_1_1_0_coronal_nearest from './groundTruth/volumeURI_100_100_10_1_1_1_0_coronal_nearest.png'
import * as volumeURI_100_100_10_1_1_1_1_color_coronal_nearest from './groundTruth/volumeURI_100_100_10_1_1_1_1_color_coronal_nearest.png'

// linear interpolation
import * as volumeURI_100_100_10_1_1_1_0_axial_linear from './groundTruth/volumeURI_100_100_10_1_1_1_0_axial_linear.png'
import * as volumeURI_100_100_10_1_1_1_0_sagittal_linear from './groundTruth/volumeURI_100_100_10_1_1_1_0_sagittal_linear.png'
import * as volumeURI_100_100_10_1_1_1_0_coronal_linear from './groundTruth/volumeURI_100_100_10_1_1_1_0_coronal_linear.png'
import * as volumeURI_100_100_10_1_1_1_1_color_coronal_linear from './groundTruth/volumeURI_100_100_10_1_1_1_1_color_coronal_linear.png'

const {
  cache,
  RenderingEngine,
  VIEWPORT_TYPE,
  ORIENTATION,
  unregisterAllImageLoaders,
  metaData,
  EVENTS,
  registerVolumeLoader,
  createAndCacheVolume,
} = cornerstone3D

import { fakeMetaDataProvider, compareImages, volumeLoader } from './testUtils'

const renderingEngineUID = 'RENDERING_ENGINE_UID'

const scene1UID = 'SCENE_1'
const viewportUID = 'VIEWPORT'

const AXIAL = 'AXIAL'
const SAGITTAL = 'SAGITTAL'
const CORONAL = 'CORONAL'

const DOMElements = []

function createCanvas(renderingEngine, orientation) {
  const canvasAxial = document.createElement('canvas')

  canvasAxial.style.width = '1000px'
  canvasAxial.style.height = '1000px'
  document.body.appendChild(canvasAxial)
  DOMElements.push(canvasAxial)

  renderingEngine.setViewports([
    {
      sceneUID: scene1UID,
      viewportUID: viewportUID,
      type: VIEWPORT_TYPE.ORTHOGRAPHIC,
      canvas: canvasAxial,
      defaultOptions: {
        orientation: ORIENTATION[orientation],
        background: [1, 0, 1], // pinkish background
      },
    },
  ])
  return canvasAxial
}

describe('Volume Viewport Axial Nearest Neighbor and Linear Interpolation --- ', function () {
  beforeEach(function () {
    cache.purgeCache()

    this.renderingEngine = new RenderingEngine(renderingEngineUID)

    metaData.addProvider(fakeMetaDataProvider, 10000)
    registerVolumeLoader('fakeVolumeLoader', volumeLoader)
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

  it('should successfully load a volume: nearest', function (done) {
    const canvas = createCanvas(this.renderingEngine, AXIAL)
    // fake volume generator follows the pattern of
    // volumeScheme:volumeURI_xSize_ySize_zSize_barStart_barWidth_xSpacing_ySpacing_zSpacing_rgbFlag
    const volumeId = 'fakeVolumeLoader:volumeURI_100_100_10_1_1_1_0'

    canvas.addEventListener(EVENTS.IMAGE_RENDERED, () => {
      const image = canvas.toDataURL('image/png')
      compareImages(
        image,
        volumeURI_100_100_10_1_1_1_0_axial_nearest,
        'volumeURI_100_100_10_1_1_1_0_axial_nearest'
      ).then(done, done.fail)
    })

    const callback = ({ volumeActor }) =>
      volumeActor.getProperty().setInterpolationTypeToNearest()

    try {
      createAndCacheVolume(volumeId, { imageIds: [] })
        .then(() => {
          const ctScene = this.renderingEngine.getScene(scene1UID)
          ctScene.setVolumes([{ volumeUID: volumeId, callback }])
          ctScene.render()
        })
        .catch((e) => done(e))
    } catch (e) {
      done.fail(e)
    }
  })

  it('should successfully load a volume: linear', function (done) {
    const canvas = createCanvas(this.renderingEngine, AXIAL)

    const volumeId = 'fakeVolumeLoader:volumeURI_100_100_10_1_1_1_0'

    canvas.addEventListener(EVENTS.IMAGE_RENDERED, () => {
      const image = canvas.toDataURL('image/png')
      compareImages(
        image,
        volumeURI_100_100_10_1_1_1_0_axial_linear,
        'volumeURI_100_100_10_1_1_1_0_axial_linear'
      ).then(done, done.fail)
    })

    try {
      createAndCacheVolume(volumeId, { imageIds: [] }).then(() => {
        const ctScene = this.renderingEngine.getScene(scene1UID)
        ctScene.setVolumes([{ volumeUID: volumeId }])
        ctScene.render()
      })
    } catch (e) {
      done.fail(e)
    }
  })
})

describe('Volume Viewport Sagittal Nearest Neighbor and Linear Interpolation --- ', function () {
  beforeEach(function () {
    cache.purgeCache()

    this.renderingEngine = new RenderingEngine(renderingEngineUID)

    metaData.addProvider(fakeMetaDataProvider, 10000)
    registerVolumeLoader('fakeVolumeLoader', volumeLoader)
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

  it('should successfully load a volume: nearest', function (done) {
    const canvas = createCanvas(this.renderingEngine, SAGITTAL)

    // fake volume generator follows the pattern of
    // volumeScheme:volumeURI_xSize_ySize_zSize_barStart_barWidth_xSpacing_ySpacing_zSpacing_rgbFlag
    const volumeId = 'fakeVolumeLoader:volumeURI_100_100_10_1_1_1_0'

    canvas.addEventListener(EVENTS.IMAGE_RENDERED, () => {
      const image = canvas.toDataURL('image/png')
      compareImages(
        image,
        volumeURI_100_100_10_1_1_1_0_sagittal_nearest,
        'volumeURI_100_100_10_1_1_1_0_sagittal_nearest'
      ).then(done, done.fail)
    })

    const callback = ({ volumeActor }) =>
      volumeActor.getProperty().setInterpolationTypeToNearest()

    try {
      createAndCacheVolume(volumeId, { imageIds: [] })
        .then(() => {
          const ctScene = this.renderingEngine.getScene(scene1UID)
          ctScene.setVolumes([{ volumeUID: volumeId, callback }])
          ctScene.render()
        })
        .catch((e) => done(e))
    } catch (e) {
      done.fail(e)
    }
  })

  it('should successfully load a volume: linear', function (done) {
    const canvas = createCanvas(this.renderingEngine, SAGITTAL)

    const volumeId = 'fakeVolumeLoader:volumeURI_100_100_10_1_1_1_0'

    canvas.addEventListener(EVENTS.IMAGE_RENDERED, () => {
      const image = canvas.toDataURL('image/png')
      compareImages(
        image,
        volumeURI_100_100_10_1_1_1_0_sagittal_linear,
        'volumeURI_100_100_10_1_1_1_0_sagittal_linear'
      ).then(done, done.fail)
    })

    try {
      createAndCacheVolume(volumeId, { imageIds: [] })
        .then(() => {
          const ctScene = this.renderingEngine.getScene(scene1UID)
          ctScene.setVolumes([{ volumeUID: volumeId }])
          ctScene.render()
        })
        .catch((e) => done(e))
    } catch (e) {
      done.fail(e)
    }
  })
})

describe('Volume Viewport Sagittal Coronal Neighbor and Linear Interpolation --- ', function () {
  beforeEach(function () {
    cache.purgeCache()

    this.renderingEngine = new RenderingEngine(renderingEngineUID)

    metaData.addProvider(fakeMetaDataProvider, 10000)
    registerVolumeLoader('fakeVolumeLoader', volumeLoader)
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

  it('should successfully load a volume: nearest', function (done) {
    const canvas = createCanvas(this.renderingEngine, CORONAL)

    // fake volume generator follows the pattern of
    // volumeScheme:volumeURI_xSize_ySize_zSize_barStart_barWidth_xSpacing_ySpacing_zSpacing_rgbFlag
    const volumeId = 'fakeVolumeLoader:volumeURI_100_100_10_1_1_1_0'

    canvas.addEventListener(EVENTS.IMAGE_RENDERED, () => {
      const image = canvas.toDataURL('image/png')
      compareImages(
        image,
        volumeURI_100_100_10_1_1_1_0_coronal_nearest,
        'volumeURI_100_100_10_1_1_1_0_coronal_nearest'
      ).then(done, done.fail)
    })

    const callback = ({ volumeActor }) =>
      volumeActor.getProperty().setInterpolationTypeToNearest()

    try {
      // we don't set imageIds as we are mocking the imageVolume to
      // return the volume immediately
      createAndCacheVolume(volumeId, { imageIds: [] })
        .then(() => {
          const ctScene = this.renderingEngine.getScene(scene1UID)
          ctScene.setVolumes([{ volumeUID: volumeId, callback }])
          ctScene.render()
        })
        .catch((e) => done(e))
    } catch (e) {
      done.fail(e)
    }
  })

  it('should successfully load a volume: linear', function (done) {
    const canvas = createCanvas(this.renderingEngine, CORONAL)

    const volumeId = 'fakeVolumeLoader:volumeURI_100_100_10_1_1_1_0'

    canvas.addEventListener(EVENTS.IMAGE_RENDERED, () => {
      const image = canvas.toDataURL('image/png')
      compareImages(
        image,
        volumeURI_100_100_10_1_1_1_0_coronal_linear,
        'volumeURI_100_100_10_1_1_1_0_coronal_linear'
      ).then(done, done.fail)
    })

    try {
      createAndCacheVolume(volumeId, { imageIds: [] })
        .then(() => {
          const ctScene = this.renderingEngine.getScene(scene1UID)
          ctScene.setVolumes([{ volumeUID: volumeId }])
          ctScene.render()
        })
        .catch((e) => done(e))
    } catch (e) {
      done.fail(e)
    }
  })
})

describe('Volume Viewport Color images Neighbor and Linear Interpolation --- ', function () {
  beforeEach(function () {
    cache.purgeCache()

    this.renderingEngine = new RenderingEngine(renderingEngineUID)

    metaData.addProvider(fakeMetaDataProvider, 10000)
    registerVolumeLoader('fakeVolumeLoader', volumeLoader)
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

  it('should successfully load a color volume: nearest', function (done) {
    const canvas = createCanvas(this.renderingEngine, CORONAL)

    // fake volume generator follows the pattern of
    // volumeScheme:volumeURI_xSize_ySize_zSize_barStart_barWidth_xSpacing_ySpacing_zSpacing_rgbFlag
    const volumeId = 'fakeVolumeLoader:volumeURI_100_100_10_1_1_1_1'

    canvas.addEventListener(EVENTS.IMAGE_RENDERED, () => {
      const image = canvas.toDataURL('image/png')
      compareImages(
        image,
        volumeURI_100_100_10_1_1_1_1_color_coronal_nearest,
        'volumeURI_100_100_10_1_1_1_1_color_coronal_nearest'
      ).then(done, done.fail)
    })

    const callback = ({ volumeActor }) => {
      volumeActor.getProperty().setIndependentComponents(false)
      volumeActor.getProperty().setInterpolationTypeToNearest()
    }

    try {
      // we don't set imageIds as we are mocking the imageVolume to
      // return the volume immediately
      createAndCacheVolume(volumeId, { imageIds: [] })
        .then(() => {
          const ctScene = this.renderingEngine.getScene(scene1UID)
          ctScene.setVolumes([{ volumeUID: volumeId, callback }])
          ctScene.render()
        })
        .catch((e) => done(e))
    } catch (e) {
      done.fail(e)
    }
  })

  it('should successfully load a volume: linear', function (done) {
    const canvas = createCanvas(this.renderingEngine, CORONAL)

    const volumeId = 'fakeVolumeLoader:volumeURI_100_100_10_1_1_1_1'

    canvas.addEventListener(EVENTS.IMAGE_RENDERED, () => {
      const image = canvas.toDataURL('image/png')
      compareImages(
        image,
        volumeURI_100_100_10_1_1_1_1_color_coronal_linear,
        'volumeURI_100_100_10_1_1_1_1_color_coronal_linear'
      ).then(done, done.fail)
    })

    const callback = ({ volumeActor }) => {
      volumeActor.getProperty().setIndependentComponents(false)
      volumeActor.getProperty().setInterpolationTypeToLinear()
    }

    try {
      createAndCacheVolume(volumeId, { imageIds: [] })
        .then(() => {
          const ctScene = this.renderingEngine.getScene(scene1UID)
          ctScene.setVolumes([{ volumeUID: volumeId, callback }])
          ctScene.render()
        })
        .catch((e) => done(e))
    } catch (e) {
      done.fail(e)
    }
  })
})
