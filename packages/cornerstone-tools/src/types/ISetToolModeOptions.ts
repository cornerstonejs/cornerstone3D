import { ToolModes } from '../enums'
import ToolBindings from '../enums/ToolBindings'

type ToolBindingMouseType =
  typeof ToolBindings.Mouse[keyof typeof ToolBindings.Mouse]

type ToolBindingKeyboardType =
  typeof ToolBindings.Keyboard[keyof typeof ToolBindings.Keyboard]

type IToolBinding = {
  /** Mouse button bindings e.g., ToolBindings.Mouse.Primary/Secondary etc. */
  mouseButton: ToolBindingMouseType
  /** Keyboard bindings e.g., ToolBindings.Keyboard.Shift/Ctrl etc. */
  modifierKey?: ToolBindingKeyboardType
}

type SetToolBindingsType = {
  /** bindings for the toolGroup's tool when it is set to be active */
  bindings: IToolBinding[]
}

type ToolOptionsType = {
  /** bindings for the toolGroup's tool when it is set to be active */
  bindings: IToolBinding[]
  /** mode of the tool */
  mode: ToolModes
}

export { IToolBinding, SetToolBindingsType, ToolOptionsType }
