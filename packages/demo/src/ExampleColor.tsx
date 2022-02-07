import React, { Component } from 'react'
// ~~
import * as cs from '@ohif/cornerstone-render'
import {
  RenderingEngine,
  ORIENTATION,
  VIEWPORT_TYPE,
  metaData,
  createAndCacheVolume,
  init as csRenderInit,
} from '@ohif/cornerstone-render'
import { ToolBindings } from '@ohif/cornerstone-tools'
import * as csTools3d from '@ohif/cornerstone-tools'

import { registerWebImageLoader } from '@ohif/cornerstone-image-loader-streaming-volume'
import config from './config/default'
import { hardcodedMetaDataProvider } from './helpers/initCornerstone'
import { initToolGroups } from './initToolGroups'

let colorSceneToolGroup
class ColorExample extends Component {
  state = {
    viewportSizes: [
      [512, 512],
      [512, 512],
      [512, 512],
    ],
  }

  constructor(props) {
    super(props)

    this.axialContainer = React.createRef()
    this.sagittalContainer = React.createRef()
    this.coronalContainer = React.createRef()
  }

  componentWillUnmount() {
    csTools3d.destroy()
    this.renderingEngine.destroy()
  }

  async componentDidMount() {
    await csRenderInit()
    csTools3d.init()
    registerWebImageLoader(cs)
    const renderingEngineUID = 'ExampleRenderingEngineID'
    const { imageIds } = config.colorImages

    ;({ colorSceneToolGroup } = initToolGroups())

    metaData.addProvider(
      (type, imageId) => hardcodedMetaDataProvider(type, imageId, imageIds),
      10000
    )

    const volumeUID = 'VOLUME'

    const volume = await createAndCacheVolume(volumeUID, { imageIds })

    volume.load()

    const renderingEngine = new RenderingEngine(renderingEngineUID)

    this.renderingEngine = renderingEngine

    const axialViewportID = 'AXIAL'
    const sagittalViewportID = 'SAGITTAL'
    const coronalViewportID = 'CORONAL'

    this.axialViewportID = axialViewportID
    this.sagittalViewportID = sagittalViewportID
    this.coronalViewportID = coronalViewportID

    const ctSceneID = 'SCENE'

    renderingEngine.setViewports([
      {
        sceneUID: ctSceneID,
        viewportUID: axialViewportID,
        type: VIEWPORT_TYPE.ORTHOGRAPHIC,
        canvas: this.axialContainer.current,
        defaultOptions: {
          orientation: ORIENTATION.AXIAL,
        },
      },
      {
        sceneUID: ctSceneID,
        viewportUID: sagittalViewportID,
        type: VIEWPORT_TYPE.ORTHOGRAPHIC,
        canvas: this.sagittalContainer.current,
        defaultOptions: {
          orientation: ORIENTATION.SAGITTAL,
        },
      },
      {
        sceneUID: ctSceneID,
        viewportUID: coronalViewportID,
        type: VIEWPORT_TYPE.ORTHOGRAPHIC,
        canvas: this.coronalContainer.current,
        defaultOptions: {
          orientation: ORIENTATION.CORONAL,
        },
      },
    ])

    const ctScene = renderingEngine.getScene(ctSceneID)

    colorSceneToolGroup.addTool('WindowLevel', {})
    colorSceneToolGroup.addTool('Pan', {})
    colorSceneToolGroup.addTool('Zoom', {})
    colorSceneToolGroup.addTool('StackScrollMouseWheel', {})

    colorSceneToolGroup.setToolActive('StackScrollMouseWheel')
    colorSceneToolGroup.setToolActive('WindowLevel', {
      bindings: [{ mouseButton: ToolBindings.Mouse.Primary }],
    })
    colorSceneToolGroup.setToolActive('Pan', {
      bindings: [{ mouseButton: ToolBindings.Mouse.Auxiliary }],
    })
    colorSceneToolGroup.setToolActive('Zoom', {
      bindings: [{ mouseButton: ToolBindings.Mouse.Secondary }],
    })

    ctScene.setVolumes([
      {
        volumeUID: volumeUID,
        callback: ({ volumeActor, volumeUID }) => {
          volumeActor.getProperty().setIndependentComponents(false)
          volumeActor.getProperty().setInterpolationTypeToNearest()
        },
      },
    ])

    colorSceneToolGroup.addViewports(
      renderingEngineUID,
      ctSceneID,
      axialViewportID
    )
    colorSceneToolGroup.addViewports(
      renderingEngineUID,
      ctSceneID,
      sagittalViewportID
    )
    colorSceneToolGroup.addViewports(
      renderingEngineUID,
      ctSceneID,
      coronalViewportID
    )

    renderingEngine.render()
  }

  render() {
    const { viewportSizes } = this.state

    const style0 = {
      width: `${viewportSizes[0][0]}px`,
      height: `${viewportSizes[0][1]}px`,
    }

    const style1 = {
      width: `${viewportSizes[1][0]}px`,
      height: `${viewportSizes[1][1]}px`,
    }

    const style2 = {
      width: `${viewportSizes[2][0]}px`,
      height: `${viewportSizes[2][1]}px`,
    }

    return (
      <div>
        <div className="row">
          <div className="col-xs-12">
            <h1>Color Example</h1>
            {!window.crossOriginIsolated ? (
              <h1 style={{ color: 'red' }}>
                This Demo requires SharedArrayBuffer but your browser does not
                support it
              </h1>
            ) : null}
          </div>
        </div>
        <div className="row">
          <div>
            <canvas
              ref={this.axialContainer}
              width={viewportSizes[0][0]}
              height={viewportSizes[0][1]}
              style={style0}
            />

            <canvas
              width={viewportSizes[1][0]}
              height={viewportSizes[1][1]}
              ref={this.sagittalContainer}
              style={style1}
            />

            <canvas
              width={viewportSizes[2][0]}
              height={viewportSizes[2][1]}
              ref={this.coronalContainer}
              style={style2}
            />
          </div>
        </div>
      </div>
    )
  }
}

export default ColorExample
