"""Walk-forward (rolling-origin) evaluation and empirical prediction ranges.

Every clean week from week `min_history` onwards becomes a forecast origin. From
each origin the model forecasts `max_horizon` weeks ahead using only data up to
that origin, and each forecast is compared with what actually sold. Two simple
benchmarks are scored on the same pairs: "same as last week" and a 4-week mean.
"""
import numpy as np
import pandas as pd

from .model import flat_recursive, forecast_items


def wape(forecast, actual) -> float:
    """Weighted absolute percentage error: total units missed / total units sold."""
    forecast, actual = np.asarray(forecast, float), np.asarray(actual, float)
    return float(np.abs(forecast - actual).sum() / actual.sum())


def run_folds(panel, store, rev, items, cfg) -> pd.DataFrame:
    wide = panel.pivot(index="week_start", columns="item", values="qty")[items]
    clean_weeks = list(store.index)
    clean_set = set(clean_weeks)
    rows = []
    for k in range(cfg.min_history - 1, len(clean_weeks) - 1):
        origin = clean_weeks[k]
        start = origin + pd.Timedelta(days=7)
        end = origin + pd.Timedelta(days=7 * cfg.max_horizon)
        sub_store, sub_rev = store[store.index <= origin], rev[rev.index <= origin]
        fc = forecast_items(panel[panel["week_start"] <= origin], sub_store, items, start, end,
                            cfg.level_window, cfg.share_window)
        last_item = wide.loc[origin]
        ma4_item = wide.loc[sub_store.index].tail(4).mean()
        for r in fc.itertuples(index=False):
            t = r.week_start
            if t in clean_set:
                rows.append(("item", r.item, origin, t, (t - origin).days // 7, float(r.forecast_qty),
                             float(wide.at[t, r.item]), float(last_item[r.item]), float(ma4_item[r.item])))
        for level, series, sub, name in (("store", store, sub_store, "all items"),
                                         ("revenue", rev, sub_rev, "walk-in revenue")):
            for h, f in enumerate(flat_recursive(sub, cfg.max_horizon, cfg.level_window), start=1):
                t = origin + pd.Timedelta(days=7 * h)
                if t in series.index:
                    rows.append((level, name, origin, t, h, f, float(series[t]),
                                 float(sub.iloc[-1]), float(sub.tail(4).mean())))
    df = pd.DataFrame(rows, columns=["level", "name", "origin", "target", "horizon",
                                     "forecast", "actual", "last_week", "ma4"])
    df["resid"] = df["actual"] - df["forecast"]
    return df


def accuracy_table(folds: pd.DataFrame) -> pd.DataFrame:
    out = folds.groupby("level").apply(lambda g: pd.Series({
        "model_wape_pct": wape(g["forecast"], g["actual"]) * 100,
        "last_week_wape_pct": wape(g["last_week"], g["actual"]) * 100,
        "ma4_wape_pct": wape(g["ma4"], g["actual"]) * 100,
        "pairs": len(g)}), include_groups=False)
    out["pairs"] = out["pairs"].astype(int)
    return out.reindex([l for l in ["item", "store", "revenue"] if l in out.index])


def nested_coverage(folds: pd.DataFrame, q_lo: float, q_hi: float,
                    min_weeks: int = 26, min_resid: int = 30) -> pd.DataFrame:
    """Out-of-time test of the ranges: at each origin, build each series' range only
    from misses on weeks before that origin, then check whether the actual fell inside."""
    parts = []
    for origin, sub in folds.groupby("origin"):
        known = folds[folds["target"] <= origin]
        if known.empty or known["target"].nunique() < min_weeks:
            continue
        g = known.groupby(["level", "name"])["resid"].agg(
            n="size", q_lo=lambda x: x.quantile(q_lo), q_hi=lambda x: x.quantile(q_hi)).reset_index()
        m = sub.merge(g, on=["level", "name"], how="inner")
        parts.append(m[m["n"] >= min_resid])
    res = pd.concat(parts, ignore_index=True)
    res["lo"] = np.maximum(0.0, res["forecast"] + res["q_lo"])
    res["hi"] = res["forecast"] + res["q_hi"]
    res["inside"] = (res["actual"] >= res["lo"]) & (res["actual"] <= res["hi"])
    return res
