/**
 * BIST 30 Analiz - Hisse Detay Sayfası v2.0
 * Detaylı açıklamalar, hedef fiyatlar, Fibonacci, 9 gösterge
 */

(function () {
    'use strict';

    var stockData = null;
    var currentPeriod = 'daily';


    function getTickerFromUrl() {
        var params = new URLSearchParams(window.location.search);
        return params.get('ticker') || '';
    }

    function formatPrice(val) {
        if (val == null || isNaN(val)) return '--';
        return '₺' + val.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    function formatPercent(val) {
        if (val == null || isNaN(val)) return '--%';
        var sign = val >= 0 ? '+' : '';
        return sign + val.toFixed(2) + '%';
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

    // ── Render Header ──
    function renderHeader(data, periodData) {
        var indicators = periodData.indicators || {};
        var rec = periodData.recommendation || {};

        document.getElementById('headerTicker').textContent = data.ticker;
        document.getElementById('headerName').textContent = data.name;
        document.getElementById('headerSector').textContent = data.sector;

        document.getElementById('headerPrice').textContent = formatPrice(indicators.price);

        var changeEl = document.getElementById('headerChange');
        var changePct = indicators.change_pct || 0;
        changeEl.textContent = formatPercent(changePct);
        changeEl.className = 'stock-header-change stock-change ' + getChangeClass(changePct);

        var badgeContainer = document.getElementById('headerSignalBadge');
        if (badgeContainer && rec.signal) {
            badgeContainer.innerHTML = '<span class="signal-badge ' + getSignalClass(rec.signal_en) + '" style="font-size:14px;padding:8px 20px;">' +
                '<span class="dot"></span>' + rec.signal + '</span>';
        }

        document.title = data.ticker + ' - ' + data.name + ' | BIST 30 Analiz';
    }

    // ── Render Recommendation ──
    function renderRecommendation(rec) {
        var card = document.getElementById('recCard');
        if (!card || !rec) return;

        var score = rec.score || 0;
        card.className = 'rec-card';
        if (score > 10) card.classList.add('buy');
        else if (score < -10) card.classList.add('sell');

        document.getElementById('recSignal').textContent = rec.signal || '--';
        document.getElementById('recSignal').style.color = rec.color || 'var(--text-primary)';

        var scoreEl = document.getElementById('recScore');
        scoreEl.textContent = (score > 0 ? '+' : '') + score.toFixed(1);
        scoreEl.style.color = rec.color || 'var(--text-primary)';

        document.getElementById('recConfidence').textContent = 'Güven: %' + (rec.confidence ? rec.confidence.toFixed(0) : 0);

        var fillEl = document.getElementById('recConfidenceFill');
        if (fillEl) {
            setTimeout(function () { fillEl.style.width = (rec.confidence || 0) + '%'; }, 300);
        }
    }

    function renderQuickDecision(rec, indicators) {
        var el = document.getElementById('quickDecisionText');
        if (!el || !rec) return;

        var signal = rec.signal_en || 'HOLD';
        var confidence = rec.confidence ? rec.confidence.toFixed(0) : '0';
        var price = indicators && indicators.price != null ? formatPrice(indicators.price) : '--';
        var target = rec.targets && rec.targets.target_1 != null ? formatPrice(rec.targets.target_1) : '--';
        var stop = rec.targets && rec.targets.stop_loss != null ? formatPrice(rec.targets.stop_loss) : '--';

        var msg = '';
        if (signal === 'STRONG_BUY' || signal === 'BUY' || signal === 'WEAK_BUY') {
            msg = 'Sinyal AL yonunde. Mevcut fiyat ' + price + '. Ilk hedef ' + target + ', zarar-kes ' + stop + '. Guven: %' + confidence + '.';
        } else if (signal === 'STRONG_SELL' || signal === 'SELL' || signal === 'WEAK_SELL') {
            msg = 'Sinyal SAT/temkinli yonunde. Mevcut fiyat ' + price + '. Kritik seviye ' + stop + '. Guven: %' + confidence + '.';
        } else {
            msg = 'Sinyal BEKLE. Net yon yok. Islem acmadan once fiyatin hedef ve stop seviyelerine yaklasmasini beklemek daha guvenli olabilir.';
        }

        el.textContent = msg;
    }

    function renderActionPlan(rec, indicators) {
        if (!rec) return;

        var resultEl = document.getElementById('planResult');
        var whyEl = document.getElementById('planWhy');
        var riskEl = document.getElementById('planRisk');
        var actionEl = document.getElementById('planAction');
        if (!resultEl || !whyEl || !riskEl || !actionEl) return;

        var signal = rec.signal_en || 'HOLD';
        var details = rec.details || [];
        var positives = [];
        var negatives = [];
        for (var i = 0; i < details.length; i++) {
            if (details[i].score > 0) positives.push(details[i].indicator);
            if (details[i].score < 0) negatives.push(details[i].indicator);
        }

        var resultText = 'Sonuc: Bekle';
        var actionText = 'Aksiyon: Net teyit gelene kadar yeni pozisyonda acele etme.';
        if (['STRONG_BUY', 'BUY', 'WEAK_BUY'].indexOf(signal) >= 0) {
            resultText = 'Sonuc: Al yonu agir basiyor';
            actionText = 'Aksiyon: Kademeli giris yap, stop seviyesini emirle birlikte tanimla.';
        } else if (['STRONG_SELL', 'SELL', 'WEAK_SELL'].indexOf(signal) >= 0) {
            resultText = 'Sonuc: Satis riski yuksek';
            actionText = 'Aksiyon: Pozisyonu azalt veya korunma planini one al.';
        }

        var whyText = 'Neden: ' + (positives.length ? positives.slice(0, 3).join(', ') + ' pozitif.' : 'Guclu pozitif sinyal yok.');
        var riskText = 'Risk: ' + (negatives.length ? negatives.slice(0, 3).join(', ') + ' tarafi baski olusturuyor.' : 'Belirgin negatif baski zayif.');

        if (indicators && indicators.adx != null && indicators.adx < 20) {
            riskText += ' Trend gucu dusuk (ADX<20), yalanci hareket riski artar.';
        }

        resultEl.textContent = resultText;
        whyEl.textContent = whyText;
        riskEl.textContent = riskText;
        actionEl.textContent = actionText;
    }

    function renderIndicatorGuide(indicators) {
        var grid = document.getElementById('indicatorGuideGrid');
        if (!grid || !indicators) return;

        function buildItem(title, status, meaning, impact) {
            return '<div class="indicator-guide-item">'
                + '<div class="indicator-guide-name">' + title + '</div>'
                + '<div class="indicator-guide-status">Durum: ' + status + '</div>'
                + '<div class="indicator-guide-text">Anlami: ' + meaning + '</div>'
                + '<div class="indicator-guide-text">Kullaniciya etkisi: ' + impact + '</div>'
                + '</div>';
        }

        var html = '';
        var rsi = Number(indicators.rsi);
        html += buildItem(
            'RSI',
            rsi >= 70 ? 'Asiri alim' : (rsi <= 30 ? 'Asiri satim' : 'Notr'),
            'RSI fiyatin yorulup yorulmadigini gosterir.',
            rsi >= 70 ? 'Yukselis surse de duzeltme riski artar.' : (rsi <= 30 ? 'Tepki alimi ihtimali artar, teyit beklenir.' : 'Tek basina karar verdirmez, diger sinyallerle okunur.')
        );

        var macd = Number(indicators.macd);
        var macdSignal = Number(indicators.macd_signal);
        html += buildItem(
            'MACD',
            macd > macdSignal ? 'Pozitif ivme' : 'Negatif ivme',
            'MACD trend ivmesinin guclenip guclenmedigini gosterir.',
            macd > macdSignal ? 'Alis momentumu desteklenir, kademeli plan tercih edilir.' : 'Dusus baskisi suruyor olabilir, korunma onceliklidir.'
        );

        var adx = Number(indicators.adx);
        html += buildItem(
            'ADX',
            adx >= 25 ? 'Trend guclu' : 'Trend zayif',
            'ADX yonu degil trend gucunu olcer.',
            adx >= 25 ? 'Trend yonunde pozisyonlar daha anlamli olur.' : 'Yatay piyasada yalanci kirilimlar artabilir.'
        );

        var stoch = Number(indicators.stoch_k);
        html += buildItem(
            'Stochastic',
            stoch >= 80 ? 'Asiri alim' : (stoch <= 20 ? 'Asiri satim' : 'Notr'),
            'Kisa vadeli asiri alim/satim bolgesini gosterir.',
            stoch >= 80 ? 'Hizli duzeltme riski icin stop disiplini onemli.' : (stoch <= 20 ? 'Tepki ihtimali var, teyitsiz erken giris riskli.' : 'Kisa vadede yon teyidi beklenmeli.')
        );

        var volumeRatio = Number(indicators.volume_ratio);
        html += buildItem(
            'Hacim',
            volumeRatio >= 1 ? 'Ortalama ustu' : 'Zayif hacim',
            'Hacim fiyat hareketinin guvenilirligini destekler.',
            volumeRatio >= 1 ? 'Sinyal daha guvenilir olabilir.' : 'Hareketin devami zayif kalabilir, temkin gerekir.'
        );

        var bbUpper = Number(indicators.bb_upper);
        var bbLower = Number(indicators.bb_lower);
        var price = Number(indicators.price);
        var bbStatus = 'Bant ortasi';
        if (price >= bbUpper) bbStatus = 'Ust banda yakin';
        if (price <= bbLower) bbStatus = 'Alt banda yakin';
        html += buildItem(
            'Bollinger',
            bbStatus,
            'Bantlar normal fiyat oynaklik araligini gosterir.',
            price >= bbUpper ? 'Yukselis guclu ama kar realizasyonu riski artis gosterebilir.' : (price <= bbLower ? 'Tepki ihtimali var ama dusus trendi bitmis sayilmaz.' : 'Fiyat dengeli bolgede, tek basina sinyal degil.')
        );

        grid.innerHTML = html;
    }

    function renderDecisionCockpit(rec, indicators) {
        var scenarioEl = document.getElementById('scenarioText');
        var disciplineEl = document.getElementById('disciplineText');
        var confidenceEl = document.getElementById('confidenceLevelText');
        if (!rec) return;

        var signal = rec.signal_en || 'HOLD';
        var confidence = rec.confidence || 0;
        var price = indicators && indicators.price ? indicators.price : null;
        var target = rec.targets && rec.targets.target_1 ? rec.targets.target_1 : null;
        var stop = rec.targets && rec.targets.stop_loss ? rec.targets.stop_loss : null;

        var scenarioText = 'Yon teyidi bekleniyor.';
        if (signal === 'STRONG_BUY' || signal === 'BUY' || signal === 'WEAK_BUY') {
            scenarioText = 'Yukari yonlu senaryo one cikiyor. Ilk hedef: ' + formatPrice(target) + '.';
        } else if (signal === 'STRONG_SELL' || signal === 'SELL' || signal === 'WEAK_SELL') {
            scenarioText = 'Asagi baski riski var. Koruma odakli plan daha saglikli.';
        }

        var disciplineText = 'Pozisyon almadan once stop seviyesini belirle.';
        if (price && stop) {
            var stopDistance = Math.abs((price - stop) / price) * 100;
            disciplineText = 'Stop mesafesi yaklasik %' + stopDistance.toFixed(1) + '. Kaldirac ve lot boyutunu buna gore ayarla.';
        }

        var confLabel = 'Dusuk guven';
        if (confidence >= 75) confLabel = 'Yuksek guven';
        else if (confidence >= 55) confLabel = 'Orta guven';

        if (scenarioEl) scenarioEl.textContent = scenarioText;
        if (disciplineEl) disciplineEl.textContent = disciplineText;
        if (confidenceEl) confidenceEl.textContent = confLabel + ' (%' + confidence.toFixed(0) + ')';
    }

    function renderTradePlaybook(rec, indicators) {
        var box = document.getElementById('tradePlaybook');
        if (!box || !rec) return;

        var steps = box.querySelectorAll('.playbook-step');
        if (!steps || steps.length < 4) return;

        var signal = rec.signal_en || 'HOLD';
        var confidence = rec.confidence || 0;
        var price = indicators && indicators.price ? indicators.price : null;
        var target = rec.targets && rec.targets.target_1 ? rec.targets.target_1 : null;
        var stop = rec.targets && rec.targets.stop_loss ? rec.targets.stop_loss : null;

        var odulRisk = null;
        if (price && target && stop) {
            var reward = Math.abs(target - price);
            var risk = Math.abs(price - stop);
            if (risk > 0) odulRisk = reward / risk;
        }

        var signalLabel = signal === 'HOLD' ? 'BEKLE' : (signal.indexOf('BUY') >= 0 ? 'AL tarafi' : 'SAT/korunma tarafi');
        steps[0].innerHTML = '<strong>A)</strong> Sinyal: ' + signalLabel + ' | Guven: %' + confidence.toFixed(0) + '. Sadece sinyale degil guven ve skora birlikte bak.';

        var stepB = 'Hedef-stop mesafesini kontrol et: odul/risk dengesi zayifsa islemi pas gec.';
        if (odulRisk != null) {
            stepB = 'Hedef-stop dengesi: yaklasik ' + odulRisk.toFixed(2) + 'R. 1.5R altinda lotu kucult veya islem acma.';
        }
        steps[1].innerHTML = '<strong>B)</strong> ' + stepB;

        var stepC = 'Kademeli yonet: hedefe giderken parcali kar al, stopu plansiz genisletme.';
        if (target && stop) {
            stepC = 'Plan: Hedef 1 yaklasinca parcali kar al. Kalan pozisyonda stopu maliyet/ustu seviyeye cek.';
        }
        steps[2].innerHTML = '<strong>C)</strong> ' + stepC;

        steps[3].innerHTML = '<strong>D)</strong> Yanlislanma kuralin net olsun: stop calisirsa yeniden sinyal bekle, ayni gun intikam islemi acma.';
    }

    // ── Render Explanation (YENI) ──
    function renderExplanation(rec) {
        var container = document.getElementById('explanationCard');
        if (!container || !rec) return;

        var explanation = rec.explanation || 'Açıklama üretilemiyor.';
        // Convert newlines to HTML
        var html = '<div class="explanation-text">';
        var lines = explanation.split('\n');
        for (var i = 0; i < lines.length; i++) {
            var line = lines[i].trim();
            if (!line) continue;
            if (line.indexOf('🎯') >= 0 || line.indexOf('⬇️') >= 0 || line.indexOf('📊') >= 0 || line.indexOf('💡') >= 0) {
                html += '<div class="explanation-section-title">' + line + '</div>';
            } else if (line.indexOf('•') >= 0) {
                html += '<div class="explanation-bullet">' + line + '</div>';
            } else {
                html += '<div class="explanation-line">' + line + '</div>';
            }
        }
        html += '</div>';
        container.innerHTML = html;
    }

    // ── Render Targets (YENI) ──
    function renderTargets(rec, indicators) {
        var container = document.getElementById('targetsGrid');
        if (!container) return;

        var targets = (rec && rec.targets) || {};
        var score = (rec && rec.score) || 0;
        var price = (indicators && indicators.price) || 0;

        if (!targets.target_1) {
            container.innerHTML = '<div style="padding:20px;color:var(--text-muted);">Hedef fiyat verisi yok.</div>';
            return;
        }

        var html = '';

        if (score > 0) {
            html += '<div class="target-card buy-target">';
            html += '<div class="target-icon">🎯</div>';
            html += '<div class="target-label">1. Hedef</div>';
            html += '<div class="target-value">' + formatPrice(targets.target_1) + '</div>';
            html += '<div class="target-pct">(' + formatPercent((targets.target_1 - price) / price * 100) + ')</div>';
            html += '</div>';

            html += '<div class="target-card buy-target">';
            html += '<div class="target-icon">🎯🎯</div>';
            html += '<div class="target-label">2. Hedef</div>';
            html += '<div class="target-value">' + formatPrice(targets.target_2) + '</div>';
            html += '<div class="target-pct">(' + formatPercent((targets.target_2 - price) / price * 100) + ')</div>';
            html += '</div>';

            html += '<div class="target-card buy-target">';
            html += '<div class="target-icon">🚀</div>';
            html += '<div class="target-label">3. Hedef (İddialı)</div>';
            html += '<div class="target-value">' + formatPrice(targets.target_3) + '</div>';
            html += '<div class="target-pct">(' + formatPercent((targets.target_3 - price) / price * 100) + ')</div>';
            html += '</div>';
        } else {
            html += '<div class="target-card sell-target">';
            html += '<div class="target-icon">⬇️</div>';
            html += '<div class="target-label">1. Destek</div>';
            html += '<div class="target-value">' + formatPrice(targets.target_1) + '</div>';
            html += '</div>';

            html += '<div class="target-card sell-target">';
            html += '<div class="target-icon">⬇️⬇️</div>';
            html += '<div class="target-label">2. Destek</div>';
            html += '<div class="target-value">' + formatPrice(targets.target_2) + '</div>';
            html += '</div>';

            html += '<div class="target-card sell-target">';
            html += '<div class="target-icon">🔻</div>';
            html += '<div class="target-label">Kritik Destek</div>';
            html += '<div class="target-value">' + formatPrice(targets.target_3) + '</div>';
            html += '</div>';
        }

        html += '<div class="target-card stop-target">';
        html += '<div class="target-icon">🛑</div>';
        html += '<div class="target-label">Zarar Kes (Stop)</div>';
        html += '<div class="target-value">' + formatPrice(targets.stop_loss) + '</div>';
        html += '</div>';

        html += '<div class="target-card add-target">';
        html += '<div class="target-icon">➕</div>';
        html += '<div class="target-label">Ekleme Seviyesi</div>';
        html += '<div class="target-value">' + formatPrice(targets.add_level) + '</div>';
        html += '</div>';

        container.innerHTML = html;
    }

    // ── Render Fibonacci & Support/Resistance (YENI) ──
    function renderLevels(rec, indicators) {
        var container = document.getElementById('levelsGrid');
        if (!container) return;

        var fib = (rec && rec.fibonacci) || (indicators && indicators.fibonacci) || {};
        var sr = (rec && rec.support_resistance) || (indicators && indicators.support_resistance) || {};
        var price = (indicators && indicators.price) || 0;

        var html = '';

        // Fibonacci
        html += '<div class="levels-section">';
        html += '<h3 class="levels-title">🔢 Fibonacci Düzeltme Seviyeleri</h3>';
        var fibLevels = [
            { label: '%0 (Tepe)', key: '0' },
            { label: '%23.6', key: '0.236' },
            { label: '%38.2', key: '0.382' },
            { label: '%50', key: '0.5' },
            { label: '%61.8 (Altın Oran)', key: '0.618' },
            { label: '%78.6', key: '0.786' },
            { label: '%100 (Dip)', key: '1.0' },
        ];
        for (var i = 0; i < fibLevels.length; i++) {
            var f = fibLevels[i];
            var fibVal = fib[f.key] || 0;
            var isNear = Math.abs(price - fibVal) / price < 0.02;
            html += '<div class="level-row' + (isNear ? ' level-active' : '') + '">';
            html += '<span class="level-label">' + f.label + '</span>';
            html += '<span class="level-value">' + formatPrice(fibVal) + '</span>';
            if (isNear) html += '<span class="level-badge">📍 Yakın!</span>';
            html += '</div>';
        }
        html += '</div>';

        // Support/Resistance
        html += '<div class="levels-section">';
        html += '<h3 class="levels-title">📐 Destek & Direnç (Pivot)</h3>';
        var srLevels = [
            { label: 'Direnç 3', key: 'r3', color: 'var(--bear-red)' },
            { label: 'Direnç 2', key: 'r2', color: 'var(--bear-red)' },
            { label: 'Direnç 1', key: 'r1', color: 'var(--bear-red)' },
            { label: 'Pivot', key: 'pivot', color: 'var(--accent-blue)' },
            { label: 'Destek 1', key: 's1', color: 'var(--bull-green)' },
            { label: 'Destek 2', key: 's2', color: 'var(--bull-green)' },
            { label: 'Destek 3', key: 's3', color: 'var(--bull-green)' },
        ];
        for (var j = 0; j < srLevels.length; j++) {
            var s = srLevels[j];
            var srVal = sr[s.key] || 0;
            var isNearSR = Math.abs(price - srVal) / price < 0.02;
            html += '<div class="level-row' + (isNearSR ? ' level-active' : '') + '">';
            html += '<span class="level-label" style="color:' + s.color + '">' + s.label + '</span>';
            html += '<span class="level-value">' + formatPrice(srVal) + '</span>';
            if (isNearSR) html += '<span class="level-badge">📍 Yakın!</span>';
            html += '</div>';
        }
        html += '</div>';

        container.innerHTML = html;
    }

    // ── Render Indicators (9 Gösterge) ──
    function renderIndicators(indicators) {
        var grid = document.getElementById('indicatorsGrid');
        if (!grid) return;

        var cards = [
            {
                name: 'RSI (14)', value: indicators.rsi != null ? indicators.rsi.toFixed(1) : '--',
                color: indicators.rsi >= 70 ? 'var(--bear-red)' : indicators.rsi <= 30 ? 'var(--bull-green)' : 'var(--accent-blue)',
                comment: indicators.rsi >= 70 ? 'Aşırı alım' : indicators.rsi <= 30 ? 'Aşırı satım' : 'Nötr',
                barValue: indicators.rsi || 50, barMax: 100
            },
            {
                name: 'Stochastic %K', value: indicators.stoch_k != null ? indicators.stoch_k.toFixed(1) : '--',
                color: indicators.stoch_k >= 80 ? 'var(--bear-red)' : indicators.stoch_k <= 20 ? 'var(--bull-green)' : 'var(--accent-cyan)',
                comment: indicators.stoch_k >= 80 ? 'Aşırı alım' : indicators.stoch_k <= 20 ? 'Aşırı satım' : 'Nötr',
                barValue: indicators.stoch_k || 50, barMax: 100
            },
            {
                name: 'ADX', value: indicators.adx != null ? indicators.adx.toFixed(1) : '--',
                color: indicators.adx >= 25 ? 'var(--accent-purple)' : 'var(--text-muted)',
                comment: indicators.adx >= 50 ? 'Çok güçlü trend' : indicators.adx >= 25 ? 'Güçlü trend' : 'Zayıf/yok',
                barValue: Math.min(indicators.adx || 0, 60), barMax: 60
            },
            {
                name: 'MACD', value: indicators.macd != null ? indicators.macd.toFixed(4) : '--',
                color: indicators.macd > indicators.macd_signal ? 'var(--bull-green)' : 'var(--bear-red)',
                comment: indicators.macd > indicators.macd_signal ? 'Sinyal üst (yükseliş)' : 'Sinyal alt (düşüş)'
            },
            {
                name: 'SMA 20', value: formatPrice(indicators.sma_20),
                color: indicators.price > indicators.sma_20 ? 'var(--bull-green)' : 'var(--bear-red)',
                comment: indicators.price > indicators.sma_20 ? 'Fiyat SMA20 üstünde ✓' : 'Fiyat SMA20 altında ✗'
            },
            {
                name: 'SMA 50', value: formatPrice(indicators.sma_50),
                color: indicators.price > indicators.sma_50 ? 'var(--bull-green)' : 'var(--bear-red)',
                comment: indicators.price > indicators.sma_50 ? 'Fiyat SMA50 üstünde ✓' : 'Fiyat SMA50 altında ✗'
            },
            {
                name: 'Bollinger Üst/Alt', value: formatPrice(indicators.bb_upper),
                color: 'var(--accent-purple)',
                comment: 'Alt: ' + formatPrice(indicators.bb_lower)
            },
            {
                name: 'Hacim Oranı', value: indicators.volume_ratio ? indicators.volume_ratio.toFixed(1) + 'x' : '--',
                color: indicators.volume_ratio > 1.5 ? 'var(--accent-cyan)' : 'var(--text-secondary)',
                comment: indicators.volume_ratio > 2 ? 'Yüksek hacim!' : 'Normal'
            },
            {
                name: 'EMA 12/26', value: indicators.ema_12 ? indicators.ema_12.toFixed(2) : '--',
                color: indicators.ema_12 > indicators.ema_26 ? 'var(--bull-green)' : 'var(--bear-red)',
                comment: indicators.ema_12 > indicators.ema_26 ? 'EMA12 > EMA26 ✓' : 'EMA12 < EMA26 ✗'
            },
        ];

        var html = '';
        for (var i = 0; i < cards.length; i++) {
            var c = cards[i];
            html += '<div class="indicator-card">';
            html += '<div class="indicator-name">' + c.name + '</div>';
            html += '<div class="indicator-value" style="color:' + c.color + '">' + c.value + '</div>';
            html += '<div class="indicator-comment">' + (c.comment || '') + '</div>';
            if (c.barValue != null && c.barMax) {
                html += '<div class="indicator-bar"><div class="indicator-bar-fill" style="width:' + ((c.barValue / c.barMax) * 100) + '%;"></div></div>';
            }
            html += '</div>';
        }
        grid.innerHTML = html;
    }

    // ── Render Price Info ──
    function renderPriceInfo(indicators) {
        var grid = document.getElementById('priceInfoGrid');
        if (!grid) return;
        var items = [
            { name: 'Açılış', value: formatPrice(indicators.open) },
            { name: 'Yüksek', value: formatPrice(indicators.high), color: 'var(--bull-green)' },
            { name: 'Düşük', value: formatPrice(indicators.low), color: 'var(--bear-red)' },
            { name: 'Kapanış', value: formatPrice(indicators.price) },
            { name: '5 Günlük', value: formatPercent(indicators.change_5d), color: indicators.change_5d >= 0 ? 'var(--bull-green)' : 'var(--bear-red)' },
            { name: '20 Günlük', value: formatPercent(indicators.change_20d), color: indicators.change_20d >= 0 ? 'var(--bull-green)' : 'var(--bear-red)' },
        ];

        var html = '';
        for (var i = 0; i < items.length; i++) {
            html += '<div class="indicator-card">';
            html += '<div class="indicator-name">' + items[i].name + '</div>';
            html += '<div class="indicator-value" style="color:' + (items[i].color || 'var(--text-primary)') + ';font-size:20px;">' + items[i].value + '</div>';
            html += '</div>';
        }
        grid.innerHTML = html;
    }

    // ── Render Analysis Details (9 Gösterge) ──
    function renderAnalysisDetails(rec) {
        var container = document.getElementById('analysisDetails');
        if (!container || !rec || !rec.details) return;

        var iconMap = {
            'rsi': '📊', 'macd': '📈', 'sma_trend': '📉', 'sma_cross': '✂️',
            'bollinger': '🔔', 'volume': '📊', 'stochastic': '🔄', 'adx': '💪', 'fibonacci': '🔢'
        };
        var nameMap = {
            'rsi': 'RSI', 'macd': 'MACD', 'sma_trend': 'SMA Trend', 'sma_cross': 'SMA Kesişim',
            'bollinger': 'Bollinger', 'volume': 'Hacim', 'stochastic': 'Stochastic', 'adx': 'ADX', 'fibonacci': 'Fibonacci'
        };

        var html = '';
        for (var i = 0; i < rec.details.length; i++) {
            var d = rec.details[i];
            var icon = iconMap[d.indicator] || '📌';
            var name = nameMap[d.indicator] || d.indicator;
            var scoreClass = d.score > 0 ? 'positive' : d.score < 0 ? 'negative' : 'neutral';
            var scoreSign = d.score > 0 ? '+' : '';
            var weightPct = (d.weight * 100).toFixed(0);

            html += '<div class="analysis-item">';
            html += '<div class="analysis-left">';
            html += '<span style="font-size:18px;">' + icon + '</span>';
            html += '<div>';
            html += '<div class="analysis-indicator-name">' + name + ' <span style="color:var(--text-muted);font-weight:400;font-size:12px;">(ağırlık: %' + weightPct + ')</span></div>';
            html += '<div class="analysis-comment">' + d.comment + '</div>';
            if (d.aksiyon) {
                html += '<div class="analysis-action" style="margin-top:4px;font-size:12px;font-weight:600;color:' + (d.score > 0 ? 'var(--bull-green)' : d.score < 0 ? 'var(--bear-red)' : 'var(--accent-yellow)') + ';">→ ' + d.aksiyon + '</div>';
            }
            html += '</div>';
            html += '</div>';
            html += '<div style="display:flex;align-items:center;gap:12px;">';
            html += '<span class="analysis-score ' + scoreClass + '">' + scoreSign + d.score + '</span>';
            html += '<span class="analysis-score ' + scoreClass + '" style="font-size:11px;opacity:0.8;">→ ' + scoreSign + d.weighted_score.toFixed(1) + '</span>';
            html += '</div>';
            html += '</div>';
        }
        container.innerHTML = html;
    }

    // ── Switch Period ──
    function switchPeriod(period) {
        if (!stockData || !stockData.periods || !stockData.periods[period]) return;
        currentPeriod = period;
        var periodData = stockData.periods[period];

        document.querySelectorAll('.period-tab').forEach(function (tab) {
            tab.classList.toggle('active', tab.dataset.period === period);
        });

        renderHeader(stockData, periodData);
        renderRecommendation(periodData.recommendation);
        renderQuickDecision(periodData.recommendation, periodData.indicators);
        renderActionPlan(periodData.recommendation, periodData.indicators);
        renderDecisionCockpit(periodData.recommendation, periodData.indicators);
        renderTradePlaybook(periodData.recommendation, periodData.indicators);
        renderIndicatorGuide(periodData.indicators);
        renderExplanation(periodData.recommendation);
        renderTargets(periodData.recommendation, periodData.indicators);
        renderLevels(periodData.recommendation, periodData.indicators);
        renderIndicators(periodData.indicators);
        renderPriceInfo(periodData.indicators);
        renderAnalysisDetails(periodData.recommendation);

        if (window.BistCharts) {
            window.BistCharts.renderAllCharts(periodData);
        }
    }

    function showError(message) {
        var container = document.querySelector('.container');
        if (container) {
            container.innerHTML = '<a href="index.html" class="back-link">← Dashboard\'a Dön</a>' +
                '<div style="text-align:center;padding:80px 20px;">' +
                '<div style="font-size:64px;margin-bottom:24px;">😕</div>' +
                '<h2 style="margin-bottom:12px;">Hisse Bulunamadı</h2>' +
                '<p style="color:var(--text-muted);">' + message + '<br><br><a href="index.html" style="color:var(--accent-blue);">Dashboard\'a dön →</a></p>' +
                '</div>';
        }
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
                : 'Basit mod acik: teknik bloklar gizli.';
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

    async function init() {
        setupMobileNav();
        setupAdvancedModeToggle();
        var ticker = getTickerFromUrl();
        if (!ticker) { showError('URL\'de hisse kodu bulunamadı.'); return; }
        if (!window.BistCharts) { showError('Grafik modülü yüklenemedi.'); return; }

        stockData = await window.BistCharts.loadStockData(ticker);
        if (!stockData) { showError('"' + ticker + '" hissesi için veri bulunamadı.'); return; }

        window.BistCharts.setStockData(stockData);

        // Update info
        var updateTime = document.getElementById('updateTime');
        if (updateTime && stockData.updated_at) updateTime.textContent = 'Son: ' + stockData.updated_at;

        var stockUpdateTime = document.getElementById('stockUpdateTime');
        if (stockUpdateTime) {
            stockUpdateTime.textContent = 'Son güncelleme: ' + (stockData.updated_at || '--') + ' | ' + (stockData.update_frequency || '');
        }

        // Setup tabs
        document.querySelectorAll('.period-tab').forEach(function (tab) {
            tab.addEventListener('click', function () { switchPeriod(tab.dataset.period); });
        });

        var availablePeriods = Object.keys(stockData.periods || {});
        if (availablePeriods.length === 0) { showError('Periyot verisi bulunamadı.'); return; }

        var startPeriod = availablePeriods.indexOf('daily') >= 0 ? 'daily' : availablePeriods[0];

        document.querySelectorAll('.period-tab').forEach(function (tab) {
            if (availablePeriods.indexOf(tab.dataset.period) < 0) {
                tab.style.opacity = '0.3';
                tab.style.pointerEvents = 'none';
            }
        });

        switchPeriod(startPeriod);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
