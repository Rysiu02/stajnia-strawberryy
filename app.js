/* =====================================================
   STAJNIA STRAWBERRY — app.js
   ===================================================== */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFunctions, httpsCallable
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-functions.js";
import {
  getFirestore,
  doc, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc,
  collection, query, orderBy, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

/* =====================================================
   WŁASNY MODAL — zamiast confirm/alert
   ===================================================== */
let _dialogResolve = null;

function showConfirm(msg, confirmLabel = 'Potwierdź', danger = true) {
  return new Promise(resolve => {
    _dialogResolve = resolve;
    document.getElementById('dialog-msg').textContent = msg;
    const btn = document.getElementById('dialog-confirm-btn');
    btn.textContent = confirmLabel;
    btn.className   = 'btn ' + (danger ? 'btn-danger' : 'btn-primary');
    document.getElementById('western-dialog').classList.remove('hidden');
  });
}

window._dialogConfirm = function() {
  document.getElementById('western-dialog').classList.add('hidden');
  if (_dialogResolve) { _dialogResolve(true); _dialogResolve = null; }
};
window._dialogCancel = function() {
  document.getElementById('western-dialog').classList.add('hidden');
  if (_dialogResolve) { _dialogResolve(false); _dialogResolve = null; }
};



/* =====================================================
   FIREBASE INIT
   ===================================================== */
const firebaseConfig = {
  apiKey:            "AIzaSyC-ONjc-zKqbq6_ojQyTu7rPWm7iK5aZro",
  authDomain:        "stajniastrawberry.firebaseapp.com",
  projectId:         "stajniastrawberry",
  storageBucket:     "stajniastrawberry.firebasestorage.app",
  messagingSenderId: "832282119818",
  appId:             "1:832282119818:web:e92e2c18dc1fb01bbaa773"
};
const firebaseApp = initializeApp(firebaseConfig);
const auth        = getAuth(firebaseApp);
const db          = getFirestore(firebaseApp);
const functions   = getFunctions(firebaseApp, 'europe-west1');

/* =====================================================
   STAŁE
   ===================================================== */
const ROLES = {
  viewer:  { label: 'Obserwator', css: 'role-viewer' },
  worker:  { label: 'Pracownik',  css: 'role-worker' },
  deputy:  { label: 'Zastępca',   css: 'role-deputy' },
  owner:   { label: 'Właściciel', css: 'role-owner'  },
};
const ROLE_LEVEL = { viewer: 0, worker: 1, deputy: 2, owner: 2 };

/* Pozycje cennika — używane i w rachunkach i w magazynie */
const CATALOG = [
  /* === USŁUGI === */
  { id:'trening',     name:'Trening',                  cat:'Usługi',   icon:'🐴',                  img:null,                      price:15,   unit:'szt.' },
  /* === PRODUKTY === */
  { id:'szczotka',    name:'Szczotka',                  cat:'Produkty', icon:'🪮',                  img:'img/szczotka.png',        price:7,    unit:'szt.' },
  { id:'kopystka',    name:'Kopystka',                  cat:'Produkty', icon:'🔧',                  img:'img/kopystka.png',        price:17,   unit:'szt.' },
  { id:'ozwiezwiacz', name:'Oźwieżwiacz dla konia',     cat:'Produkty', icon:'💊',                  img:'img/ozwiezwiacz.png',     price:31,   unit:'szt.' },
  { id:'masc',        name:'Maść dla konia',            cat:'Produkty', icon:'🧴',                  img:'img/masc.png',            price:21,   unit:'szt.' },
  { id:'siano',       name:'Siano',                     cat:'Produkty', icon:'🌾',                  img:'img/siano.png',           price:2,    unit:'kg'   },
  { id:'marchewka',   name:'Marchewka',                 cat:'Produkty', icon:'🥕',                  img:'img/marchew.png',         price:2,    unit:'szt.' },
  { id:'cukier',      name:'Cukier',                    cat:'Produkty', icon:'🍬',                  img:'img/cukier.png',          price:1.5,  unit:'kg'   },
];

/* =====================================================
   STAN
   ===================================================== */
let currentUser    = null;
let currentProfile = null;
let currentRole    = null;
let warehouseCache = [];
let editingItemId  = null;
let movingItemId   = null;

/* =====================================================
   AUTH
   ===================================================== */
onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUser = user;
    await loadUserProfile(user.uid);
    showApp();
  } else {
    currentUser = currentProfile = currentRole = null;
    showLogin();
  }
});

async function loadUserProfile(uid) {
  /* Zawsze najpierw ustaw fallback z danych Auth */
  currentProfile = {
    displayName: currentUser.displayName || currentUser.email,
    email:       currentUser.email,
    role:        'viewer'
  };
  currentRole = 'viewer';

  try {
    const snap = await getDoc(doc(db, 'users', uid));
    if (snap.exists()) {
      /* Profil znaleziony — nadpisz danymi z Firestore (imię i rola właściciela) */
      const data = snap.data();
      currentProfile = data;
      currentRole    = data.role || 'viewer';
      /* Jeśli displayName w Firestore jest mailem (stary błąd) — NIE nadpisuj */
      if (!data.displayName || data.displayName === data.email || data.displayName.includes('@')) {
        /* displayName to email lub puste — zachowaj to co mamy, nie naprawiaj tu */
      }
    } else {
      /* Brak profilu — utwórz z danymi Auth (nie nadpisuj jeśli właściciel już stworzył) */
      currentProfile = {
        displayName: currentUser.displayName || currentUser.email.split('@')[0],
        email:       currentUser.email,
        role:        'viewer'
      };
      await setDoc(doc(db, 'users', uid), {
        ...currentProfile,
        createdAt: serverTimestamp()
      });
    }
  } catch(e) {
    console.error('loadUserProfile error:', e);
    /* Fallback już ustawiony powyżej */
  }
}

/* =====================================================
   POMOCNICZE
   ===================================================== */
function isOwnerLevel() {
  return currentRole === 'owner' || currentRole === 'deputy';
}
const fmt  = n => (Math.round((n||0)*100)/100).toLocaleString('pl-PL',
  { minimumFractionDigits:2, maximumFractionDigits:2 }) + ' $';
const fmtD = ts => ts?.toDate
  ? ts.toDate().toLocaleDateString('pl-PL', { day:'numeric', month:'short', year:'numeric' })
  : '—';
function currentMonth() { return new Date().toISOString().slice(0,7); }

/* Rozliczenia tygodniowe — zwraca string "RRRR-Wnn" np. "2025-W18" (ISO 8601) */
function currentWeek() {
  return dateToWeek({ toDate: () => new Date() });
}

/* Zamień timestamp Firestore lub Date na "RRRR-Wnn" (ISO 8601) */
function dateToWeek(ts) {
  if (!ts) return null;
  const d    = ts.toDate ? ts.toDate() : (ts instanceof Date ? ts : new Date());
  const tmp  = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  tmp.setUTCDate(tmp.getUTCDate() + 4 - (tmp.getUTCDay() || 7));
  const jan1 = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((tmp - jan1) / 86400000) + 1) / 7);
  return tmp.getUTCFullYear() + '-W' + String(week).padStart(2, '0');
}

/* Etykieta tygodnia np. "Tydzień 18 (28 kwi – 4 maj 2025)" */
function weekLabel(weekStr) {
  if (!weekStr) return '—';
  // Obsłuż format "2025-W18" i "2025-W18" z przeglądarki
  const match = String(weekStr).match(/(\d{4})-W(\d{1,2})/);
  if (!match) return weekStr;
  const year    = parseInt(match[1]);
  const weekNum = parseInt(match[2]);
  // ISO 8601 — pierwszy czwartek roku wyznacza tydzień 1
  const jan4    = new Date(year, 0, 4);
  const monday  = new Date(jan4);
  monday.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7) + (weekNum - 1) * 7);
  const sunday  = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const fmtDay  = d => d.toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' });
  return `Tydzień ${weekNum} (${fmtDay(monday)} – ${fmtDay(sunday)} ${year})`;
}

/* =====================================================
   EKRANY
   ===================================================== */
function showLogin() {
  document.getElementById('loading-overlay').classList.add('hidden');
  document.getElementById('login-screen').classList.remove('hidden');
  document.getElementById('app').classList.add('hidden');
  // Zawsze resetuj przycisk i pola przy powrocie do logowania
  const btn = document.getElementById('login-btn');
  if (btn) { btn.disabled = false; btn.textContent = 'Wejdź do Stajni'; }
  const err = document.getElementById('login-error');
  if (err) err.style.display = 'none';
}

function showApp() {
  document.getElementById('loading-overlay').classList.add('hidden');
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');

  const badge = document.getElementById('user-badge');
  badge.className = 'user-badge ' + (ROLES[currentRole]?.css || '');

  /* Wybierz najlepsze imię do wyświetlenia */
  const rawName   = currentProfile?.displayName || '';
  const looksLikeEmail = rawName.includes('@') || !rawName;
  const displayN  = looksLikeEmail
    ? (currentUser.email.split('@')[0])  // fallback na część przed @
    : rawName;

  document.getElementById('user-name-display').textContent =
    displayN + ' · ' + (ROLES[currentRole]?.label || '');
  document.getElementById('sidebar-role-info').textContent =
    'Rola: ' + (ROLES[currentRole]?.label || '—');

  const now = new Date();
  document.getElementById('current-date').textContent =
    now.toLocaleDateString('pl-PL', { weekday:'long', year:'numeric', month:'long', day:'numeric' });
  document.getElementById('dashboard-greeting').textContent =
    'Dzień dobry, ' + (looksLikeEmail ? displayN : displayN.split(' ')[0]);
  document.getElementById('current-month-label').textContent = weekLabel(currentWeek());

  const ym = now.toISOString().slice(0,7);
  ['receipts-filter-month','expenses-filter-month'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = ym;
  });
  const tw = document.getElementById('tax-filter-week');
  if (tw) tw.value = currentWeek();

  applyRoleRestrictions();
  loadAll();
}

function loadAll() {
  loadDashboard();
  loadReceiptsHistory();
  loadExpenses();
  loadPayroll();
  loadWarehouse(); // buildCatalogTiles() wywoływane wewnątrz loadWarehouse
  loadAccounts();
  loadTax();
  loadNotes();
  renderBasket();  // inicjalizuj pusty koszyk
}

/* =====================================================
   LOGIN / LOGOUT
   ===================================================== */
window.doLogin = async function() {
  const email = document.getElementById('login-email').value.trim();
  const pass  = document.getElementById('login-pass').value;
  const btn   = document.getElementById('login-btn');
  const err   = document.getElementById('login-error');
  if (!email || !pass) { showLoginErr('Wypełnij oba pola.'); return; }
  btn.disabled = true; btn.textContent = 'Sprawdzam...';
  err.style.display = 'none';
  try {
    await signInWithEmailAndPassword(auth, email, pass);
  } catch(e) {
    btn.disabled = false; btn.textContent = 'Wejdź do Stajni';
    const msgs = {
      'auth/invalid-email':          'Nieprawidłowy adres e-mail.',
      'auth/user-not-found':         'Nie znaleziono konta z tym adresem.',
      'auth/wrong-password':         'Błędne hasło — spróbuj ponownie.',
      'auth/invalid-credential':     'Błędne dane logowania.',
      'auth/too-many-requests':      'Za dużo prób logowania — odczekaj chwilę.',
      'auth/user-disabled':          'To konto zostało zablokowane.',
      'auth/network-request-failed': 'Błąd sieci — sprawdź połączenie.',
      'auth/missing-password':       'Podaj hasło.',
      'auth/missing-email':          'Podaj adres e-mail.',
    };
    showLoginErr(msgs[e.code] || ('Błąd: ' + e.message));
  }
};
function showLoginErr(msg) {
  const e = document.getElementById('login-error');
  e.textContent = '⚠ ' + msg; e.style.display = 'block';
}
window.doLogout = async function() {
  await signOut(auth);
  // Reset przycisku logowania — onAuthStateChanged wywoła showLogin()
  const btn = document.getElementById('login-btn');
  if (btn) { btn.disabled = false; btn.textContent = 'Wejdź do Stajni'; }
};

/* =====================================================
   NAWIGACJA
   ===================================================== */
window.goTo = function(section, el) {
  if (el?.dataset.blocked === 'true') { showToast('⛔ Brak dostępu'); return; }
  const minRole = el?.dataset.minRole;
  if (minRole && ROLE_LEVEL[currentRole] < ROLE_LEVEL[minRole]) {
    showToast('⛔ Brak dostępu'); return;
  }
  document.querySelectorAll('.page-section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('section-' + section)?.classList.add('active');
  el?.classList.add('active');
};

/* =====================================================
   ROLE
   ===================================================== */
function applyRoleRestrictions() {
  const lvl = ROLE_LEVEL[currentRole] ?? 0;

  document.querySelectorAll('.nav-item[data-min-role]').forEach(item => {
    const min     = item.dataset.minRole;
    const blocked = ROLE_LEVEL[min] > lvl;
    item.style.opacity   = blocked ? '0.35' : '1';
    item.title           = blocked ? 'Brak dostępu' : '';
    item.dataset.blocked = blocked ? 'true' : 'false';
  });

  // Panel dodawania wydatków — tylko owner/deputy
  const ep = document.getElementById('add-expense-panel');
  if (ep) ep.style.display = isOwnerLevel() ? 'block' : 'none';

  // Przycisk nowej pozycji w magazynie — nie dla viewera
  const addWhBtn = document.querySelector('#section-warehouse .page-header .btn');
  if (addWhBtn) addWhBtn.style.display = lvl >= ROLE_LEVEL['worker'] ? 'inline-block' : 'none';
}

/* =====================================================
   DASHBOARD — pobiera wszystko i filtruje w JS
   ===================================================== */
async function loadDashboard() {
  try {
    const month = currentMonth();

    /* Rachunki — wszystkie, filtrujemy po miesiącu w JS */
    const rSnap = await getDocs(collection(db,'receipts'));
    let totalSales=0, totalStable=0, totalWorkers=0;
    const workerMap = {};
    const recentRows = [];

    const week = currentWeek();
    rSnap.forEach(d => {
      const r = d.data();
      /* Dla nowych rachunków sprawdź pole week, dla starych wylicz z daty */
      const rWeek = r.week || dateToWeek(r.createdAt);
      if (rWeek !== week) return;
      totalSales   += r.total      || 0;
      totalStable  += r.stable     || 0;
      totalWorkers += r.workerCut  || 0;
      const uid = r.workerUid;
      if (!workerMap[uid]) workerMap[uid] = { name: r.workerName||'—', sales:0, workerCut:0, paid:0 };
      workerMap[uid].sales     += r.total     || 0;
      workerMap[uid].workerCut += r.workerCut || 0;
      recentRows.push({ ...r, _id: d.id });
    });

    /* Wypłacone — filtruj po bieżącym tygodniu */
    const pSnap = await getDocs(collection(db,'payouts'));
    pSnap.forEach(d => {
      const p = d.data();
      const pKey = p.week || p.month;
      if (pKey !== week) return;
      if (workerMap[p.workerUid]) workerMap[p.workerUid].paid += p.amount || 0;
    });

    /* Wydatki */
    const eSnap = await getDocs(collection(db,'expenses'));
    let totalExp = 0;
    eSnap.forEach(d => {
      const e = d.data();
      if (e.month === month) totalExp += e.amount || 0;
    });

    document.getElementById('stat-today').textContent       = fmt(totalSales);
    document.getElementById('stat-stable').textContent      = fmt(totalStable);
    document.getElementById('stat-workers-tab').textContent = fmt(totalWorkers);
    document.getElementById('stat-expenses').textContent    = fmt(totalExp);

    /* Tabela zakładek */
    const tbody = document.getElementById('workers-tabs-body');
    const rows  = Object.values(workerMap);
    tbody.innerHTML = rows.length
      ? rows.map(w => `<tr>
          <td>${w.name}</td>
          <td>${fmt(w.sales)}</td>
          <td><strong style="color:#6abf7e">${fmt(w.workerCut)}</strong></td>
          <td class="muted">${fmt(w.paid)}</td>
          <td><strong style="color:var(--pale-gold)">${fmt(Math.max(0,w.workerCut-w.paid))}</strong></td>
        </tr>`).join('')
      : '<tr><td colspan="5" class="muted" style="text-align:center;padding:1rem">Brak sprzedaży w tym miesiącu</td></tr>';

    /* Ostatnie rachunki — sortujemy po czasie malejąco */
    recentRows.sort((a,b) => (b.createdAt?.seconds||0)-(a.createdAt?.seconds||0));
    const recTbody = document.getElementById('dashboard-receipts');
    recTbody.innerHTML = recentRows.length
      ? recentRows.slice(0,8).map(r => `<tr>
          <td class="muted">${fmtD(r.createdAt)}</td>
          <td>${r.workerName||'—'}</td>
          <td class="muted" style="font-size:0.75rem">${(r.lines||[]).map(l=>l.name).join(', ')}</td>
          <td><strong style="color:var(--pale-gold)">${fmt(r.total)}</strong></td>
          <td style="color:var(--amber)">${fmt(r.stable)}</td>
          <td style="color:#6abf7e">${fmt(r.workerCut)}</td>
        </tr>`).join('')
      : '<tr><td colspan="6" class="muted" style="text-align:center;padding:1rem">Brak rachunków</td></tr>';

  } catch(e) { console.error('Dashboard:', e); }
}

/* =====================================================
   RACHUNKI — formularz (kafelki + koszyk)
   ===================================================== */

/* Koszyk: tablica { id, name, icon, price, qty, isHorse, horseFee } */
let basket = [];
let pendingHorse = null; // nieużywane, zachowane dla kompatybilności

/* Buduje kafelki przy starcie i po odświeżeniu magazynu */
function buildCatalogTiles() {
  renderTiles('tiles-uslugi',  CATALOG.filter(c => c.cat === 'Usługi'));
  renderTiles('tiles-produkty', CATALOG.filter(c => c.cat === 'Produkty'));
  renderHorseTiles();
}

function renderTiles(containerId, items) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = items.map(item => {
    const whItem   = warehouseCache.find(w => w.name.toLowerCase() === item.name.toLowerCase());
    const hasStock = !whItem || (whItem.qty ?? 0) > 0;
    const isProduct = item.cat === 'Produkty';
    const qty      = whItem ? (whItem.qty ?? 0) : null;
    const blocked  = isProduct && whItem && !hasStock;

    /* Ikona — obrazek jeśli dostępny, fallback na emoji */
    const iconHtml = item.img
      ? `<img src="${item.img}" class="catalog-tile-img" alt="${item.name}" onerror="this.style.display='none';this.nextSibling.style.display='block'"/><span class="catalog-tile-emoji" style="display:none">${item.icon}</span>`
      : `<span class="catalog-tile-emoji">${item.icon}</span>`;

    return `
      <div class="catalog-tile ${blocked ? 'catalog-tile-blocked' : ''}"
        onclick="${blocked ? '' : `addToBasket('${item.id}')`}"
        title="${blocked ? 'Brak w magazynie' : item.name + ' — ' + item.price + '$'}">
        <div class="catalog-tile-icon">${iconHtml}</div>
        <div class="catalog-tile-name">${item.name}</div>
        <div class="catalog-tile-price">${item.price.toLocaleString('pl-PL', {minimumFractionDigits: item.price % 1 ? 2 : 0})} $</div>
        ${isProduct && whItem ? `<div class="catalog-tile-stock ${!hasStock ? 'out' : qty <= (whItem.threshold??5) ? 'low' : ''}">
          ${!hasStock ? '⛔ Brak' : 'Stan: ' + qty + ' ' + (whItem.unit||'szt.')}
        </div>` : ''}
        ${blocked ? '<div class="catalog-tile-overlay">BRAK</div>' : ''}
      </div>`;
  }).join('');
}

function renderHorseTiles() {
  const el = document.getElementById('tiles-konie');
  if (!el) return;
  const horses = [
    { id:'kon_do300',      name:'Koń do 300$',      icon:'🐴', fee:25, desc:'+ 25$ prowizji' },
    { id:'kon_400_700',    name:'Koń 400–700$',      icon:'🐎', fee:30, desc:'+ 30$ prowizji' },
    { id:'kon_powyzej700', name:'Koń powyżej 700$',  icon:'🏇', fee:40, desc:'+ 40$ prowizji' },
  ];
  el.innerHTML = horses.map(h => `
    <div class="catalog-tile catalog-tile-horse"
      onclick="addHorseDirectly('${h.id}','${h.name}',${h.fee},'${h.icon}')"
      title="${h.desc}">
      <div class="catalog-tile-icon">${h.icon}</div>
      <div class="catalog-tile-name">${h.name}</div>
      <div class="catalog-tile-price">${h.desc}</div>
    </div>`).join('');
}

window.addHorseDirectly = function(id, name, fee, icon) {
  basket.push({ id, name, icon: icon||'🐎', price: fee, qty: 1, isHorse: true });
  renderBasket();
  showToast('✓ Dodano: ' + name);
};

window.openHorsePanel = function(id, name, fee) {};

window.cancelHorse = function() {};

window.onHorsePriceInput = function() {};

window.addHorseToReceipt = function() {};

window.addToBasket = function(itemId) {
  const item = CATALOG.find(c => c.id === itemId);
  if (!item) return;

  // Sprawdź stan magazynowy dla produktów
  if (item.cat === 'Produkty') {
    const whItem = warehouseCache.find(w => w.name.toLowerCase() === item.name.toLowerCase());
    if (whItem && (whItem.qty ?? 0) <= 0) {
      showToast('⛔ Brak w magazynie: ' + item.name);
      return;
    }
  }

  // Jeśli już w koszyku — zwiększ ilość
  const existing = basket.find(b => b.id === itemId);
  if (existing) {
    // Sprawdź limit magazynowy
    if (item.cat === 'Produkty') {
      const whItem = warehouseCache.find(w => w.name.toLowerCase() === item.name.toLowerCase());
      if (whItem && existing.qty >= (whItem.qty ?? 0)) {
        showToast('⚠ Maksymalna dostępna ilość: ' + whItem.qty + ' ' + (whItem.unit||'szt.'));
        return;
      }
    }
    existing.qty++;
  } else {
    basket.push({ id: itemId, name: item.name, icon: item.icon, price: item.price, qty: 1, isHorse: false });
  }
  renderBasket();
};

function renderBasket() {
  const el = document.getElementById('receipt-basket');
  if (!basket.length) {
    el.innerHTML = '<div style="font-family:var(--font-type);color:var(--dust);font-size:0.8rem;padding:0.5rem 0">Kliknij kafelek żeby dodać pozycję...</div>';
    recalcBasket();
    return;
  }
  el.innerHTML = basket.map((item, idx) => `
    <div class="basket-row">
      <span class="basket-icon">${item.icon}</span>
      <span class="basket-name">${item.name}</span>
      <div class="basket-qty-ctrl">
        ${!item.isHorse ? `<button onclick="changeQty(${idx},-1)">−</button>` : ''}
        <span>${item.qty}</span>
        ${!item.isHorse ? `<button onclick="changeQty(${idx},1)">+</button>` : ''}
      </div>
      <span class="basket-price">${fmt(item.price * item.qty)}</span>
      <button class="btn btn-danger" style="padding:0.15rem 0.4rem;font-size:0.7rem" onclick="removeFromBasket(${idx})">✕</button>
    </div>`).join('');
  recalcBasket();
}

window.changeQty = function(idx, delta) {
  const item = basket[idx];
  if (!item) return;
  const newQty = item.qty + delta;
  if (newQty <= 0) { basket.splice(idx, 1); renderBasket(); return; }

  // Limit magazynowy
  if (!item.isHorse) {
    const cat = CATALOG.find(c => c.id === item.id);
    if (cat?.cat === 'Produkty') {
      const wh = warehouseCache.find(w => w.name.toLowerCase() === cat.name.toLowerCase());
      if (wh && newQty > (wh.qty ?? 0)) {
        showToast('⚠ Max: ' + wh.qty + ' ' + (wh.unit||'szt.')); return;
      }
    }
  }
  item.qty = newQty;
  renderBasket();
};

window.removeFromBasket = function(idx) {
  basket.splice(idx, 1);
  renderBasket();
};

function recalcBasket() {
  const total = basket.reduce((s, i) => s + i.price * i.qty, 0);
  const half  = total / 2;
  document.getElementById('rec-total').textContent      = fmt(total);
  document.getElementById('rec-stable-cut').textContent = fmt(half);
  document.getElementById('rec-worker-cut').textContent = fmt(half);
}

window.clearReceipt = function() {
  basket = [];
  basket = [];
  pendingHorse = null;
  document.getElementById('rec-client').value = '';
  document.getElementById('rec-note').value   = '';
  renderBasket();
};

window.saveReceipt = async function() {
  if (!basket.length) { showToast('⚠ Koszyk jest pusty'); return; }

  const lines  = basket.map(i => ({ name: i.name, icon: i.icon, price: i.price, qty: i.qty, subtotal: i.price*i.qty, isHorse: !!i.isHorse }));
  const total  = lines.reduce((s,l) => s+l.subtotal, 0);
  const half   = total / 2;
  const month  = currentMonth();
  const client = document.getElementById('rec-client').value.trim();
  const note   = document.getElementById('rec-note').value.trim();

  try {
    await addDoc(collection(db,'receipts'), {
      lines, total, stable: half, workerCut: half,
      client, note, month, week,
      workerUid:  currentUser.uid,
      workerName: currentProfile?.displayName || currentUser.email,
      createdAt:  serverTimestamp()
    });
    showToast('✓ Rachunek zapisany');

    // Odejmij produkty z magazynu
    for (const item of basket) {
      if (item.isHorse) continue;
      const cat = CATALOG.find(c => c.id === item.id);
      if (!cat || cat.cat !== 'Produkty') continue;
      const wh = warehouseCache.find(w => w.name.toLowerCase() === cat.name.toLowerCase());
      if (!wh) continue;
      const newQty = Math.max(0, (wh.qty ?? 0) - item.qty);
      try {
        await updateDoc(doc(db,'warehouse',wh.id), { qty: newQty });
        await addDoc(collection(db,'moves'), {
          itemId: wh.id, itemName: wh.name,
          type: 'wydanie', qty: item.qty, newQty,
          note: 'Sprzedaż — rachunek',
          userName: currentProfile?.displayName || currentUser.email,
          userUid:  currentUser.uid,
          createdAt: serverTimestamp()
        });
      } catch(e) { console.warn('Magazyn odejmowanie:', e); }
    }

    clearReceipt();
    loadDashboard();
    loadReceiptsHistory();
    loadWarehouse();
    buildCatalogTiles(); // odśwież kafelki po zmianie stanu
  } catch(e) {
    console.error('saveReceipt:', e);
    showToast('❌ ' + e.message);
  }
};

/* Stare funkcje których już nie używamy — zostawiamy puste żeby nie było błędów */
window.addReceiptLine    = function() {};
window.removeReceiptLine = function() {};
window.onReceiptItemChange = function() {};
window.recalcLine        = function() {};

/* =====================================================
   RACHUNKI — historia (filtrowanie w JS, bez indeksu)
   ===================================================== */
window.loadReceiptsHistory = async function() {
  const month  = document.getElementById('receipts-filter-month')?.value || currentMonth();
  const tbody  = document.getElementById('receipts-history-body');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="8" class="muted" style="text-align:center;padding:1rem">Ładowanie...</td></tr>';
  try {
    const snap = await getDocs(collection(db,'receipts'));
    let rows = [];
    snap.forEach(d => {
      const r = d.data();
      if (r.month !== month) return;
      /* Pracownik widzi tylko swoje; obserwator i właściciel widzą wszystkie */
      if (currentRole === 'worker' && r.workerUid !== currentUser.uid) return;
      rows.push({ ...r, _id: d.id });
    });
    rows.sort((a,b) => (b.createdAt?.seconds||0)-(a.createdAt?.seconds||0));

    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="8" class="muted" style="text-align:center;padding:1.5rem">Brak rachunków w tym miesiącu</td></tr>';
      return;
    }
    tbody.innerHTML = rows.map(r => `
      <tr>
        <td class="muted">${fmtD(r.createdAt)}</td>
        <td>${r.client||'—'}</td>
        <td>${r.workerName||'—'}</td>
        <td style="font-size:0.75rem;color:var(--dust)">${(r.lines||[]).map(l=>`${l.name} ×${l.qty}`).join(', ')}</td>
        <td><strong style="color:var(--pale-gold)">${fmt(r.total)}</strong></td>
        <td style="color:var(--amber)">${fmt(r.stable)}</td>
        <td style="color:#6abf7e">${fmt(r.workerCut)}</td>
        <td>${isOwnerLevel() ? `<button class="btn btn-danger" style="padding:0.2rem 0.4rem;font-size:0.65rem"
          onclick="deleteReceipt('${r._id}')">Usuń</button>` : ''}</td>
      </tr>`).join('');
  } catch(e) { console.error('Receipts history:', e); showToast('❌ Błąd ładowania rachunków'); }
};

window.deleteReceipt = async function(id) {
  if (!await showConfirm('Usunąć ten rachunek?', 'Usuń')) return;
  try {
    await deleteDoc(doc(db,'receipts',id));
    showToast('✓ Rachunek usunięty');
    loadReceiptsHistory(); loadDashboard();
  } catch(e) { showToast('❌ ' + e.message); }
};

/* =====================================================
   WYDATKI
   ===================================================== */
window.loadExpenses = async function() {
  const month  = document.getElementById('expenses-filter-month')?.value || currentMonth();
  const tbody  = document.getElementById('expenses-body');
  if (!tbody) return;
  try {
    /* Załaduj listę pracowników do selecta */
    if (isOwnerLevel()) {
      const usersSnap = await getDocs(collection(db,'users'));
      const sel = document.getElementById('exp-who');
      if (sel) {
        sel.innerHTML = '';
        usersSnap.forEach(d => {
          const u = d.data();
          sel.innerHTML += `<option value="${u.displayName||u.email}">${u.displayName||u.email}</option>`;
        });
      }
    }

    const snap = await getDocs(collection(db,'expenses'));
    let rows = [];
    snap.forEach(d => {
      const e = d.data();
      if (e.month === month) rows.push({ ...e, _id: d.id });
    });
    rows.sort((a,b) => (b.createdAt?.seconds||0)-(a.createdAt?.seconds||0));

    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="5" class="muted" style="text-align:center;padding:1.5rem">Brak wydatków</td></tr>';
      return;
    }
    tbody.innerHTML = rows.map(e => `
      <tr>
        <td class="muted">${fmtD(e.createdAt)}</td>
        <td>${e.who||'—'}</td>
        <td>${e.description||'—'}</td>
        <td><strong style="color:#c94040">${fmt(e.amount)}</strong></td>
        <td>${isOwnerLevel() ? `<button class="btn btn-danger" style="padding:0.2rem 0.4rem;font-size:0.65rem"
          onclick="deleteExpense('${e._id}')">Usuń</button>` : ''}</td>
      </tr>`).join('');
  } catch(e) { console.error('Expenses:', e); }
};

window.saveExpense = async function() {
  const who    = document.getElementById('exp-who').value;
  const amount = parseFloat(document.getElementById('exp-amount').value);
  const desc   = document.getElementById('exp-desc').value.trim();
  const month  = currentMonth();
  if (!who || !amount || !desc) { showToast('⚠ Wypełnij wszystkie pola'); return; }
  try {
    await addDoc(collection(db,'expenses'), {
      who, amount, description: desc, month,
      createdBy: currentUser.uid, createdAt: serverTimestamp()
    });
    showToast('✓ Wydatek zapisany');
    document.getElementById('exp-amount').value = '';
    document.getElementById('exp-desc').value   = '';
    loadExpenses(); loadDashboard(); loadTax();
  } catch(e) { showToast('❌ ' + e.message); }
};

window.deleteExpense = async function(id) {
  if (!await showConfirm('Usunąć wydatek?', 'Usuń')) return;
  try {
    await deleteDoc(doc(db,'expenses',id));
    showToast('✓ Usunięto'); loadExpenses(); loadDashboard(); loadTax();
  } catch(e) { showToast('❌ ' + e.message); }
};

/* =====================================================
   WYPŁATY — rozliczenia TYGODNIOWE
   ===================================================== */
async function loadPayroll() {
  const el = document.getElementById('payroll-content');
  if (!isOwnerLevel()) {
    el.innerHTML = `<div class="access-denied">
      <div class="access-denied-icon">🔒</div>
      <div class="access-denied-text">Wypłaty dostępne tylko dla Właściciela i Zastępcy</div>
    </div>`;
    return;
  }
  try {
    const rSnap = await getDocs(collection(db,'receipts'));
    const pSnap = await getDocs(collection(db,'payouts'));

    /* Grupuj rachunki po tygodniach */
    const weekMap = {}; // { "2025-W18": { uid: { name, workerCut, paid } } }

    rSnap.forEach(d => {
      const r = d.data();
      const key = r.week || dateToWeek(r.createdAt) || r.month || '—';

      if (!weekMap[key]) weekMap[key] = {};
      if (!weekMap[key][r.workerUid]) weekMap[key][r.workerUid] = { name: r.workerName||'—', workerCut:0, paid:0 };
      weekMap[key][r.workerUid].workerCut += r.workerCut || 0;
    });

    /* Dodaj wypłacone kwoty */
    pSnap.forEach(d => {
      const p   = d.data();
      const key = p.week || p.month || '—';
      if (weekMap[key]?.[p.workerUid]) {
        weekMap[key][p.workerUid].paid += p.amount || 0;
      }
    });

    const weeks = Object.keys(weekMap).sort().reverse();
    if (!weeks.length) {
      el.innerHTML = '<p style="font-family:var(--font-type);color:var(--dust);padding:1rem">Brak danych</p>';
      return;
    }

    el.innerHTML = weeks.map(wk => {
      const label    = weekLabel(wk);
      const workers  = Object.entries(weekMap[wk]);
      const totalWk  = workers.reduce((s,[,w]) => s + w.workerCut, 0);
      const totalPaid= workers.reduce((s,[,w]) => s + w.paid, 0);
      const totalRem = Math.max(0, totalWk - totalPaid);

      return `
        <div class="panel">
          <div class="panel-header">
            <div class="panel-title">💰 ${label}</div>
            <span style="font-family:var(--font-type);font-size:0.7rem;color:var(--dust)">
              Do wypłaty: <strong style="color:var(--pale-gold)">${fmt(totalRem)}</strong>
            </span>
          </div>
          <div class="panel-body" style="padding:0">
            <table class="western-table">
              <thead>
                <tr><th>Pracownik</th><th>Zakładka (50%)</th><th>Wypłacono</th><th>Do wypłaty</th><th>Akcja</th></tr>
              </thead>
              <tbody>
                ${workers.map(([uid,w]) => {
                  const rem = Math.max(0, w.workerCut - w.paid);
                  return `<tr>
                    <td>${w.name}</td>
                    <td style="color:#6abf7e">${fmt(w.workerCut)}</td>
                    <td class="muted">${fmt(w.paid)}</td>
                    <td><strong style="color:var(--pale-gold)">${fmt(rem)}</strong></td>
                    <td>${rem > 0
                      ? `<button class="btn btn-primary" style="padding:0.25rem 0.6rem;font-size:0.65rem"
                          onclick="payWorker('${uid}','${w.name}','${wk}',${rem})">
                          Wypłać ${fmt(rem)}
                         </button>`
                      : '<span class="badge badge-green">Wypłacono</span>'}
                    </td>
                  </tr>`;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>`;
    }).join('');

  } catch(e) { console.error('Payroll:', e); el.innerHTML = '❌ Błąd ładowania'; }
}

window.payWorker = async function(uid, name, weekKey, amount) {
  const label = weekLabel(weekKey);
  if (!await showConfirm(`Wypłacić ${fmt(amount)} dla ${name}?\n${label}`, 'Wypłać', false)) return;
  try {
    await addDoc(collection(db,'payouts'), {
      workerUid:  uid,
      workerName: name,
      week:       weekKey,
      month:      weekKey.includes('-W') ? weekKey.slice(0,4) + '-' + String(new Date().getMonth()+1).padStart(2,'0') : weekKey,
      amount,
      paidBy:    currentUser.uid,
      createdAt: serverTimestamp()
    });
    showToast(`✓ Wypłacono ${fmt(amount)} dla ${name}`);
    loadPayroll(); loadDashboard();
  } catch(e) { showToast('❌ ' + e.message); }
};

/* =====================================================
   PODATEK — rozliczenia TYGODNIOWE
   ===================================================== */
window.loadTax = async function() {
  const selWeek = document.getElementById('tax-filter-week')?.value || currentWeek();

  const lbl = document.getElementById('tax-week-label');
  if (lbl) lbl.textContent = weekLabel(selWeek);

  try {
    const rSnap = await getDocs(collection(db,'receipts'));
    let income = 0;
    rSnap.forEach(d => {
      const r     = d.data();
      const rWeek = r.week || dateToWeek(r.createdAt);
      if (rWeek === selWeek) income += r.total || 0;
    });

    const eSnap = await getDocs(collection(db,'expenses'));
    let expenses = 0;
    eSnap.forEach(d => {
      const e     = d.data();
      const eWeek = e.week || dateToWeek(e.createdAt);
      if (eWeek === selWeek) expenses += e.amount || 0;
    });

    const net      = income - expenses;
    const rateSnap = await getDoc(doc(db,'settings','tax'));
    const rate     = rateSnap.exists() ? (rateSnap.data().rate || 0) : 0;
    const taxAmt   = net * (rate / 100);

    document.getElementById('tax-income').textContent       = fmt(income);
    document.getElementById('tax-exp').textContent          = fmt(expenses);
    document.getElementById('tax-net').textContent          = fmt(net);
    document.getElementById('tax-rate-display').textContent = rate + '%  (' + fmt(taxAmt) + ')';
    const ri = document.getElementById('tax-rate-input');
    if (ri) ri.value = rate || '';
  } catch(e) { console.error('Tax:', e); }
};

window.saveTaxRate = async function() {
  const rate = parseFloat(document.getElementById('tax-rate-input').value);
  if (isNaN(rate)||rate<0||rate>100) { showToast('⚠ Podaj stawkę 0–100'); return; }
  try {
    await setDoc(doc(db,'settings','tax'), { rate, updatedAt: serverTimestamp() });
    showToast('✓ Stawka: ' + rate + '%'); loadTax();
  } catch(e) { showToast('❌ ' + e.message); }
};

/* =====================================================
   MAGAZYN
   ===================================================== */
async function loadWarehouse() {
  try {
    const snap = await getDocs(collection(db,'warehouse'));
    warehouseCache = [];
    snap.forEach(d => warehouseCache.push({ id: d.id, ...d.data() }));
    warehouseCache.sort((a,b) => a.name.localeCompare(b.name,'pl'));
    renderWarehouse(warehouseCache);
    buildCatalogTiles(); // odśwież kafelki stanu magazynowego
  } catch(e) { console.error('Warehouse:', e); }
}

function renderWarehouse(items) {
  const tbody = document.getElementById('warehouse-body');
  if (!items.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="muted" style="text-align:center;padding:1.5rem">Magazyn jest pusty</td></tr>';
    return;
  }
  tbody.innerHTML = items.map(item => {
    const low = (item.qty??0) <= (item.threshold??5);
    return `<tr>
      <td>${item.icon||'📦'} ${item.name}</td>
      <td><strong style="color:${low?'#c94040':'var(--pale-gold)'}">${item.qty??0}</strong>
        ${low ? '<span class="badge badge-red" style="margin-left:0.4rem">Niski</span>' : ''}
      </td>
      <td class="muted">${item.unit||'szt.'}</td>
      <td class="muted">${item.threshold??5}</td>
      <td style="display:flex;gap:0.4rem;flex-wrap:wrap">
        <button class="btn btn-primary" style="padding:0.2rem 0.5rem;font-size:0.65rem"
          onclick="openMovePanel('${item.id}','${item.name}')">± Ruch</button>
        <button class="btn btn-ghost" style="padding:0.2rem 0.5rem;font-size:0.65rem"
          onclick="openEditItem('${item.id}')">Edytuj</button>
        ${isOwnerLevel() ? `<button class="btn btn-danger" style="padding:0.2rem 0.5rem;font-size:0.65rem"
          onclick="deleteItem('${item.id}')">Usuń</button>` : ''}
      </td>
    </tr>`;
  }).join('');
}

window.filterWarehouse = q =>
  renderWarehouse(warehouseCache.filter(i => i.name.toLowerCase().includes(q.toLowerCase())));

window.showAddItemModal = function() {
  editingItemId = null;
  document.getElementById('warehouse-modal-title').textContent = 'Nowa pozycja';

  /* Wypełnij select z CATALOG */
  const sel = document.getElementById('wh-catalog-sel');
  if (sel) {
    sel.innerHTML = '<option value="">— własna —</option>';
    const groups = {};
    CATALOG.forEach(c => {
      if (!groups[c.cat]) groups[c.cat] = [];
      groups[c.cat].push(c);
    });
    Object.entries(groups).forEach(([cat, items]) => {
      sel.innerHTML += `<optgroup label="${cat}">${items.map(c =>
        `<option value="${c.id}" data-icon="${c.icon}" data-unit="${c.unit}">${c.icon} ${c.name}</option>`
      ).join('')}</optgroup>`;
    });
  }

  ['wh-name','wh-icon','wh-unit'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('wh-qty').value       = 0;
  document.getElementById('wh-threshold').value = 5;
  document.getElementById('warehouse-modal').classList.remove('hidden');
};

window.onCatalogSelect = function(sel) {
  const opt = sel.selectedOptions[0];
  if (!opt || !opt.value) return;
  const found = CATALOG.find(c => c.id === opt.value);
  if (!found) return;
  document.getElementById('wh-name').value = found.name;
  document.getElementById('wh-icon').value = found.icon;
  document.getElementById('wh-unit').value = found.unit;
};

window.openEditItem = function(id) {
  const item = warehouseCache.find(i => i.id === id);
  if (!item) return;
  editingItemId = id;
  document.getElementById('warehouse-modal-title').textContent = 'Edytuj: ' + item.name;
  document.getElementById('wh-name').value      = item.name      || '';
  document.getElementById('wh-icon').value      = item.icon      || '';
  document.getElementById('wh-qty').value       = item.qty       ?? 0;
  document.getElementById('wh-unit').value      = item.unit      || '';
  document.getElementById('wh-threshold').value = item.threshold ?? 5;
  document.getElementById('warehouse-modal').classList.remove('hidden');
};

window.closeItemModal = function() {
  document.getElementById('warehouse-modal').classList.add('hidden');
  editingItemId = null;
};

window.saveWarehouseItem = async function() {
  const name      = document.getElementById('wh-name').value.trim();
  const icon      = document.getElementById('wh-icon').value.trim() || '📦';
  const qty       = parseFloat(document.getElementById('wh-qty').value) || 0;
  const unit      = document.getElementById('wh-unit').value.trim()  || 'szt.';
  const threshold = parseFloat(document.getElementById('wh-threshold').value) || 5;
  if (!name) { showToast('⚠ Podaj nazwę'); return; }
  try {
    if (editingItemId) {
      await updateDoc(doc(db,'warehouse',editingItemId), { name, icon, qty, unit, threshold });
    } else {
      await addDoc(collection(db,'warehouse'), { name, icon, qty, unit, threshold, createdAt: serverTimestamp() });
    }
    showToast('✓ Zapisano'); closeItemModal(); loadWarehouse();
  } catch(e) { showToast('❌ ' + e.message); }
};

window.deleteItem = async function(id) {
  if (!await showConfirm('Usunąć pozycję?', 'Usuń')) return;
  try {
    await deleteDoc(doc(db,'warehouse',id));
    showToast('✓ Usunięto'); loadWarehouse();
  } catch(e) { showToast('❌ ' + e.message); }
};

window.openMovePanel = function(id, name) {
  movingItemId = id;
  document.getElementById('move-panel-title').textContent = 'Ruch: ' + name;
  document.getElementById('move-qty').value  = '';
  document.getElementById('move-note').value = '';
  document.getElementById('move-panel').style.display = 'block';
  document.getElementById('move-panel').scrollIntoView({ behavior:'smooth' });
};
window.closeMovePanel = function() {
  document.getElementById('move-panel').style.display = 'none';
  movingItemId = null;
};
window.saveMove = async function() {
  const type = document.getElementById('move-type').value;
  const qty  = parseFloat(document.getElementById('move-qty').value);
  const note = document.getElementById('move-note').value.trim();
  if (!qty||qty<=0) { showToast('⚠ Podaj ilość'); return; }
  const item = warehouseCache.find(i => i.id === movingItemId);
  if (!item) return;
  let newQty = item.qty ?? 0;
  if      (type==='przyjecie') newQty += qty;
  else if (type==='wydanie')   newQty  = Math.max(0,newQty-qty);
  else                         newQty  = qty;
  try {
    await updateDoc(doc(db,'warehouse',movingItemId), { qty: newQty });
    await addDoc(collection(db,'moves'), {
      itemId: movingItemId, itemName: item.name, type, qty, newQty, note,
      userName: currentProfile?.displayName||currentUser.email,
      userUid: currentUser.uid, createdAt: serverTimestamp()
    });
    showToast('✓ Ruch zapisany'); closeMovePanel(); loadWarehouse();
  } catch(e) { showToast('❌ ' + e.message); }
};

/* =====================================================
   KONTA
   ===================================================== */
async function loadAccounts() {
  const el = document.getElementById('accounts-content');
  const hirePanel = document.getElementById('hire-panel');
  if (hirePanel) hirePanel.style.display = isOwnerLevel() ? 'block' : 'none';
  if (!el) return;
  if (!isOwnerLevel()) {
    el.innerHTML = `<div class="access-denied">
      <div class="access-denied-icon">🔒</div>
      <div class="access-denied-text">Tylko właściciel lub zastępca zarządza kontami</div>
    </div>`;
    return;
  }
  try {
    const snap = await getDocs(collection(db,'users'));
    let rows = '';
    snap.forEach(d => {
      const u      = d.data();
      const isSelf = d.id === currentUser.uid;
      rows += `<tr>
        <td>${(u.displayName && !u.displayName.includes('@')) ? u.displayName : (u.email?.split('@')[0]||'—')} ${isSelf?'<span class="badge badge-gray" style="font-size:0.6rem">Ty</span>':''}</td>
        <td class="muted">${u.email||'—'}</td>
        <td>${roleBadge(u.role)}</td>
        <td>
          <select class="form-select" style="padding:0.2rem 0.5rem;font-size:0.7rem;width:auto"
            onchange="changeRole('${d.id}',this.value)"
            ${isSelf?'disabled title="Nie możesz zmienić własnej roli"':''}>
            <option value="viewer"  ${u.role==='viewer' ?'selected':''}>Obserwator</option>
            <option value="worker"  ${u.role==='worker' ?'selected':''}>Pracownik</option>
            <option value="deputy"  ${u.role==='deputy' ?'selected':''}>Zastępca</option>
            <option value="owner"   ${u.role==='owner'  ?'selected':''}>Właściciel</option>
          </select>
        </td>
        <td>${!isSelf?`<button class="btn btn-danger" style="padding:0.2rem 0.5rem;font-size:0.65rem"
          onclick="fireEmployee('${d.id}','${u.displayName||u.email}')">Zwolnij</button>`:''}</td>
      </tr>`;
    });
    el.innerHTML = `<div class="panel">
      <div class="panel-header">
        <div class="panel-title">🔑 Lista Pracowników</div>
        <span style="font-family:var(--font-type);font-size:0.7rem;color:var(--dust)">${snap.size} kont</span>
      </div>
      <div class="panel-body" style="padding:0">
        <table class="western-table">
          <thead><tr><th>Imię i nazwisko</th><th>E-mail</th><th>Rola</th><th>Zmień rolę</th><th>Akcja</th></tr></thead>
          <tbody>${rows||'<tr><td colspan="5" class="muted" style="text-align:center;padding:1.5rem">Brak kont</td></tr>'}</tbody>
        </table>
      </div>
    </div>`;
  } catch(e) { console.error('Accounts:', e); }
}

window.changeRole = async function(uid, role) {
  try {
    await updateDoc(doc(db,'users',uid), { role });
    showToast('✓ Rola zmieniona'); loadAccounts();
  } catch(e) { showToast('❌ ' + e.message); }
};

window.hireEmployee = async function() {
  const name  = document.getElementById('hire-name').value.trim();
  const email = document.getElementById('hire-email').value.trim();
  const pass  = document.getElementById('hire-pass').value;
  const role  = document.getElementById('hire-role').value;
  const resultBox = document.getElementById('hire-result');

  if (!name||!email||!pass) { showToast('⚠ Wypełnij wszystkie pola'); return; }
  if (pass.length < 6)      { showToast('⚠ Hasło min. 6 znaków'); return; }

  resultBox.style.display = 'none';
  const btn = document.querySelector('#hire-panel .btn-primary');
  if (btn) { btn.disabled = true; btn.textContent = 'Tworzę konto...'; }

  try {
    /* Krok 1 — utwórz konto Auth przez REST API (nie dotyka sesji właściciela) */
    const apiKey = 'AIzaSyC-ONjc-zKqbq6_ojQyTu7rPWm7iK5aZro';
    const res    = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`,
      {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email, password: pass, returnSecureToken: false })
        /* returnSecureToken: false — NIE zwracaj tokenu sesji, nie nadpisuj sesji właściciela */
      }
    );
    const data = await res.json();

    if (data.error) {
      const msgs = {
        'EMAIL_EXISTS':                   'Ten e-mail jest już zajęty — konto istnieje w systemie.',
        'WEAK_PASSWORD : Password should be at least 6 characters': 'Hasło za słabe — minimum 6 znaków.',
        'WEAK_PASSWORD':                  'Hasło za słabe — minimum 6 znaków.',
        'INVALID_EMAIL':                  'Nieprawidłowy adres e-mail.',
        'INVALID_LOGIN_CREDENTIALS':      'Błędne dane logowania.',
        'TOO_MANY_ATTEMPTS_TRY_LATER':    'Za dużo prób — spróbuj za chwilę.',
        'OPERATION_NOT_ALLOWED':          'Rejestracja emailem jest wyłączona w Firebase Console.',
        'MISSING_PASSWORD':               'Podaj hasło dla nowego pracownika.',
        'MISSING_EMAIL':                  'Podaj adres e-mail nowego pracownika.',
        'QUOTA_EXCEEDED':                 'Przekroczono limit — spróbuj za chwilę.',
      };
      const errMsg = msgs[data.error.message] || ('Błąd: ' + data.error.message);
      showToast('❌ ' + errMsg);
      return;
    }

    const newUid = data.localId;

    /* Krok 2 — zapisz profil w Firestore z rolą wybraną przez właściciela */
    await setDoc(doc(db, 'users', newUid), {
      displayName: name,   /* imię i nazwisko — ZAWSZE z formularza */
      email,
      role,
      createdAt:  serverTimestamp(),
      hiredBy:    currentUser.uid,
      hiredByName: currentProfile?.displayName || currentUser.email
    });

    /* Krok 3 — wyczyść formularz i odśwież listę */
    document.getElementById('hire-name').value  = '';
    document.getElementById('hire-email').value = '';
    document.getElementById('hire-pass').value  = '';

    resultBox.style.display = 'block';
    resultBox.innerHTML = `
      <div style="background:rgba(74,140,92,0.15);border:1px solid #4a8c5c;
        padding:0.75rem 1rem;font-family:var(--font-type);font-size:0.8rem;color:#6abf7e;line-height:1.6">
        ✓ Konto dla <strong>${name}</strong> zostało utworzone<br>
        E-mail: ${email}<br>
        Rola: <strong>${ROLES[role]?.label}</strong><br>
        Pracownik może się teraz zalogować.
      </div>`;

    showToast('✓ ' + name + ' zatrudniony jako ' + ROLES[role]?.label + '!');
    loadAccounts();

  } catch(e) {
    console.error('hireEmployee:', e);
    showToast('❌ Błąd: ' + e.message);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '🤝 Zatrudnij'; }
  }
};

window.togglePassVisibility = function() {
  const input = document.getElementById('hire-pass');
  const eye   = document.getElementById('pass-eye');
  input.type  = input.type==='password' ? 'text' : 'password';
  eye.textContent = input.type==='password' ? '👁' : '🙈';
};

window.fireEmployee = async function(uid, name) {
  if (!await showConfirm(
    `Usunąć konto ${name}?\nUżytkownik straci dostęp i nie będzie mógł się zalogować.`,
    'Usuń konto'
  )) return;

  showToast('⏳ Usuwanie konta...');

  try {
    /* Wywołaj Cloud Function — usuwa z Auth + Firestore */
    const deleteUser = httpsCallable(functions, 'deleteUser');
    await deleteUser({ uid });
    showToast('✓ Konto ' + name + ' zostało usunięte');
    loadAccounts();
  } catch(e) {
    if (e.code === 'functions/not-found' || e.message?.includes('not-found')) {
      /* Cloud Function nie jest jeszcze wdrożona — fallback: oznacz w Firestore */
      showToast('⚠ Cloud Function nie wdrożona — blokuję dostęp w bazie...');
      try {
        await updateDoc(doc(db,'users',uid), {
          role:    'viewer',
          fired:   true,
          active:  false,
          firedAt: serverTimestamp(),
          firedBy: currentUser.uid
        });
        showToast('✓ ' + name + ' zablokowany (rola: Obserwator). Wdróż Cloud Function żeby usuwać konta całkowicie.');
        loadAccounts();
      } catch(e2) { showToast('❌ ' + e2.message); }
    } else {
      showToast('❌ Błąd: ' + (e.message || e.code));
      console.error('fireEmployee:', e);
    }
  }
};

/* =====================================================
   NOTATKI
   ===================================================== */
async function loadNotes() {
  const el  = document.getElementById('notes-list');
  if (!el) return;
  if (ROLE_LEVEL[currentRole] < ROLE_LEVEL['worker']) {
    el.innerHTML = `<div class="access-denied">
      <div class="access-denied-icon">🔒</div>
      <div class="access-denied-text">Notatki widoczne tylko dla pracowników i właściciela</div>
    </div>`; return;
  }
  try {
    const snap = await getDocs(query(collection(db,'notes'), orderBy('createdAt','desc')));
    if (snap.empty) {
      el.innerHTML = '<div style="text-align:center;padding:2.5rem;font-family:var(--font-type);color:var(--dust);opacity:0.6">📌 Brak notatek.</div>';
      return;
    }
    const prioMap = {
      urgent:    { label:'🔴 PILNA',  cls:'note-urgent'    },
      important: { label:'🟡 WAŻNA',  cls:'note-important' },
      normal:    { label:'🔵 Zwykła', cls:'note-normal'    },
    };
    el.innerHTML = '';
    snap.forEach(d => {
      const n    = d.data();
      const prio = prioMap[n.priority] || prioMap.normal;
      const canDel = isOwnerLevel() || n.authorUid === currentUser.uid;
      el.innerHTML += `<div class="note-card ${prio.cls}">
        <div class="note-card-header">
          <div style="display:flex;align-items:center;gap:0.75rem;flex-wrap:wrap">
            <span class="note-priority-badge">${prio.label}</span>
            <strong class="note-title">${n.title||'—'}</strong>
          </div>
          <div style="display:flex;align-items:center;gap:0.75rem">
            <span class="note-meta">${n.authorName||'—'} · ${fmtD(n.createdAt)}</span>
            ${canDel?`<button class="btn btn-danger" style="padding:0.2rem 0.5rem;font-size:0.65rem"
              onclick="deleteNote('${d.id}')">Usuń</button>`:''}
          </div>
        </div>
        <div class="note-body">${(n.body||'').replace(/\n/g,'<br>')}</div>
      </div>`;
    });
  } catch(e) { console.error('Notes:', e); }
}

window.saveNote = async function() {
  const title    = document.getElementById('note-title').value.trim();
  const body     = document.getElementById('note-body').value.trim();
  const priority = document.getElementById('note-priority').value;
  if (!title||!body) { showToast('⚠ Wypełnij tytuł i treść'); return; }
  try {
    await addDoc(collection(db,'notes'), {
      title, body, priority,
      authorUid:  currentUser.uid,
      authorName: currentProfile?.displayName||currentUser.email,
      createdAt:  serverTimestamp()
    });
    showToast('✓ Notatka dodana'); clearNoteForm(); loadNotes();
  } catch(e) { showToast('❌ '+e.message); }
};
window.clearNoteForm = function() {
  document.getElementById('note-title').value    = '';
  document.getElementById('note-body').value     = '';
  document.getElementById('note-priority').value = 'normal';
};
window.deleteNote = async function(id) {
  if (!await showConfirm('Usunąć tę notatkę?', 'Usuń')) return;
  try { await deleteDoc(doc(db,'notes',id)); showToast('✓ Usunięto'); loadNotes(); }
  catch(e) { showToast('❌ '+e.message); }
};

/* =====================================================
   HELPERS
   ===================================================== */
function roleBadge(role) {
  return ({
    viewer: '<span class="badge badge-gray">Obserwator</span>',
    worker: '<span class="badge badge-amber">Pracownik</span>',
    deputy: '<span class="badge badge-purple">Zastępca</span>',
    owner:  '<span class="badge badge-red">Właściciel</span>',
  })[role] || '<span class="badge badge-gray">—</span>';
}

window.showToast = function(msg) {
  const c = document.getElementById('toast-container');
  const t = document.createElement('div');
  t.className='toast'; t.textContent=msg;
  c.appendChild(t); setTimeout(()=>t.remove(),3100);
};

document.addEventListener('keydown', e => {
  if (e.key==='Enter' && !document.getElementById('login-screen').classList.contains('hidden')) doLogin();
});