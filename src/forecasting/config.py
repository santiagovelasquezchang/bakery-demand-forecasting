"""Project settings.

Generic defaults live here. Anything specific to the partner's data (column
names in their export, known event weeks, item names to exclude) goes in a
local settings file saved as data/settings.json. Everything in data/ except
data/README.md and data/synthetic/ is git-ignored, so that file is never
committed. config/settings.example.json shows the format.
"""
import json
from dataclasses import dataclass, field
from pathlib import Path


@dataclass
class Settings:
    # input files
    data_dir: str = "data/synthetic"
    file_pattern: str = "*.csv"
    date_format: str = ""                      # e.g. "%m/%d/%Y"; empty = let pandas infer
    # maps the generic names used in the code to the column names in the export
    columns: dict = field(default_factory=lambda: {
        "date": "date", "time": "time", "category": "category", "item": "item",
        "qty": "qty", "net_sales": "net_sales"})

    # scope
    top_n_items: int = 18                      # best sellers forecast individually
    exclude_items: list = field(default_factory=list)       # add-on modifiers etc.
    exclude_categories: list = field(default_factory=list)  # one-off event products
    custom_order_items: list = field(default_factory=list)  # open-price custom orders
    custom_order_min_ticket: float = 100.0
    min_weekly_units: float = 2.0              # below this an item gets a par level

    # data guards
    standard_week_days: int = 5                # trading days in a normal week
    min_open_days: int = 3
    event_mad_threshold: float = 4.0
    known_event_weeks: list = field(default_factory=list)   # Monday dates, "YYYY-MM-DD"

    # model
    level_window: int = 12
    share_window: int = 12

    # evaluation
    max_horizon: int = 12
    min_history: int = 26
    range_quantiles: tuple = (0.05, 0.95)
    min_range_weeks: int = 26


def load_settings(path: str | None = None) -> Settings:
    """Defaults, overridden by a JSON file: the path given, else data/settings.json if it
    exists, else config/settings.example.json (which runs on the synthetic data)."""
    s = Settings()
    if path:
        p = Path(path)
    elif Path("data/settings.json").exists():
        p = Path("data/settings.json")
    else:
        p = Path("config/settings.example.json")
    if p.exists():
        for k, v in json.loads(p.read_text()).items():
            if k.startswith("_"):
                continue
            if not hasattr(s, k):
                raise KeyError(f"Unknown setting '{k}' in {p}")
            setattr(s, k, tuple(v) if k == "range_quantiles" else v)
    return s
