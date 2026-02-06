const SB_URL = "https://cumebdvojadpxaxdmabb.supabase.co";
const SB_KEY = "sb_publishable_uTgHvSCKusJCK8aSfejzbw_Oxket8q2";
const sb = window.supabase.createClient(SB_URL, SB_KEY);
const fmt = (n) => Number(n).toLocaleString('en-US', {style:'currency', currency:'USD'});

const Admin = {
  users: [],
  activeUser: null,

  async init() {
    const { data } = await sb.auth.getSession();
    if (!data?.session) return window.location.href = 'index.html';

    // Verify Admin
    const { data: prof } = await sb.from('profiles').select('is_admin').eq('id', data.session.user.id).single();
    if (!prof?.is_admin) return window.location.href = 'index.html';

    this.loadUsers();
  },

  async logout() {
    await sb.auth.signOut();
    window.location.href = 'index.html';
  },

  async loadUsers() {
    const { data } = await sb.from('profiles').select('*');
    this.users = data;
    document.getElementById('user-list').innerHTML = data.map(u => `
      <div class="user-card" onclick="Admin.selectUser('${u.id}')">
         <div style="font-weight:bold;">${u.email}</div>
         <div class="muted" style="font-size:10px;">${u.id}</div>
      </div>
    `).join('');
  },

  async selectUser(id) {
    this.activeUser = this.users.find(u => u.id === id);
    document.getElementById('main-panel').style.display = 'flex';
    document.getElementById('m-email').textContent = this.activeUser.email;
    document.getElementById('m-uid').textContent = id;
    this.view('accounts');
  },

  view(tab) {
    ['accounts','bills','chat'].forEach(t => document.getElementById('view-'+t).style.display='none');
    document.getElementById('view-'+tab).style.display = (tab === 'chat' || tab === 'bills') ? 'flex' : 'grid';
    
    // Toggle Chat Input
    document.getElementById('admin-chat-input').style.display = (tab === 'chat') ? 'flex' : 'none';

    if(tab === 'accounts') this.loadAccounts();
    if(tab === 'bills') this.loadBills();
    if(tab === 'chat') this.loadChat();
  },

  // --- FEATURES ---

  async loadAccounts() {
    const { data: accs } = await sb.from('accounts').select('*').eq('user_id', this.activeUser.id);
    const { data: txs } = await sb.from('transactions').select('*');
    
    document.getElementById('view-accounts').innerHTML = accs.map(a => {
        const bal = txs.filter(t => t.account_id === a.id).reduce((s,t) => s + Number(t.amount), 0);
        return `
          <div class="acc-box">
             <div class="acc-box-name">${a.name}</div>
             <div class="v">${fmt(bal)}</div>
             <div class="muted" style="font-size:10px; margin-top:5px;">ID: ${a.id}</div>
          </div>`;
    }).join('');
  },

  async loadBills() {
    const { data: bills } = await sb.from('bills').select('*').eq('user_id', this.activeUser.id).order('due_date');
    document.getElementById('view-bills').innerHTML = bills.map(b => `
       <div class="inventory-card">
          <div class="row" style="justify-content:space-between;">
             <strong>${b.name}</strong> 
             <span>${fmt(b.amount)}</span>
          </div>
          <div class="row" style="margin-top:10px;">
             <span class="tag">${b.status}</span>
             ${b.status !== 'PAID' ? `<button class="btn-ghost btn-mini" onclick="Admin.markPaid('${b.id}')">Mark Paid</button>` : ''}
          </div>
       </div>
    `).join('');
  },

  async markPaid(id) {
    await sb.from('bills').update({ status: 'PAID' }).eq('id', id);
    this.loadBills();
  },

  async loadChat() {
    const { data: msgs } = await sb.from('messages').select('*').eq('user_id', this.activeUser.id).order('created_at');
    const box = document.getElementById('view-chat');
    box.innerHTML = msgs.map(m => `
       <div class="msg-row ${m.is_from_admin ? 'msg-me' : 'msg-them'}">
          <div class="msg-bubble">${m.content}</div>
       </div>
    `).join('');
    box.scrollTop = box.scrollHeight;
  },

  async sendMsg() {
     const val = document.getElementById('msg-in').value;
     if(!val) return;
     await sb.from('messages').insert({
        user_id: this.activeUser.id,
        sender_id: (await sb.auth.getUser()).data.user.id,
        content: val,
        is_from_admin: true
     });
     document.getElementById('msg-in').value = '';
     this.loadChat();
  },

  // --- ACTIONS ---

  modalAccount() { document.getElementById('modal-acc').style.display='flex'; },
  async createAccount() {
     await sb.from('accounts').insert({
        user_id: this.activeUser.id,
        name: document.getElementById('new-acc-name').value,
        category: document.getElementById('new-acc-cat').value
     });
     document.getElementById('modal-acc').style.display='none';
     this.loadAccounts();
  },

  modalTransfer() { document.getElementById('modal-tx').style.display='flex'; },
  async transfer() {
     const from = document.getElementById('tx-from').value;
     const to = document.getElementById('tx-to').value;
     const amt = Number(document.getElementById('tx-amt').value);
     const uid = (await sb.auth.getUser()).data.user.id;
     
     await sb.from('transactions').insert([
        { user_id: uid, account_id: from, amount: -amt, description: 'Admin Transfer Out', status: 'POSTED' },
        { user_id: uid, account_id: to, amount: amt, description: 'Admin Transfer In', status: 'POSTED' }
     ]);
     alert('Transfer Complete');
     document.getElementById('modal-tx').style.display='none';
     this.loadAccounts();
  }
};

Admin.init();
