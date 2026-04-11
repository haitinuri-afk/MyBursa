const STORAGE_KEY = 'trading_station_pro_data';

function saveState() {
    try {
        const state = { stocksData, indicesData, portfolio, transactionHistory };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) { console.error("Failed to save state:", e); }
}

function loadState() {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) return JSON.parse(saved);
    } catch (e) {
        console.error("Error loading saved state:", e);
        localStorage.removeItem(STORAGE_KEY);
    }
    return null;
}

const rnd = (min, max) => Math.random() * (max - min) + min;

const initialStocks = {
    "לאומי": 35.80, "פועלים": 37.15, "אלביט": 825.40, "נייס": 642.10,
    "טבע": 62.35, "שטראוס": 82.30, "שופרסל": 24.50, "פוקס": 295.00,
    "עזריאלי": 285.50, "מליסרון": 312.20, "אורמת": 295.80, "שיכון ובינוי": 10.45,
    "קבוצת דלק": 455.00, "טאוור": 115.60, "אנרג'יקס": 12.80, "אנלייט": 65.40
};

const savedState = loadState();
let stocksData = (savedState && savedState.stocksData) ? savedState.stocksData : {};

Object.keys(initialStocks).forEach(name => {
    if (!stocksData[name]) {
        const price = initialStocks[name];
        let history = [];
        let cur = price * 0.95;
        for(let i=0; i<30; i++) {
            cur = cur * (1 + rnd(-0.002, 0.0025));
            history.push(parseFloat(cur.toFixed(2)));
        }
        stocksData[name] = {
            price: history[history.length - 1],
            initial: price,
            baseWeek: price * 0.98,
            baseMonth: price * 0.95,
            base3Month: price * 0.90,
            history: history,
            trend: rnd(-0.00005, 0.00005)
        };
    } else {
        // Ensure legacy data has history
        if (!stocksData[name].history) {
            stocksData[name].history = [parseFloat(stocksData[name].price)];
        }
    }
});

let indicesData = (savedState && savedState.indicesData) ? savedState.indicesData : {
    "מדד תא-35": { price: 2245.12, initial: 2245.12 },
    "מדד תא-125": { price: 2312.45, initial: 2312.45 },
    "מדד תא-90": { price: 2155.80, initial: 2155.80 }
};

let portfolio = (savedState && savedState.portfolio) ? savedState.portfolio : {};
let transactionHistory = (savedState && savedState.transactionHistory) ? savedState.transactionHistory : [];

let currentStock = "לאומי";
let myChart = null;
let mainChartData = []; // Persistent data for the central chart
let indexChart = null;
let modalChart = null;
let currentModalStock = null;
let currentModalTf = 'day';
let currentTf = 'daily';

function calculatePctChange(current, baseline) {
    if (!baseline || baseline === 0) return "0.00";
    return (((current - baseline) / baseline) * 100).toFixed(2);
}

function initTicker() {
    const ticker = document.getElementById('ticker-content');
    if (!ticker) return;
    let html = "";
    Object.keys(stocksData).forEach(name => {
        const stock = stocksData[name];
        const pct = calculatePctChange(parseFloat(stock.price), stock.initial);
        const color = parseFloat(pct) >= 0 ? '#0ecb81' : '#f6465d';
        const arrow = parseFloat(pct) >= 0 ? '▲' : '▼';
        html += `<span class="px-8 whitespace-nowrap font-mono font-medium text-xs" style="color: ${color}">${name}: <span dir="ltr" class="inline-block">${pct}%</span> ${arrow}</span>`;
    });
    ticker.innerHTML = html + html + html;
}

let activeStockWindows = {}; // Map to store chart instances and data for open stock windows

function openStockWindow(name) {
    if (activeStockWindows[name]) {
        // Window already open, just bring to front
        const win = document.getElementById(`win-detail-${name}`);
        if (win) {
            win.style.zIndex = ++highestZIndex;
            return;
        }
    }

    const dashboard = document.getElementById('dashboard');
    if (!dashboard) return;

    const winId = `win-detail-${name}`;
    const stock = stocksData[name];
    if (!stock) return;

    const card = document.createElement('div');
    card.id = winId;
    card.className = 'card stock-detail-window';
    card.style.width = '400px';
    card.style.height = '420px';
    card.style.top = '100px';
    card.style.left = '300px';
    card.style.zIndex = ++highestZIndex;

    const dayPct = calculatePctChange(parseFloat(stock.price), stock.initial);
    const color = parseFloat(dayPct) >= 0 ? '#0ecb81' : '#f6465d';

    card.innerHTML = `
        <div class="window-header">
            <h3>${name} - פרטי מניה</h3>
            <div class="window-controls">
                <button class="win-btn win-close" onclick="closeStockWindow('${name}')">×</button>
            </div>
        </div>
        <div class="card-body">
            <div class="text-center mb-4">
                <span id="price-${name}" class="text-2xl font-bold font-mono">₪${parseFloat(stock.price).toFixed(2)}</span>
                <span id="pct-${name}" class="block font-bold" style="color: ${color}">${parseFloat(dayPct) >= 0 ? '+' : ''}${dayPct}%</span>
            </div>
            <div class="flex justify-around bg-[#161a1e] py-2 border-t border-b border-[#363c4e] mb-4">
                ${['day', 'week', 'month', '3months'].map(tf => `
                    <div id="tf-${name}-${tf}" class="text-center cursor-pointer opacity-50 ${tf === 'day' ? 'active-tf' : ''}" onclick="updateStockWindowTf('${name}', '${tf}')">
                        <label class="text-[10px] block text-[#848e9c] uppercase">${tf}</label>
                        <span id="stat-${name}-${tf}" class="font-bold text-xs" style="color: ${calculateColor(stock, tf)}">${calculateVal(stock, tf)}%</span>
                    </div>
                `).join('')}
            </div>
            <div class="flex-1 min-h-0 relative">
                <canvas id="canvas-${name}"></canvas>
            </div>
        </div>
    `;

    dashboard.appendChild(card);
    makeDraggable(card);

    activeStockWindows[name] = {
        chart: null,
        tf: 'day'
    };

    drawStockWindowChart(name);
}

function calculateColor(stock, tf) {
    const val = calculateVal(stock, tf);
    return parseFloat(val) >= 0 ? '#0ecb81' : '#f6465d';
}

function calculateVal(stock, tf) {
    const currentPrice = parseFloat(stock.price);
    const baseline = tf === 'day' ? stock.initial : (tf === 'week' ? stock.baseWeek : (tf === 'month' ? stock.baseMonth : stock.base3Month));
    return calculatePctChange(currentPrice, baseline);
}

function closeStockWindow(name) {
    const win = document.getElementById(`win-detail-${name}`);
    if (win) {
        if (activeStockWindows[name] && activeStockWindows[name].chart) {
            activeStockWindows[name].chart.destroy();
        }
        win.remove();
        delete activeStockWindows[name];
    }
}

function updateStockWindowTf(name, tf) {
    if (!activeStockWindows[name]) return;
    activeStockWindows[name].tf = tf;
    
    // Update active UI state
    document.querySelectorAll(`[id^="tf-${name}-"]`).forEach(el => el.classList.remove('active-tf'));
    document.getElementById(`tf-${name}-${tf}`).classList.add('active-tf');
    
    drawStockWindowChart(name);
}

function drawStockWindowChart(name) {
    const state = activeStockWindows[name];
    if (!state) return;

    const canvas = document.getElementById(`canvas-${name}`);
    if (!canvas) return;

    const stock = stocksData[name];
    const tf = state.tf;
    
    let data = [];
    if (tf === 'day') {
        data = [...stock.history];
    } else {
        const basePrice = tf === 'week' ? stock.baseWeek : (tf === 'month' ? stock.baseMonth : stock.base3Month);
        const currentPrice = parseFloat(stock.price);
        const points = 20;
        for (let i = 0; i < points; i++) {
            const ratio = i / (points - 1);
            const midPoint = basePrice + (currentPrice - basePrice) * ratio;
            data.push(parseFloat((midPoint + midPoint * rnd(-0.005, 0.005)).toFixed(2)));
        }
    }

    if (state.chart) {
        state.chart.data.labels = new Array(data.length).fill('');
        state.chart.data.datasets[0].data = data;
        state.chart.update('none');
    } else {
        state.chart = new Chart(canvas.getContext('2d'), {
            type: 'line',
            data: {
                labels: new Array(data.length).fill(''),
                datasets: [{ data: data, borderColor: '#f0b90b', borderWidth: 2, pointRadius: 0, fill: true, backgroundColor: 'rgba(240, 185, 11, 0.1)', tension: 0.4 }]
            },
            options: { 
                animation: { duration: 500 },
                maintainAspectRatio: false, 
                responsive: true, 
                plugins: { legend: { display: false } }, 
                scales: { x: { display: false }, y: { beginAtZero: false, grace: '5%', grid: { color: 'rgba(255, 255, 255, 0.05)' }, ticks: { color: '#848e9c', font: { size: 10 } } } } 
            }
        });
    }
}

function updateAllStockWindows() {
    Object.keys(activeStockWindows).forEach(name => {
        const stock = stocksData[name];
        if (!stock) return;
        
        // Update Price & Pct
        const priceEl = document.getElementById(`price-${name}`);
        const pctEl = document.getElementById(`pct-${name}`);
        if (priceEl) priceEl.innerText = `₪${parseFloat(stock.price).toFixed(2)}`;
        if (pctEl) {
            const dayPct = calculatePctChange(parseFloat(stock.price), stock.initial);
            pctEl.innerText = `${parseFloat(dayPct) >= 0 ? '+' : ''}${dayPct}%`;
            pctEl.style.color = parseFloat(dayPct) >= 0 ? '#0ecb81' : '#f6465d';
        }

        // Update Stats Row
        ['day', 'week', 'month', '3months'].forEach(tf => {
            const statEl = document.getElementById(`stat-${name}-${tf}`);
            if (statEl) {
                const val = calculateVal(stock, tf);
                statEl.innerText = `${val}%`;
                statEl.style.color = parseFloat(val) >= 0 ? '#0ecb81' : '#f6465d';
            }
        });

        // Update Chart if in 'day' mode
        if (activeStockWindows[name].tf === 'day') {
            drawStockWindowChart(name);
        }
    });
}


function drawChart() {
    const canvas = document.getElementById('stockChart');
    if (!canvas) return;
    
    const stockName = currentStock || Object.keys(stocksData)[0];
    const stock = stocksData[stockName];
    if (!stock) return;

    document.getElementById('main-chart-title').innerText = stockName;

    // Initialization: Create chart instance if it doesn't exist
    if (!myChart) {
        mainChartData = [...stock.history];
        myChart = new Chart(canvas.getContext('2d'), {
            type: 'line',
            data: {
                labels: new Array(mainChartData.length).fill(''),
                datasets: [{
                    label: stockName,
                    data: mainChartData,
                    borderColor: '#f0b90b',
                    backgroundColor: 'rgba(240, 185, 11, 0.1)',
                    fill: true,
                    tension: 0.4,
                    pointRadius: 0,
                    borderWidth: 3
                }]
            },
            options: {
                animation: false,
                maintainAspectRatio: false,
                responsive: true,
                plugins: { legend: { display: false } },
                scales: {
                    x: { display: false },
                    y: { beginAtZero: false, grace: '5%', grid: { color: 'rgba(255, 255, 255, 0.05)' } }
                }
            }
        });
    } else {
        // Stock changed: update chart to new stock data
        if (myChart.data.datasets[0].label !== stockName) {
            myChart.data.datasets[0].label = stockName;
            mainChartData.length = 0; // Clear the persistent array
            stock.history.forEach(p => mainChartData.push(p));
            myChart.data.labels = new Array(mainChartData.length).fill('');
            myChart.update();
        } else {
            // Sliding Window: check if the latest price in history is different from our last data point
            const latestPrice = parseFloat(stock.price);
            if (mainChartData[mainChartData.length - 1] !== latestPrice) {
                mainChartData.push(latestPrice);
                if (mainChartData.length > 50) {
                    mainChartData.shift();
                }
                myChart.data.labels = new Array(mainChartData.length).fill('');
                myChart.update('none'); // Soft update to prevent flickering
            }
        }
    }
}

function drawIndexChart(tf = 'daily') {
    const canvas = document.getElementById('indexChart');
    if (!canvas) return;
    let data = [indicesData["מדד תא-35"].initial, indicesData["מדד תא-35"].price];

    if (indexChart) {
        indexChart.data.datasets[0].data = data;
        indexChart.update('none');
    } else {
        indexChart = new Chart(canvas.getContext('2d'), {
            type: 'line',
            data: {
                labels: ['', ''],
                datasets: [{ data: data, borderColor: '#0ecb81', borderWidth: 2, pointRadius: 0, fill: false, tension: 0.4 }]
            },
            options: { animation: false, maintainAspectRatio: false, responsive: true, plugins: { legend: { display: false } }, scales: { x: { display: false }, y: { beginAtZero: false, display: false } } }
        });
    }
}

function updateTimeframe(tf) {
    currentTf = tf;
    drawIndexChart(tf);
}

function updateStockList() {
    const list = document.getElementById('stock-list');
    if (!list) return;
    list.innerHTML = "";
    Object.keys(stocksData).forEach(name => {
        const stock = stocksData[name];
        const pct = calculatePctChange(parseFloat(stock.price), stock.initial);
        const color = parseFloat(pct) >= 0 ? '#0ecb81' : '#f6465d';
        const arrow = parseFloat(pct) >= 0 ? '▲' : '▼';
        const tr = document.createElement('tr');
        tr.className = 'stock-row';
        tr.innerHTML = `<td>${name}</td><td class="pct-col" style="color: ${color}"><span dir="ltr" class="inline-block">${parseFloat(pct) >= 0 ? '+' : ''}${pct}%${arrow}</span></td>`;
        tr.onclick = () => { 
            currentStock = name; 
            drawChart(); 
            openStockWindow(name); 
        };
        list.appendChild(tr);
    });
}

function updateIndicesList() {
    const list = document.getElementById('indices-list');
    if (!list) return;
    list.innerHTML = "";
    Object.keys(indicesData).forEach(name => {
        const index = indicesData[name];
        const pct = calculatePctChange(parseFloat(index.price), index.initial);
        const color = parseFloat(pct) >= 0 ? '#0ecb81' : '#f6465d';
        const tr = document.createElement('tr');
        tr.className = 'stock-row';
        tr.innerHTML = `<td>${name}</td><td class="pct-col" style="color: ${color}"><span dir="ltr" class="inline-block">${parseFloat(index.price).toFixed(2)} (${pct}%)</span></td>`;
        list.appendChild(tr);
    });
}

function updatePortfolioList() {
    const list = document.getElementById('portfolio-list');
    const totalDisplay = document.getElementById('total-portfolio-value');
    if (!list || !totalDisplay) return;
    list.innerHTML = "";
    let totalValue = 0, totalCost = 0;

    Object.keys(portfolio).forEach(symbol => {
        const p = portfolio[symbol], stock = stocksData[symbol];
        if (!stock) return;
        const currentPrice = parseFloat(stock.price), positionValue = p.qty * currentPrice;
        totalValue += positionValue; totalCost += p.totalCost;
        const totalPct = calculatePctChange(currentPrice, p.buyPrice), dayPct = calculatePctChange(currentPrice, stock.initial);
        const tr = document.createElement('tr');
        tr.className = 'stock-row';
        tr.onclick = (e) => { 
            if (e.target.tagName !== 'BUTTON') { 
                currentStock = symbol; 
                drawChart(); 
                openStockWindow(symbol);
            } 
        };
        tr.innerHTML = `<td>${symbol}</td><td class="pct-col" style="color: ${parseFloat(totalPct) >= 0 ? '#0ecb81' : '#f6465d'}"><span dir="ltr" class="inline-block">${totalPct}%</span></td><td class="pct-col" style="color: ${parseFloat(dayPct) >= 0 ? '#0ecb81' : '#f6465d'}"><span dir="ltr" class="inline-block">${dayPct}%</span></td><td><span dir="ltr" class="inline-block">₪${positionValue.toLocaleString(undefined, {minimumFractionDigits: 2})}</span></td><td><button class="sell-btn" onclick="sellStock('${symbol}')">Sell</button></td>`;
        list.appendChild(tr);
    });

    const totalPL = totalCost > 0 ? calculatePctChange(totalValue, totalCost) : "0.00";
    const color = parseFloat(totalPL) >= 0 ? '#0ecb81' : '#f6465d';
    totalDisplay.innerHTML = `<span dir="ltr" class="inline-block">₪${totalValue.toLocaleString(undefined, {minimumFractionDigits: 2})}</span> <span style="color: ${color}" dir="ltr" class="inline-block">(${totalPL}%)</span>`;
    saveState();
}

function updateTransactionTable() {
    const list = document.getElementById('history-list');
    if (!list) return;
    list.innerHTML = "";
    transactionHistory.forEach(t => {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${t.time}</td><td style="color: ${t.action === 'Buy' ? '#0ecb81' : '#f6465d'}">${t.action}</td><td>${t.symbol}</td><td>${t.qty}</td><td>₪${t.price}</td>`;
        list.appendChild(tr);
    });
}

function buyStock() {
    const symbol = document.getElementById('sim-symbol').value.trim(), qty = parseInt(document.getElementById('sim-qty').value);
    if (!stocksData[symbol] || isNaN(qty) || qty <= 0) return;
    const price = parseFloat(stocksData[symbol].price), cost = price * qty;
    if (portfolio[symbol]) { portfolio[symbol].qty += qty; portfolio[symbol].totalCost += cost; portfolio[symbol].buyPrice = portfolio[symbol].totalCost / portfolio[symbol].qty; }
    else { portfolio[symbol] = { qty, buyPrice: price, totalCost: cost }; }
    transactionHistory.unshift({ time: new Date().toLocaleTimeString(), action: 'Buy', symbol, qty, price: price.toFixed(2) });
    if (transactionHistory.length > 50) transactionHistory.pop();
    updatePortfolioList(); updateTransactionTable();
}

function sellStockSim() {
    const symbol = document.getElementById('sim-symbol').value.trim();
    if (symbol) sellStock(symbol);
}

function sellStock(symbol) {
    if (!portfolio[symbol]) return;
    const qty = portfolio[symbol].qty, price = parseFloat(stocksData[symbol].price);
    delete portfolio[symbol];
    transactionHistory.unshift({ time: new Date().toLocaleTimeString(), action: 'Sell', symbol, qty, price: price.toFixed(2) });
    if (transactionHistory.length > 50) transactionHistory.pop();
    updatePortfolioList(); updateTransactionTable();
}

let highestZIndex = 100;

document.addEventListener('DOMContentLoaded', () => {
    try { initWindowManager(); } catch(e) { console.error("Window manager failed:", e); }
    
    initTicker(); updateStockList(); updateIndicesList(); updatePortfolioList(); updateTransactionTable(); drawChart(); drawIndexChart();
    
    document.getElementById('buy-btn').onclick = buyStock;
    document.getElementById('sell-btn-sim').onclick = sellStockSim;
    document.getElementById('refresh-btn').onclick = () => {
        Object.keys(stocksData).forEach(s => { 
            stocksData[s].price = (parseFloat(stocksData[s].price) + rnd(-0.5, 0.5)).toFixed(2); 
            stocksData[s].history.push(parseFloat(stocksData[s].price)); 
            if(stocksData[s].history.length > 50) stocksData[s].history.shift(); 
        });
        initTicker(); updateStockList(); updatePortfolioList(); drawChart(); 
        updateAllStockWindows();
        saveState();
    };

    setInterval(() => {
        Object.keys(stocksData).forEach(s => { 
            stocksData[s].price = (parseFloat(stocksData[s].price) + rnd(-0.05, 0.05)).toFixed(2); 
            stocksData[s].history.push(parseFloat(stocksData[s].price)); 
            if(stocksData[s].history.length > 50) stocksData[s].history.shift(); 
        });
        initTicker(); updateStockList(); updatePortfolioList(); drawChart(); 
        updateAllStockWindows();
        saveState();
    }, 3000);
});


function initWindowManager() {
    const cards = document.querySelectorAll('.card');
    cards.forEach(card => {
        makeDraggable(card);
        card.addEventListener('mousedown', () => {
            card.style.zIndex = ++highestZIndex;
        });
    });
}

function toggleMaximize(winId) {
    const win = document.getElementById(winId);
    if (!win) return;
    win.classList.toggle('maximized');
    
    // Refresh charts if they exist in the window
    if (winId === 'win-indices-tase' && indexChart) indexChart.resize();
    if (winId === 'win-main-chart' && myChart) myChart.resize();
    
    // Check for detail window charts
    const nameMatch = winId.match(/win-detail-(.+)/);
    if (nameMatch && activeStockWindows[nameMatch[1]]) {
        activeStockWindows[nameMatch[1]].chart.resize();
    }
}

function resetWindows() {
    const cards = document.querySelectorAll('.card');
    cards.forEach(card => {
        card.removeAttribute('style');
        card.classList.remove('maximized');
    });
    // Trigger chart resize
    if (indexChart) indexChart.resize();
    if (myChart) myChart.resize();
    Object.keys(activeStockWindows).forEach(name => {
        if (activeStockWindows[name].chart) activeStockWindows[name].chart.resize();
    });
}

function makeDraggable(el) {
    const header = el.querySelector('.window-header');
    if (!header) return;

    header.style.cursor = 'move';

    header.addEventListener('mousedown', function(e) {
        // Only trigger on header, ignore buttons/inputs
        if (e.target.closest('button') || e.target.closest('input')) return;
        
        e.preventDefault();
        
        const dashboard = document.getElementById('dashboard');
        if (!dashboard) return;

        el.style.zIndex = ++highestZIndex;
        el.classList.add('dragging');

        const dashRect = dashboard.getBoundingClientRect();
        const elRect = el.getBoundingClientRect();
        
        // Offset of mouse from the top-left of the card
        const shiftX = e.clientX - elRect.left;
        const shiftY = e.clientY - elRect.top;

        function onMouseMove(moveEvent) {
            // New position relative to the dashboard
            let x = moveEvent.clientX - dashRect.left - shiftX;
            let y = moveEvent.clientY - dashRect.top - shiftY;
            
            // Simple boundary logic
            if (x < 0) x = 0;
            if (y < 0) y = 0;
            if (x + el.offsetWidth > dashRect.width) x = dashRect.width - el.offsetWidth;
            if (y + el.offsetHeight > dashRect.height) y = dashRect.height - el.offsetHeight;

            // Apply position
            el.style.left = x + 'px';
            el.style.top = y + 'px';
            el.style.right = 'auto'; // Disable RTL right-alignment
        }

        function onMouseUp() {
            el.classList.remove('dragging');
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
        }

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
    });

    // Prevent default browser drag-and-drop
    header.addEventListener('dragstart', (e) => e.preventDefault());
}
