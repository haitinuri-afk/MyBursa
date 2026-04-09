const STORAGE_KEY = 'trading_station_pro_data';

function saveState() {
    const state = {
        stocksData,
        indicesData,
        portfolio
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function loadState() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            return parsed;
        } catch (e) {
            console.error("Error loading saved state:", e);
        }
    }
    return null;
}

const savedState = loadState();

const initialStocks = {
    "לאומי": 35.80, "פועלים": 37.15, "אלביט": 825.40, "נייס": 642.10,
    "טבע": 62.35, "שטראוס": 82.30, "שופרסל": 24.50, "פוקס": 295.00,
    "עזריאלי": 285.50, "מליסרון": 312.20, "אורמת": 295.80, "שיכון ובינוי": 10.45,
    "קבוצת דלק": 455.00, "טאוור": 115.60, "אנרג'יקס": 12.80, "אנלייט": 65.40
};

let stocksData = savedState ? savedState.stocksData : {};

const rnd = (min, max) => Math.random() * (max - min) + min;

// Initialize missing stocks or missing baselines
Object.keys(initialStocks).forEach(name => {
    if (!stocksData[name]) {
        const price = initialStocks[name];
        stocksData[name] = {
            price: price,
            initial: price,
            // Fixed baselines for 100% coherent math
            baseWeek: price * rnd(0.96, 1.04),
            baseMonth: price * rnd(0.92, 1.08),
            base3Month: price * rnd(0.85, 1.15),
            history: [price],
            trend: rnd(-0.00002, 0.00002) 
        };
    }
});

// Ensure all required fields exist and are stable across saves
Object.keys(stocksData).forEach(key => {
    const s = stocksData[key];
    if (!s.history) s.history = [s.price];
    if (!s.trend) s.trend = rnd(-0.00002, 0.00002);
    // These baselines must be fixed so changes are proportional
    if (!s.baseWeek) s.baseWeek = s.initial * 0.98;
    if (!s.baseMonth) s.baseMonth = s.initial * 0.95;
    if (!s.base3Month) s.base3Month = s.initial * 1.05;
});

let indicesData = savedState ? savedState.indicesData : {
    "מדד תא-35": { price: 2245.12, initial: 2245.12 },
    "מדד תא-125": { price: 2312.45, initial: 2312.45 },
    "מדד תא-90": { price: 2155.80, initial: 2155.80 }
};

let portfolio = savedState ? savedState.portfolio : {};

let currentStock = "לאומי";
let myChart = null;
let indexChart = null;
let modalChart = null;
let currentModalStock = null;
let currentModalTf = 'day';
let currentTf = 'daily';

function calculatePctChange(current, baseline) {
    if (!baseline) return "0.00";
    return (((current - baseline) / baseline) * 100).toFixed(2);
}

function initTicker() {
    const ticker = document.getElementById('ticker-content');
    if (!ticker) return;
    let html = "";
    Object.keys(stocksData).forEach(name => {
        const stock = stocksData[name];
        const pct = calculatePctChange(parseFloat(stock.price), stock.initial);
        const color = pct >= 0 ? '#0ecb81' : '#f6465d';
        const arrow = pct >= 0 ? '▲' : '▼';
        html += `<span class="ticker-item" style="color: ${color}">${name}: ${pct}%${arrow}</span>`;
    });
    ticker.innerHTML = html + html + html;
}

function closeModal() {
    currentModalStock = null;
    currentModalTf = 'day';
    const modal = document.getElementById('stock-modal');
    if (modal) modal.style.display = 'none';
    if (modalChart) modalChart.destroy();
}

function showStockModal(name) {
    currentModalStock = name;
    currentModalTf = 'day';
    const modal = document.getElementById('stock-modal');
    
    document.querySelectorAll('.stat-item').forEach(el => el.classList.remove('active-tf'));
    const dayStat = document.getElementById('modal-stat-day');
    if (dayStat) dayStat.classList.add('active-tf');

    updateModalData(name);
    modal.style.display = 'block';
}

function updateModalChartTf(tf) {
    currentModalTf = tf;
    document.querySelectorAll('.stat-item').forEach(el => el.classList.remove('active-tf'));
    const activeEl = document.getElementById(`modal-stat-${tf}`);
    if (activeEl) activeEl.classList.add('active-tf');
    
    if (currentModalStock) {
        drawModalChart(currentModalStock, tf);
    }
}

function updateModalData(name) {
    const stock = stocksData[name];
    if (!stock) return;

    const currentPrice = parseFloat(stock.price);
    
    const nameEl = document.getElementById('modal-stock-name');
    const priceEl = document.getElementById('modal-current-price');
    const pctEl = document.getElementById('modal-price-change');

    if (nameEl) nameEl.innerText = name;
    if (priceEl) priceEl.innerText = `₪${currentPrice.toFixed(2)}`;
    
    const dayPct = calculatePctChange(currentPrice, stock.initial);
    if (pctEl) {
        pctEl.innerText = `${parseFloat(dayPct) >= 0 ? '+' : ''}${dayPct}%`;
        pctEl.style.color = parseFloat(dayPct) >= 0 ? '#0ecb81' : '#f6465d';
    }

    // Coherent Stats: All percentages derived from fixed historical baselines
    updateStatEl('stat-day', dayPct);
    updateStatEl('stat-week', calculatePctChange(currentPrice, stock.baseWeek));
    updateStatEl('stat-month', calculatePctChange(currentPrice, stock.baseMonth));
    updateStatEl('stat-3months', calculatePctChange(currentPrice, stock.base3Month));

    drawModalChart(name, currentModalTf);
}

function updateStatEl(id, val) {
    const el = document.getElementById(id);
    if (el) {
        el.innerText = `${parseFloat(val) >= 0 ? '+' : ''}${val}%`;
        el.style.color = parseFloat(val) >= 0 ? '#0ecb81' : '#f6465d';
    }
}

function drawModalChart(name, tf = 'day') {
    const canvas = document.getElementById('modalChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    if (modalChart) modalChart.destroy();
    
    const stock = stocksData[name];
    const currentPrice = parseFloat(stock.price);
    let data;

    if (tf === 'day') {
        data = stock.history || [currentPrice];
    } else {
        let points = 20;
        let baseline = stock.initial;
        if (tf === 'week') { points = 7; baseline = stock.baseWeek; }
        if (tf === 'month') { points = 30; baseline = stock.baseMonth; }
        if (tf === '3months') { points = 90; baseline = stock.base3Month; }
        
        // Generate trend line from baseline to current price
        data = [];
        for (let i = 0; i < points; i++) {
            const progress = i / (points - 1);
            const val = baseline + (currentPrice - baseline) * progress;
            // Subtle noise that respects the trend direction
            data.push((val * (1 + (rnd(-0.001, 0.001)))).toFixed(2));
        }
    }

    modalChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: new Array(data.length).fill(''),
            datasets: [{
                data: data,
                borderColor: '#f0b90b',
                borderWidth: 2,
                pointRadius: 0,
                fill: true,
                backgroundColor: 'rgba(240, 185, 11, 0.05)',
                tension: 0.4
            }]
        },
        options: {
            animation: false,
            maintainAspectRatio: false,
            responsive: true,
            plugins: { legend: { display: false } },
            scales: {
                x: { display: false },
                y: { grid: { color: 'rgba(255, 255, 255, 0.05)' } }
            }
        }
    });
}

function drawChart() {
    const canvas = document.getElementById('stockChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    // Update the visual title on screen
    const titleEl = document.getElementById('main-chart-title');
    if (titleEl) titleEl.innerText = currentStock;

    if (myChart) myChart.destroy();
    
    const history = stocksData[currentStock].history || [stocksData[currentStock].price];
    
    myChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: new Array(history.length).fill(''),
            datasets: [{
                label: currentStock,
                data: history,
                borderColor: '#f0b90b',
                backgroundColor: 'rgba(240, 185, 11, 0.1)',
                fill: true,
                tension: 0.3
            }]
        },
        options: {
            animation: false,
            maintainAspectRatio: false,
            responsive: true,
            plugins: { legend: { display: false } }
        }
    });
}

function drawIndexChart(tf = 'daily') {
    const canvas = document.getElementById('indexChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    let points = 24;
    if (tf === 'weekly') points = 7;
    if (tf === 'monthly') points = 30;
    if (tf === '3months') points = 90;

    let data = [];
    let current = parseFloat(indicesData["מדד תא-35"].price);
    for (let i = 0; i < points; i++) {
        current = current * (1 + (rnd(-0.001, 0.001)));
        data.push(current.toFixed(2));
    }

    if (indexChart) indexChart.destroy();
    
    indexChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: new Array(points).fill(''),
            datasets: [{
                data: data,
                borderColor: '#0ecb81',
                borderWidth: 2,
                pointRadius: 0,
                fill: false,
                tension: 0.4
            }]
        },
        options: {
            maintainAspectRatio: false,
            responsive: true,
            plugins: { legend: { display: false } },
            scales: {
                x: { display: false },
                y: { display: false }
            }
        }
    });
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
        const color = pct >= 0 ? '#0ecb81' : '#f6465d';
        const arrow = pct >= 0 ? '▲' : '▼';
        
        const tr = document.createElement('tr');
        tr.className = 'stock-row';
        tr.innerHTML = `
            <td>${name}</td>
            <td class="pct-col" style="color: ${color}">${pct >= 0 ? '+' : ''}${pct}%${arrow}</td>
        `;
        tr.onclick = () => {
            currentStock = name;
            drawChart();
            showStockModal(name);
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
        const tr = document.createElement('tr');
        tr.className = 'stock-row';
        
        const pct = calculatePctChange(parseFloat(index.price), index.initial);
        const color = pct >= 0 ? '#0ecb81' : '#f6465d';
        const arrow = pct >= 0 ? '▲' : '▼';
        
        tr.innerHTML = `
            <td>${name}</td>
            <td class="pct-col" style="color: ${color}">${pct >= 0 ? '+' : ''}${pct}%${arrow}</td>
        `;
        list.appendChild(tr);
    });
}

function updatePortfolioList() {
    const list = document.getElementById('portfolio-list');
    const totalDisplay = document.getElementById('total-portfolio-value');
    if (!list || !totalDisplay) return;
    
    list.innerHTML = "";
    let totalPortfolioValue = 0;
    let totalInitialCost = 0;

    Object.keys(portfolio).forEach(symbol => {
        const p = portfolio[symbol];
        const stock = stocksData[symbol];
        const currentPrice = stock ? parseFloat(stock.price) : 0;
        totalPortfolioValue += p.qty * currentPrice;
        totalInitialCost += p.totalCost;

        const tr = document.createElement('tr');
        tr.className = 'stock-row';
        
        const pct = calculatePctChange(currentPrice, p.buyPrice);
        const color = pct >= 0 ? '#0ecb81' : '#f6465d';
        const arrow = pct >= 0 ? '▲' : '▼';

        const dayPct = calculatePctChange(currentPrice, stock ? stock.initial : currentPrice);
        const dayColor = dayPct >= 0 ? '#0ecb81' : '#f6465d';
        const dayArrow = dayPct >= 0 ? '▲' : '▼';
        
        tr.innerHTML = `
            <td>${symbol}</td>
            <td class="pct-col" style="color: ${color}">${pct >= 0 ? '+' : ''}${pct}%${arrow}</td>
            <td class="pct-col" style="color: ${dayColor}">${dayPct >= 0 ? '+' : ''}${dayPct}%${dayArrow}</td>
            <td>₪${(p.qty * currentPrice).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
            <td><button class="sell-btn" onclick="sellStock('${symbol}')">Sell</button></td>
        `;
        list.appendChild(tr);
    });

    const totalPLPercent = totalInitialCost > 0 ? calculatePctChange(totalPortfolioValue, totalInitialCost) : "0.00";
    const totalColor = parseFloat(totalPLPercent) >= 0 ? '#0ecb81' : '#f6465d';
    const totalArrow = parseFloat(totalPLPercent) >= 0 ? '▲' : '▼';
    
    totalDisplay.innerHTML = `₪${totalPortfolioValue.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})} <span style="color: ${totalColor}; font-size: 0.9em; margin-right: 8px;">(${totalPLPercent >= 0 ? '+' : ''}${totalPLPercent}%${totalArrow})</span>`;
    checkCriticalAlerts();
    saveState();
}

function buyStock() {
    const symbolInput = document.getElementById('sim-symbol');
    const qtyInput = document.getElementById('sim-qty');
    const symbol = symbolInput.value.trim();
    const qty = parseInt(qtyInput.value);

    if (!stocksData[symbol]) {
        alert("מנייה לא נמצאה. נא להזין שם מנייה מהרשימה.");
        return;
    }

    if (isNaN(qty) || qty <= 0) {
        alert("נא להזין כמות תקינה.");
        return;
    }

    const price = parseFloat(stocksData[symbol].price);
    const cost = price * qty;

    if (portfolio[symbol]) {
        const totalQty = portfolio[symbol].qty + qty;
        const totalCost = portfolio[symbol].totalCost + cost;
        portfolio[symbol] = {
            qty: totalQty,
            buyPrice: totalCost / totalQty,
            totalCost: totalCost
        };
    } else {
        portfolio[symbol] = {
            qty: qty,
            buyPrice: price,
            totalCost: cost
        };
    }

    symbolInput.value = "";
    qtyInput.value = "";
    updatePortfolioList();
}

function sellStock(symbol) {
    if (!portfolio[symbol]) return;
    const maxQty = portfolio[symbol].qty;
    const input = prompt(`Sell quantity for ${symbol} (Max: ${maxQty}):`, maxQty);
    
    if (input === null) return;
    const qty = parseInt(input);
    
    if (isNaN(qty) || qty <= 0) {
        alert("Please enter a valid quantity.");
        return;
    }
    
    if (qty > maxQty) {
        alert("You don't have enough shares to sell.");
        return;
    }

    if (qty === maxQty) {
        delete portfolio[symbol];
    } else {
        portfolio[symbol].qty -= qty;
        portfolio[symbol].totalCost = portfolio[symbol].buyPrice * portfolio[symbol].qty;
    }
    
    updatePortfolioList();
}

function sellStockSim() {
    const symbolInput = document.getElementById('sim-symbol');
    const qtyInput = document.getElementById('sim-qty');
    const symbol = symbolInput.value.trim();
    const qty = parseInt(qtyInput.value);

    if (!portfolio[symbol]) {
        alert("You don't own this stock.");
        return;
    }

    if (isNaN(qty) || qty <= 0) {
        alert("Please enter a valid quantity.");
        return;
    }

    if (qty > portfolio[symbol].qty) {
        alert(`You only have ${portfolio[symbol].qty} shares of ${symbol}.`);
        return;
    }

    if (qty === portfolio[symbol].qty) {
        delete portfolio[symbol];
    } else {
        portfolio[symbol].qty -= qty;
        portfolio[symbol].totalCost = portfolio[symbol].buyPrice * portfolio[symbol].qty;
    }

    symbolInput.value = "";
    qtyInput.value = "";
    updatePortfolioList();
}

function refreshData() {
    Object.keys(stocksData).forEach(name => {
        const lastPrice = parseFloat(stocksData[name].price);
        const change = lastPrice * rnd(-0.002, 0.002);
        const newPrice = (lastPrice + change).toFixed(2);
        stocksData[name].price = newPrice;
        if (!stocksData[name].history) stocksData[name].history = [];
        stocksData[name].history.push(newPrice);
        if (stocksData[name].history.length > 30) stocksData[name].history.shift();
    });

    Object.keys(indicesData).forEach(name => {
        const current = parseFloat(indicesData[name].price);
        indicesData[name].price = (current * (1 + rnd(-0.001, 0.001))).toFixed(2);
    });

    updateStockList();
    updateIndicesList();
    updatePortfolioList();
    initTicker();
    drawChart();
    if (currentModalStock) updateModalData(currentModalStock);
    drawIndexChart(currentTf);
    saveState();
}

function checkCriticalAlerts() {
    const rows = document.querySelectorAll('#portfolio-list tr');
    rows.forEach(row => {
        const cells = row.getElementsByTagName('td');
        if (cells.length >= 3) {
            const dayPctText = cells[2].innerText;
            const dayPctValue = parseFloat(dayPctText.replace(/[^\d.-]/g, ''));
            if (!isNaN(dayPctValue) && dayPctValue <= -0.5) {
                row.classList.add('critical-drop');
            } else {
                row.classList.remove('critical-drop');
            }
        }
    });
}

function makeDraggable(el, handle) {
    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
    handle.onmousedown = (e) => {
        e = e || window.event;
        e.preventDefault();
        pos3 = e.clientX;
        pos4 = e.clientY;
        document.onmouseup = () => {
            document.onmouseup = null;
            document.onmousemove = null;
        };
        document.onmousemove = (e) => {
            e = e || window.event;
            e.preventDefault();
            pos1 = pos3 - e.clientX;
            pos2 = pos4 - e.clientY;
            pos3 = e.clientX;
            pos4 = e.clientY;
            el.style.top = (el.offsetTop - pos2) + "px";
            el.style.left = (el.offsetLeft - pos1) + "px";
        };
    };
}

document.addEventListener('DOMContentLoaded', () => {
    initTicker();
    updateStockList();
    updateIndicesList();
    updatePortfolioList();
    drawChart();
    drawIndexChart('daily');

    const modalContent = document.querySelector('.modal-content');
    const modalHeader = document.getElementById('modal-header');
    if (modalContent && modalHeader) makeDraggable(modalContent, modalHeader);

    const refreshBtn = document.getElementById('refresh-btn');
    if (refreshBtn) refreshBtn.addEventListener('click', refreshData);

    const buyBtn = document.getElementById('buy-btn');
    if (buyBtn) buyBtn.addEventListener('click', buyStock);

    const sellBtnSim = document.getElementById('sell-btn-sim');
    if (sellBtnSim) sellBtnSim.addEventListener('click', sellStockSim);

    setInterval(checkCriticalAlerts, 5000);

    setInterval(() => {
        Object.keys(stocksData).forEach(symbol => {
            const stock = stocksData[symbol];
            const currentPrice = parseFloat(stock.price);
            
            const change = currentPrice * (stock.trend + rnd(-0.0001, 0.0001));
            const newPrice = (currentPrice + change).toFixed(2);
            
            stock.price = newPrice;
            stock.history.push(newPrice);
            if (stock.history.length > 30) stock.history.shift();
            
            stock.trend += rnd(-0.00001, 0.00001);
            stock.trend = Math.max(-0.0005, Math.min(0.0005, stock.trend));
        });

        Object.keys(indicesData).forEach(name => {
            const current = parseFloat(indicesData[name].price);
            indicesData[name].price = (current * (1 + rnd(-0.00005, 0.00005))).toFixed(2);
        });

        updateStockList();
        updateIndicesList();
        updatePortfolioList();
        initTicker();
        drawChart();
        if (currentModalStock) updateModalData(currentModalStock);
        saveState();
    }, 3000);
});