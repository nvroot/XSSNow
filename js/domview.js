/**
 * Live DOM Viewer - XSSNow
 * Let's Learn XSS
 * Real-time HTML rendering with Safari-style browser preview
 *
 * SECURITY: This implementation uses a sandboxed iframe to isolate
 * user-provided HTML/JS from the parent page. The iframe:
 * - Has sandbox="allow-scripts" (no allow-same-origin)
 * - Cannot access parent page cookies, localStorage, or DOM
 * - Cannot make requests with parent's credentials
 * - Uses srcdoc for complete isolation
 */

class LiveDOMViewer {
    constructor() {
        // DOM Elements
        this.codeInput = document.getElementById('codeInput');
        this.previewFrame = document.getElementById('previewFrame');
        this.domTree = document.getElementById('domTree');
        this.lineNumbers = document.getElementById('lineNumbers');
        this.charCount = document.getElementById('charCount');

        // Buttons
        this.clearBtn = document.getElementById('clearBtn');
        this.copyBtn = document.getElementById('copyBtn');
        this.refreshBtn = document.getElementById('refreshBtn');
        this.expandAllBtn = document.getElementById('expandAllBtn');
        this.collapseAllBtn = document.getElementById('collapseAllBtn');

        // State
        this.debounceTimer = null;

        this.init();
    }

    init() {
        this.setupEventListeners();
        this.updateLineNumbers();
        this.updateCharCount();
        this.renderInitialState();
    }

    setupEventListeners() {
        // Auto-render on input
        this.codeInput.addEventListener('input', () => {
            this.updateLineNumbers();
            this.updateCharCount();
            this.debounceRender();
        });

        // Sync scroll for line numbers
        this.codeInput.addEventListener('scroll', () => {
            this.lineNumbers.scrollTop = this.codeInput.scrollTop;
        });

        // Tab key support
        this.codeInput.addEventListener('keydown', (e) => {
            if (e.key === 'Tab') {
                e.preventDefault();
                const start = this.codeInput.selectionStart;
                const end = this.codeInput.selectionEnd;
                this.codeInput.value = this.codeInput.value.substring(0, start) + '  ' + this.codeInput.value.substring(end);
                this.codeInput.selectionStart = this.codeInput.selectionEnd = start + 2;
                this.updateLineNumbers();
            }
        });

        // Button handlers
        this.clearBtn.addEventListener('click', () => this.clear());
        this.copyBtn.addEventListener('click', () => this.copyCode());
        this.refreshBtn.addEventListener('click', () => this.render());
        this.expandAllBtn.addEventListener('click', () => this.expandAllNodes());
        this.collapseAllBtn.addEventListener('click', () => this.collapseAllNodes());
    }

    debounceRender() {
        clearTimeout(this.debounceTimer);
        this.debounceTimer = setTimeout(() => {
            this.render();
        }, 150);
    }

    render() {
        const code = this.codeInput.value;

        // Render to preview iframe using srcdoc
        this.renderPreview(code);

        // Update DOM tree
        this.renderDomTree(code);
    }

    /**
     * Renders HTML in a sandboxed iframe using srcdoc
     * The sandbox attribute prevents:
     * - Access to parent page cookies/localStorage
     * - Access to parent page DOM
     * - Navigation of the parent page
     * - Popups and new windows
     *
     * We inject custom alert/confirm/prompt handlers that display
     * macOS-style dialog boxes inside the iframe itself
     */
    renderPreview(code) {
        // Script to override alert/confirm/prompt inside the sandbox
        // Shows native-style dialog boxes inside the iframe itself
        const sandboxScript = `
<script>
(function() {
    // Create and show a macOS-style dialog inside the iframe
    function showDialog(type, message, showInput) {
        // Remove any existing dialog
        var existing = document.getElementById('xss-dialog-overlay');
        if (existing) existing.remove();

        // Create overlay
        var overlay = document.createElement('div');
        overlay.id = 'xss-dialog-overlay';
        overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;z-index:999999;backdrop-filter:blur(2px);';

        // Create dialog box (macOS style)
        var dialog = document.createElement('div');
        dialog.style.cssText = 'background:linear-gradient(180deg,#fff 0%,#f5f5f5 100%);border-radius:12px;padding:20px 24px;min-width:260px;max-width:400px;box-shadow:0 20px 60px rgba(0,0,0,0.3),0 0 0 1px rgba(0,0,0,0.1);font-family:-apple-system,BlinkMacSystemFont,sans-serif;text-align:center;';

        // Icon based on type
        var iconSvg = type === 'alert'
            ? '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>'
            : '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';

        // Title
        var title = document.createElement('div');
        title.style.cssText = 'margin-bottom:8px;';
        title.innerHTML = iconSvg;

        // Message
        var msgEl = document.createElement('div');
        msgEl.style.cssText = 'font-size:13px;color:#1a1a1a;margin-bottom:16px;word-break:break-word;line-height:1.4;';
        msgEl.textContent = message || '';

        // Input for prompt
        var input = null;
        if (showInput) {
            input = document.createElement('input');
            input.type = 'text';
            input.style.cssText = 'width:100%;padding:8px 10px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;margin-bottom:16px;box-sizing:border-box;outline:none;';
            input.onfocus = function() { this.style.borderColor = '#3b82f6'; };
            input.onblur = function() { this.style.borderColor = '#d1d5db'; };
        }

        // Buttons container
        var buttons = document.createElement('div');
        buttons.style.cssText = 'display:flex;gap:8px;justify-content:center;';

        // OK button
        var okBtn = document.createElement('button');
        okBtn.textContent = 'OK';
        okBtn.style.cssText = 'background:linear-gradient(180deg,#3b82f6 0%,#2563eb 100%);color:#fff;border:none;padding:8px 24px;border-radius:6px;font-size:13px;font-weight:500;cursor:pointer;min-width:80px;';

        // Cancel button (for confirm/prompt)
        var cancelBtn = null;
        if (type !== 'alert') {
            cancelBtn = document.createElement('button');
            cancelBtn.textContent = 'Cancel';
            cancelBtn.style.cssText = 'background:linear-gradient(180deg,#fff 0%,#f3f4f6 100%);color:#374151;border:1px solid #d1d5db;padding:8px 24px;border-radius:6px;font-size:13px;font-weight:500;cursor:pointer;min-width:80px;';
        }

        // Build dialog
        dialog.appendChild(title);
        dialog.appendChild(msgEl);
        if (input) dialog.appendChild(input);
        if (cancelBtn) buttons.appendChild(cancelBtn);
        buttons.appendChild(okBtn);
        dialog.appendChild(buttons);
        overlay.appendChild(dialog);
        document.body.appendChild(overlay);

        // Focus input or OK button
        if (input) {
            input.focus();
        } else {
            okBtn.focus();
        }

        // Return a promise for confirm/prompt
        return new Promise(function(resolve) {
            okBtn.onclick = function() {
                overlay.remove();
                if (showInput) {
                    resolve(input.value);
                } else if (type === 'confirm') {
                    resolve(true);
                } else {
                    resolve(undefined);
                }
            };
            if (cancelBtn) {
                cancelBtn.onclick = function() {
                    overlay.remove();
                    resolve(type === 'prompt' ? null : false);
                };
            }
            // Enter key
            if (input) {
                input.onkeydown = function(e) {
                    if (e.key === 'Enter') okBtn.click();
                    if (e.key === 'Escape' && cancelBtn) cancelBtn.click();
                };
            }
            // Escape key for alert
            document.onkeydown = function(e) {
                if (e.key === 'Escape') {
                    if (type === 'alert') {
                        okBtn.click();
                    } else if (cancelBtn) {
                        cancelBtn.click();
                    }
                }
            };
        });
    }

    // Override alert - shows dialog inside iframe
    var _alertQueue = Promise.resolve();
    window.alert = function(msg) {
        _alertQueue = _alertQueue.then(function() {
            return showDialog('alert', msg, false);
        });
    };

    // Override confirm - shows dialog inside iframe
    window.confirm = function(msg) {
        // Note: Native confirm is synchronous, but we make it async
        // For XSS demo purposes, we'll show the dialog
        var result = false;
        showDialog('confirm', msg, false).then(function(r) { result = r; });
        return result; // Will return false immediately, dialog is visual only
    };

    // Override prompt - shows dialog inside iframe
    window.prompt = function(msg, defaultVal) {
        // Note: Native prompt is synchronous, but we make it async
        // For XSS demo purposes, we'll show the dialog
        showDialog('prompt', msg, true);
        return null; // Will return null immediately, dialog is visual only
    };

    // Keep console working for debugging
})();
<\/script>`;


        // Build full HTML document
        const html = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        * { box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            padding: 16px;
            margin: 0;
            line-height: 1.6;
            color: #1a1a1a;
        }
        img { max-width: 100%; height: auto; }
        a { color: #0066cc; }
        pre, code { background: #f5f5f5; padding: 2px 6px; border-radius: 4px; font-family: 'SF Mono', Monaco, monospace; }
        pre { padding: 12px; overflow-x: auto; }
        table { border-collapse: collapse; width: 100%; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background: #f5f5f5; }
    </style>
    ${sandboxScript}
</head>
<body>${code}</body>
</html>`;

        // Use srcdoc for complete isolation
        this.previewFrame.srcdoc = html;
    }

    renderDomTree(code) {
        if (!code.trim()) {
            this.domTree.innerHTML = '<span class="dom-placeholder">DOM tree will appear as you type...</span>';
            return;
        }

        // Parse HTML using DOMParser (safe, doesn't execute scripts)
        const parser = new DOMParser();
        const doc = parser.parseFromString(code, 'text/html');
        const body = doc.body;

        if (!body.childNodes.length) {
            this.domTree.innerHTML = '<span class="dom-placeholder">No elements to display</span>';
            return;
        }

        // Build tree HTML
        const treeHtml = this.buildDomTreeHtml(body, true);
        this.domTree.innerHTML = treeHtml;

        // Add toggle handlers
        this.domTree.querySelectorAll('.dom-toggle').forEach(toggle => {
            toggle.addEventListener('click', (e) => {
                e.stopPropagation();
                const node = toggle.closest('.dom-node');
                const children = node.querySelector('.dom-children');
                if (children) {
                    const isCollapsed = children.classList.toggle('collapsed');
                    toggle.innerHTML = isCollapsed ?
                        '<i class="fas fa-caret-right"></i>' :
                        '<i class="fas fa-caret-down"></i>';
                }
            });
        });
    }

    buildDomTreeHtml(node, isRoot = false) {
        let html = '';
        const nodes = isRoot ? node.childNodes : [node];

        for (const child of nodes) {
            if (child.nodeType === Node.ELEMENT_NODE) {
                const tagName = child.tagName.toLowerCase();
                const hasChildren = child.childNodes.length > 0;

                // Build attributes (escaped for safety)
                let attrs = '';
                for (const attr of child.attributes) {
                    attrs += ` <span class="dom-attr-name">${this.escapeHtml(attr.name)}</span>=<span class="dom-attr-value">"${this.escapeHtml(attr.value)}"</span>`;
                }

                html += '<div class="dom-node">';
                html += '<div class="dom-node-content">';

                if (hasChildren) {
                    html += '<span class="dom-toggle"><i class="fas fa-caret-down"></i></span>';
                } else {
                    html += '<span class="dom-toggle"></span>';
                }

                html += `<span class="dom-element">&lt;${tagName}${attrs}&gt;</span>`;
                html += '</div>';

                if (hasChildren) {
                    html += '<div class="dom-children">';
                    for (const grandchild of child.childNodes) {
                        html += this.buildDomTreeHtml(grandchild);
                    }
                    html += '</div>';
                }

                html += '</div>';

            } else if (child.nodeType === Node.TEXT_NODE) {
                const text = child.textContent.trim();
                if (text) {
                    html += '<div class="dom-node">';
                    html += '<div class="dom-node-content">';
                    html += '<span class="dom-toggle"></span>';
                    html += `<span class="dom-text">"${this.escapeHtml(this.truncate(text, 50))}"</span>`;
                    html += '</div>';
                    html += '</div>';
                }
            } else if (child.nodeType === Node.COMMENT_NODE) {
                html += '<div class="dom-node">';
                html += '<div class="dom-node-content">';
                html += '<span class="dom-toggle"></span>';
                html += `<span class="dom-text">&lt;!-- ${this.escapeHtml(this.truncate(child.textContent, 40))} --&gt;</span>`;
                html += '</div>';
                html += '</div>';
            }
        }

        return html;
    }

    updateLineNumbers() {
        const lines = this.codeInput.value.split('\n');
        const numbers = lines.map((_, i) => i + 1).join('\n');
        this.lineNumbers.textContent = numbers || '1';
    }

    updateCharCount() {
        const count = this.codeInput.value.length;
        this.charCount.textContent = `${count} chars`;
    }

    renderInitialState() {
        // Show empty state in preview using srcdoc
        this.previewFrame.srcdoc = `<!DOCTYPE html>
<html>
<head>
    <style>
        body {
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100vh;
            margin: 0;
            font-family: -apple-system, BlinkMacSystemFont, sans-serif;
            color: #999;
            background: #fff;
            text-align: center;
        }
        .placeholder {
            padding: 20px;
        }
        .icon {
            font-size: 48px;
            margin-bottom: 16px;
            display: block;
            opacity: 0.5;
        }
    </style>
</head>
<body>
    <div class="placeholder">
        <span class="icon">&#60;/&#62;</span>
        <p>Start typing HTML to see it render here</p>
    </div>
</body>
</html>`;
    }

    clear() {
        this.codeInput.value = '';
        this.updateLineNumbers();
        this.updateCharCount();
        this.renderInitialState();
        this.domTree.innerHTML = '<span class="dom-placeholder">DOM tree will appear as you type...</span>';
    }

    copyCode() {
        const code = this.codeInput.value;
        if (!code) return;

        navigator.clipboard.writeText(code).then(() => {
            this.showToast('Copied to clipboard!');
        }).catch(() => {
            this.showToast('Failed to copy');
        });
    }

    expandAllNodes() {
        this.domTree.querySelectorAll('.dom-children').forEach(el => {
            el.classList.remove('collapsed');
        });
        this.domTree.querySelectorAll('.dom-toggle').forEach(toggle => {
            if (toggle.innerHTML) {
                toggle.innerHTML = '<i class="fas fa-caret-down"></i>';
            }
        });
    }

    collapseAllNodes() {
        this.domTree.querySelectorAll('.dom-children').forEach(el => {
            el.classList.add('collapsed');
        });
        this.domTree.querySelectorAll('.dom-toggle').forEach(toggle => {
            if (toggle.innerHTML) {
                toggle.innerHTML = '<i class="fas fa-caret-right"></i>';
            }
        });
    }

    showToast(message) {
        const existing = document.querySelector('.toast');
        if (existing) existing.remove();

        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.textContent = message;
        document.body.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 300);
        }, 2000);
    }

    /**
     * Safely escapes HTML to prevent XSS in the DOM tree display
     */
    escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    truncate(str, len) {
        return str.length > len ? str.substring(0, len) + '...' : str;
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.liveDOMViewer = new LiveDOMViewer();
});
