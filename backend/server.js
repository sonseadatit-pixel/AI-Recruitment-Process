import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import screeningRoutes from './routes/screeningRoutes.js';
import jobsRoutes from './routes/jobs.js';
import candidatesRoutes from './routes/candidates.js';
import settingsRoutes from './routes/settings.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'ai-recruitment-backend' });
});

app.use('/api/screening', screeningRoutes);
app.use('/api/jobs', jobsRoutes);
app.use('/api/candidates', candidatesRoutes);
app.use('/api/settings', settingsRoutes);

// In production, serve the built React app (frontend/dist) alongside the API so
// a single Render web service hosts the whole app. Skipped in local dev where
// Vite's dev server + proxy are used instead.
const distDir = path.resolve(__dirname, '../frontend/dist');
if (existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(distDir, 'index.html'));
  });
}

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});
