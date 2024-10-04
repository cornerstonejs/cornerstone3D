export interface ITransferFunctionNode {
  x: number; // The data value
  r: number; // Red component (0-1)
  g: number; // Green component (0-1)
  b: number; // Blue component (0-1)
  midpoint?: number; // Optional midpoint value
  sharpness?: number; // Optional sharpness value
}

export type TransferFunctionNodes = ITransferFunctionNode[];
