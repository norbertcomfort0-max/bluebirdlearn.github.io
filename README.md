BluebirdLearn — Modular PWA (Milestones 1–5)

This project contains a modular offline-first learning app for UNEB S1–S4 (BluebirdLearn).
Features:
- Local-only profiles, settings, avatar
- Offline PWA shell + service worker
- IndexedDB media storage & MediaRecorder (teacher recordings)
- Lesson viewer with flashcard/exam quick creation
- Flashcards with SM-2 spaced repetition
- Exams builder & timed runner, auto-mark for MCQs, CSV export
- Simple analytics & shareable subject packages (.tar)
- Export/Import of entire app data

Run locally:
1. Save files in a folder
2. Serve with a static server: `npx serve` or `python -m http.server 8080`
3. Open in a modern browser (Chrome/Edge recommended)

Developer:
- src/ contains modules (main.js bootstraps the app)
- idb.js stores media blobs in IndexedDB
- packer.js handles tar package creation/parse