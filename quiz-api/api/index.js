/**
 * Vercel serverless entry point.
 * Reuses the exact same Express app as the Docker/Render deployment.
 */
process.env.VERCEL = process.env.VERCEL || "1";
process.env.DATA_DIR = process.env.DATA_DIR || "/tmp";

const app = require("../server");

module.exports = app;
