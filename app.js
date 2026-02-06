/**********************************************************
 * ARK VORD 9.0 (Payments & Accounts Update)
 **********************************************************/

const SUPABASE_URL = "https://cumebdvojadpxaxdmabb.supabase.co";
const SUPABASE_KEY = "sb_publishable_uTgHvSCKusJCK8aSfejzbw_Oxket8q2";
let sb;

try {
   sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
   console.log("System Online.");
} catch(e) { console.error("Init failed:", e); }

const fmt = (n) => Number(n || 0).toLocaleString(undefined, { style: "currency", currency: "USD" });

const Ark = {
  user: null,
  profile: null,
  role: "Viewer",
  accounts: [],
  activeAccountId: null,
  
  // --- SESSION ---
  async checkSession() {
    const { data } = await sb.auth.getSession();
    if (data?.session?.user) {
      this.user = data.session.user;
      await this.initApp();
    }
  },

  async login() {
    const email = document.getElementById("login-email").value;
    const pass = document.getElementById("login-pass").value;
    const { data, error } = await sb.auth.signInWithPassword({ email, password: pass });
    if (error) alert(error.message);
    else { this.user = data.user; this.initApp(); }
  },

  async logout() { await sb.auth.signOut(); window.location.reload(); },

  async initApp() {
    document.getElementById("gate").style.display = "none";
    document.getElementById("app").style.display = "grid";
    
    // Load Profile & Role
    const { data: prof } = await sb.from('profiles').select('*').eq('id', this.user.id).single();
    this.profile = prof;
    this.role = prof?.is_admin ? "Administrator" : "Viewer";
    
    // UI Setup
    document.getElementById("mini-who").textContent = this.user.email;
    const badge = document.getElementById("role-display");
    badge.innerHTML = `<i class="fa-solid ${this.role === 'Administrator' ? 'fa-shield-halved' : 'fa-eye'}"></i> ${this.role}`;
    badge.style.background = this.role === 'Administrator' ? 'var(--accent-gold)' : 'var(--accent-ice)';

    // Admin-Only Buttons visibility
    if (this.role !== 'Administrator') {
      document.querySelectorAll(".btn-elite").forEach(el => el.style.display = 'none');
      // Except the Transfer button, which viewers need
      const transferBtn = document.querySelector("button[onclick*='transfer']");
      if(transferBtn) transferBtn.style.display = 'inline-flex';
    }

    await this.refreshAll();
  },

  // --- DATA LOADING ---
  async refreshAll() {
    await this.loadAccounts();
    this.renderAccountGrid();
  },

  async loadAccounts() {
    // If Admin, we fetch accounts + owner emails via a join strategy or separate fetches
    // For simplicity with RLS: Admins see all. We will try to fetch profiles to map names.
    
    const { data: accounts } = await sb.from("accounts").select("*").order("created_at");
    
    if (this.role === 'Administrator') {
        // Admin needs to know WHO owns WHAT. Fetch all profiles.
        const { data: profiles } = await sb.from("profiles").select("id, email");
        this.accounts = accounts.map(a => {
            const owner = profiles.find(p => p.id === a.user_id);
            return { ...a, ownerEmail: owner ? owner.email : 'Unknown' };
        });
    } else {
        this.accounts = accounts.map(a => ({ ...a, ownerEmail: 'Me' }));
    }
    
    // Calculate Balances
    const { data: txs } = await sb.from("transactions").select("account_id, amount");
    this.accounts.forEach(acc => {
        acc.balance = txs.filter(t => t.account_id === acc.id).reduce((sum, t) => sum + Number(t.amount), 0);
    });
  },

  renderAccountGrid() {
    const grid = document.getElementById("accounts-grid");
    grid.innerHTML = "";
    this.accounts.forEach(acc => {
      // Admin Visual: Show owner email if not me
      const isMine = acc.user_id === this.user.id;
      const subtitle = this.role === 'Administrator' && !isMine 
          ? `<span style="color:var(--accent-gold);">${acc.ownerEmail}</span>` 
          : acc.category;

      grid.innerHTML += `
        <div class="acc-box" onclick="Ark.openDetails('${acc.id}')">
          <div class="acc-icon"><i class="fa-solid fa-wallet"></i></div>
          <div class="acc-box-name">${acc.name}</div>
          <div class="acc-box-meta">${subtitle}</div>
          <div class="v" style="font-size:18px; margin-top:10px;">${fmt(acc.balance)}</div>
        </div>`;
    });
  },

  // --- DETAILS ---
  async openDetails(id) {
    this.activeAccountId = id;
    const acc = this.accounts.find(a => a.id === id);
    document.getElementById("dtl-name").textContent = acc.name;
    document.getElementById("dtl-bal").textContent = fmt(acc.balance);
    
    const { data: txs } = await sb.from("transactions").select("*").eq("account_id", id).order("created_at", {ascending:false});
    const tbody = document.getElementById("dtl-tx-body");
    tbody.innerHTML = "";
    txs.forEach(t => {
      tbody.innerHTML += `<tr>
        <td>${new Date(t.created_at).toLocaleDateString()}</td>
        <td>${t.description}</td>
        <td class="${t.amount >= 0 ? 'pos' : 'neg'}">${fmt(t.amount)}</td>
      </tr>`;
    });
    document.getElementById("account-detail-modal").style.display = "flex";
  },

  // --- COMPOSE ---
  openCompose(mode) {
    document.getElementById("modal").style.display = "flex";
    document.querySelectorAll(".mode-section").forEach(el => el.style.display = "none");
    
    // Reset Inputs
    document.querySelectorAll("input").forEach(i => i.value = "");
    
    // Mode Switching
    if (mode === 'account') {
        document.getElementById("mode-account").style.display = "block";
        document.getElementById("modal-title").textContent = "Create Account";
    }
    else if (mode === 'transaction') {
        document.getElementById("mode-transaction").style.display = "block";
        document.getElementById("modal-title").textContent = "New Transaction";
        this.renderDropdown("t-acc", this.accounts); // Admin can select ANY account
    }
    else if (mode === 'transfer') {
        document.getElementById("mode-transfer").style.display = "block";
        document.getElementById("modal-title").textContent = "Transfer Funds";
        
        // FROM: Only My Accounts (unless Admin)
        const myAccounts = this.role === 'Administrator' ? this.accounts : this.accounts.filter(a => a.user_id === this.user.id);
        this.renderDropdown("x-from", myAccounts);
        
        // TO: Admins see ALL. Viewers see THEIRS + "Pay Admin" option.
        if (this.role === 'Administrator') {
            this.renderDropdown("x-to", this.accounts);
        } else {
            const payOption = `<option value="ADMIN_TARGET">★ PAY ARK ADMIN</option>`;
            const myOpts = myAccounts.map(a => `<option value="${a.id}">${a.name}</option>`).join("");
            document.getElementById("x-to").innerHTML = payOption + myOpts;
        }
    }
  },

  renderDropdown(id, list) {
    const el = document.getElementById(id);
    el.innerHTML = list.map(a => {
        const label = this.role === 'Administrator' ? `${a.name} (${a.ownerEmail})` : a.name;
        return `<option value="${a.id}">${label}</option>`;
    }).join("");
  },

  // --- ACTIONS ---
  async saveAccount() {
    const name = document.getElementById("a-name").value;
    const cat = document.getElementById("a-cat").value;
    const email = document.getElementById("a-email").value || this.user.email; // Default to self if empty

    if(this.role !== 'Administrator') return alert("Admins only.");

    const { data, error } = await sb.rpc('create_account_ui', { target_email: email, acc_name: name, acc_category: cat });
    
    if (error) alert(error.message);
    else { this.closeCompose(); this.refreshAll(); }
  },

  async saveTransaction() {
    const accId = document.getElementById("t-acc").value;
    const desc = document.getElementById("t-desc").value;
    const amt = Number(document.getElementById("t-amt").value);

    // Direct Insert
    const { error } = await sb.from("transactions").insert({
        user_id: this.user.id, // Logged by admin
        account_id: accId,
        description: desc,
        amount: amt,
        status: 'POSTED'
    });
    if(error) alert(error.message);
    else { this.closeCompose(); this.refreshAll(); }
  },

  async saveTransfer() {
    const fromId = document.getElementById("x-from").value;
    const toId = document.getElementById("x-to").value;
    const amt = Number(document.getElementById("x-amt").value);
    const memo = document.getElementById("x-desc").value;

    if (amt <= 0) return alert("Invalid amount");

    // Case A: Viewer paying Admin
    if (toId === "ADMIN_TARGET") {
        const { data, error } = await sb.rpc('pay_admin', { 
            amount: amt, 
            from_account_id: fromId, 
            note: memo 
        });
        if(error) alert("Payment Failed: " + error.message);
        else { alert("Payment Sent!"); this.closeCompose(); this.refreshAll(); }
        return;
    }

    // Case B: Standard Transfer (Admin or Self)
    const { error } = await sb.from("transactions").insert([
        { user_id: this.user.id, account_id: fromId, amount: -amt, description: `Transfer Out: ${memo}`, status: 'POSTED' },
        { user_id: this.user.id, account_id: toId, amount: amt, description: `Transfer In: ${memo}`, status: 'POSTED' }
    ]);
    if(error) alert(error.message);
    else { this.closeCompose(); this.refreshAll(); }
  },

  closeCompose() { document.getElementById("modal").style.display = "none"; }
};

Ark.checkSession();
