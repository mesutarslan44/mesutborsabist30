(function () {
    'use strict';

    var performanceData = null;
    var summaryData = null;
    var currentStatusFilter = 'ALL';

    function formatPrice(val) {
        if (val == null || isNaN(val)) return '--';
        return 'TL ' + Number(val).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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

    function calcDistance(direction, target, current) {
        if (target == null || current == null || target === 0) return '--';
        var pct;
        if (direction === 'buy') pct = ((target - current) / target) * 100;
        else pct = ((current - target) / target) * 100;
        return formatPct(pct);
    }

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
        document.getElementById('statusSummaryMeta').textContent = 'HIT: ' + (status.hits || 0) + ' • EXPIRED: ' + (status.expired || 0);
    }

    function renderAudit() {
        var direction = (performanceData && performanceData.direction_stats) || {};
        var overview = (performanceData && performanceData.overview) || {};

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
    }

    function renderOpenTargets() {
        var tbody = document.getElementById('openTargetsBody');
        if (!tbody) return;

        var open = (performanceData && performanceData.open_targets) || [];
        var priceMap = getCurrentPriceMap();
        var rows = '';

        for (var i = 0; i < open.length; i++) {
            var t = open[i];
            var latest = priceMap[t.ticker];
            var statusClass = t.direction === 'buy' ? 'buy' : 'sell';
            rows += '<tr>';
            rows += '<td><strong>' + t.ticker + '</strong></td>';
            rows += '<td>' + formatPeriod(t.period) + '</td>';
            rows += '<td>' + formatDirection(t.direction) + '</td>';
            rows += '<td>' + (t.opened_at || '--') + '</td>';
            rows += '<td>' + formatPrice(t.start_price) + '</td>';
            rows += '<td>' + formatPrice(t.target_price) + '</td>';
            rows += '<td>' + formatPrice(latest) + '</td>';
            rows += '<td>' + calcDistance(t.direction, t.target_price, latest) + '</td>';
            rows += '<td><span class="signal-badge ' + statusClass + '"><span class="dot"></span>' + (t.signal || '--') + '</span></td>';
            rows += '</tr>';
        }

        tbody.innerHTML = rows || '<tr><td colspan="9" class="loading-cell">Acik hedef bulunmuyor.</td></tr>';
    }

    function renderResolved() {
        var tbody = document.getElementById('resolvedBody');
        if (!tbody) return;

        var items = (performanceData && performanceData.recent_resolved) || [];
        var rows = '';

        for (var i = 0; i < items.length && i < 80; i++) {
            var r = items[i];
            if (currentStatusFilter !== 'ALL' && r.status !== currentStatusFilter) continue;

            var badgeClass = r.status === 'HIT' ? 'buy' : 'sell';
            var badgeText = r.status === 'HIT' ? 'Tutturuldu' : 'Sure Asimi';

            rows += '<tr>';
            rows += '<td><strong>' + r.ticker + '</strong></td>';
            rows += '<td>' + formatPeriod(r.period) + '</td>';
            rows += '<td>' + formatDirection(r.direction) + '</td>';
            rows += '<td>' + (r.opened_at || '--') + '</td>';
            rows += '<td>' + (r.closed_at || '--') + '</td>';
            rows += '<td>' + formatPrice(r.target_price) + '</td>';
            rows += '<td>' + formatPrice(r.close_price) + '</td>';
            rows += '<td>' + Number(r.days_to_result || 0) + '</td>';
            rows += '<td><span class="signal-badge ' + badgeClass + '"><span class="dot"></span>' + badgeText + '</span></td>';
            rows += '</tr>';
        }

        tbody.innerHTML = rows || '<tr><td colspan="9" class="loading-cell">Bu filtreye uygun kayit yok.</td></tr>';
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
        Promise.all([
            fetch('data/performance.json').then(function (r) { return r.json(); }),
            fetch('data/summary.json').then(function (r) { return r.json(); })
        ]).then(function (results) {
            performanceData = results[0] || {};
            summaryData = results[1] || {};
            bindFilters();
            renderAll();
        }).catch(function () {
            var body1 = document.getElementById('openTargetsBody');
            var body2 = document.getElementById('resolvedBody');
            if (body1) body1.innerHTML = '<tr><td colspan="9" class="loading-cell">Veri alinamadi.</td></tr>';
            if (body2) body2.innerHTML = '<tr><td colspan="9" class="loading-cell">Veri alinamadi.</td></tr>';
            var txt = document.getElementById('perfUpdateText');
            if (txt) txt.textContent = 'Performans verisi yuklenemedi';
        });
    }

    document.addEventListener('DOMContentLoaded', init);
})();
