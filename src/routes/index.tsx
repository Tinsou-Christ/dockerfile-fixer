import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Quiz API — playable quiz site, admin panel & bot endpoints" },
      {
        name: "description",
        content:
          "Quiz API: play every category on the web, manage questions from the admin panel (code 0709), leaderboards, XP and streaks. Docker + Render ready.",
      },
      { property: "og:title", content: "Quiz API — playable quiz site & bot endpoints" },
      {
        property: "og:description",
        content:
          "Categories, anime & flag quizzes, true/false, daily challenge, XP, streaks, achievements, leaderboards and an admin panel.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

const features = [
  { icon: "🎮", title: "Playable site", text: "Every category playable in the browser with a 30s timer, A/B/C/D options and instant feedback." },
  { icon: "🎌", title: "Anime & flag quizzes", text: "Image-based questions: character picture or country flag with 4 propositions." },
  { icon: "🔐", title: "Admin panel", text: "Code 0709. Add image + question + options, pick the correct answer (e.g. B), edit or delete." },
  { icon: "🏆", title: "Leaderboards", text: "Global and per-category rankings, XP, levels, titles, streaks and achievements." },
  { icon: "🤖", title: "Bot compatible", text: "Same endpoints the quiz command calls: /api/question, /api/answer, /api/user, /api/leaderboards…" },
  { icon: "🐳", title: "Docker & Render", text: "Dockerfile + render.yaml included — deploy as a Docker web service in one click." },
];

function Index() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-4xl px-6 py-16">
        <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-1.5 text-sm text-muted-foreground">
          🎯 quiz-api/ — Node + Express service
        </span>
        <h1 className="mt-6 text-4xl font-bold leading-tight sm:text-5xl">
          Quiz API — the site, the admin panel and the bot endpoints
        </h1>
        <p className="mt-4 text-lg text-muted-foreground">
          The complete quiz service lives in the <code className="rounded bg-muted px-1.5 py-0.5">quiz-api/</code> folder of
          this project: a playable website, an admin panel protected by the code <strong>0709</strong>, and the exact API
          the <code className="rounded bg-muted px-1.5 py-0.5">quiz</code> bot command expects.
        </p>

        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          {features.map((f) => (
            <div key={f.title} className="rounded-2xl border border-border bg-card p-5">
              <div className="text-2xl">{f.icon}</div>
              <h2 className="mt-2 text-base font-semibold">{f.title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{f.text}</p>
            </div>
          ))}
        </div>

        <div className="mt-10 rounded-2xl border border-border bg-card p-6">
          <h2 className="text-lg font-semibold">Run it</h2>
          <pre className="mt-3 overflow-x-auto rounded-xl bg-muted p-4 text-sm">
            <code>{`cd quiz-api
npm install
npm start          # site: http://localhost:3000  ·  admin: /admin.html`}</code>
          </pre>
          <h2 className="mt-6 text-lg font-semibold">Deploy on Render (Docker)</h2>
          <pre className="mt-3 overflow-x-auto rounded-xl bg-muted p-4 text-sm">
            <code>{`New → Blueprint (uses render.yaml)
  or  New → Web Service → Docker
      Dockerfile path: quiz-api/Dockerfile
      Docker context:  quiz-api
      Env: ADMIN_CODE=0709 · DATA_DIR=/data`}</code>
          </pre>
          <h2 className="mt-6 text-lg font-semibold">Point the bot to it</h2>
          <pre className="mt-3 overflow-x-auto rounded-xl bg-muted p-4 text-sm">
            <code>{`// quiz.js
const BASE_URL = 'https://<your-service>.onrender.com/api';`}</code>
          </pre>
        </div>
      </div>
    </main>
  );
}
