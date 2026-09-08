require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const http = require('http');
const { Server } = require('socket.io');
const multer = require('multer');
const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const session = require('express-session');

const app = express();
const PORT = 3000;
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// ============ MIDDLEWARE ============
app.use(cors());
app.use(express.json());
app.use(session({
    secret: process.env.JWT_SECRET,
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false }
}));

// ============ POSTGRESQL DATABASE ============
const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD
});
pool.connect((err) => {
    if (err) {
        console.error('❌ Database connection error:', err.message);
    } else {
        console.log('✅ Connected to PostgreSQL!');
    }
});

// ============ POSTGRESQL RLS (Row Level Security) ============
const setupRLS = async () => {
    try {
        await pool.query(`ALTER TABLE users ENABLE ROW LEVEL SECURITY;`);
        await pool.query(`ALTER TABLE todos ENABLE ROW LEVEL SECURITY;`);

        // Drop old policies
        await pool.query(`DROP POLICY IF EXISTS user_todos_select ON todos;`);
        await pool.query(`DROP POLICY IF EXISTS user_todos_insert ON todos;`);
        await pool.query(`DROP POLICY IF EXISTS user_todos_update ON todos;`);
        await pool.query(`DROP POLICY IF EXISTS user_todos_delete ON todos;`);

        // Drop user policies
        await pool.query(`DROP POLICY IF EXISTS user_self_select ON users;`);
        await pool.query(`DROP POLICY IF EXISTS user_admin_select ON users;`);

        // Create RLS policies for todos
        await pool.query(`
            CREATE POLICY user_todos_select ON todos
                FOR SELECT
                USING (user_id = current_setting('app.current_user_id')::int);
        `);
        
        await pool.query(`
            CREATE POLICY user_todos_insert ON todos
                FOR INSERT
                WITH CHECK (user_id = current_setting('app.current_user_id')::int);
        `);
        
        await pool.query(`
            CREATE POLICY user_todos_update ON todos
                FOR UPDATE
                USING (user_id = current_setting('app.current_user_id')::int);
        `);
        
        await pool.query(`
            CREATE POLICY user_todos_delete ON todos
                FOR DELETE
                USING (user_id = current_setting('app.current_user_id')::int);
        `);

        // Create RLS policies for users
        await pool.query(`
            CREATE POLICY user_self_select ON users
                FOR SELECT
                USING (id = current_setting('app.current_user_id')::int);
        `);

        await pool.query(`
            CREATE POLICY user_admin_select ON users
                FOR SELECT
                USING (true);
        `);

        console.log('✅ Row Level Security (RLS) policies created');
    } catch (err) {
        console.error('❌ RLS setup error:', err.message);
    }
};

// ============ CREATE TABLES ============
const initDB = async () => {
    try {
        // Users table
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
        console.log('✅ Users table ready');

        // Todos table
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
        console.log('✅ Todos table ready');

        // Files table
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
        console.log('✅ Files table ready');

        // Make the first user an admin automatically
        await pool.query(`
            UPDATE users SET role = 'admin' WHERE id = 1;
        `);

        await setupRLS();
        console.log('✅ Database setup complete');
    } catch (err) {
        console.error('❌ Database init error:', err.message);
    }
};

initDB();

// ============ RLS HELPER MIDDLEWARE ============
const setUserContext = async (userId) => {
    if (userId) {
        await pool.query(
            `SELECT set_config('app.current_user_id', $1, true)`,
            [userId.toString()]
        );
    }
};

// ============ AUTH MIDDLEWARE ============
const authenticate = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
        return res.status(401).json({ error: 'Invalid token format' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.userId = decoded.userId;
        setUserContext(req.userId);
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Invalid token' });
    }
};

// ============ AUTH ROUTES ============

// Sign Up
app.post('/api/v1/auth/signup', async (req, res) => {
    try {
        const { email, password, full_name } = req.body;
        console.log('📝 Signup attempt for:', email);

        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password required' });
        }

        const existingUser = await pool.query(
            'SELECT id FROM users WHERE email = $1',
            [email]
        );

        if (existingUser.rows.length > 0) {
            return res.status(400).json({ error: 'Email already registered' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const result = await pool.query(
            'INSERT INTO users (email, password_hash, full_name) VALUES ($1, $2, $3) RETURNING id, email, full_name, created_at',
            [email, hashedPassword, full_name || null]
        );

        const user = result.rows[0];

        const token = jwt.sign(
            { userId: user.id, email: user.email },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        console.log('✅ User created:', email);
        res.json({ user, token });
    } catch (err) {
        console.error('❌ Signup error:', err.message);
        res.status(500).json({ error: 'Server error: ' + err.message });
    }
});

// Sign In
app.post('/api/v1/auth/signin', async (req, res) => {
    try {
        const { email, password } = req.body;
        console.log('📝 Signin attempt for:', email);

        const result = await pool.query(
            'SELECT * FROM users WHERE email = $1',
            [email]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const user = result.rows[0];

        const validPassword = await bcrypt.compare(password, user.password_hash);
        if (!validPassword) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const token = jwt.sign(
            { userId: user.id, email: user.email, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        console.log('✅ User signed in:', email);
        res.json({
            user: { id: user.id, email: user.email, full_name: user.full_name, role: user.role, created_at: user.created_at },
            token
        });
    } catch (err) {
        console.error('❌ Signin error:', err.message);
        res.status(500).json({ error: 'Server error: ' + err.message });
    }
});

// Get Current Logged In User
app.get('/api/v1/auth/me', authenticate, async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT id, email, full_name, avatar_url, role, created_at FROM users WHERE id = $1',
            [req.userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json(result.rows[0]);
    } catch (err) {
        console.error('❌ Error fetching current user:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ============ AUTO-GENERATED REST API (GHM Style) ============

const autoCrud = (tableName, options = {}) => {
    const { excludeColumns = [] } = options;

    app.get(`/api/v1/tables/${tableName}`, authenticate, async (req, res) => {
        try {
            const { limit = 100, offset = 0, order_by = 'created_at', order_dir = 'DESC', ...filters } = req.query;

            let query = `SELECT * FROM ${tableName}`;
            const values = [];
            let paramCount = 1;
            const conditions = [];

            for (const [key, value] of Object.entries(filters)) {
                if (!excludeColumns.includes(key)) {
                    conditions.push(`${key} = $${paramCount}`);
                    values.push(value);
                    paramCount++;
                }
            }

            if (conditions.length > 0) {
                query += ` WHERE ${conditions.join(' AND ')}`;
            }

            query += ` ORDER BY ${order_by} ${order_dir}`;
            query += ` LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
            values.push(parseInt(limit), parseInt(offset));

            const result = await pool.query(query, values);
            
            const countResult = await pool.query(`SELECT COUNT(*) FROM ${tableName}`);
            
            res.json({
                data: result.rows,
                count: parseInt(countResult.rows[0].count),
                limit: parseInt(limit),
                offset: parseInt(offset)
            });
        } catch (err) {
            console.error(`❌ Error fetching ${tableName}:`, err.message);
            res.status(500).json({ error: err.message });
        }
    });

    app.get(`/api/v1/tables/${tableName}/:id`, authenticate, async (req, res) => {
        try {
            const result = await pool.query(
                `SELECT * FROM ${tableName} WHERE id = $1`,
                [req.params.id]
            );

            if (result.rows.length === 0) {
                return res.status(404).json({ error: `${tableName} not found` });
            }

            res.json(result.rows[0]);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    app.post(`/api/v1/tables/${tableName}`, authenticate, async (req, res) => {
        try {
            const { ...data } = req.body;
            
            data.user_id = req.userId;

            const keys = Object.keys(data);
            const values = Object.values(data);
            const placeholders = values.map((_, i) => `$${i + 1}`);
            
            const query = `
                INSERT INTO ${tableName} (${keys.join(', ')}) 
                VALUES (${placeholders.join(', ')}) 
                RETURNING *
            `;

            const result = await pool.query(query, values);
            const newItem = result.rows[0];

            io.emit(`${tableName}_created`, newItem);

            res.status(201).json(newItem);
        } catch (err) {
            console.error(`❌ Error creating ${tableName}:`, err.message);
            res.status(500).json({ error: err.message });
        }
    });

    app.put(`/api/v1/tables/${tableName}/:id`, authenticate, async (req, res) => {
        try {
            const { ...data } = req.body;
            const keys = Object.keys(data);
            const values = Object.values(data);
            
            const setClause = keys.map((key, i) => `${key} = $${i + 2}`).join(', ');
            const query = `
                UPDATE ${tableName} 
                SET ${setClause}, updated_at = CURRENT_TIMESTAMP
                WHERE id = $1 AND user_id = ${req.userId}
                RETURNING *
            `;

            const result = await pool.query(query, [req.params.id, ...values]);

            if (result.rows.length === 0) {
                return res.status(404).json({ error: `${tableName} not found` });
            }

            const updatedItem = result.rows[0];
            io.emit(`${tableName}_updated`, updatedItem);

            res.json(updatedItem);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    app.delete(`/api/v1/tables/${tableName}/:id`, authenticate, async (req, res) => {
        try {
            const result = await pool.query(
                `DELETE FROM ${tableName} WHERE id = $1 AND user_id = $2 RETURNING id`,
                [req.params.id, req.userId]
            );

            if (result.rows.length === 0) {
                return res.status(404).json({ error: `${tableName} not found` });
            }

            io.emit(`${tableName}_deleted`, { id: parseInt(req.params.id) });

            res.json({ message: `${tableName} deleted successfully` });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
};

autoCrud('todos', { 
    excludeColumns: ['user_id'] 
});

autoCrud('users', { 
    excludeColumns: ['password_hash', 'user_id'] 
});

// ============ STORAGE (S3-Compatible) ============

const s3Client = new S3Client({
    endpoint: process.env.S3_ENDPOINT || 'http://localhost:9000',
    region: process.env.S3_REGION || 'us-east-1',
    credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY || 'minioadmin',
        secretAccessKey: process.env.S3_SECRET_KEY || 'minioadmin',
    },
    forcePathStyle: true,
});

const upload = multer({ 
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 }
});

app.post('/api/v1/storage/upload', authenticate, upload.single('file'), async (req, res) => {
    try {
        const file = req.file;
        if (!file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const storageKey = `${req.userId}/${Date.now()}-${file.originalname}`;
        
        await s3Client.send(new PutObjectCommand({
            Bucket: process.env.S3_BUCKET || 'ghm-storage',
            Key: storageKey,
            Body: file.buffer,
            ContentType: file.mimetype,
        }));

        const url = `${process.env.S3_ENDPOINT || 'http://localhost:9000'}/${process.env.S3_BUCKET || 'ghm-storage'}/${storageKey}`;

        const result = await pool.query(
            `INSERT INTO files (user_id, filename, original_name, mime_type, size, storage_key, url) 
             VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
            [req.userId, storageKey, file.originalname, file.mimetype, file.size, storageKey, url]
        );

        io.emit('file_uploaded', result.rows[0]);

        res.json({
            message: 'File uploaded successfully',
            file: result.rows[0],
            url: url
        });
    } catch (err) {
        console.error('❌ Upload error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/v1/storage/files', authenticate, async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT * FROM files WHERE user_id = $1 ORDER BY created_at DESC',
            [req.userId]
        );
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============ ADMIN DASHBOARD ============

const isAdmin = async (req, res, next) => {
    const result = await pool.query('SELECT role FROM users WHERE id = $1', [req.userId]);
    if (result.rows.length === 0 || result.rows[0].role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
    }
    next();
};

app.get('/api/v1/admin/users', authenticate, isAdmin, async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT id, email, full_name, role, created_at FROM users ORDER BY created_at DESC'
        );
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/v1/admin/todos', authenticate, isAdmin, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT t.*, u.email, u.full_name, u.role
            FROM todos t
            JOIN users u ON t.user_id = u.id
            ORDER BY t.created_at DESC
        `);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/v1/admin/stats', authenticate, isAdmin, async (req, res) => {
    try {
        const usersCount = await pool.query('SELECT COUNT(*) FROM users');
        const todosCount = await pool.query('SELECT COUNT(*) FROM todos');
        const completedTodos = await pool.query('SELECT COUNT(*) FROM todos WHERE is_completed = true');
        const filesCount = await pool.query('SELECT COUNT(*) FROM files');

        res.json({
            total_users: parseInt(usersCount.rows[0].count),
            total_todos: parseInt(todosCount.rows[0].count),
            completed_todos: parseInt(completedTodos.rows[0].count),
            total_files: parseInt(filesCount.rows[0].count),
            last_updated: new Date().toISOString()
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============ REAL-TIME (WebSocket) ============
io.on('connection', (socket) => {
    console.log('🔌 New client connected:', socket.id);

    socket.on('subscribe', (table) => {
        socket.join(`table:${table}`);
        console.log(`📡 Client ${socket.id} subscribed to ${table}`);
    });

    socket.on('unsubscribe', (table) => {
        socket.leave(`table:${table}`);
        console.log(`📡 Client ${socket.id} unsubscribed from ${table}`);
    });

    socket.on('disconnect', () => {
        console.log('🔌 Client disconnected:', socket.id);
    });
});

// ============ ROOT ROUTE ============
app.get('/', (req, res) => {
    res.json({
        message: '⚡ GHM Core Engine',
        version: '1.0.0',
        features: {
            database: 'PostgreSQL',
            auth: 'Custom JWT',
            realtime: 'GHM Sockets',
            rls: 'GHM Security',
            auto_api: 'GHM Auto-CRUD',
            storage: 'GHM Object Storage (MinIO)',
            admin: 'GHM Studio'
        },
        endpoints: {
            auth: '/api/v1/auth/signup, /api/v1/auth/signin, /api/v1/auth/me',
            tables: '/api/v1/tables/:table (CRUD)',
            storage: '/api/v1/storage/upload, /api/v1/storage/files',
            admin: '/api/v1/admin/stats'
        }
    });
});

// ============ START SERVER ============
server.listen(PORT, () => {
    console.log(`🚀 GHM Backend running on http://localhost:${PORT}`);
    console.log(`🐘 PostgreSQL: ghm_db`);
    console.log(`🔌 WebSocket (real-time) enabled`);
    console.log(`📦 Auto-API: /api/v1/tables/{table}`);
    console.log(`🔒 RLS: Enabled on todos table`);
    console.log(`📁 Storage: S3-compatible (MinIO)`);
    console.log(`🛡️  Admin Dashboard: /api/v1/admin/*`);
});