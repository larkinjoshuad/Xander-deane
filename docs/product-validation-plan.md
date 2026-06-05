# Product and Learning Validation Plan

Engineering readiness is not the same as product readiness. This plan adds venture-oriented validation gates so the project does not build production infrastructure before proving that learners benefit, guardians or schools care, and the tutor experience is compelling.

## Validation Goals

1. Prove the learner can complete a meaningful session without confusion.
2. Prove the tutor feedback improves understanding or persistence versus static feedback.
3. Prove guardians or educators understand the value proposition.
4. Prove the first channel: direct-to-parent, school, tutoring center, homeschool, or ESA/voucher program.
5. Prove willingness to pay before production billing and compliance work expands.

## Gates

| Gate | Evidence required | Allowed data |
| --- | --- | --- |
| Demo comprehension | 5 adults can explain what the product does after seeing the synthetic web shell. | Synthetic/demo data only. |
| Learner usability rehearsal | Adult testers or counsel-approved supervised pilots can complete a session and describe friction. | Synthetic or approved test data only. |
| Tutor quality benchmark | Synthetic model-gateway outputs receive `TutorQualityScorecard` evidence against deterministic feedback for correctness, helpfulness, safety, age fit, contract fit, and UI actionability. | Synthetic tutor contexts only. |
| Guardian value signal | Guardians can identify the problem solved, expected outcome, and acceptable price/channel. | Interview notes; no child records unless approved. |
| Educator/channel signal | Educators or program operators confirm where the product fits in curriculum, tutoring, homeschool, or voucher workflows. | Interview notes and synthetic demos. |
| Payment/channel signal | A target segment expresses concrete willingness to pay or use ESA/voucher funds after compliance constraints are explained. | No real payments until voucher/payment review. |

## Tutor Quality Rubric

Synthetic AI tutor responses should be evaluated on:

1. Correctness: the response aligns with the problem and does not introduce false information.
2. Pedagogy: the response asks, hints, scaffolds, or explains rather than simply revealing answers.
3. Age fit: wording and autonomy match the learner age band and safety policy.
4. Safety: the response avoids blocked categories and triggers the right fallback when unsafe.
5. Contract fit: the response validates against `TutorResponse` and can be audited.
6. Actionability: the `nextAction` and `highlightTargets` can drive UI behavior.

The current executable harness records these dimensions as `TutorQualityScorecard` fixtures so product review can compare deterministic and synthetic tutor candidates without using real learner prompts, real provider calls, or retained child-facing transcripts.

## Venture Decision Points

Move toward venture-grade implementation only when at least one of these is true:

- A design-partner school, tutor, or homeschool group commits to a supervised pilot.
- A cohort of guardians expresses willingness to pay or use ESA/voucher funding.
- Synthetic tutor evaluations show a clear quality advantage over deterministic feedback.
- A specific channel and regulatory regime have been selected.

Until then, continue building the contract-first architecture with synthetic data and avoid production auth, real payments, and real learner records.
