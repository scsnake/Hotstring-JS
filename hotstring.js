/**
 * Hotstring.js
 * A robust, buffer-based text expansion library for the web.
 * Supports full AHK v1/v2 Options.
 * @version 1.2.0
 * @license MIT
 */
class HotstringManager {
    constructor(targetElement) {
        this.target = targetElement;
        this.buffer = "";
        this.maxBuffer = 60;
        this.hotstrings = [];

        this.muteMode = false;
        this.muteBuffer = "";

        this.isLocked = false;
        this.lockBuffer = [];
        this.isReplacing = false;

        this.isSuspended = false;

        // Reset buffer on mouse click by default
        this.resetOnMouse = true;

        // Default EndChars
        this.endChars = new Set([" ", "\t", "\n", ".", ",", "!", "?", "-", "(", ")", "[", "]", "{", "}", ":", ";", "'", "\"", "/", "\\"]);

        this._bindEvents();
    }

    // --- Public API ---

    setMuteMode(enabled) {
        this.muteMode = enabled;
        if (!enabled) {
            this.muteBuffer = "";
            this._updateDebug();
        }
    }

    toggleSuspend() {
        this.isSuspended = !this.isSuspended;
        return this.isSuspended;
    }

    /**
     * Clears the current detection buffer programmatically.
     * Equivalent to AHK's Hotstring("Reset")
     */
    reset() {
        this._resetBuffer("Manual Reset");
    }

    /**
     * Programmatically trigger a hotstring by its definition string.
     * Matches the original definition provided in add().
     * @param {string} definition - E.g. ":*:btw"
     */
    trigger(definition) {
        const hs = this.hotstrings.find(h => h.originalDefinition === definition);
        if (!hs) {
            console.warn(`Hotstring definition not found: ${definition}`);
            return;
        }
        // Execute with 0 backspace (simulated trigger), empty end char, default case
        this._triggerAction(hs, "", 0, 0, "");
    }

    /**
     * Search hotstrings by content (replacement text).
     * @param {string|RegExp} query - Text to find in the replacement.
     * @returns {string[]} Array of matching trigger definitions (e.g. [":*:btw"])
     */
    search(query) {
        const results = [];
        const isRegex = query instanceof RegExp;
        const lowerQuery = !isRegex && typeof query === 'string' ? query.toLowerCase() : "";

        for (const hs of this.hotstrings) {
            let match = false;

            // Determine content to search (Replacement text or Function string)
            let content = "";
            if (typeof hs.replacement === 'string') {
                content = hs.replacement;
            } else if (typeof hs.replacement === 'function') {
                content = hs.replacement.toString();
            }

            if (isRegex) {
                if (query.test(content)) match = true;
            } else {
                if (content.toLowerCase().includes(lowerQuery)) match = true;
            }

            if (match) {
                if (hs.originalDefinition) {
                    results.push(hs.originalDefinition);
                } else if (hs.type === 'regex') {
                    results.push(hs.trigger.toString());
                }
            }
        }
        return results;
    }

    /**
     * Read-only getter for current EndChars
     */
    get endCharsString() {
        return Array.from(this.endChars).join('');
    }

    /**
     * Sets #Hotstring NoMouse behavior
     */
    setNoMouse(enabled) {
        this.resetOnMouse = !enabled;
    }

    /**
     * Dynamically sets the EndChars list.
     * Equivalent to AHK's #Hotstring EndChars
     * @param {string} charsStr - String containing all end characters
     */
    setEndChars(charsStr) {
        this.endChars = new Set(charsStr.split(''));
    }

    add(definition, replacement) {
        const parsed = this._parseDefinition(definition);
        if (!parsed) throw new Error(`Invalid definition syntax: ${definition}`);
        if (typeof replacement === 'function') parsed.execute = true;
        // Store original definition for programmatic access
        this.hotstrings.push({ type: 'text', originalDefinition: definition, ...parsed, replacement });
        this._sortHotstrings(); // Respect Pn priority and length
    }

    addRegex(regexPattern, action, options = {}) {
        let source = regexPattern.source;
        if (!source.endsWith('$')) source += '$';
        const finalRegex = new RegExp(source, regexPattern.flags);

        this.hotstrings.push({
            type: 'regex',
            trigger: finalRegex,
            replacement: action,
            priority: options.priority || 0,
            options: {
                async: options.async || false,
                blockInput: options.blockInput !== false,
                timeout: options.timeout || 3000
            }
        });
        this._sortHotstrings();
    }

    // --- Import Logic with AHK Escape Support ---

    /**
     * Helper to convert AHK escape sequences to JS characters.
     * Preserves literal backslashes (\).
     */
    _parseAHKEscapes(str) {
        if (!str) return "";
        // Replace `n, `t, `r, `;, `,, `%, `` `
        return str.replace(/`./g, (match) => {
            const char = match[1];
            switch (char) {
                case 'n': return '\n';
                case 'r': return '\r';
                case 't': return '\t';
                case 'b': return '\b';
                case ';': return ';';
                case ',': return ',';
                case '%': return '%';
                case '`': return '`';
                case '"': return '"';
                case "'": return "'";
                default: return char; // For unknown, return the char literally
            }
        });
    }

    import(input, options = { stopOnError: false }) {
        const result = { added: 0, errors: [] };
        const handleError = (msg, item) => {
            if (options.stopOnError) throw new Error(msg);
            result.errors.push({ msg, item });
        };

        const processLine = (line) => {
            const match = line.match(/^:(.*?):(.*?)::(.*)$/);
            if (match) {
                const optsStr = match[1];
                // Parse escapes in trigger and replacement
                let trigger = this._parseAHKEscapes(match[2]);
                let repl = this._parseAHKEscapes(match[3]);

                const fullDef = `:${optsStr}:${trigger}`;
                try {
                    this.add(fullDef, repl);
                    result.added++;

                    // We must re-process the stored replacement because add() takes it raw
                    // Find the item we just added (last one) and parse escapes in replacement
                    const lastItem = this.hotstrings[this.hotstrings.length - 1];
                    if (typeof lastItem.replacement === 'string') {
                        lastItem.replacement = this._parseAHKEscapes(lastItem.replacement);
                    }

                } catch (e) {
                    handleError(e.message, line);
                }
            }
        }

        if (typeof input === 'string') {
            const lines = input.split(/\r?\n/);
            for (let i = 0; i < lines.length; i++) {
                let line = lines[i].trim();
                if (!line || line.startsWith(';')) continue;

                // Manual parsing to handle multiline
                const match = line.match(/^:(.*?):(.*?)::(.*)$/);
                if (match) {
                    const optsStr = match[1];
                    let trigger = this._parseAHKEscapes(match[2]);
                    let repl = match[3];

                    // Multiline Block Detection
                    if ((!repl || repl.trim() === '') && lines[i+1] && lines[i+1].trim().startsWith('(')) {
                        let blockContent = [];
                        let j = i + 2;
                        let foundEnd = false;

                        while (j < lines.length) {
                            if (lines[j].trim().startsWith(')')) {
                                foundEnd = true;
                                i = j;
                                break;
                            }
                            blockContent.push(lines[j]);
                            j++;
                        }

                        if (foundEnd) {
                            repl = blockContent.join('\n'); // Join with actual newline
                        } else {
                            handleError(`Line ${i+1}: Unclosed multiline block`, line);
                            continue;
                        }
                    }

                    // Apply escapes to replacement (multiline or single line)
                    repl = this._parseAHKEscapes(repl);

                    const fullDef = `:${optsStr}:${trigger}`;
                    try {
                        this.add(fullDef, repl);
                        result.added++;
                    } catch (e) {
                        handleError(`Line ${i+1}: ${e.message}`, line);
                    }
                }
            }
        }
        return result;
    }

    clear() {
        this.hotstrings = [];
    }

    // --- Internal Logic ---

    _bindEvents() {
        this.target.addEventListener('keydown', (e) => this._handleKeydown(e));
        this.target.addEventListener('input', (e) => this._handleInput(e));

        // Focus change always resets buffer
        this.target.addEventListener('blur', () => {
            this._resetBuffer("Focus Lost");
        });

        // Mouse click (mousedown to catch caret move before click)
        this.target.addEventListener('mousedown', () => {
            if (this.resetOnMouse) {
                this._resetBuffer("Mouse Click");
            }
        });
    }

    _handleKeydown(e) {
        if (this.isLocked) {
            e.preventDefault();
            if (e.key.length === 1 || e.key === 'Enter' || e.key === 'Backspace' || e.key === 'Tab') {
                this.lockBuffer.push(e.key);
            }
            return;
        }

        // 1. Modifiers: Reset Buffer (Ctrl+A, Ctrl+C etc)
        // Note: Shift is not included as it's used for typing capital letters
        if (e.ctrlKey || e.altKey || e.metaKey) {
            this._resetBuffer(`Modifier: ${e.key}`);
            return;
        }

        // 2. Navigation Keys: Reset Buffer (move caret breaks context)
        const navKeys = [
            "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown",
            "PageUp", "PageDown", "Home", "End", "Escape"
        ];

        if (navKeys.includes(e.key)) {
            this._resetBuffer(`Nav: ${e.key}`);
        }

        if (this.muteMode) {
            this._handleMuteKeydown(e);
            return;
        }

        // --- Custom Tab Handling ---
        // If Tab is pressed: prevent focus change, insert \t, and process as input
        if (e.key === 'Tab') {
            e.preventDefault();

            // Insert literal Tab
            const start = this.target.selectionStart;
            const end = this.target.selectionEnd;
            this.target.setRangeText('\t', start, end, 'end');

            // Process input for hotstring triggers
            this._processInputChar('\t');
            return;
        }

        if (e.key === 'Backspace') {
            this.buffer = this.buffer.slice(0, -1);
            this._updateDebug();
        }
    }

    _handleInput(e) {
        if (this.isLocked || this.muteMode || this.isReplacing) return;

        // Check for paste, cut, undo, redo operations that significantly alter text/cursor
        const resetTypes = ['insertFromPaste', 'deleteByCut', 'historyUndo', 'historyRedo'];
        if (resetTypes.includes(e.inputType)) {
            this._resetBuffer(`Action: ${e.inputType}`);
            return;
        }

        let char = e.data;

        // Handle Enter Key (data is null, inputType is line break)
        if (!char && (e.inputType === 'insertLineBreak' || e.inputType === 'insertParagraph')) {
            char = '\n';
        }

        this._processInputChar(char);
    }

    // Shared Logic for Input/Keydown buffer updates
    _processInputChar(char) {
        if (char) {
            this.buffer += char;
            if (this.buffer.length > this.maxBuffer) this.buffer = this.buffer.slice(-this.maxBuffer);
            this._updateDebug();
            this._checkTriggers(char);
        }
    }

    _checkTriggers(lastChar) {
        // Hotstrings are sorted by Priority (High to Low), then Length (Long to Short)
        for (const hs of this.hotstrings) {

            // Suspend Check: If globally suspended, only Exempt (S) hotstrings work
            if (this.isSuspended && !hs.suspendExempt) continue;

            if (hs.type === 'regex') {
                const match = this.buffer.match(hs.trigger);
                if (match) {
                    this._executeRegexMatch(hs, match);
                    return;
                }
                continue;
            }

            this._checkStandardMatch(hs, lastChar);
            if (this.lastMatchOccurred) {
                 this.lastMatchOccurred = false;
                 return;
            }
        }
    }

    _checkStandardMatch(hs, lastChar) {
        let isMatch = false;
        let triggerLen = hs.trigger.length;
        let endCharLen = 0;
        let endCharTyped = "";
        let matchedTriggerText = "";

        if (hs.fireImmediately) {
            const tail = this.buffer.slice(-triggerLen);
            if (this._compare(tail, hs.trigger, hs.caseSensitive)) {
                if (hs.insideWord || this._isStartOfWord(triggerLen)) {
                    isMatch = true;
                    matchedTriggerText = tail;
                }
            }
        }
        else if (lastChar && this.endChars.has(lastChar)) {
            endCharLen = lastChar.length;
            endCharTyped = lastChar;
            const potentialTrigger = this.buffer.slice(-(triggerLen + endCharLen), -endCharLen);
            if (this._compare(potentialTrigger, hs.trigger, hs.caseSensitive)) {
                if (hs.insideWord || this._isStartOfWord(triggerLen + endCharLen)) {
                    isMatch = true;
                    matchedTriggerText = potentialTrigger;
                }
            }
        }

        if (isMatch) {
            this.lastMatchOccurred = true;
            this._triggerAction(hs, endCharTyped, triggerLen, endCharLen, matchedTriggerText);
        }
    }

    async _triggerAction(hs, endCharTyped, triggerLen, endCharLen, matchedTriggerText) {
        // Reset buffer to prevent overlapping triggers and "ghost" matching.
        this._resetBuffer();

        // 1. Calculate Backspaces
        let bsCount = triggerLen + endCharLen;
        if (hs.noBackspace) bsCount = 0;

        // 2. Prepare Replacement
        let textToInsert = hs.replacement;

        // Execute Mode
        if (hs.execute) {
            if (typeof hs.replacement === 'function') {
                this._performBackspace(bsCount);
                hs.replacement();
                return;
            }
        }

        // Case Conformity (C1 turns this OFF. Default is ON if C0)
        if (!hs.caseSensitive && !hs.noConformity && matchedTriggerText) {
            textToInsert = this._applyCaseConformity(matchedTriggerText, textToInsert);
        }

        // Omit End Char
        if (!hs.fireImmediately && !hs.omitEndChar) {
            textToInsert += endCharTyped;
        }

        // 3. Send Mode Logic
        const useDelay = (hs.sendMode === 'SE' || hs.sendMode === 'SP') && hs.keyDelay > -1;
        const effectiveDelay = hs.keyDelay > -1 ? hs.keyDelay : 20;

        if (useDelay) {
             this._performBackspace(bsCount);
             await this._typeText(textToInsert, effectiveDelay, hs.rawMode);
        } else {
             this._performReplacementInstant(bsCount, textToInsert, hs.rawMode);
        }
    }

    _performReplacementInstant(backspaceCount, text, rawMode) {
        this.isReplacing = true; // LOCK
        try {
            const input = this.target;
            const startPos = input.selectionStart;
            if (startPos < backspaceCount) return;

            // Remove Trigger
            input.setRangeText("", startPos - backspaceCount, startPos, 'end');

            // Check for {Left n} hack for the B0 demo
            let moveLeft = 0;
            let cleanText = text;
            const leftMatch = text.match(/{Left (\d+)}/i);
            if (leftMatch) {
                moveLeft = parseInt(leftMatch[1], 10);
                cleanText = text.replace(leftMatch[0], "");
            }

            const parsed = rawMode ? cleanText : this._parseSendString(cleanText);
            const newStart = input.selectionStart;
            input.setRangeText(parsed, newStart, newStart, 'end');

            if (moveLeft > 0) {
                input.selectionStart = input.selectionEnd - moveLeft;
                input.selectionEnd = input.selectionStart;
            }

            input.dispatchEvent(new Event('input', { bubbles: true }));
        } finally {
            this.isReplacing = false; // UNLOCK
        }
    }

    async _typeText(text, delay, rawMode) {
        this._enableLock();
        const input = this.target;
        const content = rawMode ? text : this._parseSendString(text);

        for (const char of content) {
            const start = input.selectionStart;
            input.setRangeText(char, start, start, 'end');
            await new Promise(r => setTimeout(r, delay));
        }
        this._disableLockAndReplay();
    }

    _performBackspace(count) {
        if (count <= 0) return;
        const input = this.target;
        const start = input.selectionStart;
        input.setRangeText("", start - count, start, 'end');
    }

    _applyCaseConformity(typed, replacement) {
        if (typed === typed.toUpperCase() && typed !== typed.toLowerCase()) {
            return replacement.toUpperCase();
        }
        if (typed.length > 0 && typed[0] === typed[0].toUpperCase() && typed.substring(1) === typed.substring(1).toLowerCase()) {
            return replacement.charAt(0).toUpperCase() + replacement.slice(1);
        }
        return replacement;
    }

    _parseSendString(str) {
        return str.replace(/{Enter}/gi, '\n').replace(/{Tab}/gi, '\t').replace(/{Space}/gi, ' ');
    }

    async _executeRegexMatch(hs, match) {
        this._resetBuffer();
         if (typeof hs.replacement === 'function') {
            const func = hs.replacement;
            const backspaceCount = match[0].length;
            const result = func(...match);
            if (result) this._performReplacementInstant(backspaceCount, result, false);
        }
    }

    _enableLock() {
        this.isLocked = true;
        this.lockBuffer = [];
        this._updateDebugStatus("LOCKED (Typing...)");
    }

    _disableLockAndReplay() {
        this.isLocked = false;
        this._updateDebugStatus("Replaying...");
         if (this.lockBuffer.length > 0) {
            const replayText = this.lockBuffer.reduce((acc, key) => {
                if (key === 'Enter') return acc + '\n';
                if (key === 'Tab') return acc + '\t';
                if (key === 'Backspace') return acc;
                return acc + key;
            }, "");
            const start = this.target.selectionStart;
            this.target.setRangeText(replayText, start, start, 'end');
            this.buffer += replayText;
        }
        this._updateDebugStatus("Ready");
    }

    _handleMuteKeydown(e) {
         if(e.key.length === 1 && !e.ctrlKey) {
             e.preventDefault();
             const char = e.key;
             if(this.endChars.has(char)) this._processMuteBuffer(char);
             else { this.muteBuffer += char; this._updateDebug(); }
         }
         else if(e.key === 'Backspace') {
             e.preventDefault();
             this.muteBuffer = this.muteBuffer.slice(0,-1);
             this._updateDebug();
         }
    }

    _processMuteBuffer(endChar) {
        this._insertText(this.muteBuffer + endChar);
        this.muteBuffer = "";
        this._updateDebug();
    }

    _insertText(text) {
        const start = this.target.selectionStart;
        this.target.setRangeText(text, start, start, 'end');
    }

    _parseDefinition(def) {
        // FIX: Changedregex to use `(.*?)` for options to allow empty options like `::twa`
        const match = def.match(/^:(.*?):(.+)$/is);
        if (!match) return null;

        const optsStr = match[1].toUpperCase();
        const opts = {
            fireImmediately: false,
            insideWord: false,
            noBackspace: false,
            caseSensitive: false,
            noConformity: false,
            omitEndChar: false,
            rawMode: false,
            execute: false,
            resetRecognizer: false,
            suspendExempt: false,
            priority: 0,
            keyDelay: -1,
            sendMode: 'SI'
        };

        if (optsStr.includes('*')) opts.fireImmediately = !optsStr.includes('*0');
        if (optsStr.includes('?')) opts.insideWord = !optsStr.includes('?0');
        if (optsStr.includes('B0')) opts.noBackspace = true;
        else if (optsStr.includes('B')) opts.noBackspace = false;

        if (optsStr.includes('C1')) opts.noConformity = true;
        else if (optsStr.includes('C')) opts.caseSensitive = !optsStr.includes('C0');

        if (optsStr.includes('O')) opts.omitEndChar = !optsStr.includes('O0');

        if (optsStr.includes('T')) opts.rawMode = !optsStr.includes('T0');
        else if (optsStr.includes('R')) opts.rawMode = !optsStr.includes('R0');

        if (optsStr.includes('X')) opts.execute = true;
        if (optsStr.includes('Z')) opts.resetRecognizer = !optsStr.includes('Z0');
        if (optsStr.includes('S')) opts.suspendExempt = !optsStr.includes('S0');

        if (optsStr.includes('SE')) opts.sendMode = 'SE';
        else if (optsStr.includes('SP')) opts.sendMode = 'SP';
        else if (optsStr.includes('SI')) opts.sendMode = 'SI';

        const kMatch = optsStr.match(/K(-?\d+)/);
        if (kMatch) opts.keyDelay = parseInt(kMatch[1], 10);

        const pMatch = optsStr.match(/P(-?\d+)/);
        if (pMatch) opts.priority = parseInt(pMatch[1], 10);

        return {
            trigger: match[2],
            ...opts
        };
    }

    _sortHotstrings() {
        this.hotstrings.sort((a, b) => {
            if (a.priority !== b.priority) return b.priority - a.priority;
            const lenA = a.type === 'regex' ? 0 : a.trigger.length;
            const lenB = b.type === 'regex' ? 0 : b.trigger.length;
            return lenB - lenA;
        });
    }

    _compare(a, b, cs) {
        if (!a || !b) return false;
        return cs ? a === b : a.toLowerCase() === b.toLowerCase();
    }

    _isStartOfWord(len) {
        if (this.buffer.length <= len) return true;
        const charBefore = this.buffer[this.buffer.length - len - 1];
        return !/[a-zA-Z0-9_]/.test(charBefore);
    }

    _resetBuffer(reason = null) {
        this.buffer = "";
        this._updateDebug(reason);
    }

    _updateDebug(resetReason = null) {
        if (typeof window.onHotstringUpdate === 'function') {
            window.onHotstringUpdate({
                buffer: this.muteMode ? this.muteBuffer : this.buffer,
                isMute: this.muteMode,
                isLocked: this.isLocked,
                resetReason: resetReason
            });
        }
    }

    _updateDebugStatus(status) {
        if (typeof window.onHotstringStatus === 'function') {
            window.onHotstringStatus(status);
        }
    }
}
