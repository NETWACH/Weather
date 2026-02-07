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
            document.getElementById('gate').style.display = 'none';
            document.getElementById('desktop').style.display = 'block';
            document.getElementById('os-panel').style.display = 'flex';
            if (typeof OS !== 'undefined') OS.startClock();
            this.tab('ledger');
        }
    },

    async login() {
        const email = document.getElementById('email').value;
        const pass = document.getElementById('password').value;
        try {
            const { data, error } = await sb.auth.signInWithPassword({ email, password: pass });
            if (error) {
                const errDiv = document.getElementById('login-err');
                if (errDiv) { errDiv.style.display = 'block'; errDiv.textContent = error.message; }
                return false;
            }
            this.user = data.user;
            return true;
        } catch (e) { return false; }
    },

    async logout() {
        await sb.auth.signOut();
        window.location.href = 'index.html'; 
    },

    tab(name) {
        const sections = ['ledger', 'pantry', 'bills'];
        sections.forEach(s => {
            const el = document.getElementById('view-' + s);
            if (el) el.style.display = 'none';
        });
        const target = document.getElementById('view-' + name);
        if (target) target.style.display = 'block';
        if (name === 'ledger') this.loadAccounts();
        if (name === 'bills') this.loadBills();
    },

    async loadAccounts() {
        const { data: accs } = await sb.from('accounts').select('*');
        const { data: txs } = await sb.from('transactions').select('*');
        const grid = document.getElementById('grid-accounts');
        if(!accs?.length) { 
            grid.innerHTML = '<div class="mono">> NO_ACTIVE_ACCOUNTS_FOUND</div>'; 
            return; 
        }
        grid.innerHTML = accs.map(a => {
            const bal = txs.filter(t => t.account_id === a.id).reduce((sum, t) => sum + Number(t.amount), 0);
            return `
                <div class="col-md-6 mb-3">
                    <div style="padding: 20px; background: rgba(255,255,255,0.03); border-radius: 10px; border: 1px solid rgba(255,255,255,0.05);">
                        <div class="mono" style="font-size: 10px; text-transform: uppercase; opacity: 0.6;">${a.name}</div>
                        <div style="font-size: 22px; font-weight: 700; margin: 5px 0; color: var(--neon-cyan);">${fmt(bal)}</div>
                        <div class="mono" style="font-size: 9px; opacity: 0.4;">ID: ${a.id.slice(0,12)}...</div>
                    </div>
                </div>`;
        }).join('');
    },

    async loadBills() {
        const { data: bills } = await sb.from('bills').select('*').order('due_date');
        const grid = document.getElementById('grid-bills');
        if(!grid) return;
        if(!bills || bills.length === 0) {
            grid.innerHTML = '<div class="mono">> OBLIGATION_BUFFER_EMPTY</div>';
            return;
        }
        grid.innerHTML = bills.map(b => {
            const isLate = b.status !== 'PAID' && new Date(b.due_date) < new Date();
            const color = b.status === 'PAID' ? '#00ff88' : (isLate ? '#ff4f4f' : 'var(--neon-cyan)');
            return `
                <div class="col-md-12 mb-2">
                    <div style="padding: 15px; background: rgba(255,255,255,0.03); border-left: 3px solid ${color}; display: flex; justify-content: space-between; align-items: center;">
                        <div class="mono" style="font-size: 14px;">${b.name}</div>
                        <div class="mono" style="color: ${color};">${fmt(b.amount)}</div>
                    </div>
                </div>`;
        }).join('');
    }
};

Client.init();
