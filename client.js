const SB_URL = "https://cumebdvojadpxaxdmabb.supabase.co";
const SB_KEY = "sb_publishable_uTgHvSCKusJCK8aSfejzbw_Oxket8q2";
const sb = window.supabase.createClient(SB_URL, SB_KEY);
const fmt = (n) => Number(n).toLocaleString('en-US', {style:'currency', currency:'USD'});

const Client = {
  user: null,

  async init() {
    const { data } = await sb.auth.getSession();
    if (data?.session) {
      this.user = data.session.user;
      
      // 1. CHECK ADMIN STATUS
      const { data: prof } = await sb.from('profiles').select('is_admin').eq('id', this.user.id).single();
      
      // 2. IF ADMIN: INJECT "GOD MODE" BUTTON
      if (prof?.is_admin) {
        console.log("Admin detected. Adding God Mode button.");
        
        const sidebar = document.querySelector('aside');
        const logoutBtnContainer = sidebar.lastElementChild; // The div containing logout
        
        const adminBtn = document.createElement('button');
        adminBtn.className = 'btn-elite'; // Gold styling
        adminBtn.style.marginTop = 'auto';
        adminBtn.style.marginBottom = '10px';
        adminBtn.style.width = '100%';
        adminBtn.style.justifyContent = 'center';
        adminBtn.innerHTML = '<i class="fa-solid fa-lock"></i> GOD MODE';
        
        // Click to go to admin.html
        adminBtn.onclick = () => window.location.href = 'admin.html';
        
        // Insert it right above the Logout button
        sidebar.insertBefore(adminBtn, logoutBtnContainer);
      }

      // 3. LOAD THE APP NORMALLY
      document.getElementById('gate').style.display = 'none';
      document.getElementById('app').style.display = 'grid';
      this.tab('ledger');
    }
  },

  async login() {
    const email = document.getElementById('email').value;
    const pass = document.getElementById('password').value;
    const { error } = await sb.auth.signInWithPassword({ email, password: pass });
    if (error) {
      document.getElementById('login-err').style.display = 'block';
      document.getElementById('login-err').textContent = error.message;
    } else {
      window.location.reload();
    }
  },

  async logout() {
    await sb.auth.signOut();
    window.location.href = 'index.html'; // FORCE RELOAD
  },

  tab(name) {
    document.querySelectorAll('main > section').forEach(s => s.style.display = 'none');
    document.getElementById('view-' + name).style.display = 'flex';
    if (name === 'ledger') this.loadAccounts();
    if (name === 'bills') this.loadBills();
    if (name === 'chat') this.loadChat();
  },

  // --- FEATURES ---

  async loadAccounts() {
    const { data: accs } = await sb.from('accounts').select('*');
    const { data: txs } = await sb.from('transactions').select('*');
    const grid = document.getElementById('grid-accounts');
    
    if(!accs?.length) { grid.innerHTML = '<div class="muted">No accounts active.</div>'; return; }
    
    grid.innerHTML = accs.map(a => {
      const bal = txs.filter(t => t.account_id === a.id).reduce((sum, t) => sum + Number(t.amount), 0);
      return `
        <div class="acc-box">
          <div class="acc-icon"><i class="fa-solid fa-wallet"></i></div>
          <div class="acc-box-name">${a.name}</div>
          <div class="v">${fmt(bal)}</div>
        </div>`;
    }).join('');
  },

  async loadBills() {
    const { data: bills } = await sb.from('bills').select('*').order('due_date');
    const grid = document.getElementById('grid-bills');
    
    if(!bills || bills.length === 0) {
        grid.innerHTML = '<div class="muted">No bills found.</div>';
        return;
    }

    grid.innerHTML = bills.map(b => {
      const isLate = b.status !== 'PAID' && new Date(b.due_date) < new Date();
      return `
        <div class="inventory-card" style="border-left: 4px solid var(--accent-${b.status === 'PAID' ? 'emerald' : (isLate ? 'ruby' : 'ice')})">
           <div class="row" style="justify-content:space-between;">
              <div style="font-weight:bold;">${b.name}</div>
              <div style="font-weight:900;">${fmt(b.amount)}</div>
           </div>
           <div class="muted" style="font-size:12px; margin-top:5px;">Due: ${b.due_date} • ${b.status}</div>
        </div>`;
    }).join('');
  },

  async addBill() {
    const name = document.getElementById('b-name').value;
    const amt = document.getElementById('b-amt').value;
    const date = document.getElementById('b-date').value;
    const type = document.getElementById('b-type').value;
    
    await sb.from('bills').insert({ user_id: this.user.id, name, amount: amt, due_date: date, type });
    document.getElementById('modal-bill').style.display = 'none';
    this.loadBills();
  },

  async loadChat() {
    const { data: msgs } = await sb.from('messages').select('*').order('created_at');
    const box = document.getElementById('chat-box');
    box.innerHTML = msgs.map(m => `
      <div class="msg-row ${m.is_from_admin ? 'msg-them' : 'msg-me'}">
        <div class="msg-bubble">${m.content}</div>
      </div>`).join('');
    box.scrollTop = box.scrollHeight;
  },

  async sendMsg() {
    const input = document.getElementById('chat-input');
    if (!input.value) return;
    await sb.from('messages').insert({ 
      user_id: this.user.id, 
      sender_id: this.user.id, 
      content: input.value, 
      is_from_admin: false 
    });
    input.value = '';
    this.loadChat();
  }
};

Client.init();
