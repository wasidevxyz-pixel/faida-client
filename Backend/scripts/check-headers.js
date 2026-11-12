const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');

const filePath = path.join(__dirname, 'Export', 'item list.xlsx');
console.log(`Reading ${filePath}`);

const workbook = XLSX.readFile(filePath);
const sheetName = workbook.SheetNames[0];
const worksheet = workbook.Sheets[sheetName];

// Get headers
const headers = XLSX.utils.sheet_to_json(worksheet, { header: 1 })[0];
console.log('Headers:', headers);

// Write to file for clean reading
fs.writeFileSync('excel_headers.json', JSON.stringify(headers, null, 2));
console.log('Headers written to excel_headers.json');
