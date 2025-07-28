export enum HistogramTemplate {
  DEFAULT = 'Default',
  CT_Abdomen = 'CT Abdomen',
  CT_Angio = 'CT Angio',
  CT_Bone = 'CT Bone',
  Brain = 'Brain',
  CT_Chest = 'CT Chest',
  CT_Lung = 'CT Lung',
}
export interface TemplateDetails {
  name: string;
  type: HistogramTemplate;
  windowWidth: number;
  windowLevel: number;
}
export const templateDictionary: Record<HistogramTemplate, TemplateDetails> = {
  [HistogramTemplate.DEFAULT]: {
    name: 'Default Template',
    type: HistogramTemplate.DEFAULT,
    windowWidth: 80,
    windowLevel: 40,
  },
  [HistogramTemplate.CT_Abdomen]: {
    name: 'CT Abdomen',
    type: HistogramTemplate.CT_Abdomen,
    windowWidth: 400,
    windowLevel: 60,
  },
  [HistogramTemplate.CT_Angio]: {
    name: 'CT Angio',
    type: HistogramTemplate.CT_Angio,
    windowWidth: 600,
    windowLevel: 300,
  },
  [HistogramTemplate.CT_Bone]: {
    name: 'CT Bone',
    type: HistogramTemplate.CT_Bone,
    windowWidth: 1500,
    windowLevel: 300,
  },
  [HistogramTemplate.Brain]: {
    name: 'Brain',
    type: HistogramTemplate.Brain,
    windowWidth: 80,
    windowLevel: 40,
  },
  [HistogramTemplate.CT_Chest]: {
    name: 'CT Chest',
    type: HistogramTemplate.CT_Chest,
    windowWidth: 400,
    windowLevel: 40,
  },
  [HistogramTemplate.CT_Lung]: {
    name: 'CT Lung',
    type: HistogramTemplate.CT_Lung,
    windowWidth: 1200,
    windowLevel: -400,
  },
};
export function getHistogramTemplate(
  template: string | number
): TemplateDetails {
  return templateDictionary[template];
}

export function convertToWindowRange(windowWidth: number, windowLevel: number) {
  const lower = windowLevel - windowWidth / 2.0;
  const upper = windowLevel + windowWidth / 2.0;
  return { lower, upper };
}
