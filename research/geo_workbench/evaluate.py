"""Deterministic comparison metrics; these are not external search rankings."""

from __future__ import annotations

import re

from .contracts import DocumentEvaluation, GeoDocument, Metric


def _clamp(value: float) -> int:
    return max(0, min(100, round(value)))


def _anchors(value: str) -> set[str]:
    return {term.lower() for term in re.findall(r"[\w\u4e00-\u9fff]{4,}", value)}


def evaluate(document: GeoDocument, source_content: str | None = None) -> DocumentEvaluation:
    headings = len(re.findall(r"^#{1,3}\s+.+$", document.content, re.MULTILINE))
    bullets = len(re.findall(r"^[-*]\s+.+$", document.content, re.MULTILINE))
    evidence = len(re.findall(r"https?://|\[\d+\]|來源|依據|研究|source|evidence", document.content, re.IGNORECASE))
    title_terms = _anchors(document.title)
    matching_terms = sum(term in document.content.lower() for term in title_terms)
    source_terms = _anchors(source_content or "")
    preservation = 100 if not source_content or not source_terms else _clamp(100 * len(source_terms & _anchors(document.content)) / len(source_terms))
    metrics = (
        Metric("answerability", _clamp(25 + min(45, len(document.content[:300]) / 2) + (20 if headings else 0)), "Summary and sections are used as a repeatable heuristic."),
        Metric("structure", _clamp(15 + min(60, headings * 20) + min(20, bullets * 4)), "Heading and list count only."),
        Metric("context", _clamp(20 + min(70, matching_terms * 25)), "Title-term overlap only."),
        Metric("evidence", _clamp(evidence * 25), "Evidence markers only; no fact verification."),
        Metric("scannability", _clamp(20 + min(50, headings * 15) + min(30, bullets * 5)), "Structural scannability only."),
        Metric("source_preservation", preservation, "Source anchor overlap only."),
    )
    return DocumentEvaluation(
        total_score=_clamp(sum(metric.score for metric in metrics) / len(metrics)),
        metrics=metrics,
        method="deterministic-heuristic-v1",
        limitations=(
            "Scores do not measure search ranking, generated-search visibility, traffic, or conversion.",
            "A human owner must verify facts and sources before publishing.",
        ),
    )
