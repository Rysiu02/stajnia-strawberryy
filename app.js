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
let _taxNetBase    = 0;

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
  viewer:  { label: 'Obserwator', css: 'role-viewer'  },
  worker:  { label: 'Pracownik',  css: 'role-worker'  },
  deputy:  { label: 'Zastępca',   css: 'role-deputy'  },
  technik: { label: 'Technik',    css: 'role-technik' },
  owner:   { label: 'Właściciel', css: 'role-owner'   },
};
const ROLE_LEVEL = { viewer: 0, worker: 1, deputy: 2, technik: 2, owner: 2 };

/* Pozycje cennika — używane w rachunkach */
const CATALOG = [
  /* === USŁUGI === */
  { id:'trening',     name:'Trening',                  cat:'Usługi',   icon:'🐴',                  img:null,                      price:15,   unit:'szt.' },
  /* === PRODUKTY === */
  { id:'szczotka',    name:'Szczotka',                  cat:'Produkty', icon:'🪮',                  img:'img/szczotka.png',        price:7,    unit:'szt.' },
  { id:'kopystka',    name:'Kopystka',                  cat:'Produkty', icon:'🔧',                  img:'img/kopystka.png',        price:17,   unit:'szt.' },
  { id:'otrzezwiacz', name:'Otrzeźwiacz dla konia',     cat:'Produkty', icon:'💊',                  img:'img/otrzezwiacz.png',     price:31,   unit:'szt.' },
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
let editingReceiptId = null;   // ID rachunku w trybie edycji koszyka (null = nowy)
let receiptWorkers   = [];     // cache pracowników do selecta
let _currentReceiptData = null; // rachunek aktualnie otwarty w modalu
let _editLines = [];            // kopia pozycji w trybie edycji modalu

/* =====================================================
   AUTH
   ===================================================== */
/* Awaryjny timeout — gdyby Firebase w ogóle nie odpowiedział */
const _loadingTimeout = setTimeout(() => {
  if (!document.getElementById('loading-overlay').classList.contains('hidden')) {
    console.warn('Auth timeout — wymuszam ekran logowania');
    showLogin();
  }
}, 8000);

onAuthStateChanged(auth, async (user) => {
  clearTimeout(_loadingTimeout);
  try {
    if (user) {
      currentUser = user;
      await loadUserProfile(user.uid);
      showApp();
    } else {
      currentUser = currentProfile = currentRole = null;
      showLogin();
    }
  } catch(e) {
    console.error('Auth flow error:', e);
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
  return currentRole === 'owner' || currentRole === 'deputy' || currentRole === 'technik';
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
  document.getElementById('app').classList.add('hidden');
  document.getElementById('public-screen').classList.remove('hidden');


  // Reset przycisku i pól
  const btn = document.getElementById('login-btn');
  if (btn) { btn.disabled = false; btn.textContent = 'Wejdź do Stajni'; }
  const err = document.getElementById('login-error');
  if (err) err.style.display = 'none';
}

function showApp() {
  document.getElementById('loading-overlay').classList.add('hidden');
  document.getElementById('public-screen').classList.add('hidden');
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
  ['receipts-filter-month','expenses-filter-month','deposits-filter-month'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = ym;
  });
  const tw = document.getElementById('tax-filter-week');
  if (tw) tw.value = currentWeek();

  applyRoleRestrictions();
  initNumberInputs();
  loadAll();
}

/* =====================================================
   WŁASNE STRZAŁKI DLA input[type=number]
   ===================================================== */
function initNumberInputs(root) {
  const scope = root || document;
  scope.querySelectorAll('input[type=number]:not(.num-wrap-done)').forEach(inp => {
    inp.classList.add('num-wrap-done');
    const wrap = document.createElement('div');
    wrap.className = 'num-wrap';
    inp.parentNode.insertBefore(wrap, inp);
    wrap.appendChild(inp);
    const arrows = document.createElement('div');
    arrows.className = 'num-arrows';
    arrows.innerHTML =
      `<button type="button" class="num-arr-btn" tabindex="-1" aria-label="Zwiększ">▲</button>` +
      `<button type="button" class="num-arr-btn" tabindex="-1" aria-label="Zmniejsz">▼</button>`;
    wrap.appendChild(arrows);
    const [btnUp, btnDown] = arrows.querySelectorAll('.num-arr-btn');
    const step = () => parseFloat(inp.step) || 1;
    const min  = () => inp.min !== '' ? parseFloat(inp.min) : -Infinity;
    const max  = () => inp.max !== '' ? parseFloat(inp.max) :  Infinity;
    btnUp.addEventListener('click', () => {
      const v = parseFloat(inp.value) || 0;
      const nv = Math.min(max(), parseFloat((v + step()).toFixed(10)));
      inp.value = nv;
      inp.dispatchEvent(new Event('input', { bubbles: true }));
      inp.dispatchEvent(new Event('change', { bubbles: true }));
    });
    btnDown.addEventListener('click', () => {
      const v = parseFloat(inp.value) || 0;
      const nv = Math.max(min(), parseFloat((v - step()).toFixed(10)));
      inp.value = nv;
      inp.dispatchEvent(new Event('input', { bubbles: true }));
      inp.dispatchEvent(new Event('change', { bubbles: true }));
    });
  });
}

function loadAll() {
  buildMonthsNav();
  loadDashboard();
  loadReceiptsHistory();
  loadExpenses();
  loadDeposits();
  loadPayroll();
  buildCatalogTiles();
  loadAccounts();
  loadTax();
  loadNotes();
  loadInstructions();
  loadDiscordCfg();
  renderBasket();  // inicjalizuj pusty koszyk
  loadReceiptWorkers(); // lista pracowników do selecta w rachunku
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
  // onAuthStateChanged wywoła showLogin() → public-screen
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
  /* Oznacz jako przeczytane — usuń badge powiadomienia */
  if (section === 'notes' || section === 'instructions') {
    localStorage.setItem('lastSeen_' + section, Date.now().toString());
    el?.querySelectorAll('.notif-badge').forEach(b => b.remove());
  }
};

/* Wyświetla/usuwa czerwony badge powiadomienia na elemencie menu */
function updateNotifBadge(section, newestMs) {
  const navEl = document.querySelector(`.nav-item[onclick*="'${section}'"]`);
  if (!navEl) return;
  navEl.querySelectorAll('.notif-badge').forEach(b => b.remove());
  const lastSeen = parseInt(localStorage.getItem('lastSeen_' + section) || '0');
  if (newestMs > lastSeen) {
    const badge = document.createElement('span');
    badge.className = 'notif-badge';
    badge.title = 'Nowe wpisy';
    navEl.appendChild(badge);
  }
}

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

  document.querySelectorAll('.nav-item[data-hide-below]').forEach(item => {
    const min    = item.dataset.hideBelow;
    const hidden = ROLE_LEVEL[min] > lvl;
    item.style.display = hidden ? 'none' : '';
  });

  // Panel dodawania wydatków — tylko owner/deputy
  const ep = document.getElementById('add-expense-panel');
  if (ep) ep.style.display = isOwnerLevel() ? 'block' : 'none';

  // Panel wpłat do kasy — tylko owner/deputy
  const dp = document.getElementById('add-deposit-panel');
  if (dp) dp.style.display = isOwnerLevel() ? 'block' : 'none';

  // Panel dodawania instrukcji — tylko owner/deputy/technik
  const ip = document.getElementById('add-instruction-panel');
  if (ip) ip.style.display = isOwnerLevel() ? 'block' : 'none';

  // Select pracownika w formularzu rachunku — tylko owner/deputy
  const recWorkerWrap = document.getElementById('rec-as-worker-wrap');
  if (recWorkerWrap) recWorkerWrap.style.display = isOwnerLevel() ? 'block' : 'none';

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
    let allTimeTotal=0; // łączna kwota wszystkich rachunków (100%) — stajnia fizycznie trzyma całą gotówkę
    let todaySales=0;   // tylko dzisiejsze rachunki
    const workerMap = {};
    const recentRows = [];

    const week = currentWeek();
    const todayStr = new Date().toLocaleDateString('sv-SE'); // format YYYY-MM-DD
    const horseSellerMap = {}; // uid -> { name, horses }
    rSnap.forEach(d => {
      const r = d.data();
      allTimeTotal += r.total || 0; // zlicz 100% ze wszystkich rachunków
      /* Zlicz konie od początku per pracownik */
      const horseCount = (r.lines || []).filter(l => l.isHorse).reduce((s, l) => s + (l.qty || 1), 0);
      if (horseCount > 0) {
        const uid = r.workerUid || '__unknown__';
        if (!horseSellerMap[uid]) horseSellerMap[uid] = { name: r.workerName || '—', horses: 0 };
        horseSellerMap[uid].horses += horseCount;
      }
      /* Sprzedaż dziś — porównaj datę bez strefy czasowej */
      if (r.createdAt?.toDate) {
        const rDateStr = r.createdAt.toDate().toLocaleDateString('sv-SE');
        if (rDateStr === todayStr) todaySales += r.total || 0;
      }
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
    let allTimePaid=0; // łączne wypłaty ze wszystkich tygodni
    pSnap.forEach(d => {
      const p = d.data();
      allTimePaid += p.amount || 0; // zlicz wszystkie wypłaty
      const pKey = p.week || p.month;
      if (pKey !== week) return;
      if (workerMap[p.workerUid]) workerMap[p.workerUid].paid += p.amount || 0;
    });

    /* Wydatki */
    const eSnap = await getDocs(collection(db,'expenses'));
    let totalExp = 0, allTimeExp = 0;
    eSnap.forEach(d => {
      const e = d.data();
      allTimeExp += e.amount || 0; // wszystkie wydatki
      if (e.month === month) totalExp += e.amount || 0;
    });

    /* Wpłaty do kasy */
    let allTimeDeposits = 0, weekDeposits = 0;
    try {
      const dSnap = await getDocs(collection(db,'deposits'));
      dSnap.forEach(d => {
        const dep = d.data();
        allTimeDeposits += dep.amount || 0;
        const depWeek = dep.week || dateToWeek(dep.createdAt);
        if (depWeek === week) weekDeposits += dep.amount || 0;
      });
    } catch(_) { /* kolekcja jeszcze nie istnieje */ }

    /* Stan kasy stajni = 100% wpływów + wpłaty do kasy − wydatki − wypłaty */
    const treasury = allTimeTotal + allTimeDeposits - allTimeExp - allTimePaid;

    /* Najlepszy sprzedawca koni */
    const topSeller = Object.values(horseSellerMap).sort((a, b) => b.horses - a.horses)[0] || null;
    const topSellerEl = document.getElementById('stat-top-horse-seller');
    const topCountEl  = document.getElementById('stat-top-horse-count');
    if (topSellerEl) topSellerEl.textContent = topSeller ? topSeller.name : '—';
    if (topCountEl)  topCountEl.textContent  = topSeller ? topSeller.horses + ' koni sprzedanych od początku' : 'brak danych';

    document.getElementById('stat-today').textContent       = fmt(todaySales);
    document.getElementById('stat-stable').textContent      = fmt(totalStable);
    document.getElementById('stat-workers-tab').textContent = fmt(totalWorkers);
    const tEl = document.getElementById('stat-treasury');
    if (tEl) {
      tEl.textContent = fmt(treasury);
      tEl.style.color = treasury >= 0 ? 'var(--pale-gold)' : '#c94040';
    }

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

/* Buduje kafelki przy starcie */
function buildCatalogTiles() {
  renderTiles('tiles-uslugi',  CATALOG.filter(c => c.cat === 'Usługi'));
  renderTiles('tiles-produkty', CATALOG.filter(c => c.cat === 'Produkty'));
  renderHorseTiles();
}

function renderTiles(containerId, items) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = items.map(item => {
    /* Ikona — obrazek jeśli dostępny, fallback na emoji */
    const iconHtml = item.img
      ? `<img src="${item.img}" class="catalog-tile-img" alt="${item.name}" onerror="this.style.display='none';this.nextSibling.style.display='block'"/><span class="catalog-tile-emoji" style="display:none">${item.icon}</span>`
      : `<span class="catalog-tile-emoji">${item.icon}</span>`;

    return `
      <div class="catalog-tile"
        onclick="addToBasket('${item.id}')"
        title="${item.name + ' — ' + item.price + '$'}">
        <div class="catalog-tile-icon">${iconHtml}</div>
        <div class="catalog-tile-name">${item.name}</div>
        <div class="catalog-tile-price">${item.price.toLocaleString('pl-PL', {minimumFractionDigits: item.price % 1 ? 2 : 0})} $</div>
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

  // Jeśli już w koszyku — zwiększ ilość
  const existing = basket.find(b => b.id === itemId);
  if (existing) {
    existing.qty++;
  } else {
    basket.push({ id: itemId, name: item.name, icon: item.icon, img: item.img || null, price: item.price, qty: 1, isHorse: false });
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
      <div class="basket-icon">
        ${item.img
          ? `<img src="${item.img}" class="basket-item-img" alt="${item.name}"
               onerror="this.style.display='none';this.nextSibling.style.display='inline'"/>
             <span style="display:none;font-size:1.2rem">${item.icon}</span>`
          : `<span style="font-size:1.2rem">${item.icon}</span>`}
      </div>
      <span class="basket-name">${item.name}
        ${item.discountLabel ? `<span class="basket-promo-badge">${item.discountLabel}</span>` : ''}
      </span>
      <div class="basket-qty-ctrl">
        ${!item.isHorse ? `<button onclick="changeQty(${idx},-1)">−</button>` : ''}
        <span>${item.qty}</span>
        ${!item.isHorse ? `<button onclick="changeQty(${idx},1)">+</button>` : ''}
      </div>
      <div class="basket-price-wrap">
        ${item.originalPrice != null
          ? `<span class="basket-price-orig">${fmt(item.originalPrice * item.qty)}</span>
             <span class="basket-price basket-price--promo">${fmt(item.price * item.qty)}</span>`
          : `<span class="basket-price">${fmt(item.price * item.qty)}</span>`}
      </div>
      <button class="btn basket-promo-btn" title="Dodaj promocję" onclick="openPromoModal(${idx})">🏷</button>
      ${item.originalPrice != null
        ? `<button class="btn btn-ghost" style="padding:0.15rem 0.4rem;font-size:0.65rem" title="Usuń promocję" onclick="removePromo(${idx})">↩</button>`
        : ''}
      <button class="btn btn-danger" style="padding:0.15rem 0.4rem;font-size:0.7rem" onclick="removeFromBasket(${idx})">✕</button>
    </div>`).join('');
  recalcBasket();
}

window.changeQty = function(idx, delta) {
  const item = basket[idx];
  if (!item) return;
  const newQty = item.qty + delta;
  if (newQty <= 0) { basket.splice(idx, 1); renderBasket(); return; }
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

/* =====================================================
   PROMOCJE
   ===================================================== */
let _promoIdx     = null;
let _promoTab     = 'pct';

window.openPromoModal = function(idx) {
  const item = basket[idx];
  if (!item) return;
  _promoIdx = idx;
  _promoTab = 'pct';
  document.getElementById('promo-item-name').textContent = item.name;
  document.getElementById('promo-pct-input').value = '';
  document.getElementById('promo-amt-input').value = '';
  document.getElementById('promo-preview-pct').textContent = '';
  document.getElementById('promo-preview-amt').textContent = '';
  switchPromoTab('pct');
  document.getElementById('promo-modal').classList.remove('hidden');
};

window.closePromoModal = function() {
  document.getElementById('promo-modal').classList.add('hidden');
  _promoIdx = null;
};

window.switchPromoTab = function(tab) {
  _promoTab = tab;
  document.getElementById('promo-tab-pct').classList.toggle('active', tab === 'pct');
  document.getElementById('promo-tab-amt').classList.toggle('active', tab === 'amt');
  document.getElementById('promo-panel-pct').classList.toggle('hidden', tab !== 'pct');
  document.getElementById('promo-panel-amt').classList.toggle('hidden', tab !== 'amt');
  updatePromoPreview();
};

window.updatePromoPreview = function() {
  const item = basket[_promoIdx];
  if (!item) return;
  const origPrice = item.originalPrice ?? item.price;

  if (_promoTab === 'pct') {
    const pct = parseFloat(document.getElementById('promo-pct-input').value);
    const el  = document.getElementById('promo-preview-pct');
    if (!isNaN(pct) && pct > 0 && pct < 100) {
      const newPrice = origPrice * (1 - pct / 100);
      el.textContent = `Cena za szt.: ${fmt(origPrice)} → ${fmt(newPrice)} (−${pct}%)`;
      el.className = 'promo-preview promo-preview--ok';
    } else {
      el.textContent = pct >= 100 ? '⚠ Zniżka nie może wynosić 100% lub więcej' : '';
      el.className = 'promo-preview';
    }
  } else {
    const newPrice = parseFloat(document.getElementById('promo-amt-input').value);
    const el       = document.getElementById('promo-preview-amt');
    if (!isNaN(newPrice) && newPrice >= 0) {
      const saved = origPrice - newPrice;
      el.textContent = `Cena za szt.: ${fmt(origPrice)} → ${fmt(newPrice)} (−${fmt(saved)})`;
      el.className = 'promo-preview promo-preview--ok';
    } else {
      el.textContent = '';
      el.className = 'promo-preview';
    }
  }
};

window.applyPromo = function() {
  const item = basket[_promoIdx];
  if (!item) return;
  const origPrice = item.originalPrice ?? item.price;
  let newPrice;

  if (_promoTab === 'pct') {
    const pct = parseFloat(document.getElementById('promo-pct-input').value);
    if (isNaN(pct) || pct <= 0 || pct >= 100) { showToast('⚠ Podaj zniżkę od 1 do 99%'); return; }
    newPrice = origPrice * (1 - pct / 100);
    item.discountLabel = `−${pct}%`;
  } else {
    newPrice = parseFloat(document.getElementById('promo-amt-input').value);
    if (isNaN(newPrice) || newPrice < 0) { showToast('⚠ Podaj poprawną kwotę'); return; }
    item.discountLabel = `−${fmt(origPrice - newPrice)}`;
  }

  item.originalPrice = origPrice;
  item.price         = Math.round(newPrice * 100) / 100;
  closePromoModal();
  renderBasket();
  showToast(`✓ Promocja zastosowana dla: ${item.name}`);
};

window.removePromo = function(idx) {
  const item = basket[idx];
  if (!item || item.originalPrice == null) return;
  item.price         = item.originalPrice;
  item.originalPrice = undefined;
  item.discountLabel = undefined;
  renderBasket();
};

window.clearReceipt = function() {
  basket = [];
  basket = [];
  pendingHorse = null;
  document.getElementById('rec-client').value = '';
  document.getElementById('rec-note').value   = '';
  /* Reset trybu edycji */
  editingReceiptId = null;
  const banner = document.getElementById('rec-edit-banner');
  if (banner) banner.style.display = 'none';
  const saveBtn = document.getElementById('rec-save-btn');
  if (saveBtn) saveBtn.textContent = '💾 Zapisz rachunek';
  /* Reset selecta pracownika */
  const sel = document.getElementById('rec-as-worker');
  if (sel) sel.value = '';
  renderBasket();
};

window.saveReceipt = async function() {
  if (!basket.length) { showToast('⚠ Koszyk jest pusty'); return; }
  const _clientCheck = document.getElementById('rec-client').value.trim();
  if (!_clientCheck) { showToast('⚠ Podaj imię klienta'); document.getElementById('rec-client').focus(); return; }

  const lines  = basket.map(i => ({ name: i.name, icon: i.icon, price: i.price, qty: i.qty, subtotal: i.price*i.qty, isHorse: !!i.isHorse }));
  const total  = lines.reduce((s,l) => s+l.subtotal, 0);
  const half   = total / 2;
  const month  = currentMonth();
  const week   = currentWeek();
  const client = document.getElementById('rec-client').value.trim();
  const note   = document.getElementById('rec-note').value.trim();

  /* Wyznacz pracownika — owner/deputy może wybrać innego */
  let workerUid  = currentUser.uid;
  let workerName = currentProfile?.displayName || currentUser.email;
  if (isOwnerLevel()) {
    const sel = document.getElementById('rec-as-worker');
    const selUid = sel?.value;
    if (selUid) {
      const found = receiptWorkers.find(w => w.uid === selUid);
      if (found) { workerUid = found.uid; workerName = found.displayName; }
    }
  }

  try {
    if (editingReceiptId) {
      /* === TRYB EDYCJI — aktualizuj istniejący dokument === */
      await updateDoc(doc(db, 'receipts', editingReceiptId), {
        lines, total, stable: half, workerCut: half,
        client, note, month, week,
        workerUid, workerName
        /* createdAt — nie zmieniamy daty utworzenia */
      });
      showToast('✓ Rachunek zaktualizowany');
    } else {
      /* === TRYB NOWY — dodaj dokument === */
      await addDoc(collection(db,'receipts'), {
        lines, total, stable: half, workerCut: half,
        client, note, month, week,
        workerUid, workerName,
        createdAt: serverTimestamp()
      });
      showToast('✓ Rachunek zapisany');
    }

    clearReceipt();
    loadDashboard();
    _receiptsCacheMonth = null; loadReceiptsHistory();
    loadPayroll();        // odśwież wypłaty — nowy rachunek wpływa na zakładki
    buildCatalogTiles();
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
   PRACOWNICY — lista do selecta w formularzu rachunku
   ===================================================== */
async function loadReceiptWorkers() {
  if (!isOwnerLevel()) return;
  try {
    const snap = await getDocs(collection(db, 'users'));
    receiptWorkers = [];
    snap.forEach(d => {
      const u = d.data();
      receiptWorkers.push({ uid: d.id, displayName: u.displayName || u.email, role: u.role || 'viewer' });
    });
    const sel = document.getElementById('rec-as-worker');
    if (!sel) return;
    sel.innerHTML = '<option value="">— ja (domyślnie) —</option>';
    receiptWorkers
      .filter(u => u.uid !== currentUser?.uid) // pomiń siebie — już jest opcja domyślna
      .forEach(u => {
        const opt = document.createElement('option');
        opt.value = u.uid;
        opt.textContent = u.displayName + (ROLES[u.role] ? ' · ' + ROLES[u.role].label : '');
        sel.appendChild(opt);
      });
  } catch(e) { console.warn('loadReceiptWorkers:', e); }
}

/* =====================================================
   RACHUNKI — historia (filtrowanie w JS, bez indeksu)
   ===================================================== */
let _receiptsCache = [];    // cache rachunków dla bieżącego miesiąca
let _receiptsCacheMonth = null;

function renderReceiptsTable(rows) {
  const tbody = document.getElementById('receipts-history-body');
  if (!tbody) return;
  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="9" class="muted" style="text-align:center;padding:1.5rem">Brak rachunków</td></tr>';
    return;
  }
  tbody.innerHTML = rows.map(r => `
    <tr onclick="openReceiptModal(${JSON.stringify(r).replace(/"/g,'&quot;')})">
      <td class="muted">${fmtD(r.createdAt)}</td>
      <td>${r.client||'—'}</td>
      <td>${r.workerName||'—'}</td>
      <td style="font-size:0.75rem;color:var(--dust)">${(r.lines||[]).map(l=>`${l.name} ×${l.qty}`).join(', ')}</td>
      <td style="font-size:0.75rem;color:var(--dust);font-style:italic">${r.note||'—'}</td>
      <td><strong style="color:var(--pale-gold)">${fmt(r.total)}</strong></td>
      <td style="color:var(--amber)">${fmt(r.stable)}</td>
      <td style="color:#6abf7e">${fmt(r.workerCut)}</td>
      <td onclick="event.stopPropagation()">${isOwnerLevel() ? `<button class="btn btn-danger" style="padding:0.2rem 0.4rem;font-size:0.65rem"
        onclick="deleteReceipt('${r._id}')">Usuń</button>` : ''}</td>
    </tr>`).join('');
}

window.filterReceiptsClient = function() {
  const search = (document.getElementById('receipts-search-client')?.value || '').trim().toLowerCase();
  if (!search) { renderReceiptsTable(_receiptsCache); return; }
  renderReceiptsTable(_receiptsCache.filter(r => (r.client||'').toLowerCase().includes(search)));
};

function buildMonthsNav() {
  const el = document.getElementById('receipts-months-nav');
  if (!el) return;
  const now = new Date();
  const active = document.getElementById('receipts-filter-month')?.value || currentMonth();
  const start = new Date(2026, 3, 1); // kwiecień 2026
  const months = [];
  let d = new Date(now.getFullYear(), now.getMonth(), 1);
  while (d >= start) {
    const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleDateString('pl-PL', { month: 'long', year: 'numeric' });
    months.push({ val, label });
    d = new Date(d.getFullYear(), d.getMonth() - 1, 1);
  }
  months.reverse();
  el.innerHTML = months.map(m => `
    <button class="rmn-btn ${m.val === active ? 'active' : ''}" data-month="${m.val}"
      onclick="selectReceiptMonth('${m.val}')">
      ${m.label}
    </button>`).join('');
}

window.selectReceiptMonth = function(month) {
  const inp = document.getElementById('receipts-filter-month');
  if (inp) inp.value = month;
  loadReceiptsHistory();
};

window.loadReceiptsHistory = async function() {
  const month = document.getElementById('receipts-filter-month')?.value || currentMonth();

  /* Podświetl aktywny miesiąc w nawigacji */
  document.querySelectorAll('.rmn-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.month === month);
  });

  const tbody = document.getElementById('receipts-history-body');
  if (!tbody) return;

  /* Pobierz z bazy tylko gdy zmienił się miesiąc */
  if (month !== _receiptsCacheMonth) {
    tbody.innerHTML = '<tr><td colspan="9" class="muted" style="text-align:center;padding:1rem">Ładowanie...</td></tr>';
    try {
      const snap = await getDocs(collection(db,'receipts'));
      let rows = [];
      snap.forEach(d => {
        const r = d.data();
        if (r.month !== month) return;
        if (currentRole === 'worker' && r.workerUid !== currentUser.uid) return;
        rows.push({ ...r, _id: d.id });
      });
      rows.sort((a,b) => (b.createdAt?.seconds||0)-(a.createdAt?.seconds||0));
      _receiptsCache = rows;
      _receiptsCacheMonth = month;
    } catch(e) { console.error('Receipts history:', e); showToast('❌ Błąd ładowania rachunków'); return; }
  }

  /* Zastosuj aktywny filtr klienta */
  const search = (document.getElementById('receipts-search-client')?.value || '').trim().toLowerCase();
  const filtered = search ? _receiptsCache.filter(r => (r.client||'').toLowerCase().includes(search)) : _receiptsCache;
  renderReceiptsTable(filtered);
};

/* =====================================================
   MODAL PARAGONU
   ===================================================== */
const CATALOG_ICONS = Object.fromEntries(CATALOG.map(c => [c.id, c.icon]));

window.openReceiptModal = function(r) {
  _currentReceiptData = r;

  /* meta */
  document.getElementById('par-date').textContent   = fmtD(r.createdAt) || '—';
  document.getElementById('par-client').textContent = r.client  || '— brak —';
  document.getElementById('par-worker').textContent = r.workerName || '—';

  const noteRow = document.getElementById('par-note-row');
  const noteEl  = document.getElementById('par-note');
  if (r.note) {
    noteEl.textContent = r.note;
    noteRow.style.display = '';
  } else {
    noteRow.style.display = 'none';
  }

  /* pozycje */
  const linesEl = document.getElementById('par-lines');
  linesEl.innerHTML = (r.lines || []).map(l => {
    const icon = CATALOG_ICONS[l.id] || '🐴';
    const sub  = (l.subtotal != null) ? fmt(l.subtotal) : fmt((l.price||0) * (l.qty||1));
    const price = l.price != null ? fmt(l.price) : '—';
    return `<div class="paragon-line">
      <div class="paragon-line-name"><span class="paragon-line-icon">${icon}</span>${l.name||'—'}</div>
      <div class="paragon-line-qty">×${l.qty||1}</div>
      <div class="paragon-line-price">${price}</div>
      <div class="paragon-line-sub">${sub}</div>
    </div>`;
  }).join('');

  /* sumy */
  document.getElementById('par-total').textContent      = fmt(r.total);
  document.getElementById('par-stable').textContent     = fmt(r.stable);
  document.getElementById('par-worker-cut').textContent = fmt(r.workerCut);

  /* ID */
  document.getElementById('par-id').textContent = 'ID: ' + (r._id || '—');

  /* przycisk usuń i edytuj tylko dla owner/deputy */
  const actEl = document.getElementById('par-actions');
  if (isOwnerLevel()) {
    actEl.innerHTML =
      `<button class="btn btn-primary" style="padding:0.35rem 0.9rem;font-size:0.8rem"
         onclick="openEditReceiptForm()">✏️ Edytuj rachunek</button>
       <button class="btn btn-danger" onclick="deleteReceipt('${r._id}');closeReceiptModal()">🗑 Usuń rachunek</button>`;
  } else {
    actEl.innerHTML = '';
  }

  /* Pokaż tryb podglądu (na wypadek powrotu z edycji) */
  document.getElementById('par-view-content').style.display = '';
  document.getElementById('par-edit-panel').style.display   = 'none';

  document.getElementById('receipt-modal').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
};

window.closeReceiptModal = function(e) {
  if (e && e.target !== document.getElementById('receipt-modal')) return;
  document.getElementById('receipt-modal').classList.add('hidden');
  document.body.style.overflow = '';
};

/* =====================================================
   EDYCJA RACHUNKU W MODALU (owner / deputy)
   ===================================================== */
window.openEditReceiptForm = function() {
  const r = _currentReceiptData;
  if (!r) return;

  /* Kopia pozycji do edycji */
  _editLines = (r.lines || []).map(l => ({
    id:      l.id   || null,
    name:    l.name || '—',
    icon:    l.icon || (CATALOG_ICONS[l.id] || '🐴'),
    price:   parseFloat(l.price)   || 0,
    qty:     parseInt(l.qty, 10)   || 1,
    isHorse: !!l.isHorse,
  }));

  /* Wypełnij pola meta */
  document.getElementById('par-edit-client').value = r.client || '';
  document.getElementById('par-edit-note').value   = r.note   || '';

  /* Wypełnij select kasjeraf */
  const sel = document.getElementById('par-edit-worker');
  sel.innerHTML = '';
  receiptWorkers.forEach(u => {
    const opt = document.createElement('option');
    opt.value = u.uid;
    opt.textContent = u.displayName + (ROLES[u.role] ? ' · ' + ROLES[u.role].label : '');
    sel.appendChild(opt);
  });
  if (r.workerUid && !receiptWorkers.find(u => u.uid === r.workerUid)) {
    const opt = document.createElement('option');
    opt.value = r.workerUid;
    opt.textContent = r.workerName || r.workerUid;
    sel.insertBefore(opt, sel.firstChild);
  }
  sel.value = r.workerUid || (receiptWorkers[0]?.uid || '');

  /* Kafelki cennika */
  const tilesEl = document.getElementById('par-edit-add-tiles');
  if (tilesEl) {
    tilesEl.innerHTML = CATALOG.map(c =>
      `<button class="par-edit-tile" onclick="parEditAddFromCatalog('${c.id}')">
         ${c.icon} ${c.name} <span class="pet-price">${c.price} $</span>
       </button>`
    ).join('');
  }

  renderParEditLines();

  /* Przełącz panele */
  document.getElementById('par-view-content').style.display = 'none';
  document.getElementById('par-edit-panel').style.display   = '';
};

function renderParEditLines() {
  const el = document.getElementById('par-edit-lines');
  if (!_editLines.length) {
    el.innerHTML = '<div style="font-family:var(--font-type);color:var(--dust);font-size:0.78rem;padding:0.5rem 0;opacity:0.7">Brak pozycji — dodaj z cennika poniżej</div>';
    parEditRecalc();
    return;
  }
  el.innerHTML = _editLines.map((l, idx) => `
    <div class="par-edit-row">
      <div class="par-edit-row-top">
        <span class="par-edit-row-name">${l.icon} ${l.name}</span>
        <button class="par-edit-remove" onclick="parEditRemoveLine(${idx})" title="Usuń pozycję">✕</button>
      </div>
      <div class="par-edit-row-bottom">
        <span class="par-edit-row-label">Ilość</span>
        <div class="basket-qty-ctrl" style="flex-shrink:0">
          <button onclick="parEditQty(${idx},-1)">−</button>
          <span>${l.qty}</span>
          <button onclick="parEditQty(${idx},1)">+</button>
        </div>
        <span class="par-edit-row-label" style="margin-left:0.25rem">Cena/szt.</span>
        <input type="number" step="0.01" min="0"
          value="${l.price}"
          class="par-edit-price-input"
          oninput="parEditPriceChange(${idx},this.value)"/>
        <span class="par-edit-row-sub" id="par-edit-sub-${idx}">${fmt(l.price * l.qty)}</span>
      </div>
    </div>`).join('');
  initNumberInputs(el);
  parEditRecalc();
}

window.parEditAddFromCatalog = function(catalogId) {
  const cat = CATALOG.find(c => c.id === catalogId);
  if (!cat) return;
  const existing = _editLines.find(l => l.id === catalogId);
  if (existing) {
    existing.qty++;
  } else {
    _editLines.push({ id: cat.id, name: cat.name, icon: cat.icon, price: cat.price, qty: 1, isHorse: false });
  }
  renderParEditLines();
};

window.parEditQty = function(idx, delta) {
  if (!_editLines[idx]) return;
  const newQty = _editLines[idx].qty + delta;
  if (newQty <= 0) { _editLines.splice(idx, 1); }
  else { _editLines[idx].qty = newQty; }
  renderParEditLines();
};

window.parEditPriceChange = function(idx, val) {
  if (!_editLines[idx]) return;
  const p = parseFloat(val);
  _editLines[idx].price = isNaN(p) ? 0 : p;
  const sub = document.getElementById('par-edit-sub-' + idx);
  if (sub) sub.textContent = fmt(_editLines[idx].price * _editLines[idx].qty);
  parEditRecalc();
};

window.parEditRemoveLine = function(idx) {
  _editLines.splice(idx, 1);
  renderParEditLines();
};

function parEditRecalc() {
  const total = _editLines.reduce((s, l) => s + l.price * l.qty, 0);
  const half  = total / 2;
  document.getElementById('par-edit-total').textContent      = fmt(total);
  document.getElementById('par-edit-stable').textContent     = fmt(half);
  document.getElementById('par-edit-worker-cut').textContent = fmt(half);
}

window.saveReceiptEdits = async function() {
  const r = _currentReceiptData;
  if (!r?._id) { showToast('⚠ Brak ID rachunku'); return; }
  if (!_editLines.length) { showToast('⚠ Rachunek musi mieć co najmniej jedną pozycję'); return; }

  const lines = _editLines.map(l => ({
    id: l.id, name: l.name, icon: l.icon,
    price: Math.round(l.price * 100) / 100,
    qty: l.qty,
    subtotal: Math.round(l.price * l.qty * 100) / 100,
    isHorse: !!l.isHorse,
  }));
  const total = lines.reduce((s, l) => s + l.subtotal, 0);
  const half  = total / 2;

  /* Kasjer */
  const sel = document.getElementById('par-edit-worker');
  const workerUid  = sel.value || r.workerUid;
  const workerEntry = receiptWorkers.find(u => u.uid === workerUid);
  const workerName  = workerEntry?.displayName || r.workerName;

  const client = document.getElementById('par-edit-client').value.trim();
  if (!client) { showToast('⚠ Podaj imię klienta'); document.getElementById('par-edit-client').focus(); return; }
  const note   = document.getElementById('par-edit-note').value.trim();

  try {
    await updateDoc(doc(db, 'receipts', r._id), {
      lines, total,
      stable: Math.round(half * 100) / 100,
      workerCut: Math.round(half * 100) / 100,
      client, note,
      workerUid, workerName,
    });
    showToast('✓ Rachunek zaktualizowany');
    closeReceiptModal();
    _receiptsCacheMonth = null; loadReceiptsHistory();
    loadDashboard();
    loadPayroll();
  } catch(e) {
    console.error('saveReceiptEdits:', e);
    showToast('❌ ' + e.message);
  }
};

window.cancelReceiptEdit = function() {
  document.getElementById('par-view-content').style.display = '';
  document.getElementById('par-edit-panel').style.display   = 'none';
};

window.deleteReceipt = async function(id) {
  if (!await showConfirm('Usunąć ten rachunek?', 'Usuń')) return;
  try {
    await deleteDoc(doc(db,'receipts',id));
    showToast('✓ Rachunek usunięty');
    _receiptsCacheMonth = null; loadReceiptsHistory(); loadDashboard();
  } catch(e) { showToast('❌ ' + e.message); }
};

/* =====================================================
   WPŁATY DO KASY
   ===================================================== */
window.loadDeposits = async function() {
  const month = document.getElementById('deposits-filter-month')?.value || currentMonth();
  const tbody = document.getElementById('deposits-body');
  if (!tbody) return;
  try {
    const snap = await getDocs(collection(db,'deposits'));
    let rows = [];
    snap.forEach(d => {
      const dep = d.data();
      if (dep.month === month) rows.push({ ...dep, _id: d.id });
    });
    rows.sort((a,b) => (b.createdAt?.seconds||0)-(a.createdAt?.seconds||0));

    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="5" class="muted" style="text-align:center;padding:1.5rem">Brak wpłat w tym miesiącu</td></tr>';
      return;
    }
    tbody.innerHTML = rows.map(dep => `
      <tr>
        <td class="muted">${fmtD(dep.createdAt)}</td>
        <td>${dep.who||'—'}</td>
        <td>${dep.description||'—'}</td>
        <td><strong style="color:#6abf7e">${fmt(dep.amount)}</strong></td>
        <td>${isOwnerLevel() ? `<button class="btn btn-danger" style="padding:0.2rem 0.4rem;font-size:0.65rem"
          onclick="deleteDeposit('${dep._id}')">Usuń</button>` : ''}</td>
      </tr>`).join('');
  } catch(e) { console.error('Deposits:', e); }
};

window.saveDeposit = async function() {
  const who    = document.getElementById('dep-who').value.trim();
  const amount = parseFloat(document.getElementById('dep-amount').value);
  const desc   = document.getElementById('dep-desc').value.trim();
  const month  = currentMonth();
  const week   = currentWeek();
  if (!who || !amount || !desc) { showToast('⚠ Wypełnij wszystkie pola'); return; }
  if (amount <= 0) { showToast('⚠ Kwota musi być większa od 0'); return; }
  try {
    await addDoc(collection(db,'deposits'), {
      who, amount, description: desc, month, week,
      createdBy: currentUser.uid,
      createdByName: currentProfile?.displayName || currentUser.email,
      createdAt: serverTimestamp()
    });
    showToast('✓ Wpłata zapisana');
    document.getElementById('dep-who').value    = '';
    document.getElementById('dep-amount').value = '';
    document.getElementById('dep-desc').value   = '';
    loadDeposits(); loadDashboard(); loadTax();
  } catch(e) { showToast('❌ ' + e.message); }
};

window.deleteDeposit = async function(id) {
  if (!await showConfirm('Usunąć wpłatę?', 'Usuń')) return;
  try {
    await deleteDoc(doc(db,'deposits',id));
    showToast('✓ Usunięto'); loadDeposits(); loadDashboard(); loadTax();
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

      const unpaid = workers.filter(([,w]) => Math.max(0, w.workerCut - w.paid) > 0);
      const paid   = workers.filter(([,w]) => Math.max(0, w.workerCut - w.paid) <= 0);

      const renderRows = (list, isPaid) => list.map(([uid,w]) => {
        const rem = Math.max(0, w.workerCut - w.paid);
        const safeName = w.name.replace(/'/g,"\\'");
        return `<tr style="cursor:pointer" onclick="openWorkerModal('${uid}','${safeName}')">
          <td><span style="color:var(--amber);margin-right:0.3rem">→</span>${w.name}</td>
          <td style="color:#6abf7e">${fmt(w.workerCut)}</td>
          <td class="muted">${fmt(w.paid)}</td>
          <td><strong style="color:${isPaid?'#6abf7e':'var(--pale-gold)'}">${fmt(rem)}</strong></td>
          <td>${isPaid
            ? '<span class="badge badge-green">✓ Rozliczone</span>'
            : '<span class="badge badge-red">Zaległe</span>'}
          </td>
        </tr>`;
      }).join('');

      const tableHtml = (rows) => `
        <table class="western-table">
          <thead><tr><th>Pracownik</th><th>Zakładka (50%)</th><th>Wypłacono</th><th>Do wypłaty</th><th>Status</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>`;

      return `
        <div class="panel">
          <div class="panel-header">
            <div class="panel-title">💰 ${label}</div>
            <span style="font-family:var(--font-type);font-size:0.85rem;color:var(--dust)">
              Do wypłaty: <strong style="color:${totalRem>0?'var(--pale-gold)':'#6abf7e'};font-size:0.95rem">${fmt(totalRem)}</strong>
            </span>
          </div>
          <div class="panel-body" style="padding:0">
            ${unpaid.length ? `
              <div class="payroll-section-label payroll-section-unpaid">⚠ Zaległe (${unpaid.length})</div>
              ${tableHtml(renderRows(unpaid, false))}` : ''}
            ${paid.length ? `
              <div class="payroll-section-label payroll-section-paid">✓ Rozliczone (${paid.length})</div>
              ${tableHtml(renderRows(paid, true))}` : ''}
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
      paidByName: currentProfile?.displayName || currentUser.email,
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
   MODAL PRACOWNIKA — historia, tygodnie, wypłaty
   ===================================================== */
let _wmUid  = null;
let _wmName = null;

window.openWorkerModal = async function(uid, name) {
  _wmUid  = uid;
  _wmName = name;

  document.getElementById('wm-name').textContent = name;
  document.getElementById('wm-sub').textContent  = 'Ładowanie danych...';

  /* Aktywuj pierwszą zakładkę */
  wmSwitchTab('weeks');
  document.getElementById('worker-modal').classList.remove('hidden');
  document.body.style.overflow = 'hidden';

  /* Pobierz dane równolegle */
  try {
    const [rSnap, pSnap] = await Promise.all([
      getDocs(collection(db,'receipts')),
      getDocs(collection(db,'payouts'))
    ]);

    const allReceipts = [];
    rSnap.forEach(d => { const r = d.data(); if (r.workerUid === uid) allReceipts.push({ ...r, _id: d.id }); });
    allReceipts.sort((a,b) => (b.createdAt?.seconds||0) - (a.createdAt?.seconds||0));

    const allPayouts = [];
    pSnap.forEach(d => { const p = d.data(); if (p.workerUid === uid) allPayouts.push({ ...p, _id: d.id }); });
    allPayouts.sort((a,b) => (b.createdAt?.seconds||0) - (a.createdAt?.seconds||0));

    /* --- Sumy globalne --- */
    const totalEarned = allReceipts.reduce((s,r) => s + (r.workerCut||0), 0);
    const totalPaid   = allPayouts.reduce((s,p)  => s + (p.amount||0),   0);
    const totalDue    = Math.max(0, totalEarned - totalPaid);
    document.getElementById('wm-sub').textContent =
      `Zarobione: ${fmt(totalEarned)} · Wypłacono: ${fmt(totalPaid)} · Do wypłaty: ${fmt(totalDue)}`;

    /* ---- ZAKŁADKA: Rachunki ---- */
    const rTbody = document.getElementById('wm-receipts-body');
    if (!allReceipts.length) {
      rTbody.innerHTML = '<tr><td colspan="6" class="muted" style="text-align:center;padding:1.5rem">Brak rachunków</td></tr>';
    } else {
      rTbody.innerHTML = allReceipts.map(r => `
        <tr onclick="openReceiptModal(${JSON.stringify(r).replace(/"/g,'&quot;')})">
          <td class="muted">${fmtD(r.createdAt)}</td>
          <td>${r.client||'—'}</td>
          <td style="font-size:0.75rem;color:var(--dust)">${(r.lines||[]).map(l=>`${l.name}×${l.qty}`).join(', ')}</td>
          <td style="font-size:0.75rem;color:var(--dust);font-style:italic">${r.note||'—'}</td>
          <td><strong style="color:var(--pale-gold)">${fmt(r.total)}</strong></td>
          <td style="color:#6abf7e">${fmt(r.workerCut)}</td>
        </tr>`).join('');
    }

    /* ---- ZAKŁADKA: Wypłaty ---- */
    const pTbody = document.getElementById('wm-payouts-body');
    if (!allPayouts.length) {
      pTbody.innerHTML = '<tr><td colspan="4" class="muted" style="text-align:center;padding:1.5rem">Brak wypłat</td></tr>';
    } else {
      pTbody.innerHTML = allPayouts.map(p => `
        <tr>
          <td class="muted">${fmtD(p.createdAt)}</td>
          <td style="font-family:var(--font-type);font-size:0.75rem;color:var(--dust)">${weekLabel(p.week||p.month)}</td>
          <td><strong style="color:#6abf7e">${fmt(p.amount)}</strong></td>
          <td class="muted" style="font-size:0.78rem">${p.paidByName||'—'}</td>
        </tr>`).join('');
    }

    /* ---- ZAKŁADKA: Tygodnie ---- */
    /* Zbuduj mapę tygodniową */
    const weekMap = {};
    allReceipts.forEach(r => {
      const wk = r.week || dateToWeek(r.createdAt) || '—';
      if (!weekMap[wk]) weekMap[wk] = { earned: 0, paid: 0 };
      weekMap[wk].earned += r.workerCut || 0;
    });
    allPayouts.forEach(p => {
      const wk = p.week || p.month || '—';
      if (!weekMap[wk]) weekMap[wk] = { earned: 0, paid: 0 };
      weekMap[wk].paid += p.amount || 0;
    });

    const weeks = Object.keys(weekMap).sort().reverse();
    const weeksBody = document.getElementById('wm-weeks-body');
    weeksBody.innerHTML = weeks.map(wk => {
      const w   = weekMap[wk];
      const due = Math.max(0, w.earned - w.paid);
      const statusBadge = due <= 0
        ? '<span class="badge badge-green">✓ Rozliczone</span>'
        : `<button class="btn btn-primary" style="padding:0.25rem 0.7rem;font-size:0.68rem"
            onclick="wmPayWeek('${wk}',${due})">Wypłać ${fmt(due)}</button>`;
      return `
        <div class="wm-week-block">
          <div class="wm-week-header">
            <div class="wm-week-label">${weekLabel(wk)}</div>
            <div class="wm-week-stats">
              <div class="wm-week-stat">Zakładka: <span>${fmt(w.earned)}</span></div>
              <div class="wm-week-stat paid">Wypłacono: <span>${fmt(w.paid)}</span></div>
              <div class="wm-week-stat due">Do wypłaty: <span>${fmt(due)}</span></div>
            </div>
            <div>${statusBadge}</div>
          </div>
        </div>`;
    }).join('');

    /* Przycisk "Wypłać wszystko" */
    const payAllWrap = document.getElementById('wm-pay-all-wrap');
    if (totalDue > 0) {
      payAllWrap.innerHTML = `
        <div class="wm-pay-all-info">
          Łączne zaległości: <strong>${fmt(totalDue)}</strong>
        </div>
        <button class="btn btn-primary" onclick="wmPayAll(${totalDue})">
          💰 Wypłać wszystko (${fmt(totalDue)})
        </button>`;
    } else {
      payAllWrap.innerHTML = `
        <div class="wm-pay-all-info">
          Wszystkie tygodnie <strong style="color:#6abf7e">rozliczone ✓</strong>
        </div>`;
    }

  } catch(e) {
    console.error('openWorkerModal:', e);
    document.getElementById('wm-sub').textContent = '❌ Błąd ładowania danych';
  }
};

window.wmSwitchTab = function(tab) {
  ['weeks','receipts','payouts'].forEach(t => {
    document.getElementById('wm-tab-' + t).classList.toggle('active', t === tab);
    document.getElementById('wm-panel-' + t).classList.toggle('hidden', t !== tab);
  });
};

window.closeWorkerModal = function(e) {
  if (e && e.target !== document.getElementById('worker-modal')) return;
  document.getElementById('worker-modal').classList.add('hidden');
  document.body.style.overflow = '';
};

window.wmPayWeek = async function(weekKey, amount) {
  if (!await showConfirm(
    `Wypłacić ${fmt(amount)} dla ${_wmName}?\n${weekLabel(weekKey)}`,
    'Wypłać', false
  )) return;
  try {
    await addDoc(collection(db,'payouts'), {
      workerUid:  _wmUid,
      workerName: _wmName,
      paidByName: currentProfile?.displayName || currentUser.email,
      week:       weekKey,
      month:      weekKey.slice(0,7),
      amount,
      paidBy:    currentUser.uid,
      createdAt: serverTimestamp()
    });
    showToast(`✓ Wypłacono ${fmt(amount)} dla ${_wmName}`);
    loadPayroll(); loadDashboard();
    openWorkerModal(_wmUid, _wmName); // odśwież modal
  } catch(e) { showToast('❌ ' + e.message); }
};

window.wmPayAll = async function(totalDue) {
  if (!await showConfirm(
    `Wypłacić łącznie ${fmt(totalDue)} dla ${_wmName}?\nZostaną dodane wypłaty za wszystkie zaległe tygodnie.`,
    'Wypłać wszystko', false
  )) return;
  try {
    /* Pobierz aktualne dane żeby wyliczyć zaległości per tydzień */
    const [rSnap, pSnap] = await Promise.all([
      getDocs(collection(db,'receipts')),
      getDocs(collection(db,'payouts'))
    ]);
    const weekMap = {};
    rSnap.forEach(d => {
      const r = d.data(); if (r.workerUid !== _wmUid) return;
      const wk = r.week || dateToWeek(r.createdAt) || '—';
      if (!weekMap[wk]) weekMap[wk] = { earned: 0, paid: 0 };
      weekMap[wk].earned += r.workerCut || 0;
    });
    pSnap.forEach(d => {
      const p = d.data(); if (p.workerUid !== _wmUid) return;
      const wk = p.week || p.month || '—';
      if (!weekMap[wk]) weekMap[wk] = { earned: 0, paid: 0 };
      weekMap[wk].paid += p.amount || 0;
    });

    const promises = [];
    for (const [wk, w] of Object.entries(weekMap)) {
      const due = Math.max(0, w.earned - w.paid);
      if (due <= 0) continue;
      promises.push(addDoc(collection(db,'payouts'), {
        workerUid:  _wmUid,
        workerName: _wmName,
        paidByName: currentProfile?.displayName || currentUser.email,
        week:       wk,
        month:      wk.slice(0,7),
        amount:     due,
        paidBy:     currentUser.uid,
        createdAt:  serverTimestamp()
      }));
    }
    await Promise.all(promises);
    showToast(`✓ Wypłacono ${fmt(totalDue)} dla ${_wmName} (${promises.length} tygodni)`);
    loadPayroll(); loadDashboard();
    openWorkerModal(_wmUid, _wmName); // odśwież modal
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

    /* Wpłaty do kasy w tym tygodniu — dodajemy do przychodu */
    try {
      const depSnap = await getDocs(collection(db,'deposits'));
      depSnap.forEach(d => {
        const dep     = d.data();
        const depWeek = dep.week || dateToWeek(dep.createdAt);
        if (depWeek === selWeek) income += dep.amount || 0;
      });
    } catch(_) { /* kolekcja jeszcze nie istnieje */ }

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

    _taxNetBase = net;
    document.getElementById('tax-income').textContent       = fmt(income);
    document.getElementById('tax-exp').textContent          = fmt(expenses);
    document.getElementById('tax-net').textContent          = fmt(net - taxAmt);
    document.getElementById('tax-rate-display').textContent = rate + '%  (' + fmt(taxAmt) + ')';
    const ri = document.getElementById('tax-rate-input');
    if (ri) ri.value = (rate != null) ? rate : '';
  } catch(e) { console.error('Tax:', e); }
};

window.recalcTaxDisplay = function() {
  const rate   = parseFloat(document.getElementById('tax-rate-input')?.value) || 0;
  const taxAmt = _taxNetBase * (rate / 100);
  document.getElementById('tax-net').textContent          = fmt(_taxNetBase - taxAmt);
  document.getElementById('tax-rate-display').textContent = rate + '%  (' + fmt(taxAmt) + ')';
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
            <option value="viewer"  ${u.role==='viewer'  ?'selected':''}>Obserwator</option>
            <option value="worker"  ${u.role==='worker'  ?'selected':''}>Pracownik</option>
            <option value="deputy"  ${u.role==='deputy'  ?'selected':''}>Zastępca</option>
            <option value="technik" ${u.role==='technik' ?'selected':''}>Technik</option>
            <option value="owner"   ${u.role==='owner'   ?'selected':''}>Właściciel</option>
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
   INSTRUKCJE
   ===================================================== */
let _instrCache = [];   // lokalny cache do filtrowania
let _instrFilter = '';  // aktywna kategoria filtru

async function loadInstructions() {
  const el = document.getElementById('instructions-list');
  if (!el) return;
  if (ROLE_LEVEL[currentRole] < ROLE_LEVEL['worker']) {
    el.innerHTML = `<div class="access-denied">
      <div class="access-denied-icon">🔒</div>
      <div class="access-denied-text">Instrukcje widoczne tylko dla pracowników i kierownictwa</div>
    </div>`; return;
  }
  try {
    const snap = await getDocs(query(collection(db,'instructions'), orderBy('createdAt','desc')));
    _instrCache = [];
    let newestInstrMs = 0;
    snap.forEach(d => {
      const data = d.data();
      _instrCache.push({ _id: d.id, ...data });
      const ts = data.createdAt?.seconds ? data.createdAt.seconds * 1000 : 0;
      if (ts > newestInstrMs) newestInstrMs = ts;
    });
    renderInstructions(_instrCache);
    updateNotifBadge('instructions', newestInstrMs);
  } catch(e) { console.error('Instructions:', e); }
}

function renderInstructions(list) {
  const el = document.getElementById('instructions-list');
  if (!el) return;
  const filtered = _instrFilter ? list.filter(i => i.category === _instrFilter) : list;
  if (!filtered.length) {
    el.innerHTML = '<div style="text-align:center;padding:2.5rem;font-family:var(--font-type);color:var(--dust);opacity:0.6">📖 Brak instrukcji.</div>';
    return;
  }
  const catLabels = {
    ogolna:          'Ogólna',
    bezpieczenstwo:  'Bezpieczeństwo',
    procedura:       'Procedura',
    obowiazki:       'Obowiązki',
    inne:            'Inne',
  };
  el.innerHTML = '';
  filtered.forEach(n => {
    const cat     = n.category || 'ogolna';
    const catLbl  = catLabels[cat] || cat;
    const canDel  = isOwnerLevel();
    el.innerHTML += `<div class="instr-card instr-${cat}">
      <div class="instr-card-header">
        <div style="display:flex;align-items:center;gap:0.75rem;flex-wrap:wrap">
          <span class="instr-cat-badge">${catLbl}</span>
          <strong class="instr-title">${n.title||'—'}</strong>
        </div>
        <div style="display:flex;align-items:center;gap:0.75rem;flex-shrink:0">
          <span class="instr-meta">${n.authorName||'—'} · ${fmtD(n.createdAt)}</span>
          ${isOwnerLevel() ? `<button class="btn btn-ghost" style="padding:0.2rem 0.5rem;font-size:0.65rem" title="Wyślij na Discord"
            onclick="syncInstrToDiscord('${n._id}')">🔔 Discord</button>` : ''}
          ${canDel ? `<button class="btn btn-danger" style="padding:0.2rem 0.5rem;font-size:0.65rem"
            onclick="deleteInstruction('${n._id}')">Usuń</button>` : ''}
        </div>
      </div>
      <div class="instr-body">${(n.body||'').replace(/\n/g,'<br>')}</div>
    </div>`;
  });
}

window.filterInstructions = function(btn, cat) {
  _instrFilter = cat;
  document.querySelectorAll('.instr-filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderInstructions(_instrCache);
};

window.saveInstruction = async function() {
  const title    = document.getElementById('instr-title').value.trim();
  const body     = document.getElementById('instr-body').value.trim();
  const category = document.getElementById('instr-category').value;
  if (!title || !body) { showToast('⚠ Wypełnij tytuł i treść'); return; }
  try {
    const instrPayload = {
      title, body, category,
      authorUid:  currentUser.uid,
      authorName: currentProfile?.displayName || currentUser.email,
      createdAt:  serverTimestamp()
    };
    await addDoc(collection(db,'instructions'), instrPayload);
    localStorage.setItem('lastSeen_instructions', Date.now().toString());
    showToast('✓ Instrukcja opublikowana');
    clearInstructionForm();
    loadInstructions();
    if (_discordCfg.instructionsUrl) sendToDiscord(_discordCfg.instructionsUrl, buildInstrEmbed({ ...instrPayload, createdAt: null }));
  } catch(e) { showToast('❌ ' + e.message); }
};

window.clearInstructionForm = function() {
  document.getElementById('instr-title').value    = '';
  document.getElementById('instr-body').value     = '';
  document.getElementById('instr-category').value = 'ogolna';
};

window.deleteInstruction = async function(id) {
  if (!await showConfirm('Usunąć tę instrukcję?', 'Usuń')) return;
  try {
    await deleteDoc(doc(db,'instructions', id));
    showToast('✓ Usunięto');
    loadInstructions();
  } catch(e) { showToast('❌ ' + e.message); }
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
      updateNotifBadge('notes', 0);
      return;
    }
    const prioMap = {
      urgent:    { label:'🔴 PILNA',  cls:'note-urgent'    },
      important: { label:'🟡 WAŻNA',  cls:'note-important' },
      normal:    { label:'🔵 Zwykła', cls:'note-normal'    },
    };
    el.innerHTML = '';
    let newestNoteMs = 0;
    snap.forEach(d => {
      const n    = d.data();
      const ts = n.createdAt?.seconds ? n.createdAt.seconds * 1000 : 0;
      if (ts > newestNoteMs) newestNoteMs = ts;
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
            ${isOwnerLevel()?`<button class="btn btn-ghost" style="padding:0.2rem 0.5rem;font-size:0.65rem" title="Wyślij na Discord"
              onclick="syncNoteToDiscord('${d.id}')">🔔 Discord</button>`:''}
            ${canDel?`<button class="btn btn-danger" style="padding:0.2rem 0.5rem;font-size:0.65rem"
              onclick="deleteNote('${d.id}')">Usuń</button>`:''}
          </div>
        </div>
        <div class="note-body">${(n.body||'').replace(/\n/g,'<br>')}</div>
      </div>`;
    });
    updateNotifBadge('notes', newestNoteMs);
  } catch(e) { console.error('Notes:', e); }
}

window.saveNote = async function() {
  const title    = document.getElementById('note-title').value.trim();
  const body     = document.getElementById('note-body').value.trim();
  const priority = document.getElementById('note-priority').value;
  if (!title||!body) { showToast('⚠ Wypełnij tytuł i treść'); return; }
  try {
    const notePayload = {
      title, body, priority,
      authorUid:  currentUser.uid,
      authorName: currentProfile?.displayName||currentUser.email,
      createdAt:  serverTimestamp()
    };
    await addDoc(collection(db,'notes'), notePayload);
    localStorage.setItem('lastSeen_notes', Date.now().toString());
    showToast('✓ Notatka dodana'); clearNoteForm(); loadNotes();
    if (_discordCfg.notesUrl) sendToDiscord(_discordCfg.notesUrl, buildNoteEmbed({ ...notePayload, createdAt: null }));
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
   EMOJI PICKER
   ===================================================== */
const EMOJI_LIST = [
  '😀','😃','😄','😁','😆','😅','🤣','😂','🙂','🙃','😉','😊','😇','🥰','😍','🤩','😘','😗','😚','😙',
  '😋','😛','😜','🤪','😝','🤑','🤗','🤭','🤫','🤔','🤐','🤨','😐','😑','😶','😏','😒','🙄','😬','🤥',
  '😔','😪','🤤','😴','😷','🤒','🤕','🤢','🤧','🥵','🥶','😲','😳','🥺','😦','😧','😨','😰','😥','😢',
  '😭','😱','😖','😣','😞','😓','😩','😫','🥱','😤','😡','😠','🤬','😈','👿','💀','💩','🤡','👹','👺',
  '👻','👽','👾','🤖','😺','😸','😹','😻','😼','😽','🙀','😿','😾',
  '👋','🤚','🖐','✋','🖖','👌','🤌','🤏','✌','🤞','🤟','🤘','🤙','👈','👉','👆','🖕','👇','👍','👎',
  '✊','👊','🤛','🤜','👏','🙌','🤲','🙏','✍','💅','🤳','💪','🦾','🦿','🦵','🦶','👂','🦻','👃',
  '❤','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❣','💕','💞','💓','💗','💖','💘','💝','💟','☮',
  '✨','🌟','⭐','🌠','🌌','🌙','☀','⛅','🌤','⛈','🌧','❄','🔥','💧','🌊','🌈',
  '🐎','🐴','🦄','🐂','🐄','🐷','🐔','🐣','🦊','🐺','🦁','🐯','🐻','🐼','🐨','🐸','🦋','🐝','🌺','🌸',
  '🍎','🍊','🍋','🍇','🍓','🍒','🥕','🌽','🧅','🧄','🍞','🧀','🥩','🍖','🍗','🥚','🍳','☕','🍵',
  '⚽','🏀','🏈','⚾','🎾','🏐','🎯','🏆','🥇','🎖','🃏','🎲','🎮','🕹',
  '🚗','🚕','🚙','🏎','🚓','🚑','🚒','🚐','🛻','🚚','🏠','🏡','🏰','🏯','🗼','⛺',
  '💰','💵','💴','💶','💷','💸','💳','🪙','📦','📫','📬','📭','📮','📝','📋','📁','📂',
  '⚠','🔴','🟡','🟢','🔵','🟣','⚫','⚪','🔶','🔷','✅','❌','❓','❗','💡','🔔','🔕','🔒','🔓','🔑',
  '⭕','🆕','🆒','🆗','🆙','🆓','🆖','🅰','🅱','🅾','🆘','🏧','⛽','🚧','⛔','🚫','🚷','🚯',
];

let _emojiTarget = null;  // aktywny input/textarea

window.openEmojiPicker = function(triggerId, targetId) {
  _emojiTarget = document.getElementById(targetId);
  const panel  = document.getElementById(triggerId + '-panel');
  if (!panel) return;
  const isOpen = panel.classList.contains('open');
  // zamknij wszystkie otwarte pickery
  document.querySelectorAll('.emoji-picker-panel.open').forEach(p => p.classList.remove('open'));
  if (!isOpen) {
    panel.classList.add('open');
    const search = panel.querySelector('.emoji-picker-search');
    if (search) { search.value = ''; renderEmojiGrid(panel, ''); search.focus(); }
  }
};

function renderEmojiGrid(panel, filter) {
  const grid = panel.querySelector('.emoji-picker-grid');
  const list = filter ? EMOJI_LIST.filter(e => e.includes(filter)) : EMOJI_LIST;
  grid.innerHTML = list.map(e =>
    `<button class="emoji-btn-item" onclick="insertEmoji('${e}')" title="${e}">${e}</button>`
  ).join('');
}

window.insertEmoji = function(emoji) {
  if (!_emojiTarget) return;
  const el    = _emojiTarget;
  const start = el.selectionStart ?? el.value.length;
  const end   = el.selectionEnd   ?? el.value.length;
  el.value    = el.value.slice(0, start) + emoji + el.value.slice(end);
  el.selectionStart = el.selectionEnd = start + emoji.length;
  el.focus();
};

window.onEmojiSearch = function(panel, val) {
  const p = document.getElementById(panel);
  if (p) renderEmojiGrid(p, val);
};

// zamknij picker kliknięciem poza
document.addEventListener('click', e => {
  if (!e.target.closest('.emoji-wrap')) {
    document.querySelectorAll('.emoji-picker-panel.open').forEach(p => p.classList.remove('open'));
  }
});

/* =====================================================
   DISCORD WEBHOOK
   ===================================================== */
let _discordCfg = { notesUrl: '', instructionsUrl: '' };

async function loadDiscordCfg() {
  try {
    const snap = await getDoc(doc(db, 'settings', 'discord'));
    if (snap.exists()) _discordCfg = { notesUrl: '', instructionsUrl: '', ...snap.data() };
  } catch(_) {}
}

async function sendToDiscord(url, payload) {
  if (!url) return false;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return res.ok;
  } catch(e) { console.error('Discord webhook:', e); return false; }
}

function buildNoteEmbed(n) {
  const prioMap = {
    urgent:    { label: '🔴 PILNA',  color: 0xE53935 },
    important: { label: '🟡 WAŻNA',  color: 0xFDD835 },
    normal:    { label: '🔵 Zwykła', color: 0x1E88E5 },
  };
  const prio = prioMap[n.priority] || prioMap.normal;
  const dateStr = n.createdAt?.seconds
    ? new Date(n.createdAt.seconds * 1000).toLocaleString('pl-PL')
    : new Date().toLocaleString('pl-PL');
  return {
    embeds: [{
      title: `📌 ${prio.label} — ${n.title || '—'}`,
      description: n.body || '',
      color: prio.color,
      footer: { text: `✍ ${n.authorName || '—'} · ${dateStr}` }
    }]
  };
}

function buildInstrEmbed(n) {
  const catMap = {
    bezpieczenstwo: { label: 'Bezpieczeństwo', color: 0xE53935 },
    procedura:      { label: 'Procedura',      color: 0xFB8C00 },
    obowiazki:      { label: 'Obowiązki',      color: 0xFDD835 },
    ogolna:         { label: 'Ogólna',         color: 0x1E88E5 },
    inne:           { label: 'Inne',           color: 0x8E24AA },
  };
  const cat = catMap[n.category] || catMap.ogolna;
  const dateStr = n.createdAt?.seconds
    ? new Date(n.createdAt.seconds * 1000).toLocaleString('pl-PL')
    : new Date().toLocaleString('pl-PL');
  return {
    thread_name: `[${cat.label}] ${n.title || '—'}`,   // wymagane dla Discord Forum Channel
    embeds: [{
      title: `📖 [${cat.label}] ${n.title || '—'}`,
      description: n.body || '',
      color: cat.color,
      footer: { text: `✍ ${n.authorName || '—'} · ${dateStr}` }
    }]
  };
}

window.syncNoteToDiscord = async function(id) {
  if (!_discordCfg.notesUrl) { showToast('⚠ Brak URL webhooka notatek — ustaw w sekcji Discord'); return; }
  try {
    const snap = await getDoc(doc(db, 'notes', id));
    if (!snap.exists()) { showToast('⚠ Notatka nie istnieje'); return; }
    showToast('⏳ Wysyłam...');
    const ok = await sendToDiscord(_discordCfg.notesUrl, buildNoteEmbed(snap.data()));
    showToast(ok ? '✓ Wysłano na Discord' : '❌ Błąd wysyłania — sprawdź URL webhooka');
  } catch(e) { showToast('❌ ' + e.message); }
};

window.syncInstrToDiscord = async function(id) {
  if (!_discordCfg.instructionsUrl) { showToast('⚠ Brak URL webhooka instrukcji — ustaw w sekcji Discord'); return; }
  try {
    const snap = await getDoc(doc(db, 'instructions', id));
    if (!snap.exists()) { showToast('⚠ Instrukcja nie istnieje'); return; }
    showToast('⏳ Wysyłam...');
    const ok = await sendToDiscord(_discordCfg.instructionsUrl, buildInstrEmbed(snap.data()));
    showToast(ok ? '✓ Wysłano na Discord' : '❌ Błąd wysyłania — sprawdź URL webhooka');
  } catch(e) { showToast('❌ ' + e.message); }
};

window.saveDiscordSettings = async function() {
  const notesUrl        = document.getElementById('discord-notes-url').value.trim();
  const instructionsUrl = document.getElementById('discord-instr-url').value.trim();
  try {
    await setDoc(doc(db, 'settings', 'discord'), { notesUrl, instructionsUrl, updatedAt: serverTimestamp() });
    _discordCfg = { notesUrl, instructionsUrl };
    showToast('✓ Zapisano ustawienia Discord');
  } catch(e) { showToast('❌ ' + e.message); }
};

window.loadDiscordSettings = async function() {
  if (!isOwnerLevel()) return;
  try {
    const snap = await getDoc(doc(db, 'settings', 'discord'));
    if (snap.exists()) {
      const data = snap.data();
      _discordCfg = { notesUrl: data.notesUrl || '', instructionsUrl: data.instructionsUrl || '' };
      const nu = document.getElementById('discord-notes-url');
      const iu = document.getElementById('discord-instr-url');
      if (nu) nu.value = data.notesUrl || '';
      if (iu) iu.value = data.instructionsUrl || '';
    }
  } catch(e) { console.error('Discord settings:', e); }
};

/* =====================================================
   HELPERS
   ===================================================== */
function roleBadge(role) {
  return ({
    viewer:  '<span class="badge badge-gray">Obserwator</span>',
    worker:  '<span class="badge badge-amber">Pracownik</span>',
    deputy:  '<span class="badge badge-purple">Zastępca</span>',
    technik: '<span class="badge badge-blue">Technik</span>',
    owner:   '<span class="badge badge-red">Właściciel</span>',
  })[role] || '<span class="badge badge-gray">—</span>';
}

window.showToast = function(msg) {
  const c = document.getElementById('toast-container');
  const t = document.createElement('div');
  t.className='toast'; t.textContent=msg;
  c.appendChild(t); setTimeout(()=>t.remove(),3100);
};

document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !document.getElementById('public-screen').classList.contains('hidden')) doLogin();
  if (e.key === 'Escape') {
    const wm = document.getElementById('worker-modal');
    if (wm && !wm.classList.contains('hidden')) {
      wm.classList.add('hidden');
      document.body.style.overflow = '';
      return;
    }
    const rm = document.getElementById('receipt-modal');
    if (rm && !rm.classList.contains('hidden')) {
      rm.classList.add('hidden');
      document.body.style.overflow = '';
    }
  }
});

/* =====================================================
   KONIE — katalog ras
   ===================================================== */
const HORSE_CATALOG = {
  'Robocze': [
    { name:'Muły',                    price:'70–90',   zdrowie:3, wytrzymalosc:1, odwaga:5, zwinnosc:2, predkosc:1, przyspieszenie:1 },
    { name:'Amerykański Osioł Mamut', price:'80–110',  zdrowie:4, wytrzymalosc:1, odwaga:6, zwinnosc:3, predkosc:1, przyspieszenie:1 },
    { name:'Ardeński',                price:'150–190', zdrowie:8, wytrzymalosc:2, odwaga:7, zwinnosc:3, predkosc:1, przyspieszenie:2 },
    { name:'Belgijski',               price:'120–150', zdrowie:8, wytrzymalosc:2, odwaga:7, zwinnosc:2, predkosc:1, przyspieszenie:2 },
    { name:'Shire',                   price:'130–170', zdrowie:9, wytrzymalosc:2, odwaga:7, zwinnosc:2, predkosc:1, przyspieszenie:2 },
    { name:'Suffolk Punch',           price:'120–160', zdrowie:8, wytrzymalosc:2, odwaga:6, zwinnosc:3, predkosc:1, przyspieszenie:2 },
    { name:'Bretoński',               price:'150–180', zdrowie:8, wytrzymalosc:2, odwaga:6, zwinnosc:3, predkosc:1, przyspieszenie:2 },
    { name:'Fryzyjski',               price:'270–340', zdrowie:7, wytrzymalosc:2, odwaga:7, zwinnosc:5, predkosc:1, przyspieszenie:4 },
    { name:'Clydesdale',              price:'150–170', zdrowie:8, wytrzymalosc:2, odwaga:6, zwinnosc:3, predkosc:1, przyspieszenie:2 },
    { name:'Black Forest',            price:'210–260', zdrowie:6, wytrzymalosc:2, odwaga:7, zwinnosc:4, predkosc:1, przyspieszenie:3 },
    { name:'Haflinger',               price:'190–220', zdrowie:6, wytrzymalosc:2, odwaga:6, zwinnosc:5, predkosc:1, przyspieszenie:3 },
    { name:'Koń Kanadyjski',          price:'200–230', zdrowie:7, wytrzymalosc:2, odwaga:7, zwinnosc:5, predkosc:1, przyspieszenie:3 },
    { name:'Cob Irlandzki',           price:'200–240', zdrowie:8, wytrzymalosc:2, odwaga:7, zwinnosc:4, predkosc:1, przyspieszenie:2 },
    { name:'Harlekin',                price:'180–210', zdrowie:7, wytrzymalosc:2, odwaga:6, zwinnosc:4, predkosc:1, przyspieszenie:3 },
    { name:'Comtois',                 price:'170–200', zdrowie:8, wytrzymalosc:2, odwaga:7, zwinnosc:3, predkosc:1, przyspieszenie:2 },
    { name:'Warlander',               price:'180–200', zdrowie:7, wytrzymalosc:2, odwaga:7, zwinnosc:4, predkosc:1, przyspieszenie:3 },
  ],
  'Wierzchowce': [
    { name:'American Paint',                price:'390–410',  zdrowie:6, wytrzymalosc:3, odwaga:6, zwinnosc:7, predkosc:3, przyspieszenie:5 },
    { name:'Kłusak Amerykański',            price:'390–430',  zdrowie:5, wytrzymalosc:4, odwaga:5, zwinnosc:5, predkosc:4, przyspieszenie:6 },
    { name:'Andaluzyjski',                  price:'450–500',  zdrowie:7, wytrzymalosc:3, odwaga:7, zwinnosc:7, predkosc:4, przyspieszenie:5 },
    { name:'Appaloosa',                     price:'360–390',  zdrowie:6, wytrzymalosc:3, odwaga:6, zwinnosc:6, predkosc:3, przyspieszenie:5 },
    { name:'Criollo',                       price:'400–460',  zdrowie:7, wytrzymalosc:5, odwaga:7, zwinnosc:6, predkosc:3, przyspieszenie:4 },
    { name:'Holenderski Koń Gorącokrwisty', price:'410–440',  zdrowie:6, wytrzymalosc:4, odwaga:6, zwinnosc:7, predkosc:4, przyspieszenie:5 },
    { name:'Węgierski Półkrwi',             price:'395–430',  zdrowie:6, wytrzymalosc:4, odwaga:7, zwinnosc:6, predkosc:3, przyspieszenie:4 },
    { name:'Kentucky Saddle',               price:'360–380',  zdrowie:5, wytrzymalosc:3, odwaga:5, zwinnosc:6, predkosc:4, przyspieszenie:5 },
    { name:'Kladruber',                     price:'440–460',  zdrowie:7, wytrzymalosc:3, odwaga:6, zwinnosc:4, predkosc:3, przyspieszenie:4 },
    { name:'Missouri Fox Trotter',          price:'490–530',  zdrowie:6, wytrzymalosc:5, odwaga:6, zwinnosc:6, predkosc:4, przyspieszenie:6 },
    { name:'Morgan',                        price:'390–400',  zdrowie:5, wytrzymalosc:3, odwaga:6, zwinnosc:6, predkosc:3, przyspieszenie:4 },
    { name:'Mustang',                       price:'440–470',  zdrowie:6, wytrzymalosc:5, odwaga:8, zwinnosc:7, predkosc:4, przyspieszenie:5 },
    { name:'Fjord',                         price:'400–430',  zdrowie:7, wytrzymalosc:4, odwaga:7, zwinnosc:4, predkosc:3, przyspieszenie:3 },
    { name:'Tiger Horse',                   price:'420–450',  zdrowie:6, wytrzymalosc:3, odwaga:6, zwinnosc:6, predkosc:4, przyspieszenie:5 },
    { name:'American Quarter Horse',        price:'530–570',  zdrowie:6, wytrzymalosc:4, odwaga:7, zwinnosc:8, predkosc:4, przyspieszenie:7 },
    { name:'Colorado Ranger',               price:'590–630',  zdrowie:6, wytrzymalosc:3, odwaga:6, zwinnosc:7, predkosc:4, przyspieszenie:5 },
    { name:'Rocky Mountain Horse',          price:'520–560',  zdrowie:6, wytrzymalosc:4, odwaga:6, zwinnosc:6, predkosc:3, przyspieszenie:4 },
    { name:'Tennessee Walker',              price:'430–450',  zdrowie:5, wytrzymalosc:4, odwaga:5, zwinnosc:5, predkosc:4, przyspieszenie:5 },
    { name:'Norfolk Roadster',              price:'550–600',  zdrowie:5, wytrzymalosc:3, odwaga:6, zwinnosc:6, predkosc:4, przyspieszenie:5 },
    { name:'Oldenburski',                   price:'530–580',  zdrowie:6, wytrzymalosc:4, odwaga:6, zwinnosc:7, predkosc:4, przyspieszenie:5 },
    { name:'Koń Holsztyński',               price:'600–670',  zdrowie:6, wytrzymalosc:4, odwaga:6, zwinnosc:7, predkosc:4, przyspieszenie:5 },
    { name:'Selle Francais',                price:'600–665',  zdrowie:6, wytrzymalosc:4, odwaga:6, zwinnosc:8, predkosc:4, przyspieszenie:5 },
    { name:'Koń Minorkański',               price:'550–590',  zdrowie:6, wytrzymalosc:3, odwaga:7, zwinnosc:7, predkosc:4, przyspieszenie:5 },
    { name:'Lipicański',                    price:'550–570',  zdrowie:6, wytrzymalosc:3, odwaga:7, zwinnosc:6, predkosc:3, przyspieszenie:4 },
    { name:'Cleveland Bay',                 price:'510–550',  zdrowie:7, wytrzymalosc:4, odwaga:6, zwinnosc:5, predkosc:3, przyspieszenie:4 },
    { name:'Murgese',                       price:'540–590',  zdrowie:7, wytrzymalosc:4, odwaga:7, zwinnosc:6, predkosc:3, przyspieszenie:4 },
    { name:'Kuc Islandzki',                 price:'540–570',  zdrowie:6, wytrzymalosc:5, odwaga:7, zwinnosc:5, predkosc:3, przyspieszenie:4 },
    { name:'Koń Luzytański',                price:'590–620',  zdrowie:6, wytrzymalosc:4, odwaga:7, zwinnosc:8, predkosc:4, przyspieszenie:6 },
    { name:'Paso Fino',                     price:'560–590',  zdrowie:5, wytrzymalosc:3, odwaga:5, zwinnosc:7, predkosc:4, przyspieszenie:5 },
    { name:'Camargue',                      price:'570–590',  zdrowie:6, wytrzymalosc:4, odwaga:7, zwinnosc:5, predkosc:3, przyspieszenie:4 },
    { name:'Amerykański Koń Wierzchowy',    price:'550–570',  zdrowie:5, wytrzymalosc:3, odwaga:5, zwinnosc:7, predkosc:4, przyspieszenie:5 },
  ],
  'Wyścigowe': [
    { name:'Arabski',                       price:'1050–1200', zdrowie:5, wytrzymalosc:7, odwaga:6, zwinnosc:8, predkosc:6, przyspieszenie:8 },
    { name:'Koń Pełnej Krwi Angielskiej',   price:'1200–1400', zdrowie:4, wytrzymalosc:5, odwaga:5, zwinnosc:8, predkosc:8, przyspieszenie:9 },
    { name:'Turkmeński',                    price:'990–1050',  zdrowie:7, wytrzymalosc:5, odwaga:7, zwinnosc:8, predkosc:6, przyspieszenie:8 },
    { name:'Nez Perce',                     price:'970–1000',  zdrowie:6, wytrzymalosc:5, odwaga:7, zwinnosc:8, predkosc:5, przyspieszenie:7 },
    { name:'Pintabian',                     price:'1000–1100', zdrowie:5, wytrzymalosc:7, odwaga:6, zwinnosc:8, predkosc:6, przyspieszenie:8 },
    { name:'AraAppaloosa',                  price:'950–990',   zdrowie:6, wytrzymalosc:5, odwaga:6, zwinnosc:8, predkosc:5, przyspieszenie:7 },
    { name:'Kłusak Francuski',              price:'930–970',   zdrowie:5, wytrzymalosc:5, odwaga:5, zwinnosc:7, predkosc:5, przyspieszenie:7 },
    { name:'Achał-Tekiński',                price:'1100–1200', zdrowie:5, wytrzymalosc:7, odwaga:7, zwinnosc:8, predkosc:6, przyspieszenie:8 },
  ],
  'Kuce': [
    { name:'Kuc Szetlandzki', price:'200–230', zdrowie:7, wytrzymalosc:3, odwaga:7, zwinnosc:5, predkosc:1, przyspieszenie:2 },
    { name:'Kuc Walijski',    price:'270–300', zdrowie:5, wytrzymalosc:2, odwaga:6, zwinnosc:7, predkosc:3, przyspieszenie:6 },
    { name:'Merens',          price:'250–290', zdrowie:6, wytrzymalosc:3, odwaga:7, zwinnosc:5, predkosc:2, przyspieszenie:3 },
    { name:'Exmoor',          price:'220–250', zdrowie:6, wytrzymalosc:3, odwaga:7, zwinnosc:5, predkosc:2, przyspieszenie:2 },
    { name:'Connemara',       price:'290–320', zdrowie:6, wytrzymalosc:3, odwaga:7, zwinnosc:7, predkosc:2, przyspieszenie:4 },
    { name:'Cob Walijski',    price:'300–350', zdrowie:7, wytrzymalosc:3, odwaga:7, zwinnosc:6, predkosc:3, przyspieszenie:5 },
  ],
  'Egzotyczne': [
    { name:'Marna Szkapa', price:'40–45',  zdrowie:1, wytrzymalosc:1, odwaga:1, zwinnosc:1, predkosc:1, przyspieszenie:1 },
    { name:'Osioł',        price:'50',     zdrowie:3, wytrzymalosc:2, odwaga:5, zwinnosc:2, predkosc:1, przyspieszenie:1 },
    { name:'Przewalski',   price:'225',    zdrowie:5, wytrzymalosc:3, odwaga:5, zwinnosc:4, predkosc:3, przyspieszenie:3 },
  ],
};

const HORSE_CAT_ICONS = {
  'Robocze':    '🐴',
  'Wierzchowce':'🏇',
  'Wyścigowe':  '🏆',
  'Kuce':       '🐎',
  'Egzotyczne': '🌟',
};
let _activeCat   = 'Robocze';
let _horseSortStats = []; // max 2 klucze cech, sortowanie po sumie

function _horseStatBar(label, val, highlighted) {
  const pct = Math.round((val || 0) / 10 * 100);
  const hl  = !!highlighted;
  return `<div class="horse-stat${hl ? ' horse-stat--hl' : ''}">
    <span class="horse-stat-label">${label}</span>
    <div class="horse-stat-bar"><div class="horse-stat-fill${hl ? ' horse-stat-fill--hl' : ''}" style="width:${pct}%"></div></div>
    <span class="horse-stat-val${hl ? ' horse-stat-val--hl' : ''}">${val}/10</span>
  </div>`;
}

/* Zwraca wszystkie konie ze wszystkich kategorii jako płaską listę { ...h, _cat } */
function _allHorses() {
  return Object.entries(HORSE_CATALOG).flatMap(([cat, list]) =>
    list.map(h => ({ ...h, _cat: cat }))
  );
}

/* Parsuje widełki ceny "400–460" → max wartość (460), obsługuje też "50" */
function _parseMaxPrice(priceStr) {
  const parts = String(priceStr).split(/[–\-]/);
  return parseInt(parts[parts.length - 1], 10) || 0;
}
/* Parsuje widełki ceny "400–460" → min wartość (400), obsługuje też "50" */
function _parseMinPrice(priceStr) {
  const parts = String(priceStr).split(/[–\-]/);
  return parseInt(parts[0], 10) || 0;
}
/* Prowizja na podstawie ceny minimalnej */
function _horseCommission(priceStr) {
  const min = _parseMinPrice(priceStr);
  if (min < 300)       return '+25$ prowizji';
  if (min <= 700)      return '+30$ prowizji';
  return '+40$ prowizji';
}

window.renderHorsesPage = function() {
  const catEl  = document.getElementById('horses-categories');
  const gridEl = document.getElementById('horses-grid');
  if (!catEl || !gridEl) return;

  const filterActive = _isFilterActive();

  /* Przyciski kategorii — schowaj gdy aktywny filtr */
  catEl.style.display = filterActive ? 'none' : '';
  catEl.innerHTML = Object.keys(HORSE_CATALOG).map(cat => `
    <button class="horses-cat-btn ${cat === _activeCat ? 'active' : ''}"
      onclick="selectHorseCat('${cat}')">
      ${HORSE_CAT_ICONS[cat] || '🐎'} ${cat}
    </button>`).join('');

  let horses;
  if (filterActive) {
    horses = _allHorses();
  } else {
    horses = (HORSE_CATALOG[_activeCat] || []).map(h => ({ ...h, _cat: _activeCat }));
  }

  /* Filtr nazwy */
  const nameVal = (document.getElementById('hf-name')?.value || '').trim().toLowerCase();
  if (nameVal) horses = horses.filter(h => h.name.toLowerCase().includes(nameVal));

  /* Filtr ceny max — pokazuj konie których cena minimalna mieści się w budżecie */
  const priceMax = parseInt(document.getElementById('hf-price')?.value || '', 10);
  if (!isNaN(priceMax) && priceMax > 0) {
    horses = horses.filter(h => _parseMinPrice(h.price) <= priceMax);
  }

  /* Filtr kategorii w trybie wyszukiwania */
  const catVal = document.getElementById('hf-cat')?.value || '';
  if (catVal) horses = horses.filter(h => h._cat === catVal);

  /* Sortowanie wg 1 lub 2 cech — suma malejąco */
  if (_horseSortStats.length) {
    horses = [...horses].sort((a, b) => {
      const sumB = _horseSortStats.reduce((s, k) => s + (b[k] || 0), 0);
      const sumA = _horseSortStats.reduce((s, k) => s + (a[k] || 0), 0);
      return sumB - sumA;
    });
  }

  /* Podświetl przyciski sortowania — numeruj kolejność wyboru */
  document.querySelectorAll('.hf-sort-btn').forEach(btn => {
    const idx = _horseSortStats.indexOf(btn.dataset.stat);
    btn.classList.toggle('active', idx !== -1);
    const badge = btn.querySelector('.sort-order-badge');
    if (badge) badge.remove();
    if (idx !== -1 && _horseSortStats.length === 2) {
      btn.insertAdjacentHTML('beforeend', `<span class="sort-order-badge">${idx + 1}</span>`);
    }
  });

  /* Wyniki */
  const resEl = document.getElementById('hf-results');
  if (resEl) {
    let txt = filterActive ? `Znaleziono: ${horses.length} ${horses.length === 1 ? 'koń' : horses.length < 5 ? 'konie' : 'koni'}` : '';
    if (_horseSortStats.length === 2) txt += ' · sortowanie: suma obu cech';
    resEl.textContent = txt;
  }

  if (!horses.length) {
    gridEl.innerHTML = `<div style="font-family:var(--font-type);color:var(--dust);padding:1.5rem;grid-column:1/-1">Brak koni spełniających kryteria.</div>`;
    return;
  }

  gridEl.innerHTML = horses.map(h => `
    <div class="horse-card">
      <div class="horse-card-header">
        <div>
          ${filterActive ? `<div class="horse-card-cat">${HORSE_CAT_ICONS[h._cat] || '🐎'} ${h._cat}</div>` : ''}
          <div class="horse-card-name">${h.name}</div>
        </div>
        <div class="horse-commission">${_horseCommission(h.price)}</div>
      </div>
      <div class="horse-card-price">💰 ${h.price} $</div>
      <div class="horse-stats">
        ${_horseStatBar('❤️ Zdrowie',        h.zdrowie,        _horseSortStats.includes('zdrowie'))}
        ${_horseStatBar('💪 Wytrzymałość',   h.wytrzymalosc,   _horseSortStats.includes('wytrzymalosc'))}
        ${_horseStatBar('🦁 Odwaga',         h.odwaga,         _horseSortStats.includes('odwaga'))}
        ${_horseStatBar('🌀 Zwinność',       h.zwinnosc,       _horseSortStats.includes('zwinnosc'))}
        ${_horseStatBar('💨 Prędkość',       h.predkosc,       _horseSortStats.includes('predkosc'))}
        ${_horseStatBar('⚡ Przyspieszenie', h.przyspieszenie, _horseSortStats.includes('przyspieszenie'))}
      </div>
    </div>`).join('');
};

function _isFilterActive() {
  const name  = (document.getElementById('hf-name')?.value  || '').trim();
  const price = (document.getElementById('hf-price')?.value || '').trim();
  const cat   = (document.getElementById('hf-cat')?.value   || '');
  return !!(name || price || cat || _horseSortStats.length);
}

window.selectHorseCat = function(cat) {
  _activeCat = cat;
  window.renderHorsesPage();
};

window.applyHorseFilters = function() {
  window.renderHorsesPage();
};

window.toggleHorseSort = function(stat) {
  const idx = _horseSortStats.indexOf(stat);
  if (idx !== -1) {
    /* Odznacz */
    _horseSortStats.splice(idx, 1);
  } else if (_horseSortStats.length < 2) {
    /* Dodaj (max 2) */
    _horseSortStats.push(stat);
  } else {
    /* Już 2 zaznaczone — zamień starszą (pierwszą) na nową */
    _horseSortStats = [_horseSortStats[1], stat];
  }
  window.renderHorsesPage();
};

window.resetHorseFilters = function() {
  document.getElementById('hf-name').value  = '';
  document.getElementById('hf-price').value = '';
  document.getElementById('hf-cat').value   = '';
  _horseSortStats = [];
  window.renderHorsesPage();
};






/* =====================================================
   KATALOG KONI — usunięty
   ===================================================== */
const HORSE_CATALOG_DISABLED = {
  muly: {
    label: 'Muły',
    icon:  '🐴',
    desc:  'Muły to skrzyżowanie konia i osła — wytrzymałe, spokojne i niezawodne w trudnym terenie.',
    konie: [
      {
        id:   'ambercreamchampageneleopard',
        name: 'Amber Cream Champagne Leopard',
        coat: 'Bursztynowy Kremowy Szampan Leopard',
        img:  'konie/muly/ambercreamchampageneleopard.png',
        desc: 'Wyjątkowe umaszczenie łączące kremowy odcień szampana z ciemnymi cętkami rozmieszczonymi na całym ciele.'
      },
      {
        id:   'blackblanket',
        name: 'Black Blanket',
        coat: 'Czarny Koc',
        img:  'konie/muly/blackblanket.png',
        desc: 'Ciemnoszara maść z charakterystycznym jasnym kocem na zadzie, kontrastującym z ciemnym przodem.'
      },
      {
        id:   'blackfewspotted',
        name: 'Black Few Spotted',
        coat: 'Czarny Nieliczne Cętki',
        img:  'konie/muly/blackfewspotted.png',
        desc: 'Prawie całkowicie biały z nielicznymi czarnymi plamami — rzadkie i charakterystyczne umaszczenie.'
      },
      {
        id:   'blackleopard',
        name: 'Black Leopard',
        coat: 'Czarny Leopard',
        img:  'konie/muly/blackleopard.png',
        desc: 'Białe tło pokryte wyraźnymi czarnymi cętkami — jedno z najbardziej rozpoznawalnych umaszczeni.'
      },
      {
        id:   'chestnut',
        name: 'Chestnut',
        coat: 'Kasztanowaty',
        img:  'konie/muly/chestnut.png',
        desc: 'Klasyczna kasztanowata maść — ciepły, złotobrązowy odcień sierści z ciemniejszą grzywą i ogonem.'
      },
      {
        id:   'classicchampagneblanket',
        name: 'Classic Champagne Blanket',
        coat: 'Klasyczny Szampan Koc',
        img:  'konie/muly/classicchampagneblanket.png',
        desc: 'Szampańska maść z białym kocem na zadzie i delikatnymi cętkami — elegancka i rzadka kombinacja.'
      },
      {
        id:   'goldchampagnetobiano',
        name: 'Gold Champagne Tobiano',
        coat: 'Złoty Szampan Tobiano',
        img:  'konie/muly/goldchampagnetobiano.png',
        desc: 'Złocisto-szampański odcień z białymi plamami tobiano — ciepłe i luksusowe umaszczenie.'
      },
      {
        id:   'greynearleopard',
        name: 'Grey Near Leopard',
        coat: 'Szary Prawie Leopard',
        img:  'konie/muly/greynearleopard.png',
        desc: 'Jasne, popielate tło z delikatnymi brązowymi cętkami — subtelna odmiana umaszczenia leopard.'
      },
      {
        id:   'mealybay',
        name: 'Mealy Bay',
        coat: 'Karoszy Mączysty',
        img:  'konie/muly/mealybay.png',
        desc: 'Kasztanowato-gniade umaszczenie z charakterystycznym jaśniejszym podbrzuszem — efekt mączysty.'
      },
      {
        id:   'pangarebaybrindle',
        name: 'Pangare Bay Brindle',
        coat: 'Pangare Gniadobrązowy Prążkowany',
        img:  'konie/muly/pangarebaybrindle.png',
        desc: 'Wyjątkowe prążkowane umaszczenie z ciemnymi pasami na gniadobrązowym tle — ekstremalnie rzadkie.'
      },
      {
        id:   'redblanket',
        name: 'Red Blanket',
        coat: 'Czerwony Koc',
        img:  'konie/muly/redblanket.png',
        desc: 'Rudo-kasztanowe umaszczenie z jaśniejszym kocem na zadzie i białymi skarpetkami na nogach.'
      },
      {
        id:   'redleopard',
        name: 'Red Leopard',
        coat: 'Czerwony Leopard',
        img:  'konie/muly/redleopard.png',
        desc: 'Białe tło z rudymi cętkami leopard — ciepłe, charakterystyczne i łatwo rozpoznawalne umaszczenie.'
      },
      {
        id:   'sealbay',
        name: 'Seal Bay',
        coat: 'Ciemnokaroszy',
        img:  'konie/muly/sealbay.png',
        desc: 'Bardzo ciemna, prawie czarna maść z gniadymi refleksami w świetle — elegancka i poważna.'
      },
      {
        id:   'silverbaypangare',
        name: 'Silver Bay Pangare',
        coat: 'Srebrny Gniadokaroszy Pangare',
        img:  'konie/muly/silverbaypangare.png',
        desc: 'Srebrzysty odcień gniady z pangare — biała grzywa wyraźnie kontrastuje z ciemnymi kończynami.'
      },
      {
        id:   'silverblackblanket',
        name: 'Silver Black Blanket',
        coat: 'Srebrno-Czarny Koc',
        img:  'konie/muly/silverblackblanket.png',
        desc: 'Ciemny z srebrnym połyskiem i charakterystycznym białym kocem na zadzie — wyraziste umaszczenie.'
      },
      {
        id:   'smokyblackblanket',
        name: 'Smoky Black Blanket',
        coat: 'Dymno-Czarny Koc',
        img:  'konie/muly/smokyblackblanket.png',
        desc: 'Dymno-brązowe umaszczenie z białym kocem na zadzie i charakterystycznymi białymi skarpetkami.'
      },
      {
        id:   'sootybayleopard',
        name: 'Sooty Bay Leopard',
        coat: 'Brudnokaroszy Leopard',
        img:  'konie/muly/sootybayleopard.png',
        desc: 'Pomarańczowo-gniade tło z ciemnymi cętkami — intensywne i bardzo przyciągające wzrok umaszczenie.'
      },
      {
        id:   'whitelegendary',
        name: 'White — Legendarny',
        coat: 'Biały Legendarny',
        img:  'konie/muly/whitelegendary.png',
        desc: 'Czysto biała maść — legendarny okaz stajni Strawberry. Wyjątkowy i absolutnie niepowtarzalny.',
        legendary: true
      },
      {
        id:   'zonkey',
        name: 'Zonkey',
        coat: 'Zebrowiec (Muł × Zebra)',
        img:  'konie/muly/zonkey.png',
        desc: 'Niezwykłe skrzyżowanie muła i zebry — charakterystyczne paski na pomarańczowo-brązowym tle. Prawdziwa osobliwość!',
        legendary: true
      },
    ]
  }
  ,
  amerykanskiosiolmamut: {
    label: 'Amerykański Osioł Mamut',
    icon:  '🫏',
    desc:  'Amerykański Osioł Mamut — potężny, spokojny i wytrzymały. Jeden z największych przedstawicieli swojego gatunku.',
    konie: [
      {
        id:   'legendarybaypangare',
        name: 'Legendary Bay Pangare',
        coat: 'Legendarny Gniadokaroszy Pangare',
        img:  'konie/amerykanskiosiolmamut/legendarybaypangare.png',
        desc: 'Legendarny okaz o głębokiej gniadej maści z charakterystycznym pangare — jaśniejszym podbrzuszem. Wyjątkowy i rzadko spotykany.',
        legendary: true
      },
      {
        id:   'legendaryblacknearleopard',
        name: 'Legendary Black Near Leopard',
        coat: 'Legendarny Czarny Prawie Leopard',
        img:  'konie/amerykanskiosiolmamut/legendaryblacknearleopard.png',
        desc: 'Legendarny okaz o czarnej maści z białymi i czarnymi plamami w stylu leopard. Jeden z najbardziej imponujących osobników.',
        legendary: true
      },
      {
        id:   'rosegreybrindle',
        name: 'Rose Grey Brindle',
        coat: 'Różowoszary Prążkowany',
        img:  'konie/amerykanskiosiolmamut/rosegreybrindle.png',
        desc: 'Ciemna maść z charakterystycznymi jasnobrązowymi prążkami i delikatnymi białymi plamami — niezwykłe i rzadkie umaszczenie.'
      },
      {
        id:   'smokyblacktovero',
        name: 'Smoky Black Tovero',
        coat: 'Dymno-Czarny Tovero',
        img:  'konie/amerykanskiosiolmamut/smokyblacktovero.png',
        desc: 'Czarne umaszczenie tovero z charakterystyczną białą łatą na twarzy i niebieskim okiem — elegancki i wyrazisty.'
      },
      {
        id:   'blacktovero',
        name: 'Black Tovero',
        coat: 'Czarny Tovero',
        img:  'konie/amerykanskiosiolmamut/blacktovero.png',
        desc: 'Białe tło z dużymi czarnymi plamami tovero — kontrastowe i bardzo charakterystyczne umaszczenie.'
      },
      {
        id:   'classiccreamchampagneleopard',
        name: 'Classic Cream Champagne Leopard',
        coat: 'Klasyczny Kremowy Szampan Leopard',
        img:  'konie/amerykanskiosiolmamut/classiccreamchampagneleopard.png',
        desc: 'Kremowo-szampańskie tło pokryte brązowymi cętkami leopard — delikatne i eleganckie umaszczenie.'
      },
      {
        id:   'cremellorabicano',
        name: 'Cremello Rabicano',
        coat: 'Kremello Rabicano',
        img:  'konie/amerykanskiosiolmamut/cremellorabicano.png',
        desc: 'Niemal biała maść cremello z delikatnym rabicano — kremowy odcień z subtelnym połyskiem sierści.'
      },
      {
        id:   'dominantwhitebrindle',
        name: 'Dominant White Brindle',
        coat: 'Dominujący Biały Prążkowany',
        img:  'konie/amerykanskiosiolmamut/dominantwhitebrindle.png',
        desc: 'Prawie biała maść z ledwo widocznymi jasnymi prążkami — wyjątkowo rzadkie i subtelne umaszczenie.'
      },
      {
        id:   'goldcreamchampagneblanket',
        name: 'Gold Cream Champagne Blanket',
        coat: 'Złocisty Kremowy Szampan Koc',
        img:  'konie/amerykanskiosiolmamut/goldcreamchampagneblanket.png',
        desc: 'Kremowo-złocisty szampan z białym kocem na zadzie — ciepłe i luksusowe umaszczenie.'
      },
    ]
  }
  /* Kolejne kategorie dodaj tutaj w tym samym formacie */
};

