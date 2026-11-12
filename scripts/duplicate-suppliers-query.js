// MongoDB Aggregation Query to duplicate suppliers to all branches
// Copy and paste this into MongoDB Compass Aggregation tab

// Step 1: Get all suppliers from Chandni Chowk
db.parties.find({
    branch: "Chandni Chowk",
    partyType: "supplier"
})

// Step 2: For each supplier, create copies for other branches
// Run this in MongoDB Compass Shell or mongosh:

const sourceBranch = "Chandni Chowk";
const targetBranches = ["IC-5 Market", "G-15 Markaz", "PWD-1", "PWD-2"];

db.parties.find({ branch: sourceBranch, partyType: "supplier" }).forEach(function (supplier) {
    targetBranches.forEach(function (targetBranch) {
        // Check if already exists
        const exists = db.parties.findOne({
            name: supplier.name,
            branch: targetBranch,
            partyType: "supplier"
        });

        if (!exists) {
            // Create new supplier
            const newSupplier = {
                ...supplier,
                _id: ObjectId(),
                branch: targetBranch,
                code: supplier.code.replace(sourceBranch.substring(0, 3), targetBranch.substring(0, 3)),
                currentBalance: 0,
                openingBalance: 0,
                createdAt: new Date(),
                updatedAt: new Date()
            };

            delete newSupplier._id; // Let MongoDB generate new ID
            db.parties.insertOne(newSupplier);
            print("Created: " + supplier.name + " in " + targetBranch);
        } else {
            print("Skipped: " + supplier.name + " (already exists in " + targetBranch + ")");
        }
    });
});

print("✅ Done!");
