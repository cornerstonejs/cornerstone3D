export default function isNMReconstructable(imageSubType) {
  return imageSubType === 'RECON TOMO' || imageSubType === 'RECON GATED TOMO';
}
