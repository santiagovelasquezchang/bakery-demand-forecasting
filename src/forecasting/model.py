"""Top-down recursive forecast.

    store level  L = mean of the last W clean weeks of total units (W = 12)
    item share   p_i = mean over the last 12 clean weeks of item units / total units
    forecast     item_i(t + h) = L(t + h) x seasonal(t + h) x event(t + h) x p_i

For more than one week ahead, each forecast is appended to the history (with any
seasonal or event factor divided out) and the average is recomputed.
"""
import numpy as np
import pandas as pd


def item_shares(wide: pd.DataFrame, store_hist: pd.Series, upto, window: int = 12) -> pd.Series:
    """Each item's mean share of store volume over the last `window` clean weeks up to `upto`."""
    weeks = store_hist.index[store_hist.index <= upto][-window:]
    return wide.loc[weeks].div(store_hist.loc[weeks], axis=0).mean().fillna(0.0)


def flat_recursive(series: pd.Series, horizon: int, window: int = 12) -> list:
    """Recursive moving-average path for any single series."""
    vals, out = list(series.values), []
    for _ in range(horizon):
        f = float(np.mean(vals[-window:]))
        out.append(f)
        vals.append(f)
    return out


def forecast_items(panel: pd.DataFrame, store: pd.Series, items: list, start_week, end_week,
                   level_window: int = 12, share_window: int = 12,
                   seasonal: dict | None = None, events: dict | None = None) -> pd.DataFrame:
    """Forecast every item for each week from start_week to end_week (Mondays).

    seasonal / events: optional {week_start: factor}; both default to 1.0.
    """
    target_weeks = list(pd.date_range(start_week, end_week, freq="7D"))
    last = pd.Timestamp(start_week) - pd.Timedelta(days=7)
    hist = store.dropna()
    hist = hist[hist.index <= last]
    seasonal = {pd.Timestamp(k): v for k, v in (seasonal or {}).items()}
    events = {pd.Timestamp(k): v for k, v in (events or {}).items()}

    wide = panel.pivot(index="week_start", columns="item", values="qty")[items]
    shares = item_shares(wide, hist, last, share_window)

    level_series = list(hist.values)            # kept free of seasonal/event factors
    rows = []
    for w in target_weeks:
        level = float(np.mean(level_series[-level_window:]))
        sf, ef = float(seasonal.get(w, 1.0)), float(events.get(w, 1.0))
        store_fc = max(0.0, level * sf * ef)
        for item in items:
            rows.append({"item": item, "week_start": w,
                         "forecast_qty": round(store_fc * shares[item], 1),
                         "item_share": round(float(shares[item]), 5),
                         "store_forecast": round(store_fc, 1)})
        level_series.append(store_fc / (sf * ef) if sf * ef > 0 else store_fc)
    return pd.DataFrame(rows)
