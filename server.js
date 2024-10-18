const express = require('express');
const session = require('express-session');
const mysql = require('mysql2');
const bcrypt = require('bcrypt');
const multer = require('multer');
const path = require('path');
const app = express();
const server = require('http').createServer(app);
const io = require('socket.io')(server);
const fs = require('fs');

// Create uploads directory if it doesn't exist
if (!fs.existsSync('./uploads')) {
    fs.mkdirSync('./uploads');
}

// MySQL Connection
const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'chat_app'
});

// Multer configuration for file uploads
const storage = multer.diskStorage({
    destination: './uploads/',
    filename: function (req, file, cb) {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});

const upload = multer({ storage: storage });

// Middleware
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
    secret: 'secret-key',
    resave: false,
    saveUninitialized: false
}));

// Auth Routes
app.post('/register', async (req, res) => {
    const { username, password } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);

    db.query('INSERT INTO users (username, password) VALUES (?, ?)',
        [username, hashedPassword],
        (err, result) => {
            if (err) {
                res.json({ error: 'Username already exists' });
            } else {
                res.json({ success: true });
            }
        });
});

app.post('/login', (req, res) => {
    const { username, password } = req.body;

    db.query('SELECT * FROM users WHERE username = ?', [username],
        async (err, results) => {
            if (err || results.length === 0) {
                res.json({ error: 'User not found' });
                return;
            }

            const user = results[0];
            const match = await bcrypt.compare(password, user.password);

            if (match) {
                req.session.userId = user.id;
                req.session.username = user.username;
                res.json({ success: true });
            } else {
                res.json({ error: 'Invalid password' });
            }
        });
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login.html');
});

// File upload route
app.post('/upload', upload.single('file'), (req, res) => {
    if (req.file) {
        res.json({
            fileName: req.file.filename,
            filePath: `/uploads/${req.file.filename}`
        });
    } else {
        res.json({ error: 'File upload failed' });
    }
});

// Add this route to get current user info
app.get('/get-user-info', (req, res) => {
    if (req.session.userId) {
        res.json({
            userId: req.session.userId,
            username: req.session.username
        });
    } else {
        res.status(401).json({ error: 'Not logged in' });
    }
});

// Update the Socket.IO connection handler
io.on('connection', (socket) => {
    let username = '';

    // Load previous messages
    db.query(`
        SELECT m.*, u.username 
        FROM messages m 
        JOIN users u ON m.user_id = u.id 
        ORDER BY m.created_at DESC 
        LIMIT 50
        `,
        (err, results) => {
            if (!err) {
                socket.emit('previous messages', results.reverse());
            }
        });

    socket.on('set username', (data) => {
        username = data;
        socket.broadcast.emit('user joined', username);
    });

    socket.on('new message', (data) => {
        const { userId, message, filePath } = data;

        db.query('INSERT INTO messages (user_id, message, file_path) VALUES (?, ?, ?)',
            [userId, message, filePath],
            (err, result) => {
                if (!err) {
                    io.emit('chat message', {
                        username: data.username,
                        message: message,
                        filePath: filePath,
                        created_at: new Date()
                    });
                }
            });
    });

    socket.on('disconnect', () => {
        if (username) {
            socket.broadcast.emit('user left', username);
        }
    });
});

server.listen(3000, () => {
    console.log('Server running on port 3000');
});