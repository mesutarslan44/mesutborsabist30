/**
 * BIST 30 Analiz - Dashboard v2.0
 * Endeks yorumları, haberler, genişletilmiş tablo, veri güncellik bilgisi
 */

(function () {
    'use strict';

    let summaryData = null;
    let marketData = null;
    let performanceData = null;
    let currentFilter = 'all';
    let currentSort = { key: 'score', dir: 'desc' };
    let refreshTimer = null;
    let freshnessTimer = null;

    let matrixAnimId = null;

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

    // ── Load Data ──
    async function loadData() {
        try {
            var res1 = await fetch('data/summary.json');
            var res2 = await fetch('data/market_overview.json');
            var res3 = await fetch('data/performance.json');
            if (!res1.ok || !res2.ok) throw new Error('Veri yüklenemedi');

            summaryData = await res1.json();
            marketData = await res2.json();
            if (res3.ok) {
                performanceData = await res3.json();
            }
            render();
        } catch (err) {
            console.error('Veri hatası:', err);
            document.getElementById('stockTableBody').innerHTML =
                '<tr><td colspan="11" style="text-align:center;padding:40px;color:var(--bear-red);">⚠️ Veriler yüklenemedi. Lütfen sayfayı yenileyin.</td></tr>';
        }
    }

    // ── Render All ──
    var coreRenderers = [
        renderUpdateBadge,
        renderMarketBar,
        renderSignalSummary,
        renderCommandCenter,
        renderDisciplineGuide,
        renderDataFreshness,
    ];

    var contentRenderers = [
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
            document.getElementById('bist30Value').textContent = bist30.value ? bist30.value.toLocaleString('tr-TR', { minimumFractionDigits: 2 }) : '--';
            var ch30 = document.getElementById('bist30Change');
            ch30.textContent = formatPercent(bist30.change_pct);
            ch30.className = 'market-change ' + getChangeClass(bist30.change_pct);
        }

        var bist100 = indices.XU100;
        if (bist100) {
            document.getElementById('bist100Value').textContent = bist100.value ? bist100.value.toLocaleString('tr-TR', { minimumFractionDigits: 2 }) : '--';
            var ch100 = document.getElementById('bist100Change');
            ch100.textContent = formatPercent(bist100.change_pct);
            ch100.className = 'market-change ' + getChangeClass(bist100.change_pct);
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

        animateCounter('totalCount', summaryData.total_stocks || 0);
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

        function tick() {
            var updatedAt = toDateFromTRString(updatedAtRaw);
            if (!updatedAt) {
                valueEl.textContent = '--:--:--';
                if (metaEl) metaEl.textContent = 'Saat bilgisi okunamadi';
                return;
            }

            var next = new Date(updatedAt.getTime());
            next.setMinutes(0);
            next.setSeconds(0);
            next.setMilliseconds(0);
            next.setHours(next.getHours() + 1);

            var diff = next.getTime() - Date.now();
            if (diff < 0) diff = 0;

            var totalSec = Math.floor(diff / 1000);
            var h = String(Math.floor(totalSec / 3600)).padStart(2, '0');
            var m = String(Math.floor((totalSec % 3600) / 60)).padStart(2, '0');
            var s = String(totalSec % 60).padStart(2, '0');
            valueEl.textContent = h + ':' + m + ':' + s;
            if (metaEl) metaEl.textContent = 'Bir sonraki saatlik veri paketine kalan sure';
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
        document.getElementById('topBuys').innerHTML = buysHtml || '<div style="padding:16px;color:var(--text-muted);">Güçlü AL sinyali yok</div>';

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
        document.getElementById('topSells').innerHTML = sellsHtml || '<div style="padding:16px;color:var(--text-muted);">Güçlü SAT sinyali yok</div>';
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
        var search = (document.getElementById('searchInput').value || '').toUpperCase();

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
            var scoreBarWidth = Math.min(Math.abs(s.score || 0), 100);
            var scoreColor = (s.score || 0) >= 0 ? 'var(--bull-green)' : 'var(--bear-red)';

            html += '<tr class="stock-row" onclick="window.location.href=\'hisse.html?ticker=' + s.ticker + '\'" style="animation-delay:' + (i * 30) + 'ms">';
            var volumeText = (s.volume_ratio == null || isNaN(s.volume_ratio)) ? '--' : Number(s.volume_ratio).toFixed(1) + 'x';

            html += '<td data-label="Hisse"><div class="stock-cell-name">';
            html += '<strong>' + s.ticker + '</strong>';
            html += '<span class="stock-sector">' + s.name + ' · ' + s.sector + '</span>';
            html += '</div></td>';
            html += '<td data-label="Fiyat" class="price-cell"><div class="price-main">' + formatPrice(s.price) + '</div>';
            html += '<div class="price-ranges">3A: ' + formatRange(s.range_3m) + ' | 6A: ' + formatRange(s.range_6m) + '</div></td>';
            html += '<td data-label="Degisim"><span class="stock-change ' + getChangeClass(s.change_pct) + '">' + formatPercent(s.change_pct) + '</span></td>';
            html += '<td data-label="RSI">' + (s.rsi ? s.rsi.toFixed(1) : '--') + '</td>';
            html += '<td data-label="Stoch">' + (s.stoch_k ? s.stoch_k.toFixed(1) : '--') + '</td>';
            html += '<td data-label="ADX">' + (s.adx ? s.adx.toFixed(1) : '--') + '</td>';
            html += '<td data-label="Hacim">' + volumeText + '</td>';
            var setup = getSetupGrade(s);
            var rr = calculateRewardRisk(s);
            var rrText = rr == null ? '--' : rr.toFixed(2) + 'R';
            var rrClass = rr == null ? 'rr-neutral' : (rr >= 1.5 ? 'rr-good' : (rr >= 1.2 ? 'rr-mid' : 'rr-low'));
            html += '<td data-label="Setup"><span class="setup-badge ' + setup.cls + '">' + setup.grade + '</span><span class="setup-hint">' + setup.hint + '</span></td>';
            html += '<td data-label="R"><span class="rr-badge ' + rrClass + '">' + rrText + '</span></td>';
            html += '<td data-label="Sinyal"><span class="signal-badge ' + getSignalClass(s.signal_en) + '"><span class="dot"></span>' + s.signal + '</span></td>';
            html += '<td data-label="Puan"><div class="score-cell">';
            html += '<span class="score-value" style="color:' + scoreColor + '">' + (s.score >= 0 ? '+' : '') + (s.score || 0).toFixed(1) + '</span>';
            html += '<div class="score-bar"><div class="score-bar-fill" style="width:' + scoreBarWidth + '%;background:' + scoreColor + ';"></div></div>';
            html += '</div></td>';
            html += '</tr>';
        }

        tbody.innerHTML = html || '<tr><td colspan="11" style="text-align:center;padding:40px;">Sonuç bulunamadı</td></tr>';
    }

    // ── Data Freshness ──
    function renderDataFreshness() {
        var lastUpdateEl = document.getElementById('lastUpdateText');
        if (lastUpdateEl && summaryData) {
            lastUpdateEl.textContent = 'Son güncelleme: ' + (summaryData.updated_at || 'Bilinmiyor') +
                ' | ' + (summaryData.update_frequency || '');
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

    // ── Events ──
    function setupEvents() {
        // Search
        var searchInput = document.getElementById('searchInput');
        if (searchInput) {
            searchInput.addEventListener('input', function () { renderTable(); });
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

    // ── Init ──
    function init() {
        setupMatrixIntro();
        setupEvents();
        loadData();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
