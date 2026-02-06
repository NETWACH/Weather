async loadRole() {
    // 1. Get Profile to check Admin status
    const { data: profile } = await sb.from('profiles').select('is_admin').eq('id', this.user.id).single();
    
    const isAdmin = profile?.is_admin === true;
    this.role = isAdmin ? "Administrator" : "Viewer";

    // 2. Update Badge UI
    const badge = document.getElementById("role-display");
    if(badge) {
      const color = isAdmin ? "var(--accent-gold)" : "var(--accent-ice)";
      const icon = isAdmin ? "fa-shield-halved" : "fa-eye";
      badge.innerHTML = `<i class="fa-solid ${icon}"></i><span>${this.escape(this.role)}</span>`;
      badge.style.background = color;
    }

    // 3. SHOW/HIDE BUTTONS based on Role
    // We search for buttons by their text content or specific classes
    const hide = (selector) => {
      document.querySelectorAll(selector).forEach(el => {
        el.style.display = isAdmin ? 'inline-flex' : 'none';
      });
    };

    // Hide "New Entry", "Transfer", "Add Item", "New Invoice" buttons for non-admins
    if (!isAdmin) {
      hide(".btn-elite"); // Hides all major action buttons
      hide(".btn-ghost"); // Hides transfer/refresh buttons (optional, maybe keep refresh)
      
      // Manually show "Refresh" buttons back if you want viewers to be able to refresh
      document.querySelectorAll("button").forEach(b => {
        if(b.textContent.includes("Refresh") || b.textContent.includes("Sign Out")) {
          b.style.display = "inline-flex";
        }
      });
    }
  },
