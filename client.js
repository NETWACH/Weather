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
      
      // 1. ADMIN CHECK & BUTTON INJECTION
      const { data: prof } = await sb.from('profiles').select('is_admin').eq('id', this.user.id).single();
      
      if (prof?.is_admin) {
        const sidebar = document.querySelector('aside');
        const logoutBtn = sidebar.querySelector('.btn-danger'); 
        
        const adminBtn = document.createElement('div');
        adminBtn.className = 'nav-item';
        adminBtn.style.color = 'var(--accent-ruby)';
        adminBtn.style.border = '1px solid rgba(255, 79, 216, 0.3)';
        adminBtn.style.marginBottom = '15px';
        adminBtn.innerHTML = '<i class="fa-solid fa-unlock-keyhole"></i> GOD MODE';
        adminBtn.onclick = () => window.location.href = 'admin.html';
        
        sidebar.insertBefore(adminBtn, logoutBtn);
      }

      // 2. REVEAL APP
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
      const errDiv = document.getElementById('login-err');
      errDiv.style.display = 'block';
      errDiv.textContent = error.message;
    } else {
      window.location.reload();
    }
  },

  async logout() {
    await sb.auth.signOut();
    window.location.href = 'index.html'; 
  },

  tab(name) {
    document.querySelectorAll('main > section').forEach(s => s.style.display = 'none');
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    
    const target = document.getElementById('view-' + name);
    target.style.display = (name === 'ledger') ? 'grid' : 'flex';
    
    // Highlight active nav
    event.currentTarget.classList.add('active');
    
    if (name === 'ledger') this.loadAccounts();
    if (name === 'bills') this.loadBills();
    if (name === 'chat') this.loadChat();
  },

  async loadAccounts() {
    const { data: accs } = await sb.from('accounts').select('*');
    const { data: txs } = await sb.from('transactions').select('*');
    const grid = document.getElementById('grid-accounts');
    
    if(!accs?.length) { 
      grid.innerHTML = '<h4 style="margin:0;">Accounts</h4><div class="muted">No active transmissions.</div>'; 
      return; 
    }
    
    grid.innerHTML = '<h4 style="margin:0 0 15px 0;">Accounts Snapshot</h4>' + accs.map(a => {
      const bal = txs.filter(t => t.account_id === a.id).reduce((sum, t) => sum + Number(t.amount), 0);
      return `
        <div style="padding: 15px; background: rgba(255,255,255,0.05); border-radius: 20px; margin-bottom: 10px; border: 1px solid rgba(255,255,255,0.05);">
          <div class="muted" style="font-size: 11px; text-transform: uppercase;">${a.name}</div>
          <div style="font-size: 20px; font-weight: 700; margin: 5px 0;">${fmt(bal)}</div>
          <div class="muted" style="font-size: 10px; font-family: var(--mono);">ID: ${a.id.slice(0,8)}...</div>
        </div>`;
    }).join('');
  },

  async loadBills() {
    const { data: bills } = await sb.from('bills').select('*').order('due_date');
    const grid = document.getElementById('grid-bills');
    
    if(!bills || bills.length === 0) {
        grid.innerHTML = '<div class="acc-box muted">No pending obligations detected.</div>';
        return;
    }

    grid.innerHTML = bills.map(b => {
      const isLate = b.status !== 'PAID' && new Date(b.due_date) < new Date();
      const color = b.status === 'PAID' ? 'var(--accent-emerald)' : (isLate ? 'var(--accent-ruby)' : 'var(--accent-google)');
      
      return `
        <div class="acc-box" style="border-left: 4px solid ${color};">
           <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
              <div style="font-weight:700; font-size:18px;">${b.name}</div>
              <div style="font-family: var(--mono); color: ${color}; font-weight: bold;">${fmt(b.amount)}</div>
           </div>
           <div style="display:flex; justify-content:space-between; align-items:center;">
              <div class="muted"><i class="fa-regular fa-calendar-check"></i> ${b.due_date}</div>
              <div style="font-size: 10px; padding: 4px 10px; background: rgba(255,255,255,0.1); border-radius: 10px; letter-spacing: 1px;">${b.status}</div>
           </div>
        </div>`;
    }).join('');
  },

  async addBill() {
    const name = document.getElementById('b-name').value;
    const amt = document.getElementById('b-amt').value;
    const date = document.getElementById('b-date').value;
    const type = document.getElementById('b-type').value;
    
    if(!name || !amt) return alert("System requires billing metadata.");

    await sb.from('bills').insert({ user_id: this.user.id, name, amount: amt, due_date: date, type });
    document.getElementById('modal-bill').style.display = 'none';
    this.loadBills();
  },

  async loadChat() {
    const { data: msgs } = await sb.from('messages').select('*').order('created_at');
    const box = document.getElementById('chat-box');
    
    if(!msgs) return;

    box.innerHTML = msgs.map(m => `
      <div style="display: flex; flex-direction: column; align-items: ${m.is_from_admin ? 'flex-start' : 'flex-end'}; margin-bottom: 15px;">
        <div style="padding: 12px 18px; border-radius: 20px; max-width: 80%; background: ${m.is_from_admin ? 'rgba(255,255,255,0.1)' : 'var(--accent-google)'}; color: ${m.is_from_admin ? '#fff' : '#000'}; font-weight: 500;">
          ${m.content}
        </div>
        <span class="muted" style="font-size: 9px; margin-top: 5px; margin-left: 5px; margin-right: 5px;">${new Date(m.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
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