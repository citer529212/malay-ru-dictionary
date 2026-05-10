# Calibration Report

## 1. Corpus size and category distribution
- Total texts: **60**
- Total referent contexts: **171**

## 2. Text counts by calibration_type
- neutral_news: 12
- standard_political_news: 10
- analytical_article: 8
- crisis_report: 8
- opinion_editorial: 5
- ideological_mobilization: 5
- propaganda_like_text: 4
- highly_emotional_text: 4
- highly_metaphorical_text: 4

## 3. Language distribution
- id: 60

## 4. Ref_country distribution
- USA: 124
- China: 39
- Russia: 8

## 5. Indicator distributions
- median IDI_raw: `0.000000`
- median EMI_raw: `0.000000`
- median MTI_raw: `0.000000`
- median IP_abs_context: `0.000000`

## 6. Percentile thresholds
- IDI_raw: p75=0.000000, p90=0.000000, p95=0.012761
- EMI_raw: p75=0.000000, p90=0.005650, p95=0.011498
- MTI_raw: p75=0.006986, p90=0.020408, p95=0.025479
- IP_abs_context: p75=0.100000, p90=0.302817, p95=0.358000

## 7. Anchor texts
- cal_local_manual_standard_political_news_set_rebuilt_000004_000004 | standard_political_news | upper_anchor
- cal_local_manual_ideological_mobilization_set_rebuilt_000003_000003 | ideological_mobilization | upper_anchor
- cal_local_manual_propaganda_like_text_set_rebuilt_000004_000004 | propaganda_like_text | extreme_anchor
- cal_local_manual_highly_metaphorical_text_set_rebuilt_000001_000001 | highly_metaphorical_text | extreme_anchor

## 8. Dictionary expansion summary
- candidate terms extracted: **3**

## 9. Quality flags
- total flags: **16**
- no_ref_country_detected: 8
- outlier: 7
- category_imbalance: 1

## 10. Recommended next steps
- Reach 100+ texts in core categories for dissertation-grade stability.
- Approve/reject candidate terms and reload lexicons.
- Recompute baseline and compare indicator deltas.

Current neutral_news subset has median EMI_raw = 0.0000.
Current crisis_report subset has median EMI_raw = 0.0000.