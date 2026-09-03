import { MetadataModules } from '../../enums';
import { addTypedProvider } from '../../metaData';
import isVideoTransferSyntax from '../isVideoTransferSyntax';

export function transferSyntaxProvider(next, query, data, options) {
  const fmiBase = next(query, data, options);
  if (fmiBase) {
    const transferSyntaxUID =
      fmiBase.transferSyntaxUID || fmiBase.availableTransferSyntaxUID;
    const isVideo = isVideoTransferSyntax(transferSyntaxUID);
    return {
      ...fmiBase,
      transferSyntaxUID: Array.isArray(transferSyntaxUID)
        ? transferSyntaxUID[0]
        : transferSyntaxUID,
      isVideo,
    };
  }
}

export function registerTransferSyntaxProvider() {
  addTypedProvider(MetadataModules.TRANSFER_SYNTAX, transferSyntaxProvider);
}
