const $ = (s) => document.querySelector(s);
const cap = (s) => (s || "").charAt(0).toUpperCase() + (s || "").slice(1);

let CODE = sessionStorage.getItem("adminCode") || "";
let editingId = null;

const api = async (url, opts = {}) => {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json", "x-admin-code": CODE, ...(opts.headers || {}) },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
};

function toast(msg) {
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2600);
}

/* -------------------------------- login --------------------------------- */
async function login(code) {
  const res = await fetch("/api/admin/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });
  if (!res.ok) throw new Error("Invalid admin code");
  CODE = code;
  sessionStorage.setItem("adminCode", code);
  $("#view-login").classList.add("hide");
  $("#adminNav").classList.remove("hide");
  show("dash");
  await refreshAll();
}

$("#loginBtn").addEventListener("click", async () => {
  try {
    await login($("#code").value.trim());
  } catch (err) {
    $("#loginErr").textContent = `⚠️ ${err.message}`;
  }
});
$("#code").addEventListener("keydown", (e) => e.key === "Enter" && $("#loginBtn").click());
$("#logout").addEventListener("click", () => {
  sessionStorage.removeItem("adminCode");
  location.reload();
});

/* -------------------------------- routing ------------------------------- */
function show(view) {
  document.querySelectorAll("section[id^=view-]").forEach((s) => s.classList.add("hide"));
  $(`#view-${view}`).classList.remove("hide");
  document.querySelectorAll("#adminNav button[data-view]").forEach((b) =>
    b.classList.toggle("active", b.dataset.view === view));
  if (view === "dash") loadStats();
  if (view === "questions") loadQuestions();
  if (view === "users") loadUsers();
}
document.querySelectorAll("#adminNav button[data-view]").forEach((b) =>
  b.addEventListener("click", () => show(b.dataset.view)));

/* ------------------------------- dashboard ------------------------------ */
async function loadStats() {
  const s = await api("/api/admin/stats");
  $("#statGrid").innerHTML = [
    ["📚", s.totalQuestions, "Questions"],
    ["🗂️", Object.keys(s.categories).length, "Categories"],
    ["👥", s.totalUsers, "Players"],
    ["🎮", s.activePlayers, "Active players"],
    ["📝", s.totalAnswers, "Answers"],
    ["✅", s.totalCorrect, "Correct"],
    ["🚫", s.bannedUsers, "Banned"],
  ].map(([i, v, l]) => `<div class="stat"><b>${i} ${v}</b><small>${l}</small></div>`).join("");

  $("#catTable").innerHTML =
    `<thead><tr><th>Category</th><th>Questions</th></tr></thead><tbody>` +
    Object.entries(s.categories).sort((a, b) => b[1] - a[1])
      .map(([c, n]) => `<tr><td>${cap(c)}</td><td>${n}</td></tr>`).join("") +
    `</tbody>`;

  $("#topTable").innerHTML =
    `<thead><tr><th>#</th><th>Player</th><th>Correct</th><th>Acc.</th></tr></thead><tbody>` +
    (s.topPlayers.map((u, i) => `<tr><td>${i + 1}</td><td>${u.name}</td><td>${u.correct}</td><td>${u.accuracy}%</td></tr>`).join("") ||
      `<tr><td colspan="4" class="muted">No player yet</td></tr>`) +
    `</tbody>`;
}

/* ----------------------------- question form ---------------------------- */
function optionRow(i, value = "", checked = false) {
  return `<div class="row" style="margin-top:8px">
    <input type="radio" name="correct" value="${i}" ${checked ? "checked" : ""} style="width:auto" title="Correct answer" />
    <span class="badge">${String.fromCharCode(65 + i)}</span>
    <input class="optInput" placeholder="Option ${String.fromCharCode(65 + i)}" value="${value.replace(/"/g, "&quot;")}" style="flex:1;min-width:160px" />
  </div>`;
}

function renderOptions(options = ["", "", "", ""], answerIndex = 0) {
  $("#optionFields").innerHTML =
    `<label>Options & correct answer</label>` +
    options.map((o, i) => optionRow(i, o, i === answerIndex)).join("");
}

$("#addOption").addEventListener("click", () => {
  const values = [...document.querySelectorAll(".optInput")].map((i) => i.value);
  const checked = document.querySelector('input[name=correct]:checked');
  if (values.length >= 6) return toast("Maximum 6 options");
  renderOptions([...values, ""], checked ? Number(checked.value) : 0);
});

$("#fImage").addEventListener("input", () => {
  const url = $("#fImage").value.trim();
  $("#fPreview").classList.toggle("hide", !url);
  if (url) $("#fPreview").src = url;
});

function resetForm() {
  editingId = null;
  $("#formTitle").textContent = "➕ Add a question";
  $("#fCategory").value = "";
  $("#fDifficulty").value = "medium";
  $("#fImage").value = "";
  $("#fPreview").classList.add("hide");
  $("#fQuestion").value = "";
  renderOptions();
}
$("#resetForm").addEventListener("click", resetForm);

$("#saveQuestion").addEventListener("click", async () => {
  const checked = document.querySelector('input[name=correct]:checked');
  const body = {
    category: $("#fCategory").value.trim().toLowerCase() || "general",
    difficulty: $("#fDifficulty").value,
    question: $("#fQuestion").value.trim(),
    imageUrl: $("#fImage").value.trim(),
    options: [...document.querySelectorAll(".optInput")].map((i) => i.value.trim()),
    answerIndex: checked ? Number(checked.value) : 0,
  };
  try {
    if (editingId) {
      await api(`/api/admin/questions/${editingId}`, { method: "PUT", body });
      toast("✅ Question updated");
    } else {
      await api("/api/admin/questions", { method: "POST", body });
      toast("✅ Question added");
    }
    resetForm();
    await refreshAll();
    show("questions");
  } catch (err) {
    toast(`⚠️ ${err.message}`);
  }
});

$("#bulkBtn").addEventListener("click", async () => {
  try {
    const questions = JSON.parse($("#bulkJson").value);
    const res = await api("/api/admin/questions/bulk", { method: "POST", body: { questions } });
    toast(`✅ ${res.created} imported${res.errors.length ? `, ${res.errors.length} failed` : ""}`);
    $("#bulkJson").value = "";
    await refreshAll();
  } catch (err) {
    toast(`⚠️ ${err.message}`);
  }
});

/* ------------------------------- questions ------------------------------ */
async function loadCats() {
  const cats = await fetch("/api/categories").then((r) => r.json());
  $("#catList").innerHTML = cats.map((c) => `<option value="${c}"></option>`).join("");
  $("#qFilter").innerHTML =
    `<option value="">All categories</option>` +
    cats.map((c) => `<option value="${c}">${cap(c)}</option>`).join("");
}

async function loadQuestions() {
  const params = new URLSearchParams();
  if ($("#qFilter").value) params.set("category", $("#qFilter").value);
  if ($("#qSearch").value) params.set("search", $("#qSearch").value);
  const list = await api(`/api/admin/questions?${params}`);
  $("#qList").innerHTML = list.length
    ? list.map((q) => `<div class="qcard">
        ${q.imageUrl ? `<img src="${q.imageUrl}" alt="${cap(q.category)} question image" />` : ""}
        <div class="row" style="gap:6px"><span class="badge">${cap(q.category)}</span><span class="badge">${cap(q.difficulty)}</span>
        <span class="badge">asked ${q.stats?.asked || 0}×</span></div>
        <p style="margin:10px 0 0;font-weight:600">${q.question || "(image only)"}</p>
        <ul>${q.options.map((o, i) => `<li class="${i === q.answerIndex ? "good" : ""}">${String.fromCharCode(65 + i)}. ${o}${i === q.answerIndex ? " ✅" : ""}</li>`).join("")}</ul>
        <div class="row"><button class="btn small ghost" data-edit="${q._id}">✏️ Edit</button>
        <button class="btn small danger" data-del="${q._id}">🗑️ Delete</button></div>
      </div>`).join("")
    : `<p class="muted">No question found.</p>`;

  $("#qList").querySelectorAll("[data-del]").forEach((b) =>
    b.addEventListener("click", async () => {
      if (!confirm("Delete this question?")) return;
      await api(`/api/admin/questions/${b.dataset.del}`, { method: "DELETE" });
      toast("🗑️ Deleted");
      loadQuestions();
    }));

  $("#qList").querySelectorAll("[data-edit]").forEach((b) =>
    b.addEventListener("click", () => {
      const q = list.find((x) => x._id === b.dataset.edit);
      editingId = q._id;
      $("#formTitle").textContent = "✏️ Edit question";
      $("#fCategory").value = q.category;
      $("#fDifficulty").value = q.difficulty;
      $("#fImage").value = q.imageUrl || "";
      $("#fPreview").classList.toggle("hide", !q.imageUrl);
      if (q.imageUrl) $("#fPreview").src = q.imageUrl;
      $("#fQuestion").value = q.question;
      renderOptions(q.options, q.answerIndex);
      show("new");
      window.scrollTo({ top: 0, behavior: "smooth" });
    }));
}
$("#qFilter").addEventListener("change", loadQuestions);
$("#qSearch").addEventListener("input", () => {
  clearTimeout(window.__qs);
  window.__qs = setTimeout(loadQuestions, 250);
});

/* --------------------------------- users -------------------------------- */
async function loadUsers() {
  const res = await api(`/api/admin/users?limit=50&search=${encodeURIComponent($("#uSearch").value)}`);
  $("#userTable").innerHTML =
    `<thead><tr><th>Player</th><th>ID</th><th>Score</th><th>Acc.</th><th>Lv.</th><th>Streak</th><th>Actions</th></tr></thead><tbody>` +
    (res.users.map((u) => `<tr>
      <td>${u.banned ? "🚫 " : ""}${u.name}</td>
      <td class="muted">${u.userId}</td>
      <td>${u.correct}/${u.total}</td>
      <td>${u.accuracy}%</td>
      <td>${u.level}</td>
      <td>${u.currentStreak} / ${u.bestStreak}</td>
      <td><div class="row" style="gap:4px">
        <button class="btn small ghost" data-xp="${u.userId}">+500 XP</button>
        <button class="btn small ghost" data-ban="${u.userId}" data-banned="${u.banned}">${u.banned ? "Unban" : "Ban"}</button>
        <button class="btn small ghost" data-reset="${u.userId}">Reset</button>
        <button class="btn small danger" data-del="${u.userId}">Delete</button>
      </div></td></tr>`).join("") ||
      `<tr><td colspan="7" class="muted">No player yet</td></tr>`) +
    `</tbody>`;

  const act = async (sel, fn, msg) => {
    $("#userTable").querySelectorAll(`[${sel}]`).forEach((b) =>
      b.addEventListener("click", async () => {
        try {
          await fn(b);
          toast(msg);
          loadUsers();
        } catch (err) {
          toast(`⚠️ ${err.message}`);
        }
      }));
  };

  act("data-xp", (b) => api(`/api/admin/users/${b.dataset.xp}/xp`, { method: "POST", body: { amount: 500 } }), "✨ XP granted");
  act("data-ban", (b) => api(`/api/admin/users/${b.dataset.ban}/ban`, { method: "POST", body: { banned: b.dataset.banned !== "true" } }), "🚫 Updated");
  act("data-reset", (b) => {
    if (!confirm("Reset this player's stats?")) throw new Error("Cancelled");
    return api(`/api/admin/users/${b.dataset.reset}/reset`, { method: "POST" });
  }, "♻️ Stats reset");
  act("data-del", (b) => {
    if (!confirm("Delete this player?")) throw new Error("Cancelled");
    return api(`/api/admin/users/${b.dataset.del}`, { method: "DELETE" });
  }, "🗑️ Deleted");
}
$("#uSearch").addEventListener("input", () => {
  clearTimeout(window.__us);
  window.__us = setTimeout(loadUsers, 250);
});

/* --------------------------------- boot --------------------------------- */
async function refreshAll() {
  await loadCats();
  await loadStats();
}

renderOptions();
if (CODE) {
  login(CODE).catch(() => {
    sessionStorage.removeItem("adminCode");
    CODE = "";
  });
}
