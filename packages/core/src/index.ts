// SPDX-License-Identifier: MPL-2.0
// Copyright 2026 Hisham Alrashdan (InfoGleam)

export type {
  Delimiters,
  HL7Component,
  HL7Field,
  HL7Repetition,
  HL7Segment,
  MessageFrame,
  ParsedMessage,
  ParseWarning,
  Terminator,
} from './types.js';
export {
  DEFAULT_DELIMITERS,
  HEADER_SEGMENTS,
  parseField,
  parseMessage,
  parseSegment,
  readDelimiters,
  terminatorName,
} from './parse.js';
export { buildSegmentRaw, serializeMessage } from './serialize.js';
export { fieldPath } from './path.js';
export type { FieldPath, FieldPathOptions } from './path.js';
export { MASK_RULES, MASKED_FIELDS, maskMessage } from './mask.js';
export type { MaskChange, MaskResult } from './mask.js';
export { DOCUMENTED_SEGMENTS, getFieldDoc, getSegmentDoc } from './dictionary.js';
export type { CodeValue, FieldDoc, LocalText, SegmentDoc, Usage } from './dictionary.js';
export { dataTypeKind, getComponentDoc, getDataTypeDoc, MISSING_DATA_TYPES, partNamesType } from './datatypes.js';
export type { ComponentDoc, DataTypeDoc, DataTypeKind, PartNames } from './datatypes.js';
export {
  getFieldHistory,
  getFieldVersion,
  HAS_FIELD_HISTORY,
  hasFieldFacts,
  HISTORY_VERSIONS,
  LATEST_VERSION,
} from './history.js';
export type { FieldChange, FieldFact, FieldOpt, FieldState, FieldVersion } from './history.js';
export { matchesSearch, normalizeSearchText, parsePositionQuery } from './search.js';
export type { SearchItem } from './search.js';
export { compareVersions, fieldVersionWarning, messageVersion, versionSupport } from './version.js';
export type { VersionSupport, VersionWarning } from './version.js';
export {
  CHECK_IDS,
  CHECK_LEVELS,
  checkMessage,
  checkValueFormat,
  DATA_TYPE_FORMS,
  FIELD_CHECKS,
  STATUS_CHECKS,
  VERSION_CHECKS,
} from './checks.js';
export type { CheckFacts, CheckFinding, CheckId, CheckLevel, CheckPosition, CheckReason, CheckResult } from './checks.js';
