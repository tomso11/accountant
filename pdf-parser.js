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

        // Try to find header line - DON'T skip potential headers during this search
        for (let i = 0; i < Math.min(30, lines.length); i++) {
            const line = lines[i].toLowerCase();

            // Skip obvious non-header lines, but be permissive
            if (this.isDefinitelyNotHeader(line)) continue;

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
                    // Build row object
                    const rowObj = {};
                    detectedHeaders.forEach((header, idx) => {
                        rowObj[header] = row[idx] || '';
                    });

                    // Validate the row has actual transaction data
                    if (this.isValidRowObject(rowObj)) {
                        rows.push(rowObj);
                    }
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
     * Check if a line is definitely not a table header (for header detection only)
     */
    isDefinitelyNotHeader(line) {
        const lower = line.toLowerCase();

        // Only skip obvious non-headers during header search
        const definiteNonHeaders = [
            'we offer', 'we pay', 'we authorize', 'you may', 'you can',
            'if you', 'please note', 'for more information',
            'member fdic', 'para espanol', 'international calls',
            'brooklyn', 'columbus', 'chase bank'
        ];

        return definiteNonHeaders.some(pattern => lower.includes(pattern));
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

        // Strategy 1: Tabs (most reliable)
        let parts = line.split('\t').filter(p => p.trim().length > 0);

        if (parts.length >= expectedColumns - 1 && parts.length <= expectedColumns + 1) {
            return parts.map(p => p.trim());
        }

        // Strategy 2: Multiple spaces (2 or more)
        parts = line.split(/\s{2,}/).filter(p => p.trim().length > 0);

        if (parts.length >= expectedColumns - 1 && parts.length <= expectedColumns + 1) {
            return parts.map(p => p.trim());
        }

        // Strategy 3: Pattern-based extraction (date + description + amounts)
        const datePattern = /^(\d{1,2}[\/\-]\d{1,2}(?:[\/\-]\d{2,4})?)/;
        const amountPattern = /-?\$?[\d,]+\.\d{2}|-?\d{1,3}(?:,\d{3})+\.\d{2}/g;

        const dateMatch = line.match(datePattern);

        if (dateMatch) {
            const date = dateMatch[0].trim();
            let remaining = line.substring(date.length).trim();

            // Find all amounts in the remaining text
            const amountMatches = [...remaining.matchAll(new RegExp(amountPattern, 'g'))];

            if (amountMatches.length > 0) {
                // Build result array based on expected columns
                const result = [date];

                // Extract description (everything before the last amount)
                const lastAmountIndex = remaining.lastIndexOf(amountMatches[amountMatches.length - 1][0]);
                const description = remaining.substring(0, lastAmountIndex).trim();

                if (description.length > 0) {
                    result.push(description);
                }

                // Add amounts
                amountMatches.forEach(match => {
                    result.push(match[0].trim());
                });

                if (result.length >= 3) {
                    return result;
                }
            }
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

            // Additional validation for transactions
            if (!this.isValidTransaction(date, description, amount)) {
                continue;
            }

            rows.push({
                'Date': date,
                'Description': description,
                'Amount': amount
            });
        }

        return rows;
    }

    /**
     * Validate if a parsed row object is likely a real transaction
     */
    isValidRowObject(rowObj) {
        // Find date, description, and amount columns (case-insensitive)
        const keys = Object.keys(rowObj).map(k => k.toLowerCase());

        let dateValue = null;
        let descValue = null;
        let amountValue = null;

        // Find date column
        const dateKey = Object.keys(rowObj).find(k => {
            const lower = k.toLowerCase();
            return lower.includes('date') || lower.includes('time');
        });
        if (dateKey) dateValue = rowObj[dateKey];

        // Find description column
        const descKey = Object.keys(rowObj).find(k => {
            const lower = k.toLowerCase();
            return lower.includes('desc') || lower.includes('memo') ||
                   lower.includes('detail') || lower.includes('transaction');
        });
        if (descKey) descValue = rowObj[descKey];

        // Find amount column
        const amountKey = Object.keys(rowObj).find(k => {
            const lower = k.toLowerCase();
            return lower.includes('amount') || lower.includes('debit') ||
                   lower.includes('credit');
        });
        if (amountKey) amountValue = rowObj[amountKey];

        // If we have all three, validate them
        if (dateValue && descValue && amountValue) {
            return this.isValidTransaction(dateValue, descValue, amountValue);
        }

        // Otherwise, check if any value looks like a reasonable transaction
        const values = Object.values(rowObj).filter(v => v && v.toString().trim().length > 0);

        // Must have at least 2 non-empty values
        if (values.length < 2) return false;

        // Check if values contain obvious non-transaction content
        const combinedText = values.join(' ').toLowerCase();
        const badPatterns = [
            'overdraft', 'we offer', 'we pay', 'you may', 'please',
            'network', 'government', 'fednow', 'para espanol'
        ];

        for (const pattern of badPatterns) {
            if (combinedText.includes(pattern)) {
                return false;
            }
        }

        return true;
    }

    /**
     * Validate if a parsed line is likely a real transaction
     */
    isValidTransaction(date, description, amount) {
        // Description must have some content
        if (!description || description.length < 2) return false;

        // Description shouldn't be just numbers or special characters
        const hasLetters = /[a-zA-Z]/.test(description);
        if (!hasLetters) return false;

        // Amount should look reasonable (not just "111" or "212" - likely account numbers)
        const cleanAmount = amount.replace(/[\$£€,\s-]/g, '');
        const amountNum = parseFloat(cleanAmount);

        // Reject invalid amounts
        if (isNaN(amountNum) || amountNum === 0) return false;

        // Most transactions have cents (.XX)
        // If it's a whole number over 5000 with no decimals, it's suspicious (might be account number)
        if (amountNum > 5000 && !amount.includes('.')) {
            return false;
        }

        // Description shouldn't contain obvious non-transaction patterns
        const badDescPatterns = [
            /^\d{5,}$/,  // Just a long number
            /^[A-Z]{1,2}$/,  // Just 1-2 capital letters
            /\bor\b.*\bgovernment\b/i,
            /fees per business day/i,
            /during the time/i
        ];

        for (const pattern of badDescPatterns) {
            if (pattern.test(description)) {
                return false;
            }
        }

        return true;
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
        const trimmed = line.trim();

        // Comprehensive list of non-transaction indicators
        const skipPatterns = [
            // Page indicators
            'page of',

            // Summary lines (be specific to avoid false positives)
            'beginning balance', 'ending balance', 'opening balance', 'closing balance',
            'balance forward', 'balance brought forward', 'balance carried forward',
            'deposits and additions', 'withdrawals and subtractions',

            // Credits/Debits totals (very specific)
            'total credits', 'total debits', 'total payments', 'total deposits',
            'total withdrawals', 'total fees', 'electronic withdrawals',

            // Headers (only when they appear as standalone header rows)
            'account summary', 'transaction history', 'transaction detail',
            'account number', 'account holder',

            // Legal/Disclaimers
            'please note', 'please retain', 'important notice', 'member fdic',
            'overdraft', 'standard overdraft practice', 'chase secure',
            'we offer', 'we pay', 'we authorize', 'we wont', 'we can',
            'what you need', 'what is', 'what if', 'what fees',
            'this notice', 'agreement', 'deposit account', 'terms and conditions',
            'for more information',

            // Contact info
            'international calls', 'para espanol', 'accept operator',
            'www.', 'http',

            // Bank names and addresses
            'jpmorgan chase', 'chase bank', 'columbus, oh', 'brooklyn, ny',

            // Instructions (specific phrases)
            'you may', 'you can', 'you need', 'you must', 'to enroll',
            'an overdraft', 'whether', 'presented for payment',
            'appeared. be prepared',

            // Network/Payment systems
            'fednow', 'providers',

            // Fee related (non-transaction)
            'fees per business day', 'business days during',

            // Other common non-transaction text
            'activity summary', 'year-to-date',
            'interest charged', 'interest earned',
            'minimum payment', 'payment due',
            'checks and other', 'everyday debit card'
        ];

        // Check if line matches any skip pattern
        if (skipPatterns.some(pattern => lower.includes(pattern))) {
            return true;
        }

        // Skip lines that are too short (likely not transactions)
        if (trimmed.length < 10) {
            return true;
        }

        // Skip lines with too many consecutive capital letters (likely headers/legal)
        const capsSequence = trimmed.match(/[A-Z]{10,}/);
        if (capsSequence) {
            return true;
        }

        // Skip lines that look like standalone dates (headers)
        const datePattern = /^(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})|(\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2})$/;
        if (datePattern.test(trimmed)) {
            return true;
        }

        // Skip lines with obvious statement period
        if (lower.includes('through') && lower.match(/\d{4}/)) {
            return true;
        }

        // Skip lines that start with * (markers)
        if (trimmed.startsWith('*')) {
            return true;
        }

        // Skip lines with common non-transaction words at the start (only very specific ones)
        const startsWithNonTransaction = [
            'we offer', 'we pay', 'we authorize', 'we also',
            'please ', 'what ', 'whether ',
            'if you', 'during the time', 'appeared'
        ];
        if (startsWithNonTransaction.some(start => lower.startsWith(start))) {
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
