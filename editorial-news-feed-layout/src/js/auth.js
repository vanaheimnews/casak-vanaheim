/* ============================================================
 * AuthService
 * ------------------------------------------------------------
 * Hardcoded-password gate for the admin dashboard.
 * NOT real security — only meant to keep casual visitors out of
 * the admin UI when this is hosted statically.
 * ============================================================ */
(function (global) {
  "use strict";

  // Change this to your own passphrase.
  var PASSWORD = "vanaheim2026";
  var SESSION_KEY = "vanaheim-admin-session";

  var AuthService = {
    login: function (input) {
      if (input === PASSWORD) {
        sessionStorage.setItem(SESSION_KEY, "1");
        return true;
      }
      return false;
    },

    logout: function () {
      sessionStorage.removeItem(SESSION_KEY);
    },

    isLoggedIn: function () {
      return sessionStorage.getItem(SESSION_KEY) === "1";
    }
  };

  global.AuthService = AuthService;
})(window);
