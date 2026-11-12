// Function to handle "Update" button click - Visual Feedback
function updateBankRowsStatus() {
    const tbody = document.getElementById('bankDetailsBody');
    const rows = tbody.querySelectorAll('tr');

    rows.forEach(row => {
        const checkbox = row.querySelector('.batch-checkbox');
        if (checkbox) {
            const cells = row.querySelectorAll('td');

            if (checkbox.checked) {
                // Checked: Green Background, White Text
                row.style.setProperty('background-color', '#28a745', 'important');
                row.style.setProperty('color', '#fff', 'important');

                cells.forEach(cell => {
                    cell.style.setProperty('background-color', '#28a745', 'important');
                    cell.style.setProperty('color', '#fff', 'important');
                });
            } else {
                // Unchecked: Red Background, White Text
                row.style.setProperty('background-color', '#dc3545', 'important');
                row.style.setProperty('color', '#fff', 'important');

                cells.forEach(cell => {
                    cell.style.setProperty('background-color', '#dc3545', 'important');
                    cell.style.setProperty('color', '#fff', 'important');
                });
            }

            // Ensure inputs inside the row also look correct (transparent background if needed)
            const inputs = row.querySelectorAll('input, select');
            inputs.forEach(input => {
                input.style.setProperty('color', '#fff', 'important');
            });
        }
    });
}

