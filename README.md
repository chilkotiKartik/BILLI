# Billi

Class alarms, tasks and daily GATE study, with a cat. A multi-page web app on Supabase.

## 📱 Android APK Download

You can download and install the Android app directly on your phone:
- **Direct APK in Repo**: [`android/app/build/outputs/apk/debug/app-debug.apk`](file:///c:/Users/chilk/Downloads/billi%20(1)/billi/android/app/build/outputs/apk/debug/app-debug.apk)
- **Automated CI/CD Builds**: Built automatically on every push via [GitHub Actions](https://github.com/chilkotiKartik/BILLI/actions) and downloadable under the **Artifacts** tab.

## ✨ Features

- **Funny & Desi Alarm Ringtones**: Choose between *Uncle Ji Paani Pila Dijiye*, *Funny Meme Alarm*, *Comedy Twinkle*, *Tenge Tenge*, *Lululu*, plus feline synthesizers (*Meow*, *Grumpy cat*, *Kittens*, *Bell*).
- **Distraction Shield & App Blocker**: Native Android accessibility service that actively locks distracting social apps (Instagram, YouTube, Snapchat, X/Twitter, Reddit, Facebook, Telegram, TikTok/Reels, Netflix, Discord) while your study timer is active.
- **GATE 2027 Complete Syllabus**: Official syllabus for all 30 papers + General Aptitude (~4,100 topics) with Spaced-Repetition System (reviews at 1, 3, 7, 21 days) and direct NPTEL lecture links.
- **Real Past Paper Mock Tests**: Official GATE question papers and keys from 2021 to 2026 across 30 papers with 3-hour timer, official answer sheets, negative marking, and instant scoring.
- **Ask Billi (AI Doubt Helper)**: Integrated with Google Gemini for instant explanations and solved GATE examples tailored to your paper and section.
- **Shared Timetable & Class Hub**: Create or join classes with 6-character codes, synchronized schedules, cancel/skip classes, and automatic alarm triggers.
- **Pomodoro & Focus Timer**: 25/5, 50/10, 90/20 & Stopwatch modes with fullscreen Study Mode and dancing cat water breaks every 45 minutes.

## Run it

```bash
npm run serve        # then open http://localhost:4173
```

`web/js/config.js` already points at the Supabase project. Both values in it are public by design.

## Put it online

1. The app is deployed on Netlify as the project `billi-study` (https://billi-study.netlify.app). `netlify.toml` publishes the `web` folder and sets the security headers. To deploy a new version, run the deploy command the Netlify connector gives you from this folder. `vercel.json` is kept as an untried alternative.
2. In Supabase, open Authentication, URL Configuration, and add your site address to the redirect URLs. Sign-up confirmation and password-reset emails link back to `login.html`.
3. In Supabase, open Authentication and turn on leaked password protection.

## Switch on Ask Billi

The server part is already deployed as the Supabase Edge Function `billi-ask` (source in `supabase/functions/billi-ask`). It answers "not switched on" until it has a key:

1. Create a free key at https://aistudio.google.com.
2. In Supabase, open Edge Functions, then Secrets, and add `GEMINI_API_KEY`.
3. Optional secrets: `GEMINI_MODEL` (default `gemini-3.5-flash`) and `AI_DAILY_LIMIT` (questions per student per day, default 40).

A real Gemini answer has not been tested, because no key was set when this was built.

## Past papers data

`web/data/papers/` is built from the official downloads page and answer-key PDFs at https://gate2027.iitm.ac.in/download (read on 4 October 2026) by `tools/build_papers.py`. It stores links, question numbers, types, marks and keys only.

## Database

`supabase/schema.sql` is exactly what is applied to the project. Tables are prefixed `billi_` and every one has row level security.

## GATE syllabus data

`web/data/gate/` holds one file per paper, built from the official syllabus PDFs at https://gate2027.iitm.ac.in/exam_papers_and_syllabus (read on 4 October 2026). Topic wording is kept as published; the build only finds the structure. To rebuild after the official syllabus changes:

```bash
# download each <CODE>_GATE2027_Syllabus.pdf, then: pdftotext -layout CODE.pdf txt/CODE.txt
python3 tools/build_gate.py txt web/data/gate
npm run test:unit        # checks all 30 papers: ids, counts, known content
```

Topic ids are made from the section title and the topic text, so a reworded topic gets a new id and its tick is lost.

## Tests

| Command | What it checks |
| --- | --- |
| `npm run test:unit` | The schedule logic, the GATE revision cycle, mock scoring, the syllabus data for all 30 papers and every parsed answer key; no network |
| `npm run test:api` | Security rules against the real database, as two signed-in accounts |
| `npm run test:e2e` | A real browser: owner and member use every page; accessibility scan; no console errors |

The last two need two confirmed accounts, `billi-test-owner@example.com` and `billi-test-member@example.com`, sharing one password passed as `BILLI_TEST_PASSWORD`. Create them in Supabase (Authentication, Users, Add user, with "auto confirm"), run the tests, then delete them. `npm install` and `pip install playwright && playwright install chromium` first.

Not covered by tests: sign-up and password reset, because they need a real inbox.

## Layout

```
web/                 the site (only this folder is published)
  *.html             one file per page
  css/app.css        all styles and the cat's animations
  js/core.js         Supabase client, helpers, icons, the cat, page shell
  js/day.js          pure schedule logic
  js/data.js         database reads
  js/alarm.js        the in-browser alarm and its ringtones
  js/gate.js         pure GATE revision logic
  js/mock.js         pure mock scoring
  data/papers/       past papers and machine-readable official keys
  data/gate/         the official syllabus, one file per paper
  js/pages/          one script per page
  vendor/            supabase-js, bundled so it loads from your own site
supabase/schema.sql  tables, security rules, functions
supabase/functions/  the Ask Billi server function
tools/build_gate.py  builds data/gate from the official syllabus text
tools/build_papers.py builds data/papers from the official downloads page and keys
tests/               unit, database and browser tests
```
