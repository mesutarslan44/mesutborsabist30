# -*- coding: utf-8 -*-
"""Decision quality coaching payload for dashboard."""

import json
from typing import Dict, Any, List


def _to_num(value, default=0.0):
    try:
        return float(value)
    except Exception:
        return float(default)


def _market_regime(summary: Dict[str, Any]) -> Dict[str, str]:
    signal_counts = summary.get("signal_counts", {})
    indices = summary.get("indices", {})

    buy_side = (
        int(signal_counts.get("STRONG_BUY", 0))
        + int(signal_counts.get("BUY", 0))
        + int(signal_counts.get("WEAK_BUY", 0))
    )
    sell_side = (
        int(signal_counts.get("STRONG_SELL", 0))
        + int(signal_counts.get("SELL", 0))
        + int(signal_counts.get("WEAK_SELL", 0))
    )

    xu30 = indices.get("XU030", {})
    xu100 = indices.get("XU100", {})
    xu30_chg = _to_num(xu30.get("change_pct", 0))
    xu100_chg = _to_num(xu100.get("change_pct", 0))

    bias = buy_side - sell_side
    index_bias = xu30_chg + xu100_chg

    if bias >= 4 and index_bias > 0:
        return {
            "name": "Risk-On",
            "tone": "positive",
            "why": "AL sinyalleri SAT sinyallerinden belirgin yuksek ve endeksler destekliyor.",
            "how": "Isleme parca parca gir, 1.5R altindaki kurulumlari ele.",
        }
    if bias <= -4 and index_bias < 0:
        return {
            "name": "Risk-Off",
            "tone": "negative",
            "why": "SAT baskisi yuksek, endeks yonu zayif.",
            "how": "Pozisyon boyutunu azalt, stopu gevsetme, yeni islemde secici ol.",
        }
    return {
        "name": "Nötr",
        "tone": "neutral",
        "why": "AL/SAT dengesi karisik veya endeks onayi zayif.",
        "how": "Sadece A/B setup ve net hedef-stop oranli islemleri sec.",
    }


def _quality_score(performance: Dict[str, Any]) -> float:
    overview = performance.get("overview", {})
    consistency = _to_num(performance.get("consistency_score", 0))
    hit_rate = _to_num(overview.get("hit_rate", 0))
    total = _to_num(overview.get("total", 0))

    sample_factor = min(max(total / 40.0, 0.25), 1.0)
    blended = (consistency * 0.55) + (hit_rate * 0.45)
    score = blended * sample_factor
    return round(max(min(score, 100.0), 0.0), 1)


def _coaching_cards(regime: Dict[str, str], quality_score: float) -> List[Dict[str, str]]:
    cards = [
        {
            "title": "1) Islem Filtresi",
            "desc": "Ne ise yarar? Dusuk kaliteli sinyalleri eleyerek gereksiz islem sayisini azaltir.",
            "rule": "Sadece Setup A/B ve R >= 1.5 islemleri oncele.",
        },
        {
            "title": "2) Zamanlama Disiplini",
            "desc": "Ne ise yarar? Veri gecikmesi kaynakli yanlis kararlari azaltir.",
            "rule": "Veri yasi gecikmeli/eski ise yeni pozisyon acma.",
        },
        {
            "title": "3) Pozisyon Boyutu",
            "desc": "Ne ise yarar? Tek bir hatanin portfoyu bozmasini engeller.",
            "rule": "Islem basi riski sabit tut (or: portfoyun %0.5-%1.0 arasi).",
        },
    ]

    if regime.get("name") == "Risk-Off":
        cards.append(
            {
                "title": "4) Koruma Modu",
                "desc": "Ne ise yarar? Dusus doneminde duygusal islemleri kisar.",
                "rule": "Yeni islem sayisini yarıya indir, mevcutlarda stop disiplini uygula.",
            }
        )
    elif quality_score >= 60:
        cards.append(
            {
                "title": "4) Verimi Artirma",
                "desc": "Ne ise yarar? Yuksek kaliteli donemde sistem avantajini buyutur.",
                "rule": "A setup geldikce kademeli giris + parcali kar al plani kullan.",
            }
        )
    else:
        cards.append(
            {
                "title": "4) Kalibrasyon",
                "desc": "Ne ise yarar? Dalgali performansta kaybi sinirlar.",
                "rule": "En az 20 islem logu birikmeden lot buyutme.",
            }
        )

    return cards


def _rule_violation_metrics(performance: Dict[str, Any]) -> Dict[str, Any]:
    resolved = performance.get("recent_resolved", []) or []
    if not resolved:
        return {
            "score": 50.0,
            "label": "Orta",
            "summary": "Yeterli kapanan islem yok; ihlal skoru varsayilan seviyede.",
            "components": [
                {
                    "name": "Sample",
                    "value": "Dusuk",
                    "help": "Ne ise yarar? Skorun guvenilirligini gosterir.",
                }
            ],
        }

    sample = min(len(resolved), 120)
    data = resolved[:sample]

    low_conf = 0
    weak_score = 0
    fast_expired = 0
    total_expired = 0

    for item in data:
        confidence = _to_num(item.get("confidence", 0))
        score = abs(_to_num(item.get("score", 0)))
        days = _to_num(item.get("days_to_result", 0))
        status = item.get("status", "")

        if confidence < 45:
            low_conf += 1
        if score < 12:
            weak_score += 1
        if status == "EXPIRED":
            total_expired += 1
            if days <= 2:
                fast_expired += 1

    low_conf_ratio = low_conf / sample
    weak_score_ratio = weak_score / sample
    expired_ratio = total_expired / sample
    fast_expired_ratio = (fast_expired / total_expired) if total_expired else 0

    penalty = (
        (low_conf_ratio * 30.0)
        + (weak_score_ratio * 25.0)
        + (expired_ratio * 30.0)
        + (fast_expired_ratio * 15.0)
    )
    score = round(max(min(100.0 - penalty, 100.0), 0.0), 1)

    if score >= 75:
        label = "Iyi"
        summary = "Kural ihlali riski dusuk; disiplin korunuyor."
    elif score >= 55:
        label = "Orta"
        summary = "Kural ihlali orta seviyede; filtre ve secicilik artmali."
    else:
        label = "Zayif"
        summary = "Kural ihlali yuksek; lot azaltip yalnizca guclu setup secilmeli."

    return {
        "score": score,
        "label": label,
        "summary": summary,
        "components": [
            {
                "name": "Dusuk Guvenli Islemler",
                "value": f"%{round(low_conf_ratio * 100, 1)}",
                "help": "Ne ise yarar? Guveni dusuk islemleri azaltman gerekip gerekmedigini soyler.",
            },
            {
                "name": "Zayif Skorlu Islemler",
                "value": f"%{round(weak_score_ratio * 100, 1)}",
                "help": "Ne ise yarar? Setup filtresini ne kadar sikilastirman gerektigini gosterir.",
            },
            {
                "name": "Sure Asimi",
                "value": f"%{round(expired_ratio * 100, 1)}",
                "help": "Ne ise yarar? Yanlis zamanlamayi erken fark ettirir.",
            },
        ],
    }


def _error_patterns(performance: Dict[str, Any]) -> List[Dict[str, str]]:
    resolved = performance.get("recent_resolved", []) or []
    if not resolved:
        return [
            {
                "title": "Yeterli Islem Yok",
                "detail": "Hata paterni cikarimi icin en az 20 kapanan islem gerekir.",
                "action": "Ne ise yarar? Erken donemde asiri guvenli karar hatasini onler.",
            }
        ]

    sample = resolved[:120]
    total = len(sample)

    buy_total = len([x for x in sample if x.get("direction") == "buy"])
    buy_expired = len([x for x in sample if x.get("direction") == "buy" and x.get("status") == "EXPIRED"])

    sell_total = len([x for x in sample if x.get("direction") == "sell"])
    sell_expired = len([x for x in sample if x.get("direction") == "sell" and x.get("status") == "EXPIRED"])

    low_conf_total = len([x for x in sample if _to_num(x.get("confidence", 0)) < 45])
    low_conf_expired = len([
        x for x in sample
        if _to_num(x.get("confidence", 0)) < 45 and x.get("status") == "EXPIRED"
    ])

    patterns: List[Dict[str, str]] = []

    if buy_total >= 8 and (buy_expired / buy_total) >= 0.45:
        patterns.append(
            {
                "title": "AL Yonlu Erken Bozulma",
                "detail": "AL tarafinda sure asimi yuksek. Trend teyidi zayif islemler fazla olabilir.",
                "action": "Ne ise yarar? AL filtresini sikilastirarak yanlis pozisyon sayisini dusurur.",
            }
        )

    if sell_total >= 8 and (sell_expired / sell_total) >= 0.45:
        patterns.append(
            {
                "title": "SAT Yonlu Verimsizlik",
                "detail": "SAT tarafinda sure asimi yuksek. Asiri savunmaci filtre kullaniliyor olabilir.",
                "action": "Ne ise yarar? SAT tarafinda sadece guven ve skor yuksek sinyalleri birakir.",
            }
        )

    if low_conf_total >= 8 and (low_conf_expired / low_conf_total) >= 0.55:
        patterns.append(
            {
                "title": "Dusuk Guven Tuzagi",
                "detail": "Guveni dusuk islemlerde bozulan sonuc orani yuksek.",
                "action": "Ne ise yarar? Guven esigini yukselterek dogruluk oranini artirir.",
            }
        )

    if not patterns:
        patterns.append(
            {
                "title": "Belirgin Hata Paterni Yok",
                "detail": "Son kayitlarda tek bir baskin hata paterni gorulmuyor.",
                "action": "Ne ise yarar? Mevcut disiplinin korundugunu ve tutarliligin artis potansiyelini gosterir.",
            }
        )

    patterns.append(
        {
            "title": "Orneklem Bilgisi",
            "detail": f"Analiz edilen kapanan islem sayisi: {total}",
            "action": "Ne ise yarar? Sonuclarin guvenilirlik seviyesini yorumlamani kolaylastirir.",
        }
    )

    return patterns[:4]


def build_decision_coach(summary: Dict[str, Any], performance: Dict[str, Any]) -> Dict[str, Any]:
    regime = _market_regime(summary)
    quality = _quality_score(performance)
    violation = _rule_violation_metrics(performance)
    patterns = _error_patterns(performance)

    checklist = [
        "Sinyal + Setup + R birlikte kontrol edildi mi?",
        "Stop seviyesi emirden once net mi?",
        "Hedef 1 gorulurse parcali kar plani hazir mi?",
        "Islem gunlugu notu acildi mi?",
    ]

    if quality >= 70:
        grade = "A"
        note = "Sistem su an daha tutarli; yine de risk sabit kalmali."
    elif quality >= 50:
        grade = "B"
        note = "Sistem kullanilabilir, filtre disiplinini gevsetme."
    else:
        grade = "C"
        note = "Sistem dalgali; secicilik ve lot kontrolu artmali."

    return {
        "quality_score": quality,
        "quality_grade": grade,
        "quality_note": note,
        "rule_violation": violation,
        "error_patterns": patterns,
        "market_regime": regime,
        "coaching_cards": _coaching_cards(regime, quality),
        "execution_checklist": checklist,
        "disclaimer": "Bu panel karar destegidir, kesin alim-satim emri degildir.",
    }


def write_decision_coach(output_path: str, summary: Dict[str, Any], performance: Dict[str, Any]) -> Dict[str, Any]:
    payload = build_decision_coach(summary, performance)
    with open(output_path, "w", encoding="utf-8") as file_handle:
        json.dump(payload, file_handle, ensure_ascii=False, indent=2)
    return payload
