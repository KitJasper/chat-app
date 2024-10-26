const express = require('express');
const session = require('express-session');
const mysql = require('mysql2');
const bcrypt = require('bcrypt');
const app = express();
const server = require('http').createServer(app);
const io = require('socket.io')(server);

// MySQL Connection
const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'chat_app'
});

// Messages table setup
db.query(`
    CREATE TABLE IF NOT EXISTS messages (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        message TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
    )
`);

// Middleware
app.use(express.static('public'));
app.use(express.json());
app.use(session({
    secret: 'secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

// Auth middleware
const requireAuth = (req, res, next) => {
    if (!req.session.userId) {
        return res.status(401).json({ error: 'Not authenticated' });
    }
    next();
};

// Auth Routes
app.post('/register', async (req, res) => {
    const { username, password } = req.body;
    
    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required' });
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        db.query('INSERT INTO users (username, password) VALUES (?, ?)',
            [username, hashedPassword],
            (err, result) => {
                if (err) {
                    res.status(400).json({ error: 'Username already exists' });
                } else {
                    res.json({ success: true });
                }
            });
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

app.post('/login', (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required' });
    }

    db.query('SELECT * FROM users WHERE username = ?', [username],
        async (err, results) => {
            if (err || results.length === 0) {
                return res.status(401).json({ error: 'User not found' });
            }

            const user = results[0];
            try {
                const match = await bcrypt.compare(password, user.password);
                if (match) {
                    req.session.userId = user.id;
                    req.session.username = user.username;
                    res.json({ success: true });
                } else {
                    res.status(401).json({ error: 'Invalid password' });
                }
            } catch (error) {
                res.status(500).json({ error: 'Server error' });
            }
        });
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login.html');
});

// Messages route
app.get('/messages', requireAuth, (req, res) => {
    db.query(`
        SELECT m.*, u.username 
        FROM messages m 
        JOIN users u ON m.user_id = u.id 
        ORDER BY m.created_at DESC 
        LIMIT 50
    `, (err, results) => {
        if (err) {
            return res.status(500).json({ error: 'Database query error' });
        }
        res.json(results.reverse());
    });
});

// Socket.IO handling
io.on('connection', (socket) => {
    let username = '';
    socket.on('set username', (data) => {
        username = data;
        socket.broadcast.emit('user joined', username);
    });

    socket.on('new message', (data) => {
        const { userId, message } = data;
        
        if (!userId || !message) return;

        db.query(
            'INSERT INTO messages (user_id, message) VALUES (?, ?)',
            [userId, message],
            (err, result) => {
                if (!err) {
                    io.emit('chat message', {
                        username: data.username,
                        message: message,
                        created_at: new Date()
                    });
                }
            }
        );
    });

    socket.on('disconnect', () => {
        if (username) {
            socket.broadcast.emit('user left', username);
        }
    });
});

// Error handling
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Something went wrong!' });
});

server.listen(3000, () => {
    console.log('Server running on port 3000');
});