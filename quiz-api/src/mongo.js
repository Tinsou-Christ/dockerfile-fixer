/**
 * MongoDB persistence layer.
 * The whole quiz database (questions, users, daily) is stored as a single
 * document so nothing is lost between deploys/restarts on Render.
 */
const MONGODB_URI = process.env.MONGODB_URI || "";
const DB_NAME = process.env.MONGODB_DB || "quizdb";
const COLLECTION = process.env.MONGODB_COLLECTION || "state";
const DOC_ID = "quiz-state";

let client = null;
let collection = null;
let enabled = false;

async function connect() {
  if (!MONGODB_URI) {
    console.log("[mongo] MONGODB_URI not set — falling back to local JSON file storage");
    return false;
  }
  try {
    const { MongoClient } = require("mongodb");
    client = new MongoClient(MONGODB_URI, {
      serverSelectionTimeoutMS: 15000,
      retryWrites: true,
    });
    await client.connect();
    collection = client.db(DB_NAME).collection(COLLECTION);
    enabled = true;
    console.log(`[mongo] connected (db="${DB_NAME}", collection="${COLLECTION}")`);
    return true;
  } catch (err) {
    console.error("[mongo] connection failed, using local file storage:", err.message);
    enabled = false;
    return false;
  }
}

async function loadState() {
  if (!enabled) return null;
  try {
    const doc = await collection.findOne({ _id: DOC_ID });
    if (!doc || !doc.state) return null;
    return doc.state;
  } catch (err) {
    console.error("[mongo] load failed:", err.message);
    return null;
  }
}

async function saveState(state) {
  if (!enabled) return false;
  try {
    await collection.updateOne(
      { _id: DOC_ID },
      { $set: { state, updatedAt: new Date() } },
      { upsert: true },
    );
    return true;
  } catch (err) {
    console.error("[mongo] save failed:", err.message);
    return false;
  }
}

function isEnabled() {
  return enabled;
}

module.exports = { connect, loadState, saveState, isEnabled };
