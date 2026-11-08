"""Run the weekly forecast and its walk-forward evaluation.

Usage (from the repository root):
    python src/make_synthetic_data.py          # once, to create the sample data
    python src/run_forecast.py                 # uses config/settings.example.json
    python src/run_forecast.py --settings data/settings.json --today 2026-11-09

Outputs go to reports/output/ (git-ignored):
    accuracy.csv     error of the model and two benchmarks, by level
    coverage.csv     share of past weeks that fell inside the likely range
    forecast.csv     next weeks per item, with likely range and a planning rating
"""
import argparse
import sys
import time
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
from forecasting.config import load_settings                                   # noqa: E402
from forecasting.data_prep import (build_panel, build_week_calendar, load_sales,  # noqa: E402
                                   select_items, weekly_series)
from forecasting.evaluation import accuracy_table, nested_coverage, run_folds    # noqa: E402
from forecasting.model import forecast_items                                     # noqa: E402


def rating(forecast, lo, hi, recent_avg, min_units):
    half_width = (hi - lo) / 2 / max(forecast, 0.1) * 100
    if recent_avg < min_units or half_width > 80:
        return "red: use a par level"
    return "green: plan from the number" if half_width <= 40 else "amber: plan from the range"


def main():
    ap = argparse.ArgumentParser(description="Weekly item-level demand forecast")
    ap.add_argument("--settings", default=None, help="JSON settings file (default: see config.py)")
    ap.add_argument("--today", default=None, help="forecast date, YYYY-MM-DD (default: day after the data ends)")
    ap.add_argument("--weeks", type=int, default=4, help="weeks to forecast after today")
    ap.add_argument("--out", default="reports/output")
    a = ap.parse_args()
    t0 = time.time()

    cfg = load_settings(a.settings)
    df = load_sales(cfg)
    cal = build_week_calendar(df, cfg)
    items = select_items(df, cfg)
    panel = build_panel(df, items, cal)
    store, rev = weekly_series(df, panel, cal, cfg)
    print(f"{len(df):,} sales lines, {int(cal['is_clean'].sum())} clean weeks of {len(cal)}, {len(items)} items")

    folds = run_folds(panel, store, rev, items, cfg)
    acc = accuracy_table(folds)
    cov = nested_coverage(folds, *cfg.range_quantiles, min_weeks=cfg.min_range_weeks)
    cov = (cov.groupby("level")["inside"].mean() * 100).rename("inside_range_pct").to_frame()
    print(f"\nWalk-forward test: {folds['origin'].nunique()} origins, up to {cfg.max_horizon} weeks ahead")
    print(acc.round(1).to_string())
    print("\nShare of later weeks inside the likely range (built only from earlier misses):")
    print(cov.round(1).to_string())

    last_clean = store.index.max()
    today = pd.Timestamp(a.today) if a.today else last_clean + pd.Timedelta(days=7)
    next_week = today + pd.Timedelta(days=(7 - today.weekday()) % 7 or 7)
    end = next_week + pd.Timedelta(weeks=a.weeks - 1)
    fc = forecast_items(panel, store, items, last_clean + pd.Timedelta(days=7), end,
                        cfg.level_window, cfg.share_window)
    q = folds[folds["level"] == "item"].groupby("name")["resid"].quantile(list(cfg.range_quantiles)).unstack()
    q.columns = ["q_lo", "q_hi"]
    fc = fc.join(q, on="item")
    fc["low"] = (fc["forecast_qty"] + fc["q_lo"]).clip(lower=0).round(1)
    fc["high"] = (fc["forecast_qty"] + fc["q_hi"]).round(1)
    wide = panel.pivot(index="week_start", columns="item", values="qty")[items].loc[store.index]
    recent = wide.tail(12).mean()
    fc["rating"] = [rating(r.forecast_qty, r.low, r.high, recent[r.item], cfg.min_weekly_units)
                    for r in fc.itertuples()]
    fc = fc[fc["week_start"] >= next_week]

    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    acc.to_csv(out / "accuracy.csv")
    cov.to_csv(out / "coverage.csv")
    fc[["week_start", "item", "forecast_qty", "low", "high", "rating"]].to_csv(out / "forecast.csv", index=False)
    print(f"\nForecast for {next_week.date()} to {end.date()} written to {out}/ ({time.time() - t0:.0f}s)")


if __name__ == "__main__":
    main()
