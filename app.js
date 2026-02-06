/**********************************************************
 * ARK VORD 8.0 Full (Fixed)
 **********************************************************/

const SUPABASE_URL = "https://cumebdvojadpxaxdmabb.supabase.co";
const SUPABASE_KEY = "sb_publishable_uTgHvSCKusJCK8aSfejzbw_Oxket8q2";
let sb;
try {
   sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
} catch(e) { console.error("Supabase init failed:", e); }

const fmt = (n) => {
  const v = Number(n || 0);
  return v.toLocaleString(undefined, { style: "currency", currency: "USD" });
};

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

const Ark = {
  user: null,
  role: "Authenticated",
  activeTab: "ledger",
  accounts: [],
  activeAccountId: null,
  tx: [],
  pantry: [],
  invoices: [],
  subscription: null,
  composeMode: null,

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
    this.user = null;
    this.accounts = [];
    document.getElementById("app").style.display = "none";
    document.getElementById("gate").style.display = "flex";
    document.getElementById("login-email").value = "";
    document.getElementById("login-pass").value = "";
  },

  async initApp() {
    document.getElementById("gate").style.display = "none";
    document.getElementById("app").style.display = "grid";

    // --- SAFE UPDATE OF UI ELEMENTS ---
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
    setText("ui-clientid", uid.slice(0, 12));

    await this.loadRole();
    await this.loadAccounts();

    if (!this.accounts.length) {
      await this.createDefaultAccountsIfNone();
      await this.loadAccounts();
    }
    
    this.switchTab("ledger", document.querySelector(".nav-item"));
    await this.refreshAll();
  },

  async loadRole() {
    this.role = "Authenticated";
    const badge = document.getElementById("role-display");
    if(badge) badge.innerHTML = `<i class="fa-solid fa-shield-halved"></i><span>${this.escape(this.role)}</span>`;
  },

  async loadAccounts() {
    const { data, error } = await sb.from("accounts").select("*").order("created_at", { ascending: true });
    if (error) { console.error("Error loading accounts:", error); return; }
    
    this.accounts = (data || []).map(a => {
      const numSuffix = a.id.replace(/\D/g, '').slice(0,4).padEnd(4, '0'); 
      const accNum = `**** ${numSuffix}`;
      let subType = a.category || "Standard Plan";
      if (this.user && a.user_id !== this.user.id) {
        subType = "Shared / Loan View";
      } else {
        if (a.category === "Business") subType = "Enterprise Checking";
        if (a.category === "Personal") subType = "Personal Checking";
      }
      return { ...a, balance: 0, displayNum: accNum, displaySub: subType };
    });
  },

  async createDefaultAccountsIfNone() {
    if (this.accounts.length) return;
    if (!this.user?.id) return;
    const payload = [
      { user_id: this.user.id, name: "Primary Checking", category: "Personal" },
      { user_id: this.user.id, name: "Business Ops", category: "Business" }
    ];
    await sb.from("accounts").insert(payload);
  },

  paintAccountPickers() {
    const mk = (a) => `<option value="${a.id}">${this.escape(`${a.name} • ${a.displaySub}`)}</option>`;
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
    if(error) { console.error("Balance Calc Error:", error); return; }
    this.accounts.forEach(a => a.balance = 0);
    data.forEach(t => {
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
        grid.innerHTML = `<div class="muted" style="grid-column:1/-1;">No accounts found. Create one?</div>`;
        return;
    }
    this.accounts.forEach(acc => {
      const displayBal = fmt(acc.balance);
      grid.innerHTML += `
        <div class="acc-box" onclick="Ark.openAccountDetails('${acc.id}')">
          <div class="acc-icon"><i class="fa-solid fa-wallet"></i></div>
          <div class="acc-box-name">${this.escape(acc.name)}</div>
          <div class="acc-box-meta">${acc.displayNum} • ${this.escape(acc.displaySub)}</div>
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
    
    const { data: txs, error } = await sb.from("transactions").select("*").eq("account_id", accountId).order("created_at", { ascending: false });

    let available = 0; let pendingHold = 0;
    (txs || []).forEach(t => {
      const amt = Number(t.amount);
      const status = (t.status || "POSTED").toUpperCase();
      if(status === "POSTED") available += amt;
      else if(status === "PENDING" && amt < 0) { available += amt; pendingHold += Math.abs(amt); }
    });
    const creditLimit = Math.max(5000, available * 1.5); 
    const creditAvail = creditLimit - pendingHold;

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
            const desc = this.escape(t.description || "—");
            const status = (t.status || "POSTED").toUpperCase();
            const dot = status === "PENDING" ? "pending" : "posted";
            const amt = Number(t.amount || 0);
            const cls = amt >= 0 ? "money-pos" : "money-neg";
            body.innerHTML += `
              <tr>
                <td>${ref}</td>
                <td>${date}</td>
                <td style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:320px;"><strong>${desc}</strong></td>
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
      const name = this.escape(it.name || "—");
      const unit = this.escape(it.unit || "");
      const qty = Number(it.qty ?? 0); const par = Number(it.par ?? 0);
      const pct = (par > 0) ? clamp((qty / par) * 100, 0, 120) : 100;
      const low = (par > 0 && qty < par);
      wrap.innerHTML += `<div class="inventory-card"><div style="display:flex; justify-content:space-between; gap:10px; align-items:flex-start;"><div style="min-width:0;"><div style="font-weight:900; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${name}</div><div class="muted" style="font-size:12px; margin-top:6px;">${this.escape(String(qty))}${unit ? " " + unit : ""}${par ? ` • par ${this.escape(String(par))}` : ""}</div></div><button class="btn-ghost btn-mini" onclick="Ark.deletePantry('${it.id}')"><i class="fa-solid fa-trash"></i></button></div><div class="stock-bar"><div class="stock-fill ${low ? "stock-low" : ""}" style="width:${pct}%;"></div></div><div class="muted" style="font-size:12px; margin-top:10px;">${low ? `<span style="color:var(--accent-ruby); font-weight:900;">Low stock</span>` : `<span style="color:var(--accent-emerald); font-weight:900;">OK</span>`}</div></div>`;
    }
  },
  renderInvoices() {
    const body = document.getElementById("inv-body"); if(!body) return; body.innerHTML = "";
    if (!this.invoices.length) { body.innerHTML = `<tr><td colspan="5" class="muted" style="padding:16px 12px;">No invoices.</td></tr>`; return; }
    for (const inv of this.invoices) {
      const num = this.escape(inv.number || (inv.id || "").slice(0, 8).toUpperCase());
      const date = inv.created_at ? new Date(inv.created_at).toLocaleDateString() : "—";
      const client = this.escape(inv.client || "—"); const status = String(inv.status || "DRAFT").toUpperCase();
      const total = Number(inv.total ?? 0); const dot = (status === "PAID") ? "posted" : (status === "SENT") ? "pending" : "";
      const moneyCls = total >= 0 ? "money-pos" : "money-neg";
      body.innerHTML += `<tr><td>${num}</td><td>${date}</td><td style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:360px;"><strong>${client}</strong></td><td><span class="tag"><span class="dot ${dot}"></span>${status}</span></td><td class="${moneyCls}">${fmt(total)}</td></tr>`;
    }
  },
  renderSubscriptions() {
    const plan = document.getElementById("sub-plan"); const status = document.getElementById("sub-status"); if(!plan || !status) return;
    if (!this.subscription) { plan.textContent = "—"; status.textContent = "—"; return; }
    plan.textContent = this.subscription.plan || "—"; status.textContent = this.subscription.status || "—";
  },

  // --- Composers ---
  openCompose(mode) {
    this.clearModalError();
    document.querySelectorAll(".input").forEach(i => i.value = "");
    const ts = document.getElementById("t-status"); if (ts) ts.value = "POSTED";
    const is = document.getElementById("i-status"); if (is) is.value = "DRAFT";
    const seg = document.getElementById("seg-ledger");
    if(seg) seg.style.display = (mode === "transaction" || mode === "transfer") ? "flex" : "none";
    this.paintAccountPickers();
    this.switchComposeMode(mode);
    const modal = document.getElementById("modal");
    if(modal) modal.style.display = "flex";
  },
  
  closeCompose() { 
    const modal = document.getElementById("modal");
    if(modal) modal.style.display = "none"; 
  },
  
  modalBackdrop(e) { if (e.target && e.target.id === "modal") this.closeCompose(); },
  
  switchComposeMode(mode) {
    this.composeMode = mode;
    const segT = document.getElementById("seg-transaction"); const segX = document.getElementById("seg-transfer");
    if (segT && segX) { if (mode === "transfer") { segT.classList.remove("active"); segX.classList.add("active"); } else if (mode === "transaction") { segX.classList.remove("active"); segT.classList.add("active"); } }
    ["mode-transaction", "mode-transfer", "mode-pantry", "mode-invoice"].forEach(id => { const el = document.getElementById(id); if (el) el.style.display = "none"; });
    const show = document.getElementById("mode-" + mode); if (show) show.style.display = "block";
    const t = document.getElementById("modal-title"); const s = document.getElementById("modal-sub");
    if(!t || !s) return;
    if(mode === "transaction") { t.textContent = "New Transaction"; s.textContent = "Deposit or withdrawal."; }
    else if(mode === "transfer") { t.textContent = "Transfer Funds"; s.textContent = "Move funds."; }
    else if(mode === "pantry") { t.textContent = "Inventory Item"; s.textContent = "Track stock."; }
    else if(mode === "invoice") { t.textContent = "Create Invoice"; s.textContent = "Issue bill."; }
  },

  async saveTransaction() {
    this.clearModalError();
    const desc = (document.getElementById("t-desc").value || "").trim();
    const amt = Number(document.getElementById("t-amt").value);
    const status = document.getElementById("t-status").value;
    if (!this.activeAccountId) return this.modalError("Select an account first.");
    if (!desc) return this.modalError("Description required.");
    if (!Number.isFinite(amt) || amt === 0) return this.modalError("Invalid amount.");
    const payload = { user_id: this.user.id, account_id: this.activeAccountId, description: desc, amount: amt, status };
    const { error } = await sb.from("transactions").insert([payload]);
    if (error) return this.modalError(error.message);
    this.closeCompose();
    this.openAccountDetails(this.activeAccountId); this.refreshAll();
  },
  async saveTransfer() {
    this.clearModalError();
    const fromId = document.getElementById("x-from").value;
    const toId = document.getElementById("x-to").value;
    const amt = Number(document.getElementById("x-amt").value);
    const memo = (document.getElementById("x-desc").value || "").trim();
    if (!fromId || !toId) return this.modalError("Select accounts.");
    if (fromId === toId) return this.modalError("Different accounts required.");
    if (!Number.isFinite(amt) || amt <= 0) return this.modalError("Positive amount required.");
    const label = memo ? memo : "Transfer";
    const payload = [ { user_id: this.user.id, account_id: fromId, amount: -amt, description: `${label} (out)`, status: "POSTED" }, { user_id: this.user.id, account_id: toId, amount: amt, description: `${label} (in)`, status: "POSTED" } ];
    const { error } = await sb.from("transactions").insert(payload);
    if (error) return this.modalError(error.message);
    this.closeCompose(); this.refreshAll();
  },
  async savePantryItem() {
    this.clearModalError();
    const name = (document.getElementById("p-name").value || "").trim();
    const unit = (document.getElementById("p-unit").value || "").trim();
    const qty = Number(document.getElementById("p-qty").value);
    const par = Number(document.getElementById("p-par").value);
    if (!this.activeAccountId) return this.modalError("Select account.");
    if (!name) return this.modalError("Name required.");
    if (!Number.isFinite(qty)) return this.modalError("Invalid qty.");
    const payload = { user_id: this.user.id, account_id: this.activeAccountId, name, unit: unit || null, qty, par: par || null };
    const { error } = await sb.from("pantry_items").insert([payload]);
    if (error) return this.modalError(error.message);
    this.closeCompose(); this.refreshPantry(); this.renderPantry();
  },
  async deletePantry(id) { await sb.from("pantry_items").delete().eq("id", id); this.refreshPantry(); this.renderPantry(); },
  async saveInvoice() {
    this.clearModalError();
    const number = (document.getElementById("i-number").value || "").trim();
    const client = (document.getElementById("i-client").value || "").trim();
    const total = Number(document.getElementById("i-total").value);
    if (!this.activeAccountId) return this.modalError("Select account.");
    if (!client) return this.modalError("Client required.");
    if (!Number.isFinite(total)) return this.modalError("Invalid total.");
    const payload = { user_id: this.user.id, account_id: this.activeAccountId, number: number || null, client, total, status: document.getElementById("i-status").value };
    const { error } = await sb.from("invoices").insert([payload]);
    if (error) return this.modalError(error.message);
    this.closeCompose(); this.refreshInvoices(); this.renderInvoices();
  },
  exportActive() {
    if (this.activeTab === "pantry") return this.exportCSV(this.pantry, ["name","qty"], "pantry");
    if (this.activeTab === "invoices") return this.exportCSV(this.invoices, ["number","client","total"], "invoices");
    this.exportCSV(this.accounts, ["name","type"], "accounts");
  },
  exportCSV(data, keys, fname) {
    const header = keys.join(",");
    const rows = data.map(d => keys.map(k => `"${String(d[k] || "").replaceAll('"', '""')}"`).join(",")).join("\n");
    const blob = new Blob([header + "\n" + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `ark-${fname}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
  },
  showLoginError(msg) { const el = document.getElementById("login-error"); if(el) { el.style.display = "block"; el.textContent = msg; } },
  hideLoginError() { const el = document.getElementById("login-error"); if(el) el.style.display = "none"; },
  modalError(msg) { const el = document.getElementById("modal-error"); if(el) { el.style.display = "block"; el.textContent = msg; } },
  clearModalError() { const el = document.getElementById("modal-error"); if(el) el.style.display = "none"; },
  escape(s) { return String(s).replace(/[&<>"']/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[m])); }
};

Ark.checkSession(false);
window.addEventListener("keydown", (e) => {
  if (document.getElementById("gate").style.display !== "none") return;
  if (e.key === "Escape") { Ark.closeCompose(); const d = document.getElementById("account-detail-modal"); if(d) d.style.display="none"; }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "n") { e.preventDefault(); Ark.openCompose("transaction"); }
});
