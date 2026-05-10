# Calibration Builder

## What is calibration corpus
Calibration corpus is an empirical baseline used to interpret dense metrics (IDI/EMI/MTI/IP) via percentiles and anchor texts.

## Why 50+ texts
With fewer than 50 texts percentile estimates are unstable. 50+ is the minimum working threshold; 100+ is recommended for dissertation-grade stability.

## Why small raw values are normal
IDI/EMI/MTI are density indicators (`markers / content words`). Small values are mathematically expected in news discourse.

## Raw vs percentile
- Raw: exact mathematical value.
- Percentile: position within calibration distribution.
- Level: interpretation band (`very_low` ... `extreme`).

Raw values are never replaced by percentiles.

## Workflow
1. Upload/collect calibration texts.
2. Classify by `calibration_type`.
3. Build contexts and compute indicators.
4. Recalculate distributions.
5. Extract dictionary candidates.
6. Approve/reject terms.
7. Reload verified lexicons.
8. Re-run analysis and compare deltas.

## Dictionary expansion
Candidates are exported to `lexicons/candidate_terms.csv` with metadata (frequency, contexts, polarity, confidence). Review actions produce:
- `verified_terms.csv`
- `rejected_terms.csv`
- `dictionary_change_log.csv`

## Interpretation of p75/p90/p95
- `p75`: elevated relative position
- `p90`: high relative position
- `p95`: extreme/anchor zone

## Dissertation note
Report should include corpus composition, distribution thresholds, lexicon version, quality flags, and rationale for approved/rejected candidates.
