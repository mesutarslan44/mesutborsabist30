(function () {
    'use strict';

    var performanceData = null;
    var summaryData = null;
    var currentStatusFilter = 'ALL';

    /* ── helpers ─────────────────────────────────── */

    function formatPrice(val, ticker) {
        if (val == null || isNaN(val)) return '--';
        var isAgbe = window.location.pathname.includes('/agbe');
        var prefix = 'TL ';
        if (isAgbe && ticker && (ticker === 'BTC-USD' || ticker === 'ETH-USD')) {
            prefix = '$';
        } else if (isAgbe && ticker && (ticker === 'GC=F' || ticker === 'SI=F')) {
            prefix = '₺';
        }
        return prefix + Number(val).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    function formatPct(val) {
        if (val == null || isNaN(val)) return '--%';
        var n = Number(val);
        var sign = n > 0 ? '+' : '';
        return sign + n.toFixed(1) + '%';
    }

    function formatDirection(direction) {
        return direction === 'buy' ? 'AL' : 'SAT';
    }

    function formatPeriod(period) {
        return period === 'weekly' ? 'Haftalik' : 'Gunluk';
    }

    function getCurrentPriceMap() {
        var map = {};
        if (!summaryData || !summaryData.stocks) return map;
        for (var i = 0; i < summaryData.stocks.length; i++) {
            var s = summaryData.stocks[i];
            map[s.ticker] = s.price;
        }
        return map;
    }

    /** Build a map of ticker → {target_1, target_2, target_3} from summary */
    function getTargetsMap() {
        var map = {};
        if (!summaryData || !summaryData.stocks) return map;
        for (var i = 0; i < summaryData.stocks.length; i++) {
            var s = summaryData.stocks[i];
            if (s.targets) {
                map[s.ticker] = s.targets;
            }
        }
        return map;
    }

    /** Determine which target level (1/2/3) the target_price matches */
    function detectTargetLevel(ticker, targetPrice, targetsMap) {
        if (!targetPrice || !targetsMap[ticker]) return '--';
        var t = targetsMap[ticker];
        var tp = Number(targetPrice);
        var tolerance = 0.005; // 0.5% tolerance for matching

        if (t.target_1 && Math.abs(tp - t.target_1) / t.target_1 < tolerance) return 'H1';
        if (t.target_2 && Math.abs(tp - t.target_2) / t.target_2 < tolerance) return 'H2';
        if (t.target_3 && Math.abs(tp - t.target_3) / t.target_3 < tolerance) return 'H3';

        // If no exact match, determine by proximity
        var diffs = [];
        if (t.target_1) diffs.push({ level: 'H1', diff: Math.abs(tp - t.target_1) });
        if (t.target_2) diffs.push({ level: 'H2', diff: Math.abs(tp - t.target_2) });
        if (t.target_3) diffs.push({ level: 'H3', diff: Math.abs(tp - t.target_3) });

        if (diffs.length === 0) return '--';
        diffs.sort(function (a, b) { return a.diff - b.diff; });
        return diffs[0].level;
    }

    function calcDistance(direction, target, current) {
        if (target == null || current == null || target === 0) return '--';
        var pct;
        if (direction === 'buy') pct = ((target - current) / target) * 100;
        else pct = ((current - target) / target) * 100;
        return formatPct(pct);
    }

    /** Calculate profit/loss % based on position direction */
    function calcProfitLoss(direction, startPrice, closePrice) {
        if (!startPrice || !closePrice || startPrice === 0) return null;
        var pct;
        if (direction === 'buy') {
            pct = ((closePrice - startPrice) / startPrice) * 100;
        } else {
            pct = ((startPrice - closePrice) / startPrice) * 100;
        }
        return pct;
    }

    function getTargetBadgeClass(level) {
        if (level === 'H1') return 'target-h1';
        if (level === 'H2') return 'target-h2';
        if (level === 'H3') return 'target-h3';
        return '';
    }

    /* ── rendering ─────────────────────────────────── */

    function renderHeroMeta() {
        var stamp = (performanceData && performanceData.generated_at) || '--';
        var badge = document.getElementById('perfUpdateText');
        if (badge) badge.textContent = 'Son performans guncelleme: ' + stamp;

        var score = Number((performanceData && performanceData.consistency_score) || 0);
        var scoreEl = document.getElementById('consistencyScore');
        var metaEl = document.getElementById('consistencyMeta');
        if (scoreEl) scoreEl.textContent = score.toFixed(1);
        if (metaEl) {
            if (score >= 70) metaEl.textContent = 'Model davranisi tutarli';
            else if (score >= 45) metaEl.textContent = 'Model davranisi orta tutarlilikta';
            else metaEl.textContent = 'Model davranisi dalgali, lot kontrolu artmali';
        }
    }

    function renderKpis() {
        var overview = (performanceData && performanceData.overview) || {};
        var daily = (performanceData && performanceData.daily) || {};
        var weekly = (performanceData && performanceData.weekly) || {};
        var status = (performanceData && performanceData.status_summary) || {};

        document.getElementById('overallHitRateLarge').textContent = formatPct(overview.hit_rate || 0);
        document.getElementById('overallHitMetaLarge').textContent = (overview.hits || 0) + '/' + (overview.total || 0) + ' hedef';

        document.getElementById('dailyHitRateLarge').textContent = formatPct(daily.hit_rate || 0);
        document.getElementById('dailyHitMetaLarge').textContent = (daily.hits || 0) + '/' + (daily.total || 0) + ' | Ort: ' + Number(daily.avg_days_to_hit || 0).toFixed(1) + ' gun';

        document.getElementById('weeklyHitRateLarge').textContent = formatPct(weekly.hit_rate || 0);
        document.getElementById('weeklyHitMetaLarge').textContent = (weekly.hits || 0) + '/' + (weekly.total || 0) + ' | Ort: ' + Number(weekly.avg_days_to_hit || 0).toFixed(1) + ' gun';

        document.getElementById('statusSummaryValue').textContent = (status.open || 0) + ' / ' + (status.resolved || 0);
        document.getElementById('statusSummaryMeta').textContent = 'HIT: ' + (status.hits || 0) + ' • STOPPED: ' + (status.stopped || 0) + ' • EXPIRED: ' + (status.expired || 0);
    }

    function renderAudit() {
        var direction = (performanceData && performanceData.direction_stats) || {};
        var overview = (performanceData && performanceData.overview) || {};
        var rolling = (performanceData && performanceData.rolling) || {};

        var buy = direction.buy || {};
        var sell = direction.sell || {};

        document.getElementById('buyHitRate').textContent = formatPct(buy.hit_rate || 0);
        document.getElementById('buyHitMeta').textContent = (buy.hits || 0) + '/' + (buy.total || 0) + ' AL hedefi';

        document.getElementById('sellHitRate').textContent = formatPct(sell.hit_rate || 0);
        document.getElementById('sellHitMeta').textContent = (sell.hits || 0) + '/' + (sell.total || 0) + ' SAT hedefi';

        var total = Number(overview.total || 0);
        var expired = Number(overview.expired || 0);
        var expiredRate = total > 0 ? (expired / total) * 100 : 0;
        document.getElementById('expiredRate').textContent = formatPct(expiredRate);
        document.getElementById('expiredMeta').textContent = expired + ' sure asimi / ' + total + ' kapanan hedef';

        var r30 = rolling['30d'] || {};
        var r90 = rolling['90d'] || {};
        var weighted = rolling.weighted || {};

        document.getElementById('rolling30Rate').textContent = formatPct(r30.hit_rate || 0);
        document.getElementById('rolling30Meta').textContent = (r30.hits || 0) + '/' + (r30.total || 0) + ' son 30 gun';

        document.getElementById('rolling90Rate').textContent = formatPct(r90.hit_rate || 0);
        document.getElementById('rolling90Meta').textContent = (r90.hits || 0) + '/' + (r90.total || 0) + ' son 90 gun';

        document.getElementById('weightedRate').textContent = formatPct(weighted.hit_rate || 0);
        document.getElementById('weightedMeta').textContent = 'Yari omur: ' + Number(weighted.half_life_days || 30) + ' gun';
    }

    function renderOpenTargets() {
        var tbody = document.getElementById('openTargetsBody');
        if (!tbody) return;

        var open = (performanceData && performanceData.open_targets) || [];
        var priceMap = getCurrentPriceMap();
        var targetsMap = getTargetsMap();
        var rows = '';

        for (var i = 0; i < open.length; i++) {
            var t = open[i];
            var latest = priceMap[t.ticker];
            var statusClass = t.direction === 'buy' ? 'buy' : 'sell';
            var targetLevel = detectTargetLevel(t.ticker, t.target_price, targetsMap);
            var badgeCls = getTargetBadgeClass(targetLevel);

            rows += '<tr>';
            rows += '<td data-label="Hisse"><strong>' + t.ticker + '</strong></td>';
            rows += '<td data-label="Periyot">' + formatPeriod(t.period) + '</td>';
            rows += '<td data-label="Yön"><span class="dir-badge ' + statusClass + '">' + formatDirection(t.direction) + '</span></td>';
            rows += '<td data-label="Açılış Tarihi">' + (t.opened_at || '--') + '</td>';
            rows += '<td data-label="Giriş">' + formatPrice(t.start_price, t.ticker) + '</td>';
            rows += '<td data-label="Hedef No"><span class="target-level-badge ' + badgeCls + '">' + targetLevel + '</span></td>';
            rows += '<td data-label="Hedef">' + formatPrice(t.target_price, t.ticker) + '</td>';
            rows += '<td data-label="Güncel">' + formatPrice(latest, t.ticker) + '</td>';
            rows += '<td data-label="Mesafe">' + calcDistance(t.direction, t.target_price, latest) + '</td>';
            rows += '<td data-label="Sinyal"><span class="signal-badge ' + statusClass + '"><span class="dot"></span>' + (t.signal || '--') + '</span></td>';
            rows += '</tr>';
        }

        tbody.innerHTML = rows || '<tr><td colspan="10" class="loading-cell">Acik hedef bulunmuyor.</td></tr>';
    }

    function renderResolved() {
        var tbody = document.getElementById('resolvedBody');
        if (!tbody) return;

        var items = (performanceData && performanceData.recent_resolved) || [];
        var targetsMap = getTargetsMap();

        // Calculate profit/loss for each item and group
        var highProfit = []; // >5%
        var lowProfit = [];  // <=5%

        for (var i = 0; i < items.length && i < 200; i++) {
            var r = items[i];
            if (currentStatusFilter !== 'ALL' && r.status !== currentStatusFilter) continue;

            var pl = calcProfitLoss(r.direction, r.start_price, r.close_price);
            var absPl = pl !== null ? Math.abs(pl) : 0;
            r._profitLoss = pl;
            r._absProfitLoss = absPl;

            if (absPl > 5) {
                highProfit.push(r);
            } else {
                lowProfit.push(r);
            }
        }

        // Sort within each group by absolute profit descending
        highProfit.sort(function (a, b) { return b._absProfitLoss - a._absProfitLoss; });
        lowProfit.sort(function (a, b) { return b._absProfitLoss - a._absProfitLoss; });

        var rows = '';

        // High profit group (>5%)
        if (highProfit.length > 0) {
            rows += '<tr class="group-header-row"><td colspan="12" class="group-header">';
            rows += '<span class="group-icon">🚀</span> Yüksek Getirili İşlemler <span class="group-badge high">%5 üzeri</span>';
            rows += '<span class="group-count">' + highProfit.length + ' işlem</span>';
            rows += '</td></tr>';
            rows += buildResolvedRows(highProfit, targetsMap);
        }

        // Low profit group (<=5%)
        if (lowProfit.length > 0) {
            rows += '<tr class="group-header-row"><td colspan="12" class="group-header">';
            rows += '<span class="group-icon">📊</span> Standart İşlemler <span class="group-badge low">%5 ve altı</span>';
            rows += '<span class="group-count">' + lowProfit.length + ' işlem</span>';
            rows += '</td></tr>';
            rows += buildResolvedRows(lowProfit, targetsMap);
        }

        tbody.innerHTML = rows || '<tr><td colspan="12" class="loading-cell">Bu filtreye uygun kayit yok.</td></tr>';
    }

    function buildResolvedRows(items, targetsMap) {
        var rows = '';
        for (var i = 0; i < items.length; i++) {
            var r = items[i];
            var badgeClass, badgeText;
            if (r.status === 'HIT') {
                badgeClass = 'buy';
                var hl = r.hit_level || 'H1';
                if (hl === 'H3') badgeText = 'Hedef 3 ✓✓✓';
                else if (hl === 'H2') badgeText = 'Hedef 2 ✓✓';
                else badgeText = 'Hedef 1 ✓';
            }
            else if (r.status === 'STOPPED') { badgeClass = 'stopped'; badgeText = 'Stop-Loss'; }
            else { badgeClass = 'sell'; badgeText = 'Süre Aşımı'; }

            // Use backend hit_level if available, else detect from targets
            var targetLevel = r.hit_level || detectTargetLevel(r.ticker, r.target_price, targetsMap);
            var tBadgeCls = getTargetBadgeClass(targetLevel);

            // Use backend profit_pct if available
            var pl = (r.profit_pct != null) ? r.profit_pct : r._profitLoss;
            var plClass = '';
            var plText = '--';
            if (pl != null) {
                plClass = pl >= 0 ? 'profit-positive' : 'profit-negative';
                plText = (pl >= 0 ? '+' : '') + Number(pl).toFixed(2) + '%';
            }

            rows += '<tr>';
            rows += '<td data-label="Hisse"><strong>' + r.ticker + '</strong></td>';
            rows += '<td data-label="Periyot">' + formatPeriod(r.period) + '</td>';
            rows += '<td data-label="Yön"><span class="dir-badge ' + (r.direction === 'buy' ? 'buy' : 'sell') + '">' + formatDirection(r.direction) + '</span></td>';
            rows += '<td data-label="Açılış Tp.">' + (r.opened_at || '--') + '</td>';
            rows += '<td data-label="Kapanış Tp.">' + (r.closed_at || '--') + '</td>';
            rows += '<td data-label="Giriş">' + formatPrice(r.start_price, r.ticker) + '</td>';
            rows += '<td data-label="Hedef No"><span class="target-level-badge ' + tBadgeCls + '">' + targetLevel + '</span></td>';
            rows += '<td data-label="Hedef">' + formatPrice(r.target_price, r.ticker) + '</td>';
            rows += '<td data-label="Kapanış">' + formatPrice(r.close_price, r.ticker) + '</td>';
            rows += '<td data-label="Kâr/Zarar" class="' + plClass + '"><strong>' + plText + '</strong></td>';
            rows += '<td data-label="Gün">' + Number(r.days_to_result || 0) + '</td>';
            rows += '<td data-label="Durum"><span class="signal-badge ' + badgeClass + '"><span class="dot"></span>' + badgeText + '</span></td>';
            rows += '</tr>';
        }
        return rows;
    }

    /* ── setup ─────────────────────────────────── */

    function setupMobileNav() {
        var btn = document.getElementById('navToggle');
        var panel = document.getElementById('mobileNavPanel');
        if (!btn || !panel) return;

        function closeNav() {
            document.body.classList.remove('nav-open');
            btn.setAttribute('aria-expanded', 'false');
        }

        btn.addEventListener('click', function () {
            var isOpen = document.body.classList.toggle('nav-open');
            btn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
        });

        panel.querySelectorAll('a').forEach(function (link) {
            link.addEventListener('click', closeNav);
        });

        window.addEventListener('resize', function () {
            if (window.innerWidth > 768) closeNav();
        });

        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') closeNav();
        });
    }

    function bindFilters() {
        var tabs = document.querySelectorAll('.perf-filter-tabs .filter-tab');
        for (var i = 0; i < tabs.length; i++) {
            tabs[i].addEventListener('click', function () {
                for (var j = 0; j < tabs.length; j++) tabs[j].classList.remove('active');
                this.classList.add('active');
                currentStatusFilter = this.getAttribute('data-status') || 'ALL';
                renderResolved();
            });
        }
    }

    function renderAll() {
        renderHeroMeta();
        renderKpis();
        renderAudit();
        renderOpenTargets();
        renderResolved();
    }

    function init() {
        setupMobileNav();
        var isAgbe = window.location.pathname.includes('agbe');
        var perfFile = isAgbe ? 'data/performance_agbe.json' : 'data/performance.json';
        var sumFile = isAgbe ? 'data/agbe_overview.json' : 'data/summary.json';

        Promise.all([
            fetch(perfFile).then(function (r) { return r.json(); }),
            fetch(sumFile).then(function (r) { return r.json(); })
        ]).then(function (results) {
            performanceData = results[0] || {};
            var rawSummary = results[1] || {};
            summaryData = isAgbe ? Object.assign({}, rawSummary, { stocks: rawSummary.assets || [] }) : rawSummary;
            bindFilters();
            renderAll();
        }).catch(function () {
            var body1 = document.getElementById('openTargetsBody');
            var body2 = document.getElementById('resolvedBody');
            if (body1) body1.innerHTML = '<tr><td colspan="10" class="loading-cell">Veri alinamadi.</td></tr>';
            if (body2) body2.innerHTML = '<tr><td colspan="12" class="loading-cell">Veri alinamadi.</td></tr>';
            var txt = document.getElementById('perfUpdateText');
            if (txt) txt.textContent = 'Performans verisi yuklenemedi';
        });
    }

    document.addEventListener('DOMContentLoaded', init);
})();
