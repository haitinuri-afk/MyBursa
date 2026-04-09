# Trading Station Pro - Project Documentation

## Project Overview
Trading Station Pro is a lightweight, high-performance web-based stock market simulator specifically designed for the Tel Aviv Stock Exchange (TASE). It provides a real-time (simulated) trading experience with interactive charts, portfolio management, and market analysis tools.

### Core Features
- **Real-time Simulation:** Automatic price updates every 3 seconds for stocks and indices.
- **Interactive Charts:** Powered by `Chart.js`, featuring detailed stock movement and index history across multiple timeframes (Daily, Weekly, Monthly, 3 Months).
- **Market Monitoring:** Live ticker and categorized watchlists for top TASE stocks (Leumi, Hapoalim, Elbit, etc.) and Indices (TA-35, TA-125, TA-90).
- **Trading Simulator:** Functional "Buy" and "Sell" simulation allowing users to manage a virtual portfolio with weighted average cost calculation.
- **Modern UI:** Responsive, dark-themed dashboard optimized for financial data visualization.

## Technologies
- **Frontend:** HTML5, Vanilla CSS3, Vanilla JavaScript (ES6+).
- **Charting:** [Chart.js](https://www.chartjs.org/) for high-performance canvas-based data visualization.
- **Localization:** Right-to-Left (RTL) support for Hebrew, with integrated English terminology for global indices.

## Project Architecture
The project follows a modular Single-Page Application (SPA) structure:
- `index.html`: The structural backbone, defining the grid-based dashboard layout (sidebar and content area).
- `style.css`: Comprehensive styling including a custom dark theme, ticker animations, and responsive components.
- `script.js`: The central engine handling:
    - Data management for stocks and indices.
    - Real-time simulation logic (`setInterval`).
    - Chart initialization and dynamic updates.
    - Portfolio logic (Weighted average buy price, profit/loss coloring).

## Building and Running
As a vanilla web project, no build step is required.
- **Run:** Open `index.html` in any modern web browser.
- **Test:** Manual verification of simulation loops and trading logic in the browser console.

## Development Conventions
- **Naming:** CamelCase for JavaScript functions and variables; Kebab-case for CSS classes.
- **State Management:** Local JavaScript objects (`stocksData`, `portfolio`) manage the application state.
- **UI/UX:** Adhere to the "Trading Station" aesthetic—high contrast, color-coded indicators (green for gains, red for losses), and compact data density.
- **RTL Support:** All layout changes must respect the `dir="rtl"` attribute while maintaining `dir="ltr"` for specific English-language data cards.
