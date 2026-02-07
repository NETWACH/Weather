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
            this.showDashboard();
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
            if (errDiv) errDiv.textContent = "AUTH_FAILED: ACCESS_DENIED";
            return false;
        }
    },

    showDashboard() {
        const gate = document.getElementById('gate');
        const portal = document.getElementById('portal');
        
        // Start Fade Out of Login
        gate.style.opacity = '0';
        gate.style.pointerEvents = 'none';
        
        // Start Fade In of Portal
        portal.style.display = 'block';
        setTimeout(() => {
            portal.style.opacity = '1';
            this.loadAccounts();
            this.loadBills();
        }, 500);

        setTimeout(() => { gate.style.display = 'none'; }, 1000);
    },

    async logout() {
        await sb.auth.signOut();
        window.location.reload(); 
    },

    async loadAccounts() {
        const { data: accs } = await sb.from('accounts').select('*');
        const { data: txs } = await sb.from('transactions').select('*');
        const grid = document.getElementById('grid-accounts');
        if(!accs?.length) { 
            grid.innerHTML = '<div class="mono tiny opacity-50">> NO_ACTIVE_CHANNELS</div>'; 
            return; 
        }
        grid.innerHTML = accs.map(a => {
            const bal = txs.filter(t => t.account_id === a.id).reduce((sum, t) => sum + Number(t.amount), 0);
            return `
                <div class="col-md-6 mb-3">
                    <div class="portal-btn">
                        <div class="mono tiny opacity-50">${a.name}</div>
                        <div class="h4 mb-0" style="color:#00f2ff;">${fmt(bal)}</div>
                    </div>
                </div>`;
        }).join('');
    },

    async loadBills() {
        const { data: bills } = await sb.from('bills').select('*').order('due_date');
        const list = document.getElementById('grid-bills');
        if(!bills?.length) {
            list.innerHTML = '<div class="mono tiny opacity-50">> QUEUE_EMPTY</div>';
            return;
        }
        list.innerHTML = bills.map(b => {
            const isLate = b.status !== 'PAID' && new Date(b.due_date) < new Date();
            const color = b.status === 'PAID' ? '#00ff88' : (isLate ? '#ff4f4f' : '#00f2ff');
            return `<div class="mono tiny mb-2" style="color:${color}">[${b.status}] ${b.name}: ${fmt(b.amount)}</div>`;
        }).join('');
    }
};

Client.init();
