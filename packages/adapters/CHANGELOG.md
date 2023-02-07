# Change Log

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

## [0.2.1](https://github.com/dcmjs-org/dcmjs/compare/@cornerstonejs/adapters@0.2.0...@cornerstonejs/adapters@0.2.1) (2023-02-03)


### Bug Fixes

* **adapters:** Update rollup to newer version ([#407](https://github.com/dcmjs-org/dcmjs/issues/407)) ([543675f](https://github.com/dcmjs-org/dcmjs/commit/543675f1269f8b739764291b1c27b40470c48c63))





# [0.2.0](https://github.com/dcmjs-org/dcmjs/compare/@cornerstonejs/adapters@0.1.5...@cornerstonejs/adapters@0.2.0) (2023-01-30)


### Features

* **CobbAngle:** Add CobbAngle tool ([#353](https://github.com/dcmjs-org/dcmjs/issues/353)) ([b9bd701](https://github.com/dcmjs-org/dcmjs/commit/b9bd701df41ae2b8b2afbcf1d092d7587f7b267a))





## [0.1.5](https://github.com/dcmjs-org/dcmjs/compare/@cornerstonejs/adapters@0.1.4...@cornerstonejs/adapters@0.1.5) (2023-01-30)


### Bug Fixes

* **build:** Include adapters in circleci config ([#402](https://github.com/dcmjs-org/dcmjs/issues/402)) ([45c8416](https://github.com/dcmjs-org/dcmjs/commit/45c84167b40c6a48bb2c499b6153c200763778a0))





## [0.1.4](https://github.com/dcmjs-org/dcmjs/compare/@cornerstonejs/adapters@0.1.3...@cornerstonejs/adapters@0.1.4) (2023-01-30)


### Bug Fixes

* **build:** adapters build missing files ([#400](https://github.com/dcmjs-org/dcmjs/issues/400)) ([901dd88](https://github.com/dcmjs-org/dcmjs/commit/901dd8815e121f29c50da0b1b9764d90d881114b))





## [0.1.3](https://github.com/dcmjs-org/dcmjs/compare/@cornerstonejs/adapters@0.1.2...@cornerstonejs/adapters@0.1.3) (2023-01-28)


### Bug Fixes

* **build:** Adding exports and files ([#398](https://github.com/dcmjs-org/dcmjs/issues/398)) ([2e8101f](https://github.com/dcmjs-org/dcmjs/commit/2e8101f229aa4c112405cb03558903956fc7e7f8))





## [0.1.2](https://github.com/dcmjs-org/dcmjs/compare/@cornerstonejs/adapters@0.1.1...@cornerstonejs/adapters@0.1.2) (2023-01-27)


### Bug Fixes

* **build:** fixing publish of adapters in package json ([#396](https://github.com/dcmjs-org/dcmjs/issues/396)) ([5a45b2f](https://github.com/dcmjs-org/dcmjs/commit/5a45b2f9ebeca9b800642d2735720a8d8400cd12))





## [0.1.1](https://github.com/dcmjs-org/dcmjs/compare/@cornerstonejs/adapters@0.1.0...@cornerstonejs/adapters@0.1.1) (2023-01-27)


### Bug Fixes

* **build:** try to publish adapters ([#395](https://github.com/dcmjs-org/dcmjs/issues/395)) ([191a17b](https://github.com/dcmjs-org/dcmjs/commit/191a17b690d2ac60ad98a4b8ecb8379a92638d67))





# 0.1.0 (2023-01-27)

### Bug Fixes

-   🐛 adding readme notes ([#191](https://github.com/dcmjs-org/dcmjs/issues/191)) ([459260d](https://github.com/dcmjs-org/dcmjs/commit/459260d6e2a6f905729ddf68b1f12d3140b53849))
-   🐛 fix array format regression from commit 70b24332783d63c9db2ed21d512d9f7b526c5222 ([#236](https://github.com/dcmjs-org/dcmjs/issues/236)) ([5441063](https://github.com/dcmjs-org/dcmjs/commit/5441063d0395ede6d9f8bd3ac0d92ee14f6ef209))
-   🐛 Fix rotation mapping for SEG cornerstone adapter ([#151](https://github.com/dcmjs-org/dcmjs/issues/151)) ([3fab68c](https://github.com/dcmjs-org/dcmjs/commit/3fab68cbfd95f82820663b9fc99a2b0cd07e43c8))
-   🐛 Harden Segmentation import for different possible SEGs ([#146](https://github.com/dcmjs-org/dcmjs/issues/146)) ([c4952bc](https://github.com/dcmjs-org/dcmjs/commit/c4952bc5842bab80a5d928de0d860f89afc8f400))
-   🐛 IDC Re [#2003](https://github.com/dcmjs-org/dcmjs/issues/2003): fix regression in parsing segmentation orietations ([#220](https://github.com/dcmjs-org/dcmjs/issues/220)) ([5c0c6a8](https://github.com/dcmjs-org/dcmjs/commit/5c0c6a85e67b25ce5f39412ced37d8e825691481))
-   🐛 IDC2733: find segmentations reference source image Ids ([#253](https://github.com/dcmjs-org/dcmjs/issues/253)) ([f3e7101](https://github.com/dcmjs-org/dcmjs/commit/f3e71016dffa233bf0fb912cc7cf413718b8a1a9))
-   🐛 ignore frames without SourceImageSequence information when loading a segmentation ([#198](https://github.com/dcmjs-org/dcmjs/issues/198)) ([82709c4](https://github.com/dcmjs-org/dcmjs/commit/82709c4a8a317aa1354244010300ab9b902802dd))
-   🐛 indentation in nearlyEqual ([#202](https://github.com/dcmjs-org/dcmjs/issues/202)) ([989d6c9](https://github.com/dcmjs-org/dcmjs/commit/989d6c9a80686425563c55424ac1795e6a06cd7b))
-   🐛 relax condition in nearlyEquals check for detecting numbers near to zero ([#304](https://github.com/dcmjs-org/dcmjs/issues/304)) ([974cddd](https://github.com/dcmjs-org/dcmjs/commit/974cddd785c076f1ac0211b534a7c0b82a4ba68a))
-   🐛 When converting to multiframe, fix IPP issues ([#152](https://github.com/dcmjs-org/dcmjs/issues/152)) ([80496e4](https://github.com/dcmjs-org/dcmjs/commit/80496e422152c1a3dfd850a145011dd3dc632964))
-   **adapter:** Removed comment around getTID300RepresentationArguments 'tool' parameter ([#322](https://github.com/dcmjs-org/dcmjs/issues/322)) ([d8f05ff](https://github.com/dcmjs-org/dcmjs/commit/d8f05ffb9ef1b5cce254980a597b4c428ffdfb6e)), closes [#306](https://github.com/dcmjs-org/dcmjs/issues/306)
-   **add check for nullable numeric string vrs:** adds a check for nullable numeric strinv vrs ([#150](https://github.com/dcmjs-org/dcmjs/issues/150)) ([75046c4](https://github.com/dcmjs-org/dcmjs/commit/75046c4e1b2830dd3a32dc8d6938f6def71940a5))
-   **anonymizer:** [FIX & TESTS] cleanTags : check if param is undefined. Add 3 test ([#308](https://github.com/dcmjs-org/dcmjs/issues/308)) ([44d23d6](https://github.com/dcmjs-org/dcmjs/commit/44d23d6a9e347fcf049053129d4d7323a9258b71))
-   ArrowAnnotateTool adapter in Cornerstone3D parsing label ([#270](https://github.com/dcmjs-org/dcmjs/issues/270)) ([cb84979](https://github.com/dcmjs-org/dcmjs/commit/cb84979be6eef8835cc7ced006625751a04356aa))
-   avoid using replaceAll() which isn't available in Node.js 14 ([#296](https://github.com/dcmjs-org/dcmjs/issues/296)) ([7aac3ab](https://github.com/dcmjs-org/dcmjs/commit/7aac3ab05fdedfe1a7a159097690bec00c0bcd2b))
-   bug tolerance parameter was not propagated ([#241](https://github.com/dcmjs-org/dcmjs/issues/241)) ([c2ed627](https://github.com/dcmjs-org/dcmjs/commit/c2ed6275ccb80fbbab3c0f9c67893d6b681b0bab))
-   checking the length before writing a DS and using exponential if ([#176](https://github.com/dcmjs-org/dcmjs/issues/176)) ([601aa9e](https://github.com/dcmjs-org/dcmjs/commit/601aa9e8a6df26876b08da739451e538d46aa37b))
-   **coding-scheme:** Fix coding scheme for updated standard ([ae3f0b5](https://github.com/dcmjs-org/dcmjs/commit/ae3f0b5bcd398a4230c8fba2954e225fda97cc2f))
-   **cornerstone:** exceptions caused by undefined cached stats in adapters. Safe programming fix only ([#301](https://github.com/dcmjs-org/dcmjs/issues/301)) ([893be43](https://github.com/dcmjs-org/dcmjs/commit/893be433af05f11a03cfce0a572b448303b9334b))
-   **cs:** [#318](https://github.com/dcmjs-org/dcmjs/issues/318) - check instance's NumberOfFrames property to see if it is a multi-frame file or not ([#320](https://github.com/dcmjs-org/dcmjs/issues/320)) ([0b030a4](https://github.com/dcmjs-org/dcmjs/commit/0b030a45dd48f22a61a90dfe5bbb5848425960ca))
-   **cs:** Resolves [#316](https://github.com/dcmjs-org/dcmjs/issues/316) Cornerstone3D adaptor - Multiframe support - add "frameNumber" to the Annotation.data ([#317](https://github.com/dcmjs-org/dcmjs/issues/317)) ([5fe862e](https://github.com/dcmjs-org/dcmjs/commit/5fe862e22653d30bfc78e5be5de3669610887727))
-   **dcmjs:** Add a set of accessors to the sequence list so the API is more consistent ([#224](https://github.com/dcmjs-org/dcmjs/issues/224)) ([9dad6c5](https://github.com/dcmjs-org/dcmjs/commit/9dad6c549cb4dd5c351caa13386998cbe48a1ba6))
-   **DicomMessage:** Fix readFile after options were added ([c2b62a1](https://github.com/dcmjs-org/dcmjs/commit/c2b62a13b3afc78516f39b906ca7576537037c20))
-   **encoding:** encapsulation is applied for only PixelData ([#199](https://github.com/dcmjs-org/dcmjs/issues/199)) ([ede2950](https://github.com/dcmjs-org/dcmjs/commit/ede2950d530fb189bb5817db6b5285e2be74ffee)), closes [#194](https://github.com/dcmjs-org/dcmjs/issues/194)
-   Ensure DS and IS Value Representations are returned as arrays ([#83](https://github.com/dcmjs-org/dcmjs/issues/83)) ([a264661](https://github.com/dcmjs-org/dcmjs/commit/a264661d5a0a899b761c58492955f6d18cc03a4d))
-   exception writing NaN and Infinity values of FD tags ([#325](https://github.com/dcmjs-org/dcmjs/issues/325)) ([e86daaa](https://github.com/dcmjs-org/dcmjs/commit/e86daaad4c47e7ec2c135b94f0b0de622de69310))
-   Export loglevelnext logger as dcmjs.log for configuration ([#156](https://github.com/dcmjs-org/dcmjs/issues/156)) ([33515e5](https://github.com/dcmjs-org/dcmjs/commit/33515e5fe3f581d71278674860834ee1ea932faa))
-   Fix UN & AT VR processing logic ([#167](https://github.com/dcmjs-org/dcmjs/issues/167)) ([#168](https://github.com/dcmjs-org/dcmjs/issues/168)) ([7cb975a](https://github.com/dcmjs-org/dcmjs/commit/7cb975af106d2e3e943881a7dac06f1fe391809c))
-   force a release for commit caaac4b ([#240](https://github.com/dcmjs-org/dcmjs/issues/240)) ([f53b630](https://github.com/dcmjs-org/dcmjs/commit/f53b6306ce138c5ad3106015c4751b63fbcca362))
-   **fragment:** Refactor and fragment bug ([#283](https://github.com/dcmjs-org/dcmjs/issues/283)) ([307d60a](https://github.com/dcmjs-org/dcmjs/commit/307d60a6ffecf7d96bc729a37a45775c6b6e189c)), closes [#282](https://github.com/dcmjs-org/dcmjs/issues/282)
-   **fragment:** write padding to even length on final fragments of encapsulated frame data ([#294](https://github.com/dcmjs-org/dcmjs/issues/294)) ([34b7561](https://github.com/dcmjs-org/dcmjs/commit/34b7561fa48870a87b948eb427d4e32808b4d40e)), closes [#293](https://github.com/dcmjs-org/dcmjs/issues/293)
-   **idc-02252:** typo + release ([#180](https://github.com/dcmjs-org/dcmjs/issues/180)) ([3f5cb24](https://github.com/dcmjs-org/dcmjs/commit/3f5cb24fd0e50668d36dc21390a1ff527505a8db))
-   **image-comments:** Move ImageComments to DerivedPixels ([da11200](https://github.com/dcmjs-org/dcmjs/commit/da112001e3c1c01b30acbd634fd9b2f46a9d3a63))
-   **import:** missing import for addAccessors ([#295](https://github.com/dcmjs-org/dcmjs/issues/295)) ([6b631b6](https://github.com/dcmjs-org/dcmjs/commit/6b631b6c8bdb2a7a70637308c9ebfe849fe9ccaf))
-   infinite loop on dcm with no meta length ([#331](https://github.com/dcmjs-org/dcmjs/issues/331)) ([51b156b](https://github.com/dcmjs-org/dcmjs/commit/51b156bf1278fc0f9476de70c89697576c0f4b55))
-   Invalid VR of the private creator tag of the "Implicit VR Endian" typed DICOM file ([#242](https://github.com/dcmjs-org/dcmjs/issues/242)) ([#243](https://github.com/dcmjs-org/dcmjs/issues/243)) ([6d0552f](https://github.com/dcmjs-org/dcmjs/commit/6d0552fb96c59dcf3e39b3306a50004b24128330))
-   issues in binary tag parsing ([#276](https://github.com/dcmjs-org/dcmjs/issues/276)) ([60c3af1](https://github.com/dcmjs-org/dcmjs/commit/60c3af1654b8f64baea1cd47f1049fd16ea2fee8))
-   **measurement-report:** Fix issues with Measurement Report for Bidirectional measurements ([25cf222](https://github.com/dcmjs-org/dcmjs/commit/25cf222e9d80bbe5b68854362383ac4fcaec7f6c))
-   **measurement-report:** Fix ReferencedFrameNumber usage in MeasurementReport ([b80cd2a](https://github.com/dcmjs-org/dcmjs/commit/b80cd2af070d0280295e88ee24d7e4d43c4af861))
-   **naturalize:** revert single element sequence ([#223](https://github.com/dcmjs-org/dcmjs/issues/223)) ([0743ed3](https://github.com/dcmjs-org/dcmjs/commit/0743ed34f657b622d4868fe5db37015ad1aa7850))
-   **naturalizing:** Fix the exception on naturalize twice ([#237](https://github.com/dcmjs-org/dcmjs/issues/237)) ([abced98](https://github.com/dcmjs-org/dcmjs/commit/abced980dccbabce7c4b159600f89c25ba747076))
-   **parsing:** can't read an encapsulated frame whose size is greater than fragment size ([#205](https://github.com/dcmjs-org/dcmjs/issues/205)) ([176875d](https://github.com/dcmjs-org/dcmjs/commit/176875d0c9c34704302512d2c27103db205b1c8f)), closes [#204](https://github.com/dcmjs-org/dcmjs/issues/204)
-   Re IDC [#2761](https://github.com/dcmjs-org/dcmjs/issues/2761) fix loading of segmentations ([#258](https://github.com/dcmjs-org/dcmjs/issues/258)) ([ceaf09a](https://github.com/dcmjs-org/dcmjs/commit/ceaf09af74f5727205e5d5869c97114b2c283ae5))
-   **Segmentation_4X:** Update tag name in getSegmentIndex method for segs ([#183](https://github.com/dcmjs-org/dcmjs/issues/183)) ([1e96ee3](https://github.com/dcmjs-org/dcmjs/commit/1e96ee3ce3280900d56f1887da81471f9b128d30))
-   **seg:** Use ReferencedSegmentNumber in shared fg ([#166](https://github.com/dcmjs-org/dcmjs/issues/166)) ([0ed3347](https://github.com/dcmjs-org/dcmjs/commit/0ed33477bb1c13b05d682c342edaf0a901fe0f7a))
-   several issues with character set handling ([#299](https://github.com/dcmjs-org/dcmjs/issues/299)) ([8e22107](https://github.com/dcmjs-org/dcmjs/commit/8e221074179b6d33b82ab5c6f1ae4c06c5522d6b))
-   **tests:** unified test data loading ([#292](https://github.com/dcmjs-org/dcmjs/issues/292)) ([c34f398](https://github.com/dcmjs-org/dcmjs/commit/c34f39813755227b79f7a0958a81a5e5c0935b73))
-   **update jsdocs, cut release:** release ([#203](https://github.com/dcmjs-org/dcmjs/issues/203)) ([307974c](https://github.com/dcmjs-org/dcmjs/commit/307974cb399d07152e0f6d4dd9f40fe1c17f076e))
-   update readme to trigger release ([#257](https://github.com/dcmjs-org/dcmjs/issues/257)) ([554f50d](https://github.com/dcmjs-org/dcmjs/commit/554f50d838fbcbeed25460c7384e14dc46bebb11))
-   update variable name for frame index ([#332](https://github.com/dcmjs-org/dcmjs/issues/332)) ([5515d6e](https://github.com/dcmjs-org/dcmjs/commit/5515d6e0abe11dee04f9b75272d3fbb5d00b2bd7))
-   use metadataProvider option instead of cornerstone.metaData ([#280](https://github.com/dcmjs-org/dcmjs/issues/280)) ([3a0e484](https://github.com/dcmjs-org/dcmjs/commit/3a0e484d203770cd309e2bd9f78946a733e79d0c))
-   **utilities:** Export Bidirectional and Polyline inside TID300 ([75e0e29](https://github.com/dcmjs-org/dcmjs/commit/75e0e29f771843a80bfa32532d2186a4e7cdbd57))
-   **VR:** added support for specific character set ([#291](https://github.com/dcmjs-org/dcmjs/issues/291)) ([f103d19](https://github.com/dcmjs-org/dcmjs/commit/f103d1918d02780c4881db5c8aa30f653c4da6b6))
-   **vr:** Convert empty DecimalString and NumberString to null instead of to zero ([#278](https://github.com/dcmjs-org/dcmjs/issues/278)) ([43cd8ea](https://github.com/dcmjs-org/dcmjs/commit/43cd8eaa316a08ff1a025b1267fedda239526acb))
-   **writeBytes:** create release from commit ([d9a4105](https://github.com/dcmjs-org/dcmjs/commit/d9a41050e756f9b7e56ef4ae3d5000ce86ea39eb))

### Features

-   **adapters:** Add adapter for exporting polylines from dicom-microscopy-viewer to DICOM-SR ([#44](https://github.com/dcmjs-org/dcmjs/issues/44)) ([7a1947c](https://github.com/dcmjs-org/dcmjs/commit/7a1947c6ec164da4e9f66e90c1bbf1055978b173))
-   **adapters:** Add adapter to generate segments & geometry from SEG for easier use in VTKjs (migrated from vtkDisplay example) ([398b74d](https://github.com/dcmjs-org/dcmjs/commit/398b74d70deb32824a74e98210127326887dfa77))
-   **adapters:** First steps for DICOM-SR read support for polylines with dicom-microscopy-viewer ([#49](https://github.com/dcmjs-org/dcmjs/issues/49)) ([37f1888](https://github.com/dcmjs-org/dcmjs/commit/37f18881dd7369818de4aa22c5730012c2829616))
-   Add Cornerstone3D adapter for Length tool ([#261](https://github.com/dcmjs-org/dcmjs/issues/261)) ([2cab0d9](https://github.com/dcmjs-org/dcmjs/commit/2cab0d9edba20e99b11407d41ed2a4bf60a6ab9b))
-   Add overlapping segment check to Cornerstone 4.x DICOM SEG adapter ([#155](https://github.com/dcmjs-org/dcmjs/issues/155)) ([df44e27](https://github.com/dcmjs-org/dcmjs/commit/df44e27b3b1c26082bf3d7a9477ab7f0d5ca1d19))
-   Allow backslashes in UIDs in order to support DICOM Q&R ([#277](https://github.com/dcmjs-org/dcmjs/issues/277)) ([6d2d5c6](https://github.com/dcmjs-org/dcmjs/commit/6d2d5c60f500174abb1be7757094178ec6a1d144))
-   **anonymizer:** export Array tagNamesToEmpty and modify cleanTags ([#303](https://github.com/dcmjs-org/dcmjs/issues/303)) ([e960085](https://github.com/dcmjs-org/dcmjs/commit/e960085ca08fb28a0a8134fbfee7d450722d8c64))
-   Bidirectional Arrow and EllipticalROI adapters for CS3D ([#264](https://github.com/dcmjs-org/dcmjs/issues/264)) ([1fc7932](https://github.com/dcmjs-org/dcmjs/commit/1fc7932e3eed85fa1a0f857d84bab35a2e62d80d))
-   **cornerstone:** Feature add cornerstone adapters ([#225](https://github.com/dcmjs-org/dcmjs/issues/225)) ([23c0877](https://github.com/dcmjs-org/dcmjs/commit/23c08777f7a93d4c0576a5e583113029a1a1e05f))
-   **deflated:** Added support for reading datasets with deflated transfer syntax ([#312](https://github.com/dcmjs-org/dcmjs/issues/312)) ([ee8f8f2](https://github.com/dcmjs-org/dcmjs/commit/ee8f8f21babbbd8eac2b19e8e957db2cc5a09325))
-   **mem:** Zero Copy ArrayBuffer ([#279](https://github.com/dcmjs-org/dcmjs/issues/279)) ([a17f2d7](https://github.com/dcmjs-org/dcmjs/commit/a17f2d75bc102cc789289f0eae51e5b416ce1567))
-   Move adapters from dcmjs for Cornerstone/3d and VTK ([b136a21](https://github.com/dcmjs-org/dcmjs/commit/b136a21fb96bb28c3a10a63b6b78083b897f4e19))
-   **npm:** bump minor version (minor readme edits) ([b48f665](https://github.com/dcmjs-org/dcmjs/commit/b48f665893f5e4b643c68ddc2fc3b13c641b6b29))
-   **readme:** stress need for a PR for npm package ([#310](https://github.com/dcmjs-org/dcmjs/issues/310)) ([dafd78d](https://github.com/dcmjs-org/dcmjs/commit/dafd78d004ccb9d0b505f0b7e0fd461eda9c3710))
-   **sr:** export TID300 - Point class ([#323](https://github.com/dcmjs-org/dcmjs/issues/323)) ([d2aebc3](https://github.com/dcmjs-org/dcmjs/commit/d2aebc3166c23e14dce4d7a8b7f1e2fc933f6328))
-   **structured-reports:** Add initial work on Adapters / Utilities for Imaging Measurement Structured Report input / output ([#17](https://github.com/dcmjs-org/dcmjs/issues/17)) ([941ad75](https://github.com/dcmjs-org/dcmjs/commit/941ad75320eece3368104d08247fdc371497c7cd))
-   **testing:** Use the Jest testing framework and switch to GitHub Actions ([#254](https://github.com/dcmjs-org/dcmjs/issues/254)) ([a91ff2b](https://github.com/dcmjs-org/dcmjs/commit/a91ff2babd2c6a44f20ecbd954ab38901276cf41))
