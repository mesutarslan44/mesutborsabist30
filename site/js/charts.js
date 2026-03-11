/**
 * BIST 30 Analiz - Chart.js Grafik Modülü
 * Fiyat, RSI, MACD ve Hacim grafikleri
 */

(function () {
    'use strict';

    // ── Globals ──
    let stockData = null;
    let currentPeriod = 'daily';
    let charts = {};

    // ── Check Chart.js ──
    function isChartReady() {
        return typeof Chart !== 'undefined';
    }

    // ── Setup Chart.js Defaults ──
    function setupDefaults() {
        if (!isChartReady()) return;
        try {
            Chart.defaults.color = '#94a3b8';
            Chart.defaults.borderColor = 'rgba(99, 102, 241, 0.08)';
            Chart.defaults.font.family = "'Inter', -apple-system, sans-serif";
            Chart.defaults.font.size = 11;
            Chart.defaults.plugins.legend.labels.usePointStyle = true;
            Chart.defaults.plugins.legend.labels.pointStyleWidth = 8;
            Chart.defaults.plugins.tooltip.backgroundColor = 'rgba(17, 24, 39, 0.95)';
            Chart.defaults.plugins.tooltip.borderColor = 'rgba(99, 102, 241, 0.3)';
            Chart.defaults.plugins.tooltip.borderWidth = 1;
            Chart.defaults.plugins.tooltip.cornerRadius = 8;
            Chart.defaults.plugins.tooltip.padding = 12;
            Chart.defaults.plugins.tooltip.titleFont = { size: 13, weight: '600', family: "'Inter', sans-serif" };
            Chart.defaults.plugins.tooltip.bodyFont = { size: 12, family: "'JetBrains Mono', monospace" };
        } catch (e) {
            console.warn('Chart.js defaults setup error:', e);
        }
    }

    // ── Color Palette ──
    const colors = {
        blue: '#6366f1',
        purple: '#8b5cf6',
        cyan: '#22d3ee',
        green: '#00e676',
        red: '#ff1744',
        yellow: '#ffd740',
        gold: '#f59e0b',
        orange: '#ff6d00',
        white: '#f1f5f9',
        gray: '#64748b',
        greenSoft: 'rgba(0, 230, 118, 0.12)',
        redSoft: 'rgba(255, 23, 68, 0.12)',
        blueSoft: 'rgba(99, 102, 241, 0.08)',
        cyanSoft: 'rgba(34, 211, 238, 0.1)',
        purpleSoft: 'rgba(139, 92, 246, 0.1)',
    };

    // ── Data Loading ──
    async function loadStockData(ticker) {
        try {
            const response = await fetch(`data/${ticker}.json`);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return await response.json();
        } catch (err) {
            console.error('Hisse verisi yüklenemedi:', err);
            return null;
        }
    }

    // ── Gradient Helper ──
    function createGradient(ctx, colorTop, colorBottom, height) {
        const h = height || ctx.canvas.clientHeight || 400;
        const gradient = ctx.createLinearGradient(0, 0, 0, h);
        gradient.addColorStop(0, colorTop);
        gradient.addColorStop(1, colorBottom);
        return gradient;
    }

    // ── Destroy Old Charts ──
    function destroyCharts() {
        Object.keys(charts).forEach(key => {
            try {
                if (charts[key] && typeof charts[key].destroy === 'function') {
                    charts[key].destroy();
                }
            } catch (e) {
                console.warn('Chart destroy error:', e);
            }
        });
        charts = {};
    }

    // ── Price Chart (Line + SMA + Bollinger) ──
    function renderPriceChart(chartData) {
        const canvas = document.getElementById('priceChart');
        if (!canvas || !isChartReady()) {
            console.warn('priceChart canvas not found or Chart.js not loaded');
            return;
        }

        try {
            const ctx = canvas.getContext('2d');
            const labels = chartData.map(d => d.date);
            const closePrices = chartData.map(d => d.close);
            const sma20 = chartData.map(d => d.sma_20);
            const sma50 = chartData.map(d => d.sma_50);
            const sma200 = chartData.map(d => d.sma_200);
            const bbUpper = chartData.map(d => d.bb_upper);
            const bbLower = chartData.map(d => d.bb_lower);

            const priceUp = closePrices.length > 1 && closePrices[closePrices.length - 1] >= closePrices[0];
            const lineColor = priceUp ? colors.green : colors.red;
            const fillColorTop = priceUp ? 'rgba(0, 230, 118, 0.15)' : 'rgba(255, 23, 68, 0.15)';

            charts.price = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [
                        {
                            label: 'Bollinger Üst',
                            data: bbUpper,
                            borderColor: 'rgba(139, 92, 246, 0.3)',
                            borderWidth: 1,
                            borderDash: [4, 4],
                            pointRadius: 0,
                            fill: false,
                            order: 5,
                        },
                        {
                            label: 'Bollinger Alt',
                            data: bbLower,
                            borderColor: 'rgba(139, 92, 246, 0.3)',
                            borderWidth: 1,
                            borderDash: [4, 4],
                            pointRadius: 0,
                            fill: {
                                target: 0,
                                above: colors.purpleSoft,
                            },
                            order: 6,
                        },
                        {
                            label: 'Fiyat',
                            data: closePrices,
                            borderColor: lineColor,
                            borderWidth: 2.5,
                            pointRadius: 0,
                            pointHoverRadius: 5,
                            pointHoverBackgroundColor: lineColor,
                            fill: true,
                            backgroundColor: createGradient(ctx, fillColorTop, 'rgba(0, 0, 0, 0)', canvas.parentElement.clientHeight || 400),
                            tension: 0.1,
                            order: 1,
                        },
                        {
                            label: 'SMA 20',
                            data: sma20,
                            borderColor: colors.cyan,
                            borderWidth: 1.5,
                            pointRadius: 0,
                            fill: false,
                            order: 2,
                        },
                        {
                            label: 'SMA 50',
                            data: sma50,
                            borderColor: colors.gold,
                            borderWidth: 1.5,
                            pointRadius: 0,
                            fill: false,
                            order: 3,
                        },
                        {
                            label: 'SMA 200',
                            data: sma200,
                            borderColor: colors.purple,
                            borderWidth: 1.5,
                            pointRadius: 0,
                            fill: false,
                            order: 4,
                        },
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    animation: { duration: 800 },
                    interaction: {
                        mode: 'index',
                        intersect: false,
                    },
                    plugins: {
                        legend: {
                            position: 'top',
                            align: 'start',
                            labels: {
                                padding: 16,
                                font: { size: 11 },
                            }
                        },
                        tooltip: {
                            callbacks: {
                                label: function (tipItem) {
                                    const val = tipItem.parsed.y;
                                    if (val == null) return null;
                                    return ' ' + tipItem.dataset.label + ': ₺' + val.toLocaleString('tr-TR', {
                                        minimumFractionDigits: 2,
                                        maximumFractionDigits: 2
                                    });
                                }
                            }
                        }
                    },
                    scales: {
                        x: {
                            grid: { display: false },
                            ticks: {
                                maxTicksLimit: 12,
                                maxRotation: 0,
                                font: { size: 10 },
                            }
                        },
                        y: {
                            position: 'right',
                            grid: {
                                color: 'rgba(99, 102, 241, 0.06)',
                            },
                            ticks: {
                                font: { family: "'JetBrains Mono', monospace", size: 10 },
                                callback: function (val) { return '₺' + val.toLocaleString('tr-TR'); },
                            }
                        }
                    }
                }
            });
            console.log('✓ Price chart rendered');
        } catch (e) {
            console.error('Price chart error:', e);
        }
    }

    // ── RSI Chart ──
    function renderRsiChart(chartData) {
        const canvas = document.getElementById('rsiChart');
        if (!canvas || !isChartReady()) return;

        try {
            const ctx = canvas.getContext('2d');
            const labels = chartData.map(d => d.date);
            const rsiValues = chartData.map(d => d.rsi);

            charts.rsi = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [
                        {
                            label: 'RSI (14)',
                            data: rsiValues,
                            borderColor: colors.blue,
                            borderWidth: 2,
                            pointRadius: 0,
                            pointHoverRadius: 4,
                            fill: false,
                            tension: 0.2,
                        },
                        {
                            label: 'Aşırı Alım (70)',
                            data: new Array(labels.length).fill(70),
                            borderColor: 'rgba(255, 23, 68, 0.4)',
                            borderWidth: 1,
                            borderDash: [6, 4],
                            pointRadius: 0,
                            fill: false,
                        },
                        {
                            label: 'Aşırı Satım (30)',
                            data: new Array(labels.length).fill(30),
                            borderColor: 'rgba(0, 230, 118, 0.4)',
                            borderWidth: 1,
                            borderDash: [6, 4],
                            pointRadius: 0,
                            fill: false,
                        },
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    animation: { duration: 800 },
                    interaction: {
                        mode: 'index',
                        intersect: false,
                    },
                    plugins: {
                        legend: {
                            position: 'top',
                            align: 'start',
                            labels: { padding: 12, font: { size: 10 } }
                        },
                        tooltip: {
                            callbacks: {
                                label: function (tipItem) {
                                    if (tipItem.datasetIndex !== 0) return null;
                                    const val = tipItem.parsed.y;
                                    if (val == null) return null;
                                    var zone = 'Nötr';
                                    if (val >= 70) zone = '⚠️ Aşırı Alım';
                                    else if (val <= 30) zone = '✅ Aşırı Satım';
                                    return ' RSI: ' + val.toFixed(1) + ' (' + zone + ')';
                                }
                            }
                        }
                    },
                    scales: {
                        x: {
                            grid: { display: false },
                            ticks: { maxTicksLimit: 8, maxRotation: 0, font: { size: 10 } }
                        },
                        y: {
                            position: 'right',
                            min: 0,
                            max: 100,
                            grid: { color: 'rgba(99, 102, 241, 0.06)' },
                            ticks: {
                                stepSize: 10,
                                font: { family: "'JetBrains Mono', monospace", size: 10 }
                            }
                        }
                    }
                },
                plugins: [{
                    id: 'rsiZones',
                    beforeDraw: function (chart) {
                        var ctx2 = chart.ctx;
                        var chartArea = chart.chartArea;
                        var scales = chart.scales;
                        if (!chartArea || !scales || !scales.y) return;

                        var y70 = scales.y.getPixelForValue(70);
                        var y100 = scales.y.getPixelForValue(100);
                        ctx2.fillStyle = 'rgba(255, 23, 68, 0.04)';
                        ctx2.fillRect(chartArea.left, y100, chartArea.width, y70 - y100);

                        var y30 = scales.y.getPixelForValue(30);
                        var y0 = scales.y.getPixelForValue(0);
                        ctx2.fillStyle = 'rgba(0, 230, 118, 0.04)';
                        ctx2.fillRect(chartArea.left, y30, chartArea.width, y0 - y30);
                    }
                }]
            });
            console.log('✓ RSI chart rendered');
        } catch (e) {
            console.error('RSI chart error:', e);
        }
    }

    // ── MACD Chart ──
    function renderMacdChart(chartData) {
        const canvas = document.getElementById('macdChart');
        if (!canvas || !isChartReady()) return;

        try {
            const ctx = canvas.getContext('2d');
            const labels = chartData.map(d => d.date);
            const macd = chartData.map(d => d.macd);
            const signal = chartData.map(d => d.macd_signal);
            const histogram = chartData.map(d => d.macd_histogram);

            var histColors = [];
            var histBorderColors = [];
            for (var i = 0; i < histogram.length; i++) {
                var v = histogram[i];
                if (v == null) {
                    histColors.push('transparent');
                    histBorderColors.push('transparent');
                } else if (v >= 0) {
                    histColors.push('rgba(0, 230, 118, 0.6)');
                    histBorderColors.push(colors.green);
                } else {
                    histColors.push('rgba(255, 23, 68, 0.6)');
                    histBorderColors.push(colors.red);
                }
            }

            charts.macd = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [
                        {
                            label: 'Histogram',
                            data: histogram,
                            backgroundColor: histColors,
                            borderColor: histBorderColors,
                            borderWidth: 1,
                            borderRadius: 2,
                            order: 2,
                        },
                        {
                            label: 'MACD',
                            data: macd,
                            type: 'line',
                            borderColor: colors.cyan,
                            borderWidth: 2,
                            pointRadius: 0,
                            fill: false,
                            tension: 0.2,
                            order: 1,
                        },
                        {
                            label: 'Sinyal',
                            data: signal,
                            type: 'line',
                            borderColor: colors.orange,
                            borderWidth: 1.5,
                            pointRadius: 0,
                            fill: false,
                            tension: 0.2,
                            borderDash: [3, 3],
                            order: 1,
                        },
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    animation: { duration: 800 },
                    interaction: {
                        mode: 'index',
                        intersect: false,
                    },
                    plugins: {
                        legend: {
                            position: 'top',
                            align: 'start',
                            labels: { padding: 12, font: { size: 10 } }
                        },
                        tooltip: {
                            callbacks: {
                                label: function (tipItem) {
                                    var val = tipItem.parsed.y;
                                    if (val == null) return null;
                                    return ' ' + tipItem.dataset.label + ': ' + val.toFixed(4);
                                }
                            }
                        }
                    },
                    scales: {
                        x: {
                            grid: { display: false },
                            ticks: { maxTicksLimit: 8, maxRotation: 0, font: { size: 10 } }
                        },
                        y: {
                            position: 'right',
                            grid: { color: 'rgba(99, 102, 241, 0.06)' },
                            ticks: {
                                font: { family: "'JetBrains Mono', monospace", size: 10 }
                            }
                        }
                    }
                },
                plugins: [{
                    id: 'macdZero',
                    beforeDraw: function (chart) {
                        var ctx2 = chart.ctx;
                        var chartArea = chart.chartArea;
                        var scales = chart.scales;
                        if (!chartArea || !scales || !scales.y) return;
                        var y0 = scales.y.getPixelForValue(0);
                        if (y0 >= chartArea.top && y0 <= chartArea.bottom) {
                            ctx2.save();
                            ctx2.beginPath();
                            ctx2.moveTo(chartArea.left, y0);
                            ctx2.lineTo(chartArea.right, y0);
                            ctx2.strokeStyle = 'rgba(241, 245, 249, 0.15)';
                            ctx2.lineWidth = 1;
                            ctx2.stroke();
                            ctx2.restore();
                        }
                    }
                }]
            });
            console.log('✓ MACD chart rendered');
        } catch (e) {
            console.error('MACD chart error:', e);
        }
    }

    // ── Volume Chart ──
    function renderVolumeChart(chartData) {
        const canvas = document.getElementById('volumeChart');
        if (!canvas || !isChartReady()) return;

        try {
            const ctx = canvas.getContext('2d');
            const labels = chartData.map(d => d.date);
            const volumes = chartData.map(d => d.volume);
            const avgVolumes = chartData.map(d => d.volume_avg);

            var barColors = [];
            var barBorderColors = [];
            for (var i = 0; i < chartData.length; i++) {
                if (i === 0) {
                    barColors.push('rgba(99, 102, 241, 0.5)');
                    barBorderColors.push(colors.blue);
                } else if (chartData[i].close >= chartData[i - 1].close) {
                    barColors.push('rgba(0, 230, 118, 0.4)');
                    barBorderColors.push(colors.green);
                } else {
                    barColors.push('rgba(255, 23, 68, 0.4)');
                    barBorderColors.push(colors.red);
                }
            }

            charts.volume = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [
                        {
                            label: 'Hacim',
                            data: volumes,
                            backgroundColor: barColors,
                            borderColor: barBorderColors,
                            borderWidth: 1,
                            borderRadius: 2,
                            order: 2,
                        },
                        {
                            label: 'Ortalama Hacim (20)',
                            data: avgVolumes,
                            type: 'line',
                            borderColor: colors.gold,
                            borderWidth: 2,
                            pointRadius: 0,
                            fill: false,
                            tension: 0.3,
                            order: 1,
                        },
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    animation: { duration: 800 },
                    interaction: {
                        mode: 'index',
                        intersect: false,
                    },
                    plugins: {
                        legend: {
                            position: 'top',
                            align: 'start',
                            labels: { padding: 12, font: { size: 10 } }
                        },
                        tooltip: {
                            callbacks: {
                                label: function (tipItem) {
                                    var val = tipItem.parsed.y;
                                    if (val == null) return null;
                                    return ' ' + tipItem.dataset.label + ': ' + formatVolume(val);
                                }
                            }
                        }
                    },
                    scales: {
                        x: {
                            grid: { display: false },
                            ticks: { maxTicksLimit: 8, maxRotation: 0, font: { size: 10 } }
                        },
                        y: {
                            position: 'right',
                            grid: { color: 'rgba(99, 102, 241, 0.06)' },
                            ticks: {
                                font: { family: "'JetBrains Mono', monospace", size: 10 },
                                callback: function (val) { return formatVolume(val); },
                            }
                        }
                    }
                }
            });
            console.log('✓ Volume chart rendered');
        } catch (e) {
            console.error('Volume chart error:', e);
        }
    }

    // ── Format Volume ──
    function formatVolume(val) {
        if (val == null || isNaN(val)) return '--';
        if (val >= 1e9) return (val / 1e9).toFixed(1) + 'B';
        if (val >= 1e6) return (val / 1e6).toFixed(1) + 'M';
        if (val >= 1e3) return (val / 1e3).toFixed(0) + 'K';
        return val.toLocaleString('tr-TR');
    }

    // ── Render All Charts ──
    function renderAllCharts(periodData) {
        if (!isChartReady()) {
            console.error('Chart.js is not loaded!');
            return;
        }

        if (!periodData || !periodData.chart_data || periodData.chart_data.length === 0) {
            console.warn('Bu periyot için grafik verisi yok');
            return;
        }

        destroyCharts();
        setupDefaults();

        var chartData = periodData.chart_data;
        console.log('Rendering charts with', chartData.length, 'data points...');

        renderPriceChart(chartData);
        renderRsiChart(chartData);
        renderMacdChart(chartData);
        renderVolumeChart(chartData);
    }

    // ── Expose API ──
    window.BistCharts = {
        loadStockData: loadStockData,
        renderAllCharts: renderAllCharts,
        destroyCharts: destroyCharts,
        setStockData: function (data) { stockData = data; },
        getStockData: function () { return stockData; },
    };

})();
