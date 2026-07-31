const fs = require("fs");
const path = require("path");
const { seedQuestions } = require("./seed");
const mongo = require("./mongo");

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "..", "data");
const DB_FILE = path.join(DATA_DIR, "db.json");

const DEFAULT_DB = {
  questions: [],
  users: {},
  daily: {},
  meta: { createdAt: new Date().toISOString(), seeded: false },
};

let db = null;
let saveTimer = null;

function load() {
  if (db) return db;
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    if (fs.existsSync(DB_FILE)) {
      db = JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
      for (const k of Object.keys(DEFAULT_DB)) if (db[k] === undefined) db[k] = DEFAULT_DB[k];
    } else {
      db = JSON.parse(JSON.stringify(DEFAULT_DB));
    }
  } catch (err) {
    console.error("DB load failed, starting fresh:", err.message);
    db = JSON.parse(JSON.stringify(DEFAULT_DB));
  }

  if (!db.meta.seeded && db.questions.length === 0) {
    db.questions = seedQuestions();
    db.meta.seeded = true;
    save(true);
  }
  return db;
}

/**
 * Connect to MongoDB (when MONGODB_URI is set) and use it as the source of
 * truth. Must be awaited before the HTTP server starts serving traffic.
 */
async function init() {
  await mongo.connect();

  if (mongo.isEnabled()) {
    const remote = await mongo.loadState();
    if (remote) {
      db = remote;
      for (const k of Object.keys(DEFAULT_DB)) if (db[k] === undefined) db[k] = DEFAULT_DB[k];
      console.log(
        `[store] loaded from MongoDB: ${db.questions.length} questions, ${Object.keys(db.users).length} players`,
      );
    } else {
      load(); // seeds if empty
      await mongo.saveState(db);
      console.log("[store] MongoDB was empty — initial state uploaded");
    }
    return db;
  }

  return load();
}

function save(immediate = false) {
  if (immediate) {
    writeNow();
    return;
  }
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    writeNow();
  }, 400);
}

function writeNow() {
  if (mongo.isEnabled()) {
    mongo.saveState(db).catch((err) => console.error("[mongo] async save failed:", err.message));
    return;
  }
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const tmp = DB_FILE + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
    fs.renameSync(tmp, DB_FILE);
  } catch (err) {
    console.error("DB save failed:", err.message);
  }
}


function newId() {
  return (
    Date.now().toString(16) + Math.random().toString(16).slice(2, 10)
  ).padEnd(24, "0").slice(0, 24);
}

/* ------------------------------- questions ------------------------------- */

function allQuestions() {
  return load().questions;
}

function categories() {
  const set = new Set(allQuestions().map((q) => String(q.category).toLowerCase()));
  return [...set].sort();
}

function getQuestion(id) {
  return allQuestions().find((q) => q._id === id) || null;
}

function normalizeQuestion(input, existing = null) {
  const options = (input.options || [])
    .map((o) => String(o == null ? "" : o).trim())
    .filter((o) => o.length > 0);

  const category = String(input.category || "general").trim().toLowerCase();
  const isTorf = category === "torf";
  const finalOptions = isTorf ? ["True", "False"] : options;

  if (!String(input.question || "").trim() && !input.imageUrl) {
    throw new Error("A question text (or an image) is required");
  }
  if (finalOptions.length < 2) throw new Error("At least 2 options are required");

  let answerIndex = Number(input.answerIndex);
  if (Number.isNaN(answerIndex) && typeof input.answer === "string") {
    const letter = input.answer.trim().toUpperCase();
    answerIndex = /^[A-Z]$/.test(letter)
      ? letter.charCodeAt(0) - 65
      : finalOptions.findIndex((o) => o.toLowerCase() === input.answer.trim().toLowerCase());
  }
  if (Number.isNaN(answerIndex) || answerIndex < 0 || answerIndex >= finalOptions.length) {
    throw new Error("A valid correct answer must be selected");
  }

  const difficulty = ["easy", "medium", "hard"].includes(String(input.difficulty).toLowerCase())
    ? String(input.difficulty).toLowerCase()
    : "medium";

  return {
    _id: existing ? existing._id : newId(),
    category,
    difficulty,
    question: String(input.question || "").trim(),
    options: finalOptions,
    answerIndex,
    imageUrl: String(input.imageUrl || "").trim() || null,
    stats: existing?.stats || { asked: 0, correct: 0 },
    createdAt: existing?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function createQuestion(input) {
  const q = normalizeQuestion(input);
  load().questions.push(q);
  save();
  return q;
}

function updateQuestion(id, input) {
  const list = load().questions;
  const idx = list.findIndex((q) => q._id === id);
  if (idx === -1) return null;
  list[idx] = normalizeQuestion(input, list[idx]);
  save();
  return list[idx];
}

function deleteQuestion(id) {
  const list = load().questions;
  const idx = list.findIndex((q) => q._id === id);
  if (idx === -1) return false;
  list.splice(idx, 1);
  save();
  return true;
}

/**
 * Public shape sent to clients / the bot.
 * - image categories (flag, anime): `answer` is the option TEXT (the bot maps letter -> text)
 * - everything else: `answer` is the LETTER (A/B/C/D)
 */
function publicQuestion(q) {
  const letter = String.fromCharCode(65 + q.answerIndex);
  const text = q.options[q.answerIndex];
  const usesText = q.category === "flag" || q.category === "anime";
  return {
    _id: q._id,
    category: q.category,
    difficulty: q.difficulty,
    question: q.category === "flag" && q.imageUrl ? q.imageUrl : q.question,
    hint: q.question,
    options: q.options,
    answer: usesText ? text : letter,
    answerLetter: letter,
    answerText: text,
    imageUrl: q.imageUrl,
  };
}

function pickQuestion({ category, difficulty, userId }) {
  let pool = allQuestions();
  if (category) pool = pool.filter((q) => q.category === String(category).toLowerCase());
  if (difficulty) pool = pool.filter((q) => q.difficulty === String(difficulty).toLowerCase());
  if (!pool.length) return null;

  if (userId) {
    const user = getUser(userId, { create: false });
    const recent = new Set(user?.recent || []);
    const fresh = pool.filter((q) => !recent.has(q._id));
    if (fresh.length) pool = fresh;
  }
  const q = pool[Math.floor(Math.random() * pool.length)];

  if (userId) {
    const user = getUser(userId);
    user.recent = [q._id, ...(user.recent || [])].slice(0, 30);
    save();
  }
  q.stats.asked = (q.stats.asked || 0) + 1;
  save();
  return q;
}

/* --------------------------------- users --------------------------------- */

const TITLES = [
  [50000, "🌟 Quiz Omniscient"], [25000, "👑 Quiz Deity"], [15000, "⚡ Quiz Titan"],
  [10000, "🏆 Quiz Legend"], [7500, "🎓 Grandmaster"], [5000, "👨‍🎓 Quiz Master"],
  [2500, "🔥 Quiz Expert"], [1500, "📚 Quiz Scholar"], [1000, "🎯 Quiz Apprentice"],
  [750, "🌟 Knowledge Seeker"], [500, "📖 Quick Learner"], [250, "🚀 Rising Star"],
  [100, "💡 Getting Started"], [50, "🎪 First Steps"], [25, "🌱 Newcomer"],
  [10, "🔰 Beginner"], [1, "👶 Rookie"],
];

function getTitle(correct) {
  for (const [min, title] of TITLES) if ((correct || 0) >= min) return title;
  return "🆕 New Player";
}

const MILESTONES = [10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000];

const ACHIEVEMENTS = [
  { id: "first_blood", label: "First Blood — first correct answer", test: (u) => u.correct >= 1 },
  { id: "ten_correct", label: "Warming Up — 10 correct answers", test: (u) => u.correct >= 10 },
  { id: "fifty_correct", label: "Half Century — 50 correct answers", test: (u) => u.correct >= 50 },
  { id: "hundred_correct", label: "Centurion — 100 correct answers", test: (u) => u.correct >= 100 },
  { id: "streak_5", label: "On Fire — 5 answer streak", test: (u) => u.bestStreak >= 5 },
  { id: "streak_10", label: "Unstoppable — 10 answer streak", test: (u) => u.bestStreak >= 10 },
  { id: "streak_25", label: "Legendary Streak — 25 answer streak", test: (u) => u.bestStreak >= 25 },
  { id: "speedster", label: "Speedster — answered in under 3s", test: (u) => u.fastestResponse > 0 && u.fastestResponse <= 3 },
  { id: "sharpshooter", label: "Sharpshooter — 90% accuracy over 50 games", test: (u) => u.total >= 50 && u.correct / u.total >= 0.9 },
  { id: "daily_devotee", label: "Daily Devotee — 7 day challenge streak", test: (u) => (u.dailyStreak || 0) >= 7 },
];

function blankUser(userId, name) {
  return {
    userId: String(userId),
    name: name || "Anonymous Player",
    correct: 0,
    wrong: 0,
    total: 0,
    questionsAnswered: 0,
    totalXp: 0,
    currentStreak: 0,
    bestStreak: 0,
    totalResponseTime: 0,
    fastestResponse: 0,
    slowestResponse: 0,
    gamesPlayed: 0,
    perfectGames: 0,
    longestSession: 0,
    totalPlayTime: 0,
    categories: {},
    unlocked: [],
    dailyStreak: 0,
    lastDaily: null,
    banned: false,
    recent: [],
    createdAt: new Date().toISOString(),
    lastPlayed: null,
  };
}

function getUser(userId, { create = true } = {}) {
  const store = load();
  const id = String(userId);
  if (!store.users[id]) {
    if (!create) return null;
    store.users[id] = blankUser(id);
    save();
  }
  return store.users[id];
}

function updateUserName(userId, name) {
  const user = getUser(userId);
  if (name && String(name).trim()) user.name = String(name).trim().slice(0, 60);
  save();
  return user;
}

function allUsers() {
  return Object.values(load().users);
}

function decorate(user) {
  const total = user.total || 0;
  const accuracy = total ? Math.round((user.correct / total) * 100) : 0;
  const avgResponseTime = user.questionsAnswered
    ? user.totalResponseTime / user.questionsAnswered
    : 0;
  const level = Math.floor((user.totalXp || 0) / 1000) + 1;
  const xp = (user.totalXp || 0) % 1000;
  const nextMilestone = MILESTONES.find((m) => m > (user.correct || 0));

  return {
    ...user,
    accuracy,
    avgResponseTime,
    level,
    xp,
    title: getTitle(user.correct),
    nextMilestone: nextMilestone ? `${nextMilestone} correct answers` : "You are a legend!",
  };
}

function ranked(sortBy = "correct") {
  const sorters = {
    correct: (a, b) => (b.correct || 0) - (a.correct || 0) || (b.totalXp || 0) - (a.totalXp || 0),
    accuracy: (a, b) => decorate(b).accuracy - decorate(a).accuracy || (b.correct || 0) - (a.correct || 0),
    streak: (a, b) => (b.bestStreak || 0) - (a.bestStreak || 0) || (b.correct || 0) - (a.correct || 0),
    level: (a, b) => (b.totalXp || 0) - (a.totalXp || 0),
    xp: (a, b) => (b.totalXp || 0) - (a.totalXp || 0),
  };
  return allUsers()
    .filter((u) => (u.total || 0) > 0 && !u.banned)
    .sort(sorters[sortBy] || sorters.correct)
    .map(decorate);
}

function userProfile(userId) {
  const user = getUser(userId, { create: false });
  if (!user) return null;
  const board = ranked("correct");
  const position = board.findIndex((u) => u.userId === String(userId)) + 1;
  const totalUsers = board.length;
  const percentile = position && totalUsers
    ? Math.round(((totalUsers - position + 1) / totalUsers) * 100)
    : 0;
  return {
    ...decorate(user),
    position: position || null,
    totalUsers,
    percentile,
    achievements: [],
  };
}

function categoryLeaderboard(category, page = 1, limit = 10) {
  const cat = String(category).toLowerCase();
  const rows = allUsers()
    .filter((u) => u.categories?.[cat]?.total > 0 && !u.banned)
    .map((u) => {
      const c = u.categories[cat];
      return {
        userId: u.userId,
        name: u.name,
        correct: c.correct || 0,
        total: c.total || 0,
        accuracy: c.total ? Math.round((c.correct / c.total) * 100) : 0,
        title: getTitle(c.correct || 0),
      };
    })
    .sort((a, b) => b.correct - a.correct || b.accuracy - a.accuracy);

  return paginate(rows, page, limit);
}

function paginate(rows, page, limit) {
  const currentPage = Math.max(1, parseInt(page, 10) || 1);
  const perPage = Math.min(50, Math.max(1, parseInt(limit, 10) || 10));
  const totalPages = Math.max(1, Math.ceil(rows.length / perPage));
  const start = (currentPage - 1) * perPage;
  return {
    rows: rows.slice(start, start + perPage),
    pagination: {
      currentPage,
      totalPages,
      totalUsers: rows.length,
      limit: perPage,
      hasNext: currentPage < totalPages,
      hasPrev: currentPage > 1,
    },
  };
}

/* -------------------------------- answering ------------------------------- */

function xpFor(difficulty, timeSpent, streak) {
  let xp = difficulty === "hard" ? 25 : difficulty === "easy" ? 10 : 15;
  if (timeSpent <= 5) xp += 5;
  if (streak >= 5) xp += 5;
  if (streak >= 10) xp += 10;
  return xp;
}

function isCorrectAnswer(question, rawAnswer) {
  const given = String(rawAnswer == null ? "" : rawAnswer).trim();
  if (!given) return false;
  const letter = String.fromCharCode(65 + question.answerIndex);
  const text = question.options[question.answerIndex] || "";
  if (given.toUpperCase() === letter) return true;
  if (given.toLowerCase() === text.toLowerCase()) return true;
  if (question.category === "torf") {
    const asBool = given.toLowerCase();
    if (["true", "vrai"].includes(asBool)) return question.answerIndex === 0;
    if (["false", "faux"].includes(asBool)) return question.answerIndex === 1;
  }
  return false;
}

function submitAnswer({ userId, questionId, answer, timeSpent, userName }) {
  const question = getQuestion(questionId);
  if (!question) return { error: "Question not found" };

  const user = getUser(userId);
  if (user.banned) return { error: "This player is banned from the quiz" };
  if (userName) user.name = String(userName).trim().slice(0, 60) || user.name;

  const time = Math.max(0, Number(timeSpent) || 0);
  const correct = isCorrectAnswer(question, answer);

  user.total += 1;
  user.questionsAnswered += 1;
  user.gamesPlayed += 1;
  user.totalResponseTime += time;
  user.totalPlayTime += time;
  if (time > 0) {
    user.slowestResponse = Math.max(user.slowestResponse || 0, time);
    user.longestSession = Math.max(user.longestSession || 0, time);
  }
  user.lastPlayed = new Date().toISOString();

  const cat = (user.categories[question.category] ||= { correct: 0, total: 0 });
  cat.total += 1;

  let xpGained = 0;
  if (correct) {
    user.correct += 1;
    user.currentStreak += 1;
    user.bestStreak = Math.max(user.bestStreak, user.currentStreak);
    cat.correct += 1;
    question.stats.correct = (question.stats.correct || 0) + 1;
    if (time > 0) {
      user.fastestResponse = user.fastestResponse ? Math.min(user.fastestResponse, time) : time;
    }
    xpGained = xpFor(question.difficulty, time, user.currentStreak);
    user.totalXp += xpGained;
    if (user.currentStreak > 0 && user.currentStreak % 10 === 0) user.perfectGames += 1;
  } else {
    user.wrong += 1;
    user.currentStreak = 0;
  }

  const newAchievements = [];
  for (const a of ACHIEVEMENTS) {
    if (!user.unlocked.includes(a.id) && a.test(user)) {
      user.unlocked.push(a.id);
      newAchievements.push(a.label);
      user.totalXp += 100;
    }
  }

  save();

  const profile = userProfile(user.userId);
  return {
    result: correct ? "correct" : "wrong",
    correct,
    correctAnswer: String.fromCharCode(65 + question.answerIndex),
    correctAnswerText: question.options[question.answerIndex],
    xpGained,
    user: { ...profile, xpGained, achievements: newAchievements },
  };
}

/* --------------------------- daily challenge ----------------------------- */

function dailyChallenge(userId) {
  const store = load();
  const today = new Date().toISOString().slice(0, 10);
  const questions = allQuestions();
  if (!questions.length) return null;

  if (!store.daily || store.daily.date !== today) {
    const pick = questions[Math.floor(Math.random() * questions.length)];
    store.daily = { date: today, questionId: pick._id };
    save();
  }
  let question = getQuestion(store.daily.questionId) || questions[0];

  let streak = 0;
  if (userId) {
    const user = getUser(userId);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    if (user.lastDaily !== today) {
      user.dailyStreak = user.lastDaily === yesterday ? (user.dailyStreak || 0) + 1 : 1;
      user.lastDaily = today;
      save();
    }
    streak = user.dailyStreak || 1;
  }

  return {
    question: publicQuestion(question),
    challengeDate: new Date().toLocaleDateString("en-US", {
      weekday: "long", year: "numeric", month: "long", day: "numeric",
    }),
    reward: 100 + streak * 10,
    streak,
  };
}

/* ---------------------------------- admin -------------------------------- */

function adminStats() {
  const questions = allQuestions();
  const users = allUsers();
  const byCategory = {};
  for (const q of questions) {
    byCategory[q.category] = (byCategory[q.category] || 0) + 1;
  }
  return {
    totalQuestions: questions.length,
    totalUsers: users.length,
    activePlayers: users.filter((u) => (u.total || 0) > 0).length,
    totalAnswers: users.reduce((s, u) => s + (u.total || 0), 0),
    totalCorrect: users.reduce((s, u) => s + (u.correct || 0), 0),
    bannedUsers: users.filter((u) => u.banned).length,
    categories: byCategory,
    topPlayers: ranked("correct").slice(0, 5).map((u) => ({
      userId: u.userId, name: u.name, correct: u.correct, accuracy: u.accuracy, level: u.level,
    })),
  };
}

function setBanned(userId, banned) {
  const user = getUser(userId, { create: false });
  if (!user) return null;
  user.banned = !!banned;
  save();
  return decorate(user);
}

function resetUser(userId) {
  const store = load();
  const id = String(userId);
  if (!store.users[id]) return null;
  const { name, createdAt } = store.users[id];
  store.users[id] = { ...blankUser(id, name), createdAt };
  save();
  return decorate(store.users[id]);
}

function deleteUser(userId) {
  const store = load();
  const id = String(userId);
  if (!store.users[id]) return false;
  delete store.users[id];
  save();
  return true;
}

function grantXp(userId, amount) {
  const user = getUser(userId, { create: false });
  if (!user) return null;
  user.totalXp = Math.max(0, (user.totalXp || 0) + Number(amount || 0));
  save();
  return decorate(user);
}

module.exports = {
  load, init, save, newId,
  allQuestions, categories, getQuestion, createQuestion, updateQuestion, deleteQuestion,
  publicQuestion, pickQuestion,
  getUser, updateUserName, allUsers, decorate, ranked, userProfile, categoryLeaderboard,
  paginate, submitAnswer, dailyChallenge, getTitle,
  adminStats, setBanned, resetUser, deleteUser, grantXp,
  ACHIEVEMENTS,
};
