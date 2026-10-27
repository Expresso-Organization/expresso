# /// script
# requires-python = ">=3.11"
# dependencies = [
#   "matplotlib==3.10.6",
#   "numpy==2.3.2",
# ]
# ///
"""합성 프로필 v4.5.2 최종 코퍼스의 논문용 도표를 생성한다.

도표 계약
---------
1. 생성 모델과 데이터 분할 구성을 절대 건수와 비율로 비교한다.
2. 의도한 네 단계 길이 구간이 코퍼스에 어떻게 분포하는지 보여준다.
3. 프로필별 목표 평균 본문 길이와 실제 평균 길이의 분포 및 일치도를 보여준다.
4. 합성 사건의 고유성과 최종 품질 게이트의 실패 건수를 함께 보여준다.

모든 수치는 최종 품질 감사 JSON 및 그 감사 대상 프로필 JSON에서 다시 계산한다.
감사 요약과 재계산값이 다르면 도표를 만들지 않고 실패한다.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from collections import Counter
from pathlib import Path
from typing import Any

import matplotlib as mpl
import matplotlib.pyplot as plt
import numpy as np
from matplotlib.ticker import FuncFormatter, MaxNLocator


INK = "#1F2933"
MUTED = "#66717E"
GRID = "#DDE3E8"
BLUE = "#356AA0"
BLUE_DARK = "#234F78"
BLUE_LIGHT = "#AFC8DE"
ORANGE = "#D97706"
ORANGE_LIGHT = "#F2C98E"
GOLD = "#C49A29"
BACKGROUND = "#FFFFFF"

FIGURE_BASENAMES = (
    "figure-1-dataset-composition",
    "figure-2-length-band-distribution",
    "figure-3-target-vs-actual-length",
    "figure-4-diversity-quality-summary",
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--run-root", type=Path, required=True)
    parser.add_argument("--audit", type=Path)
    parser.add_argument("--output-dir", type=Path)
    parser.add_argument("--font", type=Path, default=Path(r"C:\Windows\Fonts\malgun.ttf"))
    return parser.parse_args()


def load_json(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def configure_style(font_path: Path) -> None:
    if not font_path.exists():
        raise FileNotFoundError(f"한글 글꼴을 찾을 수 없습니다: {font_path}")
    mpl.font_manager.fontManager.addfont(str(font_path))
    font_name = mpl.font_manager.FontProperties(fname=str(font_path)).get_name()
    mpl.rcParams.update(
        {
            "font.family": font_name,
            "font.size": 9,
            "axes.titlesize": 12,
            "axes.titleweight": "bold",
            "axes.labelsize": 9,
            "axes.labelcolor": INK,
            "axes.edgecolor": INK,
            "axes.linewidth": 0.8,
            "xtick.color": MUTED,
            "ytick.color": MUTED,
            "xtick.labelsize": 8,
            "ytick.labelsize": 8,
            "text.color": INK,
            "figure.facecolor": BACKGROUND,
            "axes.facecolor": BACKGROUND,
            "savefig.facecolor": BACKGROUND,
            "savefig.bbox": "tight",
            "pdf.fonttype": 42,
            "ps.fonttype": 42,
            "svg.fonttype": "path",
        }
    )


def read_profiles(run_root: Path) -> list[dict[str, Any]]:
    paths = sorted((run_root / "profiles").glob("*/*.json"))
    if not paths:
        raise FileNotFoundError(f"프로필 JSON을 찾을 수 없습니다: {run_root / 'profiles'}")
    return [load_json(path) for path in paths]


def normalize_model(model: str) -> str:
    lowered = model.lower()
    if "luna" in lowered:
        return "Luna"
    if "qwen" in lowered:
        return "Qwen"
    return model


def collect_metrics(profiles: list[dict[str, Any]]) -> dict[str, Any]:
    models = Counter()
    splits = Counter()
    bands = Counter()
    targets: list[float] = []
    actuals: list[float] = []

    for profile in profiles:
        meta = profile["datasetMeta"]
        models[normalize_model(str(meta["generatorModel"]))] += 1
        splits[str(meta["split"])] += 1
        plan = meta["bodyLengthPlan"]
        bands[str(plan["band"])] += 1
        targets.append(float(plan["targetMeanChars"]))
        actuals.append(float(meta["actualBodyLengthMean"]))

    target_array = np.asarray(targets, dtype=float)
    actual_array = np.asarray(actuals, dtype=float)
    return {
        "profile_count": len(profiles),
        "models": models,
        "splits": splits,
        "bands": bands,
        "targets": target_array,
        "actuals": actual_array,
        "pearson_r": float(np.corrcoef(target_array, actual_array)[0, 1]),
        "mae": float(np.mean(np.abs(target_array - actual_array))),
        "median_abs_error": float(np.median(np.abs(target_array - actual_array))),
    }


def validate_metrics(audit: dict[str, Any], metrics: dict[str, Any]) -> None:
    expected_count = int(audit["counts"]["completed"])
    assert metrics["profile_count"] == expected_count, (
        f"프로필 수 불일치: {metrics['profile_count']} != {expected_count}"
    )
    assert dict(metrics["splits"]) == audit["counts"]["split"], (
        f"분할 수 불일치: {dict(metrics['splits'])} != {audit['counts']['split']}"
    )
    assert dict(metrics["bands"]) == audit["counts"]["bands"], (
        f"길이 구간 불일치: {dict(metrics['bands'])} != {audit['counts']['bands']}"
    )
    assert round(float(np.mean(metrics["targets"])), 2) == float(audit["length"]["targetMean"])
    assert round(float(np.mean(metrics["actuals"])), 2) == float(audit["length"]["actualMean"])
    assert round(float(np.std(metrics["targets"])), 2) == float(audit["length"]["targetStd"])
    assert round(float(np.std(metrics["actuals"])), 2) == float(audit["length"]["actualStd"])
    assert sum(metrics["models"].values()) == expected_count


def style_axis(ax: mpl.axes.Axes, *, grid_axis: str = "y") -> None:
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)
    ax.grid(axis=grid_axis, color=GRID, linewidth=0.7, zorder=0)
    ax.set_axisbelow(True)
    ax.tick_params(length=0)


def add_figure_header(fig: mpl.figure.Figure, title: str, subtitle: str) -> None:
    fig.text(0.06, 0.955, title, fontsize=13, fontweight="bold", ha="left", va="top")
    fig.text(0.06, 0.905, subtitle, fontsize=8.5, color=MUTED, ha="left", va="top")


def add_source(fig: mpl.figure.Figure, audit: dict[str, Any]) -> None:
    generated = str(audit.get("generatedAt", ""))[:10]
    fig.text(
        0.06,
        0.018,
        f"자료: Expresso 합성 프로필 v4.5.2 최종 품질 감사 · 생성일 {generated}",
        fontsize=6.8,
        color=MUTED,
        ha="left",
        va="bottom",
    )


def add_bar_labels(ax: mpl.axes.Axes, bars: Any, total: int) -> None:
    for bar in bars:
        value = int(round(bar.get_height()))
        ax.text(
            bar.get_x() + bar.get_width() / 2,
            bar.get_height() + max(total * 0.018, 8),
            f"{value:,}\n({value / total:.1%})",
            ha="center",
            va="bottom",
            fontsize=8,
            color=INK,
        )


def figure_dataset_composition(
    audit: dict[str, Any], metrics: dict[str, Any]
) -> mpl.figure.Figure:
    fig, axes = plt.subplots(1, 2, figsize=(7.2, 3.35))
    fig.subplots_adjust(left=0.07, right=0.98, top=0.77, bottom=0.20, wspace=0.34)
    total = metrics["profile_count"]
    add_figure_header(
        fig,
        "합성 프로필 코퍼스 구성",
        f"생성 모델별 구성과 학습·검증·시험 분할 · 전체 n={total:,}",
    )

    model_order = ["Luna", "Qwen"]
    model_values = [metrics["models"][name] for name in model_order]
    bars = axes[0].bar(
        model_order,
        model_values,
        width=0.62,
        color=[BLUE, ORANGE],
        edgecolor=[BLUE_DARK, "#9A4E04"],
        linewidth=0.8,
        zorder=3,
    )
    axes[0].set_title("생성 모델")
    axes[0].set_ylabel("프로필 수")
    axes[0].set_ylim(0, max(model_values) * 1.22)
    axes[0].yaxis.set_major_locator(MaxNLocator(integer=True, nbins=5))
    style_axis(axes[0])
    add_bar_labels(axes[0], bars, total)

    split_order = ["train", "valid", "test"]
    split_labels = ["학습", "검증", "시험"]
    split_values = [metrics["splits"][name] for name in split_order]
    bars = axes[1].bar(
        split_labels,
        split_values,
        width=0.62,
        color=[BLUE_DARK, BLUE, BLUE_LIGHT],
        edgecolor=BLUE_DARK,
        linewidth=0.8,
        zorder=3,
    )
    axes[1].set_title("데이터 분할")
    axes[1].set_ylabel("프로필 수")
    axes[1].set_ylim(0, max(split_values) * 1.22)
    axes[1].yaxis.set_major_locator(MaxNLocator(integer=True, nbins=5))
    style_axis(axes[1])
    add_bar_labels(axes[1], bars, total)
    add_source(fig, audit)
    return fig


def figure_length_bands(audit: dict[str, Any], metrics: dict[str, Any]) -> mpl.figure.Figure:
    fig, ax = plt.subplots(figsize=(6.8, 4.0))
    fig.subplots_adjust(left=0.12, right=0.97, top=0.75, bottom=0.22)
    total = metrics["profile_count"]
    add_figure_header(
        fig,
        "프로필 평균 본문 길이 구간 분포",
        f"프로필별 목표 평균 길이에 따른 네 구간 · 전체 n={total:,}",
    )
    order = ["very_short", "moderately_short", "moderately_long", "very_long"]
    labels = ["매우 짧음", "적당히 짧음", "적당히 김", "매우 김"]
    values = [metrics["bands"][name] for name in order]
    colors = ["#D7E4EF", "#9DBCD5", "#5F8FB7", BLUE_DARK]
    bars = ax.bar(labels, values, width=0.64, color=colors, edgecolor=BLUE_DARK, linewidth=0.8, zorder=3)
    ax.set_ylabel("프로필 수")
    ax.set_ylim(0, max(values) * 1.23)
    ax.yaxis.set_major_locator(MaxNLocator(integer=True, nbins=6))
    style_axis(ax)
    add_bar_labels(ax, bars, total)
    add_source(fig, audit)
    return fig


def figure_target_vs_actual(
    audit: dict[str, Any], metrics: dict[str, Any]
) -> mpl.figure.Figure:
    fig, axes = plt.subplots(1, 2, figsize=(7.2, 3.75))
    fig.subplots_adjust(left=0.075, right=0.98, top=0.76, bottom=0.20, wspace=0.30)
    targets = metrics["targets"]
    actuals = metrics["actuals"]
    add_figure_header(
        fig,
        "목표 본문 길이와 실제 생성 길이 비교",
        "관측 단위는 프로필별 기록의 평균 본문 글자 수 · n=1,000",
    )

    bins = np.arange(0, max(float(targets.max()), float(actuals.max())) + 50, 50)
    axes[0].hist(
        targets,
        bins=bins,
        density=True,
        histtype="step",
        linewidth=1.8,
        color=BLUE_DARK,
        label=f"계획 (평균 {np.mean(targets):.2f})",
        zorder=3,
    )
    axes[0].hist(
        actuals,
        bins=bins,
        density=True,
        histtype="stepfilled",
        alpha=0.34,
        linewidth=1.0,
        color=ORANGE,
        edgecolor=ORANGE,
        label=f"실제 (평균 {np.mean(actuals):.2f})",
        zorder=2,
    )
    axes[0].axvline(np.mean(targets), color=BLUE_DARK, linewidth=1.0, linestyle="--")
    axes[0].axvline(np.mean(actuals), color=ORANGE, linewidth=1.0, linestyle=":")
    axes[0].set_title("길이 분포")
    axes[0].set_xlabel("평균 본문 길이 (자)")
    axes[0].set_ylabel("밀도")
    axes[0].legend(frameon=False, fontsize=7.5, loc="upper right")
    style_axis(axes[0])
    axes[0].yaxis.set_major_locator(MaxNLocator(nbins=5))
    axes[0].yaxis.set_major_formatter(FuncFormatter(lambda value, _: f"{value:.4f}"))

    low = min(float(targets.min()), float(actuals.min())) - 20
    high = max(float(targets.max()), float(actuals.max())) + 20
    axes[1].scatter(
        targets,
        actuals,
        s=11,
        alpha=0.32,
        color=BLUE,
        edgecolors="none",
        rasterized=True,
        zorder=2,
    )
    axes[1].plot([low, high], [low, high], color=INK, linewidth=1.1, linestyle="--", label="계획=실제")
    axes[1].set_xlim(low, high)
    axes[1].set_ylim(low, high)
    axes[1].set_aspect("equal", adjustable="box")
    axes[1].set_title("프로필 단위 일치도")
    axes[1].set_xlabel("계획 평균 길이 (자)")
    axes[1].set_ylabel("실제 평균 길이 (자)")
    axes[1].text(
        0.04,
        0.96,
        f"Pearson r = {metrics['pearson_r']:.3f}\nMAE = {metrics['mae']:.2f}자",
        transform=axes[1].transAxes,
        ha="left",
        va="top",
        fontsize=7.8,
        bbox={"facecolor": "white", "edgecolor": GRID, "boxstyle": "round,pad=0.35"},
    )
    style_axis(axes[1])
    axes[1].legend(frameon=False, fontsize=7.5, loc="lower right")
    add_source(fig, audit)
    return fig


def quality_failure_groups(audit: dict[str, Any]) -> list[tuple[str, int]]:
    length = audit["length"]
    content = audit["content"]
    diversity = audit["diversity"]
    leakage = audit["leakage"]
    return [
        ("길이 허용범위", int(length["profileToleranceFailures"])),
        ("길이 구간", int(length["profileBandFailures"])),
        ("프롬프트·레이아웃", int(content["promptVersionFailures"]) + int(content["layoutFailures"])),
        ("문체·근거", int(content["interviewStyleFailures"]) + int(content["verbatimEvidenceCopies"]) + int(content["evidenceAnchorFailures"])),
        ("문장·제목 반복", int(diversity["repeatedFinalSentences3Plus"]) + int(diversity["repeatedNonEducationTitles3Plus"])),
        ("합성 사실 반복", int(diversity["reusedSyntheticFacts3Plus"])),
        ("결과 반복", int(diversity["profilesWithRepeatedSyntheticOutcomes"])),
        ("분할 간 누출", sum(int(value) for value in leakage.values())),
    ]


def figure_diversity_quality(
    audit: dict[str, Any], metrics: dict[str, Any]
) -> mpl.figure.Figure:
    fig, axes = plt.subplots(1, 2, figsize=(7.2, 4.05), gridspec_kw={"width_ratios": [0.9, 1.2]})
    fig.subplots_adjust(left=0.095, right=0.98, top=0.75, bottom=0.20, wspace=0.48)
    diversity = audit["diversity"]
    event_count = int(diversity["syntheticEventCount"])
    unique_facts = int(diversity["uniqueSyntheticFacts"])
    unique_openings = int(diversity["uniqueSyntheticOpenings"])
    add_figure_header(
        fig,
        "합성 사건 다양성과 최종 품질 게이트",
        f"합성 사건 {event_count:,}건과 전체 프로필 {metrics['profile_count']:,}개의 최종 감사 결과",
    )

    labels = ["합성 사실\n고유 비율", "도입 문장\n고유 비율"]
    rates = [unique_facts / event_count * 100, unique_openings / event_count * 100]
    bars = axes[0].bar(
        labels,
        rates,
        width=0.58,
        color=[BLUE, BLUE_LIGHT],
        edgecolor=BLUE_DARK,
        linewidth=0.8,
        zorder=3,
    )
    axes[0].set_title("다양성")
    axes[0].set_ylabel("고유 비율 (%)")
    axes[0].set_ylim(0, 108)
    axes[0].set_yticks([0, 25, 50, 75, 100])
    for bar, rate, numerator in zip(bars, rates, [unique_facts, unique_openings], strict=True):
        axes[0].text(
            bar.get_x() + bar.get_width() / 2,
            bar.get_height() + 2.2,
            f"{rate:.2f}%\n({numerator:,}/{event_count:,})",
            ha="center",
            va="bottom",
            fontsize=7.6,
        )
    style_axis(axes[0])

    failures = quality_failure_groups(audit)
    failure_labels = [label for label, _ in failures][::-1]
    failure_values = [value for _, value in failures][::-1]
    y = np.arange(len(failure_labels))
    axes[1].hlines(y, 0, failure_values, color=BLUE_LIGHT, linewidth=2.0, zorder=2)
    axes[1].scatter(failure_values, y, s=30, color=BLUE_DARK, zorder=3)
    for ypos, value in zip(y, failure_values, strict=True):
        axes[1].text(value + 0.12, ypos, f"{value}", ha="left", va="center", fontsize=7.8)
    axes[1].set_yticks(y, failure_labels)
    axes[1].set_xlim(-0.1, 1.1)
    axes[1].set_xticks([0, 1])
    axes[1].set_xlabel("실패 건수 (0이 목표)")
    axes[1].set_title("품질 게이트 실패")
    axes[1].axvline(0, color=INK, linewidth=0.8, zorder=1)
    style_axis(axes[1], grid_axis="x")
    add_source(fig, audit)
    return fig


def export_figure(fig: mpl.figure.Figure, output_dir: Path, basename: str) -> list[Path]:
    output_paths: list[Path] = []
    for suffix in ("png", "pdf", "svg"):
        path = output_dir / f"{basename}.{suffix}"
        kwargs: dict[str, Any] = {"bbox_inches": "tight", "pad_inches": 0.08}
        if suffix == "png":
            kwargs["dpi"] = 600
        fig.savefig(path, **kwargs)
        output_paths.append(path)
    plt.close(fig)
    return output_paths


def write_metadata(
    output_dir: Path,
    audit_path: Path,
    audit: dict[str, Any],
    metrics: dict[str, Any],
    output_paths: list[Path],
) -> None:
    metadata = {
        "schemaVersion": 1,
        "source": {
            "auditPath": str(audit_path.resolve()),
            "auditSha256": hashlib.sha256(audit_path.read_bytes()).hexdigest(),
            "auditGeneratedAt": audit.get("generatedAt"),
            "profileCount": metrics["profile_count"],
        },
        "derivedMetrics": {
            "models": dict(metrics["models"]),
            "splits": dict(metrics["splits"]),
            "bands": dict(metrics["bands"]),
            "targetMean": round(float(np.mean(metrics["targets"])), 2),
            "actualMean": round(float(np.mean(metrics["actuals"])), 2),
            "targetStd": round(float(np.std(metrics["targets"])), 2),
            "actualStd": round(float(np.std(metrics["actuals"])), 2),
            "pearsonR": round(float(metrics["pearson_r"]), 6),
            "meanAbsoluteError": round(float(metrics["mae"]), 4),
            "medianAbsoluteError": round(float(metrics["median_abs_error"]), 4),
        },
        "outputs": [
            {
                "path": path.name,
                "bytes": path.stat().st_size,
                "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
            }
            for path in output_paths
        ],
    }
    with (output_dir / "figure-metadata.json").open("w", encoding="utf-8") as handle:
        json.dump(metadata, handle, ensure_ascii=False, indent=2)
        handle.write("\n")


def main() -> None:
    args = parse_args()
    run_root = args.run_root.resolve()
    audit_path = (args.audit or run_root / "quality-audit-v4.5.2-final-1000.json").resolve()
    output_dir = (args.output_dir or run_root / "figures" / "paper-v1").resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    configure_style(args.font)
    audit = load_json(audit_path)
    profiles = read_profiles(run_root)
    metrics = collect_metrics(profiles)
    validate_metrics(audit, metrics)

    figures = [
        figure_dataset_composition(audit, metrics),
        figure_length_bands(audit, metrics),
        figure_target_vs_actual(audit, metrics),
        figure_diversity_quality(audit, metrics),
    ]
    output_paths: list[Path] = []
    for basename, figure in zip(FIGURE_BASENAMES, figures, strict=True):
        output_paths.extend(export_figure(figure, output_dir, basename))
    write_metadata(output_dir, audit_path, audit, metrics, output_paths)

    print(f"검증된 프로필: {metrics['profile_count']:,}개")
    print(f"출력 디렉터리: {output_dir}")
    for path in output_paths:
        print(path.name)


if __name__ == "__main__":
    main()
