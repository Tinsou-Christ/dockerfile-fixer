/**
 * MongoDB persistence layer.
 *
 * IMPORTANT: the previous version stored the WHOLE database (including the
 * 13 000+ seeded questions, ~3.5 MB) inside a single document. Every single
 * answer triggered a multi-megabyte upsert, which regularly timed out on
 * free hosting (and would eventually hit the 16 MB BSON limit) — so player
 * data silently disappeared after a redeploy.
 *
 * Now we persist ONLY what cannot be regenerated from the code:
 *   - `users`     : one document per player  (small, fast upserts)
 *   - `questions` : only questions created from the admin panel
 *   - `meta`      : daily challenge + misc state
 * The seeded question pack always comes from src/questions.fr.json.
 */
const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URL || "";
const DB_NAME = process.env.MONGODB_DB || "quizdb";

let client = null;
let db = null;
let enabled = false;
let connecting = null;

async function connect() {
  if (enabled) return true;
  if (connecting) return connecting;
  if (!MONGODB_URI) {
    console.log("[mongo] MONGODB_URI not set — falling back to local JSON file storage");
    return false;
  }
  connecting = (async () => {
    try {
      const { MongoClient } = require("mongodb");
      client = new MongoClient(MONGODB_URI, {
        serverSelectionTimeoutMS: 20000,
        retryWrites: true,
        maxPoolSize: 5,
      });
      await client.connect();
      db = client.db(DB_NAME);
      await db.collection("users").createIndex({ correct: -1 }).catch(() => {});
      enabled = true;
      console.log(`[mongo] connected (db="${DB_NAME}")`);
      return true;
    } catch (err) {
      console.error("[mongo] connection failed, using local file storage:", err.message);
      enabled = false;
      return false;
    } finally {
      connecting = null;
    }
  })();
  return connecting;
}

async function loadAll() {
  if (!enabled) return null;
  try {
    const [users, questions, meta, legacy] = await Promise.all([
      db.collection("users").find({}).toArray(),
      db.collection("questions").find({}).toArray(),
      db.collection("meta").findOne({ _id: "daily" }),
      db.collection("state").findOne({ _id: "quiz-state" }).catch(() => null),
    ]);

    const map = {};
    for (const u of users) {
      const { _id, ...rest } = u;
      map[String(_id)] = { ...rest, userId: String(_id) };
    }

    // One-time migration from the old single-document format.
    if (!users.length && legacy && legacy.state && legacy.state.users) {
      for (const [id, u] of Object.entries(legacy.state.users)) {
        map[String(id)] = { ...u, userId: String(id) };
      }
      console.log(`[mongo] migrated ${Object.keys(map).length} players from the legacy state document`);
      await saveUsers(Object.values(map));
    }

    return {
      users: map,
      questions: questions.map((q) => ({ ...q, _id: String(q._id) })),
      daily: (legacy && !meta && legacy.state && legacy.state.daily) || meta || {},
    };
  } catch (err) {
    console.error("[mongo] load failed:", err.message);
    return null;
  }
}

async function saveUsers(users) {
  if (!enabled || !users.length) return false;
  try {
    await db.collection("users").bulkWrite(
      users.map((u) => {
        const { userId, ...rest } = u;
        return {
          updateOne: {
            filter: { _id: String(userId) },
            update: { $set: { ...rest, updatedAt: new Date() } },
            upsert: true,
          },
        };
      }),
      { ordered: false },
    );
    return true;
  } catch (err) {
    console.error("[mongo] saveUsers failed:", err.message);
    return false;
  }
}

async function deleteUser(userId) {
  if (!enabled) return false;
  try {
    await db.collection("users").deleteOne({ _id: String(userId) });
    return true;
  } catch (err) {
    console.error("[mongo] deleteUser failed:", err.message);
    return false;
  }
}

async function saveQuestions(questions) {
  if (!enabled) return false;
  try {
    const col = db.collection("questions");
    const ids = questions.map((q) => String(q._id));
    await col.deleteMany({ _id: { $nin: ids } });
    if (questions.length) {
      await col.bulkWrite(
        questions.map((q) => ({
          updateOne: { filter: { _id: String(q._id) }, update: { $set: q }, upsert: true },
        })),
        { ordered: false },
      );
    }
    return true;
  } catch (err) {
    console.error("[mongo] saveQuestions failed:", err.message);
    return false;
  }
}

async function saveDaily(daily) {
  if (!enabled) return false;
  try {
    await db.collection("meta").updateOne(
      { _id: "daily" },
      { $set: { ...daily, updatedAt: new Date() } },
      { upsert: true },
    );
    return true;
  } catch (err) {
    console.error("[mongo] saveDaily failed:", err.message);
    return false;
  }
}

function isEnabled() {
  return enabled;
}

module.exports = { connect, loadAll, saveUsers, deleteUser, saveQuestions, saveDaily, isEnabled };
