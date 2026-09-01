"""프로필–공고 lexical baseline 점수기."""

from __future__ import annotations

from collections import Counter, defaultdict
import math
import re
import unicodedata
from typing import Callable, Iterable


WORD_PATTERN = re.compile(r"[가-힣A-Za-z0-9]+")
ScoreMap = dict[str, dict[str, float]]


def normalize_text(text: str) -> str:
    normalized = unicodedata.normalize("NFKC", text).lower()
    return " ".join(normalized.split())


def word_tokens(text: str) -> list[str]:
    return WORD_PATTERN.findall(normalize_text(text))


def word_ngrams(text: str) -> list[str]:
    tokens = word_tokens(text)
    features = list(tokens)
    features.extend(f"{tokens[index]}\u0001{tokens[index + 1]}" for index in range(len(tokens) - 1))
    return features


def char_ngrams(text: str) -> list[str]:
    normalized = normalize_text(text)
    return [
        normalized[index : index + size]
        for size in range(3, 6)
        for index in range(max(0, len(normalized) - size + 1))
    ]


class TfidfIndex:
    def __init__(self, documents: dict[str, str], analyzer: Callable[[str], list[str]]):
        self._analyzer = analyzer
        document_features = {
            document_id: analyzer(text) for document_id, text in documents.items()
        }
        frequencies: Counter[str] = Counter()
        for features in document_features.values():
            frequencies.update(set(features))
        document_count = len(documents)
        self._idf = {
            feature: math.log((1 + document_count) / (1 + count)) + 1
            for feature, count in frequencies.items()
        }
        self._vectors = {
            document_id: self._vectorize(features)
            for document_id, features in document_features.items()
        }

    def _vectorize(self, features: Iterable[str]) -> dict[str, float]:
        counts = Counter(feature for feature in features if feature in self._idf)
        values = {
            feature: (1 + math.log(count)) * self._idf[feature]
            for feature, count in counts.items()
        }
        norm = math.sqrt(sum(value * value for value in values.values()))
        if norm == 0:
            return {}
        return {feature: value / norm for feature, value in values.items()}

    def score(self, query: str, document_ids: Iterable[str]) -> dict[str, float]:
        query_vector = self._vectorize(self._analyzer(query))
        return {
            document_id: sum(
                query_value * self._vectors[document_id].get(feature, 0.0)
                for feature, query_value in query_vector.items()
            )
            for document_id in document_ids
        }


class Bm25Index:
    def __init__(self, documents: dict[str, str], k1: float = 1.5, b: float = 0.75):
        self._k1 = k1
        self._b = b
        self._tokens = {
            document_id: word_tokens(text) for document_id, text in documents.items()
        }
        self._counts = {
            document_id: Counter(tokens) for document_id, tokens in self._tokens.items()
        }
        self._average_length = (
            sum(len(tokens) for tokens in self._tokens.values()) / len(self._tokens)
            if self._tokens
            else 0.0
        )
        document_frequency: Counter[str] = Counter()
        for tokens in self._tokens.values():
            document_frequency.update(set(tokens))
        document_count = len(self._tokens)
        self._idf = {
            token: math.log(1 + (document_count - count + 0.5) / (count + 0.5))
            for token, count in document_frequency.items()
        }

    def score(self, query: str, document_ids: Iterable[str]) -> dict[str, float]:
        query_tokens = set(word_tokens(query))
        scores: dict[str, float] = {}
        for document_id in document_ids:
            counts = self._counts[document_id]
            length = len(self._tokens[document_id])
            score = 0.0
            for token in query_tokens:
                frequency = counts.get(token, 0)
                if frequency == 0:
                    continue
                length_ratio = length / self._average_length if self._average_length else 0.0
                denominator = frequency + self._k1 * (1 - self._b + self._b * length_ratio)
                score += self._idf.get(token, 0.0) * frequency * (self._k1 + 1) / denominator
            scores[document_id] = score
        return scores


def token_overlap_score(profile_text: str, job_text: str) -> float:
    profile_tokens = set(word_tokens(profile_text))
    job_tokens = set(word_tokens(job_text))
    union = profile_tokens | job_tokens
    return len(profile_tokens & job_tokens) / len(union) if union else 0.0


def build_lexical_scores(
    profiles: dict[str, str],
    jobs: dict[str, str],
    pairs: Iterable[tuple[str, str]],
) -> dict[str, ScoreMap]:
    candidates: dict[str, list[str]] = defaultdict(list)
    for profile_id, job_id in pairs:
        candidates[profile_id].append(job_id)

    word_index = TfidfIndex(jobs, word_ngrams)
    char_index = TfidfIndex(jobs, char_ngrams)
    bm25_index = Bm25Index(jobs)
    result: dict[str, ScoreMap] = {
        "token_overlap": {},
        "word_tfidf": {},
        "char_tfidf": {},
        "bm25": {},
    }
    for profile_id, document_ids in candidates.items():
        unique_document_ids = sorted(set(document_ids))
        profile_text = profiles[profile_id]
        result["token_overlap"][profile_id] = {
            job_id: token_overlap_score(profile_text, jobs[job_id])
            for job_id in unique_document_ids
        }
        result["word_tfidf"][profile_id] = word_index.score(profile_text, unique_document_ids)
        result["char_tfidf"][profile_id] = char_index.score(profile_text, unique_document_ids)
        result["bm25"][profile_id] = bm25_index.score(profile_text, unique_document_ids)
    return result


def min_max_normalize(scores: dict[str, float]) -> dict[str, float]:
    if not scores:
        return {}
    minimum = min(scores.values())
    maximum = max(scores.values())
    if maximum == minimum:
        return {item_id: 0.0 for item_id in scores}
    scale = maximum - minimum
    return {item_id: (score - minimum) / scale for item_id, score in scores.items()}


def combine_hybrid_scores(
    char_scores: ScoreMap,
    bm25_scores: ScoreMap,
    char_weight: float,
) -> ScoreMap:
    if not 0.0 <= char_weight <= 1.0:
        raise ValueError("char_weight must be between 0 and 1")
    result: ScoreMap = {}
    for profile_id in sorted(char_scores):
        normalized_char = min_max_normalize(char_scores[profile_id])
        normalized_bm25 = min_max_normalize(bm25_scores[profile_id])
        if normalized_char.keys() != normalized_bm25.keys():
            raise ValueError(f"hybrid score candidates differ for {profile_id}")
        result[profile_id] = {
            job_id: char_weight * normalized_char[job_id]
            + (1 - char_weight) * normalized_bm25[job_id]
            for job_id in normalized_char
        }
    return result
