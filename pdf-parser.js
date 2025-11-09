/**
 * PDF Parser Module
 * Handles browser-based PDF parsing with intelligent table detection
 */

class PDFParser {
    constructor() {
        this.rawText = '';
        this.parsedData = [];
        this.detectedColumns = [];
        this.summary = {
            beginningBalance: null,
            endingBalance: null,
            totalCredits: null,
            totalDebits: null
        };
    }

    /**
     * Parse PDF file and extract structured data
     */
    async parsePDF(file) {
        try {
            const arrayBuffer = await file.arrayBuffer();
            const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

            let fullText = '';
            const pageTexts = [];

            // Extract text from all pages
            for (let i = 1; i <= pdf.numPages; i++) {
                const page = await pdf.getPage(i);
                const textContent = await page.getTextContent();
                const pageText = this.extractStructuredText(textContent);
                pageTexts.push(pageText);
                fullText += pageText + '\n';
            }

            this.rawText = fullText;

            // Extract summary information first (before removing those lines)
            this.extractSummary(fullText);

            // Detect table structure and extract data
            const tableData = this.detectAndExtractTables(fullText);

            if (tableData.rows.length === 0) {
                // Fallback: try to parse as line-by-line data
                tableData.rows = this.parseLineByLine(fullText);
                tableData.columns = this.detectColumnsFromData(tableData.rows);
            }

            this.parsedData = tableData.rows;
            this.detectedColumns = tableData.columns;

            return {
                success: true,
                data: this.parsedData,
                columns: this.detectedColumns,
                rowCount: this.parsedData.length,
                summary: this.summary
            };
        } catch (error) {
            console.error('PDF parsing error:', error);
            throw new Error(`Failed to parse PDF: ${error.message}`);
        }
    }

    /**
     * Extract text with position information
     */
    extractStructuredText(textContent) {
        const items = textContent.items;
        let currentY = null;
        let lines = [];
        let currentLine = [];

        items.forEach(item => {
            const y = Math.round(item.transform[5]);

            // New line detected
            if (currentY !== null && Math.abs(y - currentY) > 2) {
                if (currentLine.length > 0) {
                    lines.push(currentLine.join(' '));
                }
                currentLine = [];
            }

            currentY = y;
            currentLine.push(item.str);
        });

        if (currentLine.length > 0) {
            lines.push(currentLine.join(' '));
        }

        return lines.join('\n');
    }

    /**
     * Extract summary information (balances, totals) from PDF text
     */
    extractSummary(text) {
        const lines = text.split('\n');
        const amountPattern = /[\$£€]?\s*-?\d{1,3}(,\d{3})*(\.\d{2})?/g;

        for (const line of lines) {
            const lower = line.toLowerCase();

            // Extract beginning/opening balance
            if ((lower.includes('beginning balance') || lower.includes('opening balance') ||
                 lower.includes('previous balance') || lower.includes('balance forward')) &&
                !this.summary.beginningBalance) {
                const amounts = [...line.matchAll(amountPattern)];
                if (amounts.length > 0) {
                    this.summary.beginningBalance = this.parseAmount(amounts[amounts.length - 1][0]);
                }
            }

            // Extract ending/closing balance
            if ((lower.includes('ending balance') || lower.includes('closing balance') ||
                 lower.includes('new balance') || lower.includes('current balance')) &&
                !this.summary.endingBalance) {
                const amounts = [...line.matchAll(amountPattern)];
                if (amounts.length > 0) {
                    this.summary.endingBalance = this.parseAmount(amounts[amounts.length - 1][0]);
                }
            }

            // Extract total credits/deposits/payments
            if ((lower.includes('total credits') || lower.includes('total deposits') ||
                 lower.includes('total payments received') || lower.includes('deposits and credits')) &&
                !this.summary.totalCredits) {
                const amounts = [...line.matchAll(amountPattern)];
                if (amounts.length > 0) {
                    this.summary.totalCredits = this.parseAmount(amounts[amounts.length - 1][0]);
                }
            }

            // Extract total debits/withdrawals/charges
            if ((lower.includes('total debits') || lower.includes('total withdrawals') ||
                 lower.includes('total charges') || lower.includes('checks and debits')) &&
                !this.summary.totalDebits) {
                const amounts = [...line.matchAll(amountPattern)];
                if (amounts.length > 0) {
                    this.summary.totalDebits = this.parseAmount(amounts[amounts.length - 1][0]);
                }
            }
        }
    }

    /**
     * Parse amount string to number
     */
    parseAmount(amountStr) {
        if (!amountStr) return null;

        // Remove currency symbols, whitespace, and commas
        let cleaned = amountStr.replace(/[\$£€,\s]/g, '');

        // Handle negative amounts in parentheses
        if (cleaned.includes('(') && cleaned.includes(')')) {
            cleaned = '-' + cleaned.replace(/[()]/g, '');
        }

        const num = parseFloat(cleaned);
        return isNaN(num) ? null : num;
    }

    /**
     * Detect and extract table data from text
     */
    detectAndExtractTables(text) {
        const lines = text.split('\n').filter(line => line.trim().length > 0);

        // Common column headers for bank statements
        const commonHeaders = [
            'date', 'transaction date', 'post date', 'posted date',
            'description', 'memo', 'details', 'transaction', 'counterparty', 'merchant', 'vendor',
            'amount', 'debit', 'credit', 'balance', 'total',
            'reference', 'ref', 'check', 'type', 'category'
        ];

        let headerLine = -1;
        let detectedHeaders = [];

        // Try to find header line
        for (let i = 0; i < Math.min(20, lines.length); i++) {
            const line = lines[i].toLowerCase();
            const matchCount = commonHeaders.filter(h => line.includes(h)).length;

            if (matchCount >= 2) {
                headerLine = i;
                detectedHeaders = this.extractHeaders(lines[i]);
                break;
            }
        }

        let rows = [];

        if (headerLine >= 0 && detectedHeaders.length > 0) {
            // Parse rows based on detected headers
            for (let i = headerLine + 1; i < lines.length; i++) {
                // Skip non-transaction lines
                if (this.isHeaderOrFooter(lines[i])) continue;

                const row = this.parseRow(lines[i], detectedHeaders.length);
                if (row && row.length > 0) {
                    const rowObj = {};
                    detectedHeaders.forEach((header, idx) => {
                        rowObj[header] = row[idx] || '';
                    });
                    rows.push(rowObj);
                }
            }
        } else {
            // No clear headers, try pattern-based extraction
            rows = this.extractByPatterns(lines);
            detectedHeaders = rows.length > 0 ? Object.keys(rows[0]) : [];
        }

        return {
            columns: detectedHeaders,
            rows: rows
        };
    }

    /**
     * Extract headers from header line
     */
    extractHeaders(line) {
        // Split by multiple spaces or tabs
        const parts = line.split(/\s{2,}|\t/).filter(p => p.trim().length > 0);

        if (parts.length > 1) {
            return parts.map(h => h.trim());
        }

        // Fallback: common patterns
        const headerPatterns = [
            { regex: /date/i, name: 'Date' },
            { regex: /description|memo|details/i, name: 'Description' },
            { regex: /amount|debit|credit/i, name: 'Amount' },
            { regex: /balance/i, name: 'Balance' }
        ];

        const detected = [];
        headerPatterns.forEach(pattern => {
            if (pattern.regex.test(line)) {
                detected.push(pattern.name);
            }
        });

        return detected.length > 0 ? detected : ['Date', 'Description', 'Amount'];
    }

    /**
     * Parse a single row
     */
    parseRow(line, expectedColumns) {
        // Try multiple splitting strategies

        // Strategy 1: Multiple spaces or tabs
        let parts = line.split(/\s{2,}|\t/).filter(p => p.trim().length > 0);

        if (parts.length >= expectedColumns - 1) {
            return parts;
        }

        // Strategy 2: Detect date, amount patterns
        const datePattern = /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})|(\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2})/;
        const amountPattern = /[\$£€]?\s*-?\d{1,3}(,\d{3})*(\.\d{2})?/;

        const dateMatch = line.match(datePattern);
        const amountMatches = [...line.matchAll(new RegExp(amountPattern, 'g'))];

        if (dateMatch && amountMatches.length > 0) {
            const date = dateMatch[0];
            const amount = amountMatches[amountMatches.length - 1][0];

            let description = line
                .replace(date, '|||')
                .replace(amount, '|||')
                .split('|||')
                .filter(p => p.trim().length > 0)
                .join(' ')
                .trim();

            return [date, description, amount];
        }

        return null;
    }

    /**
     * Extract data by common patterns
     */
    extractByPatterns(lines) {
        const rows = [];
        const datePattern = /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})|(\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2})/;
        const amountPattern = /[\$£€]?\s*-?\d{1,3}(,\d{3})*(\.\d{2})?/g;

        for (const line of lines) {
            // Skip non-transaction lines
            if (this.isHeaderOrFooter(line)) continue;

            if (line.trim().length < 10) continue;

            const dateMatch = line.match(datePattern);
            if (!dateMatch) continue;

            const amountMatches = [...line.matchAll(amountPattern)];
            if (amountMatches.length === 0) continue;

            const date = dateMatch[0].trim();
            const amounts = amountMatches.map(m => m[0].trim());
            const amount = amounts[amounts.length - 1];

            // Extract description (everything except date and amounts)
            let description = line;
            description = description.replace(date, '');
            amounts.forEach(amt => {
                description = description.replace(amt, '');
            });
            description = description.trim();

            // Skip if description is empty or too short
            if (description.length < 3) continue;

            rows.push({
                'Date': date,
                'Description': description,
                'Amount': amount
            });
        }

        return rows;
    }

    /**
     * Parse line by line for unstructured data
     */
    parseLineByLine(text) {
        const lines = text.split('\n').filter(line => line.trim().length > 10);
        const rows = [];

        for (const line of lines) {
            // Skip likely headers or footers
            if (this.isHeaderOrFooter(line)) continue;

            rows.push({
                'Raw Text': line.trim()
            });
        }

        return rows;
    }

    /**
     * Detect if line is likely a header, footer, or summary (not a transaction)
     */
    isHeaderOrFooter(line) {
        const lower = line.toLowerCase();

        // Comprehensive list of non-transaction indicators
        const skipPatterns = [
            // Page indicators
            'page', 'page of', 'of page',

            // Summary lines
            'total', 'subtotal', 'grand total',
            'beginning balance', 'ending balance', 'opening balance', 'closing balance',
            'balance forward', 'balance brought forward', 'balance carried forward',

            // Credits/Debits totals
            'total credits', 'total debits', 'total payments', 'total deposits',
            'total withdrawals', 'total fees',

            // Headers
            'statement', 'account summary', 'transaction history',
            'account number', 'account holder', 'customer',
            'date', 'description', 'amount', 'balance',

            // Footers
            'continued', 'continued on next page',
            'please retain', 'important notice', 'member fdic',

            // Other common non-transaction text
            'activity summary', 'year-to-date', 'ytd',
            'interest charged', 'interest earned',
            'minimum payment', 'payment due'
        ];

        // Check if line matches any skip pattern
        if (skipPatterns.some(pattern => lower.includes(pattern))) {
            return true;
        }

        // Skip lines that are too short (likely not transactions)
        if (line.trim().length < 15) {
            return true;
        }

        // Skip lines that look like standalone dates (headers)
        const datePattern = /^(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})|(\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2})$/;
        if (datePattern.test(line.trim())) {
            return true;
        }

        return false;
    }

    /**
     * Detect columns from parsed data
     */
    detectColumnsFromData(rows) {
        if (rows.length === 0) return [];
        return Object.keys(rows[0]);
    }

    /**
     * Clean and normalize amount strings
     */
    normalizeAmount(amountStr) {
        if (!amountStr) return '0.00';

        // Remove currency symbols and whitespace
        let cleaned = amountStr.replace(/[\$£€,\s]/g, '');

        // Handle negative amounts in parentheses
        if (cleaned.includes('(') && cleaned.includes(')')) {
            cleaned = '-' + cleaned.replace(/[()]/g, '');
        }

        return cleaned;
    }

    /**
     * Normalize date strings
     */
    normalizeDate(dateStr) {
        if (!dateStr) return '';

        // Try to parse and format as YYYY-MM-DD
        const patterns = [
            /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/,  // MM/DD/YYYY or DD/MM/YYYY
            /(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/   // YYYY-MM-DD
        ];

        for (const pattern of patterns) {
            const match = dateStr.match(pattern);
            if (match) {
                return dateStr;  // Return as-is for now
            }
        }

        return dateStr;
    }
}
