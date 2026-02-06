const SUPABASE_URL = "https://cumebdvojadpxaxdmabb.supabase.co";
const SUPABASE_KEY = "sb_publishable_uTgHvSCKusJCK8aSfejzbw_Oxket8q2";
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const fmt = (n) => Number(n).toLocaleString(undefined, {style:"currency", currency:"USD"});

const Ark = {
  user: null, role: "Viewer",
  
  async login() {
    const { data, error } = await sb.auth.signInWithPassword({
      email: document.getElementById("login-email").value,
      password: document.getElementById("login-pass").value
    });
    if(!error) window.location.reload();
  },

  async init() {
    const { data } = await sb.auth.getSession();
    if(data?.session) {
      this.user = data.session.user;
      document.getElementById("gate").style.display = "none";
      document.getElementById("app").style.display = "grid";
      document.getElementById("mini-who").textContent = this.user.email;
      
      // Check Admin Role
      const { data: prof } = await sb.from('profiles').select('is_admin').eq('id', this.user.id).single();
      if(prof?.is_admin) {
          this.role = "Administrator";
          document.getElementById("admin-ledger-actions").style.display = "flex"; // Show controls for Admin
          document.getElementById("role-display").textContent = "ADMIN MODE";
          document.getElementById("role-display").style.background = "var(--accent-gold)";
      }

      this.switchTab('ledger');
    }
  },

  switchTab(tab) {
    document.querySelectorAll("main > section").forEach(s => s.style.display = "none");
    document.getElementById("view-"+tab).style.display = "flex";
    if(tab === 'ledger') this.loadAccounts();
    if(tab === 'bills') this.loadBills();
    if(tab === 'messages') this.loadMessages();
  },

  // --- LEDGER ---
  async loadAccounts() {
    // Admins see all accounts; Users see their own.
    const { data: accs } = await sb.from("accounts").select("*");
    const { data: txs } = await sb.from("transactions").select("*");
    
    const grid = document.getElementById("accounts-grid");
    grid.innerHTML = "";
    
    accs.forEach(a => {
      const bal = txs.filter(t => t.account_id === a.id).reduce((s,t) => s + Number(t.amount), 0);
      grid.innerHTML += `
        <div class="acc-box">
          <div class="acc-icon"><i class="fa-solid fa-wallet"></i></div>
          <div class="acc-box-name">${a.name}</div>
          <div class="acc-box-meta">${a.category}</div>
          <div class="v">${fmt(bal)}</div>
        </div>`;
    });
  },

  // --- BILLS (GRAPHICAL) ---
  async loadBills() {
    const { data: bills } = await sb.from("bills").select("*").order("due_date");
    const grid = document.getElementById("bills-grid");
    grid.innerHTML = "";

    const today = new Date().toISOString().split('T')[0];

    if(!bills.length) { grid.innerHTML = `<div class="muted">No bills tracked.</div>`; return; }

    bills.forEach(b => {
      // Logic: Is it late?
      const isLate = b.status !== 'PAID' && b.due_date < today;
      const colorClass = b.status === 'PAID' ? 'pos' : (isLate ? 'neg' : 'ice');
      const statusText = b.status === 'PAID' ? 'PAID' : (isLate ? 'PAST DUE' : 'DUE SOON');
      const icon = b.type === 'Car' ? 'fa-car' : (b.type === 'Utility' ? 'fa-bolt' : 'fa-file-invoice');

      grid.innerHTML += `
        <div class="inventory-card" style="border-left: 4px solid var(--accent-${isLate ? 'ruby' : (b.status==='PAID'?'emerald':'ice')})">
           <div class="row" style="justify-content:space-between; margin-bottom:10px;">
              <div class="row">
                 <div style="width:30px; height:30px; background:rgba(255,255,255,0.1); border-radius:8px; display:grid; place-items:center;">
                    <i class="fa-solid ${icon}"></i>
                 </div>
                 <div>
                    <div style="font-weight:bold;">${b.name}</div>
                    <div class="muted" style="font-size:11px;">${b.type}</div>
                 </div>
              </div>
              <div style="font-weight:900; font-size:16px;">${fmt(b.amount)}</div>
           </div>
           <div class="row" style="justify-content:space-between; align-items:center; font-size:12px;">
              <div class="mono muted">Due: ${b.due_date || 'N/A'}</div>
              <span class="tag"><span class="dot ${isLate?'late':(b.status==='PAID'?'posted':'pending')}"></span>${statusText}</span>
           </div>
           ${this.role === 'Administrator' ? `<button class="btn-ghost btn-mini" style="width:100%; margin-top:10px;" onclick="Ark.markPaid('${b.id}')">MARK PAID</button>` : ''}
        </div>
      `;
    });
  },

  async saveBill() {
    const payload = {
      user_id: this.user.id,
      name: document.getElementById("b-name").value,
      type: document.getElementById("b-type").value,
      amount: document.getElementById("b-amt").value,
      due_date: document.getElementById("b-date").value,
      status: 'DUE'
    };
    await sb.from("bills").insert(payload);
    document.getElementById("modal").style.display = "none";
    this.loadBills();
  },

  async markPaid(id) {
    if(this.role !== 'Administrator') return;
    await sb.from("bills").update({ status: 'PAID' }).eq('id', id);
    this.loadBills();
  },

  // --- MESSAGES ---
  async loadMessages() {
    const { data: msgs } = await sb.from("messages").select("*").order("created_at");
    const box = document.getElementById("chat-box");
    box.innerHTML = "";
    
    msgs.forEach(m => {
      // Logic: Identify Sender
      // If I am Admin: is_admin_sender=true is ME.
      // If I am User: is_admin_sender=true is THEM.
      let isMe = false;
      if (this.role === 'Administrator') isMe = m.is_admin_sender;
      else isMe = (m.sender_id === this.user.id);

      box.innerHTML += `
        <div class="msg-row ${isMe ? 'msg-me' : 'msg-them'}">
           <div class="msg-bubble">${m.content}</div>
           <div class="msg-time">${new Date(m.created_at).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</div>
        </div>
      `;
    });
    box.scrollTop = box.scrollHeight;
  },

  async sendMessage() {
    const input = document.getElementById("msg-input");
    if(!input.value) return;
    
    await sb.from("messages").insert({
        sender_id: this.user.id,
        content: input.value,
        is_admin_sender: (this.role === 'Administrator')
    });
    input.value = "";
    this.loadMessages();
  },

  // --- UTILS ---
  openCompose(mode) {
    document.getElementById("modal").style.display = "flex";
    if(mode === 'bill') document.getElementById("mode-bill").style.display = "block";
    if(mode === 'transaction') {
        document.getElementById("mode-transaction").style.display = "block";
        this.populateAccountSelect();
    }
  },
  
  async populateAccountSelect() {
      const { data } = await sb.from("accounts").select("*");
      document.getElementById("t-acc").innerHTML = data.map(a => `<option value="${a.id}">${a.name}</option>`).join("");
  },

  async saveTransaction() {
      // Admin Only Funds/Charge
      await sb.from("transactions").insert({
          user_id: this.user.id,
          account_id: document.getElementById("t-acc").value,
          amount: document.getElementById("t-amt").value,
          description: document.getElementById("t-desc").value,
          status: 'POSTED'
      });
      document.getElementById("modal").style.display = "none";
      this.loadAccounts();
  },

  closeCompose() { 
      document.getElementById("modal").style.display = "none"; 
      document.querySelectorAll("#modal .sheetbody > div").forEach(d => d.style.display="none");
  }
};

Ark.init();
