const SUPABASE_URL = "https://cumebdvojadpxaxdmabb.supabase.co";
const SUPABASE_KEY = "sb_publishable_uTgHvSCKusJCK8aSfejzbw_Oxket8q2";
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const God = {
  users: [],
  accounts: [],
  selectedUser: null, // The user currently being viewed

  async init() {
    // 1. Check Admin Auth
    const { data: { session } } = await sb.auth.getSession();
    if (!session) window.location.href = 'index.html';
    
    // Check is_admin from DB
    const { data: profile } = await sb.from('profiles').select('is_admin').eq('id', session.user.id).single();
    if (!profile?.is_admin) {
        alert("ACCESS DENIED: GOD MODE IS RESTRICTED.");
        window.location.href = 'index.html';
        return;
    }

    await this.fetchData();
  },

  async fetchData() {
    // Fetch ALL profiles and ALL accounts
    const { data: users } = await sb.from('profiles').select('*');
    const { data: accounts } = await sb.from('accounts').select('*');
    const { data: txs } = await sb.from('transactions').select('account_id, amount');

    // Calculate balances locally for speed
    accounts.forEach(acc => {
       acc.balance = txs.filter(t => t.account_id === acc.id).reduce((sum, t) => sum + Number(t.amount), 0);
    });

    this.users = users || [];
    this.accounts = accounts || [];

    this.renderSidebar();
  },

  renderSidebar() {
    const list = document.getElementById('user-list');
    list.innerHTML = this.users.map(u => `
      <div class="user-card" onclick="God.selectUser('${u.id}')" id="u-${u.id}">
        <div class="user-email">${u.email || 'No Email'}</div>
        <div class="user-id">${u.id.slice(0,8)}...</div>
        <div style="font-size:10px; color:${u.is_admin ? 'var(--accent-gold)':'#fff'}; margin-top:4px;">
           ${u.is_admin ? '<i class="fa-solid fa-shield"></i> ADMIN' : 'Viewer'}
        </div>
      </div>
    `).join('');
  },

  selectUser(userId) {
    this.selectedUser = this.users.find(u => u.id === userId);
    
    // UI Updates
    document.querySelectorAll('.user-card').forEach(el => el.classList.remove('active'));
    document.getElementById(`u-${userId}`).classList.add('active');
    
    document.getElementById('welcome-msg').style.display = 'none';
    const view = document.getElementById('manage-view');
    view.style.display = 'flex';
    
    document.getElementById('m-email').textContent = this.selectedUser.email;
    document.getElementById('m-uid').textContent = "ID: " + this.selectedUser.id;
    
    this.renderUserAccounts(userId);
  },

  renderUserAccounts(userId) {
    const userAccs = this.accounts.filter(a => a.user_id === userId);
    const grid = document.getElementById('user-accounts-grid');
    
    if (userAccs.length === 0) {
        grid.innerHTML = `<div class="muted" style="padding:20px;">No accounts found for this user.</div>`;
        return;
    }

    const fmt = n => Number(n).toLocaleString(undefined, {style:'currency', currency:'USD'});

    grid.innerHTML = userAccs.map(acc => `
      <div class="acc-box">
        <div class="acc-icon"><i class="fa-solid fa-wallet"></i></div>
        <div class="acc-box-name">${acc.name}</div>
        <div class="acc-box-meta">${acc.category}</div>
        <div class="v" style="font-size:18px; margin-top:10px;">${fmt(acc.balance)}</div>
        <div class="row" style="margin-top:10px; width:100%;">
           <button class="btn-ghost btn-mini" onclick="God.openTransfer('${acc.id}')">Transfer</button>
        </div>
      </div>
    `).join('');
  },

  // --- ACTIONS ---

  openCreateAccount() {
    if(!this.selectedUser) return;
    document.getElementById('new-acc-email').value = this.selectedUser.email;
    document.getElementById('modal-create').style.display = 'flex';
  },

  async createAccount() {
    const name = document.getElementById('new-acc-name').value;
    const cat = document.getElementById('new-acc-cat').value;
    
    // We can use the 'create_account_ui' RPC we made earlier
    const { error } = await sb.rpc('create_account_ui', {
        target_email: this.selectedUser.email,
        acc_name: name,
        acc_category: cat
    });

    if(error) alert(error.message);
    else {
        document.getElementById('modal-create').style.display = 'none';
        await this.fetchData(); // Reload data
        this.selectUser(this.selectedUser.id); // Re-render view
    }
  },

  // --- GLOBAL TRANSFER SYSTEM ---

  openTransfer(preselectSourceAccId = null) {
    const modal = document.getElementById('modal-transfer');
    modal.style.display = 'flex';
    
    // Populate User Dropdowns
    const userOpts = `<option value="">Select User...</option>` + 
        this.users.map(u => `<option value="${u.id}">${u.email}</option>`).join('');
    
    document.getElementById('gx-user-from').innerHTML = userOpts;
    document.getElementById('gx-user-to').innerHTML = userOpts;
    
    // If opened from a specific account context, pre-fill it
    if (preselectSourceAccId && this.selectedUser) {
        const uId = this.selectedUser.id;
        document.getElementById('gx-user-from').value = uId;
        this.loadAccountsForSelect(uId, 'gx-acc-from');
        document.getElementById('gx-acc-from').value = preselectSourceAccId;
    }
  },

  loadAccountsForSelect(userId, targetSelectId) {
    const el = document.getElementById(targetSelectId);
    if (!userId) { el.innerHTML = ''; return; }
    
    const uAccs = this.accounts.filter(a => a.user_id === userId);
    el.innerHTML = uAccs.map(a => `<option value="${a.id}">${a.name} ($${a.balance})</option>`).join('');
  },

  async executeTransfer() {
    const fromAcc = document.getElementById('gx-acc-from').value;
    const toAcc = document.getElementById('gx-acc-to').value;
    const amt = Number(document.getElementById('gx-amt').value);
    const desc = document.getElementById('gx-desc').value || "Admin Transfer";

    if (!fromAcc || !toAcc) return alert("Select both accounts.");
    if (amt <= 0) return alert("Invalid amount.");

    // Execute standard ledger movement (Admin has RLS power to do this)
    const { error } = await sb.from("transactions").insert([
        { 
            user_id: sb.auth.getUser().id, // Admin logs the action
            account_id: fromAcc, 
            amount: -amt, 
            description: `Transfer Out: ${desc}`, 
            status: 'POSTED' 
        },
        { 
            user_id: sb.auth.getUser().id, 
            account_id: toAcc, 
            amount: amt, 
            description: `Transfer In: ${desc}`, 
            status: 'POSTED' 
        }
    ]);

    if(error) alert(error.message);
    else {
        alert("Success");
        document.getElementById('modal-transfer').style.display = 'none';
        await this.fetchData();
        if(this.selectedUser) this.selectUser(this.selectedUser.id);
    }
  }
};

God.init();
