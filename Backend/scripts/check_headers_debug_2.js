const XLSX = require('xlsx');
const path = require('path');
const file = path.join(__dirname, 'Export/item list.xlsx');
const wb = XLSX.readFile(file);
const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 });
console.log('Row 1 Length:', rows[0].length);
console.log('Row 1 Data:', JSON.stringify(rows[0]));
