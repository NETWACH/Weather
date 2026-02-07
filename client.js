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
            this.launchOS();
        }
    },

    async login() {
        const email = document.getElementById('email').value;
        const pass = document.getElementById('password').value;
        try {
            const { data, error } = await sb.auth.signInWithPassword({ email, password: pass });
            if (error) throw error;
            this.user = data.user;
            return true;
        } catch (e) {
            const errDiv = document.getElementById('login-err');
            if (errDiv) errDiv.textContent = e.message;
            return false;
        }
    },

    launchOS() {
        document.getElementById('gate').style.display = 'none';
        document.getElementById('desktop').style.display = 'block';
        document.getElementById('os-panel').style.display = 'flex';
        if (typeof OS !== 'undefined') OS.startClock();
        this.tab('ledger'); // Load ledger by default on boot
    },

    async logout() {
        await sb.auth.signOut();
        window.location.href = 'index.html'; 
    },

    tab(name) {
        // Hide all views first
        document.querySelectorAll('.view-section').forEach(s => s.style.display = 'none');
        const target = document.getElementById('view-' + name);
        if (target) target.style.display = 'block';
        
        if (name === 'ledger') this.loadAccounts();
        if (name === 'pantry') this.loadBills(); // Using loadBills for Pantry data currently
    },

    async loadAccounts() {
        const { data: accs } = await sb.from('accounts').select('*');
        const { data: txs } = await sb.from('transactions').select('*');
        const grid = document.getElementById('grid-accounts');
        
        if(!accs?.length) { 
            grid.innerHTML = '<div class="mono small opacity-50">> NO_ACTIVE_DATA_STREAMS</div>'; 
            return; 
        }
        
        grid.innerHTML = accs.map(a => {
            const bal = txs.filter(t => t.account_id === a.id).reduce((sum, t) => sum + Number(t.amount), 0);
            return `
                <div class="col-md-6 mb-3">
                    <div class="system-window p-3" style="border: 1px solid rgba(192, 192, 192, 0.2);">
                        <div class="mono small opacity-50">${a.name}</div>
                        <div class="h4 mb-0 text-info" style="color: var(--neon-cyan) !important;">${fmt(bal)}</div>
                    </div>
                </div>`;
        }).join('');
    },

    async loadBills() {
        const { data: bills } = await sb.from('bills').select('*').order('due_date');
        const grid = document.getElementById('grid-bills');
        
        if(!grid) return;
        if(!bills?.length) {
            grid.innerHTML = '<div class="mono small opacity-50">> PANTRY_MANIFEST_EMPTY</div>';
            return;
        }

        grid.innerHTML = bills.map(b => {
            const isLate = b.status !== 'PAID' && new Date(b.due_date) < new Date();
            const color = b.status === 'PAID' ? '#00ff88' : (isLate ? '#ff4f4f' : '#00f2ff');
            return `<div class="mono small mb-2" style="color:${color}">[${b.status}] ${b.name}: ${fmt(b.amount)}</div>`;
        }).join('');
    }
};

Client.init();
