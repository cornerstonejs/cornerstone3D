import toolStyle from './../stateManagement/toolStyle'
import toolColors from './../stateManagement/toolColors'
import path from './path'
import { state } from '../store'

/**
 * Draws proivded handles to the provided context
 * @public
 * @method drawHandles
 * @memberof Drawing
 *
 * @param {CanvasRenderingContext2D} context - Target context
 * @param {*} evtDetail - Cornerstone's 'cornerstoneimagerendered' event's `detail`
 * @param {Object[]|Object} handles - An array of handle arrays, in canvas coordinates.
 * @param {Object} [options={}] - Options object
 * @param {string} [options.color]
 * @param {Boolean} [options.drawHandlesIfActive=false] - Whether the handles should only be drawn if Active (hovered/selected)
 * @param {string} [options.fill]
 * @param {Number} [options.handleRadius=6]
 * @returns {undefined}
 */
export default function (context, handles, options = {}) {
  const defaultColor = toolColors.getToolColor()

  context.strokeStyle = options.color || defaultColor

  const handleKeys = Object.keys(handles)

  for (let i = 0; i < handleKeys.length; i++) {
    const handleKey = handleKeys[i]
    const handle = handles[handleKey]

    if (handle.drawnIndependently === true) {
      continue
    }

    if (options.drawHandlesIfActive === true && !handle.active) {
      continue
    }

    const lineWidth = handle.active
      ? toolStyle.getActiveWidth()
      : toolStyle.getToolWidth()
    const fillStyle = options.fill

    path(
      context,
      {
        lineWidth,
        fillStyle,
      },
      (context) => {
        // Handle's radisu, then tool's radius, then default radius
        const handleRadius =
          handle.radius || options.handleRadius || state.handleRadius

        context.arc(handle[0], handle[1], handleRadius, 0, 2 * Math.PI)
      }
    )
  }
}
