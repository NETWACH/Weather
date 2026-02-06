// --- CONFIGURATION ---
const SUPABASE_URL = "https://cumebdvojadpxaxdmabb.supabase.co";
const SUPABASE_KEY = "sb_publishable_uTgHvSCKusJCK8aSfejzbw_Oxket8q2";
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const Admin = {
  currentTable: 'transactions',
  currentData: [],
  editingId: null,

  async init() {
    // 1. Check Login
    const { data } = await sb.auth.getSession();
    if (!data.session) {
      alert("You are not logged in! Redirecting to login...");
      window.location.href = "index.html"; 
      return;
    }
    console.log("Logged in as:", data.session.user.email);
    this.refreshTable();
  },

  async loadTable(tableName, el) {
    this.currentTable = tableName;
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    if(el) el.classList.add('active');
    document.getElementById('table-title').textContent = tableName.replace('_', ' ').toUpperCase();
    await this.refreshTable();
  },

  async refreshTable() {
    const tbody = document.getElementById('grid-body');
    const thead = document.getElementById('grid-head');
    const loading = document.getElementById('loading');
    
    tbody.innerHTML = '';
    thead.innerHTML = '';
    loading.style.display = 'block';
    loading.textContent = `Fetching data from ${this.currentTable}...`;

    // 2. Fetch Data
    const { data, error } = await sb
      .from(this.currentTable)
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);

    loading.style.display = 'none';

    // 3. Handle Errors Explicitly
    if (error) {
      console.error("Supabase Error:", error);
      tbody.innerHTML = `<tr><td colspan="10" style="color:#ff4757; padding:20px;">
        <strong>Error Loading Data:</strong> ${error.message}<br>
        <span style="font-size:11px; opacity:0.7;">Hint: Does the table '${this.currentTable}' exist? Is RLS blocking it?</span>
      </td></tr>`;
      return;
    }

    // 4. Handle Empty Data
    if (!data || data.length === 0) {
      tbody.innerHTML = `<tr><td colspan="10" class="muted" style="padding:20px; text-align:center;">
        No records found in <strong>${this.currentTable}</strong>.<br>
        <span style="font-size:11px;">Go to the App and add some data first!</span>
      </td></tr>`;
      return;
    }

    this.currentData = data;

    // 5. Build Grid
    const keys = Object.keys(data[0]);
    let headHtml = '<tr>';
    keys.forEach(k => { if(k !== 'user_id') headHtml += `<th>${k}</th>`; });
    headHtml += '<th>ACTION</th></tr>';
    thead.innerHTML = headHtml;

    data.forEach(row => {
      let tr = '<tr>';
      keys.forEach(k => {
        if(k !== 'user_id') {
          let val = row[k];
          if(k.includes('amount') || k.includes('total')) val = `$${Number(val).toLocaleString()}`;
          if(k === 'created_at') val = new Date(val).toLocaleDateString();
          tr += `<td>${val}</td>`;
        }
      });
      tr += `<td><button class="action-btn" onclick="Admin.openEdit('${row.id}')">Edit</button></td>`;
      tr += '</tr>';
      tbody.innerHTML += tr;
    });
  },

  openEdit(id) {
    this.editingId = id;
    const record = this.currentData.find(r => r.id === id);
    const container = document.getElementById('edit-form');
    container.innerHTML = '';
    if (!record) return;

    Object.keys(record).forEach(key => {
      const isReadOnly = (key === 'id' || key === 'created_at' || key === 'user_id');
      const val = record[key] === null ? '' : record[key];
      container.innerHTML += `
        <div class="field-group">
          <div class="field-label">${key}</div>
          <input class="input" id="field-${key}" value="${String(val).replaceAll('"', '&quot;')}" ${isReadOnly ? 'disabled style="opacity:0.5;"' : ''} />
        </div>`;
    });
    document.getElementById('edit-modal').style.display = 'flex';
  },

  async saveRecord() {
    const inputs = document.querySelectorAll('#edit-form input:not([disabled])');
    const updates = {};
    inputs.forEach(input => {
      const key = input.id.replace('field-', '');
      let val = input.value;
      if (!isNaN(val) && val !== '') val = Number(val);
      updates[key] = val;
    });

    const { error } = await sb.from(this.currentTable).update(updates).eq('id', this.editingId);
    if (error) {
      alert("Error saving: " + error.message);
    } else {
      Admin.closeModal();
      Admin.refreshTable();
    }
  },

  async deleteRecord() {
    if(!confirm("Are you sure? This cannot be undone.")) return;
    const { error } = await sb.from(this.currentTable).delete().eq('id', this.editingId);
    if (error) { alert("Error deleting: " + error.message); } 
    else { Admin.closeModal(); Admin.refreshTable(); }
  },

  closeModal(e) {
    if (!e || e.target.id === 'edit-modal' || !e.target.id) {
      document.getElementById('edit-modal').style.display = 'none';
    }
  }
};

Admin.init();