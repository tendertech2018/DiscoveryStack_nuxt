"""Reference adapter for deterministic synthetic-data smoke tests only."""

from __future__ import annotations

from .contracts import GeoDocument, GeoRule, RewriteCandidate


class ReferenceRulesAdapter:
    identifier = "reference-rules-v1"
    version = "1.0.0"

    def rewrite(self, document: GeoDocument, rules: tuple[GeoRule, ...]) -> RewriteCandidate:
        first_sentence = next((piece.strip() for piece in document.content.replace("!", ".").replace("?", ".").split(".") if piece.strip()), document.content[:280])
        if document.language == "zh-hant":
            title = f"{document.title}｜重點與可驗證說明"
            content = (
                f"# {title}\n\n## 直接摘要\n{first_sentence}\n\n## 本文範圍\n"
                f"本頁聚焦於「{document.title}」，不新增未被原文支持的成果、數據或背書。\n\n"
                f"## 詳細說明\n{document.content}\n\n## 驗證與補強\n"
                "此格式優化不新增外部事實；上線前應人工核對主張並補入可驗證來源。"
            )
        else:
            title = f"{document.title} | Key points and verification notes"
            content = (
                f"# {title}\n\n## Direct summary\n{first_sentence}\n\n## Scope\n"
                f"This page focuses on “{document.title}” and adds no unsupported results, statistics, or endorsements.\n\n"
                f"## Details\n{document.content}\n\n## Verification and reinforcement\n"
                "This formatting pass adds no external facts; verify every claim and add sources before publishing."
            )
        return RewriteCandidate(
            provider="reference-rules-v1",
            provider_version=self.version,
            optimized_title=title,
            optimized_content=content,
            applied_rule_ids=tuple(rule.identifier for rule in rules),
            safety_notes=(
                "The original content is retained in the detailed section.",
                "No ranking, traffic, conversion, statistic, or endorsement claim is added.",
            ),
        )
