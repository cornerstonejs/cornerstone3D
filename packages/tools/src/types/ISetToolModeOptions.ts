import { ToolModes, MouseBindings, KeyboardBindings } from '../enums';

type ToolBindingMouseType = typeof MouseBindings[keyof typeof MouseBindings];

type ToolBindingKeyboardType =
  typeof KeyboardBindings[keyof typeof KeyboardBindings];

type IToolBinding = {
  /** Mouse button bindings e.g., MouseBindings.Primary/Secondary etc. */
  mouseButton?: ToolBindingMouseType;
  /** Keyboard bindings e.g., KeyboardBindings.Shift/Ctrl etc. */
  modifierKey?: ToolBindingKeyboardType;
  /** Number of touch points */
  numTouchPoints?: number;
};

type SetToolBindingsType = {
  /** bindings for the toolGroup's tool when it is set to be active */
  bindings: IToolBinding[];
};

type ToolOptionsType = {
  /** bindings for the toolGroup's tool when it is set to be active */
  bindings: IToolBinding[];
  /** mode of the tool */
  mode: ToolModes;
};

export { IToolBinding, SetToolBindingsType, ToolOptionsType };
