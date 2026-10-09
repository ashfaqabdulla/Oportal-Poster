import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import { loadTemplate, render, shutdown } from '../render/render.js';
import path from 'node:path';
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import crypto from 'node:crypto';
import os from 'node:os';

const PUBLIC_DIR = path.resolve(process.cwd(), 'public');
const OUTPUTS_DIR = path.resolve(PUBLIC_DIR, 'outputs');
if (!existsSync(OUTPUTS_DIR)) {
  mkdirSync(OUTPUTS_DIR, { recursive: true });
}

// Basic Semaphore to limit concurrent renders and prevent OOM
class Semaphore {
  private tasks: (() => void)[] = [];
  private active = 0;
  constructor(private concurrency: number) {}
  async acquire() {
    if (this.active < this.concurrency) {
      this.active++;
      return;
    }
    return new Promise<void>(res => this.tasks.push(res));
  }
  release() {
    if (this.tasks.length > 0) {
      this.tasks.shift()!();
    } else {
      this.active--;
    }
  }
}

const renderQueue = new Semaphore(Math.max(1, os.cpus().length - 1));

const fastify = Fastify({ logger: true });

// Register CORS
fastify.register(cors, {
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
});

// Register Static File Serving for UI and outputs
fastify.register(fastifyStatic, {
  root: PUBLIC_DIR,
  prefix: '/',
});

// Phase 6 API Support: List all available templates and schemas
fastify.get('/v1/templates', async (request, reply) => {
  const templatesDir = path.resolve(process.cwd(), 'templates');
  
  if (!existsSync(templatesDir)) {
    return reply.send([]);
  }

  const dirs = readdirSync(templatesDir);
  const templates = [];

  for (const dir of dirs) {
    const schemaPath = path.join(templatesDir, dir, 'schema.json');
    if (existsSync(schemaPath)) {
      try {
        const schema = JSON.parse(readFileSync(schemaPath, 'utf8'));
        // Include the directory name as the template 'id' just in case schema.name differs
        templates.push({ id: dir, ...schema });
      } catch (err) {
        request.log.error(`Failed to parse schema for ${dir}:`, err);
      }
    }
  }

  return reply.send(templates);
});

// Phase 3: Synchronous rendering endpoint
fastify.post('/v1/render', async (request, reply) => {
  const payload = request.body as any;
  const { template, data, scale = 1 } = payload || {};
  
  if (!template || !data) {
    return reply.code(400).send({ error: 'Missing template or data payload' });
  }

  const templateDir = path.resolve(process.cwd(), 'templates', template);
  if (!existsSync(templateDir)) {
    return reply.code(404).send({ error: 'Template not found' });
  }

  const tpl = await loadTemplate(templateDir);

  // Pre-validation: ensure required fields exist in the payload
  const missing = tpl.schema.fields
    .filter(f => f.required && !data[f.id])
    .map(f => f.id);
  
  if (missing.length > 0) {
    return reply.code(400).send({ error: 'Missing required fields', missing });
  }

  // Content-hash caching
  const hashInput = JSON.stringify({
    name: tpl.schema.name,
    version: tpl.schema.version,
    data,
    scale
  });
  
  const cacheKey = crypto.createHash('sha256').update(hashInput).digest('hex');
  const filename = `${cacheKey}.png`;
  const filepath = path.join(OUTPUTS_DIR, filename);
  const publicUrl = `/outputs/${filename}`;

  // Cache hit
  if (existsSync(filepath)) {
    request.log.info(`[API] ⚡ Cache hit for ${template}`);
    return reply.send({ url: publicUrl, cached: true });
  }

  request.log.info(`[API] Queuing render for ${template}...`);
  await renderQueue.acquire();
  request.log.info(`[API] Rendering ${template}...`);
  
  try {
    const renderPromise = render(tpl, data, { format: 'png', scale });
    const timeoutPromise = new Promise<never>((_, reject) => 
      setTimeout(() => reject(new Error('Render timeout exceeded (15s)')), 15000)
    );
    
    const pngBuffer = await Promise.race([renderPromise, timeoutPromise]) as Buffer;
    
    // Save artifact
    await writeFile(filepath, pngBuffer);
    request.log.info(`[API] ✅ Rendered ${template} successfully.`);
    
    return reply.send({ url: publicUrl, cached: false });
  } catch (e: any) {
    if (e.status === 422) {
      request.log.warn(`[API] ❌ 422 Validation Error for ${template}`);
      return reply.code(422).send({ error: 'Fields do not fit at minimum font size', details: e.message });
    }
    throw e;
  } finally {
    renderQueue.release();
  }
});

const start = async () => {
  try {
    await fastify.listen({ 
      port: Number(process.env.PORT) || 3000, 
      host: process.env.HOST || '0.0.0.0' 
    });
    fastify.log.info(`🚀 Poster API listening on http://${process.env.HOST || '0.0.0.0'}:${process.env.PORT || 3000}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();

const closeGracefully = async (signal: NodeJS.Signals) => {
  fastify.log.info(`\nReceived ${signal}, shutting down gracefully...`);
  await fastify.close();
  await shutdown();
  process.exit(0);
};

process.on('SIGTERM', () => closeGracefully('SIGTERM'));
process.on('SIGINT', () => closeGracefully('SIGINT'));
