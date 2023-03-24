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

export type AnnotationStyle = {
  [key in `${Properties}${States}${Modes}`]?: string;
};

export type ToolStyleConfig = {
  [toolName: string]: AnnotationStyle;
} & {
  global?: AnnotationStyle;
};

export type StyleConfig = {
  annotations?: {
    [annotationUID: string]: AnnotationStyle;
  };
  viewports?: {
    [viewportId: string]: ToolStyleConfig;
  };
  toolGroups?: {
    [toolGroupId: string]: ToolStyleConfig;
  };
  default: ToolStyleConfig;
};

export type StyleSpecifier = {
  viewportId?: string;
  toolGroupId?: string;
  toolName?: string;
  annotationUID?: string;
};
