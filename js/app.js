/* ============================================================
   Gym Journal — offline-first PWA
   Local-first storage (localStorage) + optional GitHub Gist sync.

   Data model
   ----------
   db = {
     updatedAt, exerciseNames[], variationNames[],
     days: {
       "YYYY-MM-DD": {
         updatedAt, bodyWeight,
         exercises: [{
           id, name,
           sets: [ { steps: [ {variation, reps, tut, weight} ] } ]
         }]
       }
     }
   }
   Steps in a set are done back-to-back (mechanical drop sets).
   ============================================================ */

const STORAGE_KEY = "gymjournal.v1";
const SYNC_TOKEN_KEY = "gymjournal.sync.token";
const SYNC_GIST_KEY = "gymjournal.sync.gistId";
const GIST_FILE = "gym-journal.json";
const GIST_TAG = "[gymjournal-sync]";

const DEFAULT_EXERCISES = [
  "Pushups", "Pullups", "Dips", "Squats", "Lunges",
  "Rows", "Plank", "Pike pushups", "Chin-ups"
];
const DEFAULT_VARIATIONS = [
  "Standard", "Knee", "Incline", "Decline", "Half reps",
  "Australian", "Negative", "Wide", "Diamond", "Archer"
];

/* ---------- State ---------- */
let db = loadDB();
let currentDate = todayStr();
let editingId = null;
let draft = null;

/* ============================================================
   Persistence + migration
   ============================================================ */
function now() { return Date.now(); }

function loadDB() {
  let data = { updatedAt: 0, days: {}, exerciseNames: [], variationNames: [] };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) data = JSON.parse(raw);
  } catch (e) { console.warn("Failed to load DB", e); }
  normalize(data);
  return data;
}
function normalize(data) {
  if (!data.days) data.days = {};
  if (!data.exerciseNames) data.exerciseNames = [];
  if (!data.variationNames) data.variationNames = [];
  if (!data.updatedAt) data.updatedAt = 0;
  // migrate old flat exercises → sets/steps
  Object.values(data.days).forEach(day => {
    if (day.updatedAt == null) day.updatedAt = 0;
    (day.exercises || []).forEach(ex => {
      if (!ex.sets) { ex.sets = []; return; }
      const needs = ex.sets.some(s => s && !("steps" in s));
      if (!needs) return;
      ex.sets = ex.sets.map(s => ({
        steps: [{
          variation: ex.variation || "",
          reps: s.reps ?? null, tut: ex.tut ?? null, weight: ex.weight ?? null
        }]
      }));
      delete ex.variation; delete ex.tut; delete ex.weight;
    });
  });
}
function saveDB() { localStorage.setItem(STORAGE_KEY, JSON.stringify(db)); }

function getDay(date) {
  if (!db.days[date]) db.days[date] = { updatedAt: 0, bodyWeight: null, exercises: [] };
  return db.days[date];
}
/* Mark a day (and the db) changed — drives merge + sync. */
function touchDay(date) {
  const t = now();
  getDay(date).updatedAt = t;
  db.updatedAt = t;
}
function commit(date) { touchDay(date); saveDB(); scheduleSync(); }

function remember(listKey, value) {
  if (!value) return;
  const list = db[listKey] || (db[listKey] = []);
  if (!list.some(v => v.toLowerCase() === value.toLowerCase())) list.push(value);
}

/* ---------- Date helpers ---------- */
function todayStr() { return ymd(new Date()); }
function ymd(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
function parseDate(s) { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); }
function shiftDate(s, n) { const d = parseDate(s); d.setDate(d.getDate() + n); return ymd(d); }
function formatDateMain(s) {
  if (s === todayStr()) return "Today";
  if (s === shiftDate(todayStr(), -1)) return "Yesterday";
  return parseDate(s).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}
function formatDateSub(s) { return parseDate(s).toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" }); }
function fmtShort(s) { return parseDate(s).toLocaleDateString(undefined, { month: "short", day: "numeric" }); }

function hasExercises(date) { return ((db.days[date] || {}).exercises || []).length > 0; }
function lastSessionBefore(date) {
  const dates = Object.keys(db.days).filter(d => d < date && hasExercises(d)).sort();
  return dates.length ? dates[dates.length - 1] : null;
}
function currentStreak() {
  let day = todayStr();
  if (!hasExercises(day)) day = shiftDate(day, -1);
  if (!hasExercises(day)) return 0;
  let c = 0;
  while (hasExercises(day)) { c++; day = shiftDate(day, -1); }
  return c;
}

/* ---------- Personal-best helpers ---------- */
function bestBefore(name, variation, date) {
  let reps = 0, weight = 0;
  Object.keys(db.days).forEach(d => {
    if (d >= date) return;
    (db.days[d].exercises || []).filter(e => e.name === name).forEach(e =>
      e.sets.forEach(s => s.steps.forEach(st => {
        if (st.variation !== variation) return;
        reps = Math.max(reps, st.reps || 0);
        weight = Math.max(weight, st.weight || 0);
      })));
  });
  return { reps, weight };
}
function isPR(step, name, date) {
  // A PR means beating an existing best (not the first time you log something).
  const b = bestBefore(name, step.variation, date);
  return (b.reps > 0 && (step.reps || 0) > b.reps) ||
         (b.weight > 0 && (step.weight || 0) > b.weight);
}

/* ============================================================
   Rendering — main screen
   ============================================================ */
const $ = (id) => document.getElementById(id);

function render() {
  renderHeader();
  renderStatStrip();
  renderBodyWeight();
  renderExercises();
}

function renderHeader() {
  $("dateMain").textContent = formatDateMain(currentDate);
  $("dateSub").textContent = formatDateSub(currentDate);
  $("datePicker").value = currentDate;
}

function renderStatStrip() {
  const day = db.days[currentDate] || {};
  const exs = day.exercises || [];
  let reps = 0, sets = 0;
  exs.forEach(e => e.sets.forEach(s => { sets++; s.steps.forEach(st => reps += Number(st.reps) || 0); }));
  const streak = currentStreak();
  const stats = [
    { v: reps, l: "Reps", cls: "accent" },
    { v: sets, l: "Sets", cls: "" },
    { v: exs.length, l: "Exercises", cls: "" },
    { v: streak ? "🔥" + streak : "0", l: "Streak", cls: streak ? "fire" : "" }
  ];
  $("statStrip").innerHTML = stats.map(s =>
    `<div class="stat"><div class="stat-value ${s.cls}">${s.v}</div><div class="stat-label">${s.l}</div></div>`
  ).join("");
}

function renderBodyWeight() {
  const day = db.days[currentDate];
  $("bodyWeight").value = day && day.bodyWeight != null ? day.bodyWeight : "";
  const hint = $("bwHint");
  const prev = Object.keys(db.days).filter(d => d < currentDate && db.days[d].bodyWeight != null).sort().pop();
  if (prev && day && day.bodyWeight != null) {
    const diff = +(day.bodyWeight - db.days[prev].bodyWeight).toFixed(1);
    hint.textContent = `${diff >= 0 ? "+" : ""}${diff} kg since ${formatDateMain(prev)}`;
  } else hint.textContent = "Tap to log";
}

function renderExercises() {
  const list = $("exerciseList");
  const exercises = (db.days[currentDate] || {}).exercises || [];
  list.innerHTML = "";
  $("emptyState").style.display = exercises.length ? "none" : "block";
  $("exerciseCount").textContent = exercises.length ? `· ${exercises.length}` : "";
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

  let total = 0, prCount = 0;
  (ex.sets || []).forEach((set, si) => {
    const line = document.createElement("div");
    line.className = "set-line";
    const label = document.createElement("div");
    label.className = "set-line-label";
    label.textContent = `S${si + 1}`;
    line.appendChild(label);

    const steps = document.createElement("div");
    steps.className = "set-steps";
    (set.steps || []).forEach(st => {
      total += Number(st.reps) || 0;
      const pr = isPR(st, ex.name, currentDate);
      if (pr) prCount++;
      const pill = document.createElement("div");
      pill.className = "step-pill" + (pr ? " pr" : "");
      const mods = [];
      if (st.tut) mods.push(`${st.tut}s`);
      if (st.weight) mods.push(`+${st.weight}kg`);
      pill.innerHTML =
        (pr ? `<span class="pr-badge">🏆</span>` : "") +
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
  const sc = (ex.sets || []).length;
  totalEl.innerHTML = `${sc} ${sc === 1 ? "set" : "sets"} · <strong>${total}</strong> reps` +
    (prCount ? ` · <strong style="color:var(--gold)">${prCount} PR${prCount > 1 ? "s" : ""}</strong>` : "");
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
  commit(currentDate); renderBodyWeight();
});
$("prevDay").addEventListener("click", () => { currentDate = shiftDate(currentDate, -1); render(); });
$("nextDay").addEventListener("click", () => { currentDate = shiftDate(currentDate, 1); render(); });
$("tabToday").addEventListener("click", () => { currentDate = todayStr(); render(); });
$("dateDisplay").addEventListener("click", () => {
  const p = $("datePicker");
  if (p.showPicker) p.showPicker(); else p.click();
});
$("datePicker").addEventListener("change", (e) => { if (e.target.value) { currentDate = e.target.value; render(); } });

/* ============================================================
   Exercise editor (sets → steps)
   ============================================================ */
function refreshDatalists() {
  const ex = [...new Set([...DEFAULT_EXERCISES, ...(db.exerciseNames || [])])];
  const va = [...new Set([...DEFAULT_VARIATIONS, ...(db.variationNames || [])])];
  $("exerciseOptions").innerHTML = ex.map(n => `<option value="${escapeAttr(n)}">`).join("");
  $("variationOptions").innerHTML = va.map(n => `<option value="${escapeAttr(n)}">`).join("");
}
function blankStep() { return { variation: "", reps: null, tut: null, weight: null }; }
function blankSet() { return { steps: [blankStep()] }; }
function deepCloneSets(sets) { return sets.map(s => ({ steps: (s.steps || []).map(st => ({ ...st })) })); }

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
  title.className = "set-card-title"; title.textContent = `Set ${si + 1}`;
  head.appendChild(title);
  if (draft.sets.length > 1) {
    const rm = document.createElement("button");
    rm.type = "button"; rm.className = "set-card-remove"; rm.textContent = "Remove";
    rm.addEventListener("click", () => { draft.sets.splice(si, 1); renderSetsEditor(); });
    head.appendChild(rm);
  }
  card.appendChild(head);
  set.steps.forEach((step, ki) => card.appendChild(stepRow(set, step, ki)));
  const addStep = document.createElement("button");
  addStep.type = "button"; addStep.className = "add-step-btn";
  addStep.textContent = "+ Add step (next variation)";
  addStep.addEventListener("click", () => {
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

  const grid = document.createElement("div");
  grid.className = "step-grid";
  const repsMini = document.createElement("div");
  repsMini.className = "mini"; repsMini.innerHTML = "<span>Reps</span>";
  const repsCtrl = document.createElement("div");
  repsCtrl.className = "reps-control";
  const minus = mkStepper("−");
  const repsInput = document.createElement("input");
  repsInput.type = "number"; repsInput.inputMode = "numeric"; repsInput.min = "0"; repsInput.placeholder = "0";
  if (step.reps != null) repsInput.value = step.reps;
  repsInput.addEventListener("input", () => {
    step.reps = repsInput.value === "" ? null : (parseInt(repsInput.value) || 0);
    updateSetsSummary();
  });
  const plus = mkStepper("+");
  minus.addEventListener("click", () => { step.reps = Math.max(0, (step.reps || 0) - 1); repsInput.value = step.reps; updateSetsSummary(); });
  plus.addEventListener("click", () => { step.reps = (step.reps || 0) + 1; repsInput.value = step.reps; updateSetsSummary(); });
  repsCtrl.appendChild(minus); repsCtrl.appendChild(repsInput); repsCtrl.appendChild(plus);
  repsMini.appendChild(repsCtrl);
  grid.appendChild(repsMini);
  grid.appendChild(miniNum("TuT (s)", step.tut, "numeric", "1", v => { step.tut = v === "" ? null : (parseInt(v) || 0); }));
  grid.appendChild(miniNum("Added kg", step.weight, "decimal", "0.5", v => { step.weight = v === "" ? null : (parseFloat(v) || 0); }));
  row.appendChild(grid);
  return row;
}
function mkStepper(label) { const b = document.createElement("button"); b.type = "button"; b.className = "mini-step"; b.textContent = label; return b; }
function miniNum(label, value, mode, step, onInput) {
  const wrap = document.createElement("div");
  wrap.className = "mini";
  const span = document.createElement("span"); span.textContent = label;
  const inp = document.createElement("input");
  inp.type = "number"; inp.inputMode = mode; inp.step = step; inp.min = "0"; inp.className = "mini-num"; inp.placeholder = "—";
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

  // PR detection (compare against history before this date)
  let prHit = false;
  sets.forEach(s => s.steps.forEach(st => { if (isPR(st, name, currentDate)) prHit = true; }));

  remember("exerciseNames", name);
  const day = getDay(currentDate);
  if (editingId) {
    const ex = day.exercises.find(e => e.id === editingId);
    ex.name = name; ex.sets = sets;
  } else {
    day.exercises.push({ id: uid(), name, sets });
  }
  commit(currentDate); closeEditor(); render();
  if (prHit) showToast("🏆 New personal best!", true); else showToast("Saved");
});

$("deleteExerciseBtn").addEventListener("click", () => {
  if (!editingId) return;
  const day = getDay(currentDate);
  day.exercises = day.exercises.filter(e => e.id !== editingId);
  commit(currentDate); closeEditor(); render(); showToast("Deleted");
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
  commit(currentDate); render(); showToast(`Copied from ${formatDateMain(src)}`);
});

/* ============================================================
   Data menu: export / import / clear
   ============================================================ */
$("menuBtn").addEventListener("click", () => { updateSyncUI(); $("menuBackdrop").hidden = false; });
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
      if (!confirm("Merge this backup into your data?")) return;
      normalize(data);
      db = mergeDB(db, data); db.updatedAt = now();
      saveDB(); render(); scheduleSync();
      $("menuBackdrop").hidden = true; showToast("Backup imported");
    } catch (err) { showToast("Invalid backup file"); }
  };
  reader.readAsText(file);
  e.target.value = "";
});
$("clearDayBtn").addEventListener("click", () => {
  if (!confirm(`Clear everything logged for ${formatDateMain(currentDate)}?`)) return;
  const day = getDay(currentDate);
  day.exercises = []; day.bodyWeight = null;   // soft clear (keeps it sync-safe)
  commit(currentDate); render(); $("menuBackdrop").hidden = true; showToast("Day cleared");
});

/* ============================================================
   Dashboard / trends
   ============================================================ */
const METRICS = [
  { key: "total", label: "Total reps", unit: "", fn: s => s.reduce((a, x) => a + (x.reps || 0), 0) },
  { key: "max", label: "Best set", unit: "", fn: s => Math.max(0, ...s.map(x => x.reps || 0)) },
  { key: "weight", label: "Max +kg", unit: "kg", fn: s => Math.max(0, ...s.map(x => x.weight || 0)) },
  { key: "tut", label: "Avg TuT", unit: "s", fn: s => { const t = s.map(x => x.tut).filter(x => x != null); return t.length ? Math.round(t.reduce((a, b) => a + b, 0) / t.length) : null; } }
];
let dashState = { exercise: null, variation: "__all__", metric: "total" };

$("dashBtn").addEventListener("click", openDashboard);
$("dashClose").addEventListener("click", () => { $("dashScreen").hidden = true; document.body.style.overflow = ""; });

function allExerciseNames() {
  const s = new Set();
  Object.values(db.days).forEach(d => (d.exercises || []).forEach(e => s.add(e.name)));
  return [...s].sort();
}
function variationsFor(name) {
  const s = new Set();
  Object.values(db.days).forEach(d => (d.exercises || []).filter(e => e.name === name)
    .forEach(e => e.sets.forEach(set => set.steps.forEach(st => { if (st.variation) s.add(st.variation); }))));
  return [...s].sort();
}
function openDashboard() {
  const names = allExerciseNames();
  if (!dashState.exercise || !names.includes(dashState.exercise)) dashState.exercise = names[0] || null;
  const exSel = $("dashExercise");
  exSel.innerHTML = names.length
    ? names.map(n => `<option value="${escapeAttr(n)}"${n === dashState.exercise ? " selected" : ""}>${escapeHtml(n)}</option>`).join("")
    : `<option>No exercises yet</option>`;
  exSel.onchange = () => { dashState.exercise = exSel.value; dashState.variation = "__all__"; renderDashboard(); };
  const mr = $("dashMetrics");
  mr.innerHTML = "";
  METRICS.forEach(m => {
    const b = document.createElement("button");
    b.type = "button"; b.className = "metric-btn" + (m.key === dashState.metric ? " active" : "");
    b.textContent = m.label;
    b.addEventListener("click", () => { dashState.metric = m.key; renderDashboard(); });
    mr.appendChild(b);
  });
  $("dashScreen").hidden = false; document.body.style.overflow = "hidden";
  renderDashboard();
}
function renderDashboard() {
  const bw = Object.keys(db.days).sort().filter(d => db.days[d].bodyWeight != null)
    .map(d => ({ date: d, value: db.days[d].bodyWeight }));
  makeChart($("bwChart"), bw, "kg");
  if (bw.length) {
    const diff = +(bw[bw.length - 1].value - bw[0].value).toFixed(1);
    $("bwStat").textContent = `${bw[bw.length - 1].value} kg · ${diff >= 0 ? "+" : ""}${diff} overall`;
  } else $("bwStat").textContent = "";

  document.querySelectorAll("#dashMetrics .metric-btn").forEach((b, i) =>
    b.classList.toggle("active", METRICS[i].key === dashState.metric));

  const vSel = $("dashVariation");
  const name = dashState.exercise;
  if (name) {
    const vars = variationsFor(name);
    if (dashState.variation !== "__all__" && !vars.includes(dashState.variation)) dashState.variation = "__all__";
    vSel.innerHTML = `<option value="__all__">All variations</option>` +
      vars.map(v => `<option value="${escapeAttr(v)}"${v === dashState.variation ? " selected" : ""}>${escapeHtml(v)}</option>`).join("");
    vSel.onchange = () => { dashState.variation = vSel.value; renderDashboard(); };
  } else vSel.innerHTML = `<option>—</option>`;

  const metric = METRICS.find(m => m.key === dashState.metric);
  const series = name ? exerciseSeries(name, dashState.variation, metric) : [];
  makeChart($("exChart"), series, metric.unit);
  const vl = dashState.variation === "__all__" ? "all variations" : `“${dashState.variation}”`;
  $("dashHint").textContent = name
    ? `${metric.label} for ${name} (${vl}) · ${series.length} session${series.length === 1 ? "" : "s"}.`
    : "Log some exercises to see progress.";

  renderPersonalBests();
}
function exerciseSeries(name, variation, metric) {
  const out = [];
  Object.keys(db.days).sort().forEach(date => {
    const steps = [];
    (db.days[date].exercises || []).filter(e => e.name === name).forEach(e =>
      e.sets.forEach(s => s.steps.forEach(st => { if (variation === "__all__" || st.variation === variation) steps.push(st); })));
    if (!steps.length) return;
    const v = metric.fn(steps);
    if (v == null) return;
    out.push({ date, value: v });
  });
  return out;
}
function renderPersonalBests() {
  const names = allExerciseNames();
  const box = $("pbList");
  if (!names.length) { box.innerHTML = `<div class="pb-empty">No data yet.</div>`; return; }
  box.innerHTML = names.map(name => {
    let best = { reps: 0, variation: "", date: "" }, load = { weight: 0, variation: "", date: "" };
    Object.keys(db.days).forEach(d => (db.days[d].exercises || []).filter(e => e.name === name)
      .forEach(e => e.sets.forEach(s => s.steps.forEach(st => {
        if ((st.reps || 0) > best.reps) best = { reps: st.reps, variation: st.variation, date: d };
        if ((st.weight || 0) > load.weight) load = { weight: st.weight, variation: st.variation, date: d };
      }))));
    if (!best.reps && !load.weight) return "";
    const detail = [
      best.reps ? `${best.variation || "—"} · ${fmtShort(best.date)}` : "",
      load.weight ? `top load +${load.weight}kg (${load.variation || "—"})` : ""
    ].filter(Boolean).join(" · ");
    return `<div class="pb-row">
      <div><div class="pb-name">${escapeHtml(name)}</div><div class="pb-detail">${escapeHtml(detail)}</div></div>
      <div class="pb-value">${best.reps || "—"}<small>best reps</small></div>
    </div>`;
  }).join("") || `<div class="pb-empty">No data yet.</div>`;
}

/* Dependency-free SVG line chart. */
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
  const area = `M${xs(0).toFixed(1)} ${H - padB} ` + pts.map(p => "L" + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ") + ` L${xs(n - 1).toFixed(1)} ${H - padB} Z`;
  const dots = pts.map((p, i) => `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="${i === n - 1 ? 4 : 2.6}" fill="#5b8cff"/>`).join("");
  const fmtV = v => Number.isInteger(v) ? v : v.toFixed(1);
  const last = series[n - 1];
  const lastLabelX = Math.min(xs(n - 1), W - padR - 4);
  el.innerHTML = `
  <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img">
    <defs>
      <linearGradient id="cg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="rgba(91,140,255,0.28)"/>
        <stop offset="100%" stop-color="rgba(91,140,255,0)"/>
      </linearGradient>
      <linearGradient id="cl" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="#5b8cff"/><stop offset="100%" stop-color="#8b5cf6"/>
      </linearGradient>
    </defs>
    <line x1="${padL}" y1="${padT}" x2="${padL}" y2="${H - padB}" stroke="#2c3340" stroke-width="1"/>
    <line x1="${padL}" y1="${H - padB}" x2="${W - padR}" y2="${H - padB}" stroke="#2c3340" stroke-width="1"/>
    <text x="${padL - 5}" y="${ys(max) + 4}" text-anchor="end" font-size="9" fill="#8b93a6">${fmtV(max)}</text>
    <text x="${padL - 5}" y="${ys(min) + 4}" text-anchor="end" font-size="9" fill="#8b93a6">${fmtV(min)}</text>
    <path d="${area}" fill="url(#cg)"/>
    <path d="${line}" fill="none" stroke="url(#cl)" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"/>
    ${dots}
    <text x="${padL}" y="${H - 8}" text-anchor="start" font-size="9" fill="#8b93a6">${fmtShort(series[0].date)}</text>
    <text x="${W - padR}" y="${H - 8}" text-anchor="end" font-size="9" fill="#8b93a6">${fmtShort(last.date)}</text>
    <text x="${lastLabelX}" y="${Math.max(ys(last.value) - 9, 12)}" text-anchor="end" font-size="11" font-weight="800" fill="#f4f6fb">${fmtV(last.value)}${unit ? " " + unit : ""}</text>
  </svg>`;
}

/* ============================================================
   Rest timer
   ============================================================ */
const TIMER_PRESETS = [30, 60, 90, 120, 180];
let timerState = { duration: 90, remaining: 90, running: false, endAt: 0, tick: null };
let audioCtx = null;

$("timerBtn").addEventListener("click", openTimer);
$("timerClose").addEventListener("click", () => { $("timerBackdrop").hidden = true; updateTimerPill(); });
$("timerBackdrop").addEventListener("click", (e) => { if (e.target === $("timerBackdrop")) { $("timerBackdrop").hidden = true; updateTimerPill(); } });
$("timerPill").addEventListener("click", openTimer);
$("timerStart").addEventListener("click", toggleTimer);
$("timerReset").addEventListener("click", resetTimer);
$("timerMinus").addEventListener("click", () => { adjustTimer(-15); });

function openTimer() {
  const box = $("timerPresets");
  box.innerHTML = "";
  TIMER_PRESETS.forEach(sec => {
    const b = document.createElement("button");
    b.type = "button"; b.className = "timer-preset" + (sec === timerState.duration ? " active" : "");
    b.textContent = fmtClock(sec);
    b.addEventListener("click", () => setPreset(sec));
    box.appendChild(b);
  });
  $("timerBackdrop").hidden = false;
  renderTimer();
}
function fmtClock(s) { const m = Math.floor(s / 60); return `${m}:${String(s % 60).padStart(2, "0")}`; }
function setPreset(sec) {
  timerState.duration = sec;
  if (!timerState.running) timerState.remaining = sec;
  document.querySelectorAll(".timer-preset").forEach(b => b.classList.toggle("active", b.textContent === fmtClock(sec)));
  renderTimer();
}
function toggleTimer() {
  if (timerState.running) { timerState.running = false; }
  else {
    if (timerState.remaining <= 0) timerState.remaining = timerState.duration;
    timerState.endAt = Date.now() + timerState.remaining * 1000;
    timerState.running = true;
    ensureAudio();
    loop();
  }
  renderTimer();
}
function adjustTimer(delta) {
  timerState.duration = Math.max(15, timerState.duration + delta);
  timerState.remaining = timerState.running
    ? Math.max(0, timerState.remaining + delta)
    : timerState.duration;
  if (timerState.running) timerState.endAt = Date.now() + timerState.remaining * 1000;
  renderTimer();
}
function resetTimer() { timerState.running = false; timerState.remaining = timerState.duration; renderTimer(); }
function loop() {
  clearTimeout(timerState.tick);
  if (!timerState.running) return;
  timerState.remaining = Math.max(0, Math.round((timerState.endAt - Date.now()) / 1000));
  if (timerState.remaining <= 0) { finishTimer(); return; }
  renderTimer();
  timerState.tick = setTimeout(loop, 250);
}
function finishTimer() {
  timerState.running = false; timerState.remaining = timerState.duration;
  beep(); if (navigator.vibrate) navigator.vibrate([220, 110, 220]);
  renderTimer(); showToast("⏱ Rest done");
}
function renderTimer() {
  const txt = fmtClock(timerState.remaining);
  const warn = timerState.running && timerState.remaining <= 10;
  const disp = $("timerDisplay");
  disp.textContent = txt; disp.classList.toggle("warn", warn);
  $("timerStart").textContent = timerState.running ? "Pause" : (timerState.remaining < timerState.duration ? "Resume" : "Start");
  updateTimerPill();
}
function updateTimerPill() {
  const pill = $("timerPill");
  const show = timerState.running && $("timerBackdrop").hidden;
  pill.hidden = !show;
  if (show) {
    pill.textContent = "⏱ " + fmtClock(timerState.remaining);
    pill.classList.toggle("warn", timerState.remaining <= 10);
  }
}
function ensureAudio() {
  if (!audioCtx) { try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} }
  if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
}
function beep() {
  if (!audioCtx) return;
  [0, 0.18, 0.36].forEach(t => {
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.frequency.value = 880; o.type = "sine";
    o.connect(g); g.connect(audioCtx.destination);
    const now = audioCtx.currentTime + t;
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.3, now + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.15);
    o.start(now); o.stop(now + 0.16);
  });
}

/* ============================================================
   GitHub Gist sync
   ============================================================ */
let syncToken = localStorage.getItem(SYNC_TOKEN_KEY) || "";
let gistId = localStorage.getItem(SYNC_GIST_KEY) || "";
let syncTimer = null, syncing = false, lastSyncAt = 0;
let syncAuthError = false;   // true when GitHub rejects the token (expired/revoked)

function syncEnabled() { return !!syncToken; }
function ghHeaders() {
  return { "Authorization": "Bearer " + syncToken, "Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" };
}
async function gh(path, opts = {}) {
  const res = await fetch("https://api.github.com" + path, { ...opts, headers: { ...ghHeaders(), ...(opts.headers || {}) } });
  if (!res.ok) {
    const err = new Error(
      res.status === 401 ? "Token expired or invalid" :
      res.status === 403 ? "Access denied — check the Gists permission" :
      `GitHub error ${res.status}`
    );
    if (res.status === 401) err.auth = true;   // token expired / revoked
    throw err;
  }
  return res.json();
}
async function discoverGist() {
  const list = await gh("/gists?per_page=100");
  const found = list.find(g => (g.files && g.files[GIST_FILE]) || (g.description || "").includes(GIST_TAG));
  return found ? found.id : null;
}
async function ensureGist() {
  if (gistId) return gistId;
  gistId = await discoverGist();
  if (!gistId) {
    const created = await gh("/gists", {
      method: "POST",
      body: JSON.stringify({
        description: "Gym Journal data — do not delete " + GIST_TAG,
        public: false,
        files: { [GIST_FILE]: { content: JSON.stringify(db) } }
      })
    });
    gistId = created.id;
  }
  localStorage.setItem(SYNC_GIST_KEY, gistId);
  return gistId;
}
function mergeDB(a, b) {
  const out = {
    updatedAt: Math.max(a.updatedAt || 0, b.updatedAt || 0),
    exerciseNames: unionNames(a.exerciseNames, b.exerciseNames),
    variationNames: unionNames(a.variationNames, b.variationNames),
    days: {}
  };
  const keys = new Set([...Object.keys(a.days || {}), ...Object.keys(b.days || {})]);
  keys.forEach(k => {
    const da = a.days[k], dbb = b.days[k];
    if (!da) out.days[k] = dbb;
    else if (!dbb) out.days[k] = da;
    else out.days[k] = (dbb.updatedAt || 0) > (da.updatedAt || 0) ? dbb : da;
  });
  return out;
}
function unionNames(a = [], b = []) {
  const out = [...a];
  b.forEach(n => { if (!out.some(x => x.toLowerCase() === n.toLowerCase())) out.push(n); });
  return out;
}
async function syncNow(opts = {}) {
  if (!syncEnabled() || syncing) return;
  syncing = true; setSyncStatus("busy", "Syncing…");
  try {
    await ensureGist();
    const data = await gh("/gists/" + gistId);
    let remote = null;
    const f = data.files && data.files[GIST_FILE];
    if (f && f.content) { try { remote = JSON.parse(f.content); normalize(remote); } catch (e) {} }
    if (remote) {
      const merged = mergeDB(db, remote);
      db = merged; saveDB(); render();
    }
    // push our (possibly merged) state back
    const localStr = JSON.stringify(db);
    const remoteStr = f && f.content ? f.content : "";
    if (localStr !== remoteStr) {
      await gh("/gists/" + gistId, { method: "PATCH", body: JSON.stringify({ files: { [GIST_FILE]: { content: localStr } } }) });
    }
    lastSyncAt = Date.now();
    syncAuthError = false;
    setSyncStatus("ok", "Synced " + timeAgo(lastSyncAt));
  } catch (e) {
    if (e.auth) {
      syncAuthError = true;
      setSyncStatus("err", "Token expired — reconnect");
      showToast("⚠️ GitHub token expired — reconnect in Data → Cloud sync");
    } else {
      setSyncStatus("err", e.message || "Sync failed");
    }
  } finally {
    syncing = false; updateSyncUI();
  }
}
function scheduleSync() {
  if (!syncEnabled()) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => syncNow(), 1500);
}
function timeAgo(t) {
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return Math.floor(s / 60) + "m ago";
  return Math.floor(s / 3600) + "h ago";
}

/* Sync UI */
function setSyncStatus(kind, text) {
  const chip = $("syncChip");
  chip.hidden = !syncEnabled();
  chip.className = "sync-chip " + (kind || "");
  chip.innerHTML = `<span class="dot"></span>${text}`;
  const st = $("syncState");
  if (st) st.textContent = text;
}
function updateSyncUI() {
  const needReconnect = syncEnabled() && syncAuthError;
  $("syncStatusLine").textContent = !syncEnabled() ? "Not connected"
    : needReconnect ? "⚠️ Token expired — reconnect"
    : (lastSyncAt ? "Connected · synced " + timeAgo(lastSyncAt) : "Connected");
  // When the token is rejected, surface the connect form so a new one can be pasted.
  $("syncConnectForm").hidden = syncEnabled() && !needReconnect;
  $("syncManage").hidden = !syncEnabled() || needReconnect;
  if (syncEnabled()) {
    $("syncChip").hidden = false;
    if (!syncing) {
      if (needReconnect) setSyncStatus("err", "Reconnect");
      else setSyncStatus(lastSyncAt ? "ok" : "", lastSyncAt ? "Synced " + timeAgo(lastSyncAt) : "Connected");
    }
  } else $("syncChip").hidden = true;
}
$("syncChip").addEventListener("click", openSyncSheet);
$("syncMenuBtn").addEventListener("click", openSyncSheet);
$("syncClose").addEventListener("click", () => { $("syncBackdrop").hidden = true; });
$("syncBackdrop").addEventListener("click", (e) => { if (e.target === $("syncBackdrop")) $("syncBackdrop").hidden = true; });
function openSyncSheet() {
  $("menuBackdrop").hidden = true;
  $("syncToken").value = "";
  updateSyncUI();
  $("syncState").textContent = !syncEnabled() ? "Connect to sync across your devices."
    : syncAuthError ? "⚠️ Your GitHub token expired or was revoked. Generate a new one and paste it below to reconnect."
    : (lastSyncAt ? "Synced " + timeAgo(lastSyncAt) : "Connected — tap Sync now");
  $("syncBackdrop").hidden = false;
}
$("syncConnect").addEventListener("click", async () => {
  const tok = $("syncToken").value.trim();
  if (!tok) { showToast("Paste a token first"); return; }
  syncToken = tok; gistId = ""; syncAuthError = false;
  localStorage.setItem(SYNC_TOKEN_KEY, tok);
  localStorage.removeItem(SYNC_GIST_KEY);
  $("syncConnect").disabled = true; $("syncState").textContent = "Connecting…";
  await syncNow();
  $("syncConnect").disabled = false;
  if (syncEnabled() && !syncing) { showToast("Cloud sync on"); $("syncBackdrop").hidden = true; }
});
$("syncNowBtn").addEventListener("click", () => syncNow());
$("syncDisconnect").addEventListener("click", () => {
  if (!confirm("Disconnect sync on this device? Your local data stays.")) return;
  syncToken = ""; gistId = ""; lastSyncAt = 0;
  localStorage.removeItem(SYNC_TOKEN_KEY); localStorage.removeItem(SYNC_GIST_KEY);
  updateSyncUI(); $("syncBackdrop").hidden = true; showToast("Disconnected");
});

/* Pull fresh data when returning to the app */
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && syncEnabled()) syncNow();
});

/* ============================================================
   Utilities
   ============================================================ */
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function escapeAttr(s) { return String(s).replace(/"/g, "&quot;"); }
function escapeHtml(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
let toastTimer;
function showToast(msg, pr) {
  const t = $("toast");
  t.textContent = msg; t.hidden = false;
  t.className = "toast" + (pr ? " pr" : "");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, pr ? 2400 : 1700);
}

/* ============================================================
   Boot
   ============================================================ */
refreshDatalists();
render();
updateSyncUI();
if (syncEnabled()) syncNow();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
}
