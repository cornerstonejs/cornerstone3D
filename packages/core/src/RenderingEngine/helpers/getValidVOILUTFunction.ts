import VOILUTFunctionType from '../../enums/VOILUTFunctionType';

export default function getValidVOILUTFunction(voiLUTFunction: any) {
  if (Object.values(VOILUTFunctionType).indexOf(voiLUTFunction) === -1) {
    voiLUTFunction = VOILUTFunctionType.LINEAR;
  }
  return voiLUTFunction;
}
