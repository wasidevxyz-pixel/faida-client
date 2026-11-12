// Browser Console Script to Duplicate Suppliers
// Open your browser, go to the Parties page, press F12, and paste this in the Console

async function duplicateSuppliersInBrowser() {
    const token = localStorage.getItem('token');

    if (!token) {
        console.error('❌ Not logged in!');
        return;
    }

    const sourceBranch = 'Chandni Chowk'; // Change if needed
    const targetBranches = ['IC-5 Market', 'G-15 Markaz', 'PWD-1', 'PWD-2'];

    try {
        // 1. Get all suppliers from source branch
        console.log(`Fetching suppliers from ${sourceBranch}...`);
        const response = await fetch(`/api/v1/parties?partyType=supplier&branch=${sourceBranch}&limit=1000`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        const data = await response.json();

        if (!data.success || !data.data || data.data.length === 0) {
            console.error(`❌ No suppliers found in ${sourceBranch}`);
            console.log('Available suppliers:', data);
            return;
        }

        console.log(`✓ Found ${data.data.length} suppliers in ${sourceBranch}`);

        let created = 0;
        let skipped = 0;

        // 2. For each target branch
        for (const targetBranch of targetBranches) {
            console.log(`\nProcessing ${targetBranch}...`);

            // 3. For each supplier
            for (const supplier of data.data) {
                // Check if exists
                const checkResponse = await fetch(`/api/v1/parties?partyType=supplier&branch=${targetBranch}&search=${supplier.name}&limit=1`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const checkData = await checkResponse.json();

                if (checkData.data && checkData.data.length > 0) {
                    console.log(`  - Skipped: ${supplier.name} (already exists)`);
                    skipped++;
                    continue;
                }

                // Create new supplier
                const newSupplier = {
                    name: supplier.name,
                    branch: targetBranch,
                    partyType: 'supplier',
                    phone: supplier.phone,
                    mobile: supplier.mobile,
                    email: supplier.email,
                    address: supplier.address,
                    taxNumber: supplier.taxNumber,
                    panNumber: supplier.panNumber,
                    category: supplier.category,
                    openingBalance: 0,
                    currentBalance: 0,
                    isActive: true
                };

                const createResponse = await fetch('/api/v1/parties', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify(newSupplier)
                });

                if (createResponse.ok) {
                    console.log(`  ✓ Created: ${supplier.name}`);
                    created++;
                } else {
                    console.error(`  ✗ Failed: ${supplier.name}`);
                }

                // Small delay to avoid overwhelming the server
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }

        console.log(`\n✅ Done!`);
        console.log(`Created: ${created}`);
        console.log(`Skipped: ${skipped}`);
        console.log('\nRefresh the page to see the new suppliers!');

    } catch (error) {
        console.error('❌ Error:', error);
    }
}

// Run the function
duplicateSuppliersInBrowser();
