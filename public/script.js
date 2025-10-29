// === VARIABILI GLOBALI ===
let currentUser = null;
let currentFolder = null;
let currentList = null;
let socket;

// === FUNZIONI UTILI ===
function qs(sel) { return document.querySelector(sel); }
function qsa(sel) { return document.querySelectorAll(sel); }
function el(tag, cls) { const e=document.createElement(tag); if(cls) e.className=cls; return e; }
function show(el) { el.classList.remove('hidden'); }
function hide(el) { el.classList.add('hidden'); }
function escapeHtml(s){return (s+'').replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));}

function msg(text,type='warn'){
  const area=qs('#message');
  if(!text){area.innerHTML='';return;}
  area.innerHTML=`<div class="${type}">${text}</div>`;
}

// === AUTENTICAZIONE ===
function openAuthModal(tab='login'){
  show(qs('#modalAuth'));
  switchTab(tab);
}
function closeAuthModal(){ hide(qs('#modalAuth')); }
function switchTab(tab){
  qsa('#authTabs .tab').forEach(t=>t.classList.toggle('active',t.dataset.tab===tab));
  qs('#formLogin').classList.toggle('hidden',tab!=='login');
  qs('#formRegister').classList.toggle('hidden',tab!=='register');
}

qs('#btnLogin').onclick=()=>openAuthModal('login');
qs('#btnRegister').onclick=()=>openAuthModal('register');
qsa('#authTabs .tab').forEach(t=>t.onclick=()=>switchTab(t.dataset.tab));
qsa('[data-action="close"]').forEach(b=>b.onclick=closeAuthModal);
qs('#btnRecover').onclick = async () => {
  const email = prompt('Inserisci la tua email per recuperare la password:');
  if (!email) return;
  const res = await fetch('/auth/forgot', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email })
  });
  const data = await res.json();
  if (res.ok) alert(data.message);
  else alert(data.error || 'Errore durante il recupero password');
};


qs('#formLogin').onsubmit=async e=>{
  e.preventDefault();
  const email=qs('#loginEmail').value, password=qs('#loginPassword').value;
  const r=await fetch('/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password})});
  const data=await r.json();
  if(!r.ok) return alert(data.error||'Errore login');
  currentUser=data.user;
  localStorage.setItem('token',data.token);
  afterLogin();
  closeAuthModal();
};

qs('#formRegister').onsubmit=async e=>{
  e.preventDefault();
  const username=qs('#regUsername').value, email=qs('#regEmail').value, password=qs('#regPassword').value;
  const r=await fetch('/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username,email,password})});
  const data=await r.json();
  if(!r.ok) return alert(data.error||'Errore registrazione');
  alert('Registrato! Ora accedi.');
  switchTab('login');
};

qs('#btnLogout').onclick=()=>{
  localStorage.removeItem('token');
  currentUser=null;
  hide(qs('#userMenu'));
  show(qs('#userArea'));
};

// === DOPO LOGIN ===
function afterLogin(){
  hide(qs('#userArea'));
  show(qs('#userMenu'));
  qs('#usernameLabel').textContent=currentUser.username;
  socket.emit('join',currentUser.id);
  loadFolders();
}

// === SOCKET.IO ===
function initSocket(){
  socket=io();
  socket.on('connect',()=>console.log('socket connected'));
  socket.on('lists:updated',loadLists);
}

// === FETCH WRAPPER ===
async function api(path,method='GET',body){
  const token=localStorage.getItem('token');
  const res=await fetch(path,{
    method,
    headers:{'Content-Type':'application/json','Authorization':token?`Bearer ${token}`:''},
    body:body?JSON.stringify(body):undefined
  });
  if(res.status===401){ alert('Sessione scaduta'); localStorage.removeItem('token'); location.reload(); }
  return res.json();
}

// === CARTELLE ===
async function loadFolders(){
  const data=await api('/api/folders');
  const ul=qs('#foldersList'); ul.innerHTML='';
  data.forEach(f=>{
    const li=qs('#tplFolderItem').content.cloneNode(true);
    li.querySelector('.name').textContent=f.name;
    li.querySelector('.name').onclick=()=>{currentFolder=f;loadLists();};
    li.querySelector('.rename').onclick=()=>renameFolder(f);
    li.querySelector('.del').onclick=()=>deleteFolder(f);
    ul.appendChild(li);
  });
}
qs('#btnNewFolder').onclick=async()=>{
  const name=prompt('Nome cartella:'); if(!name) return;
  await api('/api/folders','POST',{name});
  loadFolders();
};
async function renameFolder(f){
  const name=prompt('Nuovo nome:',f.name); if(!name) return;
  await api(`/api/folders/${f.id}`,'PUT',{name});
  loadFolders();
}
async function deleteFolder(f){
  if(!confirm('Eliminare cartella?')) return;
  await api(`/api/folders/${f.id}`,'DELETE');
  loadFolders();
}

// === LISTE ===
async function loadLists(){
  if(!currentFolder) return;
  const data=await api(`/api/folders/${currentFolder.id}/lists`);
  const ul=qs('#listsList'); ul.innerHTML='';
  data.forEach(l=>{
    const li=qs('#tplListItem').content.cloneNode(true);
    li.querySelector('.name').textContent=l.name;
    li.querySelector('.open').onclick=()=>openList(l);
    li.querySelector('.rename').onclick=()=>renameList(l);
    li.querySelector('.del').onclick=()=>deleteList(l);
    ul.appendChild(li);
  });
}
qs('#btnNewList').onclick=async()=>{
  if(!currentFolder) return alert('Seleziona una cartella');
  const name=prompt('Nome lista:'); if(!name) return;
  await api(`/api/folders/${currentFolder.id}/lists`,'POST',{name});
  loadLists();
};
async function renameList(l){
  const name=prompt('Nuovo nome:',l.name); if(!name) return;
  await api(`/api/lists/${l.id}`,'PUT',{name});
  loadLists();
}
async function deleteList(l){
  if(!confirm('Eliminare lista?')) return;
  await api(`/api/lists/${l.id}`,'DELETE');
  loadLists();
}

async function openList(l){
  currentList=l;
  qs('#listTitle').value=l.name;
  const data=await api(`/api/lists/${l.id}`);
  qs('#box1').value=data.front.join('\n');
  qs('#box2').value=data.back.join('\n');
  generateCards();
}

function splitLines(text){
  // Rimuove i numeri iniziali se ci sono (es. "1. Testo")
  return text.split(/\n+/)
             .map(l => l.trim().replace(/^\d+\.\s*/, ''))
             .filter(Boolean);
}

// === GENERATORE FLASHCARDS ===
function generateCards(){
  const t1 = qs('#box1').value.trim();
  const t2 = qs('#box2').value.trim();
  if (!t1 || !t2) { msg('Inserisci testo in entrambi i box.'); return; }

  let arr1 = splitLines(t1);
  let arr2 = splitLines(t2);

  if (arr1.length !== arr2.length) {
    msg(`Attenzione: numero di righe diverso! Fronte: ${arr1.length}, Retro: ${arr2.length}`);
  }

  const n = Math.min(arr1.length, arr2.length);
  const cards = qs('#cards');
  cards.innerHTML = '';

  for (let i = 0; i < n; i++) {
    const front = arr1[i];
    const back  = arr2[i];

    const c = el('div', 'card');
    c.innerHTML = `
      <button class="delCard">X</button>
      <div class="card-inner">
        <div class="face front">${escapeHtml(front)}</div>
        <div class="face back">${escapeHtml(back)}</div>
      </div>
    `;

    // Click per girare la carta
    c.querySelector('.card-inner').onclick = () => c.classList.toggle('flipped');

    // Click su X per cancellare la carta e la riga corrispondente nei box
    c.querySelector('.delCard').onclick = (e) => {
      e.stopPropagation(); // evita flip
      // Rimuovi la flashcard
      c.remove();
      // Rimuovi la riga corrispondente nei box
      let box1Lines = splitLines(qs('#box1').value);
      let box2Lines = splitLines(qs('#box2').value);
      box1Lines.splice(i,1);
      box2Lines.splice(i,1);
      // Aggiorna i box con numerazione
      qs('#box1').value = box1Lines.map((l,j)=>`${j+1}. ${l}`).join('\n');
      qs('#box2').value = box2Lines.map((l,j)=>`${j+1}. ${l}`).join('\n');
      // Rigenere le flashcards per ricalcolare gli indici
      generateCards();
    };

    cards.appendChild(c);
  }
  msg('');
}

// === BOTTONE GENERA / PREVIEW / RESET ===
qs('#btnGenerate').onclick = generateCards;
qs('#btnPreview').onclick = generateCards;
qs('#btnResetCards').onclick = () => {
  qs('#cards').innerHTML = '';
  msg('');
};

// === SALVATAGGIO LISTA ===
qs('#btnSaveList').onclick=async()=>{
  if(!currentFolder) return alert('Seleziona una cartella');
  const name=qs('#listTitle').value.trim()||'Senza nome';
  const front=splitLines(qs('#box1').value);
  const back=splitLines(qs('#box2').value);
  if(currentList)
    await api(`/api/lists/${currentList.id}`,'PUT',{name,front,back});
  else
    await api(`/api/folders/${currentFolder.id}/lists`,'POST',{name,front,back});
  alert('Lista salvata!');
  loadLists();
};

// === EXPORT / IMPORT ===
qs('#btnExport').onclick=async()=>{
  if(!currentList) return alert('Nessuna lista aperta');
  const res=await fetch(`/api/lists/${currentList.id}/export`);
  const blob=await res.blob();
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download=currentList.name+'.json';
  a.click();
};

qs('#btnImport').onclick=()=>qs('#fileImport').click();
qs('#fileImport').onchange=async e=>{
  const file=e.target.files[0]; if(!file) return;
  const text=await file.text();
  const data=JSON.parse(text);
  if(!currentFolder) return alert('Seleziona una cartella prima di importare');
  await api(`/api/folders/${currentFolder.id}/lists`,'POST',data);
  alert('Import completato!');
  loadLists();
};

// === AVVIO ===
window.addEventListener('DOMContentLoaded',()=>{
  initSocket();
  const token=localStorage.getItem('token');
  if(token){
    fetch('/auth/me',{headers:{Authorization:`Bearer ${token}`}})
      .then(r=>r.ok?r.json():null)
      .then(d=>{if(d){currentUser=d;afterLogin();}});
  }

  // === NUMERAZIONE AUTOMATICA NEI BOX ===
  function updateBoxNumbers(box){
    const lines = box.value.split('\n').map(l => l.trim()).filter(Boolean);
    box.value = lines.map((line,i) => `${i+1}. ${line}`).join('\n');
  }

  // Applica quando l'utente esce dal box
  qs('#box1').addEventListener('blur', ()=>updateBoxNumbers(qs('#box1')));
  qs('#box2').addEventListener('blur', ()=>updateBoxNumbers(qs('#box2')));
});
