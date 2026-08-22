"""Run a no-network, synthetic-only AutoGEO-compatible smoke flow.

Usage: python3 -m research.geo_workbench.smoke
"""

from __future__ import annotations

import json

from .contracts import GeoDocument, GeoRule
from .evaluate import evaluate
from .reference_adapter import ReferenceRulesAdapter


def run() -> dict[str, object]:
    document = GeoDocument(
        title="Service page clarity",
        content="This synthetic document explains how a service page can make its scope and next step easier to understand.",
        language="en",
    )
    rules = (
        GeoRule("direct-answer-first", "answerability", "Start with a supported direct summary."),
        GeoRule("claim-safety", "utility", "Do not add unsupported results or ranking claims."),
    )
    candidate = ReferenceRulesAdapter().rewrite(document, rules)
    baseline = evaluate(document)
    optimized = evaluate(GeoDocument(candidate.optimized_title, candidate.optimized_content, document.language), document.content)
    return {
        "provider": candidate.provider,
        "baseline_total": baseline.total_score,
        "optimized_total": optimized.total_score,
        "limitations": list(optimized.limitations),
        "synthetic_fixture": True,
    }


if __name__ == "__main__":
    print(json.dumps(run(), ensure_ascii=False, sort_keys=True))
