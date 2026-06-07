/* ============================================================
   Gym Journal — offline PWA
   Data is stored in localStorage. No backend, no accounts.

   Data model
   ----------
   exercise = {
     id, name,
     sets: [                      // each set is done with rest between sets
       { steps: [                 // steps are done back-to-back (drop set)
           { variation, reps, tut, weight }
       ] }
     ]
   }
   ============================================================ */

const STORAGE_KEY = "gymjournal.v1";

const DEFAULT_EXERCISES = [
  "Pushups", "Pullups", "Dips", "Squats", "Lunges",
  "Rows", "Plank", "Pike pushups", "Chin-ups"
];
/* Variation = the movement variation only. Tension (TuT) and added load
   (weighted vest) live in their own per-step fields. */
const DEFAULT_VARIATIONS = [
  "Standard", "Knee", "Incline", "Decline", "Half reps",
  "Australian", "Negative", "Wide", "Diamond", "Archer"
];

/* ---------- State ---------- */
let db = loadDB();
let currentDate = todayStr();
let editingId = null;   // exercise id in the editor, or null for new
let draft = null;       // working { sets:[{steps:[...]}] } while editing

/* ---------- Persistence + migration ---------- */
function loadDB() {
  let data = { days: {}, exerciseNames: [], variationNames: [] };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) data = JSON.parse(raw);
  } catch (e) { console.warn("Failed to load DB", e); }
  if (!data.days) data.days = {};
  if (!data.exerciseNames) data.exerciseNames = [];
  if (!data.variationNames) data.variationNames = [];
  migrate(data);
  return data;
}

/* Upgrade the old flat format (exercise.variation/tut/weight + sets:[{reps}])
   to the new sets→steps structure. Safe to run repeatedly. */
function migrate(data) {
  Object.values(data.days).forEach(day => {
    (day.exercises || []).forEach(ex => {
      if (!ex.sets) { ex.sets = []; return; }
      const needs = ex.sets.some(s => s && !("steps" in s));
      if (!needs) return;
      ex.sets = ex.sets.map(s => ({
        steps: [{
          variation: ex.variation || "",
          reps: s.reps ?? null,
          tut: ex.tut ?? null,
          weight: ex.weight ?? null
        }]
      }));
      delete ex.variation; delete ex.tut; delete ex.weight;
    });
  });
}

function saveDB() { localStorage.setItem(STORAGE_KEY, JSON.stringify(db)); }

function getDay(date) {
  if (!db.days[date]) db.days[date] = { bodyWeight: null, exercises: [] };
  return db.days[date];
}

function remember(listKey, value) {
  if (!value) return;
  const list = db[listKey] || (db[listKey] = []);
  if (!list.some(v => v.toLowerCase() === value.toLowerCase())) list.push(value);
}

/* ---------- Date helpers ---------- */
function todayStr() { return ymd(new Date()); }
function ymd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function parseDate(str) { const [y, m, d] = str.split("-").map(Number); return new Date(y, m - 1, d); }
function shiftDate(str, delta) { const d = parseDate(str); d.setDate(d.getDate() + delta); return ymd(d); }
function formatDateMain(str) {
  if (str === todayStr()) return "Today";
  if (str === shiftDate(todayStr(), -1)) return "Yesterday";
  return parseDate(str).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}
function formatDateSub(str) {
  return parseDate(str).toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" });
}
function fmtShort(str) {
  return parseDate(str).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
function lastSessionBefore(date) {
  const dates = Object.keys(db.days)
    .filter(d => d < date && (db.days[d].exercises || []).length > 0).sort();
  return dates.length ? dates[dates.length - 1] : null;
}

/* ============================================================
   Rendering — main screen
   ============================================================ */
const $ = (id) => document.getElementById(id);

function render() { renderHeader(); renderBodyWeight(); renderExercises(); }

function renderHeader() {
  $("dateMain").textContent = formatDateMain(currentDate);
  $("dateSub").textContent = formatDateSub(currentDate);
  $("datePicker").value = currentDate;
}

function renderBodyWeight() {
  const day = db.days[currentDate];
  $("bodyWeight").value = day && day.bodyWeight != null ? day.bodyWeight : "";
  const hint = $("bwHint");
  const prevDate = Object.keys(db.days)
    .filter(d => d < currentDate && db.days[d].bodyWeight != null).sort().pop();
  if (prevDate && day && day.bodyWeight != null) {
    const diff = +(day.bodyWeight - db.days[prevDate].bodyWeight).toFixed(1);
    const sign = diff > 0 ? "+" : "";
    hint.textContent = `${sign}${diff} kg since ${formatDateMain(prevDate)} (${db.days[prevDate].bodyWeight} kg)`;
  } else hint.textContent = "";
}

function renderExercises() {
  const list = $("exerciseList");
  const exercises = (db.days[currentDate] || {}).exercises || [];
  list.innerHTML = "";
  $("emptyState").style.display = exercises.length ? "none" : "block";
  $("exerciseCount").textContent = exercises.length
    ? `${exercises.length} ${exercises.length === 1 ? "entry" : "entries"}` : "";
  exercises.forEach(ex => list.appendChild(exerciseCard(ex)));
}

function exerciseCard(ex) {
  const card = document.createElement("div");
  card.className = "exercise-card";
  card.addEventListener("click", () => openEditor(ex.id));

  const name = document.createElement("div");
  name.className = "ex-name";
  name.textContent = ex.name || "Exercise";
  card.appendChild(name);

  let total = 0;
  (ex.sets || []).forEach((set, si) => {
    const line = document.createElement("div");
    line.className = "set-line";
    const label = document.createElement("div");
    label.className = "set-line-label";
    label.textContent = `Set ${si + 1}`;
    line.appendChild(label);

    const steps = document.createElement("div");
    steps.className = "set-steps";
    (set.steps || []).forEach(st => {
      total += Number(st.reps) || 0;
      const pill = document.createElement("div");
      pill.className = "step-pill";
      const mods = [];
      if (st.tut) mods.push(`${st.tut}s`);
      if (st.weight) mods.push(`+${st.weight}kg`);
      pill.innerHTML =
        `<div class="sp-reps">${st.reps ?? 0}</div>` +
        (st.variation ? `<div class="sp-var">${escapeHtml(st.variation)}</div>` : "") +
        (mods.length ? `<div class="sp-mods">${mods.join(" · ")}</div>` : "");
      steps.appendChild(pill);
    });
    line.appendChild(steps);
    card.appendChild(line);
  });

  const totalEl = document.createElement("div");
  totalEl.className = "ex-total";
  const setCount = (ex.sets || []).length;
  totalEl.innerHTML = `${setCount} ${setCount === 1 ? "set" : "sets"} · <strong>${total}</strong> total reps`;
  card.appendChild(totalEl);
  return card;
}

/* ============================================================
   Body weight + date navigation
   ============================================================ */
$("bodyWeight").addEventListener("change", (e) => {
  const day = getDay(currentDate);
  const val = e.target.value.trim();
  day.bodyWeight = val === "" ? null : parseFloat(val);
  saveDB(); renderBodyWeight();
});
$("prevDay").addEventListener("click", () => { currentDate = shiftDate(currentDate, -1); render(); });
$("nextDay").addEventListener("click", () => { currentDate = shiftDate(currentDate, 1); render(); });
$("todayBtn").addEventListener("click", () => { currentDate = todayStr(); render(); });
$("dateDisplay").addEventListener("click", () => {
  const p = $("datePicker");
  if (p.showPicker) p.showPicker(); else p.click();
});
$("datePicker").addEventListener("change", (e) => { if (e.target.value) { currentDate = e.target.value; render(); } });

/* ============================================================
   Exercise editor (sets → steps)
   ============================================================ */
function refreshDatalists() {
  const exNames = [...new Set([...DEFAULT_EXERCISES, ...(db.exerciseNames || [])])];
  const varNames = [...new Set([...DEFAULT_VARIATIONS, ...(db.variationNames || [])])];
  $("exerciseOptions").innerHTML = exNames.map(n => `<option value="${escapeAttr(n)}">`).join("");
  $("variationOptions").innerHTML = varNames.map(n => `<option value="${escapeAttr(n)}">`).join("");
}

function blankStep() { return { variation: "", reps: null, tut: null, weight: null }; }
function blankSet() { return { steps: [blankStep()] }; }

function openEditor(id) {
  editingId = id || null;
  refreshDatalists();

  if (id) {
    const ex = getDay(currentDate).exercises.find(e => e.id === id);
    $("sheetTitle").textContent = "Edit exercise";
    $("deleteExerciseBtn").hidden = false;
    $("fExercise").value = ex.name || "";
    draft = { sets: deepCloneSets(ex.sets && ex.sets.length ? ex.sets : [blankSet()]) };
  } else {
    $("sheetTitle").textContent = "Add exercise";
    $("deleteExerciseBtn").hidden = true;
    $("fExercise").value = "";
    draft = { sets: [blankSet()] };
  }

  renderSetsEditor();
  $("sheetBackdrop").hidden = false;
  document.body.style.overflow = "hidden";
}

function closeEditor() {
  $("sheetBackdrop").hidden = true;
  document.body.style.overflow = "";
  editingId = null; draft = null;
}

function deepCloneSets(sets) {
  return sets.map(s => ({ steps: (s.steps || []).map(st => ({ ...st })) }));
}

function renderSetsEditor() {
  const wrap = $("setsList");
  wrap.innerHTML = "";
  draft.sets.forEach((set, si) => wrap.appendChild(setCard(set, si)));
  updateSetsSummary();
}

function setCard(set, si) {
  const card = document.createElement("div");
  card.className = "set-card";

  const head = document.createElement("div");
  head.className = "set-card-head";
  const title = document.createElement("div");
  title.className = "set-card-title";
  title.textContent = `Set ${si + 1}`;
  head.appendChild(title);
  if (draft.sets.length > 1) {
    const rm = document.createElement("button");
    rm.type = "button"; rm.className = "set-card-remove"; rm.textContent = "Remove set";
    rm.addEventListener("click", () => { draft.sets.splice(si, 1); renderSetsEditor(); });
    head.appendChild(rm);
  }
  card.appendChild(head);

  set.steps.forEach((step, ki) => card.appendChild(stepRow(set, step, ki)));

  const addStep = document.createElement("button");
  addStep.type = "button"; addStep.className = "add-step-btn";
  addStep.textContent = "+ Add step (next variation)";
  addStep.addEventListener("click", () => {
    // New step copies the previous step's variation/tut/weight for fast logging.
    const prev = set.steps[set.steps.length - 1];
    set.steps.push(prev ? { ...prev, reps: null } : blankStep());
    renderSetsEditor();
  });
  card.appendChild(addStep);
  return card;
}

function stepRow(set, step, ki) {
  const row = document.createElement("div");
  row.className = "step";

  // Head: badge + variation + delete
  const head = document.createElement("div");
  head.className = "step-head";
  const badge = document.createElement("div");
  badge.className = "step-badge"; badge.textContent = ki + 1;
  const vinput = document.createElement("input");
  vinput.type = "text"; vinput.className = "step-var"; vinput.setAttribute("list", "variationOptions");
  vinput.placeholder = "Variation (e.g. Standard)"; vinput.autocomplete = "off";
  vinput.value = step.variation || "";
  vinput.addEventListener("input", () => { step.variation = vinput.value; });
  head.appendChild(badge); head.appendChild(vinput);
  if (set.steps.length > 1) {
    const del = document.createElement("button");
    del.type = "button"; del.className = "step-del"; del.textContent = "×";
    del.addEventListener("click", () => { set.steps.splice(ki, 1); renderSetsEditor(); });
    head.appendChild(del);
  }
  row.appendChild(head);

  // Grid: reps (stepper) | TuT | +kg
  const grid = document.createElement("div");
  grid.className = "step-grid";

  // reps
  const repsMini = document.createElement("div");
  repsMini.className = "mini";
  repsMini.innerHTML = "<span>Reps</span>";
  const repsCtrl = document.createElement("div");
  repsCtrl.className = "reps-control";
  const minus = mkStepper("−");
  const repsInput = document.createElement("input");
  repsInput.type = "number"; repsInput.inputMode = "numeric"; repsInput.min = "0";
  repsInput.placeholder = "0";
  if (step.reps != null) repsInput.value = step.reps;
  repsInput.addEventListener("input", () => {
    step.reps = repsInput.value === "" ? null : (parseInt(repsInput.value) || 0);
    updateSetsSummary();
  });
  const plus = mkStepper("+");
  minus.addEventListener("click", () => {
    step.reps = Math.max(0, (step.reps || 0) - 1); repsInput.value = step.reps; updateSetsSummary();
  });
  plus.addEventListener("click", () => {
    step.reps = (step.reps || 0) + 1; repsInput.value = step.reps; updateSetsSummary();
  });
  repsCtrl.appendChild(minus); repsCtrl.appendChild(repsInput); repsCtrl.appendChild(plus);
  repsMini.appendChild(repsCtrl);
  grid.appendChild(repsMini);

  // TuT
  grid.appendChild(miniNum("TuT (s)", step.tut, "numeric", "1", (v) => {
    step.tut = v === "" ? null : (parseInt(v) || 0);
  }));
  // weight
  grid.appendChild(miniNum("Added kg", step.weight, "decimal", "0.5", (v) => {
    step.weight = v === "" ? null : (parseFloat(v) || 0);
  }));

  row.appendChild(grid);
  return row;
}

function mkStepper(label) {
  const b = document.createElement("button");
  b.type = "button"; b.className = "mini-step"; b.textContent = label;
  return b;
}
function miniNum(label, value, mode, step, onInput) {
  const wrap = document.createElement("div");
  wrap.className = "mini";
  const span = document.createElement("span"); span.textContent = label;
  const inp = document.createElement("input");
  inp.type = "number"; inp.inputMode = mode; inp.step = step; inp.min = "0";
  inp.className = "mini-num"; inp.placeholder = "—";
  if (value != null) inp.value = value;
  inp.addEventListener("input", () => onInput(inp.value));
  wrap.appendChild(span); wrap.appendChild(inp);
  return wrap;
}

function updateSetsSummary() {
  let reps = 0, steps = 0;
  draft.sets.forEach(s => s.steps.forEach(st => { reps += Number(st.reps) || 0; steps++; }));
  $("setsSummary").textContent = `${draft.sets.length} sets · ${steps} steps · ${reps} reps`;
}

$("addSetBtn").addEventListener("click", () => {
  // Clone the previous set's structure (variations/tut/weight) so repeating
  // the same drop-set sequence each round is one tap.
  const prev = draft.sets[draft.sets.length - 1];
  draft.sets.push(prev ? { steps: prev.steps.map(st => ({ ...st })) } : blankSet());
  renderSetsEditor();
  $("setsList").lastElementChild.scrollIntoView({ behavior: "smooth", block: "nearest" });
});

$("sheetCancel").addEventListener("click", closeEditor);
$("sheetBackdrop").addEventListener("click", (e) => { if (e.target === $("sheetBackdrop")) closeEditor(); });

$("sheetSave").addEventListener("click", () => {
  const name = $("fExercise").value.trim();
  if (!name) { showToast("Enter an exercise name"); $("fExercise").focus(); return; }

  // Clean draft: drop empty steps/sets, remember names.
  const sets = [];
  draft.sets.forEach(set => {
    const steps = set.steps
      .filter(st => (st.reps && st.reps > 0) || (st.variation && st.variation.trim()))
      .map(st => ({
        variation: (st.variation || "").trim(),
        reps: st.reps == null ? 0 : st.reps,
        tut: st.tut == null ? null : st.tut,
        weight: st.weight == null ? null : st.weight
      }));
    steps.forEach(st => remember("variationNames", st.variation));
    if (steps.length) sets.push({ steps });
  });
  if (!sets.length) { showToast("Add at least one step with reps"); return; }

  remember("exerciseNames", name);
  const day = getDay(currentDate);
  if (editingId) {
    const ex = day.exercises.find(e => e.id === editingId);
    ex.name = name; ex.sets = sets;
  } else {
    day.exercises.push({ id: uid(), name, sets });
  }
  saveDB(); closeEditor(); render(); showToast("Saved");
});

$("deleteExerciseBtn").addEventListener("click", () => {
  if (!editingId) return;
  const day = getDay(currentDate);
  day.exercises = day.exercises.filter(e => e.id !== editingId);
  saveDB(); closeEditor(); render(); showToast("Deleted");
});

$("addExerciseBtn").addEventListener("click", () => openEditor(null));

/* ============================================================
   Copy last session
   ============================================================ */
$("copyPrevBtn").addEventListener("click", () => {
  const src = lastSessionBefore(currentDate);
  if (!src) { showToast("No earlier session to copy"); return; }
  const day = getDay(currentDate);
  if (day.exercises.length && !confirm("This day already has exercises. Add the copied ones too?")) return;
  db.days[src].exercises.forEach(ex => {
    day.exercises.push({ id: uid(), name: ex.name, sets: deepCloneSets(ex.sets) });
  });
  saveDB(); render(); showToast(`Copied from ${formatDateMain(src)}`);
});

/* ============================================================
   Data menu: export / import / clear
   ============================================================ */
$("menuBtn").addEventListener("click", () => { $("menuBackdrop").hidden = false; });
$("menuClose").addEventListener("click", () => { $("menuBackdrop").hidden = true; });
$("menuBackdrop").addEventListener("click", (e) => { if (e.target === $("menuBackdrop")) $("menuBackdrop").hidden = true; });

$("exportBtn").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(db, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `gym-journal-${todayStr()}.json`; a.click();
  URL.revokeObjectURL(url);
  $("menuBackdrop").hidden = true;
});
$("importBtn").addEventListener("click", () => $("importFile").click());
$("importFile").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (!data.days) throw new Error("Not a gym journal backup");
      if (!confirm("Replace all current data with this backup?")) return;
      if (!data.exerciseNames) data.exerciseNames = [];
      if (!data.variationNames) data.variationNames = [];
      migrate(data);
      db = data; saveDB(); render();
      $("menuBackdrop").hidden = true; showToast("Backup imported");
    } catch (err) { showToast("Invalid backup file"); }
  };
  reader.readAsText(file);
  e.target.value = "";
});
$("clearDayBtn").addEventListener("click", () => {
  if (!confirm(`Clear everything logged for ${formatDateMain(currentDate)}?`)) return;
  delete db.days[currentDate];
  saveDB(); render(); $("menuBackdrop").hidden = true; showToast("Day cleared");
});

/* ============================================================
   Dashboard / trends
   ============================================================ */
const METRICS = [
  { key: "total", label: "Total reps", unit: "", fn: steps => steps.reduce((a, s) => a + (s.reps || 0), 0) },
  { key: "max", label: "Best set reps", unit: "", fn: steps => Math.max(0, ...steps.map(s => s.reps || 0)) },
  { key: "weight", label: "Max +kg", unit: "kg", fn: steps => Math.max(0, ...steps.map(s => s.weight || 0)) },
  { key: "tut", label: "Avg TuT", unit: "s", fn: steps => {
      const t = steps.map(s => s.tut).filter(x => x != null);
      return t.length ? Math.round(t.reduce((a, b) => a + b, 0) / t.length) : null;
  } }
];
let dashState = { exercise: null, variation: "__all__", metric: "total" };

$("dashBtn").addEventListener("click", openDashboard);
$("dashClose").addEventListener("click", () => {
  $("dashScreen").hidden = true; document.body.style.overflow = "";
});

function allExerciseNames() {
  const set = new Set();
  Object.values(db.days).forEach(d => (d.exercises || []).forEach(e => set.add(e.name)));
  return [...set].sort();
}
function variationsFor(name) {
  const set = new Set();
  Object.values(db.days).forEach(d => (d.exercises || [])
    .filter(e => e.name === name)
    .forEach(e => e.sets.forEach(s => s.steps.forEach(st => { if (st.variation) set.add(st.variation); }))));
  return [...set].sort();
}

function openDashboard() {
  const names = allExerciseNames();
  if (!dashState.exercise || !names.includes(dashState.exercise)) dashState.exercise = names[0] || null;

  // exercise select
  const exSel = $("dashExercise");
  exSel.innerHTML = names.length
    ? names.map(n => `<option value="${escapeAttr(n)}"${n === dashState.exercise ? " selected" : ""}>${escapeHtml(n)}</option>`).join("")
    : `<option>No exercises yet</option>`;
  exSel.onchange = () => { dashState.exercise = exSel.value; dashState.variation = "__all__"; renderDashboard(); };

  // metric buttons
  const mr = $("dashMetrics");
  mr.innerHTML = "";
  METRICS.forEach(m => {
    const b = document.createElement("button");
    b.type = "button"; b.className = "metric-btn" + (m.key === dashState.metric ? " active" : "");
    b.textContent = m.label;
    b.addEventListener("click", () => { dashState.metric = m.key; renderDashboard(); });
    mr.appendChild(b);
  });

  $("dashScreen").hidden = false;
  document.body.style.overflow = "hidden";
  renderDashboard();
}

function renderDashboard() {
  // Body weight series (always)
  const bw = Object.keys(db.days).sort()
    .filter(d => db.days[d].bodyWeight != null)
    .map(d => ({ date: d, value: db.days[d].bodyWeight }));
  makeChart($("bwChart"), bw, "kg");
  if (bw.length) {
    const first = bw[0].value, last = bw[bw.length - 1].value;
    const diff = +(last - first).toFixed(1);
    $("bwStat").textContent = `${last} kg now · ${diff >= 0 ? "+" : ""}${diff} kg overall`;
  } else $("bwStat").textContent = "";

  // Metric buttons active state
  document.querySelectorAll("#dashMetrics .metric-btn").forEach((b, i) =>
    b.classList.toggle("active", METRICS[i].key === dashState.metric));

  // Variation select (depends on chosen exercise)
  const vSel = $("dashVariation");
  const name = dashState.exercise;
  if (name) {
    const vars = variationsFor(name);
    if (dashState.variation !== "__all__" && !vars.includes(dashState.variation)) dashState.variation = "__all__";
    vSel.innerHTML = `<option value="__all__">All variations</option>` +
      vars.map(v => `<option value="${escapeAttr(v)}"${v === dashState.variation ? " selected" : ""}>${escapeHtml(v)}</option>`).join("");
    vSel.onchange = () => { dashState.variation = vSel.value; renderDashboard(); };
  } else {
    vSel.innerHTML = `<option>—</option>`;
  }

  // Exercise metric series
  const metric = METRICS.find(m => m.key === dashState.metric);
  const series = name ? exerciseSeries(name, dashState.variation, metric) : [];
  makeChart($("exChart"), series, metric.unit);

  const varLabel = dashState.variation === "__all__" ? "all variations" : `“${dashState.variation}”`;
  $("dashHint").textContent = name
    ? `${metric.label} for ${name} (${varLabel}) across ${series.length} session${series.length === 1 ? "" : "s"}.`
    : "Log some exercises to see progress here.";
}

function exerciseSeries(name, variation, metric) {
  const out = [];
  Object.keys(db.days).sort().forEach(date => {
    const steps = [];
    (db.days[date].exercises || []).filter(e => e.name === name).forEach(e =>
      e.sets.forEach(s => s.steps.forEach(st => {
        if (variation === "__all__" || st.variation === variation) steps.push(st);
      })));
    if (!steps.length) return;
    const v = metric.fn(steps);
    if (v == null) return;
    out.push({ date, value: v });
  });
  return out;
}

/* Minimal dependency-free SVG line chart. */
function makeChart(el, series, unit) {
  if (!series.length) { el.innerHTML = `<div class="chart-empty">No data yet</div>`; return; }
  const W = 320, H = 170, padL = 34, padR = 16, padT = 16, padB = 26;
  const n = series.length;
  const xs = i => n === 1 ? padL + (W - padL - padR) / 2 : padL + i * (W - padL - padR) / (n - 1);
  const vals = series.map(p => p.value);
  let min = Math.min(...vals), max = Math.max(...vals);
  if (min === max) { min -= 1; max += 1; }
  const ys = v => padT + (1 - (v - min) / (max - min)) * (H - padT - padB);

  const pts = series.map((p, i) => [xs(i), ys(p.value)]);
  const line = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
  const area = `M${xs(0).toFixed(1)} ${H - padB} ` +
    pts.map(p => "L" + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ") +
    ` L${xs(n - 1).toFixed(1)} ${H - padB} Z`;
  const dots = pts.map((p, i) =>
    `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="${i === n - 1 ? 4 : 2.6}" fill="#4f8cff"/>`).join("");

  const fmtV = v => Number.isInteger(v) ? v : v.toFixed(1);
  const last = series[n - 1];
  const lastLabelX = Math.min(xs(n - 1), W - padR - 4);

  el.innerHTML = `
  <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img">
    <line x1="${padL}" y1="${padT}" x2="${padL}" y2="${H - padB}" stroke="#2c3340" stroke-width="1"/>
    <line x1="${padL}" y1="${H - padB}" x2="${W - padR}" y2="${H - padB}" stroke="#2c3340" stroke-width="1"/>
    <text x="${padL - 5}" y="${ys(max) + 4}" text-anchor="end" font-size="9" fill="#8b93a3">${fmtV(max)}</text>
    <text x="${padL - 5}" y="${ys(min) + 4}" text-anchor="end" font-size="9" fill="#8b93a3">${fmtV(min)}</text>
    <path d="${area}" fill="rgba(79,140,255,0.12)"/>
    <path d="${line}" fill="none" stroke="#4f8cff" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>
    ${dots}
    <text x="${padL}" y="${H - 8}" text-anchor="start" font-size="9" fill="#8b93a3">${fmtShort(series[0].date)}</text>
    <text x="${W - padR}" y="${H - 8}" text-anchor="end" font-size="9" fill="#8b93a3">${fmtShort(last.date)}</text>
    <text x="${lastLabelX}" y="${Math.max(ys(last.value) - 8, 12)}" text-anchor="end" font-size="11" font-weight="700" fill="#f2f4f8">${fmtV(last.value)}${unit ? " " + unit : ""}</text>
  </svg>`;
}

/* ============================================================
   Utilities
   ============================================================ */
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function escapeAttr(s) { return String(s).replace(/"/g, "&quot;"); }
function escapeHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
let toastTimer;
function showToast(msg) {
  const t = $("toast");
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 1800);
}

/* ============================================================
   Boot
   ============================================================ */
refreshDatalists();
render();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
}
