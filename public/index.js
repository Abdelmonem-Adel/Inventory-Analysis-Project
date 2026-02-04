        let chart;
        let auditCharts = { accuracy: null, distribution: null };
        let auditDiscrepancies = []; // Global to store raw discrepancy data
        let allData = [];
        let currentTab = 'inventory';

        function switchTab(tab) {
            currentTab = tab;
            const invView = document.getElementById('view-inventory');
            const auditView = document.getElementById('view-audit');
            const invTabBtn = document.getElementById('tab-inventory');
            const auditTabBtn = document.getElementById('tab-audit');

            if (tab === 'inventory') {
                invView.classList.remove('hidden');
                auditView.classList.add('hidden');
                invTabBtn.className = "px-4 py-2 rounded-lg font-semibold text-sm transition-all bg-blue-600 text-white shadow-md";
                auditTabBtn.className = "px-4 py-2 rounded-lg font-semibold text-sm transition-all bg-white text-slate-600 border border-slate-200 hover:bg-slate-50";
                fetchData();
            } else {
                invView.classList.add('hidden');
                auditView.classList.remove('hidden');
                auditTabBtn.className = "px-4 py-2 rounded-lg font-semibold text-sm transition-all bg-blue-600 text-white shadow-md";
                invTabBtn.className = "px-4 py-2 rounded-lg font-semibold text-sm transition-all bg-white text-slate-600 border border-slate-200 hover:bg-slate-50";
                fetchSmartAnalysis();
            }
        }

        async function fetchSmartAnalysis() {
            try {
                document.getElementById('lastUpdate').innerText = 'Analyzing Audit...';
                const res = await fetch('/api/inventory/analysis');
                const data = await res.json();
                
                if (data.error) {
                    console.warn("Audit API returned an error:", data.error);
                    document.getElementById('lastUpdate').innerText = 'Notice: ' + data.error;
                    updateAuditDashboard(data);
                    return;
                }

                auditDiscrepancies = data.discrepanciesArr || []; // Important: Store for client-side filtering
                updateAuditDashboard(data);
                setupAuditFilters(); // Initialize listeners
                document.getElementById('lastUpdate').innerText = 'Audit Updated: ' + new Date().toLocaleTimeString();
            } catch (err) {
                console.error("Audit Fetch error:", err);
                document.getElementById('lastUpdate').innerText = 'Audit Error';
            }
        }

        function updateAuditDashboard(data) {
            // Alerts
            const alertsDiv = document.getElementById('auditAlerts');
            alertsDiv.innerHTML = data.alerts.map(a => `
                <div class="p-4 rounded-lg flex items-center justify-between ${a.type === 'critical' ? 'bg-red-50 text-red-800 border-l-4 border-red-600' : 'bg-orange-50 text-orange-800 border-l-4 border-orange-600'}">
                    <div class="flex items-center">
                        <svg class="w-5 h-5 mr-3" fill="currentColor" viewBox="0 0 20 20"><path d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"/></svg>
                        <div>
                            <p class="font-bold text-sm">${a.message}</p>
                            <p class="text-xs opacity-75">Recommended Action: ${a.action}</p>
                        </div>
                    </div>
                </div>
            `).join('');

            // KPIs
            document.getElementById('auditAccuracy').innerText = `${data.kpis.overallAccuracy.toFixed(1)}%`;
            document.getElementById('accuracyBar').style.width = `${data.kpis.overallAccuracy}%`;
            document.getElementById('auditMatched').innerText = data.kpis.totalMatched.toLocaleString();
            document.getElementById('auditExtra').innerText = data.kpis.totalExtra.toLocaleString();
            document.getElementById('auditMissing').innerText = data.kpis.totalMissing.toLocaleString();

            // Location Accuracy Chart
            const locCtx = document.getElementById('locationAccuracyChart').getContext('2d');
            if (auditCharts.accuracy) auditCharts.accuracy.destroy();
            auditCharts.accuracy = new Chart(locCtx, {
                type: 'bar',
                data: {
                    labels: data.chartData.locationAccuracy.labels,
                    datasets: [{
                        label: 'Accuracy %',
                        data: data.chartData.locationAccuracy.datasets,
                        backgroundColor: data.chartData.locationAccuracy.datasets.map(v => v > 90 ? '#10b981' : v > 80 ? '#3b82f6' : '#f59e0b'),
                        borderRadius: 6
                    }]
                },
                options: { 
                    indexAxis: 'y', 
                    responsive: true, 
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: { x: { max: 100, beginAtZero: true } }
                }
            });

            // Location Details Table
            const locationTable = document.getElementById('locationDetailsTable');
            const locationEntries = Object.entries(data.locationReport || {})
                .sort((a, b) => b[1].accuracy - a[1].accuracy); // Sort by accuracy descending
            
            locationTable.innerHTML = locationEntries.map(([name, loc]) => `
                <tr class="hover:bg-slate-50 transition-colors">
                    <td class="px-4 py-3 font-bold text-slate-800">${name}</td>
                    <td class="px-4 py-3 text-center font-medium text-slate-600">${loc.totalItems}</td>
                    <td class="px-4 py-3 text-center font-bold text-green-600">${loc.matched}</td>
                    <td class="px-4 py-3 text-center font-bold text-orange-600">${loc.extra}</td>
                    <td class="px-4 py-3 text-center font-bold text-red-600">${loc.missing}</td>
                    <td class="px-4 py-3 text-center">
                        <span class="px-3 py-1 text-xs font-medium rounded-full ${
                            loc.mostCommonStatus && loc.mostCommonStatus.toLowerCase().includes('مطابق') ? 'bg-green-100 text-green-700' :
                            loc.mostCommonStatus && loc.mostCommonStatus.toLowerCase().includes('match') ? 'bg-green-100 text-green-700' :
                            loc.mostCommonStatus && (loc.mostCommonStatus.toLowerCase().includes('extra') || loc.mostCommonStatus.toLowerCase().includes('زيادة')) ? 'bg-orange-100 text-orange-700' :
                            loc.mostCommonStatus && (loc.mostCommonStatus.toLowerCase().includes('miss') || loc.mostCommonStatus.toLowerCase().includes('ناقص')) ? 'bg-red-100 text-red-700' :
                            'bg-slate-100 text-slate-600'
                        }">
                            ${loc.mostCommonStatus || 'N/A'}
                        </span>
                    </td>
                    <td class="px-4 py-3 text-right">
                        <div class="flex items-center justify-end">
                            <span class="font-bold mr-2 ${loc.accuracy > 90 ? 'text-green-600' : loc.accuracy > 80 ? 'text-blue-600' : 'text-orange-600'}">
                                ${loc.accuracy.toFixed(1)}%
                            </span>
                            <div class="w-20 bg-slate-100 h-2 rounded-full">
                                <div class="h-2 rounded-full ${loc.accuracy > 90 ? 'bg-green-500' : loc.accuracy > 80 ? 'bg-blue-500' : 'bg-orange-500'}" 
                                     style="width: ${loc.accuracy}%"></div>
                            </div>
                        </div>
                    </td>
                </tr>
            `).join('');

            // Status Distribution Chart
            const distCtx = document.getElementById('statusDistChart').getContext('2d');
            if (auditCharts.distribution) auditCharts.distribution.destroy();
            auditCharts.distribution = new Chart(distCtx, {
                type: 'doughnut',
                data: {
                    labels: data.chartData.statusDistribution.labels,
                    datasets: [{
                        data: data.chartData.statusDistribution.datasets,
                        backgroundColor: ['#10b981', '#f59e0b', '#ef4444'],
                        borderWidth: 0
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    cutout: '70%',
                    plugins: { legend: { position: 'bottom' } }
                }
            });

            // Expiry Table
            const expiryRows = data.expiryAnalysis.expired.concat(data.expiryAnalysis.expiring7Days);
            document.getElementById('expiryCount').innerText = `${expiryRows.length} Items`;
            const expiryTbody = document.getElementById('expiryTable');
            expiryTbody.innerHTML = expiryRows.map(item => `
                <tr class="hover:bg-slate-50 transition-colors">
                    <td class="px-4 py-3">
                        <p class="font-medium text-slate-800">${item.productName}</p>
                        <p class="text-xs text-slate-400 font-mono">${item.productId}</p>
                    </td>
                    <td class="px-4 py-3 text-slate-600">${item.location}</td>
                    <td class="px-4 py-3 text-right font-bold ${new Date(item.expiryDate) < new Date() ? 'text-red-600' : 'text-orange-600'}">
                        ${new Date(item.expiryDate).toLocaleDateString()}
                    </td>
                </tr>
            `).join('');

            // Problematic Products
            const problematicDiv = document.getElementById('problematicList');
            const stabilityInsights = data.insights.find(i => i.type === 'product_stability');
            if (stabilityInsights) {
                problematicDiv.innerHTML = stabilityInsights.details.map(name => `
                    <div class="flex items-center p-3 bg-red-50 border border-red-100 rounded-lg">
                        <div class="w-8 h-8 rounded-full bg-red-100 text-red-600 flex items-center justify-center mr-3 font-bold text-xs">!</div>
                        <span class="text-sm font-medium text-slate-700">${name}</span>
                    </div>
                `).join('');
            } else {
                problematicDiv.innerHTML = '<p class="text-sm text-slate-400 text-center py-8">No recurring stability issues detected.</p>';
            }

            // Staff Performance Table
            const staffTbody = document.getElementById('staffTable');
            staffTbody.innerHTML = Object.entries(data.staffReport)
                .sort((a, b) => b[1].total - a[1].total) // Sort by most active
                .filter(([name]) => name !== 'System') // Optional: focus on real workers
                .map(([name, s]) => `
                    <tr class="hover:bg-slate-50 transition-colors">
                        <td class="px-6 py-4 font-bold text-slate-800">${name}</td>
                        <td class="px-6 py-4 text-center font-medium">${s.total}</td>
                        <td class="px-6 py-4 text-center text-green-600 font-bold">${s.match}</td>
                        <td class="px-6 py-4 text-center text-red-600 font-bold">${s.missing}</td>
                        <td class="px-6 py-4">
                            <div class="flex items-center">
                                <span class="font-bold mr-2 ${s.accuracy > 95 ? 'text-green-600' : s.accuracy > 85 ? 'text-blue-600' : 'text-orange-600'}">
                                    ${s.accuracy.toFixed(1)}%
                                </span>
                                <div class="flex-1 bg-slate-100 h-1.5 rounded-full min-w-[60px]">
                                    <div class="h-1.5 rounded-full ${s.accuracy > 95 ? 'bg-green-500' : s.accuracy > 85 ? 'bg-blue-500' : 'bg-orange-500'}" style="width: ${s.accuracy}%"></div>
                                </div>
                            </div>
                        </td>
                    </tr>
                `).join('');
            
            // Re-add System if needed at the bottom
            const sys = data.staffReport['System'];
            if (sys) {
                staffTbody.innerHTML += `
                    <tr class="bg-slate-50 opacity-75">
                        <td class="px-6 py-4 italic text-slate-500">System / Unassigned</td>
                        <td class="px-6 py-4 text-center font-medium">${sys.total}</td>
                        <td class="px-6 py-4 text-center text-green-600 font-bold">${sys.match}</td>
                        <td class="px-6 py-4 text-center text-red-600 font-bold">${sys.missing}</td>
                        <td class="px-6 py-4 text-slate-400">N/A</td>
                    </tr>
                `;
            }

            // Render Discrepancy Table Initial
            renderDiscrepancyTable(data.discrepanciesArr);
        }

        function setupAuditFilters() {
            const searchInput = document.getElementById('auditSearchInput');
            const statusFilter = document.getElementById('auditStatusFilter');

            if (searchInput.dataset.initialized) return;

            const triggerFilter = () => {
                const searchTerm = searchInput.value.toLowerCase();
                const statusVal = statusFilter.value;

                const filtered = auditDiscrepancies.filter(d => {
                    const matchesSearch = 
                        d.product.toLowerCase().includes(searchTerm) || 
                        d.location.toLowerCase().includes(searchTerm) ||
                        d.productId.toLowerCase().includes(searchTerm) ||
                        d.staffName.toLowerCase().includes(searchTerm) ||
                        d.barcode.toLowerCase().includes(searchTerm);
                    
                    const matchesStatus = 
                        statusVal === 'all' || 
                        (statusVal === 'extra' && d.diff > 0) || 
                        (statusVal === 'missing' && d.diff < 0);

                    return matchesSearch && matchesStatus;
                });

                renderDiscrepancyTable(filtered);
            };

            searchInput.addEventListener('input', triggerFilter);
            statusFilter.addEventListener('change', triggerFilter);
            searchInput.dataset.initialized = 'true';
        }

        function renderDiscrepancyTable(discrepancies) {
            const discTbody = document.getElementById('discrepancyTable');
            const countDisplay = document.getElementById('auditResultCount');
            
            countDisplay.innerText = `Showing ${discrepancies.length} rows`;

            if (!discrepancies || discrepancies.length === 0) {
                discTbody.innerHTML = `<tr><td colspan="21" class="px-6 py-10 text-center text-slate-400">No discrepancies match your filters</td></tr>`;
                return;
            }

            discTbody.innerHTML = discrepancies.map(d => `
                <tr class="hover:bg-red-50/30 transition-colors whitespace-nowrap">
                    <td class="px-3 py-3"><span class="px-2 py-0.5 bg-slate-100 rounded text-[10px] font-bold text-slate-600">${d.location}</span></td>
                    <td class="px-3 py-3 font-mono text-slate-400">${d.barcode}</td>
                    <td class="px-3 py-3 font-mono text-slate-400">${d.productId}</td>
                    <td class="px-3 py-3 font-bold text-slate-800">${d.product}</td>
                    <td class="px-3 py-3 text-slate-500">${d.lotSerial}</td>
                    <td class="px-3 py-3 text-slate-500">${d.productionDate}</td>
                    <td class="px-3 py-3 text-right text-slate-500">${d.expirationDate}</td>
                    <td class="px-3 py-3 text-right text-slate-500">${d.firstQty}</td>
                    <td class="px-3 py-3 text-right text-slate-500">${d.finalQty}</td>
                    <td class="px-3 py-3 text-right font-bold text-slate-800">${d.systemQty}</td>
                    <td class="px-3 py-3 text-right text-slate-600">${d.firstVar}</td>
                    <td class="px-3 py-3 text-right text-slate-600">${d.finalVar}</td>
                    <td class="px-3 py-3"><span class="text-[10px] px-2 py-1 bg-slate-50 border rounded-md text-slate-600">${d.locationStatus}</span></td>
                    <td class="px-3 py-3"><span class="text-[10px] px-2 py-1 bg-slate-50 border rounded-md text-slate-600">${d.lotStatus}</span></td>
                    <td class="px-3 py-3 whitespace-normal min-w-[120px]">
                        <span class="px-2 py-0.5 rounded text-[10px] font-bold ${d.diff > 0 ? 'bg-orange-100 text-orange-700' : 'bg-red-100 text-red-700'}">
                            ${d.productStatus || (d.diff > 0 ? 'Extra' : 'Missing')}
                        </span>
                    </td>
                    <td class="px-3 py-3 text-slate-500">${d.createdBy}</td>
                    <td class="px-3 py-3 font-medium text-slate-800">${d.staffName}</td>
                    <td class="px-3 py-3 text-center text-slate-400">${d.employeeAccuracy}</td>
                    <td class="px-3 py-3 text-slate-400 text-[10px]">${d.live}</td>
                    <td class="px-3 py-3 text-slate-400 text-[10px]">${d.dateNow}</td>
                    <td class="px-3 py-3 text-slate-400 text-[10px]">${d.liveWait}</td>
                </tr>
            `).join('');
        }

        async function fetchData() {
            const search = document.getElementById('searchInput').value;
            const type = document.getElementById('typeFilter').value;
            const category = document.getElementById('categoryInput').value;
            const startDate = document.getElementById('dateFrom').value;
            const endDate = document.getElementById('dateTo').value;

            const params = new URLSearchParams({ search, type, category, startDate, endDate });
            
            try {
                document.getElementById('lastUpdate').innerText = 'Fetching...';
                const res = await fetch(`/api/inventory/dashboard?${params}`);
                
                if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
                
                const data = await res.json();
                
                // Limit to 20 if no filters are applied
                const hasFilters = search || type || category || startDate || endDate;
                if (!hasFilters) {
                    data.products = data.products.slice(0, 20);
                }
                
                if (!data.products || data.products.length === 0) {
                     // Empty state handled by table checks usually
                }
                
                allData = data.products;
                updateDashboard(data);
                document.getElementById('lastUpdate').innerText = 'Updated: ' + new Date().toLocaleTimeString();

            } catch (err) {
                console.error("Fetch error:", err);
                document.getElementById('lastUpdate').innerText = 'Error';
            }
        }

        function updateDashboard(data) {
            // Update KPIs
            document.getElementById('totalProducts').innerText = data.kpis.totalProducts;
            document.getElementById('totalQuantity').innerText = data.kpis.totalCurrentQuantity.toLocaleString();
            document.getElementById('growthCount').innerText = data.kpis.productsIncreased;
            document.getElementById('shrinkCount').innerText = data.kpis.productsDecreased;


            // Render Table (Commented Out)
            const tbody = document.getElementById('inventoryTable');
            tbody.innerHTML = '';

            if (data.products.length === 0) {
                 tbody.innerHTML = '<tr><td colspan="5" class="px-6 py-4 text-center text-slate-400">No products found matching filters.</td></tr>';
                 return;
            }

            data.products.forEach(p => {
                const diffClass = p.lastDiff > 0 ? 'text-green-600 bg-green-50' : p.lastDiff < 0 ? 'text-red-600 bg-red-50' : 'text-slate-400 bg-slate-50';
                const diffSign = p.lastDiff > 0 ? '+' : '';
                
                const row = document.createElement('tr');
                row.className = "border-b border-slate-50 hover:bg-slate-50 transition-colors cursor-pointer";
                
                // Clicking row shows chart
                row.onclick = () => showTrend(p);
                
                row.innerHTML = `
                    <td class="px-6 py-4">
                        <p class="font-semibold text-slate-800">${p.ProductName}</p>
                        <p class="text-xs text-slate-400 font-mono">${p.ProductCode}</p>
                    </td>
                    <td class="px-6 py-4 text-sm text-slate-600">${p.Category}</td>
                    <td class="px-6 py-4 font-bold text-slate-800">${p.currentQuantity}</td>
                    <td class="px-6 py-4 text-sm">
                        <span class="px-2 py-1 rounded-full font-medium ${diffClass}">
                            ${diffSign}${p.lastDiff}
                        </span>
                    </td>
                    <td class="px-6 py-4">
                        <button onclick="event.stopPropagation(); openHistory('${p.ProductCode}')" 
                                class="text-green-600 hover:text-green-800 hover:bg-green-50 px-3 py-1 rounded-lg font-medium text-sm transition-colors">
                            View History
                        </button>
                    </td>
                `;
                tbody.appendChild(row);
            });

            if (data.products.length > 0 && !chart) {
                showTrend(data.products[0]);
            }
        }

        function showTrend(product) {
            document.getElementById('chartTitle').innerText = `${product.ProductName} Trend`;
            
            const ctx = document.getElementById('trendChart').getContext('2d');
            
            // Sort history by date just to be sure
            const sortedHistory = [...product.history].sort((a,b) => new Date(a.date) - new Date(b.date));
            const labels = sortedHistory.map(h => h.formattedDate);
            const values = sortedHistory.map(h => h.quantity);

            if (chart) chart.destroy();

            chart = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Quantity',
                        data: values,
                        borderColor: '#2563eb',
                        backgroundColor: 'rgba(37, 99, 235, 0.1)',
                        fill: true,
                        tension: 0.3,
                        pointBackgroundColor: '#2563eb',
                        pointRadius: 4,
                        pointHoverRadius: 6
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: {
                        y: { beginAtZero: false, grid: { color: '#f1f5f9' } },
                        x: { grid: { display: false } }
                    },
                    interaction: {
                        intersect: false,
                        mode: 'index',
                    },
                }
            });
        }

        function openHistory(code) {
            const product = allData.find(p => p.ProductCode === code);
            if (!product) return;

            document.getElementById('modalTitle').innerText = product.ProductName;
            document.getElementById('modalSubtitle').innerText = `SKU: ${product.ProductCode} • Total Records: ${product.history.length}`;
            
            const tbody = document.getElementById('modalTableBody');
            tbody.innerHTML = '';

            // Show latest first
            const history = [...product.history].sort((a,b) => new Date(b.date) - new Date(a.date));

            history.forEach(h => {
                const diffColor = h.diff > 0 ? 'text-green-600' : h.diff < 0 ? 'text-red-600' : 'text-slate-400';
                const diffSign = h.diff > 0 ? '+' : '';
                
                tbody.innerHTML += `
                    <tr class="hover:bg-slate-50">
                        <td class="py-3 font-mono text-slate-500">${h.formattedDate}</td>
                        <td class="py-3 font-bold text-slate-800">${h.quantity}</td>
                        <td class="py-3 font-medium ${diffColor}">${diffSign}${h.diff}</td>
                    </tr>
                `;
            });

            // Show Modal
            const modal = document.getElementById('historyModal');
            modal.classList.remove('hidden');
            // Trigger reflow
            void modal.offsetWidth;
            modal.classList.remove('opacity-0');
            modal.querySelector('div').classList.remove('scale-95');
            modal.querySelector('div').classList.add('scale-100');
        }

        function closeHistory() {
            const modal = document.getElementById('historyModal');
            modal.classList.add('opacity-0');
            modal.querySelector('div').classList.remove('scale-100');
            modal.querySelector('div').classList.add('scale-95');
            
            setTimeout(() => {
                modal.classList.add('hidden');
            }, 200);
        }
        // Close on backdrop click
        document.getElementById('historyModal').addEventListener('click', (e) => {
            if (e.target === document.getElementById('historyModal')) closeHistory();
        });

        // Initial Load
        switchTab('inventory');
        setInterval(() => {
            if (currentTab === 'inventory') fetchData();
            else fetchSmartAnalysis();
        }, 60000); // Refresh every minute