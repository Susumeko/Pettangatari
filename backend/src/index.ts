import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { appConfig } from './config.js';
import { sillyTavernRouter } from './routes/sillytavernRoutes.js';
import { getSillyTavernBaseUrl } from './sillytavern/connectionSettings.js';
import { studioRouter } from './routes/studioRoutes.js';
import { systemRouter } from './routes/systemRoutes.js';

const app = express();

app.use(
  express.json({
    limit: Number.MAX_SAFE_INTEGER,
  }),
);

app.use('/api/studio/assets', express.static(appConfig.rootDataPath));
app.use('/api/silly', sillyTavernRouter);
app.use('/api/studio', studioRouter);
app.use('/api/system', systemRouter);

const indexFilePath = path.join(appConfig.frontendDistPath, 'index.html');
const hasBuiltFrontend = fs.existsSync(indexFilePath);

if (hasBuiltFrontend) {
  app.use(express.static(appConfig.frontendDistPath));

  app.get('*', (request, response, next) => {
    if (request.path.startsWith('/api/')) {
      next();
      return;
    }
    response.sendFile(indexFilePath);
  });
} else {
  app.get('/', (_request, response) => {
    response.status(503).send(
      'Frontend build was not found. Run `npm run build` in the project root, then start the backend again.',
    );
  });
}

app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  const message = error instanceof Error ? error.message : 'Unexpected server error.';
  response.status(500).json({ error: message });
});

app.listen(appConfig.port, appConfig.host, () => {
  const displayHost = appConfig.host === '0.0.0.0' ? 'localhost' : appConfig.host;
  console.log(`Pettangatari backend running on http://${displayHost}:${appConfig.port}`);
  if (appConfig.host === '0.0.0.0') {
    console.log(`Pettangatari is listening on all network interfaces at port ${appConfig.port}.`);
  }
  console.log(`SillyTavern target: ${getSillyTavernBaseUrl()}`);
});
