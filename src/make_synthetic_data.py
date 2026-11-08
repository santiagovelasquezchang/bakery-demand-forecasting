"""Generate a made-up sales file so anyone can run the forecast end to end.

The file has the same generic structure the code expects (one row per item
sold) but every value is invented: item names, prices, volumes and dates.
It reproduces the features the method has to handle, not the partner's
numbers: Monday-to-Friday trading, a slowly drifting sales level, random
week-to-week variation, a holiday closure, a one-off event week, refunds and
open-price custom orders.

Usage (from the repository root):
    python src/make_synthetic_data.py            # writes data/synthetic/sample_sales.csv
"""
import argparse
from pathlib import Path

import numpy as np
import pandas as pd

ITEMS = {  # item: (category, average share of units, unit price)
    "Hot drink A": ("Drinks", 0.20, 3.50), "Hot drink B": ("Drinks", 0.09, 4.25),
    "Hot drink C": ("Drinks", 0.06, 4.00), "Cold drink A": ("Drinks", 0.10, 2.00),
    "Cold drink B": ("Drinks", 0.05, 1.50), "Cold drink C": ("Drinks", 0.03, 2.50),
    "Pastry A": ("Bakery", 0.07, 3.00), "Pastry B": ("Bakery", 0.05, 3.25),
    "Pastry C": ("Bakery", 0.04, 2.75), "Pastry D": ("Bakery", 0.03, 3.50),
    "Pastry E": ("Bakery", 0.02, 4.00), "Savory A": ("Savory", 0.06, 3.25),
    "Savory B": ("Savory", 0.05, 3.25), "Savory C": ("Savory", 0.04, 6.50),
    "Savory D": ("Savory", 0.03, 6.75), "Savory E": ("Savory", 0.03, 7.00),
    "Savory F": ("Savory", 0.02, 6.50), "Snack A": ("Snacks", 0.02, 1.25),
    "Snack B": ("Snacks", 0.01, 2.00),
}


def make(start="2024-01-01", weeks=86, base=120.0, seed=7) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    names = list(ITEMS)
    shares = np.array([ITEMS[n][1] for n in names])
    shares = shares / shares.sum()
    level = base
    closed_week = 51                       # a holiday closure
    event_week = 36                        # a one-off event at about 2.5x normal volume
    rows = []
    for w in range(weeks):
        level = max(40.0, level * np.exp(rng.normal(0.003, 0.03)))     # slow random drift
        if w == closed_week:
            continue
        monday = pd.Timestamp(start) + pd.Timedelta(weeks=w)
        mult = 2.5 if w == event_week else 1.0
        for d in range(5):                                             # Monday to Friday
            day = monday + pd.Timedelta(days=d)
            day_level = level / 5 * mult * (1.1 if d in (1, 2, 3) else 0.85)
            counts = rng.poisson(day_level * shares)
            for name, n in zip(names, counts):
                cat, _, price = ITEMS[name]
                for _ in range(n):
                    t = f"{rng.integers(7, 15):02d}:{rng.integers(0, 60):02d}:{rng.integers(0, 60):02d}"
                    rows.append((day.date(), t, cat, name, 1, price))
            if rng.random() < 0.15:                                    # an occasional custom order
                rows.append((day.date(), "12:00:00", "(none)", "Custom order", 1,
                             float(rng.choice([25, 60, 150, 300]))))
            if rng.random() < 0.03:                                    # an occasional refund
                name = names[rng.integers(0, len(names))]
                rows.append((day.date(), "16:30:00", ITEMS[name][0], name, -1, -ITEMS[name][2]))
    df = pd.DataFrame(rows, columns=["date", "time", "category", "item", "qty", "net_sales"])
    # the last week of the export is incomplete, as it is in a real export
    last_monday = pd.Timestamp(start) + pd.Timedelta(weeks=weeks - 1)
    return df[pd.to_datetime(df["date"]) < last_monday + pd.Timedelta(days=2)]


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--out", default="data/synthetic/sample_sales.csv")
    ap.add_argument("--seed", type=int, default=7)
    a = ap.parse_args()
    out = Path(a.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    df = make(seed=a.seed)
    df.to_csv(out, index=False)
    print(f"wrote {len(df):,} rows to {out}")
