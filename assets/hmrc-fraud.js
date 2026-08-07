// Collects the browser-side HMRC Fraud Prevention Header signals for the
// "Web application via server" connection method. Only loaded on
// /app/mtd/ -- kept out of the shared assets/app.js on purpose.
// These are carried through hmrc-authorize-url -> hmrc_oauth_state and
// combined server-side (netlify/functions/lib/hmrc.js) with values the
// server itself supplies (public IP, vendor version, etc.) at the point
// each HMRC API call is actually made.
(function () {
  function deviceId() {
    var key = 'dt_hmrc_device_id';
    var id = localStorage.getItem(key);
    if (!id) {
      id = (crypto.randomUUID ? crypto.randomUUID() : 'dt-' + Date.now() + '-' + Math.random().toString(16).slice(2));
      localStorage.setItem(key, id);
    }
    return id;
  }

  function timezone() {
    var mins = -new Date().getTimezoneOffset(); // minutes AHEAD of UTC
    var sign = mins >= 0 ? '+' : '-';
    var abs = Math.abs(mins);
    var hh = String(Math.floor(abs / 60)).padStart(2, '0');
    var mm = String(abs % 60).padStart(2, '0');
    return 'UTC' + sign + hh + ':' + mm;
  }

  function screens() {
    var s = window.screen || {};
    var parts = [
      'width=' + (s.width || 0),
      'height=' + (s.height || 0),
      'scaling-factor=' + (window.devicePixelRatio || 1),
      'colour-depth=' + (s.colorDepth || 24)
    ];
    return parts.join('&');
  }

  function windowSize() {
    return 'width=' + window.innerWidth + '&height=' + window.innerHeight;
  }

  function collectSignals() {
    return {
      userAgent: navigator.userAgent,
      deviceId: deviceId(),
      screens: screens(),
      timezone: timezone(),
      windowSize: windowSize()
    };
  }

  window.DTHmrc = {collectSignals: collectSignals};
})();
