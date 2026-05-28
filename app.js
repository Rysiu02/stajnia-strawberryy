/* =====================================================
   STAJNIA STRAWBERRY — app.js
   Firebase Auth + Firestore
   ===================================================== */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore,
  doc, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc,
  collection, query, orderBy, limit, where,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

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

/* =====================================================
   STAŁE
   ===================================================== */
const ROLES      = {
  viewer: { label: 'Obserwator', css: 'role-viewer' },
  worker: { label: 'Pracownik',  css: 'role-worker' },
  owner:  { label: 'Właściciel', css: 'role-owner'  },
};
const ROLE_LEVEL = { viewer: 0, worker: 1, owner: 2 };

const PRICES = {
  trening:        15,
  szczotka:       7,
  kopystka:       17,
  ozwiezwiacz:    31,
  masc:           21,
  siano:          2,
  marchewka:      2,
  cukier:         1.5,
};

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
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    if (snap.exists()) {
      currentProfile = snap.data();
      currentRole    = currentProfile.role || 'viewer';
    } else {
      currentProfile = { displayName: currentUser.email, email: currentUser.email, role: 'viewer' };
      await setDoc(doc(db, 'users', uid), { ...currentProfile, createdAt: serverTimestamp() });
      currentRole = 'viewer';
    }
  } catch(e) { currentRole = 'viewer'; }
}

/* =====================================================
   EKRANY
   ===================================================== */
function showLogin() {
  document.getElementById('loading-overlay').classList.add('hidden');
  document.getElementById('login-screen').classList.remove('hidden');
  document.getElementById('app').classList.add('hidden');
}

function showApp() {
  document.getElementById('loading-overlay').classList.add('hidden');
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');

  const badge = document.getElementById('user-badge');
  badge.className = 'user-badge ' + (ROLES[currentRole]?.css || '');
  document.getElementById('user-name-display').textContent =
    (currentProfile?.displayName || currentUser.email) + ' · ' + (ROLES[currentRole]?.label || '');
  document.getElementById('sidebar-role-info').textContent =
    'Rola: ' + (ROLES[currentRole]?.label || '—');

  const now = new Date();
  document.getElementById('current-date').textContent =
    now.toLocaleDateString('pl-PL', { weekday:'long', year:'numeric', month:'long', day:'numeric' });
  document.getElementById('dashboard-greeting').textContent =
    'Dzień dobry, ' + (currentProfile?.displayName?.split(' ')[0] || 'szeryf');

  const ym = now.toISOString().slice(0,7);
  document.getElementById('current-month-label').textContent = ym;

  // Ustaw domyślne filtry miesięcy
  ['receipts-filter-month','expenses-filter-month','tax-filter-month'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = ym;
  });

  applyRoleRestrictions();
  loadDashboard();
  loadReceiptsHistory();
  loadExpenses();
  loadPayroll();
  loadWarehouse();
  loadAccounts();
  loadTax();
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
      'auth/invalid-email':      'Nieprawidłowy e-mail.',
      'auth/user-not-found':     'Brak konta.',
      'auth/wrong-password':     'Błędne hasło.',
      'auth/invalid-credential': 'Błędne dane logowania.',
      'auth/too-many-requests':  'Za dużo prób. Odczekaj.',
    };
    showLoginErr(msgs[e.code] || e.message);
  }
};

function showLoginErr(msg) {
  const e = document.getElementById('login-error');
  e.textContent = '⚠ ' + msg; e.style.display = 'block';
}

window.doLogout = async function() {
  await signOut(auth);
  document.getElementById('login-email').value = '';
  document.getElementById('login-pass').value  = '';
};

/* =====================================================
   NAWIGACJA
   ===================================================== */
window.goTo = function(section, el) {
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
    const min = item.dataset.minRole;
    item.style.opacity = ROLE_LEVEL[min] > lvl ? '0.35' : '1';
    item.title         = ROLE_LEVEL[min] > lvl ? 'Wymagana wyższa rola' : '';
  });
  if (lvl >= ROLE_LEVEL['owner']) {
    document.getElementById('add-expense-panel').style.display = 'block';
  }
}

/* =====================================================
   POMOCNICZE — formatowanie
   ===================================================== */
const fmt  = n => (Math.round((n||0)*100)/100).toLocaleString('pl-PL', { minimumFractionDigits:2, maximumFractionDigits:2 }) + ' $';
const fmtD = ts => ts?.toDate ? ts.toDate().toLocaleDateString('pl-PL', { day:'numeric', month:'short', year:'numeric' }) : '—';

function currentMonth() {
  return new Date().toISOString().slice(0,7);
}

/* =====================================================
   DASHBOARD
   ===================================================== */
async function loadDashboard() {
  try {
    const month = currentMonth();

    // Rachunki tego miesiąca
    const rSnap = await getDocs(
      query(collection(db, 'receipts'), where('month','==',month), orderBy('createdAt','desc'))
    );

    let totalSales = 0, totalStable = 0, totalWorkers = 0;
    const workerMap = {}; // uid → { name, sales, stable, worker }

    rSnap.forEach(d => {
      const r = d.data();
      totalSales   += r.total   || 0;
      totalStable  += r.stable  || 0;
      totalWorkers += r.workerCut || 0;

      const uid = r.workerUid;
      if (!workerMap[uid]) workerMap[uid] = { name: r.workerName||'—', sales:0, stable:0, workerCut:0, paid:0 };
      workerMap[uid].sales     += r.total     || 0;
      workerMap[uid].stable    += r.stable    || 0;
      workerMap[uid].workerCut += r.workerCut || 0;
    });

    // Wypłacone zakładki
    const pSnap = await getDocs(
      query(collection(db, 'payouts'), where('month','==',month))
    );
    pSnap.forEach(d => {
      const p = d.data();
      if (workerMap[p.workerUid]) workerMap[p.workerUid].paid += p.amount || 0;
    });

    // Wydatki miesiąca
    const eSnap = await getDocs(
      query(collection(db, 'expenses'), where('month','==',month))
    );
    let totalExp = 0;
    eSnap.forEach(d => { totalExp += d.data().amount || 0; });

    // Karty statystyk
    document.getElementById('stat-today').textContent      = fmt(totalSales);
    document.getElementById('stat-stable').textContent     = fmt(totalStable);
    document.getElementById('stat-workers-tab').textContent= fmt(totalWorkers);
    document.getElementById('stat-expenses').textContent   = fmt(totalExp);

    // Tabela zakładek pracowników
    const tbody = document.getElementById('workers-tabs-body');
    const rows  = Object.values(workerMap);
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="5" class="muted" style="text-align:center;padding:1rem">Brak sprzedaży w tym miesiącu</td></tr>';
    } else {
      tbody.innerHTML = rows.map(w => `
        <tr>
          <td>${w.name}</td>
          <td>${fmt(w.sales)}</td>
          <td><strong style="color:#6abf7e">${fmt(w.workerCut)}</strong></td>
          <td class="muted">${fmt(w.paid)}</td>
          <td><strong style="color:var(--pale-gold)">${fmt(w.workerCut - w.paid)}</strong></td>
        </tr>`).join('');
    }

    // Ostatnie rachunki
    const recTbody = document.getElementById('dashboard-receipts');
    if (rSnap.empty) {
      recTbody.innerHTML = '<tr><td colspan="6" class="muted" style="text-align:center;padding:1rem">Brak rachunków</td></tr>';
    } else {
      let html = '';
      rSnap.forEach(d => {
        const r = d.data();
        html += `<tr>
          <td class="muted">${fmtD(r.createdAt)}</td>
          <td>${r.workerName||'—'}</td>
          <td class="muted" style="font-size:0.75rem">${(r.lines||[]).map(l=>l.name).join(', ')}</td>
          <td><strong style="color:var(--pale-gold)">${fmt(r.total)}</strong></td>
          <td style="color:var(--amber)">${fmt(r.stable)}</td>
          <td style="color:#6abf7e">${fmt(r.workerCut)}</td>
        </tr>`;
      });
      recTbody.innerHTML = html;
    }
  } catch(e) { console.error('Dashboard:', e); }
}

/* =====================================================
   RACHUNKI — linie
   ===================================================== */
window.addReceiptLine = function() {
  const tpl  = document.getElementById('receipt-line-tpl');
  const clone = tpl.content.cloneNode(true);
  document.getElementById('receipt-lines').appendChild(clone);
  recalcTotal();
};

window.removeReceiptLine = function(btn) {
  btn.closest('.receipt-line').remove();
  recalcTotal();
};

window.onReceiptItemChange = function(sel) {
  const line  = sel.closest('.receipt-line');
  const opt   = sel.selectedOptions[0];
  const price = parseFloat(opt?.dataset.price || 0);
  const horse = opt?.dataset.horse === '1';
  const fee   = parseFloat(opt?.dataset.fee   || 0);
  const custom= sel.value === 'custom';

  line.querySelector('.receipt-price').value      = horse ? fee : (custom ? '' : price);
  line.querySelector('.receipt-horse-price').style.display = horse  ? 'block' : 'none';
  line.querySelector('.receipt-custom-name').style.display = custom ? 'block' : 'none';
  line.querySelector('.receipt-price').readOnly   = !horse && !custom;
  recalcLine(line.querySelector('.receipt-qty'));
};

window.recalcLine = function(input) {
  const line  = input.closest('.receipt-line');
  const price = parseFloat(line.querySelector('.receipt-price').value) || 0;
  const qty   = parseFloat(line.querySelector('.receipt-qty').value)   || 1;
  const total = price * qty;
  line.querySelector('.receipt-line-total').textContent = fmt(total);
  recalcTotal();
};

function recalcTotal() {
  let total = 0;
  document.querySelectorAll('.receipt-line').forEach(line => {
    const price = parseFloat(line.querySelector('.receipt-price').value) || 0;
    const qty   = parseFloat(line.querySelector('.receipt-qty').value)   || 1;
    total += price * qty;
  });
  const half = total / 2;
  document.getElementById('rec-total').textContent      = fmt(total);
  document.getElementById('rec-stable-cut').textContent = fmt(half);
  document.getElementById('rec-worker-cut').textContent = fmt(half);
}

window.clearReceipt = function() {
  document.getElementById('receipt-lines').innerHTML = '';
  document.getElementById('rec-client').value = '';
  document.getElementById('rec-note').value   = '';
  recalcTotal();
};

window.saveReceipt = async function() {
  const lines = [];
  let   total = 0;

  document.querySelectorAll('.receipt-line').forEach(line => {
    const sel    = line.querySelector('.receipt-item-sel');
    const opt    = sel.selectedOptions[0];
    const custom = sel.value === 'custom';
    const horse  = opt?.dataset.horse === '1';
    const name   = custom
      ? (line.querySelector('.receipt-custom-name').value.trim() || 'Własna')
      : (opt?.text?.split(' —')[0] || '—');
    const price  = parseFloat(line.querySelector('.receipt-price').value) || 0;
    const qty    = parseFloat(line.querySelector('.receipt-qty').value)   || 1;
    const sub    = price * qty;
    total += sub;
    lines.push({ name, price, qty, subtotal: sub, horse });
  });

  if (!lines.length) { showToast('⚠ Dodaj przynajmniej jedną pozycję'); return; }

  const half   = total / 2;
  const month  = currentMonth();
  const client = document.getElementById('rec-client').value.trim();
  const note   = document.getElementById('rec-note').value.trim();

  try {
    await addDoc(collection(db, 'receipts'), {
      lines, total, stable: half, workerCut: half,
      client, note, month,
      workerUid:  currentUser.uid,
      workerName: currentProfile?.displayName || currentUser.email,
      createdAt:  serverTimestamp()
    });
    showToast('✓ Rachunek zapisany');
    clearReceipt();
    loadDashboard();
    loadReceiptsHistory();
  } catch(e) { showToast('❌ ' + e.message); }
};

/* =====================================================
   RACHUNKI — historia
   ===================================================== */
window.loadReceiptsHistory = async function() {
  const month = document.getElementById('receipts-filter-month')?.value || currentMonth();
  const tbody = document.getElementById('receipts-history-body');
  try {
    let q = query(collection(db,'receipts'), where('month','==',month), orderBy('createdAt','desc'));
    // Pracownik widzi tylko swoje
    if (ROLE_LEVEL[currentRole] < ROLE_LEVEL['owner']) {
      q = query(collection(db,'receipts'), where('month','==',month), where('workerUid','==',currentUser.uid), orderBy('createdAt','desc'));
    }
    const snap = await getDocs(q);
    if (snap.empty) {
      tbody.innerHTML = '<tr><td colspan="8" class="muted" style="text-align:center;padding:1.5rem">Brak rachunków</td></tr>';
      return;
    }
    tbody.innerHTML = '';
    snap.forEach(d => {
      const r = d.data();
      const canDelete = ROLE_LEVEL[currentRole] >= ROLE_LEVEL['owner'];
      tbody.innerHTML += `
        <tr>
          <td class="muted">${fmtD(r.createdAt)}</td>
          <td>${r.client||'—'}</td>
          <td>${r.workerName||'—'}</td>
          <td style="font-size:0.75rem;color:var(--dust)">${(r.lines||[]).map(l=>`${l.name}×${l.qty}`).join(', ')}</td>
          <td><strong style="color:var(--pale-gold)">${fmt(r.total)}</strong></td>
          <td style="color:var(--amber)">${fmt(r.stable)}</td>
          <td style="color:#6abf7e">${fmt(r.workerCut)}</td>
          <td>${canDelete ? `<button class="btn btn-danger" style="padding:0.2rem 0.4rem;font-size:0.65rem" onclick="deleteReceipt('${d.id}')">Usuń</button>` : ''}</td>
        </tr>`;
    });
  } catch(e) { console.error('Receipts history:', e); }
};

window.deleteReceipt = async function(id) {
  if (!confirm('Usunąć ten rachunek?')) return;
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
  const month = document.getElementById('expenses-filter-month')?.value || currentMonth();
  const tbody = document.getElementById('expenses-body');
  try {
    const snap = await getDocs(
      query(collection(db,'expenses'), where('month','==',month), orderBy('createdAt','desc'))
    );
    if (snap.empty) {
      tbody.innerHTML = '<tr><td colspan="5" class="muted" style="text-align:center;padding:1.5rem">Brak wydatków</td></tr>';
      return;
    }
    tbody.innerHTML = '';
    snap.forEach(d => {
      const e = d.data();
      const canDel = ROLE_LEVEL[currentRole] >= ROLE_LEVEL['owner'];
      tbody.innerHTML += `
        <tr>
          <td class="muted">${fmtD(e.createdAt)}</td>
          <td>${e.who||'—'}</td>
          <td>${e.description||'—'}</td>
          <td><strong style="color:#c94040">${fmt(e.amount)}</strong></td>
          <td>${canDel ? `<button class="btn btn-danger" style="padding:0.2rem 0.4rem;font-size:0.65rem" onclick="deleteExpense('${d.id}')">Usuń</button>` : ''}</td>
        </tr>`;
    });

    // Załaduj listę pracowników do selecta
    if (ROLE_LEVEL[currentRole] >= ROLE_LEVEL['owner']) {
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
  if (!confirm('Usunąć wydatek?')) return;
  try {
    await deleteDoc(doc(db,'expenses',id));
    showToast('✓ Usunięto'); loadExpenses(); loadDashboard(); loadTax();
  } catch(e) { showToast('❌ ' + e.message); }
};

/* =====================================================
   WYPŁATY (PAYROLL) — 50% z rachunków
   ===================================================== */
async function loadPayroll() {
  const lvl = ROLE_LEVEL[currentRole] ?? 0;
  const el  = document.getElementById('payroll-content');
  if (lvl < ROLE_LEVEL['owner']) {
    el.innerHTML = `
      <div class="access-denied">
        <div class="access-denied-icon">🔒</div>
        <div class="access-denied-text">Wypłaty dostępne tylko dla Właściciela</div>
      </div>`;
    return;
  }

  try {
    // Zbierz wszystkich pracowników i ich zakładki per miesiąc
    const usersSnap = await getDocs(collection(db,'users'));
    const users = {};
    usersSnap.forEach(d => { users[d.id] = d.data(); });

    // Wszystkie rachunki
    const rSnap = await getDocs(
      query(collection(db,'receipts'), orderBy('month','desc'), orderBy('createdAt','desc'))
    );

    // Pogrupuj po miesiącach i pracownikach
    const monthMap = {}; // month → { uid → {name, workerCut, paid} }
    rSnap.forEach(d => {
      const r = d.data();
      const m = r.month || '—';
      if (!monthMap[m]) monthMap[m] = {};
      if (!monthMap[m][r.workerUid]) monthMap[m][r.workerUid] = { name: r.workerName||'—', workerCut:0, paid:0 };
      monthMap[m][r.workerUid].workerCut += r.workerCut || 0;
    });

    // Wypłacone
    const pSnap = await getDocs(query(collection(db,'payouts'), orderBy('month','desc')));
    pSnap.forEach(d => {
      const p = d.data();
      if (monthMap[p.month]?.[p.workerUid]) {
        monthMap[p.month][p.workerUid].paid += p.amount || 0;
      }
    });

    const months = Object.keys(monthMap).sort().reverse();
    if (!months.length) {
      el.innerHTML = '<p style="font-family:var(--font-type);color:var(--dust);padding:1rem">Brak danych</p>';
      return;
    }

    let html = '';
    months.forEach(m => {
      const workers = Object.entries(monthMap[m]);
      html += `
        <div class="panel">
          <div class="panel-header">
            <div class="panel-title">💰 Wypłaty — ${m}</div>
          </div>
          <div class="panel-body" style="padding:0">
            <table class="western-table">
              <thead>
                <tr><th>Pracownik</th><th>Zakładka (50%)</th><th>Wypłacono</th><th>Do wypłaty</th><th>Akcja</th></tr>
              </thead>
              <tbody>
                ${workers.map(([uid, w]) => {
                  const remaining = Math.max(0, w.workerCut - w.paid);
                  return `
                    <tr>
                      <td>${w.name}</td>
                      <td style="color:#6abf7e">${fmt(w.workerCut)}</td>
                      <td class="muted">${fmt(w.paid)}</td>
                      <td><strong style="color:var(--pale-gold)">${fmt(remaining)}</strong></td>
                      <td>${remaining > 0 ? `
                        <button class="btn btn-primary" style="padding:0.25rem 0.6rem;font-size:0.65rem"
                          onclick="payWorker('${uid}','${w.name}','${m}',${remaining})">
                          Wypłać ${fmt(remaining)}
                        </button>` : '<span class="badge badge-green">Wypłacono</span>'}
                      </td>
                    </tr>`;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>`;
    });
    el.innerHTML = html;
  } catch(e) { console.error('Payroll:', e); el.innerHTML = '❌ Błąd ładowania'; }
}

window.payWorker = async function(uid, name, month, amount) {
  if (!confirm(`Wypłacić ${fmt(amount)} dla ${name} za ${month}?`)) return;
  try {
    await addDoc(collection(db,'payouts'), {
      workerUid: uid, workerName: name, month, amount,
      paidBy: currentUser.uid, createdAt: serverTimestamp()
    });
    showToast(`✓ Wypłacono ${fmt(amount)} dla ${name}`);
    loadPayroll(); loadDashboard();
  } catch(e) { showToast('❌ ' + e.message); }
};

/* =====================================================
   PODATEK
   ===================================================== */
window.loadTax = async function() {
  const month = document.getElementById('tax-filter-month')?.value || currentMonth();
  try {
    // Przychód
    const rSnap = await getDocs(query(collection(db,'receipts'), where('month','==',month)));
    let income = 0;
    rSnap.forEach(d => { income += d.data().total || 0; });

    // Wydatki
    const eSnap = await getDocs(query(collection(db,'expenses'), where('month','==',month)));
    let expenses = 0;
    eSnap.forEach(d => { expenses += d.data().amount || 0; });

    const net = income - expenses;

    // Stawka podatkowa
    const rateSnap = await getDoc(doc(db,'settings','tax'));
    const rate = rateSnap.exists() ? (rateSnap.data().rate || 0) : 0;
    const taxAmount = net * (rate / 100);

    document.getElementById('tax-income').textContent       = fmt(income);
    document.getElementById('tax-exp').textContent          = fmt(expenses);
    document.getElementById('tax-net').textContent          = fmt(net);
    document.getElementById('tax-rate-display').textContent = rate + '%  (' + fmt(taxAmount) + ')';
    if (document.getElementById('tax-rate-input')) {
      document.getElementById('tax-rate-input').value = rate || '';
    }
  } catch(e) { console.error('Tax:', e); }
};

window.saveTaxRate = async function() {
  const rate = parseFloat(document.getElementById('tax-rate-input').value);
  if (isNaN(rate) || rate < 0 || rate > 100) { showToast('⚠ Podaj prawidłową stawkę (0–100)'); return; }
  try {
    await setDoc(doc(db,'settings','tax'), { rate, updatedAt: serverTimestamp() });
    showToast('✓ Stawka podatkowa zapisana: ' + rate + '%');
    loadTax();
  } catch(e) { showToast('❌ ' + e.message); }
};

/* =====================================================
   MAGAZYN
   ===================================================== */
async function loadWarehouse() {
  try {
    const snap = await getDocs(query(collection(db,'warehouse'), orderBy('name')));
    warehouseCache = [];
    snap.forEach(d => warehouseCache.push({ id: d.id, ...d.data() }));
    renderWarehouse(warehouseCache);
  } catch(e) { console.error('Warehouse:', e); }
}

function renderWarehouse(items) {
  const tbody = document.getElementById('warehouse-body');
  if (!items.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="muted" style="text-align:center;padding:1.5rem">Magazyn jest pusty</td></tr>';
    return;
  }
  tbody.innerHTML = items.map(item => {
    const low = (item.qty ?? 0) <= (item.threshold ?? 5);
    return `
      <tr>
        <td>${item.icon||'📦'} ${item.name}</td>
        <td><strong style="color:${low ? '#c94040' : 'var(--pale-gold)'}">${item.qty ?? 0}</strong>
          ${low ? '<span class="badge badge-red" style="margin-left:0.4rem">Niski</span>' : ''}
        </td>
        <td class="muted">${item.unit||'szt.'}</td>
        <td class="muted">${item.threshold ?? 5}</td>
        <td style="display:flex;gap:0.4rem;flex-wrap:wrap">
          <button class="btn btn-primary" style="padding:0.2rem 0.5rem;font-size:0.65rem"
            onclick="openMovePanel('${item.id}','${item.name}')">± Ruch</button>
          <button class="btn btn-ghost" style="padding:0.2rem 0.5rem;font-size:0.65rem"
            onclick="openEditItem('${item.id}')">Edytuj</button>
          ${ROLE_LEVEL[currentRole] >= ROLE_LEVEL['owner']
            ? `<button class="btn btn-danger" style="padding:0.2rem 0.5rem;font-size:0.65rem"
                onclick="deleteItem('${item.id}')">Usuń</button>` : ''}
        </td>
      </tr>`;
  }).join('');
}

window.filterWarehouse = function(q) {
  renderWarehouse(warehouseCache.filter(i => i.name.toLowerCase().includes(q.toLowerCase())));
};

/* Modal — nowa pozycja */
window.showAddItemModal = function() {
  editingItemId = null;
  document.getElementById('warehouse-modal-title').textContent = 'Nowa pozycja';
  ['wh-name','wh-icon','wh-unit'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('wh-qty').value       = 0;
  document.getElementById('wh-threshold').value = 5;
  document.getElementById('warehouse-modal').classList.remove('hidden');
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
    showToast('✓ Zapisano');
    closeItemModal(); loadWarehouse();
  } catch(e) { showToast('❌ ' + e.message); }
};

window.deleteItem = async function(id) {
  if (!confirm('Usunąć pozycję?')) return;
  try {
    await deleteDoc(doc(db,'warehouse',id));
    showToast('✓ Usunięto'); loadWarehouse();
  } catch(e) { showToast('❌ ' + e.message); }
};

/* Panel ruchów */
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
  if (!qty || qty <= 0) { showToast('⚠ Podaj ilość'); return; }

  const item = warehouseCache.find(i => i.id === movingItemId);
  if (!item) return;

  let newQty = item.qty ?? 0;
  if      (type === 'przyjecie') newQty += qty;
  else if (type === 'wydanie')   newQty  = Math.max(0, newQty - qty);
  else                           newQty  = qty;

  try {
    await updateDoc(doc(db,'warehouse',movingItemId), { qty: newQty });
    await addDoc(collection(db,'moves'), {
      itemId: movingItemId, itemName: item.name,
      type, qty, newQty, note,
      userName: currentProfile?.displayName || currentUser.email,
      userUid:  currentUser.uid,
      createdAt: serverTimestamp()
    });
    showToast('✓ Ruch zapisany');
    closeMovePanel(); loadWarehouse();
  } catch(e) { showToast('❌ ' + e.message); }
};

/* =====================================================
   KONTA
   ===================================================== */
async function loadAccounts() {
  const el  = document.getElementById('accounts-content');
  const lvl = ROLE_LEVEL[currentRole] ?? 0;
  if (lvl < ROLE_LEVEL['owner']) {
    el.innerHTML = `
      <div class="access-denied">
        <div class="access-denied-icon">🔒</div>
        <div class="access-denied-text">Tylko właściciel zarządza kontami</div>
      </div>`;
    return;
  }
  try {
    const snap = await getDocs(collection(db,'users'));
    let rows = '';
    snap.forEach(d => {
      const u = d.data();
      rows += `
        <tr>
          <td>${u.displayName||'—'}</td>
          <td>${u.email||'—'}</td>
          <td>${roleBadge(u.role)}</td>
          <td>
            <select class="form-select" style="padding:0.2rem 0.5rem;font-size:0.7rem;width:auto"
              onchange="changeRole('${d.id}',this.value)">
              <option value="viewer" ${u.role==='viewer'?'selected':''}>Obserwator</option>
              <option value="worker" ${u.role==='worker'?'selected':''}>Pracownik</option>
              <option value="owner"  ${u.role==='owner' ?'selected':''}>Właściciel</option>
            </select>
          </td>
        </tr>`;
    });
    el.innerHTML = `
      <div class="panel">
        <div class="panel-header"><div class="panel-title">🔑 Lista Kont</div></div>
        <div class="panel-body" style="padding:0">
          <table class="western-table">
            <thead><tr><th>Imię</th><th>E-mail</th><th>Rola</th><th>Zmień rolę</th></tr></thead>
            <tbody>${rows || '<tr><td colspan="4" class="muted" style="text-align:center;padding:1.5rem">Brak kont</td></tr>'}</tbody>
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

/* =====================================================
   HELPERS
   ===================================================== */
function roleBadge(role) {
  return {
    viewer: '<span class="badge badge-gray">Obserwator</span>',
    worker: '<span class="badge badge-amber">Pracownik</span>',
    owner:  '<span class="badge badge-red">Właściciel</span>',
  }[role] || '<span class="badge badge-gray">—</span>';
}

window.showToast = function(msg) {
  const c = document.getElementById('toast-container');
  const t = document.createElement('div');
  t.className = 'toast'; t.textContent = msg;
  c.appendChild(t);
  setTimeout(() => t.remove(), 3100);
};

/* Enter na logowaniu */
document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !document.getElementById('login-screen').classList.contains('hidden')) doLogin();
});
