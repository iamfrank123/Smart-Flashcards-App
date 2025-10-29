const express = require('express');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
const cookieParser = require('cookie-parser');

const router = express.Router();
router.use(cookieParser());

const USERS_FILE = path.join(__dirname, 'data', 'users.json');
const SECRET = 'supersecretkey';

// === FILE FUNCTIONS ===
function readUsers() {
  if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, '[]');
  return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
}
function writeUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

// === MAIL TRANSPORT ===
const transporter = nodemailer.createTransport({
  service: 'Mailjet',
  auth: {
    user: 'smart.flashcards@mail.com',
    pass: 'c07a08a60161be9bafcadab355f4dc3f'
  }
});

// === GENERA TOKEN JWT ===
function generateToken(user) {
  return jwt.sign({ id: user.id, email: user.email }, SECRET, { expiresIn: '7d' });
}

// === REGISTRAZIONE ===
router.post('/register', (req, res) => {
  const { username, email, password } = req.body;
  const users = readUsers();

  if (users.some(u => u.email === email)) {
    return res.status(400).json({ error: 'Email già registrata' });
  }

  const hashed = bcrypt.hashSync(password, 10);
  const user = {
    id: Date.now().toString(),
    username,
    email,
    password: hashed,
    verified: false
  };

  users.push(user);
  writeUsers(users);

  const verifyLink = `https://smart-flashcards-app.onrender.com/auth/verify/${user.id}`;
  transporter.sendMail({
    from: 'smart.flashcards@mail.com',
    to: email,
    subject: 'Conferma la tua registrazione',
    text: `Clicca qui per verificare la tua email: ${verifyLink}`
  });

  res.json({ message: 'Registrazione completata. Controlla la tua email per confermare.' });
});

// === VERIFICA EMAIL ===
router.get('/verify/:id', (req, res) => {
  const users = readUsers();
  const user = users.find(u => u.id === req.params.id);
  if (!user) return res.status(400).send('Utente non trovato.');
  user.verified = true;
  writeUsers(users);
  res.send('✅ Email verificata! Ora puoi accedere.');
});

// === LOGIN ===
router.post('/login', (req, res) => {
  const { email, password } = req.body;
  const users = readUsers();
  const user = users.find(u => u.email === email);

  if (!user) return res.status(400).json({ error: 'Utente non trovato' });
  if (!bcrypt.compareSync(password, user.password)) return res.status(400).json({ error: 'Password errata' });
  if (!user.verified) return res.status(400).json({ error: 'Email non verificata' });

  const token = generateToken(user);

  // salva token in cookie httpOnly per 7 giorni
  res.cookie('token', token, {
    httpOnly: true,
    secure: true,
    sameSite: 'None',
    maxAge: 7 * 24 * 60 * 60 * 1000
  });

  res.json({ message: 'Login riuscito', username: user.username });
});

// === AUTOLOGIN CON COOKIE ===
router.get('/autologin', (req, res) => {
  const token = req.cookies.token;
  if (!token) return res.status(401).json({ error: 'Nessun token' });
  try {
    const decoded = jwt.verify(token, SECRET);
    const users = readUsers();
    const user = users.find(u => u.id === decoded.id);
    if (!user) return res.status(401).json({ error: 'Utente non trovato' });
    res.json({ id: user.id, email: user.email, username: user.username });
  } catch {
    res.status(401).json({ error: 'Token non valido' });
  }
});

// === LOGOUT ===
router.post('/logout', (req, res) => {
  res.clearCookie('token', { httpOnly: true, secure: true, sameSite: 'None' });
  res.json({ message: 'Logout eseguito' });
});

// === RESET PASSWORD: INVIO LINK ===
router.post('/forgot', (req, res) => {
  const { email } = req.body;
  const users = readUsers();
  const user = users.find(u => u.email === email);
  if (!user) return res.status(400).json({ error: 'Utente non trovato' });

  const resetToken = jwt.sign({ id: user.id }, SECRET, { expiresIn: '1h' });
  const resetLink = `https://smart-flashcards-app.onrender.com/auth/reset/${resetToken}`;

  transporter.sendMail({
    from: 'smart.flashcards@mail.com',
    to: email,
    subject: 'Recupero password',
    text: `Clicca qui per reimpostare la password: ${resetLink}`
  });

  res.json({ message: 'Email di recupero inviata' });
});

// === RESET PASSWORD: NUOVA PASSWORD ===
router.post('/reset/:token', (req, res) => {
  const { password } = req.body;
  try {
    const decoded = jwt.verify(req.params.token, SECRET);
    const users = readUsers();
    const user = users.find(u => u.id === decoded.id);
    if (!user) return res.status(400).json({ error: 'Utente non trovato' });

    user.password = bcrypt.hashSync(password, 10);
    writeUsers(users);
    res.json({ message: 'Password aggiornata con successo' });
  } catch {
    res.status(400).json({ error: 'Token non valido o scaduto' });
  }
});

module.exports = router;

