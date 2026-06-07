# Gym Journal

A simple, mobile-first **training journal** that works offline and installs to your
iPhone home screen like a native app. No accounts, no backend — all data lives on
your phone (in the browser's local storage), with one-tap JSON backup/restore.

Built as a plain web app (HTML/CSS/JS), so there's no build step.

## What you can log

Everything is organised **by date**:

- **Body weight** for the day (shows the change since your last recorded weigh-in).
- **Exercises**, with the granularity you actually train at:
  - **Exercise** — Pushups, Pullups, Dips, … (free text, learns what you type).
  - **Variation** — Standard, TuT, No TuT, Knee, Weighted Vest, Half reps,
    Australian, Negative, … (quick-pick chips + free text).
  - **Time under tension (TuT)** in seconds per rep — optional.
  - **Added weight** in kg (e.g. a 4 kg weighted vest) — optional.
  - **Sets & reps** — add as many sets as you want; new sets pre-fill with the
    previous set's reps and have +/- steppers for fast logging.

So a typical chest day might be a few entries like:

| Exercise | Variation | TuT | Weight | Sets |
|----------|-----------|-----|--------|------|
| Pushups  | TuT       | 3s  | —      | 12, 10, 8 |
| Pushups  | No TuT    | —   | —      | 20, 18 |
| Pushups  | Knee      | —   | —      | 15 |
| Pullups  | Weighted Vest | — | 4 kg | 6, 5, 4 |
| Pullups  | Half reps | —   | —      | 8 |
| Pullups  | Australian | —  | —      | 12, 12 |

Tap any entry to edit it. Use **Copy last session** to clone your previous
workout into today and just tweak the numbers.

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
- **Import backup** restores from that file (replaces current data).
- **Clear this day** wipes just the current date.

Keep an occasional export somewhere safe — local storage lives only on that
device/browser.

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
