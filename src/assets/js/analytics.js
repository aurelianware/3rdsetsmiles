// analytics.js — privacy-conscious, first-party conversion measurement.
//
// Design goals:
//   • No third-party scripts. Events push to window.dataLayer (so a future
//     GA4/GTM/Plausible tag can consume them with zero code changes) and,
//     when an endpoint is configured, beacon to a SAME-ORIGIN collector
//     (Content-Security-Policy here is connect-src 'self').
//   • No PHI. We NEVER send names, emails, phone numbers, appointment notes,
//     insurance details, or any free-text form value. Only the event name,
//     page path, referrer, UTM attribution, and a random attributionId.
//   • Fails silent. Any error here must never break the page.
//
// Event names are centralized in EVENTS below and documented in
// /docs/analytics.md. Add new events there, not as ad-hoc string literals.
(function () {
  'use strict';

  // ── Canonical conversion events (keep in sync with /docs/analytics.md) ──
  var EVENTS = {
    APPOINTMENT_REQUEST_STARTED: 'appointment_request_started',
    APPOINTMENT_REQUEST_SUBMITTED: 'appointment_request_submitted',
    PHONE_CTA_CLICKED: 'phone_cta_clicked',
    NEW_PATIENT_OFFER_CLICKED: 'new_patient_offer_clicked',
    INSURANCE_CHECK_STARTED: 'insurance_check_started',
    INSURANCE_CHECK_SUBMITTED: 'insurance_check_submitted',
    EMERGENCY_PHONE_CLICKED: 'emergency_phone_clicked',
    IMPLANT_CONSULTATION_CLICKED: 'implant_consultation_clicked',
    GOOGLE_REVIEW_CLICKED: 'google_review_clicked',
    DIRECTIONS_CLICKED: 'directions_clicked'
  };

  // Map a data-action value to a canonical event. Any unmapped "call-*"
  // action falls back to PHONE_CTA_CLICKED so new phone links are covered.
  var ACTION_EVENTS = {
    'request-appointment': EVENTS.APPOINTMENT_REQUEST_STARTED,
    'new-patient-offer': EVENTS.NEW_PATIENT_OFFER_CLICKED,
    'insurance-check': EVENTS.INSURANCE_CHECK_STARTED,
    'implant-consultation': EVENTS.IMPLANT_CONSULTATION_CLICKED,
    'google-review': EVENTS.GOOGLE_REVIEW_CLICKED,
    'directions': EVENTS.DIRECTIONS_CLICKED,
    'call-emergency': EVENTS.EMERGENCY_PHONE_CLICKED
  };

  var UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];
  // The only caller-supplied prop keys track() will forward. Everything else is
  // dropped client-side (the collector allowlists again server-side).
  var PROP_ALLOW = { action: true, form: true };
  var STORE_ATTR = '3ss_attribution';   // sessionStorage: UTM + landing + referrer
  var STORE_ID = '3ss_aid';             // localStorage: durable attributionId

  function safe(fn) { try { return fn(); } catch (e) { return undefined; } }

  // Endpoint is configured by the page (see base.njk). Empty ⇒ dataLayer only.
  function endpoint() {
    var cfg = window.SITE_ANALYTICS || {};
    return typeof cfg.endpoint === 'string' ? cfg.endpoint.trim() : '';
  }

  // A durable, non-PII id so a future CloudDentalOffice appointment can be
  // matched back to the website acquisition source. It identifies a browser,
  // not a person, and carries no personal data.
  function attributionId() {
    return safe(function () {
      var id = localStorage.getItem(STORE_ID);
      if (!id) {
        id = (window.crypto && crypto.randomUUID)
          ? crypto.randomUUID()
          : 'aid-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
        localStorage.setItem(STORE_ID, id);
      }
      return id;
    }) || '';
  }

  // Capture UTM + landing page + referrer once at the start of a session so
  // later conversions on other pages keep their acquisition source.
  function attribution() {
    return safe(function () {
      var existing = sessionStorage.getItem(STORE_ATTR);
      if (existing) return JSON.parse(existing);

      var params = new URLSearchParams(window.location.search);
      var data = { landing_page: window.location.pathname };
      // Keep only the referrer's origin + path — query strings and fragments
      // can carry sensitive values and this layer is explicitly no-PHI.
      var ref = document.referrer || '';
      if (ref && ref.indexOf(window.location.origin) !== 0) {
        var cleanRef = safe(function () { var u = new URL(ref); return (u.origin + u.pathname).slice(0, 200); });
        if (cleanRef) data.referrer = cleanRef;
      }
      UTM_KEYS.forEach(function (k) {
        var v = params.get(k);
        if (v) data[k] = v.slice(0, 120); // bound length; never trust input
      });
      sessionStorage.setItem(STORE_ATTR, JSON.stringify(data));
      return data;
    }) || {};
  }

  // The single choke point for emitting an event. `props` must contain only
  // non-PHI, low-cardinality metadata (never form values or contact details).
  function track(event, props) {
    if (!event) return;
    // Merge caller props FIRST, restricted to simple bounded scalars, so the
    // reserved/trusted fields set below always win. window.track is public, so
    // a caller must never be able to override event, attribution, ts or path.
    var payload = {};
    if (props) {
      for (var p in props) {
        if (!Object.prototype.hasOwnProperty.call(props, p)) continue;
        if (!PROP_ALLOW[p]) continue; // allowlist prop keys, not just types
        var val = props[p], t = typeof val;
        if (t === 'string') payload[p] = val.slice(0, 200);
        else if (t === 'boolean' || (t === 'number' && isFinite(val))) payload[p] = val;
      }
    }
    // Reserved fields — assigned LAST so props can never override them.
    payload.event = event;
    payload.ts = Date.now();
    payload.path = window.location.pathname;
    var attr = attribution();
    for (var k in attr) if (Object.prototype.hasOwnProperty.call(attr, k)) payload[k] = attr[k];
    payload.attribution_id = attributionId();

    // 1) dataLayer — consumed by GTM/GA4/etc. if/when added later.
    window.dataLayer = window.dataLayer || [];
    safe(function () { window.dataLayer.push(payload); });

    // 2) First-party beacon — only when an endpoint is configured.
    var url = endpoint();
    if (url) {
      safe(function () {
        var body = JSON.stringify(payload);
        if (navigator.sendBeacon) {
          navigator.sendBeacon(url, new Blob([body], { type: 'application/json' }));
        } else {
          fetch(url, { method: 'POST', body: body, headers: { 'Content-Type': 'application/json' }, keepalive: true });
        }
      });
    }

    // 3) Google Analytics 4 — only when gtag.js is loaded (ga4Id configured).
    // Forwards the conversion as a GA4 event with the same non-PHI params.
    if (typeof window.gtag === 'function') {
      safe(function () {
        window.gtag('event', event, {
          action: payload.action,
          form: payload.form,
          attribution_id: payload.attribution_id
        });
      });
    }
  }

  // Expose for manual/instrumented events elsewhere (e.g. form handlers).
  window.track = track;
  window.ANALYTICS_EVENTS = EVENTS;

  // Combined, non-PHI attribution for attaching to an appointment request so
  // CloudDentalOffice can later match a patient to their acquisition source.
  function getAttribution() {
    var out = {};
    var attr = attribution();
    for (var k in attr) if (Object.prototype.hasOwnProperty.call(attr, k)) out[k] = attr[k];
    out.attribution_id = attributionId();
    return out;
  }
  window.getAttribution = getAttribution;

  // Populate hidden `[data-attribution]` inputs (matched by name) on every form
  // so the request handler receives the acquisition source. Only fills empty
  // inputs the page explicitly opted into — never touches visible fields.
  function fillAttributionFields() {
    safe(function () {
      var data = getAttribution();
      var forms = document.querySelectorAll('form');
      for (var i = 0; i < forms.length; i++) {
        for (var key in data) {
          if (!Object.prototype.hasOwnProperty.call(data, key)) continue;
          var input = forms[i].querySelector('input[name="' + key + '"][data-attribution]');
          if (input && !input.value) input.value = data[key];
        }
      }
    });
  }

  // ── Auto-wire declarative CTAs via [data-action] ──
  document.addEventListener('click', function (e) {
    var el = e.target && e.target.closest ? e.target.closest('[data-action]') : null;
    if (!el) return;
    var action = el.getAttribute('data-action');
    if (!action) return;
    var event = ACTION_EVENTS[action];
    if (!event && action.indexOf('call-') === 0) event = EVENTS.PHONE_CTA_CLICKED;
    if (event) track(event, { action: action });
  }, true);

  // ── Appointment-request form submissions ──
  // Fires on the shared request form (#contact / #book, class .contact-form).
  // Sends no field values — only that a request was submitted.
  document.addEventListener('submit', function (e) {
    var form = e.target;
    if (!form || form.nodeName !== 'FORM') return;
    var isRequest = form.classList.contains('contact-form') || form.id === 'contact' || form.id === 'book';
    if (isRequest) track(EVENTS.APPOINTMENT_REQUEST_SUBMITTED, { form: form.id || 'contact' });
  }, true);

  // Establish attribution as early as possible in the session, then stamp it
  // onto any opted-in hidden form fields (defer guarantees the DOM is parsed).
  attribution();
  fillAttributionFields();
})();
