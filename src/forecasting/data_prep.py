"""From raw point-of-sale lines to a clean item-by-week table.

Steps: load and de-duplicate the exports, build a weekly calendar with
trading days and quality flags, keep the best-selling items, and scale every
week to a standard number of trading days.
"""
from pathlib import Path

import numpy as np
import pandas as pd

from .config import Settings


def clean_money(s: pd.Series) -> pd.Series:
    """'$1,234.50 ' -> 1234.50 and '(2.05)' -> -2.05 (accounting negatives)."""
    if pd.api.types.is_numeric_dtype(s):
        return s.astype(float)
    txt = s.astype(str).str.replace(r"[\$,\s]", "", regex=True)
    neg = txt.str.startswith("(") & txt.str.endswith(")")
    txt = txt.str.replace(r"[()]", "", regex=True).replace({"": np.nan})
    return pd.to_numeric(txt, errors="coerce") * np.where(neg, -1, 1)


def load_sales(cfg: Settings) -> pd.DataFrame:
    """Read every export in cfg.data_dir and return generic columns:
    date, time (if present), category, item, qty, net_sales, week_start."""
    files = sorted(Path(cfg.data_dir).glob(cfg.file_pattern))
    if not files:
        raise FileNotFoundError(f"No files matching {cfg.file_pattern} in {Path(cfg.data_dir).resolve()}")
    raw = pd.concat([pd.read_csv(f) for f in files], ignore_index=True)
    raw.columns = [c.strip() for c in raw.columns]

    rename = {v: k for k, v in cfg.columns.items() if v in raw.columns}
    df = raw.rename(columns=rename)
    missing = {"date", "item", "qty"} - set(df.columns)
    if missing:
        raise ValueError(f"Missing columns {missing}. Check 'columns' in config/settings.json.")

    df["date"] = pd.to_datetime(df["date"], format=cfg.date_format or None, errors="coerce")
    df = df.dropna(subset=["date"])
    df["qty"] = pd.to_numeric(df["qty"], errors="coerce").fillna(0)
    df["net_sales"] = clean_money(df["net_sales"]) if "net_sales" in df else 0.0
    df["item"] = df["item"].astype(str).str.strip()
    df["category"] = (df["category"].fillna("(none)").astype(str).str.strip()
                      if "category" in df else "(none)")

    key = [c for c in ["date", "time", "item", "qty", "net_sales"] if c in df.columns]
    df = df.drop_duplicates(subset=key).reset_index(drop=True)   # exports overlap at the edges
    df["week_start"] = df["date"] - pd.to_timedelta(df["date"].dt.weekday, unit="D")
    keep = ["date", "time", "category", "item", "qty", "net_sales", "week_start"]
    return df[[c for c in keep if c in df.columns]]


def build_week_calendar(df: pd.DataFrame, cfg: Settings) -> pd.DataFrame:
    """One row per calendar week with trading days and quality flags.

    usable: at least min_open_days trading days and not the incomplete last week
    event:  a known event week, or volume above median + k * MAD
    clean:  usable and not an event (the only weeks the model learns from)
    """
    wk = (df.groupby("week_start").agg(open_days=("date", "nunique"), total_qty=("qty", "sum"))
          .reset_index())
    spine = pd.DataFrame({"week_start": pd.date_range(wk["week_start"].min(), wk["week_start"].max(), freq="7D")})
    wk = spine.merge(wk, on="week_start", how="left").fillna({"open_days": 0, "total_qty": 0})

    last = wk.loc[wk["open_days"] > 0, "week_start"].max()
    wk["is_trailing_partial"] = (wk["week_start"] == last) & (wk["open_days"] < cfg.standard_week_days)
    wk["is_usable"] = (wk["open_days"] >= cfg.min_open_days) & ~wk["is_trailing_partial"]
    wk["day_scale"] = np.where(wk["is_usable"], cfg.standard_week_days / wk["open_days"].clip(lower=1), np.nan)
    wk["norm_total_qty"] = wk["total_qty"] * wk["day_scale"]

    usable = wk[wk["is_usable"]]
    med = usable["norm_total_qty"].median()
    mad = (usable["norm_total_qty"] - med).abs().median()
    thresh = med + cfg.event_mad_threshold * (mad if mad > 0 else 1.0)
    known = pd.to_datetime(cfg.known_event_weeks) if cfg.known_event_weeks else pd.DatetimeIndex([])
    wk["is_event"] = ((wk["norm_total_qty"] > thresh) & wk["is_usable"]) | wk["week_start"].isin(known)
    wk["is_clean"] = wk["is_usable"] & ~wk["is_event"]
    return wk


def cafe_pool(df: pd.DataFrame, cfg: Settings) -> pd.DataFrame:
    """Walk-in item lines: without add-on modifiers, custom orders and event-only products."""
    return df[~df["item"].isin(cfg.exclude_items) & ~df["item"].isin(cfg.custom_order_items)
              & ~df["category"].isin(cfg.exclude_categories)]


def select_items(df: pd.DataFrame, cfg: Settings) -> list:
    totals = cafe_pool(df, cfg).groupby("item")["qty"].sum().sort_values(ascending=False)
    return totals.head(cfg.top_n_items).index.tolist()


def build_panel(df: pd.DataFrame, items: list, cal: pd.DataFrame) -> pd.DataFrame:
    """Item x week units, zero-filled (no row = no sales), scaled to a standard week,
    NaN in unusable weeks."""
    weekly = (df[df["item"].isin(items)].groupby(["item", "week_start"], as_index=False)["qty"].sum()
              .rename(columns={"qty": "qty_raw"}))
    idx = pd.MultiIndex.from_product([items, cal["week_start"]], names=["item", "week_start"])
    panel = (weekly.set_index(["item", "week_start"]).reindex(idx, fill_value=0).reset_index()
             .merge(cal[["week_start", "open_days", "day_scale", "is_usable", "is_event", "is_clean"]],
                    on="week_start", how="left"))
    panel["qty"] = np.where(panel["is_usable"], panel["qty_raw"] * panel["day_scale"], np.nan)
    return panel.sort_values(["item", "week_start"]).reset_index(drop=True)


def weekly_series(df: pd.DataFrame, panel: pd.DataFrame, cal: pd.DataFrame, cfg: Settings):
    """Store volume (sum of the forecast items) and walk-in revenue, clean weeks only."""
    c = cal.set_index("week_start")
    clean = c["is_clean"].astype(bool)
    store = panel.groupby("week_start")["qty"].sum(min_count=1)
    store = store[clean.reindex(store.index).fillna(False)].dropna()
    walkin = df[~df["item"].isin(cfg.custom_order_items) & ~df["category"].isin(cfg.exclude_categories)]
    rev = walkin.groupby("week_start")["net_sales"].sum().reindex(c.index).fillna(0.0) * c["day_scale"]
    rev = rev[clean.reindex(rev.index).fillna(False)].dropna()
    return store, rev
