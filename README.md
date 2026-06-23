# Gym Journal

A simple, mobile-first **training journal** that works offline and installs to your
iPhone home screen like a native app. No accounts, no backend — all data lives on
your phone (in the browser's local storage), with one-tap JSON backup/restore.

Built as a plain web app (HTML/CSS/JS), so there's no build step.

## What you can log

Everything is organised **by date**:

- **Body weight** for the day (shows the change since your last recorded weigh-in).
- **Exercises → Sets → Steps**, matching how you actually train:
  - **Exercise** — Pushups, Pullups, Dips, … (free text, learns what you type).
  - **Set** — one round, with rest after it.
  - **Step** — within a set you can chain several variations back-to-back (a
    mechanical drop set / "running the rack"). Each step has its own:
    - **Variation** — Standard, Knee, Incline, Australian, Negative, … (movement only)
    - **Reps** — with +/- steppers
    - **Time under tension (TuT)** in seconds — optional, its own field
    - **Added weight** in kg (e.g. a 4 kg weighted vest) — optional, its own field

These three (variation, TuT, added weight) are **independent fields**, never
forced into one dropdown.

Example — one Pushups *set* run as a drop set:

> Set 1: **10** vested (+4 kg) → **8** unvested → **6** knee

…and a Pullups set:

> Set 1: **6** standard → **4** negative → **8** half-rep → **12** Australian

Add a step for each variation, add a set for each round. New steps/sets pre-fill
from the previous one, so repeating a sequence is just tweaking numbers. Tap any
entry to edit it, or use **Copy last** to clone your previous workout.

## Notes

- **Day note** — a free-text box on each day for how things felt
  ("left shoulder pain", "slept poorly", "felt strong").
- **Per-exercise note** — in the exercise editor, attach a note to a specific
  movement ("knee pop on rep 6"); it shows on that exercise's card.

Both sync across devices like the rest of your data.

## At-a-glance stats & PRs

Each day shows a quick stat strip — **reps**, **sets**, **exercises**, and your
current **🔥 streak**. When a set beats your previous best (more reps, or more
added weight) for that exercise+variation, it's flagged with a **🏆 PR badge**.

## Trends dashboard

Bottom bar → **📈 Trends**:
- **Body weight** over time (line chart with overall change).
- **Exercise progress** — pick an exercise and (optionally) a single variation,
  then chart **Total reps**, **Best set**, **Max +kg**, or **Avg TuT** across
  your sessions. So you can watch, say, weighted-vest pull-up load creep up, or
  reps on a specific variation climb over the weeks.
- **Personal bests** — best reps and top load per exercise.

Tap or drag across any chart to scrub through past sessions — a marker and
tooltip show the exact **date and value** for each point.

## Timer: Rest & Tempo

Bottom bar → **⏱ Timer**, with two modes:

- **Rest** — presets (0:30–3:00), ±15s, start/pause, and a beep + vibrate when
  rest is up. A floating pill keeps the countdown visible while you log.
- **Tempo (TuT metronome)** — set the seconds for each phase of a rep —
  **Down / Hold bottom / Up / Hold top** (e.g. 4 / 1 / 4 / 1) and an optional
  rep target. A countdown ring plus distinct tones cue every phase (with a tick
  each second) and it counts your reps, beeping + vibrating when the set is done.

## Cloud sync (phone ↔ PC)

Your journal is local-first, but you can sync across devices via a **private
GitHub Gist** — no server, no account beyond GitHub:

1. Bottom bar → **Data → ☁︎ Cloud sync**.
2. Create a GitHub token (github.com/settings/tokens → fine-grained →
   **Gists: Read and write**, or a classic token with the **gist** scope).
3. Paste it and tap **Connect & sync**.
4. On your other device, paste the **same token** — it finds the same Gist
   automatically and merges per-day (newest edit wins), so phone and PC stay in
   sync without clobbering each other.

The token is stored only on each device (in its browser), never in this repo.

## Run it

It's static — open `index.html` over HTTP (a service worker needs http/https, not
`file://`). Locally:

```bash
python3 -m http.server 8000
# then visit http://localhost:8000
```

## Deploy free with GitHub Pages

1. Push this repo to GitHub.
2. Repo **Settings → Pages → Build and deployment → Source: Deploy from a branch**.
3. Pick your branch and the **/(root)** folder, save.
4. Open the published URL on your iPhone.

## Add to iPhone home screen (so it feels like an app)

1. Open the site in **Safari**.
2. Tap the **Share** button → **Add to Home Screen**.
3. Launch it from the new icon — it opens full-screen, no Safari chrome, and
   works offline.

## Backup & restore

Bottom bar → **Data**:
- **Export backup** downloads a `.json` of everything.
- **Import backup** merges a backup file into your data.
- **Clear this day** wipes just the current date.

If you're not using cloud sync, keep an occasional export somewhere safe — local
storage lives only on that device/browser.

## Project layout

```
index.html              app shell
css/styles.css          mobile-first dark theme
js/app.js               all app logic + localStorage
manifest.webmanifest    PWA metadata (home-screen install)
sw.js                   service worker (offline cache)
icons/                  app icons
tools/make_icons.py     regenerates icons (stdlib only)
```
