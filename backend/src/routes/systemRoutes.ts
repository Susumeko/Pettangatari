import express from 'express';
import { appConfig } from '../config.js';

const router = express.Router();

router.get('/config', (_request, response) => {
  response.json({
    shutdownEnabled: Boolean(appConfig.shutdownToken),
  });
});

router.get('/health', (_request, response) => {
  response.json({ ok: true });
});

router.post('/shutdown', (_request, response) => {
  if (!appConfig.shutdownToken) {
    return response.status(403).json({
      error: 'Server shutdown is not enabled in this launch mode.',
    });
  }

  response.json({ ok: true, message: 'Pettangatari server shutting down.' });

  setTimeout(() => {
    process.exit(0);
  }, 300);

  return;
});

export { router as systemRouter };
