// Global function exposure - Load this AFTER index.js
(function () {
    // Auth Check
    const userInfo = JSON.parse(localStorage.getItem('userInfo'));
    if (!userInfo) {
        window.location.href = 'login.html';
        return;
    }

    console.log('🔗 init.js: Starting function exposure...');

    // Role-based UI updates
    document.addEventListener('DOMContentLoaded', () => {
        const productivityBtn = Array.from(document.querySelectorAll('button')).find(btn => btn.textContent.trim() === 'Productivity View');
        const adminBtn = document.getElementById('adminLink');

        // Role-based visibility
        // Role 2 (User): No Productivity, No Admin
        // Role 3 (Manager): Has Productivity, No Admin
        // Role 1 (Admin): Has both
        // Role 0 (Top Admin): Has both

        if (userInfo.role === 2) {
            if (productivityBtn) productivityBtn.style.display = 'none';
        }

        // Admin control visibility in header is handled by header creation below
    });

    window.logout = () => {
        localStorage.removeItem('userInfo');
        window.location.href = 'login.html';
    };

    // UI creation
    document.addEventListener('DOMContentLoaded', () => {
        const header = document.querySelector('header');
        if (header) {
            const authDiv = document.createElement('div');
            authDiv.className = 'auth-controls ml-auto mr-4';

            // Show Admin link for Role 1 and Role 0
            const isAdmin = userInfo.role === 0 || userInfo.role === 1;

            authDiv.innerHTML = `
                <div class="flex flex-col items-end">
                    <span class="user-greeting">Hi, ${userInfo.username}</span>
                    <div class="flex gap-2 mt-1">
                        ${isAdmin ? '<a href="admin.html" class="nav-btn text-xs">Admin</a>' : ''}
                        <button onclick="logout()" class="nav-btn logout-btn text-xs">Logout</button>
                    </div>
                </div>
            `;
            // Insert before lastUpdate
            const lastUpdate = document.getElementById('lastUpdate');
            if (lastUpdate) {
                header.insertBefore(authDiv, lastUpdate);
            } else {
                header.appendChild(authDiv);
            }
        }
    });

    window.logout = () => {
        localStorage.removeItem('userInfo');
        window.location.href = 'login.html';
    };

    const functionsToExpose = {

        switchTab: window.switchTab || function () { console.error('switchTab not defined yet'); },
        fetchData: window.fetchData || function () { console.error('fetchData not defined yet'); },
        fetchSmartAnalysis: window.fetchSmartAnalysis || function () { console.error('fetchSmartAnalysis not defined yet'); },
        showTrend: window.showTrend || function () { },
        openHistory: window.openHistory || function () { },
        closeHistory: window.closeHistory || function () { },
        openLocationsModal: window.openLocationsModal || function () { },
        closeLocationsModal: window.closeLocationsModal || function () { },
        showLocationsModal: window.showLocationsModal || function () { },
        filterStaffByDate: window.filterStaffByDate || function () { },
        clearStaffDateFilter: window.clearStaffDateFilter || function () { },
        exportCurrentInventory: window.exportCurrentInventory || function () { }
    };

    // Expose all to window
    Object.assign(window, functionsToExpose);

    console.log('✅ init.js: Functions exposed:', {
        switchTab: typeof window.switchTab,
        fetchData: typeof window.fetchData,
        fetchSmartAnalysis: typeof window.fetchSmartAnalysis
    });

    // Initialize dashboard
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initDashboard);
    } else {
        initDashboard();
    }

    function initDashboard() {
        console.log('🚀 init.js: Dashboard Initialized');
        if (typeof window.fetchData === 'function') {
            console.log('📡 init.js: Calling fetchData...');
            window.fetchData();
        } else {
            console.error('❌ init.js: fetchData is not a function!');
        }
    }
})();
