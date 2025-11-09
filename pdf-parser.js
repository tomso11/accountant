/**
 * PDF Parser Module
 * Handles browser-based PDF parsing with intelligent table detection
 */

class PDFParser {
    constructor() {
        this.rawText = '';
        this.parsedData = [];
        this.detectedColumns = [];
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
                rowCount: this.parsedData.length
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
     * Detect if line is likely a header or footer
     */
    isHeaderOrFooter(line) {
        const lower = line.toLowerCase();
        const skipPatterns = [
            'page', 'total', 'subtotal', 'balance forward',
            'continued', 'statement', 'account', 'customer',
            'beginning balance', 'ending balance'
        ];

        return skipPatterns.some(pattern => lower.includes(pattern));
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
