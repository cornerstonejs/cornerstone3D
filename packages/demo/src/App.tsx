import React, { Component } from 'react'
import { BrowserRouter as Router, Route, Link, Switch } from 'react-router-dom'
import VTKMPRExample from './ExampleVTKMPR'
import MPRCodecExample from './ExampleVTKMPRCodec'
import CanvasResizeExample from './ExampleCanvasResize'
import TwentyFiveCanvasExample from './ExampleTwentyFiveCanvas'
import ColorExample from './ExampleColor'
import StackViewportExample from './ExampleStackViewport'
import EnableDisableViewportExample from './ExampleEnableDisableAPI'
import NineStackViewportExample from './ExampleNineStackViewport'
import VTKSetVolumesExample from './ExampleSetVolumes'
import CacheDecacheExample from './ExampleCacheDecache'
import ToolDisplayConfigurationExample from './ExampleToolDisplayConfiguration'
import OneVolumeExample from './ExampleOneVolume'
import PriorityLoadExample from './ExamplePriorityLoad'
import OneStackExample from './ExampleOneStack'
import OneStackExampleCPU from './ExampleOneStackCPU'
import FlipViewportExample from './ExampleFlipViewport'
import ModifierKeysExample from './ExampleModifierKeys'
import TestUtils from './ExampleTestUtils'
import TestUtilsVolume from './ExampleTestUtilsVolume'
import CalibrationExample from './ExampleCalibration'
import { resetUseCPURendering } from '@cornerstonejs/core'
import SegmentationRender from './ExampleSegmentationRender'
import RenderToCanvasExample from './ExampleRenderToCanvas'
import CrosshairsExample from './ExampleCrosshairs'
import ApplyPresetsExample from './ExampleApplyPreset'
import CursorExample from './ExampleCursor'

function LinkOut({ href, text }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {text}
    </a>
  )
}

function ExampleEntry({ title, url, text, style, warningDiv }) {
  let CustomTag = `h5` as keyof JSX.IntrinsicElements

  if (style) {
    CustomTag = `h${style}` as keyof JSX.IntrinsicElements
  }

  return (
    <div>
      <CustomTag>
        <Link to={url}>{title}</Link>
      </CustomTag>
      <p>{text}</p>
      <hr />
    </div>
  )
}

function Index() {
  const style = {
    height: '512px',
  }

  // Reset the CPU rendering to whatever it should be (might've navigated from
  // A CPU demo).
  resetUseCPURendering()

  const examples = [
    {
      title: 'MPR',
      url: '/mpr',
      text: 'Example MPR playground.',
    },
    {
      title: 'MPR Codec',
      url: '/codec',
      text: 'Example loading data with different codecs.',
    },
    {
      title: 'One Volume',
      url: '/oneVolume',
      text: 'Example one volume',
    },
    {
      title: 'Cursor',
      url: '/cursor',
      text: 'Example cursor',
    },
    {
      title: 'Different Presets',
      url: '/applyPresets',
      text: 'Example for rendering with different presets',
    },
    {
      title: 'One Stack',
      url: '/oneStack',
      text: 'Example one Stack',
    },
    {
      title: 'One Stack CPU',
      url: '/oneStackCPU',
      text: 'Example one Stack with CPU fallback (even if your environment supports GPU)',
    },
    {
      title: 'Segmentation Render',
      url: '/segmentationRender',
      text: 'Example for demonstrating the rendering of Segmentation',
    },
    {
      title: 'Crosshairs',
      url: '/crosshairs',
      text: 'Example for Crosshairs',
    },
    {
      title: 'Canvas Resize',
      url: '/canvasResize',
      text: 'Onscreen/Offscreen Canvas Resize Example.',
    },
    {
      title: 'Twenty Five Canvas',
      url: '/twentyFiveCanvas',
      text: 'Example with twenty five on screen canvases linked to a single RenderingEngine.',
    },
    {
      title: 'Cache Decache',
      url: '/cacheDecache',
      text: 'Demonstration of combined cache and image loader',
    },
    {
      title: 'Color',
      url: '/color',
      text: 'Example with color.',
    },
    {
      title: 'New stack viewport',
      url: '/stackViewport',
      text: 'Example for displaying stack images and annotation events',
    },
    {
      title: 'Nine Stack Viewports',
      url: '/manyStackViewports',
      text: 'Example for displaying 9 stack viewports at once',
    },
    {
      title: 'EnableElement/disableElement API',
      url: '/enableDisableAPI',
      text: 'Example for displaying stack and volume viewport using enableElement and disableElement API',
    },
    {
      title: 'Set Volumes',
      url: '/setVolumes',
      text: 'Example for changing the volume while keeping the layout, synchronizers etc',
    },
    {
      title: 'Custom priority for loading a volumes',
      url: '/priorityLoad',
      text: 'Example for setting a custom priority for loading a volume',
    },
    {
      title: 'Tool Display Configuration',
      url: '/toolDisplayConfiguration',
      text: 'Example of display configuration options for tools',
    },
    {
      title: 'Modifier Keys',
      url: '/modifierKeys',
      text: 'Example of using modifier keys',
    },
    {
      title: 'Render To Canvas',
      url: '/renderToCanvas',
      text: 'Example of rendering an imageId to canvas',
    },
    {
      title: 'Test Utils',
      url: '/testUtils',
      text: 'Example demo for test utils',
    },
    {
      title: 'Test Utils two volumes',
      url: '/testUtilsVolume',
      text: 'Example demo for test utils that have two side by side demos',
    },
    {
      title: 'Calibrated Images',
      url: '/calibratedImages',
      text: 'Example that shows support for calibrated images',
    },
    {
      title: 'Flip Volume Viewport',
      url: '/flip',
      text: 'Example for flipping viewport horizontally or vertically volume',
    },
  ]

  const exampleComponents = examples.map((e) => {
    return <ExampleEntry key={e.title} {...e} />
  })

  return (
    <div className="container">
      <div className="row">
        <h1>Cornerstone 3D viewport</h1>
      </div>
      <div className="row">
        <div className="col-xs-12 col-lg-6">
          {!window.crossOriginIsolated ? (
            <h2 style={{ color: 'red' }}>
              Your page is NOT cross-origin isolated, see
              https://developer.mozilla.org/en-US/docs/Web/API/crossOriginIsolated
            </h2>
          ) : null}
          <p>
            This is a framework build on top of{' '}
            <LinkOut
              href={'https://github.com/Kitware/vtk-js'}
              text={'VTK.js'}
            />{' '}
            for easily managing data, displaying images and building tools.
          </p>
          <p>
            <LinkOut
              href={'/docs'}
              text="Documentation for this library can be found at `/docs`"
            />
          </p>
        </div>

        <div className="col-xs-12 col-lg-12" style={style}>
          <h3>Examples</h3>
          {exampleComponents}
        </div>
      </div>
    </div>
  )
}

function Example(props) {
  return (
    <div className="container">
      <h6>
        <Link to="/">Back to Examples</Link>
      </h6>
      {props.children}
    </div>
  )
}

function AppRouter() {
  const mpr = () =>
    Example({
      children: <VTKMPRExample />,
    })
  const mprCodec = () =>
    Example({
      children: <MPRCodecExample />,
    })
  const canvasResize = () =>
    Example({
      children: <CanvasResizeExample />,
    })
  const twentyFiveCanvas = () =>
    Example({
      children: <TwentyFiveCanvasExample />,
    })

  const color = () =>
    Example({
      children: <ColorExample />,
    })

  const calibratedImages = () =>
    Example({
      children: <CalibrationExample />,
    })

  const segmentationRender = () =>
    Example({
      children: <SegmentationRender />,
    })

  const stackViewport = () =>
    Example({
      children: <StackViewportExample />,
    })

  const cursorExample = () =>
    Example({
      children: <CursorExample />,
    })

  const enableDisableViewport = () =>
    Example({
      children: <EnableDisableViewportExample />,
    })

  const manyStackViewport = () =>
    Example({
      children: <NineStackViewportExample />,
    })

  const setVolumes = () =>
    Example({
      children: <VTKSetVolumesExample />,
    })

  const crosshairs = () =>
    Example({
      children: <CrosshairsExample />,
    })

  const applyPresets = () =>
    Example({
      children: <ApplyPresetsExample />,
    })

  const cacheDecache = () =>
    Example({
      children: <CacheDecacheExample />,
    })

  const toolDisplayConfiguration = () =>
    Example({
      children: <ToolDisplayConfigurationExample />,
    })

  const OneVolume = () =>
    Example({
      children: <OneVolumeExample />,
    })

  const PriorityLoad = () =>
    Example({
      children: <PriorityLoadExample />,
    })

  const OneStack = () =>
    Example({
      children: <OneStackExample />,
    })

  const OneStackCPU = () =>
    Example({
      children: <OneStackExampleCPU />,
    })

  const Flip = () =>
    Example({
      children: <FlipViewportExample />,
    })

  const ModifierKeys = () =>
    Example({
      children: <ModifierKeysExample />,
    })
  const RenderToCanvas = () =>
    Example({
      children: <RenderToCanvasExample />,
    })

  const Test = () =>
    Example({
      children: <TestUtils />,
    })

  const TestVolume = () =>
    Example({
      children: <TestUtilsVolume />,
    })

  return (
    <Router>
      <Switch>
        <Route exact path="/" component={Index} />
        <Route exact path="/mpr/" render={mpr} />
        <Route exact path="/codec/" render={mprCodec} />
        <Route exact path="/canvasResize/" render={canvasResize} />
        <Route exact path="/twentyFiveCanvas/" render={twentyFiveCanvas} />
        <Route exact path="/color/" render={color} />
        <Route exact path="/priorityLoad/" render={PriorityLoad} />
        <Route exact path="/flip/" render={Flip} />
        <Route exact path="/modifierKeys/" render={ModifierKeys} />
        <Route exact path="/renderToCanvas/" render={RenderToCanvas} />
        <Route exact path="/stackViewport/" render={stackViewport} />
        <Route exact path="/enableDisableAPI/" render={enableDisableViewport} />
        <Route exact path="/manyStackViewports/" render={manyStackViewport} />
        <Route exact path="/setVolumes/" render={setVolumes} />
        <Route exact path="/cacheDecache/" render={cacheDecache} />
        <Route exact path="/oneVolume/" render={OneVolume} />
        <Route exact path="/oneStack/" render={OneStack} />
        <Route exact path="/oneStackCPU/" render={OneStackCPU} />
        <Route exact path="/testUtils/" render={Test} />
        <Route exact path="/testUtilsVolume/" render={TestVolume} />
        <Route exact path="/calibratedImages/" render={calibratedImages} />
        <Route exact path="/segmentationRender/" render={segmentationRender} />
        <Route exact path="/crosshairs/" render={crosshairs} />
        <Route exact path="/applyPresets/" render={applyPresets} />
        <Route exact path="/cursor/" render={cursorExample} />
        <Route
          exact
          path="/toolDisplayConfiguration/"
          render={toolDisplayConfiguration}
        />
        <Route exact component={Index} />
      </Switch>
    </Router>
  )
}

export default class App extends Component {
  render() {
    return <AppRouter />
  }
}
