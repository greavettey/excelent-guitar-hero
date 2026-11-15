/**
 * Comprehensive Vim / Neovim keyboard mapping across all 55,295 X-Plorer bitmask permutations.
 */

import {
  actionChord,
  actionEx,
  actionText,
  canonicalSignature,
  chord,
  makeAction,
  text,
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

export const CURATED_VIM = new Map([
  // --- Basic Motions & Modes (No frets) ---
  [BIT_STRUM_UP, actionText("Move Up (k)", "k", { category: "Motion" })],
  [BIT_STRUM_DOWN, actionText("Move Down (j)", "j", { category: "Motion" })],
  [BIT_DPAD_LEFT, actionText("Move Left (h)", "h", { category: "Motion" })],
  [BIT_DPAD_RIGHT, actionText("Move Right (l)", "l", { category: "Motion" })],
  [BIT_START, actionChord("Confirm / Enter", "enter", { category: "Command", requiresStarPower: true })],
  [BIT_BACK, actionChord("Normal Mode (Esc)", "esc", { category: "Mode" })],
  [BIT_GUIDE, actionText("Insert Mode (i)", "i", { category: "Mode" })],

  // --- System Combos (No frets) ---
  [BIT_START | BIT_BACK, actionEx("Write File (:w)", ":w", { requiresStarPower: true })],
  [BIT_START | BIT_GUIDE, actionText("Undo (u)", "u", { category: "Edit" })],
  [BIT_BACK | BIT_GUIDE, actionChord("Redo (Ctrl+r)", "ctrl", "r", { category: "Edit" })],
  [BIT_START | BIT_BACK | BIT_GUIDE, actionEx("Write & Quit (:wq)", ":wq", { requiresStarPower: true })],

  [BIT_START | BIT_STRUM_UP, actionChord("Half Page Up (Ctrl+u)", "ctrl", "u", { category: "Scroll" })],
  [BIT_START | BIT_STRUM_DOWN, actionChord("Half Page Down (Ctrl+d)", "ctrl", "d", { category: "Scroll" })],
  [BIT_START | BIT_DPAD_LEFT, actionText("Previous Tab (gT)", "gT", { category: "Tabs" })],
  [BIT_START | BIT_DPAD_RIGHT, actionText("Next Tab (gt)", "gt", { category: "Tabs" })],

  [BIT_BACK | BIT_STRUM_UP, actionText("Top of File (gg)", "gg", { category: "Motion" })],
  [BIT_BACK | BIT_STRUM_DOWN, actionText("Bottom of File (G)", "G", { category: "Motion" })],
  [BIT_BACK | BIT_DPAD_LEFT, actionText("Start of Line (0)", "0", { category: "Motion" })],
  [BIT_BACK | BIT_DPAD_RIGHT, actionText("End of Line ($)", "$", { category: "Motion" })],

  [BIT_GUIDE | BIT_STRUM_UP, actionChord("Scroll Up 1 Line (Ctrl+y)", "ctrl", "y", { category: "Scroll" })],
  [BIT_GUIDE | BIT_STRUM_DOWN, actionChord("Scroll Down 1 Line (Ctrl+e)", "ctrl", "e", { category: "Scroll" })],
  [BIT_GUIDE | BIT_DPAD_LEFT, actionText("Previous Word (b)", "b", { category: "Motion" })],
  [BIT_GUIDE | BIT_DPAD_RIGHT, actionText("Next Word (w)", "w", { category: "Motion" })],

  // --- Green Fret: Yank, Put, Delete & Repeat ---
  [BIT_GREEN, actionText("Append After Cursor (a)", "a", { category: "Mode" })],
  [BIT_GREEN | BIT_STRUM_DOWN, actionText("Yank Line (yy)", "yy", { category: "Edit" })],
  [BIT_GREEN | BIT_STRUM_UP, actionText("Put After (p)", "p", { category: "Edit" })],
  [BIT_GREEN | BIT_DPAD_LEFT, actionText("Delete Line (dd)", "dd", { category: "Edit" })],
  [BIT_GREEN | BIT_DPAD_RIGHT, actionText("Delete Char (x)", "x", { category: "Edit" })],
  [BIT_GREEN | BIT_START, actionText("Put Before (P)", "P", { category: "Edit" })],
  [BIT_GREEN | BIT_BACK, actionText("Repeat Last Change (.)", ".", { category: "Edit" })],
  [BIT_GREEN | BIT_GUIDE, actionText("Join Lines (J)", "J", { category: "Edit" })],
  [BIT_GREEN | whammyBits(1), actionText('Yank to System Clipboard ("+yy)', '"+yy', { category: "Clipboard" })],
  [BIT_GREEN | whammyBits(2), actionText('Put from System Clipboard ("+p)', '"+p', { category: "Clipboard" })],
  [BIT_GREEN | tiltBits(1), actionText("Center Cursor Line (zz)", "zz", { category: "Scroll" })],
  [BIT_GREEN | tiltBits(2), actionText("Cursor Line to Top (zt)", "zt", { category: "Scroll" })],

  // --- Red Fret: Visual Modes & Deletion ---
  [BIT_RED, actionText("Visual Mode (v)", "v", { category: "Mode" })],
  [BIT_RED | BIT_STRUM_DOWN, actionText("Visual Line Mode (V)", "V", { category: "Mode" })],
  [BIT_RED | BIT_STRUM_UP, actionChord("Visual Block Mode (Ctrl+v)", "ctrl", "v", { category: "Mode" })],
  [BIT_RED | BIT_DPAD_LEFT, actionText("Delete Word Back (db)", "db", { category: "Edit" })],
  [BIT_RED | BIT_DPAD_RIGHT, actionText("Delete Word Forward (dw)", "dw", { category: "Edit" })],
  [BIT_RED | BIT_START, actionText("Delete to End of Line (D)", "D", { category: "Edit" })],
  [BIT_RED | BIT_BACK, actionText("Change to End of Line (C)", "C", { category: "Edit" })],
  [BIT_RED | BIT_GUIDE, actionText("Select Entire File (ggVG)", "ggVG", { category: "Visual", requiresRiff: true })],
  [BIT_RED | whammyBits(1), actionText("Reselect Last Visual (gv)", "gv", { category: "Visual" })],
  [BIT_RED | tiltBits(1), actionText("Delete Inner Word (diw)", "diw", { category: "Text Object" })],
  [BIT_RED | tiltBits(2), actionText("Change Inner Word (ciw)", "ciw", { category: "Text Object" })],

  // --- Yellow Fret: Insert Variants, Indent, Case & Folds ---
  [BIT_YELLOW, actionText("Open Line Below (o)", "o", { category: "Mode" })],
  [BIT_YELLOW | BIT_STRUM_DOWN, actionText("Open Line Above (O)", "O", { category: "Mode" })],
  [BIT_YELLOW | BIT_STRUM_UP, actionText("Insert at First Non-Blank (I)", "I", { category: "Mode" })],
  [BIT_YELLOW | BIT_DPAD_LEFT, actionText("Append at End of Line (A)", "A", { category: "Mode" })],
  [BIT_YELLOW | BIT_DPAD_RIGHT, actionText("Auto-Indent Line (==)", "==", { category: "Format" })],
  [BIT_YELLOW | BIT_START, actionText("Indent Line (>>)", ">>", { category: "Format" })],
  [BIT_YELLOW | BIT_BACK, actionText("Unindent Line (<<)", "<<", { category: "Format" })],
  [BIT_YELLOW | BIT_GUIDE, actionText("Toggle Case Under Cursor (~)", "~", { category: "Format" })],
  [BIT_YELLOW | whammyBits(1), actionText("Toggle Fold (za)", "za", { category: "Folds" })],
  [BIT_YELLOW | whammyBits(2), actionText("Close All Folds (zM)", "zM", { category: "Folds" })],
  [BIT_YELLOW | whammyBits(3), actionText("Open All Folds (zR)", "zR", { category: "Folds" })],
  [BIT_YELLOW | tiltBits(1), actionText("Lowercase Inner Word (guiw)", "guiw", { category: "Format" })],
  [BIT_YELLOW | tiltBits(2), actionText("Uppercase Inner Word (gUiw)", "gUiw", { category: "Format" })],

  // --- Blue Fret: Search, Jumps & Matching ---
  [BIT_BLUE, actionText("Search Forward (/)", "/", { category: "Search" })],
  [BIT_BLUE | BIT_STRUM_DOWN, actionText("Next Match (n)", "n", { category: "Search" })],
  [BIT_BLUE | BIT_STRUM_UP, actionText("Previous Match (N)", "N", { category: "Search" })],
  [BIT_BLUE | BIT_DPAD_LEFT, actionText("Search Backward (?)", "?", { category: "Search" })],
  [BIT_BLUE | BIT_DPAD_RIGHT, actionText("Search Word Forward (*)", "*", { category: "Search" })],
  [BIT_BLUE | BIT_START, actionText("Search Word Backward (#)", "#", { category: "Search" })],
  [BIT_BLUE | BIT_BACK, actionEx("Clear Search Highlight (:noh)", ":noh")],
  [BIT_BLUE | BIT_GUIDE, actionText("Jump Matching Bracket (%)", "%", { category: "Motion" })],
  [BIT_BLUE | whammyBits(1), actionChord("Jump Back (Ctrl+o)", "ctrl", "o", { category: "Jumps" })],
  [BIT_BLUE | whammyBits(2), actionChord("Jump Forward (Ctrl+i)", "ctrl", "i", { category: "Jumps" })],
  [BIT_BLUE | tiltBits(1), actionText("Go To Definition (gd)", "gd", { category: "Code" })],
  [BIT_BLUE | tiltBits(2), actionText("Hover Docs (K)", "K", { category: "Code" })],

  // --- Orange Fret: Ex, Windows, Buffers & Tabs ---
  [BIT_ORANGE, actionText("Command Line (:)", ":", { category: "Command" })],
  [BIT_ORANGE | BIT_STRUM_DOWN, makeAction("Horizontal Split (Ctrl+w s)", [chord("ctrl", "w"), text("s")], { category: "Windows" })],
  [BIT_ORANGE | BIT_STRUM_UP, makeAction("Vertical Split (Ctrl+w v)", [chord("ctrl", "w"), text("v")], { category: "Windows" })],
  [BIT_ORANGE | BIT_DPAD_LEFT, makeAction("Focus Left Window (Ctrl+w h)", [chord("ctrl", "w"), text("h")], { category: "Windows" })],
  [BIT_ORANGE | BIT_DPAD_RIGHT, makeAction("Focus Right Window (Ctrl+w l)", [chord("ctrl", "w"), text("l")], { category: "Windows" })],
  [BIT_ORANGE | BIT_START, makeAction("Close Window (Ctrl+w c)", [chord("ctrl", "w"), text("c")], { category: "Windows" })],
  [BIT_ORANGE | BIT_BACK, actionEx("Quit Window (:q)", ":q")],
  [BIT_ORANGE | BIT_GUIDE, actionEx("Force Quit (:q!)", ":q!", { requiresRiff: true })],
  [BIT_ORANGE | whammyBits(1), actionEx("Next Buffer (:bn)", ":bn")],
  [BIT_ORANGE | whammyBits(2), actionEx("Previous Buffer (:bp)", ":bp")],
  [BIT_ORANGE | tiltBits(1), actionEx("New Tab (:tabnew)", ":tabnew")],
  [BIT_ORANGE | tiltBits(2), actionEx("Close Tab (:tabclose)", ":tabclose")],

  // --- 2-Fret Power Chords ---
  [BIT_GREEN | BIT_RED, actionText("First Non-Blank (^)", "^", { category: "Motion" })],
  [BIT_GREEN | BIT_RED | BIT_STRUM_DOWN, actionText("Next Word End (e)", "e", { category: "Motion" })],
  [BIT_GREEN | BIT_RED | BIT_STRUM_UP, actionText("Prev Word End (ge)", "ge", { category: "Motion" })],
  [BIT_GREEN | BIT_RED | BIT_DPAD_LEFT, actionText("Prev WORD (B)", "B", { category: "Motion" })],
  [BIT_GREEN | BIT_RED | BIT_DPAD_RIGHT, actionText("Next WORD (W)", "W", { category: "Motion" })],

  [BIT_GREEN | BIT_YELLOW, actionText("Yank Inner Word (yiw)", "yiw", { category: "Text Object" })],
  [BIT_GREEN | BIT_YELLOW | BIT_STRUM_DOWN, actionText("Yank Inner Paragraph (yip)", "yip", { category: "Text Object" })],
  [BIT_GREEN | BIT_YELLOW | BIT_STRUM_UP, actionText("Delete Inner Paragraph (dip)", "dip", { category: "Text Object" })],
  [BIT_GREEN | BIT_YELLOW | BIT_DPAD_LEFT, actionText("Change Inner Paragraph (cip)", "cip", { category: "Text Object" })],
  [BIT_GREEN | BIT_YELLOW | BIT_DPAD_RIGHT, actionText("Select Inner Paragraph (vip)", "vip", { category: "Text Object" })],

  [BIT_GREEN | BIT_BLUE, actionText('Delete Inside Quotes (di")', 'di"', { category: "Text Object" })],
  [BIT_GREEN | BIT_BLUE | BIT_STRUM_DOWN, actionText('Change Inside Quotes (ci")', 'ci"', { category: "Text Object" })],
  [BIT_GREEN | BIT_BLUE | BIT_STRUM_UP, actionText("Delete Inside Parens (di()", "di(", { category: "Text Object" })],
  [BIT_GREEN | BIT_BLUE | BIT_DPAD_LEFT, actionText("Change Inside Parens (ci()", "ci(", { category: "Text Object" })],
  [BIT_GREEN | BIT_BLUE | BIT_DPAD_RIGHT, actionText("Change Inside Braces (ci{)", "ci{", { category: "Text Object" })],

  [BIT_GREEN | BIT_ORANGE, actionText("Record Macro q (qq)", "qq", { category: "Macros" })],
  [BIT_GREEN | BIT_ORANGE | BIT_STRUM_DOWN, actionText("Run Macro q (@q)", "@q", { category: "Macros" })],
  [BIT_GREEN | BIT_ORANGE | BIT_STRUM_UP, actionText("Repeat Last Macro (@@)", "@@", { category: "Macros" })],
  [BIT_GREEN | BIT_ORANGE | BIT_DPAD_LEFT, actionText("Set Mark m (mm)", "mm", { category: "Marks" })],
  [BIT_GREEN | BIT_ORANGE | BIT_DPAD_RIGHT, actionText("Jump Mark m ('m)", "'m", { category: "Marks" })],

  [BIT_RED | BIT_YELLOW, actionText("Substitute Line (S)", "S", { category: "Edit" })],
  [BIT_RED | BIT_YELLOW | BIT_STRUM_DOWN, actionText("Substitute Char (s)", "s", { category: "Edit" })],
  [BIT_RED | BIT_YELLOW | BIT_STRUM_UP, actionText("Replace Mode (R)", "R", { category: "Mode" })],
  [BIT_RED | BIT_YELLOW | BIT_DPAD_LEFT, actionText("Delete Char Before (X)", "X", { category: "Edit" })],
  [BIT_RED | BIT_YELLOW | BIT_DPAD_RIGHT, actionText('Delete Without Yank ("_dd)', '"_dd', { category: "Edit" })],

  [BIT_RED | BIT_BLUE, actionText("Previous Paragraph ({)", "{", { category: "Motion" })],
  [BIT_RED | BIT_BLUE | BIT_STRUM_DOWN, actionText("Next Paragraph (})", "}", { category: "Motion" })],
  [BIT_RED | BIT_BLUE | BIT_STRUM_UP, actionText("Screen Top (H)", "H", { category: "Motion" })],
  [BIT_RED | BIT_BLUE | BIT_DPAD_LEFT, actionText("Screen Middle (M)", "M", { category: "Motion" })],
  [BIT_RED | BIT_BLUE | BIT_DPAD_RIGHT, actionText("Screen Bottom (L)", "L", { category: "Motion" })],

  [BIT_RED | BIT_ORANGE, makeAction("Focus Down Window (Ctrl+w j)", [chord("ctrl", "w"), text("j")], { category: "Windows" })],
  [BIT_RED | BIT_ORANGE | BIT_STRUM_DOWN, makeAction("Focus Up Window (Ctrl+w k)", [chord("ctrl", "w"), text("k")], { category: "Windows" })],
  [BIT_RED | BIT_ORANGE | BIT_STRUM_UP, makeAction("Only This Window (Ctrl+w o)", [chord("ctrl", "w"), text("o")], { category: "Windows" })],
  [BIT_RED | BIT_ORANGE | BIT_DPAD_LEFT, makeAction("Equalize Windows (Ctrl+w =)", [chord("ctrl", "w"), text("=")], { category: "Windows" })],
  [BIT_RED | BIT_ORANGE | BIT_DPAD_RIGHT, makeAction("Cycle Windows (Ctrl+w w)", [chord("ctrl", "w"), text("w")], { category: "Windows" })],

  [BIT_YELLOW | BIT_BLUE, actionText("Repeat Last f/t Forward (;)", ";", { category: "Motion" })],
  [BIT_YELLOW | BIT_BLUE | BIT_STRUM_DOWN, actionText("Repeat Last f/t Backward (,)", ",", { category: "Motion" })],
  [BIT_YELLOW | BIT_BLUE | BIT_STRUM_UP, actionText("Next Diagnostic (]d)", "]d", { category: "Code" })],
  [BIT_YELLOW | BIT_BLUE | BIT_DPAD_LEFT, actionText("Prev Diagnostic ([d)", "[d", { category: "Code" })],
  [BIT_YELLOW | BIT_BLUE | BIT_DPAD_RIGHT, actionText("Next Git Hunk (]c)", "]c", { category: "Diff" })],

  [BIT_YELLOW | BIT_ORANGE, actionEx("Toggle Line Numbers (:set nu!)", ":set nu!")],
  [BIT_YELLOW | BIT_ORANGE | BIT_STRUM_DOWN, actionEx("Toggle Relative Numbers (:set rnu!)", ":set rnu!")],
  [BIT_YELLOW | BIT_ORANGE | BIT_STRUM_UP, actionEx("Toggle Word Wrap (:set wrap!)", ":set wrap!")],
  [BIT_YELLOW | BIT_ORANGE | BIT_DPAD_LEFT, actionEx("Toggle Spell Check (:set spell!)", ":set spell!")],
  [BIT_YELLOW | BIT_ORANGE | BIT_DPAD_RIGHT, actionEx("Toggle Paste Mode (:set paste!)", ":set paste!")],

  [BIT_BLUE | BIT_ORANGE, actionEx("Open Quickfix (:copen)", ":copen")],
  [BIT_BLUE | BIT_ORANGE | BIT_STRUM_DOWN, actionEx("Next Quickfix (:cnext)", ":cnext")],
  [BIT_BLUE | BIT_ORANGE | BIT_STRUM_UP, actionEx("Prev Quickfix (:cprev)", ":cprev")],
  [BIT_BLUE | BIT_ORANGE | BIT_DPAD_LEFT, actionEx("List Buffers (:ls)", ":ls")],
  [BIT_BLUE | BIT_ORANGE | BIT_DPAD_RIGHT, actionEx("Delete Buffer (:bd)", ":bd", { requiresRiff: true })],

  // --- 3-Fret, 4-Fret & 5-Fret Power Chords ---
  [BIT_GREEN | BIT_RED | BIT_YELLOW, actionText("Delete Inside Brackets (di[)", "di[", { category: "Text Object" })],
  [BIT_GREEN | BIT_RED | BIT_BLUE, actionText("Change Inside Brackets (ci[)", "ci[", { category: "Text Object" })],
  [BIT_GREEN | BIT_RED | BIT_ORANGE, actionText("Delete Inside Tag (dit)", "dit", { category: "Text Object" })],
  [BIT_GREEN | BIT_YELLOW | BIT_BLUE, actionText("Change Inside Tag (cit)", "cit", { category: "Text Object" })],
  [BIT_GREEN | BIT_YELLOW | BIT_ORANGE, actionText("Delete Inside Single Quotes (di')", "di'", { category: "Text Object" })],
  [BIT_GREEN | BIT_BLUE | BIT_ORANGE, actionText("Change Inside Single Quotes (ci')", "ci'", { category: "Text Object" })],
  [BIT_RED | BIT_YELLOW | BIT_BLUE, actionChord("Increment Number (Ctrl+a)", "ctrl", "a", { category: "Edit" })],
  [BIT_RED | BIT_YELLOW | BIT_ORANGE, actionChord("Decrement Number (Ctrl+x)", "ctrl", "x", { category: "Edit" })],
  [BIT_RED | BIT_BLUE | BIT_ORANGE, actionChord("Full Page Down (Ctrl+f)", "ctrl", "f", { category: "Scroll" })],
  [BIT_YELLOW | BIT_BLUE | BIT_ORANGE, actionChord("Full Page Up (Ctrl+b)", "ctrl", "b", { category: "Scroll" })],

  [BIT_GREEN | BIT_RED | BIT_YELLOW | BIT_BLUE, actionEx("Write All (:wa)", ":wa", { requiresStarPower: true })],
  [BIT_GREEN | BIT_RED | BIT_YELLOW | BIT_ORANGE, actionEx("Save & Quit All (:wqa)", ":wqa", { requiresStarPower: true })],
  [BIT_GREEN | BIT_RED | BIT_BLUE | BIT_ORANGE, actionEx("Sort Lines (:sort)", ":sort", { requiresRiff: true })],
  [BIT_GREEN | BIT_YELLOW | BIT_BLUE | BIT_ORANGE, actionEx("Sort Unique (:sort u)", ":sort u", { requiresRiff: true })],
  [BIT_RED | BIT_YELLOW | BIT_BLUE | BIT_ORANGE, actionEx("Open Explorer (:Explore)", ":Explore")],
  [BIT_GREEN | BIT_RED | BIT_YELLOW | BIT_BLUE | BIT_ORANGE, actionText("Substitute Template (:%s///gc)", ":%s///gc", { category: "Search & Replace", requiresRiff: true })],
]);

const EX_COMMANDS = [
  ["Toggle List Whitespace", ":set list!"],
  ["Toggle Cursor Line", ":set cursorline!"],
  ["Toggle Cursor Column", ":set cursorcolumn!"],
  ["Toggle Expandtab", ":set expandtab!"],
  ["Toggle Ignorecase", ":set ignorecase!"],
  ["Toggle Smartcase", ":set smartcase!"],
  ["Toggle Highlight Search", ":set hlsearch!"],
  ["Toggle Incremental Search", ":set incsearch!"],
  ["Toggle Autoindent", ":set autoindent!"],
  ["Toggle Smartindent", ":set smartindent!"],
  ["Toggle Scrollbind", ":set scrollbind!"],
  ["Toggle Readonly", ":set readonly!"],
  ["Toggle Modifiable", ":set modifiable!"],
  ["Toggle Fold Enable", ":set foldenable!"],
  ["Toggle Diff Mode", ":diffthis"],
  ["Disable Diff Mode", ":diffoff"],
  ["Update Diff", ":diffupdate"],
  ["Diff Get", ":diffget"],
  ["Diff Put", ":diffput"],
  ["Reload File", ":edit!"],
  ["Check File Timestamps", ":checktime"],
  ["Print Working Directory", ":pwd"],
  ["List Marks", ":marks"],
  ["List Registers", ":registers"],
  ["List Jumps", ":jumps"],
  ["List Changes", ":changes"],
  ["List Undo Tree", ":undolist"],
  ["Show Messages", ":messages"],
  ["List Loaded Scripts", ":scriptnames"],
  ["Show File Info", ":file"],
  ["Show Highlight Groups", ":hi"],
  ["Enable Syntax", ":syntax on"],
  ["Disable Syntax", ":syntax off"],
  ["Enable Filetype Plugins", ":filetype plugin indent on"],
  ["Retab Indentation", ":retab"],
  ["Close Location List", ":lclose"],
  ["Open Location List", ":lopen"],
  ["Next Location Item", ":lnext"],
  ["Prev Location Item", ":lprev"],
  ["Close Quickfix", ":cclose"],
  ["First Quickfix Item", ":cfirst"],
  ["Last Quickfix Item", ":clast"],
  ["New Empty Buffer", ":enew"],
  ["First Buffer", ":bfirst"],
  ["Last Buffer", ":blast"],
  ["Wipe Unused Buffers", ":bufdo bd"],
  ["Move Tab First", ":tabfirst"],
  ["Move Tab Last", ":tablast"],
  ["Keep Only Current Tab", ":tabonly"],
  ["Open Terminal Split", ":terminal"],
  ["Run :make", ":make"],
  ["Sort Reverse", ":sort!"],
  ["Sort Numeric", ":sort n"],
  ["Sort Case-Insensitive", ":sort i"],
  ["Remove Trailing Spaces", ":%s/\\s\\+$//e"],
  ["Delete Blank Lines", ":g/^$/d"],
  ["Set Tabstop 2", ":set tabstop=2 shiftwidth=2"],
  ["Set Tabstop 4", ":set tabstop=4 shiftwidth=4"],
  ["Set Tabstop 8", ":set tabstop=8 shiftwidth=8"],
  ["Fold Method Indent", ":set foldmethod=indent"],
  ["Fold Method Syntax", ":set foldmethod=syntax"],
  ["Fold Method Marker", ":set foldmethod=marker"],
  ["Fold Method Manual", ":set foldmethod=manual"],
  ["Center Scrolloff 8", ":set scrolloff=8"],
  ["Zero Scrolloff", ":set scrolloff=0"],
  ["Set Colorcolumn 80", ":set colorcolumn=80"],
  ["Set Colorcolumn 100", ":set colorcolumn=100"],
  ["Clear Colorcolumn", ":set colorcolumn="],
  ["Set Encoding UTF-8", ":set fileencoding=utf-8"],
  ["Set Unix Line Endings", ":set fileformat=unix"],
  ["Set DOS Line Endings", ":set fileformat=dos"],
  ["Trim Blank Lines", ":%s/\\n\\{3,\\}/\\r\\r/e"],
  ["Global Save & Exit", ":xa"],
  ["Close All Windows", ":qa"],
  ["Force Close All Windows", ":qa!"],
  ["Horizontal New Split", ":new"],
  ["Vertical New Split", ":vnew"],
  ["Show Version Info", ":version"],
  ["Clear Message History", ":messages clear"],
];

const COUNTED_CORE = [
  ["Down", "j"],
  ["Up", "k"],
  ["Left", "h"],
  ["Right", "l"],
  ["Word Forward", "w"],
  ["Word Backward", "b"],
  ["Word End", "e"],
  ["WORD Forward", "W"],
  ["WORD Backward", "B"],
  ["Delete Lines", "dd"],
  ["Yank Lines", "yy"],
  ["Delete Chars", "x"],
  ["Delete Chars Back", "X"],
  ["Indent Lines", ">>"],
  ["Unindent Lines", "<<"],
  ["Undo Steps", "u"],
  ["Join Lines", "J"],
  ["Next Search", "n"],
  ["Prev Search", "N"],
  ["Repeat Change", "."],
];

const REGISTERS = [
  ...Array.from({ length: 26 }, (_, i) => String.fromCharCode(97 + i)),
  "+",
  "_",
];

const GRAMMAR_OPS = [
  ["Delete", "d"],
  ["Change", "c"],
  ["Yank", "y"],
];

const STYLE_OPS = [
  ["Lowercase", "gu"],
  ["Uppercase", "gU"],
  ["Toggle Case", "g~"],
  ["Auto-Indent", "="],
  ["Indent", ">"],
  ["Unindent", "<"],
];

const TARGETS = [
  ["Inner Word", "iw"],
  ["A Word", "aw"],
  ["Inner WORD", "iW"],
  ["A WORD", "aW"],
  ["Inner Paragraph", "ip"],
  ["A Paragraph", "ap"],
  ["Inner Sentence", "is"],
  ["A Sentence", "as"],
  ["Inside Double Quotes", 'i"'],
  ["Around Double Quotes", 'a"'],
  ["Inside Single Quotes", "i'"],
  ["Around Single Quotes", "a'"],
  ["Inside Parens", "i("],
  ["Around Parens", "a("],
  ["Inside Brackets", "i["],
  ["Around Brackets", "a["],
  ["Inside Braces", "i{"],
  ["Around Braces", "a{"],
  ["Inside Angle", "i<"],
  ["Around Angle", "a<"],
  ["Inside Tag", "it"],
  ["Around Tag", "at"],
  ["Word", "w"],
  ["Prev Word", "b"],
  ["Word End", "e"],
  ["To End of Line", "$"],
  ["To First Non-Blank", "^"],
  ["To Start of Line", "0"],
];

const CHAR_SEARCH_CHARS = [..."abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789()[]{}<>\"'.,:;=-_+/*"];

function buildPrefixActions() {
  const seen = new Set();
  for (const act of CURATED_VIM.values()) {
    const sig = canonicalSignature(act);
    if (seen.has(sig)) throw new Error(`Duplicate curated Vim signature: ${sig}`);
    seen.add(sig);
  }

  const items = [];
  const add = (act) => {
    const sig = canonicalSignature(act);
    if (!seen.has(sig)) {
      seen.add(sig);
      items.push(act);
    }
  };

  for (const [label, cmd] of EX_COMMANDS) {
    add(actionEx(`${label} (${cmd})`, cmd));
  }

  for (let i = 0; i < 26; i++) {
    const ch = String.fromCharCode(97 + i);
    add(actionText(`Set Mark ${ch} (m${ch})`, `m${ch}`, { category: "Marks" }));
    add(actionText(`Jump Line Mark ${ch} ('${ch})`, `'${ch}`, { category: "Marks" }));
    add(actionText(`Jump Exact Mark ${ch} (\`${ch})`, `\`${ch}`, { category: "Marks" }));
    add(actionText(`Record Macro ${ch} (q${ch})`, `q${ch}`, { category: "Macros" }));
    add(actionText(`Play Macro ${ch} (@${ch})`, `@${ch}`, { category: "Macros" }));
  }

  for (const [label, cmd] of COUNTED_CORE) {
    for (let count = 2; count < 52; count++) {
      add(actionText(`${label} x${count} (${count}${cmd})`, `${count}${cmd}`, { category: "Counted Vim" }));
    }
  }

  for (const [opLabel, op] of STYLE_OPS) {
    for (let count = 2; count < 22; count++) {
      for (const [tLabel, tgt] of TARGETS) {
        const seq = `${count}${op}${tgt}`;
        add(actionText(`${opLabel} ${count}x ${tLabel} (${seq})`, seq, { category: "Format Grammar" }));
      }
    }
  }

  for (const [mOp, mName] of [["f", "Find"], ["F", "Find Back"], ["t", "Till"], ["T", "Till Back"]]) {
    for (const [pOp, pName] of [["", "Jump"], ["d", "Delete"], ["c", "Change"], ["y", "Yank"]]) {
      for (const ch of CHAR_SEARCH_CHARS) {
        const seq = `${pOp}${mOp}${ch}`;
        add(actionText(`${pName} ${mName} '${ch}' (${seq})`, seq, { category: "Char Motion" }));
      }
    }
  }

  for (let line = 2; line < 2002; line++) {
    add(actionText(`Go To Line ${line} (${line}G)`, `${line}G`, { category: "Line Jump" }));
    add(actionEx(`Ex Go To Line ${line} (:${line})`, `:${line}`, { category: "Line Jump" }));
  }

  return items;
}

const PREFIX_ACTIONS = buildPrefixActions();
const GRAMMAR_COUNTS = Array.from({ length: 17 }, (_, i) => i + 2);
const GRAMMAR_SLOTS = REGISTERS.length * GRAMMAR_COUNTS.length * GRAMMAR_OPS.length * TARGETS.length;

if (PREFIX_ACTIONS.length + GRAMMAR_SLOTS + 10000 < TOTAL_VALID_STATES - 1) {
  throw new Error("Insufficient Vim permutation capacity");
}

export function resolveVimAction(bitmask) {
  const m = normalizeBitmask(bitmask);
  if (m === 0) return null;
  const curated = CURATED_VIM.get(m);
  if (curated) return curated;

  const rank = rankBitmask(m) - 1;
  if (rank < PREFIX_ACTIONS.length) return PREFIX_ACTIONS[rank];

  const offset = rank - PREFIX_ACTIONS.length;
  if (offset < GRAMMAR_SLOTS) {
    const tLen = TARGETS.length;
    const opLen = GRAMMAR_OPS.length;
    const cLen = GRAMMAR_COUNTS.length;

    const tIdx = offset % tLen;
    let q = Math.floor(offset / tLen);
    const opIdx = q % opLen;
    q = Math.floor(q / opLen);
    const cIdx = q % cLen;
    const rIdx = Math.floor(q / cLen);

    const reg = REGISTERS[rIdx];
    const count = GRAMMAR_COUNTS[cIdx];
    const [opName, op] = GRAMMAR_OPS[opIdx];
    const [tName, tgt] = TARGETS[tIdx];
    const seq = `"${reg}${count}${op}${tgt}`;
    return actionText(`${opName} ${count}x ${tName} -> Reg "${reg} (${seq})`, seq, { category: "Vim Grammar" });
  }

  const lineNum = 3000 + (offset - GRAMMAR_SLOTS);
  return actionText(`Go To Line ${lineNum} (${lineNum}G)`, `${lineNum}G`, { category: "Line Jump" });
}
