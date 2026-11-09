"""Draw the README figures for the forecasting section.

Both figures use only the synthetic sample data, so they contain no partner
information and anyone can regenerate them.

Usage (from the repository root):
    python src/plot_figures.py
writes reports/figures/forecast_workflow.png and reports/figures/forecast_example_synthetic.png
"""
import sys
from pathlib import Path

import matplotlib.pyplot as plt
import matplotlib.dates as mdates
from matplotlib.patches import FancyBboxPatch

sys.path.insert(0, str(Path(__file__).resolve().parent))
from forecasting.config import load_settings                                     # noqa: E402
from forecasting.data_prep import build_panel, build_week_calendar, load_sales, select_items, weekly_series  # noqa: E402
from forecasting.evaluation import run_folds                                       # noqa: E402
from forecasting.model import flat_recursive                                       # noqa: E402

INK, INK2, GRID, SURFACE = "#0b0b0b", "#52514e", "#e6e5e1", "#fcfcfb"
BLUE, ORANGE, BLUE_FILL = "#2a78d6", "#eb6834", "#d6e6f9"
OUT = Path("reports/figures")

plt.rcParams.update({
    "figure.facecolor": SURFACE, "axes.facecolor": SURFACE, "savefig.facecolor": SURFACE,
    "axes.edgecolor": GRID, "axes.labelcolor": INK2, "axes.spines.top": False,
    "axes.spines.right": False, "axes.grid": True, "grid.color": GRID, "xtick.color": INK2,
    "ytick.color": INK2, "font.size": 11, "axes.titlesize": 13, "axes.titleweight": "bold",
    "axes.titlelocation": "left", "legend.frameon": False,
})


def workflow():
    steps = [
        ("1  Clean the sales lines", "remove duplicate rows,\nrefunds net to zero,\nsplit off custom orders"),
        ("2  Build a weekly table", "items x weeks, zero-filled,\nscaled to 5 trading days,\nevent weeks set aside"),
        ("3  Forecast the total", "average of the last\n12 normal weeks,\nrepeated week by week"),
        ("4  Split across items", "each item's share of\nthe total over the\nsame 12 weeks"),
        ("5  Add a likely range", "5th to 95th percentile\nof the model's own\npast misses"),
        ("6  Plan", "green: plan from the number\namber: plan from the range\nred: use a par level"),
    ]
    fig, ax = plt.subplots(figsize=(13, 2.9))
    ax.set_xlim(0, 6)
    ax.set_ylim(0, 1)
    ax.axis("off")
    for i, (title, body) in enumerate(steps):
        x = i + 0.06
        fill = BLUE_FILL if i in (2, 3, 4) else "#efeeea"
        ax.add_patch(FancyBboxPatch((x, 0.06), 0.84, 0.76, boxstyle="round,pad=0.02,rounding_size=0.04",
                                    facecolor=fill, edgecolor="none"))
        ax.text(x + 0.42, 0.68, title, ha="center", va="center", fontsize=11, fontweight="bold", color=INK)
        ax.text(x + 0.42, 0.36, body, ha="center", va="center", fontsize=9.5, color=INK2, linespacing=1.4)
        if i < len(steps) - 1:
            ax.annotate("", xy=(i + 1.04, 0.44), xytext=(i + 0.92, 0.44),
                        arrowprops=dict(arrowstyle="-|>", color=INK2, lw=1.5))
    ax.text(3.48, 0.95, "the model (steps 3 to 5) is tested on 50+ past dates using only data available at each date",
            ha="center", va="center", fontsize=9.5, color=BLUE)
    fig.tight_layout()
    fig.savefig(OUT / "forecast_workflow.png", dpi=200)
    plt.close(fig)


def example():
    cfg = load_settings("config/settings.example.json")
    df = load_sales(cfg)
    cal = build_week_calendar(df, cfg)
    items = select_items(df, cfg)
    panel = build_panel(df, items, cal)
    store, rev = weekly_series(df, panel, cal, cfg)
    folds = run_folds(panel, store, rev, items, cfg)
    r = folds[folds["level"] == "store"]["resid"]
    q_lo, q_hi = r.quantile(cfg.range_quantiles[0]), r.quantile(cfg.range_quantiles[1])

    h = 8
    path = flat_recursive(store, h, cfg.level_window)
    weeks = [store.index.max() + (i + 1) * (store.index[1] - store.index[0]) for i in range(h)]
    hist = store.tail(30)

    fig, ax = plt.subplots(figsize=(10, 4.2))
    ax.plot(hist.index, hist.values, color=INK2, lw=1.6, marker="o", ms=3.5, label="actual weekly units")
    ax.plot(hist.index, store.rolling(cfg.level_window).mean().tail(30).values, color=ORANGE, lw=2,
            label="12-week average")
    ax.fill_between(weeks, [max(0, p + q_lo) for p in path], [p + q_hi for p in path],
                    color=BLUE, alpha=0.18, lw=0, label="likely range (5th to 95th percentile)")
    ax.plot(weeks, path, color=BLUE, lw=2.4, label="forecast")
    ax.set_title("Synthetic example: total weekly units, forecast and likely range")
    ax.set_ylabel("Units per week")
    ax.xaxis.set_major_formatter(mdates.DateFormatter("%b"))
    ax.legend(loc="lower left", ncol=2, fontsize=9)
    ax.set_ylim(bottom=0)
    fig.tight_layout()
    fig.savefig(OUT / "forecast_example_synthetic.png", dpi=200)
    plt.close(fig)


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    workflow()
    example()
    print(f"wrote figures to {OUT}/")
