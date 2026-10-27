"""저장된 LLM 적합도 실험에서 Expresso HTML 리포트와 벡터 그림을 재생성합니다."""
from __future__ import annotations

import hashlib
import html
import json
import re
import sys
import warnings
from collections import Counter, defaultdict
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
from matplotlib.colors import LinearSegmentedColormap

from llm_suitability_train import ranking_metrics

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "var/ml-data/experiments/match-llm-labels-1000-v1"
MODELS = DATA / "models-llm-v1"
ASSETS = ROOT / "docs/assets/p5-training-results-2026-09-06"
OUTPUT = ROOT / "docs/p5-model-training-results-2026-09-06.html"
TF, E5, CE = "char_tfidf", "expresso-e5-mlp-llm-v1", "expresso-bge-cross-encoder-llm-v1"
NAMES = {TF: "Char TF-IDF", E5: "E5 + MLP", CE: "Cross-Encoder", "word_tfidf": "Word TF-IDF", "bm25": "BM25", "frozen-e5-cosine": "E5 cosine", "bge-reranker-v2-m3-zero-shot": "BGE zero-shot"}
COLORS = {TF: "#93a2ba", E5: "#35455f", CE: "#9a4030"}
INK, GRID = "#16223a", "#e2e9f4"
plt.rcParams.update({"font.family": "DejaVu Sans", "font.size": 10, "axes.labelcolor": INK, "text.color": INK, "xtick.color": "#5a6b87", "ytick.color": "#5a6b87", "axes.edgecolor": GRID, "axes.spines.top": False, "axes.spines.right": False, "axes.titleweight": "normal", "svg.fonttype": "path", "svg.hashsalt": "expresso-p5-2026-09-06", "figure.facecolor": "white", "axes.facecolor": "white", "savefig.facecolor": "white"})


def load(path):
    return json.loads(path.read_text(encoding="utf-8"))


def rows(path):
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def save_json(path, obj):
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def collect():
    e5, ce = load(MODELS / "e5-mlp/metrics.json"), load(MODELS / "cross-encoder/metrics.json")
    assert e5["dataset"]["hashes"] == ce["dataset"]["hashes"]
    paths = {"profiles": DATA / "data/profiles.jsonl", "jobs": DATA / "data/jobs.jsonl", "candidates": DATA / "data/candidate-manifest.jsonl", "labels": DATA / "labels-final/suitability-labels.jsonl"}
    for key, path in paths.items():
        assert hashlib.sha256(path.read_bytes()).hexdigest() == e5["dataset"]["hashes"][key], key
    combined = rows(MODELS / "e5-mlp/scores.jsonl") + rows(MODELS / "cross-encoder/scores.jsonl")
    grouped = defaultdict(list)
    for row in combined:
        grouped[(row["model"], row["split"])].append(row)
    metrics = {**e5["models"], **ce["models"]}
    rounding_differences = []
    for model in metrics:
        for split in ("test", "valid"):
            sample = grouped[(model, split)]
            assert len({(r["profileId"], r["jobId"]) for r in sample}) == len(sample)
            recalculated = ranking_metrics(sample)
            for key in ("mae", "rmse", "ndcgAt10", "mapAt10", "pairwiseAccuracy", "spearman"):
                difference = abs(recalculated[key] - metrics[model][split][key])
                # 점수 JSONL의 소수 여섯 자리 저장으로 BM25의 미세한 순위 동점이 생깁니다.
                tolerance = 5e-5 if key == "spearman" else 1e-5
                assert difference < tolerance, (model, split, key, difference)
                if difference > 1e-5:
                    rounding_differences.append({"model":model,"split":split,"metric":key,"absoluteDifference":difference})
    profiles, jobs, labels = rows(paths["profiles"]), rows(paths["jobs"]), rows(paths["labels"])
    splits = ("train", "valid", "test")
    for data, field in ((profiles, "profileId"), (jobs, "jobId")):
        ids = {s: {r[field] for r in data if r["split"] == s} for s in splits}
        assert all(not (ids[a] & ids[b]) for i, a in enumerate(splits) for b in splits[i+1:])
    test_ids = sorted({r["profileId"] for r in grouped[(E5, "test")]})
    per_profile = {}
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        for m in (TF, E5, CE):
            per_profile[m] = [ranking_metrics([r for r in grouped[(m, "test")] if r["profileId"] == p]) for p in test_ids]
    indices = np.random.default_rng(42).integers(0, len(test_ids), (20000, len(test_ids)))
    bootstrap = {}
    for m, b in ((E5, TF), (CE, TF), (CE, E5)):
        for metric in ("ndcgAt10", "mae"):
            delta = np.array([v[metric] for v in per_profile[m]]) - np.array([v[metric] for v in per_profile[b]])
            means = delta[indices].mean(axis=1)
            bootstrap[f"{m}__{b}__{metric}"] = {"delta": float(delta.mean()), "lower": float(np.quantile(means, .025)), "upper": float(np.quantile(means, .975))}
    segments = []
    for m in (TF, E5, CE):
        for bucket in ("role", "adjacent", "random"):
            sample = [r for r in grouped[(m, "test")] if r["candidateBucket"] == bucket]
            segments.append({"model": m, "bucket": bucket, "pairs": len(sample), "mae": float(np.mean([abs(r["prediction"]-r["target"]) for r in sample]))})
    analysis = {"models": metrics, "labelSources": dict(Counter(r["labelSource"] for r in labels)), "profileSplits": dict(Counter(r["split"] for r in profiles)), "jobSplits": dict(Counter(r["split"] for r in jobs)), "segments": segments, "bootstrap": {"replicates": 20000, "seed": 42, "unit": "test profile", "profiles": 70, "comparisons": bootstrap}, "hashes": e5["dataset"]["hashes"], "validation": "Saved six-decimal score rows reproduce evaluation metrics within 1e-5, except Spearman within 5e-5 due to rounded ties; original full-precision metrics remain authoritative. Profile and job IDs are disjoint between splits.", "roundingDifferences":rounding_differences}
    save_json(ASSETS / "analysis.json", analysis)
    return e5, ce, metrics, grouped, labels, analysis


def export(fig, name):
    svg_path = ASSETS / f"{name}.svg"
    fig.savefig(svg_path, bbox_inches="tight", metadata={"Date": None})
    svg_path.write_text('\n'.join(line.rstrip() for line in svg_path.read_text(encoding='utf-8').splitlines())+'\n',encoding='utf-8')
    fig.savefig(ASSETS / f"{name}.png", bbox_inches="tight", dpi=300)
    plt.close(fig)


def figures(e5, ce, metrics, grouped, labels, analysis):
    fig, axs = plt.subplots(1, 2, figsize=(10, 3.6), layout="constrained")
    vals = [r["matchScore"] for r in labels]
    counts, bins, bars = axs[0].hist(vals, bins=[0,20,40,60,80,95,101], color=COLORS[E5], edgecolor="white", rwidth=.94)
    for n, p in zip(counts, bars):
        axs[0].text(p.get_x()+p.get_width()/2,n+70,f"{int(n):,}",ha="center",fontsize=8)
    axs[0].set(xlabel="LLM suitability label (0–100)", ylabel="Pairs", ylim=(0,4200), title="A   Label distribution · 10,000 pairs")
    sources = analysis["labelSources"]
    axs[1].barh([0,1],[sources.get("gpt-5.6-luna",0),sources.get("claude-code-sonnet-5",0)],color=[COLORS[E5],COLORS[TF]],height=.5)
    axs[1].set_yticks([0,1], ["Luna", "Sonnet"])
    axs[1].set(xlim=(0,10600), xlabel="Final labels",title="B   Label-generation models")
    axs[1].invert_yaxis()
    for i,n in enumerate([sources.get("gpt-5.6-luna",0),sources.get("claude-code-sonnet-5",0)]):axs[1].text(n+120,i,f"{n:,}",va="center")
    export(fig,"01-dataset")

    fig, axs = plt.subplots(1,2,figsize=(10,4),layout="constrained")
    fields=[("ndcgAt10","NDCG@10"),("pairwiseAccuracy","Pairwise accuracy"),("mapAt10","MAP@10")]
    for i,m in enumerate((TF,E5,CE)):
        vs=[metrics[m]["test"][k] for k,_ in fields]
        bars=axs[0].bar(np.arange(3)+(i-1)*.23,vs,width=.21,label=NAMES[m],color=COLORS[m])
        for b,v in zip(bars,vs):axs[0].text(b.get_x()+b.get_width()/2,v+.017,f"{v:.3f}",ha="center",fontsize=8)
    axs[0].set_xticks(range(3),[v for _,v in fields]);axs[0].set(ylim=(0,1.1),ylabel="Score · higher is better",title="A   Ranking quality")
    axs[0].legend(loc="upper left",bbox_to_anchor=(0,-.16),ncol=3,frameon=False,fontsize=8)
    order=[TF,E5,CE]
    bars=axs[1].bar(range(3),[metrics[m]["test"]["mae"] for m in order],color=[COLORS[m] for m in order],width=.55)
    for b,m in zip(bars,order):axs[1].text(b.get_x()+b.get_width()/2,b.get_height()+.35,f"{b.get_height():.2f}",ha="center")
    axs[1].set_xticks(range(3),[NAMES[m] for m in order]);axs[1].set(ylim=(0,18),ylabel="MAE · points, lower is better",title="B   Score error")
    for ax in axs:ax.grid(axis="y",color=GRID,linewidth=.5);ax.set_axisbelow(True)
    export(fig,"02-performance")

    fig,axs=plt.subplots(1,3,figsize=(10,3.55),layout="constrained")
    for ax,m in zip(axs,(TF,E5,CE)):
        sample=grouped[(m,"test")]
        ax.scatter([r["target"] for r in sample],[r["prediction"] for r in sample],s=9,alpha=.27,color=COLORS[m],rasterized=False,edgecolors="none")
        ax.plot([0,100],[0,100],color=INK,lw=.9,ls="--")
        ax.set(xlim=(-2,102),ylim=(-2,102),xlabel="LLM label",title=NAMES[m],aspect="equal")
        ax.set_xticks([0,50,100]);ax.set_yticks([0,50,100])
    axs[0].set_ylabel("Predicted suitability")
    export(fig,"03-prediction-scatter")

    fig,axs=plt.subplots(1,2,figsize=(10,3.65),layout="constrained")
    for m,ls in zip((TF,E5,CE),(":","--","-")):
        errors=np.sort([abs(r["prediction"]-r["target"]) for r in grouped[(m,"test")]])
        axs[0].step(errors,np.arange(1,len(errors)+1)/len(errors),where="post",color=COLORS[m],ls=ls,label=NAMES[m],lw=1.8)
    axs[0].set(xlim=(0,60),ylim=(0,1.02),xlabel="Absolute error (points)",ylabel="Share of test pairs",title="A   Cumulative error distribution")
    axs[0].legend(frameon=False,loc="lower right",fontsize=8)
    matrix=np.array([[next(r["mae"] for r in analysis["segments"] if r["model"]==m and r["bucket"]==b) for b in ("role","adjacent","random")] for m in (TF,E5,CE)])
    axs[1].imshow(matrix,cmap=LinearSegmentedColormap.from_list("ex",["#f7fafe",INK]),vmin=0,vmax=20,aspect="auto")
    axs[1].set_xticks(range(3),["Same role\nn=350","Adjacent\nn=210","Random\nn=140"])
    axs[1].set_yticks(range(3),[NAMES[m] for m in (TF,E5,CE)]);axs[1].set_title("B   MAE by candidate group")
    for i in range(3):
        for j in range(3):axs[1].text(j,i,f"{matrix[i,j]:.2f}",ha="center",va="center",color="white" if matrix[i,j]>10 else INK)
    export(fig,"04-errors")

    fig,axs=plt.subplots(1,2,figsize=(10,3.7),layout="constrained")
    for ax,field,title in zip(axs,("ndcgAt10","mae"),("A   NDCG@10 difference","B   MAE difference (points)")):
        for y,m,b in [(2,E5,TF),(1,CE,TF),(0,CE,E5)]:
            ci=analysis["bootstrap"]["comparisons"][f"{m}__{b}__{field}"]
            ax.errorbar(ci["delta"],y,xerr=[[ci["delta"]-ci["lower"]],[ci["upper"]-ci["delta"]]],fmt="o",color=COLORS[m],capsize=4,lw=1.5)
            ax.annotate(f"{ci['delta']:+.3f}",(ci["delta"],y),xytext=(0,12),textcoords="offset points",ha="center",fontsize=9)
        ax.axvline(0,color=INK,ls="--",lw=.8);ax.set_yticks([2,1,0],["MLP − TF-IDF","Cross − TF-IDF","Cross − MLP"]);ax.set(ylim=(-.5,2.6),title=title)
    axs[0].set_xlabel("Positive favors the first model");axs[1].set_xlabel("Negative favors the first model")
    export(fig,"05-bootstrap")

    fig,ax=plt.subplots(figsize=(10,3.4),layout="constrained")
    hist=e5["runtime"]["e5"]["learning"]["history"]
    ax.plot([h["epoch"] for h in hist],[h["validMae"] for h in hist],color=COLORS[E5],lw=1.6)
    best=e5["runtime"]["e5"]["learning"]["bestEpoch"]
    v=next(h["validMae"] for h in hist if h["epoch"]==best)
    ax.scatter([best],[v],color=COLORS[CE],s=45,zorder=3)
    ax.annotate(f"Selected epoch {best}: MAE {v:.2f}",(best,v),xytext=(-190,48),textcoords="offset points",arrowprops={"arrowstyle":"-","color":INK},color=INK)
    ax.set(xlabel="Epoch",ylabel="Validation MAE (points)",title="E5 + MLP · validation history",xlim=(1,len(hist)))
    ax.grid(axis="y",color=GRID,linewidth=.5)
    export(fig,"06-learning")


def figure(name, title, caption):
    svg=(ASSETS/f"{name}.svg").read_text(encoding="utf-8")
    svg=svg[svg.index("<svg"):]
    svg=re.sub(r'(<svg[^>]*?)width="[^"]*"\s+height="[^"]*"',r'\1',svg,count=1)
    svg=svg.replace('<svg ',f'<svg role="img" aria-label="{html.escape(title)}" ',1)
    for identity in set(re.findall(r'id="([^"]+)"',svg)):
        svg=svg.replace(f'id="{identity}"',f'id="{name}-{identity}"').replace(f'#{identity}"',f'#{name}-{identity}"').replace(f'#{identity})',f'#{name}-{identity})')
    return f'<figure class="fig"><h3>{title}</h3><div class="plot-scroll">{svg}</div><figcaption>{caption} <a href="assets/p5-training-results-2026-09-06/{name}.svg" download>SVG</a> · <a href="assets/p5-training-results-2026-09-06/{name}.png" download>PNG</a></figcaption></figure>'


def table(headers, data, caption=""):
    return '<div class="table-wrap"><table><thead><tr>'+''.join(f'<th scope="col">{h}</th>' for h in headers)+'</tr></thead><tbody>'+''.join('<tr>'+''.join(f'<td>{c}</td>' for c in row)+'</tr>' for row in data)+'</tbody>'+ (f'<caption>{caption}</caption>' if caption else '')+'</table></div>'


def section(number, identity, title, body):
    return f'<section class="sec" id="{identity}"><div class="sec-head"><span class="num">{number:02d}</span><h2>{title}</h2></div>{body}</section>'


def build_html(e5, ce, metrics, analysis):
    mt={m:metrics[m]['test'] for m in metrics}
    reduction=(1-mt[CE]['mae']/mt[TF]['mae'])*100
    source_base='../var/ml-data/experiments/match-llm-labels-1000-v1/models-llm-v1/'
    source='<details class="source"><summary>평가 원본과 재계산 결과</summary><p><a href="'+source_base+'e5-mlp/metrics.json">E5+MLP · 기준선 평가 원본</a> · <a href="'+source_base+'cross-encoder/metrics.json">Cross-Encoder 평가 원본</a> · <a href="assets/p5-training-results-2026-09-06/analysis.json">재계산 · 구간 추정 데이터</a></p></details>'
    sections=[]
    sections.append(section(1,'overview','개요',f'''
      <div class="box key"><div class="t">핵심 결과</div><p><strong>공고 적합도 판단을 학습한 두 모델이 문자 TF-IDF와 임베딩 유사도 기준선을 앞섰습니다.</strong> Cross-Encoder의 평균 점수 오차는 문자 TF-IDF 대비 {reduction:.1f}% 줄었고, E5+MLP도 비슷한 수준에 도달했습니다.</p></div>
      <p>Expresso는 사용자가 쌓은 경력 기록을 채용 공고와 연결하는 서비스입니다. 이 모델은 <strong>현재 기록에 있는 경험이 공고의 업무와 자격 요건을 얼마나 뒷받침하는지</strong> 0–100점으로 예측합니다. 사용자가 어떤 공고부터 검토하면 좋을지 판단하도록 돕는 점수입니다.</p>
      <p>공고와 프로필의 단어가 비슷한지만 비교하면 직접 수행한 경험과 단순한 언급을 구분하기 어렵습니다. 매 조합을 대형 언어 모델(LLM)로 평가하는 방식은 사용자와 공고가 늘수록 호출 비용이 커집니다. 이번 개발의 목적은 <strong>LLM의 평가 기준을 작은 학습 모델에 옮겨 반복 추론 비용을 낮추는 것</strong>입니다.</p>
      <div class="stats"><div class="stat"><div class="k">평균 오차 감소 · Cross-Encoder</div><div class="v">{reduction:.1f}%</div><div class="d">문자 TF-IDF 14.91 → 10.51점</div></div><div class="stat"><div class="k">공고 간 순서 일치 · E5+MLP</div><div class="v">80.3%</div><div class="d">문자 TF-IDF 63.3% 대비 +16.9%p</div></div><div class="stat"><div class="k">학습·평가에 사용한 라벨</div><div class="v">10,000</div><div class="d">합성 프로필 1,000명 × 공고 10개</div></div></div>
      <p>현 단계의 선택은 E5+MLP를 저비용 기본 모델 후보로 두고 Cross-Encoder를 상위 공고 재정렬 후보로 유지하는 것입니다. 아래 결과는 LLM이 만든 적합도 라벨을 얼마나 잘 재현하는지 측정한 값이며, 실제 사용자의 합격률을 뜻하지 않습니다.</p>{source}
    '''))
    # 저장소 시각 자료의 5단계 파이프라인을 복사해 실제 실험 단계로 치환합니다.
    visuals=(ROOT/'docs/templates/expresso-visuals.html').read_text(encoding='utf-8')
    start=visuals.index('<!-- 파이프라인 -->')
    flow=re.search(r'<svg[\s\S]*?</svg>',visuals[start:]).group()
    for old,new in [('추출 파이프라인 5단계','데이터에서 학습과 평가까지의 5단계'),('수집','경력 재료'),('공고 · 기록','YP2021 · AI Hub'),('정규화','프로필 생성'),('스키마 정리','Luna · Qwen'),('03 · NOW','03'),('추출','적합도 라벨'),('역량 매칭','Luna · Sonnet'),('검증','모델 학습'),('근거 확인','MLP · Cross'),('배포','성능 평가'),('공개 주소','TF-IDF와 비교')]:flow=flow.replace(old,new)
    sections.append(section(2,'process','전체 프로세스',f'''
      <p>학습은 <strong>현실적인 합성 프로필 만들기 → 공고와 짝짓기 → LLM 평가 → 작은 모델 학습 → 기준선 비교</strong> 순서로 진행했습니다. 프로필을 쓰는 LLM과 적합도를 평가하는 LLM은 서로 다른 역할을 맡습니다.</p>
      <figure class="fig"><div class="plot-scroll">{flow}</div><figcaption>프로필 생성에는 Luna와 Qwen을, 최종 적합도 라벨에는 Luna와 Sonnet을 사용했습니다. 학습된 모델은 텍스트 입력에서 점수를 직접 예측합니다.</figcaption></figure>
      <ol class="steps"><li><span class="t">학습용 사람과 경험의 구성</span><span class="d">청년패널의 경력 분포와 면접 답변을 재료로, 제목·기본 프로퍼티·본문으로 이루어진 합성 기록을 생성합니다.</span></li><li><span class="t">공고와 프로필의 조합</span><span class="d">각 프로필에 같은 직무 5개, 인접 직무 3개, 무작위 공고 2개를 배정합니다.</span></li><li><span class="t">동일한 루브릭으로 점수 생성</span><span class="d">LLM이 공고별 요구사항과 기록의 근거를 판정하고, 고정된 루브릭으로 단일 점수를 계산합니다.</span></li><li><span class="t">학습과 최종 평가</span><span class="d">학습용 자료로 모델을 맞추고 검증용 자료로 체크포인트를 고릅니다. 분리해 둔 test 자료로 마지막 성능을 비교합니다.</span></li></ol>
    '''))
    sections.append(section(3,'data','합성 데이터 구축 과정',f'''
      <p>이번 학습의 입력은 <strong>합성 프로필 1,000개와 고유 공고 2,886개에서 구성한 10,000쌍</strong>입니다. 합성 프로필은 Expresso의 실제 기록 방식처럼 본문에 주요 경험이 들어가고, 프로퍼티는 기본 정보만 담도록 설계했습니다. 이 리포트에서는 모델 학습에 실제 투입된 데이터 스냅샷을 기준으로 집계했습니다.</p>
      {table(['자료','역할'],[['청년패널조사 YP2021','교육·취업·이직·훈련 등의 경력 구조와 분포를 설계하는 재료입니다.'],['AI Hub 채용면접 인터뷰 71592','경험 서술의 뼈대로 사용합니다. 세부 활동은 그럴듯한 합성 내용으로 확장할 수 있습니다.'],['Luna · Qwen','경력 재료를 제목·기본 프로퍼티·본문으로 구성된 합성 프로필로 작성합니다.'],['로컬 JTH jobs.csv','직무·경력·기술·도구·학력 등 구조화된 채용 공고의 원천입니다.']])}
      <p>최종 라벨의 모델 기록은 Luna 9,260건, Sonnet 740건입니다. 두 모델은 같은 <code>job-profile-fit-v1</code> 루브릭을 사용했습니다. 프로필 생성 모델과 라벨 생성 모델의 수량은 서로 다른 집계입니다.</p>
      {figure('01-dataset','라벨 점수와 생성 모델 분포','전체 라벨 10,000건. 낮은 점수의 공고 조합이 많습니다. 60점 이상은 410건(4.1%)으로, 다음 보강에서는 직접 근거가 풍부한 적합 조합을 늘릴 필요가 있습니다.')}
      <p>루브릭은 공고 요구사항을 최대 8개로 나누고, 각 요구에 대한 근거를 <strong>강함 100 / 충분함 75 / 부분 충족 50 / 전이 가능 25 / 근거 없음 0</strong>으로 판단합니다. 필수 자격 45%, 주요 업무 40%, 우대 사항 15%를 적용하며, 공고에 없는 축의 비중은 나머지 축에 재분배합니다.</p>
      <p>요구사항 해석과 근거 판정은 LLM이 수행하고, 최종 산술은 코드가 일관되게 처리합니다. 기록이 부족한 프로필도 유지하며, 확인되지 않은 요구사항의 점수만 낮아집니다.</p>
      <details class="source"><summary>데이터 출처와 루브릭</summary><p><a href="architecture/synthetic-profile-generation-v4.md">합성 프로필 설계 문서</a> · <a href="architecture/llm-suitability-labeling-v1.md">적합도 루브릭</a> · <a href="../var/ml-data/experiments/match-llm-labels-1000-v1/labels-final/audit.json">최종 라벨 감사 결과</a></p><p>문서의 최초 설계 교사는 Sonnet이며, 실제 완료된 라벨의 모델 구성은 위 분포와 같습니다. 자동 감사는 누락·중복·근거 ID·산술의 정합성 검사입니다.</p></details>
    '''))
    sections.append(section(4,'training','모델 학습 파이프라인',f'''
      <p><strong>프로필 ID와 공고 ID를 학습·검증·test 사이에 중복시키지 않았습니다.</strong> 모델이 처음 보는 사람과 공고를 평가하는 상황에서 비교하기 위한 분할입니다. 표의 공고 수는 각 분할에 등장하는 고유 공고의 수입니다.</p>
      {table(['분할','프로필','공고','평가 조합','용도'],[['Train','840','2,366','8,400','가중치와 기준선 점수 보정 학습'],['Valid','90','292','900','최적 epoch 선택'],['Test','70','228','700','최종 성능 비교']])}
      <p>입력에는 경력 연차와 기록의 제목·프로퍼티·본문을 사용했습니다. 생성 모델, 출처 연결, 내부 ID, split은 모델의 텍스트 특징에서 제외했습니다. 이번 공고 입력은 JTH의 구조화 필드이며, 원문 전체와 별도의 LLM 분해 결과를 함께 넣는 서비스 설계는 후속 단계입니다.</p>
      <p>문자 TF-IDF·단어 TF-IDF·BM25·E5 cosine·BGE zero-shot을 비교 기준으로 사용했습니다. 유사도 값을 0–100으로 바꾸는 선형 보정은 train 라벨에서만 구했습니다. 이 실험의 TF-IDF 어휘·IDF는 제공된 전체 공고 텍스트 집합에서 계산하므로, 새 공고만 별도로 유입되는 완전한 운영 재현 실험과는 차이가 있습니다.</p>
      {table(['학습 설정','E5+MLP','BGE Cross-Encoder'],[['기반 모델','multilingual-e5-base · 동결','bge-reranker-v2-m3'],['입력 길이','텍스트별 최대 512토큰','공고·선택 기록 합계 최대 1,536토큰'],['학습 대상','MLP 헤드','마지막 encoder 4개 층 + classifier'],['목적 함수','점수 회귀 + 0.1 × 순서 학습 손실','점수 회귀'],['학습률','0.0005','0.00002'],['최종 선택','47 epoch 실행 중 valid 최적 39','3 epoch 실행 중 valid 최적 3'],['실행 장비','RTX 5080 · CUDA 12.8','RTX 5080 · CUDA 12.8']])}
      <p>E5+MLP의 순서 학습은 같은 프로필의 공고들 중 LLM 점수 차이가 5점 이상인 쌍을 사용했습니다. 이번에는 점수 라벨에서 상대 순서를 유도했으며, LLM에게 두 공고를 직접 비교시켜 만든 별도의 pairwise 라벨은 후속 실험으로 남아 있습니다.</p>
      {figure('06-learning','E5+MLP 검증 오차 추이','검증 MAE가 가장 낮은 39 epoch를 선택했습니다. 선택 이후 8 epoch 동안 개선이 없어 조기 종료했습니다. 그래프의 세로축은 학습 중 변화를 보기 위한 확대 범위입니다.')}
      <p>Cross-Encoder의 검증 MAE는 1 epoch 10.75점, 2 epoch 10.60점, 3 epoch 10.35점으로 감소했습니다. 세 시점만 존재하므로 학습 추이는 이 수치로 제시합니다.</p>
    '''))
    sections.append(section(5,'architectures','모델 아키텍처','''
      <p>두 모델은 같은 점수를 목표로 하지만 텍스트를 비교하는 방법이 다릅니다. <strong>E5+MLP는 문서를 각각 숫자 벡터로 압축한 뒤 비교하고, Cross-Encoder는 공고와 기록을 함께 읽으며 비교합니다.</strong></p>
      <div class="adr"><div class="h"><span class="id">MODEL A</span><span class="ttl">E5+MLP · 벡터를 이용한 점수 예측</span></div><div class="row"><div class="k">입력</div><div class="v">프로필 텍스트와 공고 텍스트를 E5가 각각 768차원 임베딩으로 변환합니다.</div></div><div class="row"><div class="k">비교</div><div class="v">두 벡터, 두 벡터의 절대 차이, 원소별 곱을 합쳐 3,072차원의 비교 특징을 만듭니다.</div></div><div class="row"><div class="k">학습</div><div class="v">3,072 → 256 → 1의 MLP가 비교 특징을 점수로 바꿉니다. 마지막 sigmoid × 100으로 출력 범위를 맞춥니다.</div></div><div class="row"><div class="k">활용</div><div class="v">공고 임베딩을 미리 저장하고 프로필이 바뀔 때 프로필 임베딩을 갱신할 수 있습니다. 대량 후보의 반복 평가에 적합한 구조입니다.</div></div></div>
      <div class="adr"><div class="h"><span class="id">MODEL B</span><span class="ttl">BGE Cross-Encoder · 텍스트를 함께 읽는 점수 예측</span></div><div class="row"><div class="k">선택</div><div class="v">E5 cosine으로 공고와 가까운 프로필 기록을 최대 8개 선택합니다.</div></div><div class="row"><div class="k">비교</div><div class="v">공고와 선택 기록을 하나의 입력 쌍으로 BGE에 넣습니다. 두 텍스트의 토큰 사이 관계를 직접 계산합니다.</div></div><div class="row"><div class="k">학습</div><div class="v">전체 약 5.68억 파라미터 중 마지막 4개 층과 분류 헤드, 약 5,144만 파라미터를 학습했습니다. sigmoid × 100으로 점수를 출력합니다.</div></div><div class="row"><div class="k">활용</div><div class="v">공고가 달라지면 텍스트 쌍을 다시 계산합니다. 적은 수의 상위 후보를 정밀하게 평가하는 용도로 검토합니다.</div></div></div>
      <p>Cross-Encoder는 한 번에 더 많은 기록을 보지만 쌍마다 큰 모델을 실행합니다. 두 모델의 우열은 평가 품질과 실제 처리 지연을 함께 측정해 결정해야 합니다.</p>
    '''))
    sections.append(section(6,'usage','모델 활용 방안','''
      <p><strong>E5+MLP를 기본 점수 모델 후보로 두고, Cross-Encoder의 추가 재정렬 효과를 측정하는 방향</strong>을 권합니다. 이번 실험은 각 모델의 독립 평가이며, 두 모델을 연결한 전체 서비스 성능을 측정한 것은 아닙니다.</p>
      <ol class="steps"><li><span class="t">신규 공고 분석 · 공고당 한 번</span><span class="d">로컬 Qwen 등 LLM으로 공고의 필수·우대 요구사항을 정리하고 저장합니다. 원문과 분석 결과의 입력 형식은 후속 학습에서 통일합니다.</span></li><li><span class="t">후보 검색과 기본 점수</span><span class="d">저장된 E5 임베딩으로 후보를 찾고 E5+MLP로 적합도를 계산합니다. 프로필 수정 시 관련 임베딩과 점수를 갱신합니다.</span></li><li><span class="t">상위 후보 재정렬 · 실험 대상</span><span class="d">Top-K 후보에 Cross-Encoder를 적용해 순위 개선과 지연 증가를 비교합니다. K는 실측 결과로 결정합니다.</span></li><li><span class="t">단일 점수 제공</span><span class="d">사용자에게는 0–100 적합도 하나를 보여줍니다. 두 모델 점수를 평균하거나 혼합하는 방식은 아직 검증하지 않았으므로, 최종 점수 선택·보정 방식도 함께 실험합니다.</span></li></ol>
      <p>이 구조에서 LLM 호출은 공고 분석과 학습 데이터 제작에 집중됩니다. 사용자가 공고를 확인할 때마다 LLM으로 적합도를 생성할 필요가 없습니다.</p>
    '''))
    metric_rows=[]
    for m in ('word_tfidf','bm25',TF,'frozen-e5-cosine','bge-reranker-v2-m3-zero-shot',E5,CE):
        v=mt[m]
        metric_rows.append([NAMES[m]]+[f"{v[k]:.4f}" for k in ('ndcgAt10','mapAt10','mrrAt10','pairwiseAccuracy')]+[f"{v['mae']:.2f}",f"{v['rmse']:.2f}",f"{v['spearman']:.4f}"])
    seg=analysis['segments']
    ce_deltas=[next(r['mae'] for r in seg if r['model']==TF and r['bucket']==b)-next(r['mae'] for r in seg if r['model']==CE and r['bucket']==b) for b in ('role','adjacent','random')]
    sections.append(section(7,'results','현재 모델 성능 지표',f'''
      <p><strong>두 학습 모델 모두 문자 TF-IDF와 학습 전 E5·BGE보다 높은 결과를 냈습니다.</strong> 단순한 텍스트 유사도보다, 공고 적합도 루브릭을 학습시키는 과정에서 얻는 이득이 컸습니다. 아래 비교는 같은 test 70명·700쌍에 대한 결과입니다.</p>
      {table(['지표','읽는 방법','이번 계산 대상'],[['MAE ↓','예측 점수와 LLM 라벨의 평균 절대 차이입니다. 10.51이면 평균 10.51점 차이입니다.','700쌍'],['NDCG@10 ↑','높은 적합도 공고를 앞에 배치하는 정도입니다. 1은 이상적인 정렬이며, 정확도 백분율이 아닙니다.','70명 · 각 후보 10개 · 선형 gain'],['Pairwise accuracy ↑','한 사람의 공고 두 개 중 더 적합한 쪽의 순서를 맞힌 비율입니다.','동점 라벨 제외 2,714개 비교'],['MAP@10 · MRR@10 ↑','60점 이상인 공고가 얼마나 앞에 놓이는지 봅니다. MRR은 첫 적합 공고의 위치를 봅니다.','적합 공고가 있는 test 13명'],['Spearman ↑','전체 점수의 순서가 LLM 라벨 순서와 얼마나 일치하는지 봅니다.','700쌍']])}
      {figure('02-performance','모델별 순위 품질과 점수 오차','선택한 세 모델의 test 비교. 모든 막대의 축은 0에서 시작합니다. MAP은 적합 공고가 있는 13명에서 계산되며, 다른 지표와 분모가 다릅니다.')}
      <p>E5+MLP는 문자 TF-IDF 대비 NDCG@10이 <strong>0.8799 → 0.9555</strong>, 공고 간 순서 일치율이 <strong>63.34% → 80.25%</strong>로 높아졌습니다. Cross-Encoder는 NDCG@10 <strong>0.9608</strong>, MAP@10 <strong>0.7464</strong>를 기록했습니다. 평균 점수 오차는 각각 10.54점과 10.51점으로 가깝습니다.</p>
      {table(['모델','NDCG ↑','MAP ↑','MRR ↑','Pairwise ↑','MAE ↓','RMSE ↓','Spearman ↑'],metric_rows,'Test 700쌍. 전체 후보가 10개이므로 Recall@10은 항상 1이 되어 비교 지표에서 제외했습니다.')}
      <p>아래 산점도에서 점 하나는 공고와 프로필 한 쌍입니다. 점선에 가까울수록 LLM 라벨과 예측값이 같습니다. 문자 TF-IDF 점수는 좁은 범위에 모이는 반면, 학습 모델은 라벨의 높낮이에 따라 더 넓게 변합니다. 높은 라벨 구간의 점은 드물어 별도 데이터 보강이 필요합니다.</p>
      {figure('03-prediction-scatter','LLM 라벨과 모델 예측값','모델별 test 700쌍 전체를 표시했습니다. 가로·세로축은 모두 0–100이며, TF-IDF는 train에서 보정한 점수입니다. 점은 추가로 흔들거나 샘플링하지 않았습니다.')}
      <p>오차 누적분포는 같은 허용 오차 안에 들어오는 공고 쌍의 비율을 보여줍니다. 오른쪽 표 형태의 그림은 후보 유형별 MAE입니다. Cross-Encoder는 문자 TF-IDF보다 같은 직무에서 {ce_deltas[0]:.2f}점, 인접 직무에서 {ce_deltas[1]:.2f}점, 무작위 후보에서 {ce_deltas[2]:.2f}점 낮은 오차를 보였습니다.</p>
      {figure('04-errors','오차 분포와 후보 유형별 비교','왼쪽: 동일 오차에서 곡선이 높을수록 더 많은 쌍이 그 오차 안에 있습니다. 오른쪽: 숫자가 낮고 색이 옅을수록 오차가 작습니다. 후보 유형은 적합도 정답 자체가 아닙니다.')}
      <p>프로필 70명을 묶음 단위로 20,000번 재추출하는 paired bootstrap으로 결과의 변동도 확인했습니다. 두 모델의 문자 TF-IDF 대비 NDCG 개선 구간은 모두 0보다 높았고 MAE 차이는 모두 0보다 낮았습니다. 같은 test 표본 안에서는 개선 방향이 안정적으로 나타났습니다.</p>
      {figure('05-bootstrap','모델 간 차이의 95% bootstrap 구간','점은 모델 간 평균 차이, 선은 프로필 단위 95% 구간입니다. NDCG는 양수, MAE는 음수일 때 앞 모델에 유리합니다. 20,000회·seed 42, 새로 실행한 재표집 결과입니다.')}
      <p>Cross-Encoder와 E5+MLP 사이의 NDCG 차이는 +0.0054로 작고 구간이 0을 포함합니다. 또 valid MAP은 E5+MLP 0.7458, Cross-Encoder 0.6365로 test의 순서와 다릅니다. 따라서 현재 자료로 Cross-Encoder가 항상 우월하다고 정하기보다, <strong>저비용 E5+MLP를 기준으로 재정렬의 추가 가치를 확인하는 판단</strong>이 적절합니다.</p>{source}
    '''))
    sections.append(section(8,'next','향후 개발 방향성',f'''
      <p><strong>다음 우선순위는 서비스 조건에서의 비용·지연 측정과 적합 조합 보강입니다.</strong> 이번 실행 시간은 작은 장비에서 반복 실험이 가능함을 보여주지만, 사용자 요청의 응답 시간은 따로 재야 합니다.</p>
      {table(['항목','E5+MLP','Cross-Encoder'],[['실험 전체 실행 시간',f"{e5['runtime']['seconds']/60:.2f}분",f"{ce['runtime']['seconds']/60:.2f}분"],['시간에 포함된 작업','기준선 계산 · 임베딩 · 학습 · 평가','기록 임베딩/선택 · zero-shot 평가 · 학습 · 최종 평가'],['저장한 추가 학습 가중치','3.0 MiB','196.23 MiB'],['별도 필요한 기반 모델','multilingual-e5-base','bge-reranker-v2-m3 및 기록 선택용 E5'],['실제 요청 지연·처리량','미측정','미측정']],'RTX 5080 한 대에서 실행했습니다. 두 실행은 캐시 재사용과 작업 범위가 달라 시간 비율을 순수 학습 속도나 추론 속도 차이로 해석하지 않습니다.')}
      <ol class="steps"><li><span class="t">추론 지연과 Top-K 실험</span><span class="d">프로필 임베딩 재사용 여부, 공고 100·1,000개, 재정렬 K 값별로 p50/p95 지연·초당 처리량·VRAM을 측정합니다. 독립 모델과 연결된 경로의 품질을 같은 후보군에서 비교합니다.</span></li><li><span class="t">고적합 조합과 어려운 부적합 조합 추가</span><span class="d">60점 이상 라벨이 현재 4.1%입니다. 직접 수행한 근거가 풍부한 조합, 직무명은 같지만 요구를 충족하지 못하는 조합을 늘립니다. 사람이 직접 평가한 고정 세트도 만들어 학습 방향을 확인합니다.</span></li><li><span class="t">긴 프로필의 입력 손실 감소</span><span class="d">Cross-Encoder 입력 31.7%가 1,536토큰에서 잘렸습니다. E5도 전체 프로필을 512토큰으로 제한합니다. 기록별 집계·선택 개선과 길이 확대를 나눠 비교합니다.</span></li><li><span class="t">운영 공고 입력과 점수 보정</span><span class="d">공고 원문·분해된 필수/우대 요건을 포함한 운영 입력으로 다시 평가합니다. 두 모델을 연결할 때 최종 점수의 선택과 보정을 검증합니다.</span></li><li><span class="t">학습 반복과 교사 영향 확인</span><span class="d">학습 seed 반복, 고적합 공고가 있는 평가 프로필 확대, 교사 모델별 분포 확인으로 선택을 보강합니다. 직접 pairwise 비교 라벨은 이후 순위 개선 실험에 사용합니다.</span></li></ol>
    '''))
    sections.append(section(9,'conclusion','결론','''
      <blockquote>공고 적합도 모델을 학습할 이유가 수치로 확인됐습니다. 이제 이 품질을 사용자가 감당할 수 있는 응답 시간과 운영 비용으로 제공하는 단계입니다.</blockquote>
      <p>1,000개 합성 프로필과 10,000개 LLM 라벨을 이용한 이번 실험에서 두 학습 모델 모두 단어 일치와 임베딩 유사도 기준선을 앞섰습니다. 이는 경력 근거와 요구사항의 대응을 평가하는 루브릭이 학습 가능한 신호를 제공한다는 결과입니다.</p>
      <p><strong>E5+MLP를 기본 모델 후보로 유지하고, Cross-Encoder는 상위 후보 재정렬의 이득을 검증합니다.</strong> 동시에 적합 조합을 보강하고 실제 사용자 평가 세트를 확보해 다음 학습의 기준으로 삼습니다. 사용자에게 제공할 결과는 경력 기록과 공고 요구사항의 부합도를 나타내는 단일 점수입니다.</p>
    '''))
    styles='''<style>
      /* 팀 문서 양식을 유지하면서 연구 그림과 긴 수치표에 필요한 폭만 확장합니다. */
      .sheet {min-width:0;} .doc-head h1 {font-size:42px;letter-spacing:-.045em;}
      .plot-scroll {overflow-x:auto;margin:16px 0 0;} .plot-scroll svg {width:100%;height:auto;display:block;min-width:570px;}
      .fig h3 {margin:24px 0 6px;} .fig {break-inside:avoid;} .source {margin:18px 0 28px;font-size:12px;color:var(--ex-slate-500);}
      .source summary {cursor:pointer;text-decoration:underline;text-underline-offset:4px;} .source p {margin-top:10px;overflow-wrap:anywhere;}
      .table-wrap table {font-size:12.5px;} .table-wrap th {font-size:10px;letter-spacing:0;padding:12px;} .table-wrap td {padding:12px;}
      .table-wrap td:not(:first-child) {font-variant-numeric:tabular-nums;} .stats .v {font-size:40px;}
      .export-links {font-size:12px;display:flex;gap:16px;flex-wrap:wrap;margin-top:18px;}
      .export-links a {color:var(--ex-slate-500);text-decoration:underline;text-underline-offset:4px;}
      @media(min-width:1300px) {.shell {grid-template-columns:var(--toc) minmax(0,960px);} .sheet {padding:56px 64px;}}
      @media(max-width:700px) {.doc-head h1 {font-size:29px;} .topbar .where {display:none;} .topbar {padding:0 12px;gap:8px;} .sheet {padding:28px 18px;} .shell {padding:16px 8px 60px;} .sec-head h2 {font-size:23px;} .sec {margin-bottom:44px;} .stats {grid-template-columns:1fr;} .stats .stat {display:grid;grid-template-columns:1fr auto;gap:4px;} .stat .v {grid-column:2;grid-row:1/3;font-size:34px;align-self:center;} .stat .d {margin-top:0;} }
      @media print {.plot-scroll {overflow:visible;} .plot-scroll svg {min-width:0;} .table-wrap {overflow:visible;} .table-wrap table {font-size:8pt;} .table-wrap th,.table-wrap td {padding:6px;} .source,.export-links {display:none;} .doc-head h1 {font-size:29pt;} }
    </style>'''
    head=f'''<div class="doc-head">{styles}<div class="kicker">P5 · MODEL RESEARCH / 2026.09</div><h1>공고 적합도 모델<br>학습 결과 리포트</h1><p class="lede">1,000개의 합성 프로필로 학습한 두 모델의 성능과<br>서비스 적용을 위한 다음 선택</p><div class="meta"><div><div class="k">EXPERIMENT</div><div class="v">2026년 9월 4일</div></div><div><div class="k">REPORT</div><div class="v">2026년 9월 6일</div></div><div><div class="k">EVALUATION</div><div class="v">70명 · 700쌍</div></div><div><div class="k">STATUS</div><div class="v"><span class="badge done">TRAINED / EVALUATED</span></div></div></div><div class="export-links"><a href="#results">성능 결과 바로 보기</a><a href="#next">다음 실험 확인</a><a href="assets/p5-training-results-2026-09-06/02-performance.svg" download>성능 그림 SVG</a></div></div>'''
    template=(ROOT/'docs/templates/expresso-doc.html').read_text(encoding='utf-8')
    doc=template.replace('<title>문서 제목 — Expresso</title>','<title>공고 적합도 모델 학습 결과 리포트 — Expresso</title>')
    doc=re.sub(r'(<main class="sheet" id="doc">)[\s\S]*?(</main>)',lambda m:m[1]+head+''.join(sections)+'<footer class="docfoot">Expresso · P5 모델 연구<br>2026년 9월 6일 · 9월 4일 학습 산출물 기준 · 평가 수치 재계산 및 데이터 해시 확인</footer>'+m[2],doc,count=1)
    # 단일 HTML을 공유해도 읽는 자리 표시 스크립트가 유지되도록 포함합니다.
    rail=(ROOT/'docs/templates/doc-rail.js').read_text(encoding='utf-8')
    doc=doc.replace('<script src="./doc-rail.js" defer></script>','<script>'+rail.replace('</script','<\\/script')+'</script>')
    OUTPUT.write_text('\n'.join(line.rstrip() for line in doc.splitlines())+'\n',encoding='utf-8')
    notes={"audience":"technical; first-time project readers", "surface":"HTML using the user-required Expresso template; repository instructions take precedence over plugin renderer defaults", "structure":"User's nine-section report structure: overview, process, synthetic data, training, architecture, application, performance, next development, conclusion. Technical methods and metric definitions included before results; further questions integrated into next steps.", "charts":[{"id":n,"format":"inline SVG with 300-dpi PNG companion","source":"saved evaluation rows and labels","palette":"Expresso neutral tokens with one espresso accent"} for n in ['01-dataset','02-performance','03-prediction-scatter','04-errors','05-bootstrap','06-learning']], "notes":["NDCG uses linear gain and 10 candidates; never called percent accuracy.","MAP and MRR only cover 13 test profiles with labels >= 60.","Recall@10 omitted because all 10 candidates are included.","Runtime covers differing pipelines and caches; inference latency not measured.","Weight sizes are trained additions, not complete runtime model size.","Profile and job IDs disjoint; no claim of semantic duplicate audit.","LLM targets, not human labels or hiring outcomes.","Paired bootstrap uses test profiles; does not measure across-seed training variation."],"sources":[str((MODELS/'e5-mlp/metrics.json').relative_to(ROOT)),str((MODELS/'cross-encoder/metrics.json').relative_to(ROOT)),str((DATA/'labels-final/suitability-labels.jsonl').relative_to(ROOT)),"scripts/ml-data/llm_suitability_train.py","scripts/ml-data/match_pilot_model.py","docs/architecture/llm-suitability-labeling-v1.md"]}
    save_json(ASSETS/'source-notes.json',notes)


def main():
    ASSETS.mkdir(parents=True, exist_ok=True)
    e5,ce,metrics,grouped,labels,analysis=collect()
    figures(e5,ce,metrics,grouped,labels,analysis)
    build_html(e5,ce,metrics,analysis)
    print(json.dumps({"html":str(OUTPUT),"figures":6,"analysis":str(ASSETS/'analysis.json')},ensure_ascii=False))


if __name__ == "__main__":
    main()
