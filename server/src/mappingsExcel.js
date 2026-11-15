/**
 * Comprehensive Excel keyboard mapping across all 55,295 X-Plorer bitmask permutations.
 */

import {
  actionChord,
  actionGoto,
  actionRibbon,
  actionText,
  canonicalSignature,
  makeAction,
  repeat,
} from "./keyInjector.js";
import {
  BIT_BACK,
  BIT_BLUE,
  BIT_DPAD_LEFT,
  BIT_DPAD_RIGHT,
  BIT_GREEN,
  BIT_GUIDE,
  BIT_ORANGE,
  BIT_RED,
  BIT_START,
  BIT_STRUM_DOWN,
  BIT_STRUM_UP,
  BIT_YELLOW,
  TOTAL_VALID_STATES,
  normalizeBitmask,
  rankBitmask,
  tiltBits,
  whammyBits,
} from "./protocol.js";

export const CURATED_EXCEL = new Map([
  // --- Basic Navigation & Controls (No frets) ---
  [BIT_STRUM_UP, actionChord("Move Up", "up", { category: "Navigation" })],
  [BIT_STRUM_DOWN, actionChord("Move Down", "down", { category: "Navigation" })],
  [BIT_DPAD_LEFT, actionChord("Move Left", "left", { category: "Navigation" })],
  [BIT_DPAD_RIGHT, actionChord("Move Right", "right", { category: "Navigation" })],
  [BIT_START, actionChord("Confirm / Enter", "enter", { category: "Editing", requiresStarPower: true })],
  [BIT_BACK, actionChord("Cancel / Escape", "esc", { category: "Editing" })],
  [BIT_GUIDE, actionChord("Edit Active Cell (F2)", "f2", { category: "Editing" })],

  // --- System Combos (No frets) ---
  [BIT_START | BIT_BACK, actionChord("Save Workbook", "ctrl", "s", { category: "Workbook", requiresStarPower: true })],
  [BIT_START | BIT_GUIDE, actionChord("Undo", "ctrl", "z", { category: "Editing" })],
  [BIT_BACK | BIT_GUIDE, actionChord("Redo", "ctrl", "y", { category: "Editing" })],
  [BIT_START | BIT_BACK | BIT_GUIDE, actionChord("Save As (F12)", "f12", { category: "Workbook", requiresStarPower: true })],

  [BIT_START | BIT_STRUM_UP, actionChord("Page Up", "pageup", { category: "Navigation" })],
  [BIT_START | BIT_STRUM_DOWN, actionChord("Page Down", "pagedown", { category: "Navigation" })],
  [BIT_START | BIT_DPAD_LEFT, actionChord("Previous Sheet", "ctrl", "pageup", { category: "Sheets" })],
  [BIT_START | BIT_DPAD_RIGHT, actionChord("Next Sheet", "ctrl", "pagedown", { category: "Sheets" })],

  [BIT_BACK | BIT_STRUM_UP, actionChord("Jump Top Edge", "ctrl", "up", { category: "Navigation" })],
  [BIT_BACK | BIT_STRUM_DOWN, actionChord("Jump Bottom Edge", "ctrl", "down", { category: "Navigation" })],
  [BIT_BACK | BIT_DPAD_LEFT, actionChord("Beginning of Row", "home", { category: "Navigation" })],
  [BIT_BACK | BIT_DPAD_RIGHT, actionChord("Jump Right Edge", "ctrl", "right", { category: "Navigation" })],

  [BIT_GUIDE | BIT_STRUM_UP, actionChord("Extend Selection Up", "shift", "up", { category: "Selection" })],
  [BIT_GUIDE | BIT_STRUM_DOWN, actionChord("Extend Selection Down", "shift", "down", { category: "Selection" })],
  [BIT_GUIDE | BIT_DPAD_LEFT, actionChord("Previous Cell (Shift+Tab)", "shift", "tab", { category: "Navigation" })],
  [BIT_GUIDE | BIT_DPAD_RIGHT, actionChord("Next Cell (Tab)", "tab", { category: "Navigation" })],

  // --- Green Fret: Clipboard, Editing & Fill ---
  [BIT_GREEN, actionChord("Move Up & Confirm", "shift", "enter", { category: "Editing" })],
  [BIT_GREEN | BIT_STRUM_DOWN, actionChord("Copy", "ctrl", "c", { category: "Clipboard" })],
  [BIT_GREEN | BIT_STRUM_UP, actionChord("Paste", "ctrl", "v", { category: "Clipboard" })],
  [BIT_GREEN | BIT_DPAD_LEFT, actionChord("Cut", "ctrl", "x", { category: "Clipboard" })],
  [BIT_GREEN | BIT_DPAD_RIGHT, actionChord("Clear Cell Contents", "delete", { category: "Editing" })],
  [BIT_GREEN | BIT_START, actionChord("Paste Special Dialog", "ctrl", "alt", "v", { category: "Clipboard" })],
  [BIT_GREEN | BIT_BACK, actionChord("Fill Down", "ctrl", "d", { category: "Editing" })],
  [BIT_GREEN | BIT_GUIDE, actionChord("Fill Right", "ctrl", "r", { category: "Editing" })],
  [BIT_GREEN | whammyBits(1), actionChord("Flash Fill", "ctrl", "e", { category: "Editing" })],
  [BIT_GREEN | tiltBits(1), actionChord("Insert Current Date", "ctrl", ";", { category: "Editing" })],
  [BIT_GREEN | tiltBits(2), actionChord("Insert Current Time", "ctrl", "shift", ";", { category: "Editing" })],

  // --- Red Fret: Selection, Rows, Columns & Delete ---
  [BIT_RED, actionChord("Jump Left Edge", "ctrl", "left", { category: "Navigation" })],
  [BIT_RED | BIT_STRUM_DOWN, actionChord("Select All / Current Region", "ctrl", "a", { category: "Selection" })],
  [BIT_RED | BIT_STRUM_UP, actionChord("Select Entire Row", "shift", "space", { category: "Selection" })],
  [BIT_RED | BIT_DPAD_LEFT, actionChord("Select Entire Column", "ctrl", "space", { category: "Selection" })],
  [BIT_RED | BIT_DPAD_RIGHT, actionChord("Backspace / Clear Formula", "backspace", { category: "Editing" })],
  [BIT_RED | BIT_START, actionChord("Delete Cells / Row / Col", "ctrl", "-", { category: "Structure", requiresRiff: true })],
  [BIT_RED | BIT_BACK, actionChord("Insert Cells / Row / Col", "ctrl", "shift", "=", { category: "Structure" })],
  [BIT_RED | BIT_GUIDE, actionChord("Select To End Edge Down", "ctrl", "shift", "down", { category: "Selection" })],
  [BIT_RED | whammyBits(1), actionChord("Select To End Edge Right", "ctrl", "shift", "right", { category: "Selection" })],
  [BIT_RED | tiltBits(1), actionChord("Hide Selected Rows", "ctrl", "9", { category: "Structure" })],
  [BIT_RED | tiltBits(2), actionChord("Hide Selected Columns", "ctrl", "0", { category: "Structure" })],

  // --- Yellow Fret: Formatting, Alignment & Number Formats ---
  [BIT_YELLOW, actionChord("Toggle Bold", "ctrl", "b", { category: "Formatting" })],
  [BIT_YELLOW | BIT_STRUM_DOWN, actionChord("Toggle Italic", "ctrl", "i", { category: "Formatting" })],
  [BIT_YELLOW | BIT_STRUM_UP, actionChord("Toggle Underline", "ctrl", "u", { category: "Formatting" })],
  [BIT_YELLOW | BIT_DPAD_LEFT, actionChord("Toggle Strikethrough", "ctrl", "5", { category: "Formatting" })],
  [BIT_YELLOW | BIT_DPAD_RIGHT, actionChord("Format Cells Dialog", "ctrl", "1", { category: "Formatting" })],
  [BIT_YELLOW | BIT_START, actionRibbon("Merge & Center", "h", "m", "c")],
  [BIT_YELLOW | BIT_BACK, actionRibbon("Wrap Text", "h", "w")],
  [BIT_YELLOW | BIT_GUIDE, actionRibbon("AutoFit Column Width", "h", "o", "i")],
  [BIT_YELLOW | whammyBits(1), actionChord("Currency Format ($)", "ctrl", "shift", "4", { category: "Number Format" })],
  [BIT_YELLOW | whammyBits(2), actionChord("Percent Format (%)", "ctrl", "shift", "5", { category: "Number Format" })],
  [BIT_YELLOW | whammyBits(3), actionChord("Date Format (#)", "ctrl", "shift", "3", { category: "Number Format" })],
  [BIT_YELLOW | whammyBits(4), actionChord("Number Format (!)", "ctrl", "shift", "1", { category: "Number Format" })],
  [BIT_YELLOW | whammyBits(5), actionChord("General Format (~)", "ctrl", "shift", "`", { category: "Number Format" })],
  [BIT_YELLOW | tiltBits(1), actionRibbon("Align Center", "h", "a", "c")],
  [BIT_YELLOW | tiltBits(2), actionRibbon("All Borders", "h", "b", "a")],

  // --- Blue Fret: Formulas, Find/Replace & Auditing ---
  [BIT_BLUE, actionChord("AutoSum (Alt+=)", "alt", "=", { category: "Formulas" })],
  [BIT_BLUE | BIT_STRUM_DOWN, actionText("Insert =SUM(", "=SUM(", { category: "Formulas" })],
  [BIT_BLUE | BIT_STRUM_UP, actionChord("Toggle $ Reference (F4)", "f4", { category: "Formulas" })],
  [BIT_BLUE | BIT_DPAD_LEFT, actionChord("Find Dialog", "ctrl", "f", { category: "Search" })],
  [BIT_BLUE | BIT_DPAD_RIGHT, actionChord("Find & Replace", "ctrl", "h", { category: "Search" })],
  [BIT_BLUE | BIT_START, actionChord("Toggle Show Formulas", "ctrl", "`", { category: "Formulas" })],
  [BIT_BLUE | BIT_BACK, actionChord("Calculate Workbook (F9)", "f9", { category: "Formulas" })],
  [BIT_BLUE | BIT_GUIDE, actionChord("Go To Dialog (F5)", "f5", { category: "Navigation" })],
  [BIT_BLUE | whammyBits(1), actionText("Insert =AVERAGE(", "=AVERAGE(", { category: "Formulas" })],
  [BIT_BLUE | whammyBits(2), actionText("Insert =IF(", "=IF(", { category: "Formulas" })],
  [BIT_BLUE | whammyBits(3), actionText("Insert =XLOOKUP(", "=XLOOKUP(", { category: "Formulas", requiresRiff: true })],
  [BIT_BLUE | tiltBits(1), actionRibbon("Trace Precedents", "m", "p")],
  [BIT_BLUE | tiltBits(2), actionRibbon("Remove Trace Arrows", "m", "a", "a")],

  // --- Orange Fret: Tables, Filters, Sheets, Charts & View ---
  [BIT_ORANGE, actionChord("Create Table (Ctrl+T)", "ctrl", "t", { category: "Data" })],
  [BIT_ORANGE | BIT_STRUM_DOWN, actionChord("Toggle AutoFilter", "ctrl", "shift", "l", { category: "Data" })],
  [BIT_ORANGE | BIT_STRUM_UP, actionChord("Insert New Worksheet", "shift", "f11", { category: "Sheets" })],
  [BIT_ORANGE | BIT_DPAD_LEFT, actionRibbon("Freeze Panes", "w", "f", "f")],
  [BIT_ORANGE | BIT_DPAD_RIGHT, actionRibbon("Insert PivotTable", "n", "v", { requiresRiff: true })],
  [BIT_ORANGE | BIT_START, actionChord("Insert Embedded Chart", "alt", "f1", { category: "Charts", requiresRiff: true })],
  [BIT_ORANGE | BIT_BACK, actionChord("Open VBA Editor", "alt", "f11", { category: "Developer", requiresRiff: true })],
  [BIT_ORANGE | BIT_GUIDE, actionChord("Name Manager", "ctrl", "f3", { category: "Formulas" })],
  [BIT_ORANGE | whammyBits(1), actionRibbon("Sort Ascending A-Z", "a", "s", "a")],
  [BIT_ORANGE | whammyBits(2), actionRibbon("Sort Descending Z-A", "a", "s", "d")],
  [BIT_ORANGE | tiltBits(1), actionChord("Print Preview", "ctrl", "p", { category: "Workbook" })],
  [BIT_ORANGE | tiltBits(2), actionChord("Refresh Data / Pivot", "alt", "f5", { category: "Data" })],

  // --- 2-Fret Power Chords ---
  [BIT_GREEN | BIT_RED, actionChord("Jump Workbook Top (A1)", "ctrl", "home", { category: "Navigation" })],
  [BIT_GREEN | BIT_RED | BIT_STRUM_DOWN, actionChord("Jump Last Used Cell", "ctrl", "end", { category: "Navigation" })],
  [BIT_GREEN | BIT_RED | BIT_STRUM_UP, actionChord("Extend Selection Left", "shift", "left", { category: "Selection" })],
  [BIT_GREEN | BIT_RED | BIT_DPAD_RIGHT, actionChord("Extend Selection Right", "shift", "right", { category: "Selection" })],
  [BIT_GREEN | BIT_RED | BIT_DPAD_LEFT, actionChord("Select To Workbook Top", "ctrl", "shift", "home", { category: "Selection" })],

  [BIT_GREEN | BIT_YELLOW, actionChord("New Line Inside Cell", "alt", "enter", { category: "Editing" })],
  [BIT_GREEN | BIT_YELLOW | BIT_STRUM_DOWN, actionChord("Legacy CSE Array Enter", "ctrl", "shift", "enter", { category: "Formulas" })],
  [BIT_GREEN | BIT_YELLOW | BIT_STRUM_UP, actionChord("Insert Hyperlink", "ctrl", "k", { category: "Insert" })],
  [BIT_GREEN | BIT_YELLOW | BIT_DPAD_LEFT, actionChord("Add Cell Comment/Note", "shift", "f2", { category: "Review" })],
  [BIT_GREEN | BIT_YELLOW | BIT_DPAD_RIGHT, actionChord("Spell Check (F7)", "f7", { category: "Review" })],

  [BIT_GREEN | BIT_BLUE, actionText("Insert =COUNT(", "=COUNT(", { category: "Formulas" })],
  [BIT_GREEN | BIT_BLUE | BIT_STRUM_DOWN, actionText("Insert =COUNTA(", "=COUNTA(", { category: "Formulas" })],
  [BIT_GREEN | BIT_BLUE | BIT_STRUM_UP, actionText("Insert =COUNTIF(", "=COUNTIF(", { category: "Formulas" })],
  [BIT_GREEN | BIT_BLUE | BIT_DPAD_LEFT, actionText("Insert =SUMIF(", "=SUMIF(", { category: "Formulas" })],
  [BIT_GREEN | BIT_BLUE | BIT_DPAD_RIGHT, actionText("Insert =SUMIFS(", "=SUMIFS(", { category: "Formulas" })],

  [BIT_GREEN | BIT_ORANGE, actionChord("New Workbook", "ctrl", "n", { category: "Workbook" })],
  [BIT_GREEN | BIT_ORANGE | BIT_STRUM_DOWN, actionChord("Open Workbook", "ctrl", "o", { category: "Workbook" })],
  [BIT_GREEN | BIT_ORANGE | BIT_STRUM_UP, actionChord("Close Workbook", "ctrl", "w", { category: "Workbook", requiresRiff: true })],
  [BIT_GREEN | BIT_ORANGE | BIT_DPAD_LEFT, actionChord("Next Workbook Window", "ctrl", "f6", { category: "Workbook" })],
  [BIT_GREEN | BIT_ORANGE | BIT_DPAD_RIGHT, actionChord("Minimize Workbook", "ctrl", "f9", { category: "Workbook" })],

  [BIT_RED | BIT_YELLOW, actionChord("Unhide Rows", "ctrl", "shift", "9", { category: "Structure" })],
  [BIT_RED | BIT_YELLOW | BIT_STRUM_DOWN, actionChord("Unhide Columns", "ctrl", "shift", "0", { category: "Structure" })],
  [BIT_RED | BIT_YELLOW | BIT_STRUM_UP, actionChord("Group Rows/Cols", "alt", "shift", "right", { category: "Structure" })],
  [BIT_RED | BIT_YELLOW | BIT_DPAD_LEFT, actionChord("Ungroup Rows/Cols", "alt", "shift", "left", { category: "Structure" })],
  [BIT_RED | BIT_YELLOW | BIT_DPAD_RIGHT, actionChord("Select Visible Cells Only", "alt", ";", { category: "Selection" })],

  [BIT_RED | BIT_BLUE, actionText("Insert =VLOOKUP(", "=VLOOKUP(", { category: "Formulas" })],
  [BIT_RED | BIT_BLUE | BIT_STRUM_DOWN, actionText("Insert =INDEX(", "=INDEX(", { category: "Formulas" })],
  [BIT_RED | BIT_BLUE | BIT_STRUM_UP, actionText("Insert =MATCH(", "=MATCH(", { category: "Formulas" })],
  [BIT_RED | BIT_BLUE | BIT_DPAD_LEFT, actionText("Insert =IFERROR(", "=IFERROR(", { category: "Formulas" })],
  [BIT_RED | BIT_BLUE | BIT_DPAD_RIGHT, actionText("Insert =IFS(", "=IFS(", { category: "Formulas" })],

  [BIT_RED | BIT_ORANGE, actionRibbon("Remove Duplicates", "a", "m", { requiresRiff: true })],
  [BIT_RED | BIT_ORANGE | BIT_STRUM_DOWN, actionRibbon("Text to Columns", "a", "e")],
  [BIT_RED | BIT_ORANGE | BIT_STRUM_UP, actionRibbon("Data Validation", "a", "v", "v")],
  [BIT_RED | BIT_ORANGE | BIT_DPAD_LEFT, actionRibbon("Clear All Filters", "a", "c")],
  [BIT_RED | BIT_ORANGE | BIT_DPAD_RIGHT, actionChord("Reapply Filter", "ctrl", "alt", "l", { category: "Data" })],

  [BIT_YELLOW | BIT_BLUE, actionText("Insert =UNIQUE(", "=UNIQUE(", { category: "Formulas" })],
  [BIT_YELLOW | BIT_BLUE | BIT_STRUM_DOWN, actionText("Insert =SORT(", "=SORT(", { category: "Formulas" })],
  [BIT_YELLOW | BIT_BLUE | BIT_STRUM_UP, actionText("Insert =FILTER(", "=FILTER(", { category: "Formulas" })],
  [BIT_YELLOW | BIT_BLUE | BIT_DPAD_LEFT, actionText("Insert =LET(", "=LET(", { category: "Formulas" })],
  [BIT_YELLOW | BIT_BLUE | BIT_DPAD_RIGHT, actionText("Insert =LAMBDA(", "=LAMBDA(", { category: "Formulas", requiresRiff: true })],

  [BIT_YELLOW | BIT_ORANGE, actionRibbon("Conditional Formatting", "h", "l")],
  [BIT_YELLOW | BIT_ORANGE | BIT_STRUM_DOWN, actionRibbon("Format as Table", "h", "t")],
  [BIT_YELLOW | BIT_ORANGE | BIT_STRUM_UP, actionRibbon("Cell Styles", "h", "j")],
  [BIT_YELLOW | BIT_ORANGE | BIT_DPAD_LEFT, actionRibbon("Increase Decimal", "h", "0")],
  [BIT_YELLOW | BIT_ORANGE | BIT_DPAD_RIGHT, actionRibbon("Decrease Decimal", "h", "9")],

  [BIT_BLUE | BIT_ORANGE, actionChord("Paste Names Into Formula", "ctrl", "shift", "f3", { category: "Formulas" })],
  [BIT_BLUE | BIT_ORANGE | BIT_STRUM_DOWN, actionChord("Evaluate Active Sheet (Shift+F9)", "shift", "f9", { category: "Formulas" })],
  [BIT_BLUE | BIT_ORANGE | BIT_STRUM_UP, actionChord("Full Recalculate All", "ctrl", "alt", "f9", { category: "Formulas" })],
  [BIT_BLUE | BIT_ORANGE | BIT_DPAD_LEFT, actionChord("Select Direct Precedents", "ctrl", "[", { category: "Auditing" })],
  [BIT_BLUE | BIT_ORANGE | BIT_DPAD_RIGHT, actionChord("Select Direct Dependents", "ctrl", "]", { category: "Auditing" })],

  // --- 3-Fret, 4-Fret & 5-Fret Power Chords ---
  [BIT_GREEN | BIT_RED | BIT_YELLOW, actionChord("Apply Outline Border", "ctrl", "shift", "7", { category: "Formatting" })],
  [BIT_GREEN | BIT_RED | BIT_BLUE, actionChord("Remove Borders", "ctrl", "shift", "-", { category: "Formatting" })],
  [BIT_GREEN | BIT_RED | BIT_ORANGE, actionChord("Time Format (@)", "ctrl", "shift", "2", { category: "Number Format" })],
  [BIT_GREEN | BIT_YELLOW | BIT_BLUE, actionChord("Scientific Format (^)", "ctrl", "shift", "6", { category: "Number Format" })],
  [BIT_GREEN | BIT_YELLOW | BIT_ORANGE, actionChord("Scroll Screen Left", "alt", "pageup", { category: "Navigation" })],
  [BIT_GREEN | BIT_BLUE | BIT_ORANGE, actionChord("Scroll Screen Right", "alt", "pagedown", { category: "Navigation" })],
  [BIT_RED | BIT_YELLOW | BIT_BLUE, actionChord("Toggle Ribbon Collapse", "ctrl", "f1", { category: "View" })],
  [BIT_RED | BIT_YELLOW | BIT_ORANGE, actionChord("Toggle Full Screen", "ctrl", "shift", "f1", { category: "View" })],
  [BIT_RED | BIT_BLUE | BIT_ORANGE, actionRibbon("Split Window Panes", "w", "s")],
  [BIT_YELLOW | BIT_BLUE | BIT_ORANGE, actionChord("Macro Dialog (Alt+F8)", "alt", "f8", { category: "Developer", requiresRiff: true })],

  [BIT_GREEN | BIT_RED | BIT_YELLOW | BIT_BLUE, actionRibbon("Goal Seek", "a", "w", "g", { requiresRiff: true })],
  [BIT_GREEN | BIT_RED | BIT_YELLOW | BIT_ORANGE, actionRibbon("Rename Active Sheet", "h", "o", "r")],
  [BIT_GREEN | BIT_RED | BIT_BLUE | BIT_ORANGE, actionRibbon("AutoFit Row Height", "h", "o", "a")],
  [BIT_GREEN | BIT_YELLOW | BIT_BLUE | BIT_ORANGE, actionRibbon("Page Layout View", "w", "p")],
  [BIT_RED | BIT_YELLOW | BIT_BLUE | BIT_ORANGE, actionRibbon("Normal View", "w", "l")],
  [BIT_GREEN | BIT_RED | BIT_YELLOW | BIT_BLUE | BIT_ORANGE, actionRibbon("Toggle Gridlines", "w", "v", "g")],
]);

const ALL_EXCEL_FUNCTIONS = [
  "ABS", "ACOS", "ACOSH", "ACOT", "ACOTH", "AGGREGATE", "ARABIC", "ASIN", "ASINH",
  "ATAN", "ATAN2", "ATANH", "BASE", "CEILING.MATH", "CEILING.PRECISE", "COMBIN",
  "COMBINA", "COS", "COSH", "COT", "COTH", "CSC", "CSCH", "DECIMAL", "DEGREES",
  "EVEN", "EXP", "FACT", "FACTDOUBLE", "FLOOR.MATH", "FLOOR.PRECISE", "GCD", "INT",
  "ISO.CEILING", "LCM", "LN", "LOG", "LOG10", "MDETERM", "MINVERSE", "MMULT", "MOD",
  "MROUND", "MULTINOMIAL", "MUNIT", "ODD", "PI", "POWER", "PRODUCT", "QUOTIENT",
  "RADIANS", "RAND", "RANDARRAY", "RANDBETWEEN", "ROMAN", "ROUND", "ROUNDDOWN",
  "ROUNDUP", "SEC", "SECH", "SERIESSUM", "SEQUENCE", "SIGN", "SIN", "SINH", "SQRT",
  "SQRTPI", "SUBTOTAL", "SUM", "SUMIF", "SUMIFS", "SUMPRODUCT", "SUMSQ", "SUMX2MY2",
  "SUMX2PY2", "SUMXMY2", "TAN", "TANH", "TRUNC",
  "AVEDEV", "AVERAGE", "AVERAGEA", "AVERAGEIF", "AVERAGEIFS", "BETA.DIST", "BETA.INV",
  "BINOM.DIST", "BINOM.DIST.RANGE", "BINOM.INV", "CHISQ.DIST", "CHISQ.DIST.RT",
  "CHISQ.INV", "CHISQ.TEST", "CONFIDENCE.NORM", "CONFIDENCE.T", "CORREL", "COUNT",
  "COUNTA", "COUNTBLANK", "COUNTIF", "COUNTIFS", "COVARIANCE.P", "COVARIANCE.S",
  "DEVSQ", "EXPON.DIST", "F.DIST", "F.INV", "F.TEST", "FISHER", "FISHERINV",
  "FORECAST.ETS", "FORECAST.LINEAR", "FREQUENCY", "GAMMA", "GAMMA.DIST", "GAMMA.INV",
  "GAMMALN", "GEOMEAN", "GROWTH", "HARMEAN", "HYPGEOM.DIST", "INTERCEPT", "KURT",
  "LARGE", "LINEST", "LOGEST", "LOGNORM.DIST", "LOGNORM.INV", "MAX", "MAXA", "MAXIFS",
  "MEDIAN", "MIN", "MINA", "MINIFS", "MODE.MULT", "MODE.SNGL", "NEGBINOM.DIST",
  "NORM.DIST", "NORM.INV", "NORM.S.DIST", "NORM.S.INV", "PEARSON", "PERCENTILE.EXC",
  "PERCENTILE.INC", "PERCENTRANK.EXC", "PERCENTRANK.INC", "PERMUT", "PERMUTATIONA",
  "PHI", "POISSON.DIST", "PROB", "QUARTILE.EXC", "QUARTILE.INC", "RANK.AVG", "RANK.EQ",
  "RSQ", "SKEW", "SKEW.P", "SLOPE", "SMALL", "STANDARDIZE", "STDEV.P", "STDEV.S",
  "STDEVA", "STDEVPA", "STEYX", "T.DIST", "T.DIST.2T", "T.DIST.RT", "T.INV",
  "T.INV.2T", "T.TEST", "TREND", "TRIMMEAN", "VAR.P", "VAR.S", "VARA", "VARPA",
  "WEIBULL.DIST", "Z.TEST",
  "ADDRESS", "AREAS", "BYCOL", "BYROW", "CHOOSE", "CHOOSECOLS", "CHOOSEROWS",
  "COLUMN", "COLUMNS", "DROP", "EXPAND", "FILTER", "FORMULATEXT", "GETPIVOTDATA",
  "HLOOKUP", "HSTACK", "HYPERLINK", "INDEX", "INDIRECT", "LOOKUP", "MAKEARRAY",
  "MAP", "MATCH", "OFFSET", "REDUCE", "ROW", "ROWS", "SCAN", "SORT", "SORTBY",
  "TAKE", "TOCOL", "TOROW", "TRANSPOSE", "UNIQUE", "VLOOKUP", "VSTACK", "WRAPCOLS",
  "WRAPROWS", "XLOOKUP", "XMATCH",
  "AND", "FALSE", "IF", "IFERROR", "IFNA", "IFS", "LAMBDA", "LET", "NOT", "OR",
  "SWITCH", "TRUE", "XOR",
  "ARRAYTOTEXT", "ASC", "CHAR", "CLEAN", "CODE", "CONCAT", "DOLLAR", "EXACT",
  "FIND", "FIXED", "LEFT", "LEN", "LOWER", "MID", "NUMBERVALUE", "PROPER",
  "REGEXEXTRACT", "REGEXREPLACE", "REGEXTEST", "REPLACE", "REPT", "RIGHT", "SEARCH",
  "SUBSTITUTE", "T", "TEXT", "TEXTAFTER", "TEXTBEFORE", "TEXTJOIN", "TEXTSPLIT",
  "TRIM", "UNICHAR", "UNICODE", "UPPER", "VALUE", "VALUETOTEXT",
  "DATE", "DATEDIF", "DATEVALUE", "DAY", "DAYS", "DAYS360", "EDATE", "EOMONTH",
  "HOUR", "ISOWEEKNUM", "MINUTE", "MONTH", "NETWORKDAYS", "NETWORKDAYS.INTL", "NOW",
  "SECOND", "TIME", "TIMEVALUE", "TODAY", "WEEKDAY", "WEEKNUM", "WORKDAY",
  "WORKDAY.INTL", "YEAR", "YEARFRAC",
  "ACCRINT", "AMORDEGRC", "COUPDAYS", "CUMIPMT", "CUMPRINC", "DB", "DDB", "DISC",
  "DOLLARDE", "DOLLARFR", "DURATION", "EFFECT", "FV", "FVSCHEDULE", "INTRATE",
  "IPMT", "IRR", "ISPMT", "MDURATION", "MIRR", "NOMINAL", "NPER", "NPV", "PDURATION",
  "PMT", "PPMT", "PRICE", "PV", "RATE", "RECEIVED", "RRI", "SLN", "SYD", "TBILLEQ",
  "TBILLPRICE", "VDB", "XIRR", "XNPV", "YIELD",
  "CELL", "ERROR.TYPE", "INFO", "ISBLANK", "ISERR", "ISERROR", "ISEVEN", "ISFORMULA",
  "ISLOGICAL", "ISNA", "ISNONTEXT", "ISNUMBER", "ISODD", "ISOMITTED", "ISREF",
  "ISTEXT", "N", "NA", "SHEET", "SHEETS", "TYPE",
  "BIN2DEC", "BIN2HEX", "BIN2OCT", "BITAND", "BITLSHIFT", "BITOR", "BITRSHIFT",
  "BITXOR", "COMPLEX", "CONVERT", "DEC2BIN", "DEC2HEX", "DEC2OCT", "DELTA", "ERF",
  "GESTEP", "HEX2BIN", "HEX2DEC", "HEX2OCT", "IMABS", "IMAGINARY", "IMCONJUGATE",
  "IMDIV", "IMEXP", "IMLN", "IMLOG10", "IMPOWER", "IMPRODUCT", "IMREAL", "IMSQRT",
  "IMSUB", "IMSUM", "OCT2BIN", "OCT2DEC", "OCT2HEX",
  "DAVERAGE", "DCOUNT", "DCOUNTA", "DGET", "DMAX", "DMIN", "DPRODUCT", "DSTDEV",
  "DSUM", "DVAR",
];

const RIBBON_KEYTIPS = [
  ["Align Left", ["h", "a", "l"]],
  ["Align Right", ["h", "a", "r"]],
  ["Align Top", ["h", "a", "t"]],
  ["Align Middle", ["h", "a", "m"]],
  ["Align Bottom", ["h", "a", "b"]],
  ["Increase Font Size", ["h", "f", "g"]],
  ["Decrease Font Size", ["h", "f", "k"]],
  ["Fill Color Menu", ["h", "h"]],
  ["Font Color Menu", ["h", "f", "c"]],
  ["Bottom Border", ["h", "b", "o"]],
  ["Top Border", ["h", "b", "p"]],
  ["Left Border", ["h", "b", "l"]],
  ["Right Border", ["h", "b", "r"]],
  ["No Border", ["h", "b", "n"]],
  ["Thick Outside Borders", ["h", "b", "t"]],
  ["Top & Bottom Border", ["h", "b", "d"]],
  ["Top & Double Bottom Border", ["h", "b", "u"]],
  ["Format Painter", ["h", "f", "p"]],
  ["Clear All (Formats+Contents)", ["h", "e", "a"]],
  ["Clear Formats Only", ["h", "e", "f"]],
  ["Clear Contents Only", ["h", "e", "c"]],
  ["Clear Comments/Notes", ["h", "e", "m"]],
  ["Clear Hyperlinks", ["h", "e", "l"]],
  ["Merge Across", ["h", "m", "a"]],
  ["Merge Cells", ["h", "m", "m"]],
  ["Unmerge Cells", ["h", "m", "u"]],
  ["Increase Indent", ["h", "6"]],
  ["Decrease Indent", ["h", "5"]],
  ["Comma Style", ["h", "k"]],
  ["Accounting Number Format", ["h", "a", "n"]],
  ["Short Date Format", ["h", "n", "s"]],
  ["Long Date Format", ["h", "n", "l"]],
  ["Text Format", ["h", "n", "t"]],
  ["Insert Sheet Rows", ["h", "i", "r"]],
  ["Insert Sheet Columns", ["h", "i", "c"]],
  ["Delete Sheet Rows", ["h", "d", "r"]],
  ["Delete Sheet Columns", ["h", "d", "c"]],
  ["Delete Active Sheet", ["h", "d", "s"], true],
  ["Set Row Height", ["h", "o", "h"]],
  ["Set Column Width", ["h", "o", "w"]],
  ["Hide Rows (Ribbon)", ["h", "o", "u", "r"]],
  ["Unhide Rows (Ribbon)", ["h", "o", "u", "o"]],
  ["Hide Columns (Ribbon)", ["h", "o", "u", "c"]],
  ["Unhide Columns (Ribbon)", ["h", "o", "u", "l"]],
  ["Protect Sheet", ["h", "o", "p"]],
  ["Lock Cell", ["h", "o", "l"]],
  ["Tab Color", ["h", "o", "t"]],
  ["Move or Copy Sheet", ["h", "o", "m"]],
  ["Insert Recommended PivotTable", ["n", "s", "p"]],
  ["Insert Recommended Charts", ["n", "r"]],
  ["Insert Column/Bar Chart", ["n", "c", "1"]],
  ["Insert Line Chart", ["n", "n", "1"]],
  ["Insert Pie Chart", ["n", "q"]],
  ["Insert Scatter Chart", ["n", "d"]],
  ["Insert Line Sparkline", ["n", "s", "l"]],
  ["Insert Column Sparkline", ["n", "s", "o"]],
  ["Insert Win/Loss Sparkline", ["n", "s", "w"]],
  ["Insert Slicer", ["n", "s", "f"]],
  ["Insert Timeline", ["n", "m", "t"]],
  ["Page Margins", ["p", "m"]],
  ["Page Orientation", ["p", "o"]],
  ["Page Size", ["p", "s", "z"]],
  ["Set Print Area", ["p", "r", "s"]],
  ["Clear Print Area", ["p", "r", "c"]],
  ["Insert Page Break", ["p", "b", "i"]],
  ["Print Titles", ["p", "i"]],
  ["Fit Sheet on One Page (Width)", ["p", "w"]],
  ["Fit Sheet on One Page (Height)", ["p", "h"]],
  ["Insert Function Wizard", ["m", "f"]],
  ["Define Name", ["m", "m", "d"]],
  ["Create Names from Selection", ["m", "c"]],
  ["Trace Dependents", ["m", "d"]],
  ["Show Formulas (Ribbon)", ["m", "h"]],
  ["Error Checking", ["m", "k"]],
  ["Evaluate Formula", ["m", "v"]],
  ["Watch Window", ["m", "w"]],
  ["Calculation Options", ["m", "x"]],
  ["Calculate Now (Ribbon)", ["m", "n"]],
  ["Calculate Sheet (Ribbon)", ["m", "j"]],
  ["Get Data / Power Query", ["a", "p", "n"]],
  ["Queries & Connections", ["a", "o"]],
  ["Custom Sort Dialog", ["a", "s", "s"]],
  ["Advanced Filter", ["a", "q"]],
  ["Flash Fill (Ribbon)", ["a", "f", "f"]],
  ["Consolidate Data", ["a", "n"]],
  ["Scenario Manager", ["a", "w", "s"]],
  ["Data Table (What-If)", ["a", "w", "t"]],
  ["Forecast Sheet", ["a", "f", "c"]],
  ["Subtotal Dialog", ["a", "b"]],
  ["Show Detail", ["a", "j"]],
  ["Hide Detail", ["a", "h"]],
  ["Thesaurus", ["r", "e"]],
  ["Workbook Statistics", ["r", "w", "s"]],
  ["Check Accessibility", ["r", "a", "1"]],
  ["New Comment", ["r", "c"]],
  ["Show All Comments", ["r", "a", "c"]],
  ["Protect Workbook", ["r", "p", "w"]],
  ["Page Break Preview", ["w", "i"]],
  ["Custom Views", ["w", "c", "v"]],
  ["Show/Hide Formula Bar", ["w", "v", "f"]],
  ["Show/Hide Headings", ["w", "v", "h"]],
  ["Zoom Dialog", ["w", "q"]],
  ["Zoom to 100%", ["w", "j"]],
  ["Zoom to Selection", ["w", "g"]],
  ["New Window", ["w", "n"]],
  ["Arrange All Windows", ["w", "a"]],
  ["Freeze Top Row", ["w", "f", "r"]],
  ["Freeze First Column", ["w", "f", "c"]],
  ["Unfreeze Panes", ["w", "f", "f"]],
  ["Hide Window", ["w", "h"]],
  ["View Side by Side", ["w", "b"]],
  ["Switch Windows", ["w", "w"]],
  ["Record Macro", ["l", "r"]],
];

const COUNTED_MOTIONS = [
  ["Move Up", ["up"]],
  ["Move Down", ["down"]],
  ["Move Left", ["left"]],
  ["Move Right", ["right"]],
  ["Select Up", ["shift", "up"]],
  ["Select Down", ["shift", "down"]],
  ["Select Left", ["shift", "left"]],
  ["Select Right", ["shift", "right"]],
  ["Jump Edge Up", ["ctrl", "up"]],
  ["Jump Edge Down", ["ctrl", "down"]],
  ["Jump Edge Left", ["ctrl", "left"]],
  ["Jump Edge Right", ["ctrl", "right"]],
  ["Select Edge Up", ["ctrl", "shift", "up"]],
  ["Select Edge Down", ["ctrl", "shift", "down"]],
  ["Select Edge Left", ["ctrl", "shift", "left"]],
  ["Select Edge Right", ["ctrl", "shift", "right"]],
  ["Tab Right", ["tab"]],
  ["Tab Left", ["shift", "tab"]],
  ["Page Up", ["pageup"]],
  ["Page Down", ["pagedown"]],
];

const EXCEL_COLS = [
  ...Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i)),
  ...Array.from({ length: 26 }, (_, i) => "A" + String.fromCharCode(65 + i)),
];

const EXCEL_RANGES = [
  "A1:A10", "A1:A20", "A1:A50", "A1:A100", "A2:A10", "A2:A25", "A2:A50", "A2:A100",
  "B1:B10", "B1:B20", "B1:B50", "B1:B100", "B2:B10", "B2:B25", "B2:B50", "B2:B100",
  "C1:C10", "C1:C20", "C1:C50", "C1:C100", "C2:C10", "C2:C25", "C2:C50", "C2:C100",
  "D1:D10", "D1:D20", "D1:D50", "D1:D100", "D2:D10", "D2:D25", "D2:D50", "D2:D100",
  "E1:E10", "E1:E20", "E1:E50", "E1:E100", "E2:E10", "E2:E25", "E2:E50", "E2:E100",
  "F1:F10", "F1:F20", "F1:F50", "F1:F100", "F2:F10", "F2:F25", "F2:F50", "F2:F100",
  "G1:G10", "G1:G20", "G1:G50", "G1:G100", "H1:H10", "H1:H20", "H1:H50", "H1:H100",
  "I1:I10", "I1:I20", "I1:I50", "I1:I100", "J1:J10", "J1:J20", "J1:J50", "J1:J100",
  "K1:K10", "K1:K20", "L1:L10", "L1:L20", "M1:M10", "M1:M20", "N1:N10", "N1:N20",
  "A1:B10", "A1:B20", "A1:B50", "A1:B100", "A1:C10", "A1:C20", "A1:C50", "A1:C100",
  "A1:D10", "A1:D20", "A1:D50", "A1:D100", "A1:E10", "A1:E20", "A1:E50", "A1:E100",
  "A1:F10", "A1:F20", "A1:F50", "A1:F100", "A1:G10", "A1:H10", "A1:J10", "A1:Z10",
  "A2:B10", "A2:B25", "A2:B50", "A2:B100", "A2:C10", "A2:C25", "A2:C50", "A2:C100",
  "A2:D10", "A2:D25", "A2:D50", "A2:D100", "A2:E10", "A2:E25", "A2:E50", "A2:E100",
  "B2:C10", "B2:C25", "B2:C50", "B2:C100", "B2:D10", "B2:D25", "B2:D50", "B2:D100",
  "B2:E10", "B2:E25", "B2:E50", "B2:E100", "B2:F10", "B2:F25", "B2:F50", "B2:F100",
  "C2:D10", "C2:D25", "C2:D50", "C2:D100", "C2:E10", "C2:E25", "C2:E50", "C2:E100",
  "A:A", "B:B", "C:C", "D:D", "E:E", "F:F", "G:G", "H:H",
  "I:I", "J:J", "K:K", "L:L", "M:M", "N:N", "O:O", "P:P",
  "1:1", "2:2", "3:3", "4:4", "5:5", "6:6", "7:7", "8:8",
  "9:9", "10:10", "A1:Z100", "A2:Z100", "A1:D1000", "B2:E1000", "A1:J500", "A2:J500",
  "A1:A500", "B1:B500", "C1:C500", "D1:D500", "A1:A1000", "B1:B1000", "C1:C1000", "D1:D1000",
];

function buildProceduralPrefix() {
  const seen = new Set();
  for (const act of CURATED_EXCEL.values()) {
    const sig = canonicalSignature(act);
    if (seen.has(sig)) throw new Error(`Duplicate curated Excel signature: ${sig}`);
    seen.add(sig);
  }

  const items = [];
  for (const fn of ALL_EXCEL_FUNCTIONS) {
    const act = actionText(`Formula =${fn}(`, `=${fn}(`, { category: "Excel Functions" });
    const sig = canonicalSignature(act);
    if (!seen.has(sig)) {
      seen.add(sig);
      items.push(act);
    }
  }
  for (const [label, tips, requiresRiff = false] of RIBBON_KEYTIPS) {
    const act = actionRibbon(label, ...tips, { category: "Excel Ribbon", requiresRiff });
    const sig = canonicalSignature(act);
    if (!seen.has(sig)) {
      seen.add(sig);
      items.push(act);
    }
  }
  return items;
}

const PREFIX_ACTIONS = buildProceduralPrefix();
const COUNTED_MAX_REPS = 64;
const COUNTED_SLOTS = COUNTED_MOTIONS.length * COUNTED_MAX_REPS;
const GOTO_ROWS = 256;
const GOTO_SLOTS = EXCEL_COLS.length * GOTO_ROWS;

if (
  PREFIX_ACTIONS.length +
    COUNTED_SLOTS +
    GOTO_SLOTS +
    ALL_EXCEL_FUNCTIONS.length * EXCEL_RANGES.length <
  TOTAL_VALID_STATES - 1
) {
  throw new Error("Insufficient Excel permutation capacity");
}

export function resolveExcelAction(bitmask) {
  const m = normalizeBitmask(bitmask);
  if (m === 0) return null;
  const curated = CURATED_EXCEL.get(m);
  if (curated) return curated;

  const rank = rankBitmask(m) - 1;
  if (rank < PREFIX_ACTIONS.length) return PREFIX_ACTIONS[rank];

  let offset = rank - PREFIX_ACTIONS.length;
  if (offset < COUNTED_SLOTS) {
    const motionIdx = Math.floor(offset / COUNTED_MAX_REPS);
    const reps = (offset % COUNTED_MAX_REPS) + 2;
    const [label, keys] = COUNTED_MOTIONS[motionIdx];
    return makeAction(`${label} x${reps}`, [repeat(...keys, reps)], { category: "Counted Navigation" });
  }

  offset -= COUNTED_SLOTS;
  if (offset < GOTO_SLOTS) {
    const colIdx = Math.floor(offset / GOTO_ROWS);
    const rowNum = (offset % GOTO_ROWS) + 1;
    const cellRef = `${EXCEL_COLS[colIdx]}${rowNum}`;
    return actionGoto(`Go To ${cellRef}`, cellRef);
  }

  offset -= GOTO_SLOTS;
  const fnIdx = Math.floor(offset / EXCEL_RANGES.length);
  const rngIdx = offset % EXCEL_RANGES.length;
  if (fnIdx < ALL_EXCEL_FUNCTIONS.length) {
    const fn = ALL_EXCEL_FUNCTIONS[fnIdx];
    const rng = EXCEL_RANGES[rngIdx];
    return actionText(`=${fn}(${rng})`, `=${fn}(${rng})`, { category: "Range Formulas" });
  }

  const row = offset + 1;
  return actionGoto(`Go To A${row}`, `A${row}`);
}
