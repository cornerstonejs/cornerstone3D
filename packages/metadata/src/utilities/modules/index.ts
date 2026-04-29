import { MetadataModules } from '../../enums';

import { tags as transferSyntaxTags } from './transferSyntax';
import { tags as cineTags } from './cine';
import { tags as ptIsotopeTags } from './ptIsotope';
import { tags as radiopharmaceuticalInfoTags } from './radiopharmaceuticalInfo';
import { tags as ptImageTags } from './ptImage';
import { tags as ptSeriesTags } from './ptSeries';
import { tags as patientTags } from './patient';
import { tags as patientStudyTags } from './patientStudy';
import { tags as generalStudyTags } from './generalStudy';
import { tags as generalSeriesTags } from './generalSeries';
import { tags as clinicalTrialTags } from './clinicalTrial';
import { tags as sopCommonTags } from './sopCommon';
import { tags as ecgTags } from './ecg';
import { tags as generalImageTags } from './generalImage';
import { tags as imagePlaneTags } from './imagePlane';
import { tags as imagePixelTags } from './imagePixel';
import { tags as voiLutTags } from './voiLut';
import { tags as modalityLutTags } from './modalityLut';
import { tags as ultrasoundEnhancedRegionTags } from './ultrasoundEnhancedRegion';
import { tags as usRegionChildTags } from './usRegionChild';
import { tags as unassignedTags } from './unassigned';

/** Custom module name constants (not in MetadataModules enum). */
export const USRegionChild = 'usRegionChild';
export const CLINICAL_TRIAL = 'clinicalTrialModule';
export const RadiopharmaceuticalInfoModule = 'RadiopharmaceuticalInfo';

/**
 * A module tag entry is either a keyword string (resolved via dcmjs nameMap)
 * or a [keyword, hexOverride] tuple for names that differ from dcmjs.
 */
export type ModuleTagEntry = string | [name: string, hexOverride: string];

/**
 * Maps module name to the array of tag keywords belonging to that module.
 * A null module name means the tags are registered for lookup but not
 * assigned to any specific metadata module.
 */
export const moduleDefinitions: [string | null, ModuleTagEntry[]][] = [
  [MetadataModules.TRANSFER_SYNTAX, transferSyntaxTags],
  [MetadataModules.CINE, cineTags],
  [MetadataModules.PET_ISOTOPE, ptIsotopeTags],
  [RadiopharmaceuticalInfoModule, radiopharmaceuticalInfoTags],
  [MetadataModules.PET_IMAGE, ptImageTags],
  [MetadataModules.PET_SERIES, ptSeriesTags],
  [MetadataModules.PATIENT, patientTags],
  [MetadataModules.PATIENT_STUDY, patientStudyTags],
  [MetadataModules.GENERAL_STUDY, generalStudyTags],
  [MetadataModules.GENERAL_SERIES, generalSeriesTags],
  [CLINICAL_TRIAL, clinicalTrialTags],
  [MetadataModules.SOP_COMMON, sopCommonTags],
  [MetadataModules.ECG, ecgTags],
  [MetadataModules.GENERAL_IMAGE, generalImageTags],
  [MetadataModules.IMAGE_PLANE, imagePlaneTags],
  [MetadataModules.IMAGE_PIXEL, imagePixelTags],
  [MetadataModules.VOI_LUT, voiLutTags],
  [MetadataModules.MODALITY_LUT, modalityLutTags],
  [MetadataModules.ULTRASOUND_ENHANCED_REGION, ultrasoundEnhancedRegionTags],
  [USRegionChild, usRegionChildTags],
  [null, unassignedTags],
];
