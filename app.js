/**
 * Main Application Logic
 * Handles UI interactions, file uploads, and CSV export
 */

class PDFToCSVApp {
    constructor() {
        this.parser = new PDFParser();
        this.currentData = [];
        this.columnMapping = [];
        this.summary = null;
        this.initializeEventListeners();
    }

    initializeEventListeners() {
        // File input and drop zone
        const dropZone = document.getElementById('dropZone');
        const fileInput = document.getElementById('fileInput');

        dropZone.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', (e) => this.handleFileSelect(e.target.files[0]));

        // Drag and drop
        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.classList.add('drag-over');
        });

        dropZone.addEventListener('dragleave', () => {
            dropZone.classList.remove('drag-over');
        });

        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.classList.remove('drag-over');
            const file = e.dataTransfer.files[0];
            if (file && file.type === 'application/pdf') {
                this.handleFileSelect(file);
            } else {
                alert('Please drop a PDF file');
            }
        });

        // Action buttons
        document.getElementById('downloadBtn').addEventListener('click', () => this.downloadCSV());
        document.getElementById('resetBtn').addEventListener('click', () => this.reset());
        document.getElementById('addColumnBtn').addEventListener('click', () => this.addCustomColumn());
    }

    async handleFileSelect(file) {
        if (!file) return;

        if (file.type !== 'application/pdf') {
            alert('Please select a PDF file');
            return;
        }

        try {
            // Show processing UI
            this.showSection('processingSection');
            this.updateProcessingText('Reading PDF file...');

            // Parse PDF
            this.updateProcessingText('Extracting data from PDF...');
            const result = await this.parser.parsePDF(file);

            this.updateProcessingText('Analyzing table structure...');
            await this.sleep(300); // Brief pause for UX

            if (!result.success || result.rowCount === 0) {
                throw new Error('No data found in PDF. Please ensure the PDF contains a table or transaction list.');
            }

            this.currentData = result.data;
            this.summary = result.summary;

            // Initialize column mapping from detected columns
            this.initializeColumnMapping(result.columns);

            // Show preview
            this.updateProcessingText('Preparing preview...');
            await this.sleep(300);

            this.hideSection('processingSection');
            this.renderSummary();
            this.renderPreview();
            this.showSection('previewSection');

        } catch (error) {
            console.error('Error processing PDF:', error);
            this.hideSection('processingSection');
            alert(`Error: ${error.message}`);
        }
    }

    initializeColumnMapping(detectedColumns) {
        this.columnMapping = [];

        // Auto-detect and map common columns
        detectedColumns.forEach(col => {
            const normalized = col.toLowerCase().trim();
            let suggestedType = 'text';
            let suggestedName = col;

            // Smart column type detection
            if (normalized.includes('date') || normalized.includes('time')) {
                suggestedType = 'date';
                suggestedName = 'Date';
            } else if (normalized.includes('amount') || normalized.includes('debit') ||
                       normalized.includes('credit') || normalized.includes('balance')) {
                suggestedType = 'amount';
                suggestedName = normalized.includes('debit') ? 'Debit' :
                               normalized.includes('credit') ? 'Credit' : 'Amount';
            } else if (normalized.includes('description') || normalized.includes('memo') ||
                       normalized.includes('details') || normalized.includes('transaction')) {
                suggestedType = 'text';
                suggestedName = 'Description';
            } else if (normalized.includes('merchant') || normalized.includes('counterparty') ||
                       normalized.includes('vendor')) {
                suggestedType = 'text';
                suggestedName = 'Counterparty';
            } else if (normalized.includes('category') || normalized.includes('type')) {
                suggestedType = 'text';
                suggestedName = 'Category';
            } else if (normalized.includes('reference') || normalized.includes('ref') ||
                       normalized.includes('check')) {
                suggestedType = 'text';
                suggestedName = 'Reference';
            }

            this.columnMapping.push({
                sourceColumn: col,
                outputName: suggestedName,
                type: suggestedType,
                include: true
            });
        });
    }

    renderSummary() {
        if (!this.summary) return;

        const summarySection = document.getElementById('summarySection');
        const hasSummaryData = this.summary.beginningBalance !== null ||
                               this.summary.endingBalance !== null ||
                               this.summary.totalCredits !== null ||
                               this.summary.totalDebits !== null;

        if (!hasSummaryData) {
            summarySection.classList.add('hidden');
            return;
        }

        summarySection.classList.remove('hidden');

        // Format and display summary values
        document.getElementById('beginningBalance').textContent =
            this.summary.beginningBalance !== null
                ? this.formatCurrency(this.summary.beginningBalance)
                : '-';

        document.getElementById('totalCredits').textContent =
            this.summary.totalCredits !== null
                ? this.formatCurrency(this.summary.totalCredits)
                : '-';

        document.getElementById('totalDebits').textContent =
            this.summary.totalDebits !== null
                ? this.formatCurrency(this.summary.totalDebits)
                : '-';

        document.getElementById('endingBalance').textContent =
            this.summary.endingBalance !== null
                ? this.formatCurrency(this.summary.endingBalance)
                : '-';
    }

    formatCurrency(amount) {
        const absAmount = Math.abs(amount);
        const formatted = new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(absAmount);

        return amount < 0 ? `(${formatted})` : formatted;
    }

    renderPreview() {
        // Render column configuration
        this.renderColumnConfig();

        // Render data table
        this.renderDataTable();
    }

    renderColumnConfig() {
        const configContainer = document.getElementById('columnConfig');
        configContainer.innerHTML = '';

        this.columnMapping.forEach((mapping, index) => {
            const columnItem = document.createElement('div');
            columnItem.className = 'column-item';

            columnItem.innerHTML = `
                <label>
                    <input type="checkbox" ${mapping.include ? 'checked' : ''}
                           onchange="app.toggleColumn(${index})"
                           style="margin-right: 0.5rem;">
                    ${mapping.sourceColumn}
                </label>
                <input type="text"
                       value="${mapping.outputName}"
                       onchange="app.updateColumnName(${index}, this.value)"
                       placeholder="Column name">
                <select onchange="app.updateColumnType(${index}, this.value)">
                    <option value="text" ${mapping.type === 'text' ? 'selected' : ''}>Text</option>
                    <option value="date" ${mapping.type === 'date' ? 'selected' : ''}>Date</option>
                    <option value="amount" ${mapping.type === 'amount' ? 'selected' : ''}>Amount</option>
                    <option value="number" ${mapping.type === 'number' ? 'selected' : ''}>Number</option>
                </select>
                <button class="btn btn-danger" onclick="app.removeColumn(${index})">×</button>
            `;

            configContainer.appendChild(columnItem);
        });
    }

    renderDataTable() {
        const thead = document.getElementById('tableHead');
        const tbody = document.getElementById('tableBody');

        // Clear existing content
        thead.innerHTML = '';
        tbody.innerHTML = '';

        // Get active columns
        const activeColumns = this.columnMapping.filter(m => m.include);

        if (activeColumns.length === 0) {
            tbody.innerHTML = '<tr><td colspan="100%" style="text-align: center; padding: 2rem; color: var(--text-secondary);">No columns selected</td></tr>';
            return;
        }

        // Render header
        const headerRow = document.createElement('tr');
        activeColumns.forEach(mapping => {
            const th = document.createElement('th');
            th.textContent = mapping.outputName;
            headerRow.appendChild(th);
        });
        thead.appendChild(headerRow);

        // Render data rows (limit to first 100 for performance)
        const displayRows = this.currentData.slice(0, 100);
        displayRows.forEach(row => {
            const tr = document.createElement('tr');

            activeColumns.forEach(mapping => {
                const td = document.createElement('td');
                const value = row[mapping.sourceColumn] || '';
                td.textContent = this.formatValue(value, mapping.type);
                tr.appendChild(td);
            });

            tbody.appendChild(tr);
        });

        // Update row count
        document.getElementById('rowCount').textContent = this.currentData.length;

        if (this.currentData.length > 100) {
            const infoRow = document.createElement('tr');
            const infoCell = document.createElement('td');
            infoCell.colSpan = activeColumns.length;
            infoCell.style.textAlign = 'center';
            infoCell.style.padding = '1rem';
            infoCell.style.color = 'var(--text-secondary)';
            infoCell.textContent = `Showing first 100 rows. All ${this.currentData.length} rows will be included in CSV download.`;
            infoRow.appendChild(infoCell);
            tbody.appendChild(infoRow);
        }
    }

    formatValue(value, type) {
        if (!value) return '';

        switch (type) {
            case 'amount':
                // Remove currency symbols, normalize
                return value.replace(/[\$£€]/g, '').trim();
            case 'date':
                return value.trim();
            case 'number':
                return value.replace(/[^\d.-]/g, '');
            default:
                return value;
        }
    }

    toggleColumn(index) {
        this.columnMapping[index].include = !this.columnMapping[index].include;
        this.renderDataTable();
    }

    updateColumnName(index, newName) {
        this.columnMapping[index].outputName = newName;
        this.renderDataTable();
    }

    updateColumnType(index, newType) {
        this.columnMapping[index].type = newType;
        this.renderDataTable();
    }

    removeColumn(index) {
        this.columnMapping.splice(index, 1);
        this.renderColumnConfig();
        this.renderDataTable();
    }

    addCustomColumn() {
        const name = prompt('Enter column name:');
        if (!name) return;

        const defaultValue = prompt('Enter default value (or leave empty):') || '';

        this.columnMapping.push({
            sourceColumn: '__custom__' + Date.now(),
            outputName: name,
            type: 'text',
            include: true,
            defaultValue: defaultValue
        });

        this.renderColumnConfig();
        this.renderDataTable();
    }

    downloadCSV() {
        const activeColumns = this.columnMapping.filter(m => m.include);

        if (activeColumns.length === 0) {
            alert('Please select at least one column');
            return;
        }

        // Build CSV content
        let csv = '';

        // Header row
        const headers = activeColumns.map(m => this.escapeCSV(m.outputName));
        csv += headers.join(',') + '\n';

        // Data rows
        this.currentData.forEach(row => {
            const values = activeColumns.map(mapping => {
                let value;

                if (mapping.sourceColumn.startsWith('__custom__')) {
                    value = mapping.defaultValue || '';
                } else {
                    value = row[mapping.sourceColumn] || '';
                }

                value = this.formatValue(value, mapping.type);
                return this.escapeCSV(value);
            });

            csv += values.join(',') + '\n';
        });

        // Create download
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);

        const timestamp = new Date().toISOString().slice(0, 10);
        link.setAttribute('href', url);
        link.setAttribute('download', `bank_statement_${timestamp}.csv`);
        link.style.visibility = 'hidden';

        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    escapeCSV(value) {
        if (typeof value !== 'string') {
            value = String(value);
        }

        // Escape quotes and wrap in quotes if contains comma, quote, or newline
        if (value.includes(',') || value.includes('"') || value.includes('\n')) {
            value = '"' + value.replace(/"/g, '""') + '"';
        }

        return value;
    }

    reset() {
        this.currentData = [];
        this.columnMapping = [];
        this.summary = null;
        document.getElementById('fileInput').value = '';
        this.hideSection('summarySection');
        this.hideSection('previewSection');
        this.hideSection('processingSection');
        this.showSection('uploadSection');
    }

    showSection(sectionId) {
        document.getElementById(sectionId).classList.remove('hidden');
    }

    hideSection(sectionId) {
        document.getElementById(sectionId).classList.add('hidden');
    }

    updateProcessingText(text) {
        document.getElementById('processingText').textContent = text;
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Initialize app when DOM is loaded
let app;
document.addEventListener('DOMContentLoaded', () => {
    app = new PDFToCSVApp();
});
