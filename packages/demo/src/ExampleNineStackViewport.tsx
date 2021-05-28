import React, { Component } from 'react'
import {
  cache,
  RenderingEngine,
  eventTarget,
  metaData,
  ORIENTATION,
  VIEWPORT_TYPE,
  EVENTS as RENDERING_EVENTS,
} from '@ohif/cornerstone-render'
import { ToolGroupManager, resetToolsState } from '@ohif/cornerstone-tools'

import getImageIds from './helpers/getImageIds'
import ViewportGrid from './components/ViewportGrid'
import { initToolGroups, destroyToolGroups } from './initToolGroups'
import './ExampleVTKMPR.css'
import { ctVolumeUID, ctStackUID, SCENE_IDS, VIEWPORT_IDS } from './constants'
import LAYOUTS, { stackCT } from './layouts'

const colorImageIds = [
  'web:http://localhost:3000/examples/head/avf1240c.png',
  'web:http://localhost:3000/examples/head/avf1241a.png',
  'web:http://localhost:3000/examples/head/avf1241b.png',
  'web:http://localhost:3000/examples/head/avf1241c.png',
  'web:http://localhost:3000/examples/head/avf1242a.png',
  'web:http://localhost:3000/examples/head/avf1242b.png',
  'web:http://localhost:3000/examples/head/avf1242c.png',
  'web:http://localhost:3000/examples/head/avf1243a.png',
]

function hardcodedMetaDataProvider(type, imageId) {
  const colonIndex = imageId.indexOf(':')
  const scheme = imageId.substring(0, colonIndex)
  if (scheme !== 'web') return

  if (type === 'imagePixelModule') {
    const imagePixelModule = {
      pixelRepresentation: 0,
      bitsAllocated: 24,
      bitsStored: 24,
      highBit: 24,
      photometricInterpretation: 'RGB',
      samplesPerPixel: 3,
    }

    return imagePixelModule
  } else if (type === 'generalSeriesModule') {
    const generalSeriesModule = {
      modality: 'SC',
    }

    return generalSeriesModule
  } else if (type === 'imagePlaneModule') {
    const index = colorImageIds.indexOf(imageId)

    const imagePlaneModule = {
      imageOrientationPatient: [1, 0, 0, 0, 1, 0],
      imagePositionPatient: [0, 0, index * 5],
      pixelSpacing: [1, 1],
      columnPixelSpacing: 1,
      rowPixelSpacing: 1,
      frameOfReferenceUID: 'FORUID',
      columns: 2048,
      rows: 1216,
      rowCosines: [1, 0, 0],
      columnCosines: [0, 1, 0],
    }

    return imagePlaneModule
  } else if (type === 'voiLutModule') {
    return {
      windowWidth: [255],
      windowCenter: [127],
    }
  } else if (type === 'modalityLutModule') {
    return {
      rescaleSlope: 1,
      rescaleIntercept: 0,
    }
  }

  console.warn(type)
  throw new Error('not available!')
}

window.cache = cache

class NineStackViewportExample extends Component {
  state = {
    progressText: 'fetching metadata...',
    metadataLoaded: false,
    petColorMapIndex: 0,
    layoutIndex: 0,
    destroyed: false,
    //
    viewportGrid: {
      numCols: 3,
      numRows: 3,
      viewports: [{}, {}, {}, {}, {}, {}, {}, {}, {}],
    },
    ctWindowLevelDisplay: { ww: 0, wc: 0 },
  }

  constructor(props) {
    super(props)

    metaData.addProvider(hardcodedMetaDataProvider, 10000)

    this._canvasNodes = new Map()
    this._viewportGridRef = React.createRef()
    this._offScreenRef = React.createRef()
    this.ctImageIdsPromise = getImageIds('ctStack', 'STACK')
    // this.dxImageIdsPromise = createDXImageIds();
    // Promise.all([this.ctImageIdsPromise, this.dxImageIdsPromise]).then(() =>
    //   this.setState({ progressText: 'Loading data...' })
    // )

    // const {
    //   createCameraPositionSynchronizer,
    //   createVOISynchronizer,
    // } = synchronizers

    // this.axialSync = createCameraPositionSynchronizer('axialSync')
    // this.sagittalSync = createCameraPositionSynchronizer('sagittalSync')
    // this.coronalSync = createCameraPositionSynchronizer('coronalSync')
    // this.ctWLSync = createVOISynchronizer('ctWLSync')
    // this.ptThresholdSync = createVOISynchronizer('ptThresholdSync')

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
    const { ctSceneToolGroup, stackViewportToolGroup } = initToolGroups()

    this.ctStackUID = ctStackUID

    // Create volumes
    const imageIds = await this.ctImageIdsPromise
    // const dxImageIds = await this.dxImageIdsPromise

    const renderingEngine = new RenderingEngine(renderingEngineUID)
    // const renderingEngine = new RenderingEngine(renderingEngineUID)

    this.renderingEngine = renderingEngine
    window.renderingEngine = renderingEngine

    const viewportInput = [
      {
        viewportUID: VIEWPORT_IDS.STACK.CT + '--0',
        type: VIEWPORT_TYPE.STACK,
        canvas: this._canvasNodes.get(0),
        defaultOptions: {
          orientation: ORIENTATION.AXIAL,
        },
      },
      {
        viewportUID: VIEWPORT_IDS.STACK.CT + '--1',
        type: VIEWPORT_TYPE.STACK,
        canvas: this._canvasNodes.get(1),
        defaultOptions: {
          orientation: ORIENTATION.AXIAL,
        },
      },
      {
        viewportUID: VIEWPORT_IDS.STACK.CT + '--2',
        type: VIEWPORT_TYPE.STACK,
        canvas: this._canvasNodes.get(2),
        defaultOptions: {
          orientation: ORIENTATION.AXIAL,
        },
      },
      {
        viewportUID: VIEWPORT_IDS.STACK.CT + '--3',
        type: VIEWPORT_TYPE.STACK,
        canvas: this._canvasNodes.get(3),
        defaultOptions: {
          orientation: ORIENTATION.AXIAL,
        },
      },
      {
        viewportUID: VIEWPORT_IDS.STACK.CT + '--4',
        type: VIEWPORT_TYPE.STACK,
        canvas: this._canvasNodes.get(4),
        defaultOptions: {
          orientation: ORIENTATION.AXIAL,
        },
      },
      {
        viewportUID: VIEWPORT_IDS.STACK.CT + '--5',
        type: VIEWPORT_TYPE.STACK,
        canvas: this._canvasNodes.get(5),
        defaultOptions: {
          orientation: ORIENTATION.AXIAL,
        },
      },
      {
        viewportUID: VIEWPORT_IDS.STACK.CT + '--6',
        type: VIEWPORT_TYPE.STACK,
        canvas: this._canvasNodes.get(6),
        defaultOptions: {
          orientation: ORIENTATION.AXIAL,
        },
      },
      {
        viewportUID: VIEWPORT_IDS.STACK.CT + '--7',
        type: VIEWPORT_TYPE.STACK,
        canvas: this._canvasNodes.get(7),
        defaultOptions: {
          orientation: ORIENTATION.AXIAL,
        },
      },
      {
        viewportUID: VIEWPORT_IDS.STACK.CT + '--8',
        type: VIEWPORT_TYPE.STACK,
        canvas: this._canvasNodes.get(8),
        defaultOptions: {
          orientation: ORIENTATION.AXIAL,
        },
      },
    ]

    renderingEngine.setViewports(viewportInput)

    // volume ct

    // stack ct
    viewportInput.forEach((vpEntry) => {
      stackViewportToolGroup.addViewports(
        renderingEngineUID,
        undefined,
        vpEntry.viewportUID
      )
    })

    renderingEngine.render()

    const promises = viewportInput.map((vpEntry) => {
      const stackViewport = renderingEngine.getViewport(vpEntry.viewportUID)
      return stackViewport.setStack(sortImageIdsByIPP(imageIds))
    })

    Promise.all(promises).then(() => {
      this.setState({
        metadataLoaded: true,
      })

      // This will initialise volumes in GPU memory
      renderingEngine.render()
    })

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

  showOffScreenCanvas = () => {
    // remove all childs
    this._offScreenRef.current.innerHTML = ''
    const uri = this.renderingEngine._debugRender()
    const image = document.createElement('img')
    image.src = uri
    image.setAttribute('width', '100%')

    this._offScreenRef.current.appendChild(image)
  }

  hidOffScreenCanvas = () => {
    // remove all childs
    this._offScreenRef.current.innerHTML = ''
  }

  render() {
    return (
      <div>
        <div>
          <h1>Nine Stack Viewports (setViewports API)</h1>
          <p>
            This is a demo for a heavy use case of stack viewports and to
            profile the performance of it.
          </p>
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
          <h1>OffScreen Canvas Render</h1>
          <button
            onClick={this.showOffScreenCanvas}
            className="btn btn-primary"
            style={{ margin: '2px 4px' }}
          >
            Show OffScreenCanvas
          </button>
          <button
            onClick={this.hidOffScreenCanvas}
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

export default NineStackViewportExample
