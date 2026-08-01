/**
 * Pack de questions par défaut — 100 % en français.
 * Généré dans questions.fr.json : drapeaux, géographie, anime (images),
 * maths, vrai/faux et culture générale.
 * Tout reste éditable/supprimable depuis le panneau admin.
 */
const RAW = require("./questions.fr.json");

// Bump this when questions.fr.json changes: the store replaces the previous
// seeded questions (admin-created ones are kept).
const SEED_VERSION = "fr-2026-08-01-v2";

function idFromKey(key, i) {
  return (String(key || "") + i.toString(16)).replace(/[^0-9a-f]/g, "0").slice(0, 24).padEnd(24, "0");
}

function seedQuestions() {
  const now = new Date().toISOString();
  return RAW.map((item, i) => ({
    _id: idFromKey(item._key, i),
    category: item.category,
    difficulty: item.difficulty,
    question: item.question,
    options: item.options,
    answerIndex: item.answerIndex,
    imageUrl: item.imageUrl || null,
    seed: true,
    stats: { asked: 0, correct: 0 },
    createdAt: now,
    updatedAt: now,
  }));
}

module.exports = { seedQuestions, SEED_VERSION };
