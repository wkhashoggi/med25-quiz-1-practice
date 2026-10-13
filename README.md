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
