/**
 * Live DOM Viewer - XSSNow
 * Real-time HTML rendering with Safari-style browser preview
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
        this.setupCustomAlert();
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

    setupCustomAlert() {
        // Override alert to show custom styled modal
        const self = this;
        window.alert = function(message) {
            self.showXSSAlert(message);
        };
    }

    debounceRender() {
        clearTimeout(this.debounceTimer);
        this.debounceTimer = setTimeout(() => {
            this.render();
        }, 150);
    }

    render() {
        const code = this.codeInput.value;

        // Render to preview iframe
        this.renderPreview(code);

        // Update DOM tree
        this.renderDomTree(code);
    }

    renderPreview(code) {
        const frame = this.previewFrame;
        const doc = frame.contentDocument || frame.contentWindow.document;

        // Build full HTML document
        const html = `
<!DOCTYPE html>
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
</head>
<body>${code}</body>
</html>`;

        doc.open();
        doc.write(html);
        doc.close();
    }

    renderDomTree(code) {
        if (!code.trim()) {
            this.domTree.innerHTML = '<span class="dom-placeholder">DOM tree will appear as you type...</span>';
            return;
        }

        // Parse HTML
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

                // Build attributes
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
        // Show empty state in preview
        const frame = this.previewFrame;
        const doc = frame.contentDocument || frame.contentWindow.document;
        doc.open();
        doc.write(`
<!DOCTYPE html>
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
        .placeholder i {
            font-size: 48px;
            margin-bottom: 16px;
            display: block;
            opacity: 0.5;
        }
    </style>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
</head>
<body>
    <div class="placeholder">
        <i class="fas fa-code"></i>
        <p>Start typing HTML to see it render here</p>
    </div>
</body>
</html>`);
        doc.close();
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

    showXSSAlert(message) {
        const overlay = document.createElement('div');
        overlay.className = 'xss-alert-overlay';
        overlay.innerHTML = `
            <div class="xss-alert-box">
                <div class="xss-alert-icon">
                    <i class="fas fa-skull-crossbones"></i>
                </div>
                <div class="xss-alert-title">XSS Executed!</div>
                <div class="xss-alert-message">Your payload triggered an alert:</div>
                <div class="xss-alert-payload">${this.escapeHtml(String(message))}</div>
                <button class="xss-alert-close">Got it!</button>
            </div>
        `;

        document.body.appendChild(overlay);

        // Close handlers
        const closeBtn = overlay.querySelector('.xss-alert-close');
        closeBtn.addEventListener('click', () => overlay.remove());
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) overlay.remove();
        });
        document.addEventListener('keydown', function escHandler(e) {
            if (e.key === 'Escape') {
                overlay.remove();
                document.removeEventListener('keydown', escHandler);
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
