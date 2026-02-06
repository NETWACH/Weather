// --- CONFIGURATION ---
// Replace with your actual Supabase URL and Key
const SUPABASE_URL = "https://cumebdvojadpxaxdmabb.supabase.co";
const SUPABASE_KEY = "sb_publishable_uTgHvSCKusJCK8aSfejzbw_Oxket8q2";
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const Admin = {
  currentTable: 'transactions',
  currentData: [],
  editingId: null,

  async init() {
    // 1. Check Login Status
    const { data } = await sb.auth.getSession();
    if (!data.session) {
      // If not logged in, kick them back to the main app
      window.location.href = "index.html"; 
      return;
    }
    console.log("Admin Logged in:", data.session.user.email);
    this.refreshTable();
  },

  // Switch between tabs (Transactions, Accounts, etc.)
  async loadTable(tableName, el) {
    this.currentTable = tableName;
    
    // Update sidebar styling
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    if(el) el.classList.add('active');
    
    // Update Title
    document.getElementById('table-title').textContent = tableName.replace('_', ' ').toUpperCase();
    
    await this.refreshTable();
  },

  // Fetch data from Supabase
  async refreshTable() {
    const tbody = document.getElementById('grid-body');
    const thead = document.getElementById('grid-head');
    const loading = document.getElementById('loading');
    
    tbody.innerHTML = '';
    thead.innerHTML = '';
    loading.style.display = 'block';
    loading.textContent = `Fetching data from ${this.currentTable}...`;

    // Fetch up to 50 records, newest first
    const { data, error } = await sb
      .from(this.currentTable)
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);

    loading.style.display = 'none';

    if (error) {
      console.error("Supabase Error:", error);
      tbody.innerHTML = `<tr><td colspan="10" style="color:#ff4757; padding:20px;">
        <strong>Error:</strong> ${error.message}<br>
        <span style="font-size:11px; opacity:0.7;">Check your Database Policies (RLS).</span>
      </td></tr>`;
      return;
    }

    if (!data || data.length === 0) {
      tbody.innerHTML = `<tr><td colspan="10" class="muted" style="padding:20px; text-align:center;">
        No records found in <strong>${this.currentTable}</strong>.
      </td></tr>`;
      return;
    }

    this.currentData = data;

    // Build Table Headers dynamically
    const keys = Object.keys(data[0]);
    let headHtml = '<tr>';
    keys.forEach(k => { 
      // Skip technical ID fields to keep the view clean
      if(k !== 'user_id' && k !== 'account_id') headHtml += `<th>${k}</th>`; 
    });
    headHtml += '<th>ACTION</th></tr>';
    thead.innerHTML = headHtml;

    // Build Table Rows
    data.forEach(row => {
      let tr = '<tr>';
      keys.forEach(k => {
        if(k !== 'user_id' && k !== 'account_id') {
          let val = row[k];
          // Formatting
          if(k.includes('amount') || k.includes('total') || k.includes('balance')) val = `$${Number(val).toLocaleString()}`;
          if(k === 'created_at') val = new Date(val).toLocaleDateString();
          tr += `<td>${val}</td>`;
        }
      });
      tr += `<td><button class="action-btn" onclick="Admin.openEdit('${row.id}')">Edit</button></td>`;
      tr += '</tr>';
      tbody.innerHTML += tr;
    });
  },

  // Open the Edit Modal
  openEdit(id) {
    this.editingId = id;
    const record = this.currentData.find(r => r.id === id);
    const container = document.getElementById('edit-form');
    container.innerHTML = '';

    if (!record) return;

    Object.keys(record).forEach(key => {
      // Prevent editing of technical IDs
      const isReadOnly = (key === 'id' || key === 'created_at' || key === 'user_id');
      const val = record[key] === null ? '' : record[key];
      
      let inputHtml = '';

      // --- SPECIAL FIELDS FOR YOUR BUSINESS/LOAN LOGIC ---

      // 1. Category Dropdown (For Accounts)
      if (key === 'category') {
        inputHtml = `
          <select class="select" id="field-${key}">
            <option value="General" ${val === 'General' ? 'selected' : ''}>General</option>
            <option value="Business" ${val === 'Business' ? 'selected' : ''}>Business</option>
            <option value="Personal" ${val === 'Personal' ? 'selected' : ''}>Personal</option>
            <option value="Loan" ${val === 'Loan' ? 'selected' : ''}>Loan (Roommate)</option>
          </select>`;
      } 
      // 2. Roommate Email Field (For Accounts)
      else if (key === 'shared_with_email') {
        inputHtml = `
          <input class="input" id="field-${key}" value="${val}" placeholder="roommate@example.com" />
          <div style="font-size:10px; color:#ff4757; margin-top:4px;">
            * The user with this email will be able to see this account.
          </div>
        `;
      }
      // 3. Status Dropdown (For Invoices/Transactions)
      else if (key === 'status') {
         inputHtml = `
          <select class="select" id="field-${key}">
            <option value="POSTED" ${val === 'POSTED' ? 'selected' : ''}>POSTED</option>
            <option value="PENDING" ${val === 'PENDING' ? 'selected' : ''}>PENDING</option>
            <option value="DRAFT" ${val === 'DRAFT' ? 'selected' : ''}>DRAFT</option>
            <option value="PAID" ${val === 'PAID' ? 'selected' : ''}>PAID</option>
          </select>`;
      }
      // 4. Default Text Input
      else {
        inputHtml = `<input class="input" id="field-${key}" value="${String(val).replaceAll('"', '&quot;')}" ${isReadOnly ? 'disabled style="opacity:0.5;"' : ''} />`;
      }
      
      container.innerHTML += `
        <div class="field-group">
          <div class="field-label">${key.replace(/_/g, ' ')}</div>
          ${inputHtml}
        </div>
      `;
    });

    document.getElementById('edit-modal').style.display = 'flex';
  },

  // Save Changes to Database
  async saveRecord() {
    const inputs = document.querySelectorAll('#edit-form input:not([disabled]), #edit-form select');
    const updates = {};

    inputs.forEach(input => {
      const key = input.id.replace('field-', '');
      let val = input.value;
      
      // Convert numbers if possible
      if (!isNaN(val) && val !== '' && key !== 'shared_with_email' && key !== 'number') {
          val = Number(val);
      }
      updates[key] = val;
    });

    const { error } = await sb
      .from(this.currentTable)
      .update(updates)
      .eq('id', this.editingId);

    if (error) {
      document.getElementById('modal-error').textContent = "Error: " + error.message;
      document.getElementById('modal-error').style.display = 'block';
    } else {
      this.closeModal();
      this.refreshTable();
    }
  },

  // Delete Record
  async deleteRecord() {
    if(!confirm("Are you sure? This cannot be undone.")) return;

    const { error } = await sb
      .from(this.currentTable)
      .delete()
      .eq('id', this.editingId);

    if (error) {
      alert("Error deleting: " + error.message);
    } else {
      this.closeModal();
      this.refreshTable();
    }
  },

  closeModal(e) {
    if (!e || e.target.id === 'edit-modal' || !e.target.id) {
      document.getElementById('edit-modal').style.display = 'none';
      document.getElementById('modal-error').style.display = 'none';
    }
  }
};

// Start the Admin App
Admin.init();
