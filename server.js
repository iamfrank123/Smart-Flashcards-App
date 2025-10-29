const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const authRoutes = require('./auth'); // importa il nuovo auth.js

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const SECRET = 'supersecretkey';
const PORT = 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

// === FILE STORAGE ===
const LISTS_FILE = path.join(__dirname, 'data', 'lists.json');

function read(file) {
  if (!fs.existsSync(file)) fs.writeFileSync(file, '[]');
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}
function write(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// === AUTH MIDDLEWARE ===
function auth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token' });
  try {
    const decoded = jwt.verify(token, SECRET);
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

// Servi reset.html per i link di reset password
app.get('/auth/reset/:token', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'reset.html'));
});


// === USA AUTHROUTES ===
app.use('/auth', authRoutes);

// === API FLASHCARDS ===
app.get('/api/folders', auth, (req, res) => {
  const all = read(LISTS_FILE);
  const folders = {};
  all.filter(l => l.userId === req.user.id).forEach(l => {
    if (!folders[l.folder]) folders[l.folder] = true;
  });
  res.json(Object.keys(folders).map(f => ({ id: f, name: f })));
});

app.post('/api/folders', auth, (req, res) => {
  const { name } = req.body;
  res.json({ id: name, name });
});

app.put('/api/folders/:id', auth, (req, res) => {
  const { id } = req.params, { name } = req.body;
  const lists = read(LISTS_FILE);
  lists.forEach(l => { if (l.userId === req.user.id && l.folder === id) l.folder = name; });
  write(LISTS_FILE, lists);
  res.json({ success: true });
});

app.delete('/api/folders/:id', auth, (req, res) => {
  const { id } = req.params;
  let lists = read(LISTS_FILE);
  lists = lists.filter(l => !(l.userId === req.user.id && l.folder === id));
  write(LISTS_FILE, lists);
  res.json({ success: true });
});

app.get('/api/folders/:id/lists', auth, (req, res) => {
  const lists = read(LISTS_FILE).filter(l => l.userId === req.user.id && l.folder === req.params.id);
  res.json(lists.map(l => ({ id: l.id, name: l.name })));
});

app.post('/api/folders/:id/lists', auth, (req, res) => {
  const { id } = req.params;
  const { name, front = [], back = [] } = req.body;
  const lists = read(LISTS_FILE);
  const newList = {
    id: Date.now().toString(),
    userId: req.user.id,
    folder: id,
    name,
    front,
    back,
  };
  lists.push(newList);
  write(LISTS_FILE, lists);
  io.emit('lists:updated');
  res.json(newList);
});

app.get('/api/lists/:id', auth, (req, res) => {
  const lists = read(LISTS_FILE);
  const list = lists.find(l => l.id === req.params.id && l.userId === req.user.id);
  if (!list) return res.status(404).json({ error: 'Lista non trovata' });
  res.json(list);
});

app.put('/api/lists/:id', auth, (req, res) => {
  const lists = read(LISTS_FILE);
  const i = lists.findIndex(l => l.id === req.params.id && l.userId === req.user.id);
  if (i === -1) return res.status(404).json({ error: 'Lista non trovata' });
  lists[i] = { ...lists[i], ...req.body };
  write(LISTS_FILE, lists);
  io.emit('lists:updated');
  res.json(lists[i]);
});

app.delete('/api/lists/:id', auth, (req, res) => {
  let lists = read(LISTS_FILE);
  lists = lists.filter(l => !(l.id === req.params.id && l.userId === req.user.id));
  write(LISTS_FILE, lists);
  io.emit('lists:updated');
  res.json({ success: true });
});

app.get('/api/lists/:id/export', auth, (req, res) => {
  const lists = read(LISTS_FILE);
  const list = lists.find(l => l.id === req.params.id && l.userId === req.user.id);
  if (!list) return res.status(404).json({ error: 'Lista non trovata' });
  res.setHeader('Content-Disposition', `attachment; filename="${list.name}.json"`);
  res.json({ name: list.name, front: list.front, back: list.back });
});

// === SOCKET.IO ===
io.on('connection', socket => {
  console.log('Utente connesso via socket');
  socket.on('join', userId => socket.join(userId));
});

// === AVVIO SERVER ===
server.listen(PORT, () => console.log(`✅ Server avviato su http://localhost:${PORT}`));

