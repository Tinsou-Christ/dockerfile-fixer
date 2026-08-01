/* ------------------------------- helpers ------------------------------- */
const api = async (url, opts = {}) => {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
};

const $ = (sel) => document.querySelector(sel);
const cap = (s) => (s || "").charAt(0).toUpperCase() + (s || "").slice(1);
const bar = (p) => "█".repeat(Math.round(p / 10)) + "░".repeat(10 - Math.round(p / 10));

function toast(msg) {
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2600);
}

const TITLES = [
  [50000, "🌟 Quiz Omniscient"], [25000, "👑 Quiz Deity"], [15000, "⚡ Quiz Titan"],
  [10000, "🏆 Quiz Legend"], [7500, "🎓 Grandmaster"], [5000, "👨‍🎓 Quiz Master"],
  [2500, "🔥 Quiz Expert"], [1500, "📚 Quiz Scholar"], [1000, "🎯 Quiz Apprentice"],
  [750, "🌟 Knowledge Seeker"], [500, "📖 Quick Learner"], [250, "🚀 Rising Star"],
  [100, "💡 Getting Started"], [50, "🎪 First Steps"], [25, "🌱 Newcomer"],
  [10, "🔰 Beginner"], [1, "👶 Rookie"],
];
const titleFor = (c) => (TITLES.find(([m]) => (c || 0) >= m) || [0, "🆕 New Player"])[1];

const SUCCESS = [
  "🎯 ABSOLUTELY CORRECT! You're a genius! ✨",
  "⚡ PERFECT! Quiz master in the making! 🏆",
  "🔥 FANTASTIC! You nailed it! 🎯",
  "🌟 BRAVO! Simple but effective! ⭐",
  "🎊 EXCELLENT! Quick and correct! 🚀",
];
const FAILURE = [
  "💔 Aww! That one was tricky! 🤔",
  "🌱 Oops! No worries, keep learning! 📚",
  "🔄 Not quite! Sometimes it's a guess! 🎲",
  "⭐ Wrong! Practice makes perfect! 💪",
  "💫 Miss! Even masters miss sometimes! 🌟",
];
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

/* -------------------------------- player -------------------------------- */
const state = {
  userId: localStorage.getItem("quizUserId") || `web_${Math.random().toString(36).slice(2, 10)}`,
  name: localStorage.getItem("quizName") || "",
  current: null,
  timer: null,
  answered: false,
  startTime: 0,
  session: { correct: 0, total: 0, streak: 0, xp: 0 },
  lbPage: 1,
};
localStorage.setItem("quizUserId", state.userId);

async function syncName() {
  const val = ($("#nickname").value || "").trim();
  if (val) {
    state.name = val;
    localStorage.setItem("quizName", val);
  }
  if (!state.name) state.name = "Web Player";
  await api("/api/user/update", { method: "POST", body: { userId: state.userId, name: state.name } });
}

/* -------------------------------- routing ------------------------------- */
function show(view) {
  document.querySelectorAll("section[id^=view-]").forEach((s) => s.classList.add("hide"));
  $(`#view-${view}`).classList.remove("hide");
  document.querySelectorAll("nav button[data-view]").forEach((b) =>
    b.classList.toggle("active", b.dataset.view === view));
  if (view === "leaderboard") loadLeaderboard();
  if (view === "profile") loadProfile();
}
document.querySelectorAll("nav button[data-view]").forEach((b) =>
  b.addEventListener("click", () => show(b.dataset.view)));

/* ------------------------------ categories ------------------------------ */
let categories = [];

async function loadCategories() {
  const detailed = await api("/api/categories/detailed");
  categories = detailed;

  $("#catGrid").innerHTML = detailed
    .map(
      (c) => `<button class="cat" data-cat="${c.category}">
        <b>${icon(c.category)} ${cap(c.category)}</b>
        <small>${c.count} question${c.count > 1 ? "s" : ""}</small>
      </button>`,
    )
    .join("");
  $("#catGrid").querySelectorAll(".cat").forEach((b) =>
    b.addEventListener("click", () => startQuiz(b.dataset.cat)));

  $("#playCategory").innerHTML =
    `<option value="">Any category</option>` +
    detailed.map((c) => `<option value="${c.category}">${cap(c.category)}</option>`).join("");
  $("#lbScope").innerHTML =
    `<option value="global">Global</option>` +
    detailed.map((c) => `<option value="${c.category}">${cap(c.category)}</option>`).join("");
}

function icon(cat) {
  return {
    anime: "🎌", flag: "🏁", torf: "⚖️", general: "🧠", science: "🔬",
    cartoon: "📺", animaux: "🐾", monument: "🏛️", cinema: "🎬", histoire: "📜",
    histoire_: "🏛️", geographie: "🌍", sport: "⚽", maths: "➗", culture: "🎓",
  }[cat] || "📚";
}

async function loadHomeStats() {
  const lb = await api("/api/leaderboards?page=1&limit=1");
  const total = categories.reduce((s, c) => s + c.count, 0);
  $("#homeStats").innerHTML = [
    ["📚", total, "Questions"],
    ["🗂️", categories.length, "Categories"],
    ["👥", lb.stats.totalUsers, "Players"],
    ["🎮", lb.stats.totalAnswers, "Answers given"],
    ["✅", lb.stats.totalCorrect, "Correct answers"],
  ].map(([i, v, l]) => `<div class="stat"><b>${i} ${v}</b><small>${l}</small></div>`).join("");
}

/* --------------------------------- play --------------------------------- */
async function startQuiz(category = "", difficulty = "") {
  await syncName();
  $("#playCategory").value = category || "";
  $("#playDifficulty").value = difficulty || "";
  show("play");
  loadQuestion();
}

async function loadQuestion(daily = false) {
  clearInterval(state.timer);
  $("#resultBox").innerHTML = "";
  $("#questionBox").innerHTML = `<p class="muted">Loading question…</p>`;
  state.answered = false;

  try {
    let q, extra = "";
    if (daily) {
      const res = await api(`/api/challenge/daily?userId=${encodeURIComponent(state.userId)}`);
      q = res.question;
      extra = `🌟 Daily challenge · ${res.challengeDate} · +${res.reward} bonus XP · 🔥 streak ${res.streak}`;
    } else {
      const params = new URLSearchParams({ userId: state.userId });
      const cat = $("#playCategory").value;
      const diff = $("#playDifficulty").value;
      if (cat) params.set("category", cat);
      if (diff) params.set("difficulty", diff);
      q = await api(`/api/question?${params}`);
    }
    state.current = q;
    renderQuestion(q, extra);
  } catch (err) {
    $("#questionBox").innerHTML = `<p class="result no">⚠️ ${err.message}</p>`;
  }
}

function renderQuestion(q, extra) {
  const image = q.imageUrl || (q.category === "flag" ? q.question : null);
  const label = q.category === "flag" ? "🌍 Guess this country's flag" :
    q.category === "anime" ? `❔ Hint: ${q.hint || q.question}` : q.question;

  $("#playBadges").innerHTML = [
    `${icon(q.category)} ${cap(q.category)}`,
    `🎚️ ${cap(q.difficulty)}`,
    extra || "⏰ 30 seconds",
  ].map((b) => `<span class="badge">${b}</span>`).join("");

  $("#questionBox").innerHTML =
    (image ? `<img class="q-image" src="${image}" alt="${cap(q.category)} quiz image" />` : "") +
    `<div class="q-text">${label}</div>` +
    `<div class="options">` +
    q.options.map((opt, i) =>
      `<button class="opt" data-i="${i}"><span class="letter">${String.fromCharCode(65 + i)}</span><span>${opt}</span></button>`).join("") +
    `</div>`;

  $("#questionBox").querySelectorAll(".opt").forEach((b) =>
    b.addEventListener("click", () => answer(Number(b.dataset.i))));

  state.startTime = Date.now();
  runTimer();
}

function runTimer() {
  const total = 30000;
  state.timer = setInterval(() => {
    const left = Math.max(0, total - (Date.now() - state.startTime));
    $("#timerBar").style.width = `${(left / total) * 100}%`;
    if (left <= 0) {
      clearInterval(state.timer);
      if (!state.answered) timeUp();
    }
  }, 150);
}

function timeUp() {
  state.answered = true;
  const q = state.current;
  lock(q.answerLetter ? q.answerLetter.charCodeAt(0) - 65 : -1, -1);
  $("#resultBox").innerHTML =
    `<div class="result no">⏰ Time's up! The correct answer was: ${q.answerLetter}. ${q.answerText}</div>`;
}

async function answer(index) {
  if (state.answered) return;
  state.answered = true;
  clearInterval(state.timer);
  const timeSpent = (Date.now() - state.startTime) / 1000;
  const q = state.current;

  try {
    const res = await api("/api/answer", {
      method: "POST",
      body: {
        userId: state.userId,
        questionId: q._id,
        answer: String.fromCharCode(65 + index),
        timeSpent,
        userName: state.name || "Web Player",
      },
    });
    const correctIndex = q.options.findIndex((o) => o === res.correctAnswerText);
    lock(correctIndex, index);

    const u = res.user;
    state.session.total += 1;
    if (res.correct) state.session.correct += 1;
    state.session.streak = u.currentStreak || 0;
    state.session.xp = u.totalXp || 0;
    updateSession();

    if (res.correct) {
      $("#resultBox").innerHTML = `<div class="result ok">${pick(SUCCESS)}
━━━━━━━━━
🎉 Congratulations, ${u.name}!
✨ XP gained: +${res.xpGained}
📊 Score: ${u.correct}/${u.total} (${u.accuracy}%)
🔥 Streak: ${u.currentStreak}
⚡ Response time: ${timeSpent.toFixed(1)}s
🎯 XP progress: ${u.xp}/1000 ${bar((u.xp / 1000) * 100)}
🎖️ ${titleFor(u.correct)}${u.currentStreak >= 5 ? "\n🔥 Amazing streak! Keep it going! 🚀" : ""}</div>`;
    } else {
      $("#resultBox").innerHTML = `<div class="result no">${pick(FAILURE)}
━━━━━━━━━
🎯 Correct answer: ${res.correctAnswer}. ${res.correctAnswerText} ✅
📊 Score: ${u.correct}/${u.total} (${u.accuracy}%)
💔 Streak reset
👤 ${u.name}</div>`;
    }

    if (u.achievements && u.achievements.length) {
      setTimeout(() => toast(`🏆 Achievement unlocked: ${u.achievements.join(", ")} (+100 XP)`), 500);
    }
  } catch (err) {
    $("#resultBox").innerHTML = `<div class="result no">⚠️ ${err.message}</div>`;
  }
}

function lock(correctIndex, chosen) {
  $("#questionBox").querySelectorAll(".opt").forEach((b) => {
    const i = Number(b.dataset.i);
    b.disabled = true;
    if (i === correctIndex) b.classList.add("correct");
    else if (i === chosen) b.classList.add("wrong");
  });
}

function updateSession() {
  $("#sessionScore").textContent = `${state.session.correct} / ${state.session.total}`;
  $("#sessionStreak").textContent = `${state.session.streak} 🔥`;
  $("#sessionXp").textContent = `${state.session.xp} ✨`;
}

/* ----------------------------- leaderboard ----------------------------- */
async function loadLeaderboard() {
  const scope = $("#lbScope").value;
  const sort = $("#lbSort").value;
  try {
    if (scope === "global") {
      const res = await api(`/api/leaderboards?page=${state.lbPage}&limit=10&sortBy=${sort}`);
      const rows = res.rankings;
      $("#lbBox").innerHTML = rows.length
        ? rows.map((u, i) => {
            const pos = (res.pagination.currentPage - 1) * res.pagination.limit + i + 1;
            const crown = pos === 1 ? "👑" : pos === 2 ? "🥈" : pos === 3 ? "🥉" : pos <= 10 ? "🏅" : "🎯";
            return `<div class="lb-row"><div class="pos">${crown}<br><small class="muted">#${pos}</small></div>
              <div class="who"><b>${u.name}</b>
              <small class="muted">${titleFor(u.correct)} · Lv.${u.level} · ✨ ${u.totalXp} XP</small><br>
              <small class="muted">✅ ${u.correct} / ❌ ${u.wrong} · ${u.accuracy}% · 🔥 best ${u.bestStreak} · ⚡ ${u.avgResponseTime.toFixed(1)}s</small></div></div>`;
          }).join("")
        : `<p class="muted">No player yet — be the first to play!</p>`;
      $("#lbPage").textContent = `Page ${res.pagination.currentPage}/${res.pagination.totalPages} · ${res.pagination.totalUsers} players`;
    } else {
      const res = await api(`/api/leaderboard/category/${scope}?page=${state.lbPage}&limit=10`);
      $("#lbBox").innerHTML = res.users.length
        ? res.users.map((u, i) => {
            const pos = (res.pagination.currentPage - 1) * res.pagination.limit + i + 1;
            const crown = pos === 1 ? "👑" : pos === 2 ? "🥈" : pos === 3 ? "🥉" : "🏅";
            return `<div class="lb-row"><div class="pos">${crown}<br><small class="muted">#${pos}</small></div>
              <div class="who"><b>${u.name}</b><small class="muted">${u.title} · ${u.correct}/${u.total} (${u.accuracy}%)</small></div></div>`;
          }).join("")
        : `<p class="muted">No player in ${cap(scope)} yet.</p>`;
      $("#lbPage").textContent = `Page ${res.pagination.currentPage}/${res.pagination.totalPages} · ${res.pagination.totalUsers} players`;
    }
  } catch (err) {
    $("#lbBox").innerHTML = `<p class="result no">⚠️ ${err.message}</p>`;
  }
}

$("#lbPrev").addEventListener("click", () => { state.lbPage = Math.max(1, state.lbPage - 1); loadLeaderboard(); });
$("#lbNext").addEventListener("click", () => { state.lbPage += 1; loadLeaderboard(); });
$("#lbScope").addEventListener("change", () => { state.lbPage = 1; loadLeaderboard(); });
$("#lbSort").addEventListener("change", () => { state.lbPage = 1; loadLeaderboard(); });

/* -------------------------------- profile ------------------------------- */
async function loadProfile() {
  const u = await api(`/api/user/${encodeURIComponent(state.userId)}`);
  if (!u.total) {
    $("#profileBox").innerHTML = `<h2>👤 ${u.name || "New player"}</h2>
      <p class="muted">You haven't played yet. Jump into a random quiz to start building your profile!</p>
      <button class="btn accent" onclick="document.querySelector('[data-view=home]').click()">Start playing</button>`;
    return;
  }
  $("#profileBox").innerHTML = `
    <h2>🎮 Quiz profile</h2>
    <p class="lead">${u.name} · ${titleFor(u.correct)} · Global rank #${u.position ?? "N/A"}/${u.totalUsers}</p>
    <p class="muted">📈 Percentile: ${bar(u.percentile)} ${u.percentile}%</p>
    <div class="grid stats" style="margin-top:14px">
      ${[["✅", u.correct, "Correct"], ["❌", u.wrong, "Wrong"], ["📝", u.total, "Total"],
        ["🎯", u.accuracy + "%", "Accuracy"], ["⚡", u.avgResponseTime.toFixed(1) + "s", "Avg time"],
        ["🌟", "Lv." + u.level, "Level"], ["✨", u.xp + "/1000", "XP progress"],
        ["🔥", u.currentStreak, "Current streak"], ["🏅", u.bestStreak, "Best streak"],
        ["🚀", (u.fastestResponse || 0).toFixed(1) + "s", "Fastest"],
        ["🌙", (u.dailyStreak || 0), "Daily streak"],
        ["🏆", (u.unlocked || []).length, "Achievements"]]
        .map(([i, v, l]) => `<div class="stat"><b>${i} ${v}</b><small>${l}</small></div>`).join("")}
    </div>
    <h3 style="margin-top:18px">Per-category performance</h3>
    <div class="scroll"><table><thead><tr><th>Category</th><th>Correct</th><th>Total</th><th>Accuracy</th></tr></thead><tbody>
      ${Object.entries(u.categories || {}).map(([c, s]) =>
        `<tr><td>${icon(c)} ${cap(c)}</td><td>${s.correct}</td><td>${s.total}</td><td>${s.total ? Math.round((s.correct / s.total) * 100) : 0}%</td></tr>`).join("") ||
        `<tr><td colspan="4" class="muted">No data</td></tr>`}
    </tbody></table></div>
    <p class="muted" style="margin-top:14px">🎯 Next milestone: ${u.nextMilestone}</p>`;
}

/* --------------------------------- boot --------------------------------- */
$("#nickname").value = state.name;
$("#startRandom").addEventListener("click", () => startQuiz());
$("#startDaily").addEventListener("click", async () => { await syncName(); show("play"); loadQuestion(true); });
$("#nextQuestion").addEventListener("click", () => loadQuestion());
$("#playCategory").addEventListener("change", () => loadQuestion());
$("#playDifficulty").addEventListener("change", () => loadQuestion());
$("#baseUrl").textContent = `${location.origin}/api`;

document.addEventListener("keydown", (e) => {
  if ($("#view-play").classList.contains("hide") || state.answered) return;
  const i = ["a", "b", "c", "d"].indexOf(e.key.toLowerCase());
  if (i >= 0 && state.current && i < state.current.options.length) answer(i);
});

(async () => {
  try {
    await loadCategories();
    await loadHomeStats();
    updateSession();
  } catch (err) {
    toast(`⚠️ ${err.message}`);
  }
})();
