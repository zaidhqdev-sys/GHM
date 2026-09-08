import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { Pool } from 'pg';
import http from 'http';
import { Server } from 'socket.io';
import multer from 'multer';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import session from 'express-session';
import rateLimit from 'express-rate-limit';
import path from 'path';

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;

// ============ TYPES ============
interface AuthRequest extends Request {
  userId?: number;
  userRole?: string;
}

// ============ MIDDLEWARE ============
const allowedOrigins = [process.env.FRONTEND_URL || '*'];
app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  }
}));

app.use(express.json());
app.use(session({
  secret: process.env.JWT_SECRET || 'fallback-secret',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false }
}));

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: "Too many attempts. Please try again later."
});

// ============ DATABASE ============
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// ============ RLS SETUP ============
const setupRLS = async (): Promise<void> => {
  try {
    await pool.query(`ALTER TABLE users ENABLE ROW LEVEL SECURITY;`);
    await pool.query(`ALTER TABLE todos ENABLE ROW LEVEL SECURITY;`);
    await pool.query(`DROP POLICY IF EXISTS user_todos_select ON todos;`);
    await pool.query(`DROP POLICY IF EXISTS user_todos_insert ON todos;`);
    await pool.query(`DROP POLICY IF EXISTS user_todos_update ON todos;`);
    await pool.query(`DROP POLICY IF EXISTS user_todos_delete ON todos;`);
    await pool.query(`DROP POLICY IF EXISTS user_self_select ON users;`);
    await pool.query(`DROP POLICY IF EXISTS user_admin_select ON users;`);

    await pool.query(`
      CREATE POLICY user_todos_select ON todos FOR SELECT
        USING (user_id = current_setting('app.current_user_id')::int);
    `);
    await pool.query(`
      CREATE POLICY user_todos_insert ON todos FOR INSERT
        WITH CHECK (user_id = current_setting('app.current_user_id')::int);
    `);
    await pool.query(`
      CREATE POLICY user_todos_update ON todos FOR UPDATE
        USING (user_id = current_setting('app.current_user_id')::int);
    `);
    await pool.query(`
      CREATE POLICY user_todos_delete ON todos FOR DELETE
        USING (user_id = current_setting('app.current_user_id')::int);
    `);
    await pool.query(`
      CREATE POLICY user_self_select ON users FOR SELECT
        USING (id = current_setting('app.current_user_id')::int);
    `);
    await pool.query(`
      CREATE POLICY user_admin_select ON users FOR SELECT
        USING (current_setting('app.current_user_role', true) = 'admin');
    `);
    console.log('✅ RLS Setup complete');
  } catch (err) {
    console.error('❌ RLS Setup error:', err);
  }
};

// ============ TABLE SETUP ============
const initDB = async (): Promise<void> => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        full_name VARCHAR(255),
        avatar_url TEXT,
        role VARCHAR(50) DEFAULT 'user',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS todos (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        category VARCHAR(100),
        due_date TIMESTAMP,
        priority VARCHAR(50) DEFAULT 'medium',
        is_completed BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS files (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        filename VARCHAR(255) NOT NULL,
        original_name VARCHAR(255) NOT NULL,
        mime_type VARCHAR(100),
        size INTEGER,
        storage_key VARCHAR(255) UNIQUE NOT NULL,
        url TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await pool.query(`UPDATE users SET role = 'admin' WHERE id = 1;`);
    await setupRLS();
    console.log('✅ Database Setup complete');
  } catch (err) {
    console.error('❌ Database Setup error:', err);
  }
};

initDB();

// ============ AUTH ============
const authenticate = (req: AuthRequest, res: Response, next: NextFunction): void => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return void res.status(401).json({ error: 'No token provided' });
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret') as { userId: number; role?: string };
    req.userId = decoded.userId;
    req.userRole = decoded.role || 'user';
    pool.query(`SELECT set_config('app.current_user_id', $1, true)`, [decoded.userId.toString()]);
    pool.query(`SELECT set_config('app.current_user_role', $1, true)`, [req.userRole]);
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

// ============ ROUTES ============
app.get('/', (req, res) => {
  res.json({ message: '⚡ GHM Core Engine (TS)', version: '2.0.0' });
});

app.post('/api/v1/auth/signup', authLimiter, async (req: Request, res: Response) => {
  const { email, password, full_name, invite_code } = req.body;
  if (!invite_code || invite_code !== process.env.INVITE_CODE) {
    res.status(403).json({ error: 'Invalid invite code. Access denied.' });
    return;
  }
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await pool.query('INSERT INTO users (email, password_hash, full_name) VALUES ($1, $2, $3) RETURNING id, email, full_name, created_at', [email, hashedPassword, full_name || null]);
    const user = result.rows[0];
    const token = jwt.sign({ userId: user.id, role: 'user' }, process.env.JWT_SECRET || 'fallback-secret', { expiresIn: '7d' });
    res.json({ user, token });
  } catch (err) {
    res.status(500).json({ error: 'Signup error' });
  }
});

app.post('/api/v1/auth/signin', authLimiter, async (req: Request, res: Response) => {
  const { email, password } = req.body;
  try {
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    const user = result.rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }
    const token = jwt.sign({ userId: user.id, role: user.role }, process.env.JWT_SECRET || 'fallback-secret', { expiresIn: '7d' });
    res.json({ user: { id: user.id, email: user.email, full_name: user.full_name, role: user.role, created_at: user.created_at }, token });
  } catch (err) {
    res.status(500).json({ error: 'Signin error' });
  }
});

app.get('/api/v1/admin/stats', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const usersCount = await pool.query('SELECT COUNT(*) FROM users');
    const todosCount = await pool.query('SELECT COUNT(*) FROM todos');
    res.json({ total_users: parseInt(usersCount.rows[0].count), total_todos: parseInt(todosCount.rows[0].count) });
  } catch (err) {
    res.status(500).json({ error: 'Error fetching stats' });
  }
});

app.get('/api/v1/admin/users', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const result = await pool.query('SELECT id, email, full_name, role, created_at FROM users ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Error fetching users' });
  }
});

app.get('/api/v1/tables/todos', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const result = await pool.query('SELECT * FROM todos ORDER BY created_at DESC');
    res.json({ data: result.rows, count: result.rowCount });
  } catch (err) {
    res.status(500).json({ error: 'Error fetching todos' });
  }
});

// ============ STORAGE ============
const s3Client = new S3Client({
  endpoint: process.env.S3_ENDPOINT || 'http://localhost:9000',
  region: process.env.S3_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY || 'minioadmin',
    secretAccessKey: process.env.S3_SECRET_KEY || 'minioadmin',
  },
  forcePathStyle: true,
});

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

app.post('/api/v1/storage/upload', authenticate, upload.single('file'), async (req: AuthRequest, res: Response) => {
  try {
    const file = req.file;
    if (!file) { res.status(400).json({ error: 'No file uploaded' }); return; }
    const storageKey = `${req.userId}/${Date.now()}-${file.originalname}`;
    await s3Client.send(new PutObjectCommand({ Bucket: process.env.S3_BUCKET || 'ghm-storage', Key: storageKey, Body: file.buffer, ContentType: file.mimetype }));
    const url = `${process.env.S3_ENDPOINT || 'http://localhost:9000'}/${process.env.S3_BUCKET || 'ghm-storage'}/${storageKey}`;
    const result = await pool.query(`INSERT INTO files (user_id, filename, original_name, mime_type, size, storage_key, url) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`, [req.userId, storageKey, file.originalname, file.mimetype, file.size, storageKey, url]);
    res.json({ message: 'File uploaded successfully', file: result.rows[0], url });
  } catch (err) {
    res.status(500).json({ error: 'Upload error' });
  }
});

app.get('/api/v1/storage/files', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const result = await pool.query('SELECT * FROM files WHERE user_id = $1 ORDER BY created_at DESC', [req.userId]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Error fetching files' });
  }
});

// ============ REALTIME ============
const io = new Server(server, { cors: { origin: allowedOrigins } });
io.on('connection', (socket) => {
  console.log('🔌 New client connected:', socket.id);
});

// ============ STATIC FILES (SERVED LAST) ============
app.use(express.static(path.join(__dirname, '../public')));

// ============ START ============
server.listen(PORT, () => {
  console.log(`🚀 GHM Core Engine (TS) running on http://localhost:${PORT}`);
});