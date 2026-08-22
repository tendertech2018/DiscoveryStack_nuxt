"""Provider-neutral, no-persistence GEO Workbench research contracts.

This module intentionally uses only Python's standard library. It does not load
AutoGEO weights, call a model API, write a database, or persist source text.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal, Protocol

Language = Literal["en", "zh-hant"]
ProviderId = Literal["reference-rules-v1", "autogeo-api", "autogeo-mini", "custom"]


@dataclass(frozen=True)
class GeoDocument:
    title: str
    content: str
    language: Language


@dataclass(frozen=True)
class GeoRule:
    identifier: str
    category: str
    instruction: str


@dataclass(frozen=True)
class RewriteCandidate:
    provider: ProviderId
    provider_version: str
    optimized_title: str
    optimized_content: str
    applied_rule_ids: tuple[str, ...]
    safety_notes: tuple[str, ...]


@dataclass(frozen=True)
class Metric:
    identifier: str
    score: int
    explanation: str


@dataclass(frozen=True)
class DocumentEvaluation:
    total_score: int
    metrics: tuple[Metric, ...]
    method: Literal["deterministic-heuristic-v1"]
    limitations: tuple[str, ...]


class GeoRewriteAdapter(Protocol):
    identifier: ProviderId
    version: str

    def rewrite(self, document: GeoDocument, rules: tuple[GeoRule, ...]) -> RewriteCandidate:
        """Return a candidate without making ranking or conversion claims."""
