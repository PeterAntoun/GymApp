/* ============================================================
   Gym Journal — offline PWA
   Data is stored in localStorage. No backend, no accounts.
   ============================================================ */

const STORAGE_KEY = "gymjournal.v1";

/* Defaults shown as quick-pick suggestions. The app also learns
   from whatever you actually type and adds it to the lists. */
const DEFAULT_EXERCISES = [
  "Pushups", "Pullups", "Dips", "Squats", "Lunges",
  "Rows", "Plank", "Pike pushups", "Chin-ups"
];
/* Variation = the movement variation only. Tension (TuT) and added load
   (e.g. weighted vest) are kept in their own dedicated fields, so they
   intentionally do NOT appear here. */
const DEFAULT_VARIATIONS = [
  "Standard", "Knee", "Incline", "Decline", "Half reps",
  "Australian", "Negative", "Wide", "Diamond", "Archer"
];

/* ---------- State ---------- */
let db = loadDB();
let currentDate = todayStr();
let editingId = null; // exercise id currently in the editor, or null for new

/* ---------- Persistence ---------- */
function loadDB() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) { console.warn("Failed to load DB", e); }
  return { days: {}, exerciseNames: [], variationNames: [] };
}

function saveDB() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
}

function getDay(date) {
  if (!db.days[date]) db.days[date] = { bodyWeight: null, exercises: [] };
  return db.days[date];
}

/* Remember a freshly typed name so it shows up in suggestions later. */
function remember(listKey, value) {
  if (!value) return;
  const list = db[listKey] || (db[listKey] = []);
  if (!list.some(v => v.toLowerCase() === value.toLowerCase())) list.push(value);
}

/* ---------- Date helpers ---------- */
function todayStr() {
  const d = new Date();
  return ymd(d);
}
function ymd(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function parseDate(str) {
  const [y, m, d] = str.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function shiftDate(str, delta) {
  const d = parseDate(str);
  d.setDate(d.getDate() + delta);
  return ymd(d);
}
function formatDateMain(str) {
  if (str === todayStr()) return "Today";
  if (str === shiftDate(todayStr(), -1)) return "Yesterday";
  const d = parseDate(str);
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}
function formatDateSub(str) {
  const d = parseDate(str);
  return d.toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" });
}

/* Most recent day before `date` that has any logged content. */
function lastSessionBefore(date) {
  const dates = Object.keys(db.days)
    .filter(d => d < date && db.days[d].exercises.length > 0)
    .sort();
  return dates.length ? dates[dates.length - 1] : null;
}

/* ============================================================
   Rendering
   ============================================================ */
const $ = (id) => document.getElementById(id);

function render() {
  renderHeader();
  renderBodyWeight();
  renderExercises();
}

function renderHeader() {
  $("dateMain").textContent = formatDateMain(currentDate);
  $("dateSub").textContent = formatDateSub(currentDate);
  $("datePicker").value = currentDate;
}

function renderBodyWeight() {
  const day = db.days[currentDate];
  $("bodyWeight").value = day && day.bodyWeight != null ? day.bodyWeight : "";

  // Show change vs. the previous recorded body weight.
  const hint = $("bwHint");
  const prevDate = Object.keys(db.days)
    .filter(d => d < currentDate && db.days[d].bodyWeight != null)
    .sort().pop();
  if (prevDate && day && day.bodyWeight != null) {
    const diff = +(day.bodyWeight - db.days[prevDate].bodyWeight).toFixed(1);
    const sign = diff > 0 ? "+" : "";
    hint.textContent = `${sign}${diff} kg since ${formatDateMain(prevDate)} (${db.days[prevDate].bodyWeight} kg)`;
  } else {
    hint.textContent = "";
  }
}

function renderExercises() {
  const list = $("exerciseList");
  const day = db.days[currentDate];
  const exercises = day ? day.exercises : [];

  list.innerHTML = "";
  $("emptyState").style.display = exercises.length ? "none" : "block";
  $("exerciseCount").textContent = exercises.length
    ? `${exercises.length} ${exercises.length === 1 ? "entry" : "entries"}`
    : "";

  exercises.forEach((ex) => list.appendChild(exerciseCard(ex)));
}

function exerciseCard(ex) {
  const card = document.createElement("div");
  card.className = "exercise-card";
  card.addEventListener("click", () => openEditor(ex.id));

  const top = document.createElement("div");
  top.className = "ex-top";

  const left = document.createElement("div");
  const name = document.createElement("div");
  name.className = "ex-name";
  name.textContent = ex.name || "Exercise";
  left.appendChild(name);
  if (ex.variation) {
    const v = document.createElement("div");
    v.className = "ex-variation";
    v.textContent = ex.variation;
    left.appendChild(v);
  }
  top.appendChild(left);

  // Meta tags (TuT, added weight)
  const meta = document.createElement("div");
  meta.className = "ex-meta";
  if (ex.tut) meta.appendChild(tag(`TuT ${ex.tut}s`, true));
  if (ex.weight) meta.appendChild(tag(`+${ex.weight} kg`, true));
  if (meta.children.length) top.appendChild(meta);

  card.appendChild(top);

  // Sets
  if (ex.sets && ex.sets.length) {
    const setsWrap = document.createElement("div");
    setsWrap.className = "ex-sets";
    ex.sets.forEach((s, i) => {
      const pill = document.createElement("div");
      pill.className = "set-pill";
      pill.innerHTML = `${s.reps ?? 0}<small>set ${i + 1}</small>`;
      setsWrap.appendChild(pill);
    });
    card.appendChild(setsWrap);

    const total = ex.sets.reduce((a, s) => a + (Number(s.reps) || 0), 0);
    const totalEl = document.createElement("div");
    totalEl.className = "ex-total";
    totalEl.innerHTML = `${ex.sets.length} sets · <strong>${total}</strong> total reps`;
    card.appendChild(totalEl);
  }

  return card;
}

function tag(text, accent) {
  const t = document.createElement("span");
  t.className = "ex-tag" + (accent ? " accent" : "");
  t.textContent = text;
  return t;
}

/* ============================================================
   Body weight input
   ============================================================ */
$("bodyWeight").addEventListener("change", (e) => {
  const day = getDay(currentDate);
  const val = e.target.value.trim();
  day.bodyWeight = val === "" ? null : parseFloat(val);
  saveDB();
  renderBodyWeight();
});

/* ============================================================
   Date navigation
   ============================================================ */
$("prevDay").addEventListener("click", () => { currentDate = shiftDate(currentDate, -1); render(); });
$("nextDay").addEventListener("click", () => { currentDate = shiftDate(currentDate, 1); render(); });
$("todayBtn").addEventListener("click", () => { currentDate = todayStr(); render(); });
$("dateDisplay").addEventListener("click", () => {
  const picker = $("datePicker");
  if (picker.showPicker) picker.showPicker();
  else picker.click();
});
$("datePicker").addEventListener("change", (e) => {
  if (e.target.value) { currentDate = e.target.value; render(); }
});

/* ============================================================
   Exercise editor sheet
   ============================================================ */
function refreshDatalists() {
  const exNames = [...new Set([...DEFAULT_EXERCISES, ...(db.exerciseNames || [])])];
  const varNames = [...new Set([...DEFAULT_VARIATIONS, ...(db.variationNames || [])])];
  $("exerciseOptions").innerHTML = exNames.map(n => `<option value="${escapeAttr(n)}">`).join("");
  $("variationOptions").innerHTML = varNames.map(n => `<option value="${escapeAttr(n)}">`).join("");

  // Variation quick chips
  const chips = $("variationChips");
  chips.innerHTML = "";
  DEFAULT_VARIATIONS.forEach(v => {
    const c = document.createElement("button");
    c.type = "button";
    c.className = "chip";
    c.textContent = v;
    c.addEventListener("click", () => {
      $("fVariation").value = v;
      updateVariationChips();
    });
    chips.appendChild(c);
  });
}

function updateVariationChips() {
  const current = $("fVariation").value.trim().toLowerCase();
  document.querySelectorAll("#variationChips .chip").forEach(c => {
    c.classList.toggle("active", c.textContent.toLowerCase() === current);
  });
}

function openEditor(id) {
  editingId = id || null;
  const sheet = $("sheetBackdrop");
  refreshDatalists();

  let ex;
  if (id) {
    ex = getDay(currentDate).exercises.find(e => e.id === id);
    $("sheetTitle").textContent = "Edit exercise";
    $("deleteExerciseBtn").hidden = false;
  } else {
    ex = { name: "", variation: "", tut: null, weight: null, sets: [{ reps: null }] };
    $("sheetTitle").textContent = "Add exercise";
    $("deleteExerciseBtn").hidden = true;
  }

  $("fExercise").value = ex.name || "";
  $("fVariation").value = ex.variation || "";
  $("fTut").value = ex.tut ?? "";
  $("fWeight").value = ex.weight ?? "";
  renderSetsEditor(ex.sets && ex.sets.length ? ex.sets.map(s => ({ ...s })) : [{ reps: null }]);
  updateVariationChips();

  sheet.hidden = false;
  document.body.style.overflow = "hidden";
}

function closeEditor() {
  $("sheetBackdrop").hidden = true;
  document.body.style.overflow = "";
  editingId = null;
}

/* Sets editor keeps its working state in the DOM rows. */
function renderSetsEditor(sets) {
  const wrap = $("setsList");
  wrap.innerHTML = "";
  sets.forEach((s) => wrap.appendChild(setRow(s.reps)));
  updateSetsSummary();
}

function setRow(reps) {
  const row = document.createElement("div");
  row.className = "set-row";

  const idx = document.createElement("div");
  idx.className = "set-index";
  row.appendChild(idx);

  const minus = document.createElement("button");
  minus.type = "button";
  minus.className = "stepper";
  minus.textContent = "−";

  const input = document.createElement("input");
  input.type = "number";
  input.inputMode = "numeric";
  input.min = "0";
  input.className = "rep-input";
  input.placeholder = "reps";
  if (reps != null) input.value = reps;

  const plus = document.createElement("button");
  plus.type = "button";
  plus.className = "stepper";
  plus.textContent = "+";

  minus.addEventListener("click", () => {
    input.value = Math.max(0, (parseInt(input.value) || 0) - 1);
    updateSetsSummary();
  });
  plus.addEventListener("click", () => {
    input.value = (parseInt(input.value) || 0) + 1;
    updateSetsSummary();
  });
  input.addEventListener("input", updateSetsSummary);

  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "set-remove";
  remove.textContent = "×";
  remove.addEventListener("click", () => {
    row.remove();
    reindexSets();
    updateSetsSummary();
  });

  row.appendChild(minus);
  row.appendChild(input);
  row.appendChild(plus);
  row.appendChild(remove);
  return row;
}

function reindexSets() {
  document.querySelectorAll("#setsList .set-index")
    .forEach((el, i) => { el.textContent = i + 1; });
}

function updateSetsSummary() {
  reindexSets();
  const reps = collectSets();
  const total = reps.reduce((a, s) => a + (s.reps || 0), 0);
  $("setsSummary").textContent = reps.length
    ? `${reps.length} sets · ${total} reps`
    : "";
}

function collectSets() {
  return [...document.querySelectorAll("#setsList .rep-input")].map(inp => ({
    reps: inp.value === "" ? 0 : parseInt(inp.value) || 0
  }));
}

$("addSetBtn").addEventListener("click", () => {
  // Prefill new set with the previous set's reps for fast logging.
  const existing = collectSets();
  const last = existing.length ? existing[existing.length - 1].reps : null;
  $("setsList").appendChild(setRow(last));
  updateSetsSummary();
});

$("fVariation").addEventListener("input", updateVariationChips);

$("sheetCancel").addEventListener("click", closeEditor);
$("sheetBackdrop").addEventListener("click", (e) => {
  if (e.target === $("sheetBackdrop")) closeEditor();
});

$("sheetSave").addEventListener("click", () => {
  const name = $("fExercise").value.trim();
  if (!name) { showToast("Enter an exercise name"); $("fExercise").focus(); return; }

  const variation = $("fVariation").value.trim();
  const tut = $("fTut").value.trim();
  const weight = $("fWeight").value.trim();
  const sets = collectSets();

  remember("exerciseNames", name);
  remember("variationNames", variation);

  const day = getDay(currentDate);
  if (editingId) {
    const ex = day.exercises.find(e => e.id === editingId);
    Object.assign(ex, {
      name, variation,
      tut: tut === "" ? null : parseInt(tut),
      weight: weight === "" ? null : parseFloat(weight),
      sets
    });
  } else {
    day.exercises.push({
      id: uid(),
      name, variation,
      tut: tut === "" ? null : parseInt(tut),
      weight: weight === "" ? null : parseFloat(weight),
      sets
    });
  }
  saveDB();
  closeEditor();
  render();
  showToast("Saved");
});

$("deleteExerciseBtn").addEventListener("click", () => {
  if (!editingId) return;
  const day = getDay(currentDate);
  day.exercises = day.exercises.filter(e => e.id !== editingId);
  saveDB();
  closeEditor();
  render();
  showToast("Deleted");
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
    day.exercises.push({ ...ex, id: uid(), sets: ex.sets.map(s => ({ ...s })) });
  });
  saveDB();
  render();
  showToast(`Copied from ${formatDateMain(src)}`);
});

/* ============================================================
   Data menu: export / import / clear
   ============================================================ */
$("menuBtn").addEventListener("click", () => { $("menuBackdrop").hidden = false; });
$("menuClose").addEventListener("click", () => { $("menuBackdrop").hidden = true; });
$("menuBackdrop").addEventListener("click", (e) => {
  if (e.target === $("menuBackdrop")) $("menuBackdrop").hidden = true;
});

$("exportBtn").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(db, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `gym-journal-${todayStr()}.json`;
  a.click();
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
      db = data;
      if (!db.exerciseNames) db.exerciseNames = [];
      if (!db.variationNames) db.variationNames = [];
      saveDB();
      render();
      $("menuBackdrop").hidden = true;
      showToast("Backup imported");
    } catch (err) {
      showToast("Invalid backup file");
    }
  };
  reader.readAsText(file);
  e.target.value = "";
});

$("clearDayBtn").addEventListener("click", () => {
  if (!confirm(`Clear everything logged for ${formatDateMain(currentDate)}?`)) return;
  delete db.days[currentDate];
  saveDB();
  render();
  $("menuBackdrop").hidden = true;
  showToast("Day cleared");
});

/* ============================================================
   Utilities
   ============================================================ */
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}
function escapeAttr(s) {
  return String(s).replace(/"/g, "&quot;");
}
let toastTimer;
function showToast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 1800);
}

/* ============================================================
   Boot
   ============================================================ */
refreshDatalists();
render();

/* Register service worker for offline support */
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}
