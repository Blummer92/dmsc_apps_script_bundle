/**
 * Compatibility aliases for generated extended quick-test wrappers.
 *
 * The public test functions in VAM_QuickExtendedTests.gs intentionally keep
 * descriptive helper names. The generated compact helper layer uses shorter
 * names to keep the Apps Script file small. These aliases connect the two
 * layers without adding any spreadsheet writes.
 */
function vamExtAssetIdFormat_(){return idFormat();}
function vamExtAssetIdNumericSequenceGaps_(){return idGaps();}
function vamExtAssetIdPrefixDistribution_(){return idPrefixes();}
function vamExtBlankRows_(fieldName){return blank(fieldName);}
function vamExtCanonicalAlreadyMatchesSuggestion_(){return canonMatch();}
function vamExtDistribution_(fieldName){return dist(fieldName);}
function vamExtDriveFileIdMismatchRows_(){return idMismatch();}
function vamExtDriveLinkRows_(mode){return driveRows(mode);}
function vamExtDuplicateValues_(fieldName){return dupes(fieldName);}
function vamExtFilenameExtensionDistribution_(fieldName){return extDist(fieldName);}
function vamExtFilenameMissingExtension_(fieldName){return missingExt(fieldName);}
function vamExtFolderFolderIdMismatch_(){return folderMismatch();}
function vamExtFutureDateRows_(fieldName){return futureDate(fieldName);}
function vamExtInvalidDateRows_(fieldName){return badDate(fieldName);}
function vamExtLengthOutliers_(fieldName,minLength,maxLength){return len(fieldName,minLength,maxLength);}
function vamExtLinkParseableRows_(fieldName){return links(fieldName);}
function vamExtRowsReadyForStep_(stepName){return ready(stepName);}
function vamExtStaleDateRows_(fieldName,maxAgeDays){return staleDate(fieldName,maxAgeDays);}
function vamExtTooShortRows_(fieldName,minLength){return short(fieldName,minLength);}
function vamExtTopCleanupActions_(limit){return top(limit);}
function vamExtUnsafeCharacters_(fieldName){return unsafe(fieldName);}
