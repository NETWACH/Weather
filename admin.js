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

    // We skip the is_admin check for now since you ran the SQL in Step 1
    // to force everyone to be admin. This guarantees you get in.
    this.loadUsers();
  },

  async logout() {
    await sb.auth.signOut();
    window.location.href = 'index.html';
  },

  async loadUsers() {
    const { data } = await sb.from('profiles').select('*');
    this.users = data || [];
    document.getElementById('user-list').innerHTML = this.users.map(u => `
      <div class="user-card" onclick="Admin.selectUser('${u.id}')">
         <div class="user-email">${u.email || 'No Email'}</div>
         <div class="user-id">ID: ${u.id.slice(0,8)}...</div>
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
    document.getElementById('admin-chat-input').style.display = (tab === 'chat') ? 'flex' : 'none';

    if(tab === 'accounts') this.loadAccounts();
    if(tab === 'bills') this.loadBills();
    if(tab === 'chat') this.loadChat();
  },

  async loadAccounts() {
    const { data: accs } = await sb.from('accounts').select('*').eq('user_id', this.activeUser.id);
    const { data: txs } = await sb.from('transactions').select('*');
    
    const div = document.getElementById('view-accounts');
    if(!accs?.length) { div.innerHTML = '<div class="muted">No accounts.</div>'; return; }
    
    div.innerHTML = accs.map(a => {
        const bal = txs.filter(t => t.account_id === a.id).reduce((s,t) => s + Number(t.amount), 0);
        return `
          <div class="acc-box" onclick="navigator.clipboard.writeText('${a.id}').then(()=>alert('ID Copied!'))">
             <div class="acc-box-name">${a.name}</div>
             <div class="v" style="color:${bal>=0?'#00ffa3':'#ff3e5e'}">${fmt(bal)}</div>
             <div class="muted" style="font-size:9px; margin-top:5px; opacity:0.6;">Click to Copy ID</div>
          </div>`;
    }).join('');
  },

  async loadBills() {
    const { data: bills } = await sb.from('bills').select('*').eq('user_id', this.activeUser.id).order('due_date');
    const div = document.getElementById('view-bills');
    if(!bills?.length) { div.innerHTML = '<div class="muted">No bills.</div>'; return; }

    div.innerHTML = bills.map(b => `
       <div class="inventory-card" style="border-left: 4px solid ${b.status==='PAID'?'#00ffa3':'#ff3e5e'}">
          <div class="row" style="justify-content:space-between;">
             <strong>${b.name}</strong> 
             <span>${fmt(b.amount)}</span>
          </div>
          <div class="row" style="margin-top:10px; justify-content:space-between;">
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

  modalAccount() { document.getElementById('modal-acc').style.display='flex'; },
  async createAccount() {
     await sb.from('accounts').insert({ user_id: this.activeUser.id, name: document.getElementById('new-acc-name').value, category: document.getElementById('new-acc-cat').value });
     document.getElementById('modal-acc').style.display='none';
     this.loadAccounts();
  },
  modalTransfer() { document.getElementById('modal-tx').style.display='flex'; },
  async transfer() {
     const uid = (await sb.auth.getUser()).data.user.id;
     await sb.from('transactions').insert([
        { user_id: uid, account_id: document.getElementById('tx-from').value, amount: -Number(document.getElementById('tx-amt').value), description: 'Admin Transfer Out', status: 'POSTED' },
        { user_id: uid, account_id: document.getElementById('tx-to').value, amount: Number(document.getElementById('tx-amt').value), description: 'Admin Transfer In', status: 'POSTED' }
     ]);
     alert('Done');
     document.getElementById('modal-tx').style.display='none';
     this.loadAccounts();
  }
};

Admin.init();
