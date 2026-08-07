import 'dotenv/config';
import express from 'express';
import cors from 'cors';

import screeningRoutes from './routes/screeningRoutes.js';
import jobsRoutes from './routes/jobs.js';
import candidatesRoutes from './routes/candidates.js';
import settingsRoutes from './routes/settings.js';

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

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});
