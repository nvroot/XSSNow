/* XSSNow - CSP Bypass Finder */
/* CSP bypass matching based on cspbypass.com approach */

class CSPEvaluator {
    constructor() {
        this.bypasses = [];

        // CSP keywords to filter out when matching bypasses
        this.cspKeywords = new Set([
            "'self'", "'unsafe-inline'", "'unsafe-eval'", "'none'",
            "'strict-dynamic'", "'wasm-unsafe-eval'", "'report-sample'",
            "'unsafe-hashes'", "'unsafe-allow-redirects'"
        ]);

        this.init();
    }

    init() {
        this.bindEvents();
    }

    bindEvents() {
        document.getElementById('analyzeBtn').addEventListener('click', () => this.analyze());
        document.getElementById('clearBtn').addEventListener('click', () => this.clear());

        document.querySelectorAll('.example-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.getElementById('cspInput').value = btn.dataset.csp;
            });
        });

        document.getElementById('cspInput').addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && e.ctrlKey) {
                this.analyze();
            }
        });
    }

    analyze() {
        const cspInput = document.getElementById('cspInput').value.trim();

        if (!cspInput) {
            this.showToast('Please enter a CSP header to analyze');
            return;
        }

        // Reset state
        this.bypasses = [];

        // Match bypass payloads using cspbypass.com logic
        this.matchBypasses(cspInput);

        // Render results
        this.renderResults();
    }

    // ==========================================
    // CSP Bypass Matching (cspbypass.com logic)
    // ==========================================

    /**
     * Parses a single CSP source token into a structured object.
     * Handles wildcards (*.example.com), exact hosts, path constraints,
     * and protocol enforcement per the W3C CSP spec.
     */
    parseCSPSource(token) {
        // Handle bare scheme like "https:" — matches all URLs with that scheme
        if (/^[a-z][a-z0-9+\-.]*:$/i.test(token)) {
            return { scheme: token.slice(0, -1).toLowerCase(), host: '*', wildcardSubdomain: false, pathPrefix: null };
        }

        // Extract scheme if present (e.g. https://)
        let scheme = null;
        let rest = token;
        const schemeMatch = token.match(/^([a-z][a-z0-9+\-.]*):\/\//i);
        if (schemeMatch) {
            scheme = schemeMatch[1].toLowerCase();
            rest = token.slice(schemeMatch[0].length);
        }

        // Separate host from path
        const slashIdx = rest.indexOf('/');
        let host = slashIdx === -1 ? rest : rest.slice(0, slashIdx);
        const pathPrefix = slashIdx === -1 ? null : rest.slice(slashIdx);

        // Strip port number
        host = host.split(':')[0].toLowerCase();

        // Detect wildcard subdomain (*.example.com)
        const wildcardSubdomain = host.startsWith('*.');
        if (wildcardSubdomain) {
            host = host.slice(2); // remove "*."
        }

        return { scheme, host, wildcardSubdomain, pathPrefix };
    }

    /**
     * Tests whether a bypass entry is allowed by a single parsed CSP source.
     * Extracts the URL from the code snippet (src="...") and matches scheme,
     * host, and path prefix per the CSP spec.
     */
    matchesCspSource(entryDomain, entryCode, cspSource) {
        // Try to extract the URL from src="..." or href="..." in the code snippet.
        const urlMatch = entryCode.match(/(?:src|href)=["']?([^"' >]+)/i);
        const candidateUrls = urlMatch
            ? [urlMatch[1]]
            : ['https://' + entryDomain];

        for (const candidate of candidateUrls) {
            const m = candidate.match(/^([a-z][a-z0-9+\-.]*):\/\/([^/?#]+)(\/[^?#]*)?/i);
            if (!m) continue;

            const urlScheme = m[1].toLowerCase();
            const urlHost = m[2].split(':')[0].toLowerCase(); // strip port
            const urlPath = m[3] || '/';

            const { scheme, host, wildcardSubdomain, pathPrefix } = cspSource;

            // 1. Scheme check — only enforced when the CSP token included a scheme
            if (scheme && scheme !== urlScheme) continue;

            // 2. Host check
            if (host !== '*') {
                if (wildcardSubdomain) {
                    // *.example.com matches sub.example.com but NOT example.com itself
                    if (!urlHost.endsWith('.' + host)) continue;
                } else {
                    if (urlHost !== host) continue;
                }
            }

            // 3. Path prefix check (only when a path was specified in the CSP token)
            if (pathPrefix && pathPrefix !== '/') {
                const prefixWithSlash = pathPrefix.endsWith('/') ? pathPrefix : pathPrefix + '/';
                if (urlPath !== pathPrefix && !urlPath.startsWith(prefixWithSlash)) continue;
            }

            return true;
        }
        return false;
    }

    /**
     * Process CSP directive to extract matchable sources.
     * Filters out keywords, nonces, and hashes.
     */
    processCSPDirective(cspDirective) {
        return cspDirective
            .split(/\s+/)
            .filter(token =>
                token &&
                !this.cspKeywords.has(token.toLowerCase()) &&
                !token.match(/^'(nonce|sha(256|384|512))-/i)
            )
            .map(token => this.parseCSPSource(token));
    }

    /**
     * Main bypass matching function using cspbypass.com logic
     */
    matchBypasses(cspString) {
        if (typeof CSP_BYPASS_DATABASE === 'undefined') {
            console.warn('CSP bypass database not loaded');
            return;
        }

        // Parse the CSP directives
        const normalized = cspString.replace(/\s+/g, ' ').trim();
        const directivesMap = {};
        normalized.split(';')
            .map(part => part.trim())
            .filter(Boolean)
            .forEach(part => {
                const [name, ...rest] = part.split(/\s+/);
                if (name) {
                    directivesMap[name.toLowerCase()] = rest.join(' ');
                }
            });

        // Get effective script-src (script-src falls back to default-src)
        const effectiveScriptSrc = directivesMap['script-src'] || directivesMap['default-src'] || '';

        // Check for key CSP keywords
        const hasNonceOrHash = /(^|\s)'nonce-[^\s']+'/i.test(effectiveScriptSrc) ||
            /(^|\s)'sha(256|384|512)-[^\s']+'/i.test(effectiveScriptSrc);
        const hasUnsafeInline = /(^|\s)'unsafe-inline'/i.test(effectiveScriptSrc);
        const hasStrictDynamic = /(^|\s)'strict-dynamic'/i.test(effectiveScriptSrc);

        // Per CSP3 spec: 'strict-dynamic' makes browsers ignore URL-based allowlists
        // (host sources, scheme sources like https:, http:)
        // Only nonce/hash-based scripts and their dynamically created children are allowed
        if (hasStrictDynamic && hasNonceOrHash) {
            // With strict-dynamic + nonce/hash, URL-based bypasses don't work
            // The policy is considered secure against JSONP/gadget attacks
            this.bypasses.push({
                domain: 'N/A',
                code: 'Policy uses strict-dynamic with nonce/hash - URL-based bypasses are blocked by the browser.',
                description: "'strict-dynamic' makes browsers ignore URL allowlists. Only nonced/hashed scripts can execute.",
                type: 'info'
            });
            return;
        }

        // Check for unsafe-inline without nonce/hash (and without strict-dynamic neutralizing it)
        if (hasUnsafeInline && !hasNonceOrHash && !hasStrictDynamic) {
            this.bypasses.push({
                domain: 'N/A',
                code: '<script>alert(document.domain)</script>',
                description: "'unsafe-inline' allows the execution of unsafe in-page scripts and event handlers.",
                type: 'unsafe-inline'
            });
        }

        // Process CSP sources for matching
        if (!effectiveScriptSrc) return;

        // If strict-dynamic is present without nonce/hash, it's misconfigured but still blocks URL sources
        if (hasStrictDynamic) {
            return;
        }

        const processedSources = this.processCSPDirective(effectiveScriptSrc);

        if (processedSources.length === 0) return;

        // Match against bypass database
        const matchedBypasses = CSP_BYPASS_DATABASE.filter(entry =>
            processedSources.some(source => this.matchesCspSource(entry.domain, entry.code, source))
        );

        // Add matched bypasses
        for (const bypass of matchedBypasses) {
            this.bypasses.push({
                domain: bypass.domain,
                code: bypass.code,
                description: `${bypass.domain} is known to host JSONP endpoints or script gadgets which allow to bypass this CSP.`,
                type: 'jsonp'
            });
        }
    }

    renderResults() {
        document.getElementById('resultsPlaceholder').style.display = 'none';
        this.renderBypasses();
    }

    renderBypasses() {
        const card = document.getElementById('bypassesCard');
        const list = document.getElementById('bypassesList');
        const count = document.getElementById('bypassesCount');

        if (this.bypasses.length === 0) {
            card.style.display = 'block';
            list.innerHTML = '<p class="empty-message">No bypasses found for this CSP. The policy may be secure or uses domains not in our database.</p>';
            count.textContent = '0 bypasses';
            return;
        }

        card.style.display = 'block';
        count.textContent = `${this.bypasses.length} bypass${this.bypasses.length !== 1 ? 'es' : ''}`;

        let html = '';
        for (let i = 0; i < this.bypasses.length; i++) {
            const bypass = this.bypasses[i];
            html += `
                <div class="bypass-item">
                    <div class="bypass-header">
                        <div class="bypass-type">
                            <i class="fas fa-bolt"></i>
                            <span>${bypass.type === 'unsafe-inline' ? 'Inline Script' : 'JSONP/Gadget'}</span>
                        </div>
                        <span class="bypass-domain">${this.escapeHtml(bypass.domain)}</span>
                    </div>
                    <div class="bypass-payload">
                        <code>${this.escapeHtml(bypass.code)}</code>
                        <button class="copy-payload-btn" onclick="cspEvaluator.copyPayload(${i})">
                            <i class="fas fa-copy"></i> Copy
                        </button>
                    </div>
                </div>
            `;
        }

        list.innerHTML = html;
    }

    copyPayload(index) {
        const bypass = this.bypasses[index];
        if (bypass && bypass.code) {
            navigator.clipboard.writeText(bypass.code).then(() => {
                this.showToast('Payload copied to clipboard!');
            }).catch(err => {
                console.error('Failed to copy:', err);
                this.showToast('Failed to copy payload');
            });
        }
    }

    exportPayloads() {
        if (this.bypasses.length === 0) {
            this.showToast('No payloads to export. Analyze a CSP first.');
            return;
        }

        // Filter out info messages and collect only actual payloads
        const payloads = this.bypasses
            .filter(b => b.type !== 'info')
            .map(b => b.code);

        if (payloads.length === 0) {
            this.showToast('No bypass payloads to export.');
            return;
        }

        const content = payloads.join('\n');

        // Create and download the file
        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'csp-bypass-payloads.txt';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        this.showToast(`Exported ${payloads.length} payload(s)!`);
    }

    clear() {
        document.getElementById('cspInput').value = '';
        document.getElementById('resultsPlaceholder').style.display = 'block';
        document.getElementById('bypassesCard').style.display = 'none';
        this.bypasses = [];
    }

    showToast(message) {
        const toast = document.getElementById('toast');
        const toastMessage = document.getElementById('toastMessage');
        toastMessage.textContent = message;
        toast.classList.add('show');
        setTimeout(() => {
            toast.classList.remove('show');
        }, 3000);
    }

    escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }
}

// Initialize
let cspEvaluator;
document.addEventListener('DOMContentLoaded', () => {
    cspEvaluator = new CSPEvaluator();
});
