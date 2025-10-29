const fs = require('fs');
const path = require('path');
const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

// ---- INIZIO: Mailjet ----
const Mailjet = require('node-mailjet');
const mailjet = Mailjet.apiConnect('c07a08a60161be9bafcadab355f4dc3f', '07a3d302f2a173dd097be3728e4f04ce');

// Email reset password
async function sendResetEmail(toEmail, token) {
  const resetUrl = `http://localhost:3000/auth/reset/${token}`;
  return mailjet.post("send", {'version':'v3.1'}).request({
    Messages:[{
      From: { Email: "freemidis@gmail.com", Name: "Flashcards App" },
      To: [{ Email: toEmail }],
      Subject: "Recupero password — Flashcards",
      TextPart: `Clicca qui per reimpostare la password: ${resetUrl}`,
      HTMLPart: `<p>Clicca per reimpostare la password: <a href="${resetUrl}">${resetUrl}</a></p>`
    }]
  });
}

// Email verifica account
async function sendVerificationEmail(toEmail, token) {
  const verifyUrl = `http://localhost:3000/auth/verify/${token}`;
  return mailjet.post("send", {'version':'v3.1'}).request({
    Messages:[{
      From: { Email: "freemidis@gmail.com", Name: "Flashcards App" },
      To: [{ Email: toEmail }],
      Subject: "Verifica Email — Flashcards",
      TextPart: `Clicca qui per verificare la tua email: ${verifyUrl}`,
      HTMLPart: `<p>Clicca per verificare la tua email: <a href="${verifyUrl}">${verifyUrl}</a></p>`
    }]
  });
}
// ---- FINE: Mailjet ----

const router = express.Router();
const usersFile = path.join(__dirname,'data','users.json');

// Carica utenti
function loadUsers() {
  if(!fs.existsSync(usersFile)) fs.writeFileSync(usersFile, '[]');
  return JSON.parse(fs.readFileSync(usersFile));
}

// Salva utenti
function saveUsers(users) {
  fs.writeFileSync(usersFile, JSON.stringify(users, null, 2));
}

// === REGISTRAZIONE ===
router.post('/register', async (req,res)=>{
  const {username,email,password} = req.body;
  if(!username||!email||!password) return res.status(400).json({error:'Campi mancanti'});

  let users = loadUsers();
  if(users.find(u=>u.email===email)) return res.status(400).json({error:'Email già registrata'});

  const hashed = await bcrypt.hash(password, 10);
  const token = crypto.randomBytes(20).toString('hex');
  const newUser = {
    id:Date.now(),
    username,
    email,
    password:hashed,
    verified:false,
    verifyToken:token,
    resetToken:null,
    resetExpire:null
  };
  users.push(newUser);
  saveUsers(users);

  try {
    await sendVerificationEmail(email, token);
    res.json({message:'Registrazione completata! Controlla la tua email per verificare l\'account.'});
  } catch(err) {
    console.error('Errore invio email verifica:', err);
    res.status(500).json({error:'Errore invio email verifica'});
  }
});

// === VERIFICA EMAIL ===
router.get('/verify/:token', (req,res)=>{
  const {token} = req.params;
  let users = loadUsers();
  const user = users.find(u=>u.verifyToken===token);
  if(!user) return res.send('Token non valido o scaduto');
  user.verified = true;
  user.verifyToken = null;
  saveUsers(users);
  res.send('Email verificata! Ora puoi fare login.');
});

// === LOGIN ===
router.post('/login', async (req,res)=>{
  const {email,password} = req.body;
  let users = loadUsers();
  const user = users.find(u=>u.email===email);
  if(!user) return res.status(400).json({error:'Email non registrata'});
  if(!user.verified) return res.status(400).json({error:'Email non verificata'});
  const ok = await bcrypt.compare(password, user.password);
  if(!ok) return res.status(400).json({error:'Password errata'});
  res.json({user:{id:user.id,username:user.username,email:user.email}});
});

// === RECUPERO PASSWORD ===
router.post('/forgot', async (req,res)=>{
  const {email} = req.body;
  let users = loadUsers();
  const user = users.find(u=>u.email===email);
  if(!user) return res.status(400).json({error:'Email non registrata'});

  const token = crypto.randomBytes(20).toString('hex');
  user.resetToken = token;
  user.resetExpire = Date.now()+3600000; // 1 ora
  saveUsers(users);

  try {
    await sendResetEmail(email, token);
    res.json({message:'Email inviata per reimpostare la password'});
  } catch(err) {
    console.error('Errore invio reset email:', err);
    res.status(500).json({error:'Errore invio email'});
  }
});

// === RESET PASSWORD ===
router.post('/reset/:token', async (req,res)=>{
  const {token} = req.params;
  const {password} = req.body;
  let users = loadUsers();
  const user = users.find(u => u.resetToken === token && u.resetExpire > Date.now());
  if(!user) return res.status(400).json({error:'Token non valido o scaduto'});
  user.password = await bcrypt.hash(password,10);
  user.resetToken = null;
  user.resetExpire = null;
  saveUsers(users);
  res.json({message:'Password aggiornata! Ora puoi fare login.'});
});

module.exports = router;
