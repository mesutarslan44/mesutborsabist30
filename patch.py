import os
import pandas as pd

fp = "python/technical_analysis.py"
with open(fp, "r", encoding="utf-8") as f:
    text = f.read()

import_tr1 = """    tr1 = df["high"] - df["low"]
    tr2 = (df["high"] - df["close"].shift(1)).abs()
    tr3 = (df["low"] - df["close"].shift(1)).abs()
    tr = pd.concat([tr1, tr2, tr3], axis=1).max(axis=1)
    result["atr"] = tr.rolling(window=14, min_periods=1).mean()
    result["atr_pct"] = result["atr"] / df["close"]
    
    result["change_pct"]"""

if 'result["atr"]' not in text:
    text = text.replace('    result["change_pct"]', import_tr1)

export_atr = """        "volume_ratio": safe_val(analyzed["volume_ratio"], -1, 1),
        "atr_pct": safe_val(analyzed["atr_pct"], -1, 0.02),"""

if 'atr_pct' not in text:
    text = text.replace('        "volume_ratio": safe_val(analyzed["volume_ratio"], -1, 1),', export_atr)

target_old = """    multipliers = TARGET_MULTIPLIERS.get(period_name, TARGET_MULTIPLIERS["daily"])
    score = indicators.get("_score", 0)"""

target_new = """    multipliers = TARGET_MULTIPLIERS.get(period_name, TARGET_MULTIPLIERS["daily"])
    atr_pct = indicators.get("atr_pct", multipliers.get("stop_pct", 0.02))
    
    dynamic_stop = max(0.015, min(0.08, atr_pct))
    dynamic_target = dynamic_stop * 1.5
    
    multipliers = {"target_pct": dynamic_target, "stop_pct": dynamic_stop}
    
    score = indicators.get("_score", 0)"""

if 'dynamic_target' not in text:
    text = text.replace(target_old, target_new)

with open(fp, "w", encoding="utf-8") as f:
    f.write(text)
print("Done!")
