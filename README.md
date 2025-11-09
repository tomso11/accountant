# PDF to CSV Converter for Accountants

A browser-based tool that converts PDF bank statements (Brex, Chase, etc.) to CSV with high accuracy. All processing happens locally in your browser - no data is sent to any server, ensuring complete privacy and security.

## Features

- **Browser-Based Processing**: All PDF parsing happens in your browser using PDF.js - no server needed
- **Intelligent Table Detection**: Automatically detects columns like Date, Description, Amount, etc.
- **Customizable Columns**: Configure which columns to export and rename them as needed
- **Multiple Bank Support**: Works with statements from Brex, Chase, and other financial institutions
- **Data Type Recognition**: Automatically detects dates, amounts, and text fields
- **CSV Export**: Download clean, properly formatted CSV files
- **Privacy First**: No data leaves your computer - completely secure
- **Free & Open Source**: No API keys or subscriptions required

## Quick Start

### Option 1: Local Server (Recommended)

1. Clone or download this repository
2. Open a terminal in the project directory
3. Start a local server:
   ```bash
   python3 -m http.server 8000
   ```
   Or use npm:
   ```bash
   npm start
   ```
4. Open your browser to `http://localhost:8000`

### Option 2: Direct File Access

Simply open `index.html` in your browser (note: some browsers may restrict file access this way)

## How to Use

1. **Upload PDF**: Drag and drop your PDF bank statement or click to browse
2. **Review Data**: The app will automatically detect tables and extract data
3. **Configure Columns**:
   - Check/uncheck columns to include
   - Rename columns as needed
   - Set data types (Text, Date, Amount, Number)
   - Add custom columns if needed
4. **Download CSV**: Click "Download CSV" to get your formatted file

## Supported Bank Formats

The application works best with structured bank statements that include:
- Transaction dates
- Descriptions/Memos
- Amounts (debits/credits)
- Optional: Reference numbers, categories, balances

Tested with:
- Brex statements
- Chase bank statements
- Most standard bank statement PDFs with tabular data

## Column Configuration

### Auto-Detected Columns
The app automatically detects common columns:
- **Date**: Transaction or posting dates
- **Description/Memo**: Transaction details
- **Amount/Debit/Credit**: Transaction amounts
- **Counterparty/Merchant**: Business names
- **Category**: Transaction categories
- **Reference**: Check numbers or reference IDs

### Custom Columns
You can add custom columns with default values, useful for:
- Account identifiers
- Tags or labels
- Notes
- Any other metadata

## Technical Details

### Architecture
- **Frontend**: Pure HTML, CSS, JavaScript (no frameworks)
- **PDF Parsing**: PDF.js library (Mozilla)
- **Processing**: 100% client-side JavaScript
- **Export**: Native CSV generation

### Browser Compatibility
- Chrome/Edge: ✅ Fully supported
- Firefox: ✅ Fully supported
- Safari: ✅ Supported
- Mobile browsers: ✅ Basic support

### Performance
- Small PDFs (1-10 pages): < 2 seconds
- Medium PDFs (10-50 pages): 2-10 seconds
- Large PDFs (50+ pages): 10-30 seconds

*All processing times depend on your device performance*

## Privacy & Security

### Why It's Secure
- **No Server**: All processing happens in your browser
- **No Upload**: PDFs never leave your computer
- **No Storage**: No data is saved or cached
- **No Tracking**: No analytics or external connections (except PDF.js CDN)

### For Maximum Security
For highly sensitive documents, you can:
1. Download this repository
2. Download PDF.js locally instead of using CDN
3. Run completely offline

## Troubleshooting

### No Data Detected
- Ensure the PDF contains actual text (not scanned images)
- Try a different PDF if possible
- Check that the PDF has a table or structured transaction list

### Incorrect Parsing
- Some PDFs have complex layouts that may be challenging
- Try adjusting column mappings manually
- For best results, use PDFs generated directly from banking systems

### Performance Issues
- Large PDFs (100+ pages) may take time
- Close other browser tabs to free up memory
- Try processing smaller date ranges if possible

## Development

### Project Structure
```
accountant/
├── index.html          # Main UI
├── styles.css          # Styling
├── app.js             # Application logic
├── pdf-parser.js      # PDF parsing engine
├── package.json       # Project metadata
└── README.md          # This file
```

### How It Works
1. **PDF Upload**: User selects PDF file
2. **Text Extraction**: PDF.js extracts text with position data
3. **Table Detection**: Pattern matching identifies table structure
4. **Column Recognition**: Smart detection of dates, amounts, descriptions
5. **Data Mapping**: User configures column mappings
6. **CSV Generation**: Proper CSV formatting with escaping
7. **Download**: Browser downloads the generated CSV

### Extending the App
To add new features:
- **New column types**: Edit `app.js` `formatValue()` method
- **Better detection**: Enhance `pdf-parser.js` pattern matching
- **Custom parsing**: Add new detection rules in `extractByPatterns()`

## License

MIT License - feel free to use, modify, and distribute

## Contributing

Contributions welcome! Feel free to:
- Report issues
- Suggest features
- Submit pull requests
- Improve documentation

## Acknowledgments

- [PDF.js](https://mozilla.github.io/pdf.js/) by Mozilla for PDF parsing
- Inspired by the needs of accountants working with Brex and other modern banking platforms

---

**Need Help?** Open an issue on GitHub or check the troubleshooting section above.
