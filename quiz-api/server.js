const path = require("path");
const express = require("express");
const cors = require("cors");
const store = require("./src/store");

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_CODE = process.env.ADMIN_CODE || "0709";

app.set("trust proxy", 1);
app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public"), { extensions: ["html"] }));

/* ------------------------------ admin guard ------------------------------ */

function requireAdmin(req, res, next) {
  const code =
    req.headers["x-admin-code"] ||
    req.query.code ||
    (req.body && req.body.code);
  if (String(code || "") !== String(ADMIN_CODE)) {
    return res.status(401).json({ error: "Invalid admin code" });
  }
  next();
}

/* ------------------------------ public API ------------------------------- */

app.get("/api", (req, res) => {
  res.json({
    status: "active",
    name: "Quiz API",
    version: "1.0.0",
    endpoints: {
      categories: "GET /api/categories",
      question: "GET /api/question?category=&difficulty=&userId=",
      answer: "POST /api/answer { userId, questionId, answer, timeSpent, userName }",
      userUpdate: "POST /api/user/update { userId, name }",
      user: "GET /api/user/:userId",
      leaderboards: "GET /api/leaderboards?page=&limit=&sortBy=",
      categoryLeaderboard: "GET /api/leaderboard/category/:category?page=&limit=",
      dailyChallenge: "GET /api/challenge/daily?userId=",
      admin: "POST /api/admin/login, /api/admin/questions (GET/POST), /api/admin/questions/:id (PUT/DELETE), /api/admin/stats, /api/admin/users",
    },
  });
});

app.get("/api/health", (req, res) => res.json({ status: "ok", uptime: process.uptime() }));

app.get("/api/categories", (req, res) => {
  res.json(store.categories());
});

app.get("/api/categories/detailed", (req, res) => {
  const questions = store.allQuestions();
  const map = {};
  for (const q of questions) {
    const c = (map[q.category] ||= { category: q.category, count: 0, difficulties: {} });
    c.count += 1;
    c.difficulties[q.difficulty] = (c.difficulties[q.difficulty] || 0) + 1;
  }
  res.json(Object.values(map).sort((a, b) => a.category.localeCompare(b.category)));
});

app.get("/api/question", (req, res) => {
  const { category, difficulty, userId } = req.query;
  const q = store.pickQuestion({ category, difficulty, userId });
  if (!q) {
    return res.status(404).json({
      error: category
        ? `No question available for category "${category}"`
        : "No question available yet",
    });
  }
  res.json(store.publicQuestion(q));
});

app.post("/api/answer", (req, res) => {
  const { userId, questionId, answer, timeSpent, userName } = req.body || {};
  if (!userId || !questionId) {
    return res.status(400).json({ error: "userId and questionId are required" });
  }
  const result = store.submitAnswer({ userId, questionId, answer, timeSpent, userName });
  if (result.error) return res.status(400).json(result);
  res.json(result);
});

app.post("/api/user/update", (req, res) => {
  const { userId, name } = req.body || {};
  if (!userId) return res.status(400).json({ error: "userId is required" });
  store.updateUserName(userId, name);
  res.json(store.userProfile(userId));
});

app.get("/api/user/:userId", (req, res) => {
  const profile = store.userProfile(req.params.userId);
  if (!profile) {
    return res.json({ ...store.decorate(store.getUser(req.params.userId)), position: null, totalUsers: store.ranked().length, percentile: 0 });
  }
  res.json(profile);
});

app.get("/api/leaderboards", (req, res) => {
  const { page = 1, limit = 8, sortBy = "correct" } = req.query;
  const board = store.ranked(sortBy);
  const { rows, pagination } = store.paginate(board, page, limit);
  res.json({
    rankings: rows,
    users: rows,
    stats: {
      totalUsers: board.length,
      totalAnswers: board.reduce((s, u) => s + (u.total || 0), 0),
      totalCorrect: board.reduce((s, u) => s + (u.correct || 0), 0),
      sortBy,
    },
    pagination,
  });
});

app.get("/api/leaderboard/category/:category", (req, res) => {
  const { page = 1, limit = 10 } = req.query;
  const { rows, pagination } = store.categoryLeaderboard(req.params.category, page, limit);
  res.json({ users: rows, rankings: rows, pagination });
});

app.get("/api/challenge/daily", (req, res) => {
  const challenge = store.dailyChallenge(req.query.userId);
  if (!challenge) return res.status(404).json({ error: "No question available for the daily challenge" });
  res.json(challenge);
});

/* -------------------------------- admin API ------------------------------ */

app.post("/api/admin/login", (req, res) => {
  const code = (req.body && req.body.code) || "";
  if (String(code) !== String(ADMIN_CODE)) {
    return res.status(401).json({ error: "Invalid admin code" });
  }
  res.json({ ok: true, token: String(ADMIN_CODE) });
});

app.get("/api/admin/stats", requireAdmin, (req, res) => res.json(store.adminStats()));

app.get("/api/admin/questions", requireAdmin, (req, res) => {
  const { category, search } = req.query;
  let list = store.allQuestions();
  if (category) list = list.filter((q) => q.category === String(category).toLowerCase());
  if (search) {
    const s = String(search).toLowerCase();
    list = list.filter(
      (q) => q.question.toLowerCase().includes(s) || q.options.some((o) => o.toLowerCase().includes(s)),
    );
  }
  res.json(
    [...list].reverse().map((q) => ({
      ...q,
      answerLetter: String.fromCharCode(65 + q.answerIndex),
      answerText: q.options[q.answerIndex],
    })),
  );
});

app.post("/api/admin/questions", requireAdmin, (req, res) => {
  try {
    res.status(201).json(store.createQuestion(req.body));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post("/api/admin/questions/bulk", requireAdmin, (req, res) => {
  const items = Array.isArray(req.body?.questions) ? req.body.questions : [];
  const created = [];
  const errors = [];
  items.forEach((item, i) => {
    try {
      created.push(store.createQuestion(item));
    } catch (err) {
      errors.push({ index: i, error: err.message });
    }
  });
  res.json({ created: created.length, errors });
});

app.put("/api/admin/questions/:id", requireAdmin, (req, res) => {
  try {
    const updated = store.updateQuestion(req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: "Question not found" });
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete("/api/admin/questions/:id", requireAdmin, (req, res) => {
  if (!store.deleteQuestion(req.params.id)) return res.status(404).json({ error: "Question not found" });
  res.json({ ok: true });
});

app.get("/api/admin/users", requireAdmin, (req, res) => {
  const { page = 1, limit = 20, search = "" } = req.query;
  let rows = store.allUsers().map(store.decorate);
  if (search) {
    const s = String(search).toLowerCase();
    rows = rows.filter((u) => u.name.toLowerCase().includes(s) || u.userId.includes(s));
  }
  rows.sort((a, b) => (b.correct || 0) - (a.correct || 0));
  const { rows: pageRows, pagination } = store.paginate(rows, page, limit);
  res.json({ users: pageRows, pagination });
});

app.post("/api/admin/users/:userId/ban", requireAdmin, (req, res) => {
  const user = store.setBanned(req.params.userId, req.body?.banned !== false);
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json(user);
});

app.post("/api/admin/users/:userId/reset", requireAdmin, (req, res) => {
  const user = store.resetUser(req.params.userId);
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json(user);
});

app.post("/api/admin/users/:userId/xp", requireAdmin, (req, res) => {
  const user = store.grantXp(req.params.userId, req.body?.amount);
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json(user);
});

app.delete("/api/admin/users/:userId", requireAdmin, (req, res) => {
  if (!store.deleteUser(req.params.userId)) return res.status(404).json({ error: "User not found" });
  res.json({ ok: true });
});

app.get("/api/admin/export", requireAdmin, (req, res) => {
  res.json({ questions: store.allQuestions(), users: store.allUsers() });
});

/* -------------------------------- fallback ------------------------------- */

app.use("/api", (req, res) => res.status(404).json({ error: "Unknown endpoint" }));

app.use((req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err.message || "Internal server error" });
});

store
  .init()
  .then(() => {
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Quiz API listening on http://0.0.0.0:${PORT}`);
    });
  })
  .catch((err) => {
    console.error("Startup failed:", err);
    process.exit(1);
  });
