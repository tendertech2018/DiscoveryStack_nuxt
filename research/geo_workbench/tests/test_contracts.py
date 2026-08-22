from __future__ import annotations

import unittest

from research.geo_workbench.contracts import GeoDocument, GeoRule
from research.geo_workbench.evaluate import evaluate
from research.geo_workbench.reference_adapter import ReferenceRulesAdapter
from research.geo_workbench.smoke import run


class GeoWorkbenchContractsTest(unittest.TestCase):
    def test_reference_adapter_preserves_original_document(self) -> None:
        document = GeoDocument("Clear service scope", "This synthetic content describes a clear service scope.", "en")
        candidate = ReferenceRulesAdapter().rewrite(document, (GeoRule("claim-safety", "utility", "Do not invent results."),))
        self.assertIn(document.content, candidate.optimized_content)
        self.assertEqual(candidate.provider, "reference-rules-v1")

    def test_evaluator_records_limits_not_ranking_claims(self) -> None:
        evaluation = evaluate(GeoDocument("Test subject", "A synthetic document.", "en"))
        self.assertEqual(evaluation.method, "deterministic-heuristic-v1")
        self.assertTrue(any("ranking" in limitation for limitation in evaluation.limitations))

    def test_smoke_flow_uses_synthetic_fixture(self) -> None:
        result = run()
        self.assertTrue(result["synthetic_fixture"])
        self.assertEqual(result["provider"], "reference-rules-v1")


if __name__ == "__main__":
    unittest.main()
