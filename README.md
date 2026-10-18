# MED25 Study Hub

Circulation & Breathing study tool for the MED25 cohort. This GitHub repository is the source for the existing Render site:
https://med25-quiz-1-practice.onrender.com/

## Source audit — 4 October 2026

Checked against the current Circulation & Breathing study guide, 94 Drive folders and 211 catalogued files. The guide lists 88 lecture deliveries and 106 topic entries, including SPP, CBD and PBL.

- 939 active AI questions, including 168 cases, across 62 sets and 64 mapped topics.
- All 838 authentic test-bank questions, IDs, stems, options and answer keys retained; 81 confirmed lecture-mapping repairs.
- 622 complete test-bank questions eligible for custom mock exams. The other 216 source entries remain available for study but are excluded from timed exams.
- 42 guide topics with unresolved source gaps and two with partial coverage. These are explicitly documented in the Lecture Tracker rather than labelled future content.

Topic-level findings: `source-coverage-audit.json`. Confirmed mapping repairs: `past-mapping-repairs.json`. Source documents retain their existing Google Drive permissions.

## Reliability

The daily supplement and base libraries agree, with recovered hidden content and stable existing runtime question IDs. Answer locking, nested local/cloud progress merge, mock allocation validation, unique selection, timed submission, reload recovery and zero mock XP are covered by regression tests. Leaderboards paginate beyond 500 accounts, respect current weekly/monthly periods, and support own rank, privacy controls and retry after errors. Mobile lecture filters appear above the fixed pager.

## Verification

```sh
node tests/content-audit.js
node tests/reliability.js
python3 -m http.server 4173 --bind 127.0.0.1
# In another terminal sharing the same network namespace:
node tests/ui-regression.js
```

Playwright is required for browser tests. `MED25_CHROMIUM_PATH` optionally selects a local Chromium executable. `MED25_BASE_URL` selects the UI-test server (default http://127.0.0.1:4173). Responsive tests cover 390×844, 768×1024, 1180×820 and 1440×1000 layouts with touch enabled for mobile/tablet. These are Chromium simulations, not physical Safari-device tests.

All browser-test Supabase calls use isolated fixtures; tests create no live student accounts, progress, answers or XP. Separate read-only live checks verify backend health, RLS, uniqueness constraints, public endpoints and CORS. No real account password was supplied or tested.

## Hosting

The existing Render static site publishes this repository root with no build step and automatically deploys `main`. Preserve its service configuration and Supabase project. The Supabase publishable key in the browser source is intentional; never commit service-role credentials, passwords or deployment tokens.

Content changes require source review. No unattended updater was added by this audit.

## Question-focused release — 13 October 2026

The app now focuses on Past Papers, AI Questions, Mistake Quiz, Mock Exams, Lecture Tracker and profiles/rankings. The obsolete card library, review engine, scheduler dependency, navigation and generation policy have been removed. Existing opaque historical progress is retained by the shared progress sync for rollback; it is never reviewed, scheduled, rendered or used for XP. The previous library remains recoverable through Git history. No student tables or historical analytics events were deleted.

Current audit: 1,286 Past Paper questions (1,072 mock-ready) and 979 AI questions across 65 active sets. `tests/reliability.js` checks retired-view recovery, absence of obsolete resource requests/events, and preservation of historical progress during account sync. `tests/xp-awards.js` and `tests/mistake-recovery.js` check XP durability and deduplication.

`backend/analytics-without-cards.sql` records the applied analytics query update; `backend/analytics-rollback.sql` retains the previous definition. Execute these only through an administrator connection. Function privileges remain restricted to `postgres` and `service_role`. No scheduled jobs, workers or content-generation Edge Functions were present in the existing Render/Supabase deployment.

## Respiratory Module 3 import — 18 October 2026

Imported 885 source entries (797 written and 88 practical recalls) from the supplied 242-page compilation. These map to 791 distinct questions in the source set: 512 new questions, 279 existing questions reused, and 94 repeats within this compilation merged. Existing IDs, stems, options and answer keys are preserved.

Past Papers → Filters → Question set now includes **RS Previous Years · Module 3** and **RS Practical · review**. Exact normalized stem-and-choice matches are merged; different diagrams and changed choices remain separate. Repeat counts describe source appearances (including a duplicate MED09 page), not a verified count of separate exam sittings. Thirty-five specific recurring concepts are marked high yield separately from the exact-repeat count.

Practical recalls, incomplete stems/choices, missing or ambiguous keys, and figure-dependent written recalls are retained as ungraded study material and excluded from mock exams until reviewed. Source-bank keys are labelled as such, not clinically validated. Three additional keys disagree with existing answers; a visible warning preserves the prior key. Source manifest, provenance, mapping and merge decisions: `rs-module3-import.json`.

Validation: `node tests/rs-module3-import.js`, `node tests/content-audit.js`, and `node tests/reliability.js`.

### Practical duplicate cleanup — 18 October 2026

Previous Years and Practical filters are now mutually exclusive. Practical entries appear only in Practical. One separately stored duplicate using the identical radiograph, arrow, stem and options was merged; its source and saved progress migrate to the retained question. Different radiographs remain separate. Current total: 1,851 questions; Module 3 filters show 702 written and 88 practical questions.


### RS Practical removal · 18 October 2026

At the user’s request, all 88 questions from the RS Practical filter have been removed from the active question data, lecture mapping, explanation overrides, mocks and revision. The RS Practical filter is removed. The other 66 picture-based past-paper questions remain unchanged. There are now 1755 past-paper questions (1476 mock eligible). Original import and grading audits remain historical records; `rs-practical-removal.json` records the exact removals. Student account XP is unchanged.

### Medical content corrections · 18 October 2026

Published 488 corrections to question wording, answer keys or explanations. Forty-five ambiguous/incomplete recalls are explicitly ungraded and excluded from mocks. `medical-content-review.json` retains exact before/after records and references. Written questions have been checked; 41 retained picture questions still await individual visual verification. Revised study questions archive the old attempt and allow fresh practice without rewriting previously awarded account XP. Current mock-eligible past-paper count: 1,444.
