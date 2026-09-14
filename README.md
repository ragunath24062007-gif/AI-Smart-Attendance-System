# Backend (Server) — AI Smart Attendance System

This is the **kitchen** of the app. It stores data (students, attendance,
sessions, staff) in memory and answers requests at `/api/...`.
It does NOT show any webpage by itself.

## How to run

```bash
cd backend
npm install
npm run dev
```

It will start at: http://localhost:3000

Test it works by opening: http://localhost:3000/api/health
You should see: `{"status":"ok", ...}`

## Important
Start the **backend first**, then start the frontend
(see `../frontend/README.md`). The frontend needs the backend
running to load students, attendance, etc.
