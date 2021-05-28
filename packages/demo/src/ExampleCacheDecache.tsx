import React, { Component } from 'react'
import {
  cache,
  RenderingEngine,
  createAndCacheVolume,
  loadAndCacheImages,
  ORIENTATION,
  VIEWPORT_TYPE,
  setMaxSimultaneousRequests,
} from '@ohif/cornerstone-render'
import { ToolGroupManager, resetToolsState } from '@ohif/cornerstone-tools'

import getImageIds from './helpers/getImageIds'
import ViewportGrid from './components/ViewportGrid'
import { initToolGroups, destroyToolGroups } from './initToolGroups'
import './ExampleVTKMPR.css'
import {
  renderingEngineUID,
  ctVolumeUID,
  ctStackUID,
  SCENE_IDS,
  VIEWPORT_IDS,
} from './constants'
import sortImageIdsByIPP from './helpers/sortImageIdsByIPP'
import * as cs from '@ohif/cornerstone-render'

import { registerWebImageLoader } from '@ohif/cornerstone-image-loader-streaming-volume'

const VOLUME = 'volume'
const STACK = 'stack'

window.cache = cache

let ctSceneToolGroup, stackCTViewportToolGroup

class CacheDecacheExample extends Component {
  state = {
    progressText: 'fetching metadata...',
    metadataLoaded: false,
    leftClickTool: 'WindowLevel',
    layoutIndex: 0,
    destroyed: false,
    // cache
    imageCacheForDisplay: '',
    imageCacheSize: '',
    volumeCacheForDisplay: '',
    volumeCacheSize: '',
    maxCacheSize: 1000,
    //
    viewportGrid: {
      numCols: 2,
      numRows: 2,
      viewports: [{}, {}, {}, {}],
    },
    ctWindowLevelDisplay: { ww: 0, wc: 0 },
  }

  constructor(props) {
    super(props)

    registerWebImageLoader(cs)
    this._canvasNodes = new Map()
    this._viewportGridRef = React.createRef()
    this._offScreenRef = React.createRef()

    this.ctVolumeImageIdsPromise = getImageIds('ct1', VOLUME)

    this.ctStackImageIdsPromise = getImageIds('ct1', STACK)

    this.viewportGridResizeObserver = new ResizeObserver((entries) => {
      // ThrottleFn? May not be needed. This is lightning fast.
      // Set in mount
      if (this.renderingEngine) {
        this.renderingEngine.resize()
        this.renderingEngine.render()
      }
    })
  }

  /**
   * LIFECYCLE
   */
  async componentDidMount() {
    ;({ ctSceneToolGroup, stackCTViewportToolGroup } = initToolGroups())

    this.ctVolumeUID = ctVolumeUID
    this.ctStackUID = ctStackUID

    // Create volumes
    const ctStackImageIds = await this.ctStackImageIdsPromise

    const renderingEngine = new RenderingEngine(renderingEngineUID)

    this.renderingEngine = renderingEngine
    window.renderingEngine = renderingEngine

    // setMaxSimultaneousRequests(1000)

    this.viewportInput = [
      // CT volume axial
      {
        sceneUID: SCENE_IDS.CT,
        viewportUID: VIEWPORT_IDS.CT.AXIAL,
        type: VIEWPORT_TYPE.ORTHOGRAPHIC,
        canvas: this._canvasNodes.get(0),
        defaultOptions: {
          orientation: ORIENTATION.AXIAL,
        },
      },
      {
        sceneUID: SCENE_IDS.CT,
        viewportUID: VIEWPORT_IDS.CT.SAGITTAL,
        type: VIEWPORT_TYPE.ORTHOGRAPHIC,
        canvas: this._canvasNodes.get(1),
        defaultOptions: {
          orientation: ORIENTATION.SAGITTAL,
        },
      },
      {
        sceneUID: SCENE_IDS.CT,
        viewportUID: VIEWPORT_IDS.CT.CORONAL,
        type: VIEWPORT_TYPE.ORTHOGRAPHIC,
        canvas: this._canvasNodes.get(2),
        defaultOptions: {
          orientation: ORIENTATION.CORONAL,
        },
      },
      // stack CT
      {
        viewportUID: VIEWPORT_IDS.STACK.CT,
        type: VIEWPORT_TYPE.STACK,
        canvas: this._canvasNodes.get(3),
        defaultOptions: {
          orientation: ORIENTATION.AXIAL,
        },
      },
    ]

    renderingEngine.setViewports(this.viewportInput)

    // volume ct
    ctSceneToolGroup.addViewports(
      renderingEngineUID,
      SCENE_IDS.CT,
      VIEWPORT_IDS.CT.AXIAL
    )
    ctSceneToolGroup.addViewports(
      renderingEngineUID,
      SCENE_IDS.CT,
      VIEWPORT_IDS.CT.SAGITTAL
    )
    ctSceneToolGroup.addViewports(
      renderingEngineUID,
      SCENE_IDS.CT,
      VIEWPORT_IDS.CT.CORONAL
    )

    // stack ct
    stackCTViewportToolGroup.addViewports(
      renderingEngineUID,
      undefined,
      VIEWPORT_IDS.STACK.CT
    )

    renderingEngine.render()

    const stackViewport = renderingEngine.getViewport(VIEWPORT_IDS.STACK.CT)

    const middleSlice = Math.floor(ctStackImageIds.length / 2)
    await stackViewport.setStack(
      sortImageIdsByIPP(ctStackImageIds),
      middleSlice
    )

    // This will initialise volumes in GPU memory
    renderingEngine.render()
    // Start listening for resize
    this.viewportGridResizeObserver.observe(this._viewportGridRef.current)
  }

  componentWillUnmount() {
    // Stop listening for resize
    if (this.viewportGridResizeObserver) {
      this.viewportGridResizeObserver.disconnect()
    }

    // Destroy synchronizers
    // SynchronizerManager.destroy()
    resetToolsState()
    cache.purgeCache()
    ToolGroupManager.destroy()

    this.renderingEngine.destroy()
  }

  loadVolume = async () => {
    const ctVolumeImageIds = await this.ctVolumeImageIdsPromise
    // This only creates the volumes, it does not actually load all
    // of the pixel data (yet)
    const ctVolume = await createAndCacheVolume(ctVolumeUID, {
      imageIds: ctVolumeImageIds,
    })

    // Initialize all CT values to -1024 so we don't get a grey box?
    const { scalarData } = ctVolume
    const ctLength = scalarData.length

    for (let i = 0; i < ctLength; i++) {
      scalarData[i] = -1024
    }

    const onLoad = () => this.setState({ progressText: 'Loaded.' })

    const ctScene = this.renderingEngine.getScene(SCENE_IDS.CT)

    // todo: set Volumes, set the volume actors which is required for rendering
    // the scene, if we have already cached the images, load would be faster
    // than setting the volume actors, resulting in a blank canvas.
    await ctScene.setVolumes([{ volumeUID: ctVolumeUID }])

    ctVolume.load(onLoad)

    // Set initial CT levels in UI
    const { windowWidth, windowCenter } = ctVolume.metadata.voiLut[0]

    this.setState({
      metadataLoaded: true,
      ctWindowLevelDisplay: { ww: windowWidth, wc: windowCenter },
    })
  }

  decacheVolume = () => {
    const volume = cache.getVolume(ctVolumeUID)

    if (!volume) {
      throw new Error('Volume is not loaded')
    }

    const completelyRemove = true
    volume.decache(completelyRemove)
  }

  convertVolumeToImage = () => {
    const volume = cache.getVolume(ctVolumeUID)

    if (!volume) {
      throw new Error('Volume is not loaded')
    }
    const completelyRemove = false
    volume.decache(completelyRemove)
  }

  decacheStackImage = () => {
    const viewport = this.renderingEngine.getViewport(VIEWPORT_IDS.STACK.CT)
    const imageId = viewport.getCurrentImageId()

    cache.removeImageLoadObject(imageId)
  }

  setMaxCacheSize = () => {
    cache.setMaxCacheSize(this.state.maxCacheSize * 1000 * 1000) // byte
  }

  loadStack = async () => {
    const ctStackImageIds = await this.ctStackImageIdsPromise

    loadAndCacheImages(ctStackImageIds)
  }

  getImageCacheForDisplay = () => {
    const cachedImages = Array.from(cache._imageCache.keys())
    return cachedImages.map((str) => {
      const colonIndex = str.indexOf(':')
      return `${str.substring(0, colonIndex)}: .... ${str.substring(
        str.length - 20,
        str.length - 9
      )}`
    })
  }

  render() {
    return (
      <div>
        <div>
          <h1>Cache Decache Demo</h1>
          <p>
            This is a demo for volume viewports (Top row + left viewport of the
            second row) and a stack viewport (bottom row - right) which contains
            an image stack.
          </p>
        </div>
        <div>
          <button
            onClick={() => this.loadStack()}
            className="btn btn-primary"
            style={{ margin: '2px 4px' }}
          >
            Load all images in the stack
          </button>
          <button
            onClick={() => this.decacheStackImage()}
            className="btn btn-primary"
            style={{ margin: '2px 4px' }}
          >
            Decache image
          </button>
          <input
            type="text"
            id="name"
            name="name"
            style={{ margin: '2px 4px', float: 'right' }}
            value={this.state.maxCacheSize}
            onChange={(ev) =>
              this.setState({ maxCacheSize: parseFloat(ev.target.value) })
            }
          />
          <button
            onClick={() => this.setMaxCacheSize()}
            className="btn btn-primary"
            style={{ margin: '2px 4px', float: 'right' }}
          >
            Set Maximum Cache Size (MB)
          </button>
        </div>
        <div>
          <button
            onClick={() => this.loadVolume()}
            className="btn btn-primary"
            style={{ margin: '2px 4px' }}
          >
            Load volume
          </button>
          <button
            onClick={() => this.decacheVolume()}
            className="btn btn-primary"
            style={{ margin: '2px 4px' }}
          >
            Decache volume
          </button>
          <button
            onClick={() => this.convertVolumeToImage()}
            className="btn btn-primary"
            style={{ margin: '2px 4px' }}
          >
            Convert volume to image
          </button>
        </div>
        <div style={{ paddingBottom: '55px' }}>
          <ViewportGrid
            numCols={this.state.viewportGrid.numCols}
            numRows={this.state.viewportGrid.numRows}
            renderingEngine={this.renderingEngine}
            style={{ minHeight: '650px', marginTop: '35px' }}
            ref={this._viewportGridRef}
          >
            {this.state.viewportGrid.viewports.map((vp, i) => (
              <div
                className="viewport-pane"
                style={{
                  ...(vp.cellStyle || {}),
                  border: '2px solid grey',
                  background: 'black',
                }}
                key={i}
              >
                <canvas ref={(c) => this._canvasNodes.set(i, c)} />
              </div>
            ))}
          </ViewportGrid>
        </div>

        <div>
          <button
            onClick={() => {
              this.setState({
                imageCacheForDisplay: this.getImageCacheForDisplay(),
                imageCacheSize: humanFileSize(cache._imageCacheSize),
              })
            }}
            style={{ width: '50%' }}
          >
            Image Cache
            <div>{`#Cached Images: ${this.state.imageCacheForDisplay.length} -- Cache Size: ${this.state.imageCacheSize}`}</div>
            <div>
              <pre>
                {JSON.stringify(this.state.imageCacheForDisplay, null, 2)}
              </pre>
            </div>
          </button>
          <button
            onClick={() => {
              this.setState({
                volumeCacheForDisplay: Array.from(cache._volumeCache.keys()),
                volumeCacheSize: humanFileSize(cache._volumeCacheSize),
              })
            }}
            style={{ width: '50%' }}
          >
            Volume Cache
            <div>{`#Cached Volumes: ${this.state.volumeCacheForDisplay.length} -- Cache Size: ${this.state.volumeCacheSize}`}</div>
            <div>
              <pre>
                {JSON.stringify(this.state.volumeCacheForDisplay, null, 2)}
              </pre>
            </div>
          </button>
        </div>
      </div>
    )
  }
}

export default CacheDecacheExample

function humanFileSize(size) {
  const i = Math.floor(Math.log(size) / Math.log(1024))
  return (
    (size / Math.pow(1024, i)).toFixed(2) * 1 +
    ' ' +
    ['B', 'kB', 'MB', 'GB', 'TB'][i]
  )
}
