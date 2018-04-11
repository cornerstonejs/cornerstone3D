#!/bin/bash

dcmconv $1 $1_LittleEndianImplicitTransferSyntax_1.2.840.10008.1.2.dcm --write-xfer-implicit
dcmconv $1 $1_LittleEndianExplicitTransferSyntax_1.2.840.10008.1.2.1.dcm --write-xfer-little
dcmconv $1 $1_BigEndianExplicitTransferSyntax_1.2.840.10008.1.2.2.dcm --write-xfer-big
dcmconv $1 $1_DeflatedExplicitVRLittleEndianTransferSyntax_1.2.840.10008.1.2.1.99.dcm --write-xfer-deflated

dcmcjpeg $1 $1_JPEGProcess1TransferSyntax_1.2.840.10008.1.2.4.50.dcm --encode-extended
dcmcjpeg $1 $1_JPEGProcess2_4TransferSyntax_1.2.840.10008.1.2.4.51.dcm --encode-spectral
dcmcjpeg $1 $1_JPEGProcess6_8TransferSyntax_1.2.840.10008.1.2.4.53.dcm --encode-progressive
dcmcjpeg $1 $1_JPEGProcess10_12TransferSyntax_1.2.840.10008.1.2.4.55.dcm --true-lossless
dcmcjpeg $1 $1_JPEGProcess14TransferSyntax_1.2.840.10008.1.2.4.57.dcm --encode-baseline
dcmcjpeg $1 $1_JPEGProcess14SV1TransferSyntax_1.2.840.10008.1.2.4.70.dcm --encode-lossless-sv1

dcmcrle $1 $1_RLELosslessTransferSyntax_1.2.840.10008.1.2.5.dcm

dcmcjpls $1 $1_JPEGLSLosslessTransferSyntax_1.2.840.10008.1.2.4.80.dcm --encode-lossless
dcmcjpls $1 $1_JPEGLSLossyTransferSyntax_1.2.840.10008.1.2.4.81.dcm # --encode-nearlossless

#dcmcjp2k $1 $1_JPEG2000LosslessOnlyTransferSyntax_1.2.840.10008.1.2.4.90.dcm --encode-lossless
#dcmcjp2k $1 $1_JPEG2000TransferSyntax_1.2.840.10008.1.2.4.91.dcm --encode-lossless2

gdcmconv --j2k -i $1 -o $1_JPEG2000LosslessOnlyTransferSyntax_1.2.840.10008.1.2.4.90.dcm
gdcmconv --lossy --j2k -i $1 -o $1_JPEG2000TransferSyntax_1.2.840.10008.1.2.4.91.dcm

dcmcrle $1 $1_RLELosslessTransferSyntax_1.2.840.10008.1.2.5.dcm