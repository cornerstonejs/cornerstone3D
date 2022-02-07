import React, { Component } from 'react'
import {
  cache,
  RenderingEngine,
  registerImageLoader,
  registerVolumeLoader,
  metaData,
  VIEWPORT_TYPE,
  ORIENTATION,
  createAndCacheVolume,
  Utilities,
  init as csRenderInit,
} from '@precisionmetrics/cornerstone-render'
import {
  ToolBindings,
  synchronizers,
} from '@precisionmetrics/cornerstone-tools'
import * as csTools3d from '@precisionmetrics/cornerstone-tools'

import {
  setCTWWWC,
  setPetTransferFunction,
} from './helpers/transferFunctionHelpers'
import sortImageIdsByIPP from './helpers/sortImageIdsByIPP'
import getImageIds from './helpers/getImageIds'
import ViewportGrid from './components/ViewportGrid'
import { initToolGroups, addToolsToToolGroups } from './initToolGroups'
import './ExampleVTKMPR.css'
import {
  renderingEngineUID,
  ctVolumeUID,
  SCENE_IDS,
  VIEWPORT_IDS,
  ANNOTATION_TOOLS,
} from './constants'
const { createCameraPositionSynchronizer, createVOISynchronizer } =
  synchronizers

const VOLUME = 'volume'
const STACK = 'stack'

window.cache = cache

const { fakeImageLoader, fakeVolumeLoader, fakeMetaDataProvider } =
  Utilities.testUtils

let ctTestSceneToolGroup, ptTestSceneToolGroup

const toolsToUse = ANNOTATION_TOOLS
const ctLayoutTools = ['Levels'].concat(toolsToUse)

class testUtilVolume extends Component {
  state = {
    progressText: 'fetching metadata...',
    metadataLoaded: false,
    petColorMapIndex: 0,
    layoutIndex: 0,
    destroyed: false,
    //
    viewportGrid: {
      numCols: 1,
      numRows: 3,
      viewports: [{}, {}, {}],
    },
    ptCtLeftClickTool: 'Levels',
    ctWindowLevelDisplay: { ww: 0, wc: 0 },
    ptThresholdDisplay: 5,
  }

  constructor(props) {
    super(props)

    csTools3d.init()
    this._elementNodes = new Map()
    this._offScreenRef = React.createRef()
    this._viewportGridRef = React.createRef()

    registerVolumeLoader('fakeVolumeLoader', fakeVolumeLoader)
    metaData.addProvider(fakeMetaDataProvider, 10000)

    this.ctVolumeId = `fakeVolumeLoader:volumeURI_100_100_10_1_1_1_0`
    this.ptVolumeId = `fakeVolumeLoader:volumeURI_100_100_15_1_1_1_0`

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
    await csRenderInit()
    csTools3d.init()
    ;({ ctTestSceneToolGroup, ptTestSceneToolGroup } = initToolGroups())

    const renderingEngine = new RenderingEngine(renderingEngineUID)

    this.renderingEngine = renderingEngine
    window.renderingEngine = renderingEngine

    const viewportInput = [
      {
        sceneUID: SCENE_IDS.CT,
        viewportUID: VIEWPORT_IDS.CT.AXIAL,
        type: VIEWPORT_TYPE.ORTHOGRAPHIC,
        element: this._elementNodes.get(0),
        defaultOptions: {
          orientation: ORIENTATION.AXIAL,
          background: [1, 0, 1],
        },
      },
      {
        sceneUID: SCENE_IDS.PT,
        viewportUID: VIEWPORT_IDS.PT.AXIAL,
        type: VIEWPORT_TYPE.ORTHOGRAPHIC,
        element: this._elementNodes.get(1),
        defaultOptions: {
          orientation: ORIENTATION.AXIAL,
          background: [0, 1, 1],
        },
      },
      {
        sceneUID: SCENE_IDS.CT,
        viewportUID: VIEWPORT_IDS.CT.CORONAL,
        type: VIEWPORT_TYPE.ORTHOGRAPHIC,
        element: this._elementNodes.get(2),
        defaultOptions: {
          orientation: ORIENTATION.CORONAL,
          background: [1, 1, 0],
        },
      },
    ]

    renderingEngine.setViewports(viewportInput)

    ctTestSceneToolGroup.addViewports(
      renderingEngineUID,
      SCENE_IDS.CT,
      VIEWPORT_IDS.CT.AXIAL
    )
    // ctTestSceneToolGroup.addViewports(
    //   renderingEngineUID,
    //   SCENE_IDS.PT,
    //   VIEWPORT_IDS.CT.AXIAL
    // )
    ctTestSceneToolGroup.addViewports(
      renderingEngineUID,
      SCENE_IDS.CT,
      VIEWPORT_IDS.CT.CORONAL
    )

    ptTestSceneToolGroup.addViewports(
      renderingEngineUID,
      SCENE_IDS.PT,
      VIEWPORT_IDS.PT.AXIAL
    )

    addToolsToToolGroups({ ctTestSceneToolGroup })
    addToolsToToolGroups({ ptTestSceneToolGroup })

    const axialSync = createVOISynchronizer('axialSync')

    // This only creates the volumes, it does not actually load all
    // of the pixel data (yet)
    await createAndCacheVolume(this.ctVolumeId, { imageIds: [] })
    await createAndCacheVolume(this.ptVolumeId, { imageIds: [] })

    const ctScene = renderingEngine.getScene(SCENE_IDS.CT)
    const ptScene = renderingEngine.getScene(SCENE_IDS.PT)

    axialSync.addSource({
      renderingEngineUID: ctScene.renderingEngineUID,
      sceneUID: ctScene.uid,
      viewportUID: ctScene.getViewport(VIEWPORT_IDS.CT.AXIAL).uid,
    })
    axialSync.addTarget({
      renderingEngineUID: ptScene.renderingEngineUID,
      sceneUID: ptScene.uid,
      viewportUID: ptScene.getViewport(VIEWPORT_IDS.PT.AXIAL).uid,
    })

    await ctScene.setVolumes([
      {
        volumeUID: this.ctVolumeId,
      },
    ])

    await ptScene.setVolumes([
      {
        volumeUID: this.ptVolumeId,
      },
    ])

    renderingEngine.render()

    // Start listening for resize
    this.viewportGridResizeObserver.observe(this._viewportGridRef.current)
  }

  componentWillUnmount() {
    // Stop listening for resize
    if (this.viewportGridResizeObserver) {
      this.viewportGridResizeObserver.disconnect()
    }

    cache.purgeCache()
    csTools3d.destroy()

    this.renderingEngine.destroy()
  }

  destroyAndDecacheAllVolumes = () => {
    if (!this.state.metadataLoaded || this.state.destroyed) {
      return
    }
    this.renderingEngine.destroy()

    cache.purgeCache()
  }

  swapTools = (evt) => {
    const toolName = evt.target.value

    const isAnnotationToolOn = toolName !== 'Levels' ? true : false
    const options = {
      bindings: [{ mouseButton: ToolBindings.Mouse.Primary }],
    }
    if (isAnnotationToolOn) {
      // Set tool active

      const toolsToSetPassive = toolsToUse.filter((name) => name !== toolName)
      ctTestSceneToolGroup.setToolActive(toolName, options)
      toolsToSetPassive.forEach((toolName) => {
        ctTestSceneToolGroup.setToolPassive(toolName)
      })

      ctTestSceneToolGroup.setToolDisabled('WindowLevel')
    } else {
      // Set window level + threshold
      ctTestSceneToolGroup.setToolActive('WindowLevel', options)

      // Set all annotation tools passive
      toolsToUse.forEach((toolName) => {
        ctTestSceneToolGroup.setToolPassive(toolName)
      })
    }

    this.renderingEngine.render()
    this.setState({ ptCtLeftClickTool: toolName })
  }

  showOffScreenCanvas = () => {
    // remove all childs
    this._offScreenRef.current.innerHTML = ''
    const uri = this.renderingEngine._debugRender()
    const image = document.createElement('img')
    image.src = uri
    image.setAttribute('width', '100%')

    this._offScreenRef.current.appendChild(image)
  }

  hideOffScreenCanvas = () => {
    // remove all children
    this._offScreenRef.current.innerHTML = ''
  }

  rotateViewport = (rotateDeg) => {
    // remove all childs
    const vp = this.renderingEngine.getViewport(VIEWPORT_IDS.STACK.CT)
    vp.setRotation(rotateDeg)
  }

  render() {
    return (
      <div style={{ paddingBottom: '55px' }}>
        <div className="row">
          <div className="col-xs-12" style={{ margin: '8px 0' }}>
            <h2>Fake Volume Testings</h2>
            <h4>
              This demo uses ImageVolume instead of StreamingImageVolume and
              renders two volumes; however, it does not use the
              SharedArrayBuffer
            </h4>
          </div>
          <div
            className="col-xs-12"
            style={{ margin: '8px 0', marginLeft: '-4px' }}
          >
            {/* Hide until we update react in a better way  {fusionWLDisplay} */}
          </div>
        </div>
        <select value={this.state.ptCtLeftClickTool} onChange={this.swapTools}>
          {ctLayoutTools.map((toolName) => (
            <option key={toolName} value={toolName}>
              {toolName}
            </option>
          ))}
        </select>
        <ViewportGrid
          numCols={this.state.viewportGrid.numCols}
          numRows={this.state.viewportGrid.numRows}
          renderingEngine={this.renderingEngine}
          style={{ minHeight: '650px', marginTop: '35px' }}
          ref={this._viewportGridRef}
        >
          {this.state.viewportGrid.viewports.map((vp, i) => (
            <div
              style={{
                width: '100%',
                height: '100%',
                border: '2px solid grey',
                background: 'black',
                ...(vp.cellStyle || {}),
              }}
              ref={(c) => this._elementNodes.set(i, c)}
              onContextMenu={(e) => e.preventDefault()}
              key={i}
            />
          ))}
        </ViewportGrid>
        <div>
          <h1>OffScreen Canvas Render</h1>
          <button
            onClick={this.showOffScreenCanvas}
            className="btn btn-primary"
            style={{ margin: '2px 4px' }}
          >
            Show OffScreenCanvas
          </button>
          <button
            onClick={this.hideOffScreenCanvas}
            className="btn btn-primary"
            style={{ margin: '2px 4px' }}
          >
            Hide OffScreenCanvas
          </button>
          <div ref={this._offScreenRef}></div>
        </div>
      </div>
    )
  }
}

export default testUtilVolume
