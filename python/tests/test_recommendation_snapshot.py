# -*- coding: utf-8 -*-
"""Recommendation snapshot tests for scoring stability."""

import unittest

from recommendation_engine import generate_recommendation


BASE_INDICATORS = {
    "price": 100.0,
    "open": 99.2,
    "high": 101.5,
    "low": 97.8,
    "volume": 2000000,
    "change_pct": 2.2,
    "change_5d": 6.1,
    "change_20d": 10.3,
    "rsi": 27.5,
    "macd": 1.8,
    "macd_signal": 1.2,
    "macd_histogram": 0.6,
    "macd_prev": 1.0,
    "macd_signal_prev": 1.1,
    "sma_20": 96.0,
    "sma_50": 92.0,
    "sma_200": 88.0,
    "ema_12": 98.0,
    "ema_26": 95.0,
    "bb_upper": 104.0,
    "bb_middle": 98.0,
    "bb_lower": 92.0,
    "stoch_k": 18.0,
    "stoch_d": 15.0,
    "stoch_k_prev": 12.0,
    "stoch_d_prev": 14.0,
    "adx": 32.0,
    "plus_di": 31.0,
    "minus_di": 16.0,
    "volume_avg": 1200000,
    "volume_ratio": 1.9,
    "fibonacci": {
        "0": 110.0,
        "0.236": 106.0,
        "0.382": 103.0,
        "0.5": 100.0,
        "0.618": 97.0,
        "0.786": 94.0,
        "1.0": 90.0
    },
    "support_resistance": {
        "r3": 109.0,
        "r2": 106.0,
        "r1": 103.0,
        "pivot": 100.0,
        "s1": 97.0,
        "s2": 94.0,
        "s3": 91.0
    },
}


class RecommendationSnapshotTest(unittest.TestCase):
    def test_daily_signal_snapshot(self):
        rec = generate_recommendation(dict(BASE_INDICATORS), "daily")

        self.assertIn(rec["signal_en"], {"STRONG_BUY", "BUY", "WEAK_BUY"})
        self.assertGreaterEqual(rec["score"], 20)
        self.assertGreaterEqual(rec["confidence"], 40)

        self.assertEqual(len(rec["details"]), 9)
        self.assertEqual(rec["details"][0]["indicator"], "rsi")
        self.assertEqual(rec["details"][1]["indicator"], "macd")

        self.assertIn("target_1", rec["targets"])
        self.assertIn("stop_loss", rec["targets"])

    def test_weekly_bearish_snapshot(self):
        bearish = dict(BASE_INDICATORS)
        bearish.update({
            "change_pct": -3.4,
            "rsi": 78.0,
            "macd": -1.4,
            "macd_signal": -1.0,
            "macd_histogram": -0.4,
            "macd_prev": -0.9,
            "macd_signal_prev": -0.8,
            "stoch_k": 86.0,
            "stoch_d": 89.0,
            "stoch_k_prev": 92.0,
            "stoch_d_prev": 88.0,
            "adx": 36.0,
            "plus_di": 14.0,
            "minus_di": 33.0,
            "volume_ratio": 2.3,
            "sma_20": 104.0,
            "sma_50": 106.0,
            "sma_200": 109.0,
            "price": 100.0,
            "fibonacci": {
                "0": 115.0,
                "0.236": 111.0,
                "0.382": 108.0,
                "0.5": 105.0,
                "0.618": 102.0,
                "0.786": 99.0,
                "1.0": 95.0
            },
        })

        rec = generate_recommendation(bearish, "weekly")
        self.assertIn(rec["signal_en"], {"STRONG_SELL", "SELL", "WEAK_SELL"})
        self.assertLessEqual(rec["score"], -20)
        self.assertGreaterEqual(rec["confidence"], 40)
        self.assertIn("support_resistance", rec)


if __name__ == "__main__":
    unittest.main()
