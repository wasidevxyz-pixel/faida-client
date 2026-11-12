// Script to update all HTML pages with page access control
const fs = require('fs');
const path = require('path');

const publicDir = path.join(__dirname, '../public');
const htmlFiles = [
    'dashboard.html',
    'items.html', 
    'parties.html',
    'sales.html',
    'purchases.html',
    'payments.html',
    'receipts.html',
    'expenses.html',
    'stock.html',
    'reports.html',
    'settings.html'
];

const pageAccessScript = '<!-- Page Access Control -->\n    <script src="js/pageAccess.js"></script>';

htmlFiles.forEach(file => {
    const filePath = path.join(publicDir, file);
    
    if (fs.existsSync(filePath)) {
        let content = fs.readFileSync(filePath, 'utf8');
        
        // Check if page access script is already included
        if (!content.includes('pageAccess.js')) {
            // Find the closing </head> tag and insert before it
            const headEndIndex = content.indexOf('</head>');
            if (headEndIndex !== -1) {
                content = content.slice(0, headEndIndex) + 
                         pageAccessScript + '\n' + 
                         content.slice(headEndIndex);
                
                fs.writeFileSync(filePath, content);
                console.log(`Updated ${file} with page access control`);
            }
        }
    }
});

console.log('Page access control update completed!');
