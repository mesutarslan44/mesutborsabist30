/**
 * BIST 30 Analiz - Dashboard v2.0
 * Endeks yorumları, haberler, genişletilmiş tablo, veri güncellik bilgisi
 */

(function () {
    'use strict';

    let summaryData = null;
    let marketData = null;
    let performanceData = null;
    let decisionCoachData = null;
    let currentFilter = 'all';
    let currentSort = { key: 'score', dir: 'desc' };
    let refreshTimer = null;
    let freshnessTimer = null;
    const REFRESH_ENDPOINT = '/api/refresh';
    const REFRESH_KEY_STORAGE = 'refreshApiKey';
    const REFRESH_PROGRESS_STORAGE = 'manualRefreshProgress';
    const REFRESH_POLL_DELAY_MS = 15000;
    const REFRESH_MAX_ATTEMPTS = 24;

    let matrixAnimId = null;
    let manualRefreshTicker = null;
    let activeRefreshProgress = null;

    function setupMatrixIntro() {
        var intro = document.getElementById('matrixIntro');
        var hasSeenIntro = false;

        try {
            hasSeenIntro = localStorage.getItem('matrixIntroSeen') === '1';
        } catch (e) {
            hasSeenIntro = false;
        }

        if (!intro || hasSeenIntro) {
            if (intro && intro.parentNode) intro.parentNode.removeChild(intro);
            document.body.classList.remove('intro-locked');
            document.body.classList.add('intro-unlocked');
            return;
        }

        document.body.classList.add('intro-locked');

        var blueBtn = document.getElementById('bluePillBtn');
        var redBtn = document.getElementById('redPillBtn');
        var canvas = document.getElementById('matrixCanvas');
        var ctx = canvas ? canvas.getContext('2d') : null;

        if (ctx && canvas) {
            startMatrixRain(canvas, ctx);
        }

        if (redBtn) {
            redBtn.addEventListener('click', function () {
                // Intentionally no-op.
            });
        }

        if (blueBtn) {
            blueBtn.addEventListener('click', function () {
                try {
                    localStorage.setItem('matrixIntroSeen', '1');
                } catch (e) {
                    // no-op
                }

                intro.classList.add('hide');
                document.body.classList.remove('intro-locked');
                document.body.classList.add('intro-unlocked');
                window.setTimeout(function () {
                    if (matrixAnimId) {
                        cancelAnimationFrame(matrixAnimId);
                        matrixAnimId = null;
                    }
                    if (intro && intro.parentNode) intro.parentNode.removeChild(intro);
                }, 900);
            });
        }
    }

    function startMatrixRain(canvas, ctx) {
        var chars = '01ABCDEFGHIJKLMNOPQRSTUVWXYZ#$%&*+-/<>=@';
        var fontSize = 15;
        var columns = 0;
        var drops = [];

        function resize() {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
            columns = Math.max(1, Math.floor(canvas.width / fontSize));
            drops = [];
            for (var i = 0; i < columns; i++) drops[i] = Math.random() * -40;
        }

        function draw() {
            ctx.fillStyle = 'rgba(2, 8, 10, 0.12)';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.font = fontSize + 'px monospace';

            for (var i = 0; i < drops.length; i++) {
                var ch = chars.charAt(Math.floor(Math.random() * chars.length));
                var x = i * fontSize;
                var y = drops[i] * fontSize;
                var green = 120 + Math.floor(Math.random() * 135);
                ctx.fillStyle = 'rgb(0,' + green + ',90)';
                ctx.fillText(ch, x, y);

                if (y > canvas.height && Math.random() > 0.975) {
                    drops[i] = Math.random() * -25;
                }
                drops[i] += 0.72;
            }
            matrixAnimId = requestAnimationFrame(draw);
        }

        window.addEventListener('resize', resize);
        resize();
        draw();
    }
    // ── Helpers ──
    function formatPrice(val) {
        if (val == null || isNaN(val)) return '--';
        return '₺' + val.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    function formatPercent(val) {
        if (val == null || isNaN(val)) return '--%';
        var sign = val >= 0 ? '+' : '';
        return sign + val.toFixed(2) + '%';
    }

    function formatRange(rangeObj) {
        if (!rangeObj || rangeObj.min == null || rangeObj.max == null) return '-- / --';
        return formatPrice(rangeObj.min) + ' - ' + formatPrice(rangeObj.max);
    }

    function calculateRewardRisk(stock) {
        if (!stock || !stock.targets) return null;
        var price = Number(stock.price);
        var target = Number(stock.targets.target_1);
        var stop = Number(stock.targets.stop_loss);
        if (!isFinite(price) || !isFinite(target) || !isFinite(stop)) return null;

        var reward = Math.abs(target - price);
        var risk = Math.abs(price - stop);
        if (!risk) return null;
        return reward / risk;
    }

    function getSetupGrade(stock) {
        var confidence = Number(stock.confidence || 0);
        var score = Math.abs(Number(stock.score || 0));
        var volume = Number(stock.volume_ratio || 0);
        var rr = calculateRewardRisk(stock) || 0;

        if (confidence >= 70 && score >= 20 && rr >= 1.5 && volume >= 1.1) return { grade: 'A', cls: 'grade-a', hint: 'Guclu setup' };
        if (confidence >= 55 && score >= 14 && rr >= 1.2) return { grade: 'B', cls: 'grade-b', hint: 'Dengeli setup' };
        return { grade: 'C', cls: 'grade-c', hint: 'Temkinli setup' };
    }

    function getChangeClass(val) {
        if (val > 0) return 'positive';
        if (val < 0) return 'negative';
        return 'neutral';
    }

    function getSignalClass(signalEn) {
        var map = {
            'STRONG_BUY': 'strong-buy', 'BUY': 'buy', 'WEAK_BUY': 'weak-buy',
            'HOLD': 'hold',
            'WEAK_SELL': 'weak-sell', 'SELL': 'sell', 'STRONG_SELL': 'strong-sell'
        };
        return map[signalEn] || 'hold';
    }

    function toDateFromTRString(raw) {
        if (!raw || typeof raw !== 'string') return null;
        // expected: YYYY-MM-DD HH:MM
        var normalized = raw.replace(' ', 'T') + ':00';
        var dt = new Date(normalized);
        if (isNaN(dt.getTime())) return null;
        return dt;
    }

    function formatDateTime(dt) {
        if (!dt || isNaN(dt.getTime())) return '--';
        return dt.toLocaleString('tr-TR', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
    }

    function calcAgeText(dataDt, nowDt) {
        if (!dataDt || !nowDt) return '--';
        var diffMs = nowDt - dataDt;
        if (diffMs < 0) return 'Saat senkronu kontrol edilmeli';
        var totalMin = Math.floor(diffMs / 60000);
        var hours = Math.floor(totalMin / 60);
        var mins = totalMin % 60;
        return hours > 0 ? (hours + ' saat ' + mins + ' dk') : (mins + ' dk');
    }

    function calcAgeMinutes(dataDt, nowDt) {
        if (!dataDt || !nowDt) return null;
        var diffMs = nowDt - dataDt;
        if (diffMs < 0) return null;
        return Math.floor(diffMs / 60000);
    }

    function getFreshnessState(ageMinutes) {
        if (ageMinutes == null) return { text: 'Bilinmiyor', cls: '' };
        if (ageMinutes <= 90) return { text: 'Guncel', cls: 'fresh' };
        if (ageMinutes <= 360) return { text: 'Gecikmeli', cls: 'warn' };
        return { text: 'Eski Veri', cls: 'stale' };
    }

    function getFilterGroup(signalEn) {
        if (['STRONG_BUY', 'BUY', 'WEAK_BUY'].indexOf(signalEn) >= 0) return 'buy';
        if (['STRONG_SELL', 'SELL', 'WEAK_SELL'].indexOf(signalEn) >= 0) return 'sell';
        return 'hold';
    }

    function setManualRefreshStatus(message, isError, isLoading) {
        var statusEl = document.getElementById('manualRefreshStatus');
        if (!statusEl) return;
        statusEl.textContent = message;
        statusEl.style.color = isError ? 'var(--bear-red)' : 'var(--text-muted)';
        statusEl.classList.toggle('loading', !!isLoading);
        statusEl.classList.toggle('error', !!isError);
    }

    function getManualRefreshButton() {
        return document.getElementById('manualRefreshBtn');
    }

    function setManualRefreshButtonState(isBusy) {
        var btn = getManualRefreshButton();
        if (!btn) return;
        btn.disabled = !!isBusy;
        btn.textContent = isBusy ? 'Yenileniyor...' : 'Simdi Yenile';
    }

    function readRefreshProgress() {
        try {
            var raw = localStorage.getItem(REFRESH_PROGRESS_STORAGE);
            if (!raw) return null;
            var parsed = JSON.parse(raw);
            return parsed && parsed.inProgress ? parsed : null;
        } catch (e) {
            return null;
        }
    }

    function saveRefreshProgress(progress) {
        try {
            localStorage.setItem(REFRESH_PROGRESS_STORAGE, JSON.stringify(progress));
        } catch (e) {
            // no-op
        }
    }

    function clearRefreshProgress() {
        try {
            localStorage.removeItem(REFRESH_PROGRESS_STORAGE);
        } catch (e) {
            // no-op
        }
    }

    function formatDurationCompact(totalSeconds) {
        var sec = Math.max(0, Math.floor(totalSeconds || 0));
        var minutes = Math.floor(sec / 60);
        var seconds = sec % 60;
        if (minutes > 0) return minutes + ' dk ' + String(seconds).padStart(2, '0') + ' sn';
        return seconds + ' sn';
    }

    function renderRefreshProgressStatus(progress) {
        if (!progress) return;

        var now = Date.now();
        var elapsed = Math.max(0, Math.floor((now - (progress.startedAt || now)) / 1000));
        var nextCheckIn = Math.max(0, Math.ceil(((progress.nextCheckAt || now) - now) / 1000));
        var attemptsDone = Math.max(0, progress.attempt || 0);
        var checksLeft = Math.max(0, REFRESH_MAX_ATTEMPTS - attemptsDone);
        var message = 'Analiz calisiyor... gecen sure: ' + formatDurationCompact(elapsed)
            + ' | sonraki kontrol: ' + nextCheckIn + ' sn'
            + ' | kalan kontrol: ' + checksLeft;

        setManualRefreshStatus(message, false, true);
    }

    function stopRefreshProgressTicker() {
        if (manualRefreshTicker) {
            clearInterval(manualRefreshTicker);
            manualRefreshTicker = null;
        }
    }

    function startRefreshProgressTicker(progress) {
        stopRefreshProgressTicker();
        activeRefreshProgress = progress;
        renderRefreshProgressStatus(progress);
        manualRefreshTicker = setInterval(function () {
            if (!activeRefreshProgress || !activeRefreshProgress.inProgress) return;
            renderRefreshProgressStatus(activeRefreshProgress);
        }, 1000);
    }

    function beginRefreshProgress(previousUpdatedAt, runUrl) {
        activeRefreshProgress = {
            inProgress: true,
            startedAt: Date.now(),
            previousUpdatedAt: previousUpdatedAt || '',
            nextCheckAt: Date.now() + REFRESH_POLL_DELAY_MS,
            attempt: 0,
            runUrl: runUrl || ''
        };

        saveRefreshProgress(activeRefreshProgress);
        setManualRefreshButtonState(true);
        startRefreshProgressTicker(activeRefreshProgress);
        return activeRefreshProgress;
    }

    function finishRefreshProgress() {
        stopRefreshProgressTicker();
        activeRefreshProgress = null;
        clearRefreshProgress();
        setManualRefreshButtonState(false);
    }


    function getStoredRefreshKey() {
        try {
            return localStorage.getItem(REFRESH_KEY_STORAGE) || '';
        } catch (e) {
            return '';
        }
    }

    function setStoredRefreshKey(val) {
        try {
            if (val) localStorage.setItem(REFRESH_KEY_STORAGE, val);
        } catch (e) {
            // no-op
        }
    }

    function clearStoredRefreshKey() {
        try {
            localStorage.removeItem(REFRESH_KEY_STORAGE);
        } catch (e) {
            // no-op
        }
    }

    async function triggerServerRefresh() {
        var key = getStoredRefreshKey();

        async function sendRequest(secret) {
            var headers = { 'Content-Type': 'application/json' };
            if (secret) headers['x-refresh-key'] = secret;
            return fetch(REFRESH_ENDPOINT, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify({ source: 'dashboard_manual' })
            });
        }

        var res = await sendRequest(key);

        if (res.status === 401) {
            var inputKey = window.prompt('Yenileme anahtarini gir (tek sefer kaydedilir):', '');
            if (!inputKey) {
                return { ok: false, cancelled: true, message: 'Yenileme iptal edildi.' };
            }
            res = await sendRequest(inputKey.trim());
            if (res.ok) setStoredRefreshKey(inputKey.trim());
        }

        var payload = {};
        try {
            payload = await res.json();
        } catch (e) {
            payload = {};
        }

        if (res.status === 401) {
            clearStoredRefreshKey();
            return { ok: false, message: payload.message || 'Yenileme anahtari gecersiz.' };
        }

        if (!res.ok) {
            var detailMsg = payload.detail ? ' Detay: ' + payload.detail : '';
            return { ok: false, message: (payload.message || 'Yenileme tetiklenemedi.') + detailMsg };
        }

        return { ok: true, runUrl: payload.run_url || '', message: payload.message || '' };
    }

    async function waitForFreshSnapshot(previousUpdatedAt, persistedProgress) {
        var progress = persistedProgress || activeRefreshProgress || beginRefreshProgress(previousUpdatedAt, '');
        progress.inProgress = true;
        progress.previousUpdatedAt = previousUpdatedAt || progress.previousUpdatedAt || '';
        var startAttempt = Math.max(0, progress.attempt || 0);

        setManualRefreshButtonState(true);
        startRefreshProgressTicker(progress);

        for (var i = startAttempt; i < REFRESH_MAX_ATTEMPTS; i++) {
            progress.attempt = i;
            progress.nextCheckAt = Date.now() + REFRESH_POLL_DELAY_MS;
            activeRefreshProgress = progress;
            saveRefreshProgress(progress);
            renderRefreshProgressStatus(progress);

            await new Promise(function (resolve) { setTimeout(resolve, REFRESH_POLL_DELAY_MS); });
            var ok = await loadData(true);
            if (!ok || !summaryData) continue;

            var nextUpdatedAt = summaryData.updated_at || '';
            if (nextUpdatedAt && nextUpdatedAt !== progress.previousUpdatedAt) {
                return { ok: true, updatedAt: nextUpdatedAt };
            }
        }

        return { ok: false, runUrl: progress.runUrl || '' };
    }

    async function resumePendingRefreshIfAny() {
        var persisted = readRefreshProgress();
        if (!persisted) return;

        persisted.inProgress = true;
        activeRefreshProgress = persisted;
        setManualRefreshStatus('Yenileme takibi geri yuklendi. Veri bekleniyor...', false, true);

        try {
            var refreshResult = await waitForFreshSnapshot(persisted.previousUpdatedAt || '', persisted);
            if (refreshResult.ok) {
                var extra = persisted.runUrl ? ' | Is akisi: ' + persisted.runUrl : '';
                setManualRefreshStatus('Yeni veri alindi: ' + refreshResult.updatedAt + extra, false, false);
            } else {
                var fallback = persisted.runUrl
                    ? 'Is akisini ac: ' + persisted.runUrl
                    : 'GitHub Actions ekranindan calisma durumunu kontrol et.';
                setManualRefreshStatus('Analiz suruyor olabilir. ' + fallback, true, false);
            }
        } catch (e) {
            console.error('Resume refresh error:', e);
            setManualRefreshStatus('Yenileme takibi sirasinda hata olustu.', true, false);
        } finally {
            finishRefreshProgress();
        }
    }

    // ── Load Data ──
    async function loadData(forceRefresh) {
        var force = !!forceRefresh;

        function withCacheBust(url) {
            if (!force) return url;
            var sep = url.indexOf('?') >= 0 ? '&' : '?';
            return url + sep + 'ts=' + Date.now();
        }

        var reqOpts = force ? { cache: 'no-store' } : undefined;
        var isAgbe = window.location.pathname.includes('/agbe');

        try {
            var summaryUrl = isAgbe ? 'data/agbe_overview.json' : 'data/summary.json';
            var marketUrl = isAgbe ? 'data/agbe_overview.json' : 'data/market_overview.json';
            var perfUrl = isAgbe ? 'data/performance_agbe.json' : 'data/performance.json';

            var res1 = await fetch(withCacheBust(summaryUrl), reqOpts);
            var res2 = await fetch(withCacheBust(marketUrl), reqOpts);
            var res3 = await fetch(withCacheBust(perfUrl), reqOpts);
            var res4 = await fetch(withCacheBust('data/decision_coach.json'), reqOpts);

            if (!res1.ok || !res2.ok) throw new Error('Veri yüklenemedi');

            var rawSummary = await res1.json();
            // Map assets to stocks manually for AGBE to reuse the exact same frontend loops
            summaryData = isAgbe ? Object.assign({}, rawSummary, { stocks: rawSummary.assets || [] }) : rawSummary;
            marketData = await res2.json();

            if (res3.ok) performanceData = await res3.json();
            if (res4.ok) decisionCoachData = await res4.json();

            render();
            return true;
        } catch (err) {
            console.error('Veri hatası:', err);
            document.getElementById('stockTableBody').innerHTML =
                '<tr><td colspan="6" style="text-align:center;padding:40px;color:var(--bear-red);">⚠️ Veriler yüklenemedi. Lütfen sayfayı yenileyin.</td></tr>';
            return false;
        }
    }

    // ── Render All ──
    var coreRenderers = [
        renderUpdateBadge,
        renderMarketBar,
        renderSignalSummary,
        renderCommandCenter,
        renderFirstDecision,
        renderDisciplineGuide,
        renderDataFreshness,
    ];

    var contentRenderers = [
        renderDecisionCoach,
        renderIndexCommentary,
        renderAlarmCenter,
        renderTopSignals,
        renderPerformance,
        renderNews,
        renderTable,
    ];

    function runRenderers(renderers) {
        for (var i = 0; i < renderers.length; i++) {
            renderers[i]();
        }
    }

    function render() {
        runRenderers(coreRenderers);
        runRenderers(contentRenderers);
    }

    // ── Update Badge ──
    function renderUpdateBadge() {
        var el = document.getElementById('updateTime');
        if (el && summaryData && summaryData.updated_at) {
            el.textContent = 'Son: ' + summaryData.updated_at;
        }
    }

    // ── Market Bar (BIST 30 + BIST 100) ──
    function renderMarketBar() {
        var indices = (summaryData && summaryData.indices) || {};

        var bist30 = indices.XU030;
        if (bist30) {
            var b30v = document.getElementById('bist30Value');
            if (b30v) b30v.textContent = bist30.value ? bist30.value.toLocaleString('tr-TR', { minimumFractionDigits: 2 }) : '--';
            var ch30 = document.getElementById('bist30Change');
            if (ch30) {
                ch30.textContent = formatPercent(bist30.change_pct);
                ch30.className = 'market-change ' + getChangeClass(bist30.change_pct);
            }
        }

        var bist100 = indices.XU100;
        if (bist100) {
            var b100v = document.getElementById('bist100Value');
            if (b100v) b100v.textContent = bist100.value ? bist100.value.toLocaleString('tr-TR', { minimumFractionDigits: 2 }) : '--';
            var ch100 = document.getElementById('bist100Change');
            if (ch100) {
                ch100.textContent = formatPercent(bist100.change_pct);
                ch100.className = 'market-change ' + getChangeClass(bist100.change_pct);
            }
        }
    }

    // ── Index Commentary ──
    function renderIndexCommentary() {
        var container = document.getElementById('indexCommentary');
        if (!container) return;

        var indices = (summaryData && summaryData.indices) || {};
        var html = '';

        var indexList = [indices.XU030, indices.XU100];
        for (var i = 0; i < indexList.length; i++) {
            var idx = indexList[i];
            if (!idx) continue;

            html += '<div class="index-card">';
            html += '<div class="index-card-header">';
            html += '<div>';
            html += '<div class="index-name">' + idx.name + '</div>';
            html += '<div class="index-value">' + (idx.value ? idx.value.toLocaleString('tr-TR', { minimumFractionDigits: 2 }) : '--') + '</div>';
            html += '</div>';
            html += '<div style="text-align:right;">';
            html += '<div class="stock-change ' + getChangeClass(idx.change_pct) + '" style="font-size:18px;font-weight:700;">' + formatPercent(idx.change_pct) + '</div>';
            html += '<div style="font-size:11px;color:var(--text-muted);">';
            html += 'Hafta: <span class="' + getChangeClass(idx.weekly_change_pct) + '">' + formatPercent(idx.weekly_change_pct) + '</span> | ';
            html += 'Ay: <span class="' + getChangeClass(idx.monthly_change_pct) + '">' + formatPercent(idx.monthly_change_pct) + '</span>';
            html += '</div>';
            html += '</div>';
            html += '</div>';
            html += '<div class="index-trend" style="color:' + idx.trend_color + ';">';
            html += '<strong>Trend: ' + idx.trend + '</strong>';
            html += '</div>';
            html += '<div class="index-comment">' + idx.yorum + '</div>';
            html += '<div class="index-daily-comment" style="margin-top:8px;padding:8px 12px;background:rgba(99,102,241,0.06);border-radius:8px;font-size:13px;">';
            html += '📌 ' + idx.gunluk_yorum;
            html += '</div>';
            html += '<div style="margin-top:8px;font-size:11px;color:var(--text-muted);">';
            html += '52 Hafta: ₺' + (idx.yearly_low ? idx.yearly_low.toLocaleString('tr-TR') : '--') + ' — ₺' + (idx.yearly_high ? idx.yearly_high.toLocaleString('tr-TR') : '--');
            html += '</div>';
            html += '</div>';
        }

        container.innerHTML = html;
    }

    // ── Signal Summary ──
    function renderSignalSummary() {
        if (!summaryData) return;
        var counts = summaryData.signal_counts || {};

        animateCounter('totalCount', summaryData.total_stocks || summaryData.total_assets || 0);
        animateCounter('buyCount', (counts.STRONG_BUY || 0) + (counts.BUY || 0) + (counts.WEAK_BUY || 0));
        animateCounter('holdCount', counts.HOLD || 0);
        animateCounter('sellCount', (counts.STRONG_SELL || 0) + (counts.SELL || 0) + (counts.WEAK_SELL || 0));
    }

    function renderCommandCenter() {
        if (!summaryData) return;

        var counts = summaryData.signal_counts || {};
        var buyCount = (counts.STRONG_BUY || 0) + (counts.BUY || 0) + (counts.WEAK_BUY || 0);
        var holdCount = counts.HOLD || 0;
        var sellCount = (counts.STRONG_SELL || 0) + (counts.SELL || 0) + (counts.WEAK_SELL || 0);
        var total = summaryData.total_stocks || 1;

        var buyRatio = (buyCount / total) * 100;
        var sellRatio = (sellCount / total) * 100;

        var pulseText = 'Dengeli';
        var pulseMeta = 'Alici ve satici gucu benzer';
        if (buyRatio - sellRatio > 20) {
            pulseText = 'Pozitif Egilim';
            pulseMeta = 'AL sinyalleri SAT sinyallerinden belirgin yuksek';
        } else if (sellRatio - buyRatio > 20) {
            pulseText = 'Temkinli Bolge';
            pulseMeta = 'SAT tarafi gucleniyor, koruma planina oncelik ver';
        }

        var dayPlanText = 'Secici ilerle';
        var dayPlanMeta = 'En yuksek puanli 3 hisseyi takip listene ekle';
        if (buyRatio > 45) {
            dayPlanText = 'Kademeli AL penceresi';
            dayPlanMeta = 'Teyitli hisselerde parcali giris + net stop kullan';
        } else if (sellRatio > 45) {
            dayPlanText = 'Risk azaltma gunu';
            dayPlanMeta = 'Yeni islemde acele etme, mevcutlarda stop disiplini uygula';
        } else if (holdCount / total > 0.4) {
            dayPlanText = 'Sabir odakli gun';
            dayPlanMeta = 'Net sinyal az, teyit gelene kadar nakit agirligi korunabilir';
        }

        var riskScore = Math.min(100, Math.max(10, Math.round(sellRatio * 1.3 + holdCount / total * 20)));
        var riskLabel = 'Dusuk';
        if (riskScore > 70) riskLabel = 'Yuksek';
        else if (riskScore > 40) riskLabel = 'Orta';

        var pulseEl = document.getElementById('marketPulseText');
        var pulseMetaEl = document.getElementById('marketPulseMeta');
        var planEl = document.getElementById('dayPlanText');
        var planMetaEl = document.getElementById('dayPlanMeta');
        var riskFillEl = document.getElementById('riskMeterFill');
        var riskTextEl = document.getElementById('riskMeterText');

        if (pulseEl) pulseEl.textContent = pulseText;
        if (pulseMetaEl) pulseMetaEl.textContent = pulseMeta;
        if (planEl) planEl.textContent = dayPlanText;
        if (planMetaEl) planMetaEl.textContent = dayPlanMeta;
        if (riskFillEl) riskFillEl.style.width = riskScore + '%';
        if (riskTextEl) riskTextEl.textContent = 'Risk Seviyesi: ' + riskLabel + ' (%' + riskScore + ')';

        var watch = summaryData.stocks ? summaryData.stocks.slice().sort(function (a, b) {
            return (b.score || 0) - (a.score || 0);
        }).slice(0, 3) : [];

        var watchEl = document.getElementById('watchlistChips');
        if (watchEl) {
            var html = '';
            for (var i = 0; i < watch.length; i++) {
                var w = watch[i];
                html += '<a class="watch-chip" href="hisse.html?ticker=' + w.ticker + '">' + w.ticker + ' · ' + (w.score >= 0 ? '+' : '') + (w.score || 0).toFixed(1) + '</a>';
            }
            watchEl.innerHTML = html || '<span class="watch-chip">Takip listesi olusmadi</span>';
        }

        startRefreshCountdown(summaryData.updated_at);
    }

    function getActionText(signalEn, confidence) {
        var conf = Number(confidence || 0);
        if (['STRONG_BUY', 'BUY'].indexOf(signalEn) >= 0) {
            return conf >= 70 ? 'Kademeli al ve stop koy' : 'Kucuk lotla izle';
        }
        if (signalEn === 'WEAK_BUY') return 'Teyit bekle, acele etme';
        if (['STRONG_SELL', 'SELL'].indexOf(signalEn) >= 0) return 'Pozisyonu azalt/korun';
        if (signalEn === 'WEAK_SELL') return 'Temkinli ol, stopu sikilastir';
        return 'Bekle ve teyit ara';
    }

    function renderFirstDecision() {
        if (!summaryData || !summaryData.stocks) return;
        var container = document.getElementById('firstDecisionList');
        var meta = document.getElementById('firstDecisionMeta');
        if (!container) return;

        var prioritized = summaryData.stocks.slice().sort(function (a, b) {
            return (b.score || 0) - (a.score || 0);
        });

        if (meta) {
            var counts = summaryData.signal_counts || {};
            var buyCount = Number(counts.BUY || 0) + Number(counts.WEAK_BUY || 0) + Number(counts.STRONG_BUY || 0);
            var sellCount = Number(counts.SELL || 0) + Number(counts.WEAK_SELL || 0) + Number(counts.STRONG_SELL || 0);
            var holdCount = Number(counts.HOLD || 0);
            meta.textContent = 'AL yonlu ' + buyCount + ' | BEKLE ' + holdCount + ' | SAT yonlu ' + sellCount;
        }

        var html = '';
        for (var i = 0; i < prioritized.length && i < 3; i++) {
            var s = prioritized[i];
            var action = getActionText(s.signal_en, s.confidence);
            html += '<a class="first-decision-item" href="hisse.html?ticker=' + s.ticker + '">';
            html += '<div class="first-decision-left">';
            html += '<strong>' + s.ticker + '</strong>';
            html += '<span>' + (s.name || '') + '</span>';
            html += '</div>';
            html += '<div class="first-decision-mid">';
            html += '<span class="signal-badge ' + getSignalClass(s.signal_en) + '"><span class="dot"></span>' + (s.signal || 'BEKLE') + '</span>';
            html += '<span class="first-decision-confidence">Guven %' + (Number(s.confidence || 0)).toFixed(0) + '</span>';
            html += '</div>';
            html += '<div class="first-decision-right">' + action + '</div>';
            html += '</a>';
        }

        container.innerHTML = html || '<div class="first-decision-empty">Oncelikli hisse bulunamadi.</div>';
    }


    function renderDisciplineGuide() {
        if (!summaryData || !summaryData.stocks) return;

        var stocks = summaryData.stocks.slice();
        var total = stocks.length || 1;
        var buyCandidates = stocks.filter(function (s) {
            return ['STRONG_BUY', 'BUY', 'WEAK_BUY'].indexOf(s.signal_en) >= 0;
        }).sort(function (a, b) {
            return (b.score || 0) - (a.score || 0);
        });

        var riskPerTradeText = 'Her islemde maksimum portfoyun %0.75 riskini kullan.';
        var allocationText = 'Piyasa dengeli: nakit oranini %35-%45 bandinda koru.';

        var sellCount = stocks.filter(function (s) {
            return ['STRONG_SELL', 'SELL', 'WEAK_SELL'].indexOf(s.signal_en) >= 0;
        }).length;
        var sellRatio = (sellCount / total) * 100;

        if (sellRatio >= 45) {
            allocationText = 'Savunma modu: nakit oranini %50+ tut, yeni islemde secici ol.';
        } else if (buyCandidates.length >= Math.floor(total * 0.35)) {
            allocationText = 'Hucum modu: nakit oranini %25-%35 bandina indir, kademeli giris kullan.';
        }

        var stopText = 'Her pozisyonda stop seviyesi girilmeden islem acma.';
        if (buyCandidates.length > 0) {
            var stopDistances = [];
            for (var i = 0; i < buyCandidates.length && i < 5; i++) {
                var c = buyCandidates[i];
                var stop = c.targets && c.targets.stop_loss;
                var price = c.price;
                if (stop && price) {
                    stopDistances.push(Math.abs((price - stop) / price) * 100);
                }
            }
            if (stopDistances.length > 0) {
                var avgStop = stopDistances.reduce(function (acc, x) { return acc + x; }, 0) / stopDistances.length;
                stopText = 'Ortalama teknik stop mesafesi %' + avgStop.toFixed(1) + '. Lot boyutunu buna gore ayarla.';
            }
        }

        var diversificationText = 'Ayni sektorde yogunlasma yapma.';
        if (buyCandidates.length > 0) {
            var top = buyCandidates.slice(0, 6);
            var sectorMap = {};
            for (var j = 0; j < top.length; j++) {
                var sector = top[j].sector || 'Diger';
                sectorMap[sector] = (sectorMap[sector] || 0) + 1;
            }
            var sectorNames = Object.keys(sectorMap);
            sectorNames.sort(function (a, b) { return sectorMap[b] - sectorMap[a]; });
            if (sectorNames.length === 1) {
                diversificationText = 'AL adaylari tek sektorde toplanmis (' + sectorNames[0] + '). Dagilim eklemeden agirlasma yapma.';
            } else {
                diversificationText = 'AL adaylari ' + sectorNames.slice(0, 3).join(', ') + ' sektorlerine yayiliyor. Dengeli dagilim korunabilir.';
            }
        }

        var riskEl = document.getElementById('disciplineRisk');
        var allocationEl = document.getElementById('disciplineAllocation');
        var stopEl = document.getElementById('disciplineStop');
        var diversificationEl = document.getElementById('disciplineDiversification');

        if (riskEl) riskEl.textContent = riskPerTradeText;
        if (allocationEl) allocationEl.textContent = allocationText;
        if (stopEl) stopEl.textContent = stopText;
        if (diversificationEl) diversificationEl.textContent = diversificationText;
    }

    function startRefreshCountdown(updatedAtRaw) {
        var valueEl = document.getElementById('nextRefreshText');
        var metaEl = document.getElementById('nextRefreshMeta');
        if (!valueEl) return;

        function getNextWeekdayRefresh(now) {
            var schedule = [
                { hour: 10, minute: 1 },
                { hour: 12, minute: 30 },
                { hour: 17, minute: 0 },
                { hour: 19, minute: 30 }
            ];
            var next = null;

            for (var i = 0; i < schedule.length; i++) {
                var candidate = new Date(now.getTime());
                candidate.setHours(schedule[i].hour, schedule[i].minute, 0, 0);
                if (candidate.getTime() > now.getTime()) {
                    next = candidate;
                    break;
                }
            }

            if (!next) {
                next = new Date(now.getTime());
                next.setDate(next.getDate() + 1);
                next.setHours(schedule[0].hour, schedule[0].minute, 0, 0);
            }

            while (next.getDay() === 0 || next.getDay() === 6) {
                next.setDate(next.getDate() + 1);
                next.setHours(schedule[0].hour, schedule[0].minute, 0, 0);
            }

            return next;
        }

        function tick() {
            var now = new Date();
            var next = getNextWeekdayRefresh(now);
            var diff = next.getTime() - now.getTime();
            if (diff < 0) diff = 0;

            var totalSec = Math.floor(diff / 1000);
            var h = String(Math.floor(totalSec / 3600)).padStart(2, '0');
            var m = String(Math.floor((totalSec % 3600) / 60)).padStart(2, '0');
            var s = String(totalSec % 60).padStart(2, '0');
            valueEl.textContent = h + ':' + m + ':' + s;
            if (metaEl) metaEl.textContent = 'Hafta ici 10:01 / 12:30 / 17:00 / 19:30 otomatik guncellemeye kalan sure';
        }

        tick();
        if (refreshTimer) clearInterval(refreshTimer);
        refreshTimer = setInterval(tick, 1000);
    }

    function animateCounter(elementId, target) {
        var el = document.getElementById(elementId);
        if (!el) return;
        var start = 0;
        var duration = 800;
        var startTime = null;

        function step(timestamp) {
            if (!startTime) startTime = timestamp;
            var progress = Math.min((timestamp - startTime) / duration, 1);
            el.textContent = Math.floor(progress * target);
            if (progress < 1) requestAnimationFrame(step);
            else el.textContent = target;
        }
        requestAnimationFrame(step);
    }

    // ── Top Signals ──
    function renderTopSignals() {
        if (!marketData) return;
        var topBuysEl = document.getElementById('topBuys');
        var topSellsEl = document.getElementById('topSells');
        if (!topBuysEl || !topSellsEl) return;

        var buysHtml = '';
        var buys = marketData.top_buys || [];
        for (var i = 0; i < buys.length; i++) {
            var s = buys[i];
            buysHtml += '<a href="hisse.html?ticker=' + s.ticker + '" class="top-signal-item buy">';
            buysHtml += '<div class="top-signal-left">';
            buysHtml += '<strong>' + s.ticker + '</strong> <span style="opacity:0.6">' + s.name + '</span>';
            buysHtml += '</div>';
            buysHtml += '<div class="top-signal-right">';
            buysHtml += '<span class="stock-change ' + getChangeClass(s.change_pct) + '">' + formatPercent(s.change_pct) + '</span>';
            buysHtml += '<span class="signal-badge ' + getSignalClass(s.signal_en) + '"><span class="dot"></span>' + s.signal + '</span>';
            buysHtml += '<span class="score-value" style="color:' + s.color + '">+' + s.score.toFixed(1) + '</span>';
            buysHtml += '</div></a>';
        }
        topBuysEl.innerHTML = buysHtml || '<div style="padding:16px;color:var(--text-muted);">Güçlü AL sinyali yok</div>';

        var sellsHtml = '';
        var sells = marketData.top_sells || [];
        for (var j = 0; j < sells.length; j++) {
            var t = sells[j];
            sellsHtml += '<a href="hisse.html?ticker=' + t.ticker + '" class="top-signal-item sell">';
            sellsHtml += '<div class="top-signal-left">';
            sellsHtml += '<strong>' + t.ticker + '</strong> <span style="opacity:0.6">' + t.name + '</span>';
            sellsHtml += '</div>';
            sellsHtml += '<div class="top-signal-right">';
            sellsHtml += '<span class="stock-change ' + getChangeClass(t.change_pct) + '">' + formatPercent(t.change_pct) + '</span>';
            sellsHtml += '<span class="signal-badge ' + getSignalClass(t.signal_en) + '"><span class="dot"></span>' + t.signal + '</span>';
            sellsHtml += '<span class="score-value" style="color:' + t.color + '">' + t.score.toFixed(1) + '</span>';
            sellsHtml += '</div></a>';
        }
        topSellsEl.innerHTML = sellsHtml || '<div style="padding:16px;color:var(--text-muted);">Güçlü SAT sinyali yok</div>';
    }

    function renderDecisionCoach() {
        if (!decisionCoachData) return;

        var scoreEl = document.getElementById('coachQualityScore');
        var gradeEl = document.getElementById('coachQualityGrade');
        var noteEl = document.getElementById('coachQualityNote');
        var regimeEl = document.getElementById('coachRegimeText');
        var cardsEl = document.getElementById('coachCards');
        var checklistEl = document.getElementById('coachChecklist');
        var disclaimerEl = document.getElementById('coachDisclaimer');
        var violationScoreEl = document.getElementById('ruleViolationScore');
        var violationMetaEl = document.getElementById('ruleViolationMeta');
        var patternListEl = document.getElementById('errorPatternList');

        if (scoreEl) scoreEl.textContent = Number(decisionCoachData.quality_score || 0).toFixed(1);
        if (gradeEl) gradeEl.textContent = 'Not: ' + (decisionCoachData.quality_grade || '--');
        if (noteEl) noteEl.textContent = decisionCoachData.quality_note || '';

        var regime = decisionCoachData.market_regime || {};
        if (regimeEl) {
            regimeEl.textContent = 'Rejim: ' + (regime.name || 'N/A') + ' | Neden: ' + (regime.why || '--') + ' | Nasil: ' + (regime.how || '--');
        }

        if (cardsEl && decisionCoachData.coaching_cards) {
            var cards = decisionCoachData.coaching_cards;
            var html = '';
            for (var i = 0; i < cards.length; i++) {
                html += '<div class="decision-coach-card">';
                html += '<h4>' + cards[i].title + '</h4>';
                html += '<p class="coach-desc">' + cards[i].desc + '</p>';
                html += '<p class="coach-rule"><strong>Kural:</strong> ' + cards[i].rule + '</p>';
                html += '</div>';
            }
            cardsEl.innerHTML = html;
        }

        if (checklistEl && decisionCoachData.execution_checklist) {
            var list = decisionCoachData.execution_checklist;
            var li = '';
            for (var j = 0; j < list.length; j++) {
                li += '<li>' + list[j] + '</li>';
            }
            checklistEl.innerHTML = li;
        }

        if (disclaimerEl) disclaimerEl.textContent = decisionCoachData.disclaimer || '';

        var violation = decisionCoachData.rule_violation || {};
        if (violationScoreEl) {
            var vScore = Number(violation.score || 0);
            violationScoreEl.textContent = vScore.toFixed(1) + ' / 100';
        }
        if (violationMetaEl) {
            var vLabel = violation.label || 'N/A';
            var vSummary = violation.summary || '';
            violationMetaEl.textContent = 'Seviye: ' + vLabel + ' | ' + vSummary;
        }

        if (patternListEl && decisionCoachData.error_patterns) {
            var patterns = decisionCoachData.error_patterns;
            var pHtml = '';
            for (var p = 0; p < patterns.length; p++) {
                pHtml += '<div class="decision-pattern-item">';
                pHtml += '<strong>' + patterns[p].title + '</strong>';
                pHtml += '<p>' + (patterns[p].detail || '') + '</p>';
                pHtml += '<p class="pattern-action">' + (patterns[p].action || '') + '</p>';
                pHtml += '</div>';
            }
            patternListEl.innerHTML = pHtml;
        }
    }

    function renderAlarmCenter() {
        if (!summaryData || !summaryData.stocks) return;

        var targetList = document.getElementById('alertTargetList');
        var stopList = document.getElementById('alertStopList');
        var summary = document.getElementById('alarmSummaryText');
        if (!targetList || !stopList || !summary) return;

        var targetNear = [];
        var stopNear = [];

        for (var i = 0; i < summaryData.stocks.length; i++) {
            var s = summaryData.stocks[i];
            if (!s.targets) continue;
            var price = Number(s.price);
            var target = Number(s.targets.target_1);
            var stop = Number(s.targets.stop_loss);
            if (!isFinite(price) || !isFinite(target) || !isFinite(stop) || !price) continue;

            var targetDist = Math.abs((target - price) / price) * 100;
            var stopDist = Math.abs((price - stop) / price) * 100;
            if (targetDist <= 2.2) targetNear.push({ ticker: s.ticker, dist: targetDist });
            if (stopDist <= 2.0) stopNear.push({ ticker: s.ticker, dist: stopDist });
        }

        targetNear.sort(function (a, b) { return a.dist - b.dist; });
        stopNear.sort(function (a, b) { return a.dist - b.dist; });

        var targetHtml = '';
        for (var t = 0; t < targetNear.length && t < 6; t++) {
            targetHtml += '<div class="alarm-item target"><strong>' + targetNear[t].ticker + '</strong> hedefe %' + targetNear[t].dist.toFixed(1) + '</div>';
        }
        var stopHtml = '';
        for (var k = 0; k < stopNear.length && k < 6; k++) {
            stopHtml += '<div class="alarm-item stop"><strong>' + stopNear[k].ticker + '</strong> stopa %' + stopNear[k].dist.toFixed(1) + '</div>';
        }

        targetList.innerHTML = targetHtml || '<div class="alarm-empty">Su an hedefe cok yakin hisse yok.</div>';
        stopList.innerHTML = stopHtml || '<div class="alarm-empty">Su an stopa cok yakin hisse yok.</div>';

        summary.textContent = 'Kisa aciklama: %2 civari mesafeler takip-oncelikli kabul edilir. Bu panel once hangi pozisyonu kontrol etmen gerektigini gosterir.';
    }

    // ── Performance Tracker ──
    function renderPerformance() {
        var tableBody = document.getElementById('performanceTableBody');
        if (!tableBody) return;

        if (!performanceData) {
            tableBody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:20px;color:var(--text-muted);">Performans verisi henuz olusmadi.</td></tr>';
            return;
        }

        var overall = performanceData.overview || {};
        var daily = performanceData.daily || {};
        var weekly = performanceData.weekly || {};

        document.getElementById('overallHitRate').textContent = (overall.hit_rate || 0).toFixed(1) + '%';
        document.getElementById('overallHitCount').textContent = (overall.hits || 0) + '/' + (overall.total || 0) + ' hedef';

        document.getElementById('dailyHitRate').textContent = (daily.hit_rate || 0).toFixed(1) + '%';
        document.getElementById('dailyHitMeta').textContent = (daily.hits || 0) + '/' + (daily.total || 0) + ' hedef | Ort: ' + (daily.avg_days_to_hit || 0) + ' gun';

        document.getElementById('weeklyHitRate').textContent = (weekly.hit_rate || 0).toFixed(1) + '%';
        document.getElementById('weeklyHitMeta').textContent = (weekly.hits || 0) + '/' + (weekly.total || 0) + ' hedef | Ort: ' + (weekly.avg_days_to_hit || 0) + ' gun';

        var rows = '';
        var hits = performanceData.recent_hits || [];

        for (var i = 0; i < hits.length && i < 20; i++) {
            var h = hits[i];
            var direction = h.direction === 'buy' ? 'AL' : 'SAT';
            var period = h.period === 'weekly' ? 'Haftalik' : 'Gunluk';
            rows += '<tr>';
            rows += '<td><strong>' + h.ticker + '</strong></td>';
            rows += '<td>' + period + '</td>';
            rows += '<td>' + direction + '</td>';
            rows += '<td>' + formatPrice(h.start_price) + '</td>';
            rows += '<td>' + formatPrice(h.target_price) + '</td>';
            rows += '<td>' + (h.days_to_result || 0) + '</td>';
            rows += '<td><span class="signal-badge buy"><span class="dot"></span>Tutturuldu</span></td>';
            rows += '</tr>';
        }

        tableBody.innerHTML = rows || '<tr><td colspan="7" style="text-align:center;padding:20px;color:var(--text-muted);">Henuz tutan hedef kaydi yok.</td></tr>';
    }

    // ── News ──
    function renderNews() {
        var container = document.getElementById('newsContainer');
        if (!container || !summaryData || !summaryData.news) return;

        var html = '';
        var news = summaryData.news;
        for (var i = 0; i < news.length; i++) {
            var n = news[i];
            html += '<div class="news-card">';
            html += '<div class="news-icon">' + n.icon + '</div>';
            html += '<div class="news-content">';
            html += '<div class="news-title">' + n.title + '</div>';
            html += '<div class="news-summary">' + n.summary + '</div>';
            html += '<div class="news-meta">' + n.date + ' | ' + n.category + '</div>';
            html += '</div></div>';
        }
        container.innerHTML = html;
    }

    // ── Table ──
    function renderTable() {
        if (!summaryData || !summaryData.stocks) return;
        var tbody = document.getElementById('stockTableBody');
        var searchEl = document.getElementById('searchInput');
        var search = (searchEl ? searchEl.value : '').toUpperCase();

        var stocks = summaryData.stocks.slice();

        // Filter
        if (currentFilter !== 'all') {
            stocks = stocks.filter(function (s) { return getFilterGroup(s.signal_en) === currentFilter; });
        }

        // Search
        if (search) {
            stocks = stocks.filter(function (s) {
                return s.ticker.toUpperCase().indexOf(search) >= 0 || s.name.toUpperCase().indexOf(search) >= 0;
            });
        }

        // Sort
        stocks.sort(function (a, b) {
            var aVal = a[currentSort.key] || 0;
            var bVal = b[currentSort.key] || 0;
            if (typeof aVal === 'string') aVal = aVal.toLowerCase();
            if (typeof bVal === 'string') bVal = bVal.toLowerCase();
            if (currentSort.dir === 'asc') return aVal > bVal ? 1 : -1;
            return aVal < bVal ? 1 : -1;
        });

        var html = '';
        for (var i = 0; i < stocks.length; i++) {
            var s = stocks[i];
            html += '<tr class="stock-row" onclick="window.location.href=\'hisse.html?ticker=' + s.ticker + '\'" style="animation-delay:' + (i * 30) + 'ms">';
            var actionText = getActionText(s.signal_en, s.confidence);
            var confidenceText = '%' + Number(s.confidence || 0).toFixed(0);

            // Currency-aware price and naming for AGBE
            var isAgbePage = window.location.pathname.includes('/agbe');
            var isPreciousMetal = isAgbePage && (s.ticker === 'GC=F' || s.ticker === 'SI=F');
            var displayTicker = s.ticker;
            if (isPreciousMetal) {
                displayTicker = s.ticker === 'GC=F' ? 'ALTIN' : 'GUMUS';
            }

            var tlInfoHtml = '';
            if (s.tl_info && !isPreciousMetal) {
                tlInfoHtml = ' | <span style="font-weight: 500; color: var(--color-primary);">' + s.tl_info + '</span>';
            }

            var displayPrice = '';
            if (isPreciousMetal) {
                var gramTry = Number(s.price_try);
                if (!isFinite(gramTry) || gramTry <= 0) {
                    var tlMatch = s.tl_info ? s.tl_info.match(/[\d.,]+/) : null;
                    gramTry = tlMatch ? Number(String(tlMatch[0]).replace(/,/g, '')) : NaN;
                }
                if (isFinite(gramTry) && gramTry > 0) {
                    displayPrice = '₺' + gramTry.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                } else {
                    displayPrice = formatPrice(s.price);
                }
            } else if (isAgbePage && (s.ticker === 'BTC-USD' || s.ticker === 'ETH-USD')) {
                displayPrice = '$' + Number(s.price).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});
            } else {
                displayPrice = formatPrice(s.price);
            }

            html += '<td data-label="Hisse"><div class="stock-cell-name">';
            html += '<strong>' + displayTicker + '</strong>';
            html += '<span class="stock-sector">' + s.name + ' · ' + s.sector + tlInfoHtml + '</span>';
            html += '</div></td>';
            html += '<td data-label="Fiyat" class="price-cell"><div class="price-main">' + displayPrice + '</div>';
            html += '<div class="price-ranges">3A: ' + formatRange(s.range_3m) + ' | 6A: ' + formatRange(s.range_6m) + '</div></td>';
            html += '<td data-label="Degisim"><span class="stock-change ' + getChangeClass(s.change_pct) + '">' + formatPercent(s.change_pct) + '</span></td>';
            html += '<td data-label="Sinyal"><span class="signal-badge ' + getSignalClass(s.signal_en) + '"><span class="dot"></span>' + s.signal + '</span></td>';
            html += '<td data-label="Guven"><span class="table-confidence">' + confidenceText + '</span></td>';
            html += '<td data-label="Aksiyon"><span class="table-action">' + actionText + '</span></td>';
            html += '</tr>';
        }

        tbody.innerHTML = html || '<tr><td colspan="6" style="text-align:center;padding:40px;">Sonuç bulunamadı</td></tr>';
    }

    // ── Data Freshness ──
    function renderDataFreshness() {
        var lastUpdateEl = document.getElementById('lastUpdateText');
        if (lastUpdateEl && summaryData) {
            lastUpdateEl.textContent = 'Son guncelleme: ' + (summaryData.updated_at || 'Bilinmiyor') +
                ' | Otomatik: Hafta ici 10:01 / 12:30 / 17:00 / 19:30 | Manuel: Admin';
        }

        var generatedAt = summaryData ? summaryData.updated_at : null;
        var marketUpdatedAt = marketData ? marketData.updated_at : null;
        var perfUpdatedAt = performanceData ? performanceData.generated_at : null;

        var generatedAtEl = document.getElementById('generatedAtValue');
        var marketUpdatedAtEl = document.getElementById('marketUpdatedAtValue');
        var perfUpdatedAtEl = document.getElementById('performanceUpdatedAtValue');
        var pageLoadedAtEl = document.getElementById('pageLoadedAtValue');
        var dataAgeEl = document.getElementById('dataAgeValue');
        var dataAgeTopEl = document.getElementById('dataAgeTop');
        var dataStatusTopEl = document.getElementById('dataStatusTop');

        var dataDt = toDateFromTRString(generatedAt) || toDateFromTRString(marketUpdatedAt) || toDateFromTRString(perfUpdatedAt);

        function repaintFreshness() {
            var now = new Date();
            var ageText = calcAgeText(dataDt, now);
            var ageMinutes = calcAgeMinutes(dataDt, now);
            var state = getFreshnessState(ageMinutes);

            if (generatedAtEl) generatedAtEl.textContent = generatedAt || '--';
            if (marketUpdatedAtEl) marketUpdatedAtEl.textContent = marketUpdatedAt || '--';
            if (perfUpdatedAtEl) perfUpdatedAtEl.textContent = perfUpdatedAt || '--';
            if (pageLoadedAtEl) pageLoadedAtEl.textContent = formatDateTime(now);
            if (dataAgeEl) dataAgeEl.textContent = ageText;
            if (dataAgeTopEl) dataAgeTopEl.textContent = ageText;

            if (dataStatusTopEl) {
                dataStatusTopEl.textContent = state.text;
                dataStatusTopEl.classList.remove('fresh', 'warn', 'stale');
                if (state.cls) dataStatusTopEl.classList.add(state.cls);
            }
        }

        repaintFreshness();
        if (freshnessTimer) clearInterval(freshnessTimer);
        freshnessTimer = setInterval(repaintFreshness, 30000);
    }

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

    // ── Events ──
    function setupEvents() {
        // Search
        var searchInput = document.getElementById('searchInput');
        if (searchInput) {
            searchInput.addEventListener('input', function () { renderTable(); });
        }

        var manualRefreshBtn = document.getElementById('manualRefreshBtn');
        if (manualRefreshBtn) {
            manualRefreshBtn.addEventListener('click', async function () {
                if (manualRefreshBtn.disabled) return;

                setManualRefreshButtonState(true);
                setManualRefreshStatus('Canli analiz tetikleniyor...', false, true);

                try {
                    var previousUpdatedAt = (summaryData && summaryData.updated_at) || '';
                    var triggerResult = await triggerServerRefresh();

                    if (!triggerResult.ok) {
                        finishRefreshProgress();
                        if (!triggerResult.cancelled) {
                            setManualRefreshStatus(triggerResult.message || 'Canli yenileme basarisiz.', true, false);
                        }
                        return;
                    }

                    var progress = beginRefreshProgress(previousUpdatedAt, triggerResult.runUrl);
                    var refreshResult = await waitForFreshSnapshot(previousUpdatedAt, progress);

                    if (refreshResult.ok) {
                        var extra = triggerResult.runUrl ? ' | Is akisi: ' + triggerResult.runUrl : '';
                        setManualRefreshStatus('Yeni veri alindi: ' + refreshResult.updatedAt + extra, false, false);
                    } else {
                        var fallback = triggerResult.runUrl
                            ? 'Is akisini ac: ' + triggerResult.runUrl
                            : 'GitHub Actions ekranindan calisma durumunu kontrol et.';
                        setManualRefreshStatus('Analiz suruyor olabilir. ' + fallback, true, false);
                    }
                } catch (e) {
                    console.error('Manual refresh error:', e);
                    setManualRefreshStatus('Canli yenileme sirasinda hata olustu.', true, false);
                } finally {
                    finishRefreshProgress();
                }
            });
        }

        // Filter tabs
        var filterTabs = document.querySelectorAll('.filter-tab');
        for (var i = 0; i < filterTabs.length; i++) {
            filterTabs[i].addEventListener('click', function () {
                for (var j = 0; j < filterTabs.length; j++) filterTabs[j].classList.remove('active');
                this.classList.add('active');
                currentFilter = this.dataset.filter;
                renderTable();
            });
        }

        // Sort
        var sortHeaders = document.querySelectorAll('th[data-sort]');
        for (var k = 0; k < sortHeaders.length; k++) {
            sortHeaders[k].addEventListener('click', function () {
                var key = this.dataset.sort;
                if (currentSort.key === key) {
                    currentSort.dir = currentSort.dir === 'asc' ? 'desc' : 'asc';
                } else {
                    currentSort.key = key;
                    currentSort.dir = 'desc';
                }
                renderTable();
            });
        }
    }

    function setupAdvancedModeToggle() {
        var btn = document.getElementById('advancedToggleButton');
        var text = document.getElementById('advancedToggleText');
        if (!btn || !text) return;

        function setState(showAdvanced) {
            document.body.classList.add('advanced-enabled');
            document.body.classList.toggle('advanced-open', showAdvanced);
            btn.textContent = showAdvanced ? 'Detayli modu kapat' : 'Detayli modu ac';
            text.textContent = showAdvanced
                ? 'Detayli mod acik: tum teknik icerikler gorunuyor.'
                : 'Basit mod acik: sadece karar icin gerekli alanlar gorunuyor.';
            try {
                localStorage.setItem('advancedMode', showAdvanced ? '1' : '0');
            } catch (e) {
                // no-op
            }
        }

        var show = false;
        try {
            show = localStorage.getItem('advancedMode') === '1';
        } catch (e) {
            show = false;
        }
        setState(show);

        btn.addEventListener('click', function () {
            setState(!document.body.classList.contains('advanced-open'));
        });
    }

    // ── Init ──
    function init() {
        setupMatrixIntro();
        setupMobileNav();
        setupEvents();
        setupAdvancedModeToggle();
        loadData();
        resumePendingRefreshIfAny();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
