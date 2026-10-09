export {
  attachFidelityIndicator,
  maybeAttachFidelityIndicator,
  detachFidelityIndicator,
} from './attachFidelityIndicator';
export {
  type FidelityLine,
  type SvgFidelityState,
  svgStateOf,
  lineKind,
  reductionFactorsOf,
  isReduced,
  isInteractiveLod,
  formatFactors,
  formatFactor,
} from './fidelityIndicatorState';
export { ensureFidelityIndicatorStyles } from './fidelityIndicatorStyles';
