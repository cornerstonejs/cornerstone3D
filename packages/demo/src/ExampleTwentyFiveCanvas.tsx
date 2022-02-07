import React, { Component } from 'react'
import {
  RenderingEngine,
  ORIENTATION,
  VIEWPORT_TYPE,
  init as csRenderInit,
} from '@precisionmetrics/cornerstone-render'

const NUM_VIEWPORTS = 25

class TwentyFiveCanvasExample extends Component {
  state = {
    renderAllTime: null,
    renderSingleViewportTime: null,
  }

  constructor(props) {
    super(props)

    this.containers = []

    for (let i = 0; i < NUM_VIEWPORTS; i++) {
      this.containers.push(React.createRef())
    }
  }

  componentWillUnmount() {
    this.renderingEngine.destroy()
  }

  async componentDidMount() {
    await csRenderInit()
    const renderingEngineUID = 'ExampleRenderingEngineID'
    const renderingEngine = new RenderingEngine(renderingEngineUID)

    this.renderingEngine = renderingEngine

    const viewportUIDS = []
    const sceneUID = 'SCENE_UID'
    const viewports = []

    for (let i = 0; i < NUM_VIEWPORTS; i++) {
      const viewportUID = `viewportUID_${0}`

      viewportUIDS.push(viewportUID)

      viewports.push({
        sceneUID,
        viewportUID,
        type: VIEWPORT_TYPE.ORTHOGRAPHIC,
        element: this.containers[i].current,
        defaultOptions: {
          orientation: ORIENTATION.AXIAL,
          background: [Math.random(), Math.random(), Math.random()],
        },
      })
    }

    renderingEngine.setViewports(viewports)

    const times = {
      all: [],
      singleViewport: [],
    }

    const scene = renderingEngine.getScene(sceneUID)
    // Some viewport that isn't the first one so there is an offset.
    const viewport = scene.getViewport(viewportUIDS[4])

    for (let i = 0; i < 100; i++) {
      const t0 = performance.now()

      renderingEngine.render()

      const t1 = performance.now()

      viewport.render()

      const t2 = performance.now()

      times.all.push(t1 - t0)
      times.singleViewport.push(t2 - t1)
    }

    const numTimes = times.all.length

    const averageTimes = {
      all: 0,
      singleViewport: 0,
    }

    for (let i = 0; i < numTimes; i++) {
      averageTimes.all += times.all[i]
      averageTimes.singleViewport += times.singleViewport[i]
    }

    averageTimes.all /= numTimes
    averageTimes.singleViewport /= numTimes

    this.setState({
      renderAllTime: { time: averageTimes.all, fps: 1000 / averageTimes.all },
      renderSingleViewportTime: {
        time: averageTimes.singleViewport,
        fps: 1000 / averageTimes.singleViewport,
      },
    })
  }

  render() {
    const style = {
      width: '512px',
      height: '512px',
    }

    const elements = this.containers.map((reference, index) => (
      <div
        style={{
          width: '512px',
          height: '512px',
          border: '2px solid grey',
          background: 'black',
          ...style,
        }}
        ref={reference}
        onContextMenu={(e) => e.preventDefault()}
        key={index}
      />
    ))

    const performanceText = this.state.renderAllTime ? (
      <React.Fragment>
        <p>{`Render all: average time: ${this.state.renderAllTime.time} ms (fps: ${this.state.renderAllTime.fps})`}</p>
        <p>{`Render single: average time: ${this.state.renderSingleViewportTime.time} ms (fps: ${this.state.renderSingleViewportTime.fps})`}</p>
      </React.Fragment>
    ) : (
      <p>Performing Tests...</p>
    )

    return (
      <div>
        <div className="row">
          <div className="col-xs-12">
            <h1>Twenty Five Canvas </h1>
            <p>
              This example shows that it is possible to have 25 512x512 canvases
              from one render engine. Each viewport in the rendering engine is
              given a unique color to show this.
            </p>
            <p>
              Timings given contain the time for the offscreen canvas to perform
              its rendering, and copy time back to canvases.
            </p>
            {performanceText}
          </div>
        </div>
        <div className="row">
          <div>{elements}</div>
        </div>
      </div>
    )
  }
}

export default TwentyFiveCanvasExample
