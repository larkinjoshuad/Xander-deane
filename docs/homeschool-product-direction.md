# Homeschool Family Product Direction

The first product audience is homeschool families. The initial experience should
help a parent choose useful practice, let a child complete it, and return a clear,
honest account of what happened. The current build remains a synthetic-only
prototype, not a service for real children.

## First Complete Workflow

1. Open the family overview at `app/parent.html`.
2. Choose the suggested focus or a subject's practice link.
3. Complete a synthetic activity in `app/learn.html?subject=language` (also math
   and science), then return through Family overview.
4. See checked attempts and next-step suggestions persist across reloads.

Unstarted and unchecked work must not look like failure. Repeated correct answers
on one activity must not be described as mastery of a subject. Parents retain
the decision about advancing and should check understanding on a different
example. Current counts are local-browser practice evidence, not validated
educational assessments, daily totals, attendance records, or compliance reports.

## Next Product Milestones

- A parent-controlled weekly practice plan using synthetic learner profiles.
- Multiple examples per objective, so progress can distinguish repetition from
  transfer to a new problem.
- Separate synthetic siblings' plans and evidence before adding real accounts.
- Clear recovery when browser storage is unavailable or damaged.
- Supervised usability evaluation with adults using synthetic activities.

Keep production identity, consent, privacy, safe AI operations, payment flows,
and real learner records blocked until their respective release gates are met.
No automatic provider calls or new learner data collection are part of this
family-overview increment.
