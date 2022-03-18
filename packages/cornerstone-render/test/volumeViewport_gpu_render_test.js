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
  imageLoader,
  metaData,
  EVENTS,
  volumeLoader,
  Utilities,
  setVolumesOnViewports,
  getVolumeViewportsContainingVolumeUID,
} = cornerstone3D

const { registerVolumeLoader } = volumeLoader
const { unregisterAllImageLoaders } = imageLoader

const { fakeMetaDataProvider, compareImages, fakeVolumeLoader } =
  Utilities.testUtils

const renderingEngineUID = Utilities.uuidv4()

const viewportUID = 'VIEWPORT'

const AXIAL = 'AXIAL'
const SAGITTAL = 'SAGITTAL'
const CORONAL = 'CORONAL'

function createViewport(renderingEngine, orientation) {
  const element = document.createElement('div')

  element.style.width = '1000px'
  element.style.height = '1000px'
  document.body.appendChild(element)

  renderingEngine.setViewports([
    {
      viewportUID: viewportUID,
      type: VIEWPORT_TYPE.ORTHOGRAPHIC,
      element,
      defaultOptions: {
        orientation: ORIENTATION[orientation],
        background: [1, 0, 1], // pinkish background
      },
    },
  ])
  return element
}

describe('Volume Viewport GPU -- ', () => {
  beforeAll(() => {
    cornerstone3D.setUseCPURenderingOnlyForDebugOrTests(false)
  })

  describe('Volume Viewport Axial Nearest Neighbor and Linear Interpolation --- ', function () {
    beforeEach(function () {
      cache.purgeCache()
      this.DOMElements = []

      this.renderingEngine = new RenderingEngine(renderingEngineUID)

      metaData.addProvider(fakeMetaDataProvider, 10000)
      registerVolumeLoader('fakeVolumeLoader', fakeVolumeLoader)
    })

    afterEach(function () {
      cache.purgeCache()
      this.renderingEngine.destroy()
      metaData.removeProvider(fakeMetaDataProvider)
      unregisterAllImageLoaders()
      this.DOMElements.forEach((el) => {
        if (el.parentNode) {
          el.parentNode.removeChild(el)
        }
      })
    })

    it('should successfully load a volume: nearest', function (done) {
      const element = createViewport(this.renderingEngine, AXIAL)
      this.DOMElements.push(element)

      // fake volume generator follows the pattern of
      // volumeScheme:volumeURI_xSize_ySize_zSize_barStart_barWidth_xSpacing_ySpacing_zSpacing_rgbFlag
      const volumeId = 'fakeVolumeLoader:volumeURI_100_100_10_1_1_1_0'
      const vp = this.renderingEngine.getViewport(viewportUID)

      element.addEventListener(EVENTS.IMAGE_RENDERED, () => {
        const canvas = vp.getCanvas()
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
        volumeLoader
          .createAndCacheVolume(volumeId, { imageIds: [] })
          .then(() => {
            setVolumesOnViewports(
              this.renderingEngine,
              [{ volumeUID: volumeId, callback }],
              [viewportUID]
            )
            vp.render()
          })
          .catch((e) => done(e))
      } catch (e) {
        done.fail(e)
      }
    })

    it('should successfully load a volume: linear', function (done) {
      const element = createViewport(this.renderingEngine, AXIAL)
      this.DOMElements.push(element)

      const volumeId = 'fakeVolumeLoader:volumeURI_100_100_10_1_1_1_0'
      const vp = this.renderingEngine.getViewport(viewportUID)

      element.addEventListener(EVENTS.IMAGE_RENDERED, () => {
        const canvas = vp.getCanvas()
        const image = canvas.toDataURL('image/png')
        compareImages(
          image,
          volumeURI_100_100_10_1_1_1_0_axial_linear,
          'volumeURI_100_100_10_1_1_1_0_axial_linear'
        ).then(done, done.fail)
      })

      try {
        volumeLoader
          .createAndCacheVolume(volumeId, { imageIds: [] })
          .then(() => {
            setVolumesOnViewports(
              this.renderingEngine,
              [{ volumeUID: volumeId }],
              [viewportUID]
            )
            vp.render()
          })
      } catch (e) {
        done.fail(e)
      }
    })
  })

  describe('Volume Viewport Sagittal Nearest Neighbor and Linear Interpolation --- ', function () {
    beforeEach(function () {
      cache.purgeCache()

      this.DOMElements = []
      this.renderingEngine = new RenderingEngine(renderingEngineUID)

      metaData.addProvider(fakeMetaDataProvider, 10000)
      registerVolumeLoader('fakeVolumeLoader', fakeVolumeLoader)
    })

    afterEach(function () {
      cache.purgeCache()
      this.renderingEngine.destroy()

      metaData.removeProvider(fakeMetaDataProvider)
      unregisterAllImageLoaders()
      this.DOMElements.forEach((el) => {
        if (el.parentNode) {
          el.parentNode.removeChild(el)
        }
      })
    })

    it('should successfully load a volume: nearest', function (done) {
      const element = createViewport(this.renderingEngine, SAGITTAL)
      this.DOMElements.push(element)

      // fake volume generator follows the pattern of
      // volumeScheme:volumeURI_xSize_ySize_zSize_barStart_barWidth_xSpacing_ySpacing_zSpacing_rgbFlag
      const volumeId = 'fakeVolumeLoader:volumeURI_100_100_10_1_1_1_0'
      const vp = this.renderingEngine.getViewport(viewportUID)

      element.addEventListener(EVENTS.IMAGE_RENDERED, () => {
        const canvas = vp.getCanvas()
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
        volumeLoader
          .createAndCacheVolume(volumeId, { imageIds: [] })
          .then(() => {
            setVolumesOnViewports(
              this.renderingEngine,
              [{ volumeUID: volumeId, callback }],
              [viewportUID]
            )
            vp.render()
          })
          .catch((e) => done(e))
      } catch (e) {
        done.fail(e)
      }
    })

    it('should successfully load a volume: linear', function (done) {
      const element = createViewport(this.renderingEngine, SAGITTAL)
      this.DOMElements.push(element)

      const volumeId = 'fakeVolumeLoader:volumeURI_100_100_10_1_1_1_0'
      const vp = this.renderingEngine.getViewport(viewportUID)

      element.addEventListener(EVENTS.IMAGE_RENDERED, () => {
        const canvas = vp.getCanvas()
        const image = canvas.toDataURL('image/png')
        compareImages(
          image,
          volumeURI_100_100_10_1_1_1_0_sagittal_linear,
          'volumeURI_100_100_10_1_1_1_0_sagittal_linear'
        ).then(done, done.fail)
      })

      try {
        volumeLoader
          .createAndCacheVolume(volumeId, { imageIds: [] })
          .then(() => {
            setVolumesOnViewports(
              this.renderingEngine,
              [{ volumeUID: volumeId }],
              [viewportUID]
            )
            vp.render()
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

      this.DOMElements = []

      this.renderingEngine = new RenderingEngine(renderingEngineUID)

      metaData.addProvider(fakeMetaDataProvider, 10000)
      registerVolumeLoader('fakeVolumeLoader', fakeVolumeLoader)
    })

    afterEach(function () {
      cache.purgeCache()
      this.renderingEngine.destroy()

      metaData.removeProvider(fakeMetaDataProvider)
      unregisterAllImageLoaders()
      this.DOMElements.forEach((el) => {
        if (el.parentNode) {
          el.parentNode.removeChild(el)
        }
      })
    })

    it('should successfully load a volume: nearest', function (done) {
      const element = createViewport(this.renderingEngine, CORONAL)
      this.DOMElements.push(element)

      // fake volume generator follows the pattern of
      // volumeScheme:volumeURI_xSize_ySize_zSize_barStart_barWidth_xSpacing_ySpacing_zSpacing_rgbFlag
      const volumeId = 'fakeVolumeLoader:volumeURI_100_100_10_1_1_1_0'

      const vp = this.renderingEngine.getViewport(viewportUID)

      element.addEventListener(EVENTS.IMAGE_RENDERED, () => {
        const canvas = vp.getCanvas()
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
        volumeLoader
          .createAndCacheVolume(volumeId, { imageIds: [] })
          .then(() => {
            setVolumesOnViewports(
              this.renderingEngine,
              [{ volumeUID: volumeId, callback }],
              [viewportUID]
            )
            vp.render()
          })
          .catch((e) => done(e))
      } catch (e) {
        done.fail(e)
      }
    })

    it('should successfully load a volume: linear', function (done) {
      const element = createViewport(this.renderingEngine, CORONAL)
      this.DOMElements.push(element)

      const volumeId = 'fakeVolumeLoader:volumeURI_100_100_10_1_1_1_0'
      const vp = this.renderingEngine.getViewport(viewportUID)

      element.addEventListener(EVENTS.IMAGE_RENDERED, () => {
        const canvas = vp.getCanvas()
        const image = canvas.toDataURL('image/png')
        compareImages(
          image,
          volumeURI_100_100_10_1_1_1_0_coronal_linear,
          'volumeURI_100_100_10_1_1_1_0_coronal_linear'
        ).then(done, done.fail)
      })

      try {
        volumeLoader
          .createAndCacheVolume(volumeId, { imageIds: [] })
          .then(() => {
            setVolumesOnViewports(
              this.renderingEngine,
              [{ volumeUID: volumeId }],
              [viewportUID]
            )
            vp.render()
          })
          .catch((e) => done(e))
      } catch (e) {
        done.fail(e)
      }
    })
  })

  describe('Rendering API', function () {
    beforeEach(function () {
      cache.purgeCache()

      this.DOMElements = []
      this.renderingEngine = new RenderingEngine(renderingEngineUID)

      metaData.addProvider(fakeMetaDataProvider, 10000)
      registerVolumeLoader('fakeVolumeLoader', fakeVolumeLoader)
    })

    afterEach(function () {
      cache.purgeCache()
      this.renderingEngine.destroy()
      metaData.removeProvider(fakeMetaDataProvider)
      unregisterAllImageLoaders()
      this.DOMElements.forEach((el) => {
        if (el.parentNode) {
          el.parentNode.removeChild(el)
        }
      })
    })

    it('should successfully use setVolumesOnViewports API to load image', function (done) {
      const element = createViewport(this.renderingEngine, CORONAL)
      this.DOMElements.push(element)

      // fake volume generator follows the pattern of
      // volumeScheme:volumeURI_xSize_ySize_zSize_barStart_barWidth_xSpacing_ySpacing_zSpacing_rgbFlag
      const volumeId = 'fakeVolumeLoader:volumeURI_100_100_10_1_1_1_0'
      const vp = this.renderingEngine.getViewport(viewportUID)

      element.addEventListener(EVENTS.IMAGE_RENDERED, () => {
        const canvas = vp.getCanvas()
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
        volumeLoader
          .createAndCacheVolume(volumeId, { imageIds: [] })
          .then(() => {
            setVolumesOnViewports(
              this.renderingEngine,
              [{ volumeUID: volumeId, callback }],
              [viewportUID]
            )
            vp.render()
          })
          .catch((e) => done(e))
      } catch (e) {
        done.fail(e)
      }
    })

    it('Should be able to filter viewports based on volumeUID', function (done) {
      const element = createViewport(this.renderingEngine, CORONAL)
      this.DOMElements.push(element)

      // fake volume generator follows the pattern of
      // volumeScheme:volumeURI_xSize_ySize_zSize_barStart_barWidth_xSpacing_ySpacing_zSpacing_rgbFlag
      const volumeId = 'fakeVolumeLoader:volumeURI_100_100_10_1_1_1_0'

      element.addEventListener(EVENTS.IMAGE_RENDERED, () => {
        const viewport = this.renderingEngine.getViewport(viewportUID)
        const viewports = getVolumeViewportsContainingVolumeUID(
          volumeId,
          this.renderingEngine.uid
        )

        expect(viewports.length).toBe(1)
        expect(viewports[0]).toBe(viewport)

        done()
      })

      const callback = ({ volumeActor }) =>
        volumeActor.getProperty().setInterpolationTypeToNearest()

      try {
        // we don't set imageIds as we are mocking the imageVolume to
        // return the volume immediately
        volumeLoader
          .createAndCacheVolume(volumeId, { imageIds: [] })
          .then(() => {
            setVolumesOnViewports(
              this.renderingEngine,
              [{ volumeUID: volumeId, callback }],
              [viewportUID]
            )
            this.renderingEngine.render()
          })
          .catch((e) => done(e))
      } catch (e) {
        done.fail(e)
      }
    })

    it('should successfully use renderViewports API to load image', function (done) {
      const element = createViewport(this.renderingEngine, CORONAL)
      this.DOMElements.push(element)

      const vp = this.renderingEngine.getViewport(viewportUID)
      const canvas = vp.getCanvas()

      // fake volume generator follows the pattern of
      // volumeScheme:volumeURI_xSize_ySize_zSize_barStart_barWidth_xSpacing_ySpacing_zSpacing_rgbFlag
      const volumeId = 'fakeVolumeLoader:volumeURI_100_100_10_1_1_1_0'

      element.addEventListener(EVENTS.IMAGE_RENDERED, () => {
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
        volumeLoader
          .createAndCacheVolume(volumeId, { imageIds: [] })
          .then(() => {
            setVolumesOnViewports(
              this.renderingEngine,
              [{ volumeUID: volumeId, callback }],
              [viewportUID]
            )
            vp.render()
          })
          .catch((e) => done(e))
      } catch (e) {
        done.fail(e)
      }
    })

    it('should successfully use renderViewport API to load image', function (done) {
      const element = createViewport(this.renderingEngine, CORONAL)
      this.DOMElements.push(element)

      // fake volume generator follows the pattern of
      // volumeScheme:volumeURI_xSize_ySize_zSize_barStart_barWidth_xSpacing_ySpacing_zSpacing_rgbFlag
      const volumeId = 'fakeVolumeLoader:volumeURI_100_100_10_1_1_1_0'
      const vp = this.renderingEngine.getViewport(viewportUID)

      element.addEventListener(EVENTS.IMAGE_RENDERED, () => {
        const canvas = vp.getCanvas()
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
        volumeLoader
          .createAndCacheVolume(volumeId, { imageIds: [] })
          .then(() => {
            setVolumesOnViewports(
              this.renderingEngine,
              [{ volumeUID: volumeId, callback }],
              [viewportUID]
            )
            vp.render()
          })
          .catch((e) => done(e))
      } catch (e) {
        done.fail(e)
      }
    })

    it('should successfully debug the offscreen canvas', function (done) {
      const element = createViewport(this.renderingEngine, CORONAL)
      this.DOMElements.push(element)

      // fake volume generator follows the pattern of
      // volumeScheme:volumeURI_xSize_ySize_zSize_barStart_barWidth_xSpacing_ySpacing_zSpacing_rgbFlag
      const volumeId = 'fakeVolumeLoader:volumeURI_100_100_10_1_1_1_0'
      const vp = this.renderingEngine.getViewport(viewportUID)

      element.addEventListener(EVENTS.IMAGE_RENDERED, () => {
        const canvas = vp.getCanvas()
        const image = canvas.toDataURL('image/png')
        const offScreen = this.renderingEngine._debugRender()
        expect(offScreen).toEqual(image)
        done()
      })

      const callback = ({ volumeActor }) =>
        volumeActor.getProperty().setInterpolationTypeToNearest()

      try {
        // we don't set imageIds as we are mocking the imageVolume to
        // return the volume immediately
        volumeLoader
          .createAndCacheVolume(volumeId, { imageIds: [] })
          .then(() => {
            setVolumesOnViewports(
              this.renderingEngine,
              [{ volumeUID: volumeId, callback }],
              [viewportUID]
            )
            vp.render()
          })
          .catch((e) => done(e))
      } catch (e) {
        done.fail(e)
      }
    })

    it('should successfully render frameOfReference', function (done) {
      const element = createViewport(this.renderingEngine, CORONAL)
      this.DOMElements.push(element)

      // fake volume generator follows the pattern of
      // volumeScheme:volumeURI_xSize_ySize_zSize_barStart_barWidth_xSpacing_ySpacing_zSpacing_rgbFlag
      const volumeId = 'fakeVolumeLoader:volumeURI_100_100_10_1_1_1_0'
      const vp = this.renderingEngine.getViewport(viewportUID)

      element.addEventListener(EVENTS.IMAGE_RENDERED, () => {
        const canvas = vp.getCanvas()
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
        volumeLoader
          .createAndCacheVolume(volumeId, { imageIds: [] })
          .then(() => {
            setVolumesOnViewports(
              this.renderingEngine,
              [{ volumeUID: volumeId, callback }],
              [viewportUID]
            ).then(() => {
              this.renderingEngine.renderFrameOfReference(
                'Volume_Frame_Of_Reference'
              )
            })
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

      this.DOMElements = []
      this.renderingEngine = new RenderingEngine(renderingEngineUID)

      metaData.addProvider(fakeMetaDataProvider, 10000)
      registerVolumeLoader('fakeVolumeLoader', fakeVolumeLoader)
    })

    afterEach(function () {
      cache.purgeCache()
      this.renderingEngine.destroy()

      metaData.removeProvider(fakeMetaDataProvider)
      unregisterAllImageLoaders()
      this.DOMElements.forEach((el) => {
        if (el.parentNode) {
          el.parentNode.removeChild(el)
        }
      })
    })

    it('should successfully load a color volume: nearest', function (done) {
      const element = createViewport(this.renderingEngine, CORONAL)
      this.DOMElements.push(element)

      // fake volume generator follows the pattern of
      // volumeScheme:volumeURI_xSize_ySize_zSize_barStart_barWidth_xSpacing_ySpacing_zSpacing_rgbFlag
      const volumeId = 'fakeVolumeLoader:volumeURI_100_100_10_1_1_1_1'
      const vp = this.renderingEngine.getViewport(viewportUID)

      element.addEventListener(EVENTS.IMAGE_RENDERED, () => {
        const canvas = vp.getCanvas()
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
        volumeLoader
          .createAndCacheVolume(volumeId, { imageIds: [] })
          .then(() => {
            setVolumesOnViewports(
              this.renderingEngine,
              [{ volumeUID: volumeId, callback }],
              [viewportUID]
            )
            vp.render()
          })
          .catch((e) => done(e))
      } catch (e) {
        done.fail(e)
      }
    })

    it('should successfully load a volume: linear', function (done) {
      const element = createViewport(this.renderingEngine, CORONAL)
      this.DOMElements.push(element)

      const volumeId = 'fakeVolumeLoader:volumeURI_100_100_10_1_1_1_1'
      const vp = this.renderingEngine.getViewport(viewportUID)

      element.addEventListener(EVENTS.IMAGE_RENDERED, () => {
        const canvas = vp.getCanvas()
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
        volumeLoader
          .createAndCacheVolume(volumeId, { imageIds: [] })
          .then(() => {
            setVolumesOnViewports(
              this.renderingEngine,
              [{ volumeUID: volumeId, callback }],
              [viewportUID]
            )
            vp.render()
          })
          .catch((e) => done(e))
      } catch (e) {
        done.fail(e)
      }
    })
  })
})
