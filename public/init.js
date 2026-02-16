// Global function exposure - Load this AFTER index.js
(function() {
    console.log('🔗 init.js: Starting function exposure...');
    
    // Check if functions exist before exposing
    const functionsToExpose = {
        switchTab: window.switchTab || function(){ console.error('switchTab not defined yet'); },
        fetchData: window.fetchData || function(){ console.error('fetchData not defined yet'); },
        fetchSmartAnalysis: window.fetchSmartAnalysis || function(){ console.error('fetchSmartAnalysis not defined yet'); },
        showTrend: window.showTrend || function(){},
        openHistory: window.openHistory || function(){},
        closeHistory: window.closeHistory || function(){},
        openLocationsModal: window.openLocationsModal || function(){},
        closeLocationsModal: window.closeLocationsModal || function(){},
        showLocationsModal: window.showLocationsModal || function(){},
        filterStaffByDate: window.filterStaffByDate || function(){},
        clearStaffDateFilter: window.clearStaffDateFilter || function(){},
        exportCurrentInventory: window.exportCurrentInventory || function(){}
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
