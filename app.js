/**********************************************************
 * ARK VORD 8.0 Full (Fixed & Verified)
 **********************************************************/

const SUPABASE_URL = "https://cumebdvojadpxaxdmabb.supabase.co";
const SUPABASE_KEY = "sb_publishable_uTgHvSCKusJCK8aSfejzbw_Oxket8q2";
let sb;

try {
   sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
   console.log("Supabase initialized successfully.");
} catch(e) { 
   console.error("Supabase init failed:", e); 
}

const fmt = (n) => {
  const v = Number(n || 0);
  return v.toLocaleString(undefined, { style: "currency", currency: "USD" });
};

const Ark = {
  user: null,
  role: "Viewer", 
  activeTab: "ledger",
  accounts: [],
  activeAccountId: null,
  tx: [],
  pantry: [],
  invoices: [],
  subscription: null,
  composeMode: null,

  // --- 1. SESSION ---
  async checkSession(showErrors = false) {
    try {
      const { data, error } = await sb.auth.getSession();
      if (error) throw error;
      if (data?.session?.user) {
        this.user = data.session.user;
        await this.initApp();
        return true;
      }
      return false;
    } catch (e) {
      if (showErrors) this.showLoginError(e?.message || "Unable to restore session.");
      return false;
    }
  },

  async login() {
    this.hideLoginError();
    const email = (document.getElementById("login-email").value || "").trim();
    const pass = document.getElementById("login-pass").value || "";
    
    if (!email || !pass) return this.showLoginError("Enter email and password.");
    
    const { data, error } = await sb.auth.signInWithPassword({ email, password: pass });
    
    if (error) return this.showLoginError(error.message || "Sign-in failed.");
    
    this.user = data.user;
    await this.initApp();
  },

  async logout() {
    await sb.auth.signOut();
    window.location.reload();
  },

  // --- 2. INIT ---
  async initApp() {
    document.getElementById("gate").style.display = "none";
    document.getElementById("app").style.display = "grid";

    const setText = (id, text) => {
      const el = document.getElementById(id);
      if(el) el.textContent = text;
    };

    const email = this.user?.email || "User";
    const uid = this.user?.id || "—";
    const created = this.user?.created_at ? new Date(this.user.created_at).toLocaleDateString() : "—";
    
    setText("mini-who", email);
    setText("prof-email", email);
    setText("prof-uid", uid);
    setText("prof-date", created);
    
    if(document.getElementById("ui-clientid")) {
        document.getElementById("ui-clientid").textContent = uid.slice(0, 12);
    }

    await this.loadRole();
    await this.loadAccounts();

    if (!this.accounts.length) {
      await this.createDefaultAccountsIfNone();
      await this.loadAccounts();
    }
    
    this.switchTab("ledger", document.querySelector(".nav-item"));
    await this.refreshAll();
  },

  // --- 3. ROLES ---
  async loadRole() {
    // Check if user is admin
    const { data: profile } = await sb.from('profiles').select('is_admin').eq('id', this.user.id).maybeSingle();
    
    const isAdmin = profile?.is_admin === true;
    this.role = isAdmin ? "Administrator" : "Viewer";

    // Update Badge
    const badge = document.getElementById("role-display");
    if(badge) {
      const color = isAdmin ? "var(--accent-gold)" : "var(--accent-ice)";
      const icon = isAdmin ? "fa-shield-halved" : "fa-eye";
      badge.innerHTML = `<i class="fa-solid ${icon}"></i><span>${String(this.role)}</span>`;
      badge.style.background = color;
    }

    // Hide Buttons for Non-Admins
    if (!isAdmin) {
      document.querySelectorAll(".btn-elite").forEach(el => el.style.display = 'none');
      const adminLink = document.querySelector('a[href="admin.html"]');
      if(adminLink) adminLink.style.display = 'none';
    }
  },

  // --- 4. DATA ---
  async loadAccounts() {
    const { data, error } = await sb.from("accounts").select("*").order("created_at", { ascending: true });
    
    if (error) { 
        console.error("Error loading accounts:", error); 
        this.accounts = [];
        return; 
    }
    
    this.accounts = (data || []).map(a => {
      const numSuffix = a.id.replace(/\D/g, '').slice(0,4).padEnd(4, '0'); 
      const accNum = `**** ${numSuffix}`;
      
      let subType = a.category || "Standard";
      // Visual Flair for Shared Accounts
      if (this.user && a.user_id !== this.user.id) {
        subType = "Shared / Loan View";
      }

      return { 
        ...a, 
        balance: 0, 
        displayNum: accNum, 
        displaySub: subType 
      };
    });
  },

  async createDefaultAccountsIfNone() {
    if (this.role !== "Administrator") return; // Viewers can't create
    if (this.accounts.length) return;
    
    const payload = [
      { user_id: this.user.id, name: "Primary Checking", category: "Personal" },
      { user_id: this.user.id, name: "Business Ops", category: "Business" }
    ];
    await sb.from("accounts").insert(payload);
  },

  paintAccountPickers() {
    const mk = (a) => `<option value="${a.id}">${String(a.name).replace(/[&<>"']/g, '')} • ${a.displaySub}</option>`;
    const from = document.getElementById("x-from");
    const to = document.getElementById("x-to");
    if(from) from.innerHTML = this.accounts.map(mk).join("");
    if(to) to.innerHTML = this.accounts.map(mk).join("");
  },

  switchTab(tabId, el) {
    this.activeTab = tabId;
    document.querySelectorAll('main > section').forEach(s => s.style.display = 'none');
    const view = document.getElementById('view-' + tabId);
    if (view) view.style.display = 'block';

    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    if (el) el.classList.add('active');
  },

  async refreshAll() {
    await this.calculateAllBalances();
    this.renderAccountGrid();
    if(this.activeTab === 'pantry') await this.refreshPantry();
    if(this.activeTab === 'invoices') await this.refreshInvoices();
    if(this.activeTab === 'settings') await this.refreshSubscriptions();
    this.renderAll();
  },

  async calculateAllBalances() {
    if(!this.user?.id) return;
    
    const { data, error } = await sb.from("transactions").select("account_id, amount, status");
    if(error) { console.error("Balance Error:", error); return; }
    
    this.accounts.forEach(a => a.balance = 0);
    
    (data || []).forEach(t => {
      const amt = Number(t.amount);
      if(Number.isFinite(amt)) {
        const isPosted = (t.status || "POSTED").toUpperCase() === "POSTED";
        const isPendNeg = (t.status || "").toUpperCase() === "PENDING" && amt < 0;
        if(isPosted || isPendNeg) {
           const acc = this.accounts.find(a => a.id === t.account_id);
           if(acc) acc.balance += amt;
        }
      }
    });
  },

  renderAll() {
    this.renderAccountGrid();
    this.renderPantry();
    this.renderInvoices();
    this.renderSubscriptions();
  },

  renderAccountGrid() {
    const grid = document.getElementById("accounts-grid");
    if(!grid) return;
    grid.innerHTML = "";
    
    if(!this.accounts.length) {
        grid.innerHTML = `<div class="muted" style="grid-column:1/-1; padding:20px; text-align:center;">
            No accounts found.
        </div>`;
        return;
    }

    this.accounts.forEach(acc => {
      grid.innerHTML += `
        <div class="acc-box" onclick="Ark.openAccountDetails('${acc.id}')">
          <div class="acc-icon"><i class="fa-solid fa-wallet"></i></div>
          <div class="acc-box-name">${String(acc.name)}</div>
          <div class="acc-box-meta">${acc.displayNum} • ${String(acc.displaySub)}</div>
          <div class="acc-box-action">Open Details</div>
        </div>
      `;
    });
  },

  async openAccountDetails(accountId) {
    this.activeAccountId = accountId;
    this.paintAccountPickers();
    const acc = this.accounts.find(a => a.id === accountId);
    if(!acc) return;
    
    const dtlName = document.getElementById("dtl-name");
    if(dtlName) dtlName.textContent = acc.name;
    const dtlSub = document.getElementById("dtl-sub");
    if(dtlSub) dtlSub.textContent = `${acc.displayNum} • ${acc.displaySub}`;
    
    const { data: txs } = await sb.from("transactions").select("*").eq("account_id", accountId).order("created_at", { ascending: false });

    let available = 0; let pendingHold = 0;
    (txs || []).forEach(t => {
      const amt = Number(t.amount);
      const status = (t.status || "POSTED").toUpperCase();
      if(status === "POSTED") available += amt;
      else if(status === "PENDING" && amt < 0) { available += amt; pendingHold += Math.abs(amt); }
    });
    
    const creditAvail = 5000 - pendingHold; // Mock limit

    const setText = (id, val) => { const el = document.getElementById(id); if(el) el.textContent = val; };
    setText("dtl-avail", fmt(available));
    setText("dtl-pend", fmt(pendingHold));
    setText("dtl-credit", fmt(creditAvail));

    const body = document.getElementById("dtl-tx-body");
    if(body) {
        body.innerHTML = "";
        if(!txs || !txs.length) {
          body.innerHTML = `<tr><td colspan="5" class="muted">No transactions.</td></tr>`;
        } else {
          txs.forEach(t => {
            const ref = (t.id || "").toString().slice(0, 8).toUpperCase();
            const date = t.created_at ? new Date(t.created_at).toLocaleDateString() : "—";
            const desc = t.description || "—";
            const status = (t.status || "POSTED").toUpperCase();
            const dot = status === "PENDING" ? "pending" : "posted";
            const amt = Number(t.amount || 0);
            const cls = amt >= 0 ? "money-pos" : "money-neg";
            body.innerHTML += `
              <tr>
                <td>${ref}</td>
                <td>${date}</td>
                <td style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:320px;"><strong>${String(desc)}</strong></td>
                <td><span class="tag"><span class="dot ${dot}"></span>${status}</span></td>
                <td class="${cls}">${fmt(amt)}</td>
              </tr>`;
          });
        }
    }
    const modal = document.getElementById("account-detail-modal");
    if(modal) modal.style.display = "flex";
  },

  closeAccountDetails(e) {
    if (e.target && e.target.id === "account-detail-modal") {
      document.getElementById("account-detail-modal").style.display = "none";
    }
  },

  // --- SUB-MODULES ---
  async refreshPantry() {
    if (!this.activeAccountId) return;
    const { data } = await sb.from("pantry_items").select("*").eq("account_id", this.activeAccountId).order("created_at", { ascending: false });
    this.pantry = data || [];
  },
  async refreshInvoices() {
    if (!this.activeAccountId) return;
    const { data } = await sb.from("invoices").select("*").eq("account_id", this.activeAccountId).order("created_at", { ascending: false });
    this.invoices = data || [];
  },
  async refreshSubscriptions() {
    if (!this.user?.id) return;
    const { data } = await sb.from("subscriptions").select("*").eq("user_id", this.user.id).maybeSingle();
    this.subscription = data || null;
  },

  renderPantry() {
    const wrap = document.getElementById("pantry-list"); if(!wrap) return; wrap.innerHTML = "";
    if (!this.pantry.length) { wrap.innerHTML = `<div class="inventory-card"><div class="muted" style="font-size:12px;">No items.</div></div>`; return; }
    for (const it of this.pantry) {
      const name = String(it.name || "—");
      const unit = String(it.unit || "");
      const qty = Number(it.qty ?? 0); const par = Number(it.par ?? 0);
      const pct = (par > 0) ? Math.min((qty / par) * 100, 100) : 100;
      const low = (par > 0 && qty < par);
      wrap.innerHTML += `<div class="inventory-card">
        <div style="display:flex; justify-content:space-between; gap:10px; align-items:flex-start;">
          <div style="min-width:0;">
            <div style="font-weight:900; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${name}</div>
            <div class="muted" style="font-size:12px; margin-top:6px;">${qty}${unit ? " " + unit : ""}${par ? ` • par ${par}` : ""}</div>
          </div>
          ${this.role === 'Administrator' ? `<button class="btn-ghost btn-mini" onclick="Ark.deletePantry('${it.id}')"><i class="fa-solid fa-trash"></i></button>` : ''}
        </div>
        <div class="stock-bar"><div class="stock-fill ${low ? "stock-low" : ""}" style="width:${pct}%;"></div></div>
        <div class="muted" style="font-size:12px; margin-top:10px;">${low ? `<span style="color:var(--accent-ruby); font-weight:900;">Low stock</span>` : `<span style="color:var(--accent-emerald); font-weight:900;">OK</span>`}</div>
      </div>`;
    }
  },

  renderInvoices() {
    const body = document.getElementById("inv-body"); if(!body) return; body.innerHTML = "";
    if (!this.invoices.length) { body.innerHTML = `<tr><td colspan="5" class="muted" style="padding:16px 12px;">No invoices.</td></tr>`; return; }
