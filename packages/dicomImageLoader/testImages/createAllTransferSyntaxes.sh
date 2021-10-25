#!/bin/bash
set -x

if [ -z "$1" ] ; then
    echo "Usage: \n sh createAllTransferSyntaxes.sh dcm_in.dcm"
    exit 0
fi

dcmconv $1 $1_LittleEndianImplicitTransferSyntax_1.2.840.10008.1.2.dcm --write-xfer-implicit
dcmconv $1 $1_LittleEndianExplicitTransferSyntax_1.2.840.10008.1.2.1.dcm --write-xfer-little
dcmconv $1 $1_BigEndianExplicitTransferSyntax_1.2.840.10008.1.2.2.dcm --write-xfer-big
dcmconv $1 $1_DeflatedExplicitVRLittleEndianTransferSyntax_1.2.840.10008.1.2.1.99.dcm --write-xfer-deflated

dcmcjpeg $1 $1_JPEGProcess1TransferSyntax_1.2.840.10008.1.2.4.50.dcm --encode-baseline +q 100
dcmcjpeg $1 $1_JPEGProcess2_4TransferSyntax_1.2.840.10008.1.2.4.51.dcm --encode-extended
dcmcjpeg $1 $1_JPEGProcess6_8TransferSyntax_1.2.840.10008.1.2.4.53.dcm --encode-spectral
dcmcjpeg $1 $1_JPEGProcess10_12TransferSyntax_1.2.840.10008.1.2.4.55.dcm --encode-progressive
dcmcjpeg $1 $1_JPEGProcess14TransferSyntax_1.2.840.10008.1.2.4.57.dcm --encode-lossless
dcmcjpeg $1 $1_JPEGProcess14SV1TransferSyntax_1.2.840.10008.1.2.4.70.dcm --encode-lossless-sv1

dcmcrle $1 $1_RLELosslessTransferSyntax_1.2.840.10008.1.2.5.dcm

dcmcjpls $1 $1_JPEGLSLosslessTransferSyntax_1.2.840.10008.1.2.4.80.dcm --encode-lossless

gdcmconv --j2k -U -i $1 -o $1_JPEG2000LosslessOnlyTransferSyntax_1.2.840.10008.1.2.4.90.dcm

dcmcrle $1 $1_RLELosslessTransferSyntax_1.2.840.10008.1.2.5.dcm

gdcmconv --lossy -U --jpegls -e 1  -i $1 -o $1_JPEGLSLossyTransferSyntax_1.2.840.10008.1.2.4.81.dcm
gdcmconv --lossy -U -q 100 --j2k -i $1 -o $1_JPEG2000TransferSyntax_1.2.840.10008.1.2.4.91.dcm
