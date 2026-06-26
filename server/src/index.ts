import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import { fileURLToPath } from 'url';

// Load .env from project root (parent of server directory)
const __filename_init = fileURLToPath(import.meta.url);
const __dirname_init = path.dirname(__filename_init);
dotenv.config({ path: path.join(__dirname_init, '../../.env') });
import { config } from './config/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import generateRoutes from './routes/generate.js';
import referenceTrackRoutes from './routes/referenceTrack.js';
import loraRoutes from './routes/lora.js';
import trainingRoutes from './routes/training.js';
import workspacesRoutes from './routes/workspaces.js';
import projectsRoutes from './routes/projects.js';
import tracksRoutes from './routes/tracks.js';
import stemsRoutes from './routes/stems.js';
import studioRoutes from './routes/studio.js';
import './db/migrate.js';

const app = express();

// Security headers
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      baseUri: ["'self'"],
      fontSrc: ["'self'", 'https:', 'data:'],
      formAction: ["'self'"],
      frameAncestors: ["'self'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      objectSrc: ["'none'"],
      scriptSrc: ["'self'"],
      scriptSrcAttr: ["'none'"],
      styleSrc: ["'self'", 'https:', "'unsafe-inline'"],
      upgradeInsecureRequests: [],
    },
  },
}));

// Middleware
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) return callback(null, true);
    // Allow localhost and 127.0.0.1 on any port in development
    if (config.nodeEnv === 'development') {
      if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
        return callback(null, true);
      }
      // Allow LAN IPs (192.168.x.x, 10.x.x.x, 172.16-31.x.x)
      const lanPattern = /^https?:\/\/(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[01])\.)/;
      if (lanPattern.test(origin)) {
        return callback(null, true);
      }
    }
    // Allow configured frontend URL
    if (origin === config.frontendUrl) {
      return callback(null, true);
    }
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));

app.use(express.json());

// Serve static audio files
app.use('/audio', express.static(path.join(__dirname, '../public/audio')));

// Audio Editor (AudioMass) - needs relaxed CSP for inline scripts and external images
app.use('/editor', (req, res, next) => {
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; media-src 'self' blob: data: http://localhost:* https:; connect-src 'self' http://localhost:* https:; worker-src 'self' blob:");
  next();
}, express.static(path.join(__dirname, '../audio-editor')));

// Demucs Web (Stem Extraction) - requires COOP/COEP headers for SharedArrayBuffer and relaxed CSP for ONNX runtime
app.use('/demucs-web', (req, res, next) => {
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: https://cdn.jsdelivr.net",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: https:",
    "media-src 'self' blob: data: http://localhost:* https:",
    "connect-src 'self' blob: http://localhost:* https://cdn.jsdelivr.net https://huggingface.co https://*.huggingface.co https://*.hf.co",
    "worker-src 'self' blob:",
    "child-src 'self' blob:"
  ].join('; '));
  next();
}, express.static(path.join(__dirname, '../public/demucs-web')));

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'ACE-Step UI API' });
});

// Image proxy for CORS
app.get('/api/proxy/image', async (req, res) => {
  const url = req.query.url as string;
  if (!url) {
    res.status(400).json({ error: 'URL required' });
    return;
  }

  try {
    const response = await fetch(url);
    if (!response.ok) {
      res.status(response.status).json({ error: 'Failed to fetch image' });
      return;
    }

    const contentType = response.headers.get('content-type') || 'image/jpeg';
    const buffer = await response.arrayBuffer();

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(Buffer.from(buffer));
  } catch (error) {
    console.error('Image proxy error:', error);
    res.status(500).json({ error: 'Failed to proxy image' });
  }
});

// Routes
app.use('/api/generate', generateRoutes);
app.use('/api/reference-tracks', referenceTrackRoutes);
app.use('/api/lora', loraRoutes);
app.use('/api/training', trainingRoutes);
app.use('/api/workspaces', workspacesRoutes);
app.use('/api', projectsRoutes);      // spans /api/workspaces/:wsId/projects and /api/projects/:id
app.use('/api/tracks', tracksRoutes);
app.use('/api', stemsRoutes);          // spans /api/tracks/:trackId/stems and /api/stems/:id
app.use('/api/studio', studioRoutes);

// Error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server on all interfaces for LAN access
app.listen(config.port, '0.0.0.0', () => {
  console.log(`ACE-Step UI Server running on http://localhost:${config.port}`);
  console.log(`Environment: ${config.nodeEnv}`);
  console.log(`ACE-Step API: ${config.acestep.apiUrl}`);

  // Show LAN access info
  import('os').then(os => {
    const nets = os.networkInterfaces();
    for (const name of Object.keys(nets)) {
      for (const net of nets[name] || []) {
        if (net.family === 'IPv4' && !net.internal) {
          console.log(`LAN access: http://${net.address}:${config.port}`);
        }
      }
    }
  });
});
