<div align="center">
  # Hotstring.js

  [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
  [![JS](https://img.shields.io/badge/JavaScript-ES6+-F7DF1E?logo=javascript&logoColor=black)](javascript:void(0))

  **A zero-dependency JavaScript library bringing robust, AutoHotkey-style text expansion to the web.**

  ---
</div>

A powerful engine for `textarea` and `input` elements. Supports AHK v1/v2 syntax, regex triggers, and advanced input management.

> [!NOTE]
> **AI Acknowledgment:** This library was developed with the assistance of Google's Gemini Pro models. The architecture, logic implementation, and debugging were iteratively refined through AI-User collaboration.

## Table of Contents
- [Features](#features)
- [Installation](#installation)
- [Usage](#usage)
  - [1. Adding Hotstrings](#1-adding-hotstrings)
  - [2. Bulk Import](#2-bulk-import)
  - [3. Programmatic Control](#3-programmatic-control)
- [Escape Sequences](#escape-sequences)
- [Options Reference](#options-reference)
- [Buffer Behavior](#buffer-behavior)
- [References](#references)
- [License](#license)

## Features

- **Robust Buffer Engine**: Internal memory buffer tracks keystrokes independently of the DOM.
- **AHK Syntax Support**: Parses standard syntax (`:*:trigger::replacement`) and multiline continuation sections.
- **Smart Case Conformity**: Automatically adjusts replacement case (e.g., `btw` -> `by the way`, `Btw` -> `By the way`).
- **Advanced Options**: Full support for `*`, `?`, `B0`, `O`, `C`, `C1`, `K(n)`, `SE`, `SI`, `Z`, `S`, `R`, `X`.
- **Regex Triggers**: Trigger actions based on RegExp patterns (e.g., calculation hotstrings).
- **Input Locking**: Prevents race conditions during async operations or delayed typing.
- **Mute Mode**: Privacy feature that hides user typing until a word is completed.

## Installation

Simply include the script in your project. It has no dependencies.

```html
<script src="hotstring.js"></script>
```

## Usage

### Initialization

Attach the manager to any text input or textarea.

```javascript
const inputElement = document.getElementById('myTextarea');
const hm = new HotstringManager(inputElement);
```

### 1. Adding Hotstrings

#### Standard AHK Style
```javascript
// hm.add(definition, replacement)
hm.add(":*:btw", "By the way");       // Immediate fire
hm.add("::em", "email@example.com");  // Requires EndChar (Space/Enter)
hm.add(":SE K40:slow", "Typed...");   // Simulate typing delay (SendEvent mode)
```

#### Regex with Function
```javascript
hm.addRegex(/(\d+)x(\d+)/, (match, n1, n2) => {
    return parseInt(n1) * parseInt(n2);
});
// Typing "10x10" -> "100"
```

#### Async Data Fetching
```javascript
hm.addRegex(/fetch/, async (match) => {
    const data = await fetch('/api/data');
    return data.text();
}, {
    async: true,
    blockInput: true // Buffers user input while fetching
});
```

### 2. Bulk Import

Import raw AutoHotkey script content directly.

```javascript
const ahkScript = `
:*:omg::Oh my god
::sig::
(
Best Regards,
John Doe
)
`;
hm.import(ahkScript);
```

### 3. Programmatic Control

#### Trigger Manually
Simulate a hotstring trigger by its definition label.
```javascript
hm.trigger(":*:btw");
```

#### Search Hotstrings
Find hotstrings containing specific text in their replacement content.
```javascript
const matches = hm.search("Regards"); 
// Returns ["::sig"]
```

#### Reset Buffer
Manually clear the detection buffer (equivalent to `Hotstring("Reset")`).
```javascript
hm.reset();
```

#### Dynamic EndChars
Change the list of characters that trigger standard hotstrings.
```javascript
hm.setEndChars("-()[]{}':;\"/\\,.?!\n\t");
```

## Escape Sequences

> [!IMPORTANT]
> The escape character depends on how you define the hotstring.

### JavaScript Methods (`hm.add`):
Use standard JavaScript escape sequences (Backslash `\`).
```javascript
hm.add("::multiline", "Line 1\nLine 2"); // \n = Newline
hm.add("::path", "C:\\Windows");         // \\ = Literal Backslash
```

### AHK Import (`hm.import`):
Use AutoHotkey escape sequences (Backtick `` ` ``).
```javascript
const script = `
::multiline::Line 1\`nLine 2  ; \`n = Newline (Note: \` is escaped in JS string template)
::path::C:\Windows            ; Literal Backslash preserved
`;
hm.import(script);
```

## Options Reference

Supported options between the first pair of colons (e.g., `:*:trigger`).

| Option | Name | Description |
| :--- | :--- | :--- |
| `*` | Immediate | Fire without an ending character. |
| `?` | Inside Word | Trigger even inside other words. |
| `B0` | No Backspace | Do not erase the trigger text. |
| `O` | Omit End Char | Do not type the triggering space/enter. |
| `C` | Case Sensitive | Exact match required. |
| `C1` | No Conformity | Do not adapt replacement case to input case. |
| `Kn` | Key Delay | Delay in `ms` between keystrokes (requires `SE`). |
| `SE` | SendEvent | Use delayed typing mode. |
| `SI` | SendInput | Use instant replacement mode (Default). |
| `X` | Execute | Run a function instead of sending text. |
| `Z` | Reset | Clear buffer after triggering. |
| `R` | Raw | Send text literally (no special key parsing). |

## Buffer Behavior

The internal memory buffer is robust but will reset (clear history) automatically on specific actions to prevent "ghost" triggers:

- **Focus Loss**: User clicks away from the input element.
- **Mouse Click**: User clicks inside the text area (unless `#Hotstring NoMouse` is emulated via `hm.setNoMouse(true)`).
- **Navigation Keys**: `ArrowLeft`, `ArrowRight`, `Up`, `Down`, `Home`, `End`, `PageUp`, `PageDown`.
- **Escape Key**: Pressing `Esc`.
- **Modifiers**: Pressing `Ctrl`, `Alt`, or `Meta` (e.g., `Ctrl+A`).
- **Editing Actions**: `Undo`, `Redo`, `Paste`, or `Cut` operations.

## References

- [AutoHotkey v2 Hotstrings Documentation](https://www.autohotkey.com/docs/v2/Hotstrings.htm)

## License

[MIT](LICENSE)
