// ══════════════════════════════════════════════
// NotesGPT — Auth Module (Supabase)
// ══════════════════════════════════════════════

const Auth = (() => {
  let supabase = null;
  let currentUser = null;
  let currentSession = null;
  let onAuthChangeCallbacks = [];
  let isConfigured = false;

  // ── Initialize Supabase ──────────────────────
  async function init() {
    try {
      const res = await fetch("/api/auth-config");
      const data = await res.json();
      if (!data.configured) {
        console.warn("⚠️ Supabase not configured — running in guest mode");
        _updateUI(null);
        return;
      }
      // Initialize Supabase client
      supabase = window.supabase.createClient(data.config.supabaseUrl, data.config.supabaseAnonKey);
      isConfigured = true;

      // Listen for auth state changes
      supabase.auth.onAuthStateChange((event, session) => {
        currentSession = session;
        currentUser = session?.user || null;
        _updateUI(currentUser);
        onAuthChangeCallbacks.forEach((cb) => cb(currentUser));
      });

      // Check initial session
      const { data: { session } } = await supabase.auth.getSession();
      currentSession = session;
      currentUser = session?.user || null;
      _updateUI(currentUser);
      onAuthChangeCallbacks.forEach((cb) => cb(currentUser));

      console.log("🔐 Supabase Auth initialized");
    } catch (err) {
      console.warn("⚠️ Supabase init error:", err.message);
      _updateUI(null);
    }
  }

  // ── Google Sign-In ───────────────────────────
  async function signInWithGoogle() {
    if (!supabase) return _showError("Auth not configured");
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: window.location.origin,
        },
      });
      if (error) _showError(error.message);
    } catch (err) {
      _showError(err.message);
    }
  }

  // ── Apple Sign-In ────────────────────────────
  async function signInWithApple() {
    if (!supabase) return _showError("Auth not configured");
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "apple",
        options: {
          redirectTo: window.location.origin,
        },
      });
      if (error) _showError(error.message);
    } catch (err) {
      _showError(err.message);
    }
  }

  // ── Email/Password Sign-Up ───────────────────
  async function signUpWithEmail(email, password, displayName) {
    if (!supabase) return _showError("Auth not configured");
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: displayName || "" },
        },
      });
      if (error) {
        _showError(_friendlyError(error.message));
        return;
      }
      if (data.user && !data.session) {
        // Email confirmation required
        _showSuccess("Account created! Check your email to confirm.");
      } else {
        _closeModal();
      }
    } catch (err) {
      _showError(err.message);
    }
  }

  // ── Email/Password Sign-In ───────────────────
  async function signInWithEmail(email, password) {
    if (!supabase) return _showError("Auth not configured");
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) {
        _showError(_friendlyError(error.message));
        return;
      }
      _closeModal();
    } catch (err) {
      _showError(err.message);
    }
  }

  // ── Password Reset ───────────────────────────
  async function resetPassword(email) {
    if (!supabase) return _showError("Auth not configured");
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin,
      });
      if (error) {
        _showError(_friendlyError(error.message));
        return;
      }
      _showSuccess("Password reset email sent! Check your inbox.");
    } catch (err) {
      _showError(err.message);
    }
  }

  // ── Sign Out ─────────────────────────────────
  async function signOut() {
    if (!supabase) return;
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.error("Sign out error:", err);
    }
  }

  // ── Get current auth token ───────────────────
  async function getToken() {
    if (!currentSession) return null;
    try {
      // Refresh session if needed
      const { data: { session } } = await supabase.auth.getSession();
      return session?.access_token || null;
    } catch {
      return null;
    }
  }

  // ── Auth state listener ──────────────────────
  function onAuthChange(callback) {
    onAuthChangeCallbacks.push(callback);
    // Fire immediately with current state
    callback(currentUser);
  }

  // ── Check if logged in ───────────────────────
  function isLoggedIn() {
    return !!currentUser;
  }

  function getUser() {
    return currentUser;
  }

  function getIsConfigured() {
    return isConfigured;
  }

  // ── UI Helpers ───────────────────────────────

  function _updateUI(user) {
    const authBtn = document.getElementById("auth-btn");
    const profileBadge = document.getElementById("user-profile-badge");
    const profileAvatar = document.getElementById("user-avatar");
    const profileName = document.getElementById("user-display-name");
    const guestBanner = document.getElementById("guest-banner");

    if (user) {
      // Logged in
      if (authBtn) authBtn.style.display = "none";
      if (profileBadge) {
        profileBadge.style.display = "flex";
        const avatarUrl = user.user_metadata?.avatar_url || "";
        if (profileAvatar) {
          profileAvatar.src = avatarUrl;
          profileAvatar.style.display = avatarUrl ? "block" : "none";
        }
        if (profileName) {
          profileName.textContent =
            user.user_metadata?.full_name ||
            user.user_metadata?.name ||
            user.email?.split("@")[0] ||
            "Student";
        }
      }
      if (guestBanner) guestBanner.style.display = "none";
    } else {
      // Logged out / guest
      if (authBtn) authBtn.style.display = "inline-flex";
      if (profileBadge) profileBadge.style.display = "none";
      if (guestBanner && isConfigured) guestBanner.style.display = "flex";
    }
  }

  function _showError(msg) {
    const el = document.getElementById("auth-error-msg");
    if (el) {
      el.textContent = msg;
      el.style.display = "block";
      setTimeout(() => (el.style.display = "none"), 5000);
    }
  }

  function _showSuccess(msg) {
    const el = document.getElementById("auth-success-msg");
    if (el) {
      el.textContent = msg;
      el.style.display = "block";
      setTimeout(() => (el.style.display = "none"), 5000);
    }
  }

  function _closeModal() {
    const modal = document.getElementById("auth-overlay");
    if (modal) modal.classList.add("hidden");
  }

  function showModal() {
    const modal = document.getElementById("auth-overlay");
    if (modal) modal.classList.remove("hidden");
    // Reset to sign-in view
    _switchTab("signin");
  }

  function _switchTab(tab) {
    document.querySelectorAll(".auth-tab").forEach((t) => t.classList.remove("auth-tab--active"));
    document.querySelectorAll(".auth-form").forEach((f) => f.classList.add("hidden"));
    const tabEl = document.querySelector(`.auth-tab[data-tab="${tab}"]`);
    const formEl = document.getElementById(`auth-form-${tab}`);
    if (tabEl) tabEl.classList.add("auth-tab--active");
    if (formEl) formEl.classList.remove("hidden");
  }

  function _friendlyError(msg) {
    const lower = (msg || "").toLowerCase();
    if (lower.includes("invalid login")) return "Invalid email or password. Please try again.";
    if (lower.includes("already registered")) return "This email is already registered. Try signing in instead.";
    if (lower.includes("password")) return "Password must be at least 6 characters.";
    if (lower.includes("rate limit")) return "Too many attempts. Please wait a moment and try again.";
    if (lower.includes("email not confirmed")) return "Please confirm your email before signing in.";
    if (lower.includes("network")) return "Network error. Check your connection.";
    return msg || "Something went wrong. Please try again.";
  }

  // ── Wire up UI events ───────────────────────
  function _wireEvents() {
    // Auth button in header
    const authBtn = document.getElementById("auth-btn");
    if (authBtn) authBtn.addEventListener("click", showModal);

    // Close modal
    const closeBtn = document.getElementById("auth-close");
    if (closeBtn) closeBtn.addEventListener("click", _closeModal);

    // Overlay click to close
    const overlay = document.getElementById("auth-overlay");
    if (overlay) overlay.addEventListener("click", (e) => {
      if (e.target === overlay) _closeModal();
    });

    // Tab switching
    document.querySelectorAll(".auth-tab").forEach((tab) => {
      tab.addEventListener("click", () => _switchTab(tab.dataset.tab));
    });

    // Google sign-in
    const googleBtn = document.getElementById("auth-google-btn");
    if (googleBtn) googleBtn.addEventListener("click", signInWithGoogle);

    // Apple sign-in
    const appleBtn = document.getElementById("auth-apple-btn");
    if (appleBtn) appleBtn.addEventListener("click", signInWithApple);

    // Email sign-in form
    const signinForm = document.getElementById("signin-form");
    if (signinForm) {
      signinForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const email = document.getElementById("signin-email").value.trim();
        const password = document.getElementById("signin-password").value;
        if (email && password) signInWithEmail(email, password);
      });
    }

    // Email sign-up form
    const signupForm = document.getElementById("signup-form");
    if (signupForm) {
      signupForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const name = document.getElementById("signup-name").value.trim();
        const email = document.getElementById("signup-email").value.trim();
        const password = document.getElementById("signup-password").value;
        const confirm = document.getElementById("signup-confirm").value;
        if (password !== confirm) return _showError("Passwords don't match");
        if (email && password) signUpWithEmail(email, password, name);
      });
    }

    // Forgot password link
    const forgotBtn = document.getElementById("auth-forgot-btn");
    if (forgotBtn) {
      forgotBtn.addEventListener("click", (e) => {
        e.preventDefault();
        const email = document.getElementById("signin-email").value.trim();
        if (!email) return _showError("Enter your email above, then click Forgot Password");
        resetPassword(email);
      });
    }

    // Sign-out button
    const signoutBtn = document.getElementById("user-signout-btn");
    if (signoutBtn) signoutBtn.addEventListener("click", signOut);

    // Guest banner sign-in
    const guestSigninBtn = document.getElementById("guest-signin-btn");
    if (guestSigninBtn) guestSigninBtn.addEventListener("click", showModal);

    // Modal Continue as Guest
    const modalGuestBtn = document.getElementById("auth-modal-guest-btn");
    if (modalGuestBtn) {
      modalGuestBtn.addEventListener("click", (e) => {
        e.preventDefault();
        _closeModal();
      });
    }
  }

  // Auto-init when DOM ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => { _wireEvents(); init(); });
  } else {
    _wireEvents();
    init();
  }

  return {
    init,
    signInWithGoogle,
    signInWithApple,
    signUpWithEmail,
    signInWithEmail,
    resetPassword,
    signOut,
    getToken,
    onAuthChange,
    isLoggedIn,
    getUser,
    getIsConfigured,
    showModal,
  };
})();
