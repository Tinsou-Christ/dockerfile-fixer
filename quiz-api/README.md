# 🎯 Quiz API — site + API + admin panel

A complete quiz backend **and** playable website, drop-in compatible with the GoatBot
`quiz.js` command (`quiz`, `quiz anime`, `quiz flag`, `quiz torf`, `quiz daily`,
`quiz rank`, `quiz leaderboard`, `quiz category <name>`).

## Features

- Play every category directly on the website (A/B/C/D or keyboard keys, 30s timer)
- Anime & flag quizzes with images, True/False quiz, daily challenge
- XP, levels, streaks, titles, achievements, per-category stats
- Global + per-category leaderboards with pagination
- Admin panel protected by a code (default **0709**): add/edit/delete questions
  (image URL + question + options + correct answer selector), bulk JSON import,
  player management (ban / unban, reset stats, grant XP, delete)
- JSON file persistence (no external database required)

## Run locally

```bash
cd quiz-api
npm install
npm start        # http://localhost:3000  — admin at /admin.html
```

## Deploy on Render (Docker)

1. Push this repository to GitHub.
2. On Render: **New → Blueprint** and select the repo (uses `render.yaml`), or
   **New → Web Service → Docker** with `Dockerfile path: quiz-api/Dockerfile`
   and `Docker context: quiz-api`.
3. Environment variables:
   - `ADMIN_CODE` — admin panel code (default `0709`)
   - `DATA_DIR` — where `db.json` is stored (use `/data` with a Render disk to
     keep questions & scores across deploys)

Health check: `GET /api/health`.

## Connect the bot command

In `quiz.js`:

```js
const BASE_URL = 'https://<your-service>.onrender.com/api';
```

Nothing else to change — the response shapes match what the command expects
(`answer` is a letter for normal questions and the option text for
`flag`/`anime`, so both reply paths grade correctly).

## Endpoints

| Method | Path | Description |
| --- | --- | --- |
| GET | `/api/categories` | array of category names |
| GET | `/api/categories/detailed` | categories + counts |
| GET | `/api/question?category=&difficulty=&userId=` | random question (avoids repeats per user) |
| POST | `/api/answer` | `{ userId, questionId, answer, timeSpent, userName }` |
| POST | `/api/user/update` | `{ userId, name }` |
| GET | `/api/user/:userId` | profile, rank, percentile, XP, streaks |
| GET | `/api/leaderboards?page=&limit=&sortBy=` | `{ rankings, stats, pagination }` |
| GET | `/api/leaderboard/category/:category` | `{ users, pagination }` |
| GET | `/api/challenge/daily?userId=` | daily challenge question + reward + streak |

Admin routes require the header `x-admin-code: 0709`:
`/api/admin/login`, `/api/admin/stats`, `/api/admin/questions` (GET/POST/PUT/DELETE),
`/api/admin/questions/bulk`, `/api/admin/users`, `/api/admin/users/:id/(ban|reset|xp)`,
`/api/admin/export`.
