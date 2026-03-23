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


def build_decision_coach(summary: Dict[str, Any], performance: Dict[str, Any]) -> Dict[str, Any]:
    regime = _market_regime(summary)
    quality = _quality_score(performance)

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
