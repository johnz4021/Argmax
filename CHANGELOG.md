# Changelog

All notable changes to this project will be documented in this file.

## [1.0.1] - 2026-04-28

### Added
- Post-lesson follow-up classifier (TYPE A/B/C) in both explain and guided agents: students can now ask factual questions (TYPE A), request trace/graph/pseudocode replay (TYPE B), or ask for deeper conceptual explanations (TYPE C) after a lesson completes.
- TYPE B trace replay in guided mode: after lesson completion, "trace the steps on the graph" and similar requests now replay the algorithm trace with graph animation and pseudocode highlighting via `emit_segment` with `trace_step_indices`, instead of returning a plain-text recap.

### Changed
- `MathText` component now decodes HTML entities (`&nbsp;`, `&lt;`, `&gt;`, `&amp;`) and renders `**bold**` markdown as `<strong>` elements and `\n` as `<br>` in non-math text segments.
- Guided mode post-lesson follow-ups no longer restricted to `conversational_reply` only — TYPE B replays now use `emit_segment` with trace step indices.

### Fixed
- Post-lesson "trace the steps on the graph" requests in guided mode previously returned a text recap instead of the visual trace replay. Now correctly classified as TYPE B and replays the graph animation.
- TYPE B 6–10 segment trace replays in guided mode are now exempt from the 4-consecutive `emit_segment` hard limit, preventing premature comprehension-check pauses mid-replay.
