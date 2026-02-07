const SB_URL = "https://cumebdvojadpxaxdmabb.supabase.co";
const SB_KEY = "sb_publishable_uTgHvSCKusJCK8aSfejzbw_Oxket8q2";
const sb = window.supabase.createClient(SB_URL, SB_KEY);

const Admin = {
  users: [],

  async init() {
    // Verify session and admin status before loading data
    const { data: { session } } = await sb.auth.getSession();
    if (!session) return window.location.href = 'app.html';

    const { data: prof } = await sb.from('profiles').select('is_admin').eq('id', session.user.id).single();
    if (!prof?.is_admin) {
        alert("ACCESS DENIED: Insufficient Clearances.");
        window.location.href = 'app.html';
        return;
    }

    this.loadUserLogic();
  },

  async loadUserLogic() {
    // Fetch all profiles from the database
    const { data: profiles, error } = await sb.from('profiles').select('*').order('full_name');
    
    const tableBody = document.getElementById('user-table');
    
    if (error) {
        tableBody.innerHTML = `<tr><td colspan="4" class="neg">Encryption Error: ${error.message}</td></tr>`;
        return;
    }

    if (!profiles.length) {
        tableBody.innerHTML = `<tr><td colspan="4" class="muted">No lifeforms detected in the system.</td></tr>`;
        return;
    }

    tableBody.innerHTML = profiles.map(u => `
      <tr>
        <td>
            <div style="font-weight:600;">${u.full_name || 'Anonymous User'}</div>
            <div class="muted" style="font-size:10px;">${u.id}</div>
        </td>
        <td>
            <span style="color: ${u.is_admin ? 'var(--accent-ruby)' : 'var(--accent-emerald)'}; font-weight: bold;">
                ${u.is_admin ? 'COMMANDER' : 'OPERATIVE'}
            </span>
        </td>
        <td><span class="pos">ACTIVE</span></td>
        <td>
            <button class="btn-ghost" style="padding: 5px 12px; font-size: 10px;" onclick="Admin.toggleRole('${u.id}', ${u.is_admin})">
                TOGGLE PERMS
            </button>
        </td>
      </tr>
    `).join('');
  },

  async toggleRole(userId, currentStatus) {
    const { error } = await sb
        .from('profiles')
        .update({ is_admin: !currentStatus })
        .eq('id', userId);

    if (error) {
        alert("Failed to modify permissions: " + error.message);
    } else {
        this.loadUserLogic();
    }
  },

  async sync() {
    console.log("Re-aligning satellites...");
    const syncBtn = document.querySelector('.btn-elite i');
    syncBtn.classList.add('fa-spin');
    
    await this.loadUserLogic();
    
    setTimeout(() => {
        syncBtn.classList.remove('fa-spin');
    }, 1000);
  }
};

// Start the terminal
Admin.init();