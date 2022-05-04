type Modes = '' | 'Active' | 'Passive' | 'Enabled';
type States = '' | 'Highlighted' | 'Selected' | 'Locked';
type Properties =
  | 'color'
  | 'lineWidth'
  | 'lineDash'
  | 'textBoxFontFamily'
  | 'textBoxFontSize'
  | 'textBoxColor'
  | 'textBoxBackground'
  | 'textBoxLinkLineWidth'
  | 'textBoxLinkLineDash';

export type AnnotationStyles = {
  [key in `${Properties}${States}${Modes}`]: string;
};

export type ToolStyles = {
  [toolName: string]: AnnotationStyles;
  global: AnnotationStyles;
};

export type ToolStyleConfig = {
  annotations?: {
    [annotationUID: string]: AnnotationStyles;
  };
  viewports?: {
    [viewportId: string]: ToolStyles;
  };
  toolGroups?: {
    [toolGroupId: string]: ToolStyles;
  };
  default: ToolStyles;
};

export type StyleSpecifications = {
  viewportId?: string;
  toolGroupId?: string;
  toolName?: string;
  annotationUID?: string;
};
