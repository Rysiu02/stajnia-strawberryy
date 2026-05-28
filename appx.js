<!DOCTYPE html>
<html lang="pl">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Stajnia Strawberry — Panel</title>
  <link rel="preconnect" href="https://fonts.googleapis.com"/>
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
  <link href="https://fonts.googleapis.com/css2?family=Cinzel+Decorative:wght@400;700;900&family=Cinzel:wght@400;600;700&family=IM+Fell+English:ital@0;1&family=Special+Elite&display=swap" rel="stylesheet"/>
  <link rel="stylesheet" href="style.css"/>
</head>
<body>

<div id="toast-container"></div>

<!-- LOADING -->
<div id="loading-overlay">
  <div class="loading-seal">🐎</div>
  <div class="loading-text">Siodłamy konie...</div>
</div>

<!-- LOGIN -->
<div id="login-screen" class="hidden">
  <div class="login-box">
    <div class="login-seal">🤠</div>
    <div class="login-title">Stajnia Strawberry</div>
    <div class="login-sub">System Zarządzania · A.D. 1899</div>
    <div class="login-divider">✦ zaloguj się ✦</div>
    <div id="login-form">
      <input class="login-input" type="email"    id="login-email" placeholder="Adres e-mail..." autocomplete="email"/>
      <input class="login-input" type="password" id="login-pass"  placeholder="Hasło dostępu..." autocomplete="current-password"/>
      <div id="login-error" class="login-error" style="display:none"></div>
      <button class="login-submit" id="login-btn" onclick="doLogin()">Wejdź do Stajni</button>
    </div>
    <div class="login-footer">Nie masz konta? Skontaktuj się z właścicielem.</div>
  </div>
</div>

<!-- APP -->
<div id="app" class="hidden">

  <!-- HEADER -->
  <header>
    <div class="header-brand">
      <div class="brand-icon">🐎</div>
      <div class="brand-text">
        <div class="brand-name">Stajnia Strawberry</div>
        <div class="brand-tagline">Zarządzanie · Rachunki · Rozliczenia</div>
      </div>
    </div>
    <div class="header-ornament">— ✦ —</div>
    <div class="header-right">
      <div class="user-badge" id="user-badge">
        <div class="user-role-dot"></div>
        <span id="user-name-display">—</span>
      </div>
      <button class="logout-btn" onclick="doLogout()">Opuść stajnię</button>
    </div>
  </header>

  <!-- SIDEBAR -->
  <nav id="sidebar">
    <div class="nav-section-label">Przegląd</div>
    <div class="nav-item active" onclick="goTo('dashboard',this)">
      <span class="nav-icon">📋</span> Tablica
    </div>

    <div class="nav-divider"></div>
    <div class="nav-section-label">Sprzedaż</div>

    <div class="nav-item" onclick="goTo('receipts',this)">
      <span class="nav-icon">🧾</span> Rachunki
    </div>
    <div class="nav-item" onclick="goTo('pricelist',this)">
      <span class="nav-icon">💲</span> Cennik
    </div>

    <div class="nav-divider"></div>
    <div class="nav-section-label">Finanse</div>

    <div class="nav-item" onclick="goTo('payroll',this)" data-min-role="owner">
      <span class="nav-icon">💰</span> Wypłaty
    </div>
    <div class="nav-item" onclick="goTo('expenses',this)" data-min-role="owner">
      <span class="nav-icon">📤</span> Wydatki
    </div>
    <div class="nav-item" onclick="goTo('tax',this)" data-min-role="owner">
      <span class="nav-icon">📑</span> Podatek
    </div>

    <div class="nav-divider"></div>
    <div class="nav-section-label">Magazyn</div>

    <div class="nav-item" onclick="goTo('warehouse',this)">
      <span class="nav-icon">🏚️</span> Magazyn
    </div>

    <div class="nav-divider"></div>
    <div class="nav-section-label">Admin</div>

    <div class="nav-item" onclick="goTo('accounts',this)" data-min-role="owner">
      <span class="nav-icon">🔑</span> Konta
    </div>

    <div class="nav-wanted">
      <div class="nav-wanted-title">⚠ Rola</div>
      <div class="nav-wanted-text" id="sidebar-role-info">—</div>
    </div>
  </nav>

  <!-- MAIN -->
  <main>

    <!-- ===== DASHBOARD ===== -->
    <section class="page-section active" id="section-dashboard">
      <div class="page-header">
        <div>
          <div class="page-title">Tablica Główna</div>
          <div class="page-subtitle" id="dashboard-greeting">Dzień dobry, szeryf</div>
        </div>
        <div class="page-date" id="current-date"></div>
      </div>

      <div class="cards-grid">
        <div class="stat-card">
          <div class="stat-card-icon">🧾</div>
          <div class="stat-card-label">Sprzedaż dziś</div>
          <div class="stat-card-value" id="stat-today">—</div>
          <div class="stat-card-change">łączna kwota rachunków</div>
        </div>
        <div class="stat-card">
          <div class="stat-card-icon">🏦</div>
          <div class="stat-card-label">Zakładka stajni</div>
          <div class="stat-card-value" id="stat-stable">—</div>
          <div class="stat-card-change pos">50% ze sprzedaży</div>
        </div>
        <div class="stat-card">
          <div class="stat-card-icon">👷</div>
          <div class="stat-card-label">Zakładka pracowników</div>
          <div class="stat-card-value" id="stat-workers-tab">—</div>
          <div class="stat-card-change pos">50% ze sprzedaży</div>
        </div>
        <div class="stat-card">
          <div class="stat-card-icon">📤</div>
          <div class="stat-card-label">Wydatki (miesiąc)</div>
          <div class="stat-card-value" id="stat-expenses">—</div>
          <div class="stat-card-change neg">zatwierdzone przez właściciela</div>
        </div>
      </div>

      <!-- Zakładki pracowników -->
      <div class="panel" id="workers-tabs-panel">
        <div class="panel-header">
          <div class="panel-title">💼 Zakładki Pracowników — bieżący miesiąc</div>
          <span style="font-family:var(--font-type);font-size:0.7rem;color:var(--dust)" id="current-month-label"></span>
        </div>
        <div class="panel-body" style="padding:0">
          <table class="western-table">
            <thead>
              <tr><th>Pracownik</th><th>Sprzedaż</th><th>Zakładka (50%)</th><th>Wypłacono</th><th>Do wypłaty</th></tr>
            </thead>
            <tbody id="workers-tabs-body">
              <tr><td colspan="5" class="muted" style="text-align:center;padding:1.5rem">Ładowanie...</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Ostatnie rachunki -->
      <div class="panel">
        <div class="panel-header">
          <div class="panel-title">🧾 Ostatnie Rachunki</div>
        </div>
        <div class="panel-body" style="padding:0">
          <table class="western-table">
            <thead>
              <tr><th>Data</th><th>Pracownik</th><th>Pozycje</th><th>Kwota</th><th>Stajnia</th><th>Pracownik</th></tr>
            </thead>
            <tbody id="dashboard-receipts">
              <tr><td colspan="6" class="muted" style="text-align:center;padding:1.5rem">Ładowanie...</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>

    <!-- ===== RACHUNKI ===== -->
    <section class="page-section" id="section-receipts">
      <div class="page-header">
        <div>
          <div class="page-title">Rachunki</div>
          <div class="page-subtitle">Sprzedaż usług i produktów</div>
        </div>
      </div>

      <!-- Nowy rachunek -->
      <div class="panel">
        <div class="panel-header">
          <div class="panel-title">+ Nowy Rachunek</div>
        </div>
        <div class="panel-body">
          <div class="form-grid form-grid-2" style="margin-bottom:1rem">
            <div class="form-group">
              <label>Klient (opcjonalnie)</label>
              <input class="form-input" id="rec-client" type="text" placeholder="Imię klienta..."/>
            </div>
            <div class="form-group">
              <label>Uwagi</label>
              <input class="form-input" id="rec-note" type="text" placeholder="Opcjonalne..."/>
            </div>
          </div>

          <!-- Pozycje rachunku -->
          <div class="panel" style="margin-bottom:1rem;border-color:rgba(196,122,43,0.15)">
            <div class="panel-header" style="padding:0.6rem 1rem">
              <div class="panel-title" style="font-size:0.75rem">Pozycje rachunku</div>
              <button class="btn btn-ghost" style="padding:0.25rem 0.6rem;font-size:0.65rem" onclick="addReceiptLine()">+ Dodaj pozycję</button>
            </div>
            <div class="panel-body" style="padding:0.75rem">
              <div id="receipt-lines"></div>
              <!-- Szablon linii (klonowany przez JS) -->
              <template id="receipt-line-tpl">
                <div class="receipt-line">
                  <select class="form-select receipt-item-sel" onchange="onReceiptItemChange(this)">
                    <option value="">— wybierz —</option>
                    <optgroup label="Usługi">
                      <option value="trening"        data-price="15">Trening — 15$</option>
                      <option value="szczotka"       data-price="7">Szczotka — 7$</option>
                      <option value="kopystka"       data-price="17">Kopystka — 17$</option>
                      <option value="ozwiezwiacz"    data-price="31">Oźwieżwiacz dla konia — 31$</option>
                      <option value="masc"           data-price="21">Maść dla konia — 21$</option>
                    </optgroup>
                    <optgroup label="Produkty">
                      <option value="siano"          data-price="2">Siano — 2$</option>
                      <option value="marchewka"      data-price="2">Marchewka — 2$</option>
                      <option value="cukier"         data-price="1.5">Cukier — 1,5$</option>
                    </optgroup>
                    <optgroup label="Sprzedaż konia">
                      <option value="kon_ponizej300" data-price="0" data-horse="1" data-fee="25">Koń poniżej 300$ (+25$ rachunek)</option>
                      <option value="kon_400_700"    data-price="0" data-horse="1" data-fee="30">Koń 400$–700$ (+30$ rachunek)</option>
                      <option value="kon_powyzej700" data-price="0" data-horse="1" data-fee="40">Koń powyżej 700$ (+40$ rachunek)</option>
                    </optgroup>
                    <option value="custom">Własna pozycja...</option>
                  </select>
                  <input class="form-input receipt-custom-name" type="text" placeholder="Nazwa..." style="display:none"/>
                  <input class="form-input receipt-horse-price" type="number" placeholder="Cena konia $" style="display:none" oninput="recalcLine(this)"/>
                  <input class="form-input receipt-price" type="number" placeholder="Cena $" step="0.5" min="0" oninput="recalcLine(this)"/>
                  <input class="form-input receipt-qty"   type="number" placeholder="Ilość" min="1" value="1" oninput="recalcLine(this)"/>
                  <div class="receipt-line-total">0,00 $</div>
                  <button class="btn btn-danger" style="padding:0.25rem 0.5rem;font-size:0.8rem" onclick="removeReceiptLine(this)">✕</button>
                </div>
              </template>
            </div>
          </div>

          <!-- Podsumowanie -->
          <div class="receipt-summary">
            <div class="receipt-summary-row">
              <span>Suma rachunku:</span>
              <strong id="rec-total">0,00 $</strong>
            </div>
            <div class="receipt-summary-row">
              <span>Zakładka stajni (50%):</span>
              <span id="rec-stable-cut" style="color:var(--amber)">0,00 $</span>
            </div>
            <div class="receipt-summary-row">
              <span>Zakładka pracownika (50%):</span>
              <span id="rec-worker-cut" style="color:#6abf7e">0,00 $</span>
            </div>
          </div>

          <div style="margin-top:1rem;display:flex;gap:0.75rem">
            <button class="btn btn-primary" onclick="saveReceipt()">💾 Zapisz rachunek</button>
            <button class="btn btn-ghost"   onclick="clearReceipt()">Wyczyść</button>
          </div>
        </div>
      </div>

      <!-- Historia rachunków -->
      <div class="panel">
        <div class="panel-header">
          <div class="panel-title">📋 Historia Rachunków</div>
          <div style="display:flex;gap:0.5rem;align-items:center">
            <input class="form-input" id="receipts-filter-month" type="month"
              style="padding:0.3rem 0.6rem;font-size:0.75rem;width:160px"
              onchange="loadReceiptsHistory()"/>
          </div>
        </div>
        <div class="panel-body" style="padding:0">
          <table class="western-table">
            <thead>
              <tr><th>Data</th><th>Klient</th><th>Pracownik</th><th>Pozycje</th><th>Kwota</th><th>Stajnia</th><th>Pracownik</th><th></th></tr>
            </thead>
            <tbody id="receipts-history-body">
              <tr><td colspan="8" class="muted" style="text-align:center;padding:1.5rem">Ładowanie...</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>

    <!-- ===== CENNIK ===== -->
    <section class="page-section" id="section-pricelist">
      <div class="page-header">
        <div>
          <div class="page-title">Cennik</div>
          <div class="page-subtitle">Usługi · Produkty · Sprzedaż koni</div>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:1.25rem">

        <div class="panel">
          <div class="panel-header"><div class="panel-title">🐴 Usługi</div></div>
          <div class="panel-body" style="padding:0">
            <table class="western-table">
              <thead><tr><th>Usługa</th><th>Cena</th></tr></thead>
              <tbody>
                <tr><td>Trening</td><td><strong style="color:var(--pale-gold)">15 $</strong></td></tr>
                <tr><td>Szczotka</td><td><strong style="color:var(--pale-gold)">7 $</strong></td></tr>
                <tr><td>Kopystka</td><td><strong style="color:var(--pale-gold)">17 $</strong></td></tr>
                <tr><td>Oźwieżwiacz dla konia</td><td><strong style="color:var(--pale-gold)">31 $</strong></td></tr>
                <tr><td>Maść dla konia</td><td><strong style="color:var(--pale-gold)">21 $</strong></td></tr>
              </tbody>
            </table>
          </div>
        </div>

        <div class="panel">
          <div class="panel-header"><div class="panel-title">🌾 Produkty</div></div>
          <div class="panel-body" style="padding:0">
            <table class="western-table">
              <thead><tr><th>Produkt</th><th>Cena</th></tr></thead>
              <tbody>
                <tr><td>Siano</td><td><strong style="color:var(--pale-gold)">2 $</strong></td></tr>
                <tr><td>Marchewka</td><td><strong style="color:var(--pale-gold)">2 $</strong></td></tr>
                <tr><td>Cukier</td><td><strong style="color:var(--pale-gold)">1,5 $</strong></td></tr>
              </tbody>
            </table>
          </div>
        </div>

        <div class="panel" style="grid-column:1/-1">
          <div class="panel-header"><div class="panel-title">🐎 Sprzedaż Koni — Prowizja</div></div>
          <div class="panel-body" style="padding:0">
            <table class="western-table">
              <thead><tr><th>Przedział cenowy konia</th><th>Prowizja na rachunek</th><th>Podział</th></tr></thead>
              <tbody>
                <tr>
                  <td>Poniżej 300 $</td>
                  <td><strong style="color:var(--pale-gold)">+ 25 $</strong></td>
                  <td class="muted">12,50 $ stajnia / 12,50 $ pracownik</td>
                </tr>
                <tr>
                  <td>400 $ — 700 $</td>
                  <td><strong style="color:var(--pale-gold)">+ 30 $</strong></td>
                  <td class="muted">15 $ stajnia / 15 $ pracownik</td>
                </tr>
                <tr>
                  <td>Powyżej 700 $</td>
                  <td><strong style="color:var(--pale-gold)">+ 40 $</strong></td>
                  <td class="muted">20 $ stajnia / 20 $ pracownik</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="panel-body" style="border-top:1px solid rgba(196,122,43,0.15)">
            <p style="font-family:var(--font-type);font-size:0.8rem;color:var(--dust);line-height:1.6">
              ⚖ Każdy rachunek dzielony jest <strong style="color:var(--amber)">50% / 50%</strong> — 
              połowa trafia na zakładkę stajni, połowa na zakładkę pracownika który wystawił rachunek.
              Wypłata pracownika = suma jego zakładek za dany okres.
            </p>
          </div>
        </div>

      </div>
    </section>

    <!-- ===== WYPŁATY ===== -->
    <section class="page-section" id="section-payroll">
      <div class="page-header">
        <div>
          <div class="page-title">Wypłaty</div>
          <div class="page-subtitle">Zakładki pracowników · Rozliczenia miesięczne</div>
        </div>
      </div>
      <div id="payroll-content">
        <div style="font-family:var(--font-type);color:var(--dust);padding:1rem">Ładowanie...</div>
      </div>
    </section>

    <!-- ===== WYDATKI ===== -->
    <section class="page-section" id="section-expenses">
      <div class="page-header">
        <div>
          <div class="page-title">Wydatki</div>
          <div class="page-subtitle">Na co wyciągnięto pieniądze ze stajni</div>
        </div>
      </div>

      <!-- Dodaj wydatek — tylko właściciel -->
      <div class="panel" id="add-expense-panel" style="display:none">
        <div class="panel-header"><div class="panel-title">+ Dodaj Wydatek</div></div>
        <div class="panel-body">
          <div class="form-grid form-grid-2">
            <div class="form-group">
              <label>Kto wyciągnął</label>
              <select class="form-select" id="exp-who"></select>
            </div>
            <div class="form-group">
              <label>Kwota ($)</label>
              <input class="form-input" id="exp-amount" type="number" min="0" step="0.5" placeholder="0"/>
            </div>
            <div class="form-group" style="grid-column:1/-1">
              <label>Na co przeznaczono</label>
              <input class="form-input" id="exp-desc" type="text" placeholder="Opis wydatku..."/>
            </div>
          </div>
          <div style="margin-top:1rem;display:flex;gap:0.75rem">
            <button class="btn btn-primary" onclick="saveExpense()">Zapisz wydatek</button>
          </div>
        </div>
      </div>

      <!-- Lista wydatków -->
      <div class="panel">
        <div class="panel-header">
          <div class="panel-title">📤 Historia Wydatków</div>
          <input class="form-input" id="expenses-filter-month" type="month"
            style="padding:0.3rem 0.6rem;font-size:0.75rem;width:160px"
            onchange="loadExpenses()"/>
        </div>
        <div class="panel-body" style="padding:0">
          <table class="western-table">
            <thead>
              <tr><th>Data</th><th>Kto</th><th>Na co</th><th>Kwota</th><th></th></tr>
            </thead>
            <tbody id="expenses-body">
              <tr><td colspan="5" class="muted" style="text-align:center;padding:1.5rem">Ładowanie...</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>

    <!-- ===== PODATEK ===== -->
    <section class="page-section" id="section-tax">
      <div class="page-header">
        <div>
          <div class="page-title">Podatek</div>
          <div class="page-subtitle">Zestawienie do rozliczeń podatkowych</div>
        </div>
      </div>

      <div class="panel">
        <div class="panel-header">
          <div class="panel-title">📑 Miesięczne Zestawienie</div>
          <input class="form-input" id="tax-filter-month" type="month"
            style="padding:0.3rem 0.6rem;font-size:0.75rem;width:160px"
            onchange="loadTax()"/>
        </div>
        <div class="panel-body">
          <div class="cards-grid" id="tax-cards" style="margin-bottom:1.5rem">
            <div class="stat-card">
              <div class="stat-card-icon">💵</div>
              <div class="stat-card-label">Przychód brutto</div>
              <div class="stat-card-value" id="tax-income">—</div>
            </div>
            <div class="stat-card">
              <div class="stat-card-icon">📤</div>
              <div class="stat-card-label">Wydatki</div>
              <div class="stat-card-value" id="tax-exp">—</div>
            </div>
            <div class="stat-card">
              <div class="stat-card-icon">💰</div>
              <div class="stat-card-label">Dochód netto</div>
              <div class="stat-card-value" id="tax-net">—</div>
            </div>
            <div class="stat-card">
              <div class="stat-card-icon">📑</div>
              <div class="stat-card-label">Podatek (%)</div>
              <div class="stat-card-value" id="tax-rate-display">—</div>
            </div>
          </div>

          <!-- Ustaw stawkę podatkową -->
          <div style="display:flex;gap:0.75rem;align-items:flex-end;flex-wrap:wrap">
            <div class="form-group">
              <label>Stawka podatkowa (%)</label>
              <input class="form-input" id="tax-rate-input" type="number" min="0" max="100" step="0.5"
                placeholder="np. 19" style="width:150px"/>
            </div>
            <button class="btn btn-primary" onclick="saveTaxRate()">Ustaw stawkę</button>
          </div>

          <div style="margin-top:1.5rem;padding:1rem;border:1px solid rgba(196,122,43,0.2);background:rgba(196,122,43,0.05)">
            <p style="font-family:var(--font-type);font-size:0.78rem;color:var(--dust);line-height:1.8">
              ⚠ Stawka podatkowa zostanie ustalona przez właściciela po konsultacji z księgowym.<br>
              Powyższe zestawienie służy jako podgląd do celów rozliczeniowych.
            </p>
          </div>
        </div>
      </div>
    </section>

    <!-- ===== MAGAZYN ===== -->
    <section class="page-section" id="section-warehouse">
      <div class="page-header">
        <div>
          <div class="page-title">Magazyn</div>
          <div class="page-subtitle">Stany · Przyjęcia · Wydania</div>
        </div>
        <button class="btn btn-primary" onclick="showAddItemModal()">+ Nowa pozycja</button>
      </div>

      <div class="panel">
        <div class="panel-header">
          <div class="panel-title">🏚️ Stany Bieżące</div>
          <input class="form-input" id="warehouse-search"
            style="width:200px;padding:0.35rem 0.7rem;font-size:0.75rem"
            placeholder="Szukaj..." oninput="filterWarehouse(this.value)"/>
        </div>
        <div class="panel-body" style="padding:0">
          <table class="western-table" id="warehouse-table">
            <thead>
              <tr><th>Pozycja</th><th>Stan</th><th>Jednostka</th><th>Próg alertu</th><th>Akcje</th></tr>
            </thead>
            <tbody id="warehouse-body">
              <tr><td colspan="5" class="muted" style="text-align:center;padding:1.5rem">Ładowanie...</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Modal dodawania/edycji pozycji -->
      <div id="warehouse-modal" class="modal-overlay hidden">
        <div class="modal-box">
          <div class="modal-header">
            <div class="panel-title" id="warehouse-modal-title">Nowa pozycja</div>
            <button class="btn btn-ghost" style="padding:0.2rem 0.5rem" onclick="closeItemModal()">✕</button>
          </div>
          <div class="modal-body">
            <div class="form-grid">
              <div class="form-group">
                <label>Nazwa</label>
                <input class="form-input" id="wh-name" type="text" placeholder="np. Pasza"/>
              </div>
              <div class="form-group">
                <label>Ikona (emoji)</label>
                <input class="form-input" id="wh-icon" type="text" placeholder="🌾" maxlength="4"/>
              </div>
              <div class="form-grid form-grid-2">
                <div class="form-group">
                  <label>Ilość początkowa</label>
                  <input class="form-input" id="wh-qty" type="number" min="0" placeholder="0"/>
                </div>
                <div class="form-group">
                  <label>Jednostka</label>
                  <input class="form-input" id="wh-unit" type="text" placeholder="kg / szt. / l"/>
                </div>
              </div>
              <div class="form-group">
                <label>Próg alertu (niski stan)</label>
                <input class="form-input" id="wh-threshold" type="number" min="0" placeholder="5"/>
              </div>
            </div>
            <div style="margin-top:1rem;display:flex;gap:0.75rem">
              <button class="btn btn-primary" onclick="saveWarehouseItem()">Zapisz</button>
              <button class="btn btn-ghost"   onclick="closeItemModal()">Anuluj</button>
            </div>
          </div>
        </div>
      </div>

      <!-- Panel ruchów -->
      <div class="panel" id="move-panel" style="display:none">
        <div class="panel-header">
          <div class="panel-title" id="move-panel-title">Ruch magazynowy</div>
          <button class="btn btn-ghost" style="padding:0.2rem 0.5rem" onclick="closeMovePanel()">✕</button>
        </div>
        <div class="panel-body">
          <div class="form-grid form-grid-2">
            <div class="form-group">
              <label>Typ</label>
              <select class="form-select" id="move-type">
                <option value="przyjecie">Przyjęcie</option>
                <option value="wydanie">Wydanie</option>
                <option value="korekta">Korekta stanu</option>
              </select>
            </div>
            <div class="form-group">
              <label>Ilość</label>
              <input class="form-input" id="move-qty" type="number" min="1" placeholder="0"/>
            </div>
            <div class="form-group" style="grid-column:1/-1">
              <label>Uwagi</label>
              <input class="form-input" id="move-note" type="text" placeholder="Opcjonalne..."/>
            </div>
          </div>
          <div style="margin-top:1rem;display:flex;gap:0.75rem">
            <button class="btn btn-primary" onclick="saveMove()">Zapisz ruch</button>
            <button class="btn btn-ghost"   onclick="closeMovePanel()">Anuluj</button>
          </div>
        </div>
      </div>
    </section>

    <!-- ===== KONTA ===== -->
    <section class="page-section" id="section-accounts">
      <div class="page-header">
        <div>
          <div class="page-title">Konta Dostępowe</div>
          <div class="page-subtitle">Zarządzanie użytkownikami</div>
        </div>
      </div>
      <div id="accounts-content">
        <div style="font-family:var(--font-type);color:var(--dust);padding:1rem">Ładowanie...</div>
      </div>
    </section>

  </main>
</div>

<script type="module" src="app.js"></script>
</body>
</html>
