// Populate Bank Detail Bank Dropdown with Grouped Banks
async function populateBDBank() {
    try {
        const token = localStorage.getItem('token');
        const res = await fetch('/api/v1/banks', { headers: { 'Authorization': `Bearer ${token}` } });
        const data = await res.json();

        if (data.success) {
            const select = document.getElementById('bd-bank-select');
            if (!select) return;

            select.innerHTML = '<option value="">All Banks</option>';

            const epIds = [];
            const jcIds = [];
            const bbIds = [];

            data.data.forEach(b => {
                const name = (b.bankName || '').toUpperCase();
                if (name.includes('EASYPAISA')) {
                    epIds.push(b._id);
                } else if (name.includes('JAZZ CASH') || name.includes('JAZZCASH')) {
                    jcIds.push(b._id);
                } else {
                    bbIds.push(b._id);
                }
            });

            if (epIds.length > 0) {
                const opt = document.createElement('option');
                opt.value = 'GROUP_EP';
                opt.textContent = 'Easypaisa';
                opt.dataset.ids = epIds.join(',');
                select.appendChild(opt);
            }

            if (jcIds.length > 0) {
                const opt = document.createElement('option');
                opt.value = 'GROUP_JC';
                opt.textContent = 'Jazz Cash';
                opt.dataset.ids = jcIds.join(',');
                select.appendChild(opt);
            }

            if (bbIds.length > 0) {
                const opt = document.createElement('option');
                opt.value = 'GROUP_BB';
                opt.textContent = 'Branch Bank';
                opt.dataset.ids = bbIds.join(',');
                select.appendChild(opt);
            }
        }
    } catch (e) {
        console.error('Error loading BD banks', e);
    }
}

// Call this on page load
window.addEventListener('DOMContentLoaded', () => {
    populateBDBank();
});

