(function () {
  var slots = [];
  var fallbackMode = false;
  var type = document.getElementById("book-reason");
  var provider = document.getElementById("book-provider");
  var location = document.getElementById("book-location");
  var date = document.getElementById("book-date");
  var time = document.getElementById("book-time");
  var token = document.getElementById("book-availability-token");
  var preferredStart = document.getElementById("book-preferred-start");
  var status = document.getElementById("book-availability-status");
  var retry = document.getElementById("book-availability-retry");
  if (!type || !date || !time || !token || !preferredStart) return;
  var requestedIntent = new URLSearchParams(window.location.search).get("appointmentType") || "";

  function normalized(value) {
    return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  }
  function intentMatch(slot) {
    var wanted = normalized(requestedIntent);
    if (!wanted) return false;
    var code = normalized(slot.appointmentTypeCode);
    var name = normalized(slot.appointmentTypeName);
    if (wanted === code || wanted === name) return true;
    var aliases = {
      "new patient": ["new patient", "new patient exam", "new patient cleaning"],
      "new patient exam": ["new patient", "new patient exam", "new patient cleaning"],
      "emergency": ["emergency", "urgent"],
      "cosmetic consult": ["cosmetic", "cosmetic consultation"],
      "cosmetic consultation": ["cosmetic", "cosmetic consultation"],
      "implant consult": ["implant", "implant consultation", "dental implant"],
      "implant consultation": ["implant", "implant consultation", "dental implant"]
    };
    return (aliases[wanted] || []).some(function (term) {
      return code.indexOf(term) !== -1 || name.indexOf(term) !== -1;
    });
  }
  function emit(event, props) {
    if (window.track && window.ANALYTICS_EVENTS && window.ANALYTICS_EVENTS[event]) {
      window.track(window.ANALYTICS_EVENTS[event], props || {});
    }
  }

  function unique(items, key, label) {
    var seen = new Map(); items.forEach(function (item) { if (item[key]) seen.set(item[key], item[label] || item[key]); });
    return Array.from(seen.entries());
  }
  function fill(select, values, prompt) {
    select.innerHTML = "";
    var first = document.createElement("option"); first.value = ""; first.textContent = prompt; select.appendChild(first);
    values.forEach(function (entry) { var option = document.createElement("option"); option.value = entry[0]; option.textContent = entry[1]; select.appendChild(option); });
    select.disabled = values.length === 0;
  }
  function phoenixDate(value) {
    var parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Phoenix", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(value));
    var valueOf = function (name) { return parts.find(function (part) { return part.type === name; }).value; };
    return valueOf("year") + "-" + valueOf("month") + "-" + valueOf("day");
  }
  function prettyDate(value) { return new Date(value + "T12:00:00-07:00").toLocaleDateString("en-US", { timeZone: "America/Phoenix", weekday: "short", month: "short", day: "numeric" }); }
  function weekday(value) { return new Date(value + "T12:00:00-07:00").toLocaleDateString("en-US", { timeZone: "America/Phoenix", weekday: "short" }); }
  function matching() {
    return slots.filter(function (slot) {
      return (!type.value || slot.appointmentTypeCode === type.value) && (!provider.value || slot.providerCode === provider.value) && (!location.value || slot.locationCode === location.value);
    });
  }
  function resetSelection() { token.value = ""; preferredStart.value = ""; }

  // ---- General appointment request fallback --------------------------------
  // When live availability can't be shown (Cloud Dental Office not configured,
  // the service is unreachable, or it returns no online times), the page still
  // has to work: the visitor picks a preferred weekday and time window and we
  // submit it as a general request for staff to confirm — no live slot token.
  // This mirrors the office-hours booking model ("we'll reach out to confirm
  // your exact appointment time") and keeps /book/ usable before the scheduling
  // backend is wired up.
  var GENERAL_TYPES = [
    ["New Patient Exam & Cleaning", "New Patient Exam & Cleaning"],
    ["Cleaning & Checkup", "Cleaning & Checkup"],
    ["Tooth Pain / Emergency", "Tooth Pain / Emergency"],
    ["Cosmetic Consultation", "Cosmetic Consultation"],
    ["Implant Consultation", "Implant Consultation"],
    ["Other / Not sure", "Other / Not sure"]
  ];
  function generalDates() {
    var out = []; var seen = {};
    for (var i = 1; out.length < 20 && i <= 45; i++) {
      var iso = phoenixDate(new Date(Date.now() + i * 86400000));
      if (seen[iso]) continue; seen[iso] = 1;
      var wd = weekday(iso);
      if (wd === "Sat" || wd === "Sun") continue; // office is closed on weekends
      out.push([iso, prettyDate(iso)]);
    }
    return out;
  }
  function generalTimes() {
    var out = [];
    // Office hours Mon–Fri 10:00am–6:00pm; offer request windows up to 5:30pm.
    for (var h = 10; h <= 17; h++) {
      for (var m = 0; m < 60; m += 30) {
        var v = (h < 10 ? "0" : "") + h + ":" + (m === 0 ? "00" : "30");
        var label = new Date("2000-01-01T" + v + ":00-07:00").toLocaleTimeString("en-US", { timeZone: "America/Phoenix", hour: "numeric", minute: "2-digit" });
        out.push([v, label]);
      }
    }
    return out;
  }
  function enterGeneralRequestMode(note) {
    fallbackMode = true; slots = [];
    resetSelection();
    fill(type, GENERAL_TYPES, "Choose an appointment type"); type.disabled = false;
    fill(provider, [], "Any available provider"); provider.disabled = true;
    fill(location, [], "Any available location"); location.disabled = true;
    fill(date, generalDates(), "Choose a preferred date"); date.disabled = false;
    fill(time, [], "Choose a date first"); time.disabled = true;
    time._availableSlots = [];
    status.textContent = note || "Choose a preferred date and time and we'll confirm within one business day. Prefer to talk? Call (480) 334-2752.";
    if (retry) retry.hidden = false;
  }

  function updateDates() {
    resetSelection();
    var values = unique(matching().map(function (slot) { return { code: phoenixDate(slot.start), name: prettyDate(phoenixDate(slot.start)) }; }), "code", "name");
    fill(date, values, values.length ? "Choose a date" : "No dates available"); fill(time, [], "Choose a date first");
  }
  function updateFilters() {
    var forType = slots.filter(function (slot) { return slot.appointmentTypeCode === type.value; });
    fill(provider, unique(forType, "providerCode", "providerName"), "Any available provider");
    fill(location, unique(forType, "locationCode", "locationName"), "Any available location");
    updateDates();
  }
  function updateTimes() {
    resetSelection();
    if (fallbackMode) {
      fill(time, date.value ? generalTimes() : [], date.value ? "Choose a preferred time" : "Choose a date first");
      return;
    }
    var available = matching().filter(function (slot) { return phoenixDate(slot.start) === date.value; });
    fill(time, available.map(function (slot, index) {
      return [String(index), new Date(slot.start).toLocaleTimeString("en-US", { timeZone: "America/Phoenix", hour: "numeric", minute: "2-digit" })];
    }), available.length ? "Choose a time" : "No times available");
    time._availableSlots = available;
  }
  function selectTime() {
    if (fallbackMode) {
      token.value = "";
      preferredStart.value = (date.value && time.value) ? new Date(date.value + "T" + time.value + ":00-07:00").toISOString() : "";
      return;
    }
    var selected = time._availableSlots && time._availableSlots[Number(time.value)];
    token.value = selected ? selected.availabilityToken : ""; preferredStart.value = selected ? selected.start : "";
  }
  async function load() {
    var selected = document.querySelector('input[name="patientRelationship"]:checked');
    if (!selected) return;
    fallbackMode = false;
    status.textContent = "Loading current availability…"; type.disabled = true; resetSelection();
    if (retry) retry.hidden = true;
    var from = new Date(); var to = new Date(from.getTime() + 30 * 86400000);
    var query = new URLSearchParams({ patientRelationship: selected.value, from: from.toISOString(), to: to.toISOString() });
    try {
      var response = await fetch("/booking-availability?" + query.toString(), { headers: { Accept: "application/json" } });
      if (!response.ok) {
        // Availability isn't configured or is temporarily down — don't dead-end.
        // Fall back to a general request so the visitor can still book.
        enterGeneralRequestMode();
        return;
      }
      slots = await response.json();
      if (!Array.isArray(slots) || slots.length === 0) {
        // No online times to show — still let the visitor request a preferred time.
        enterGeneralRequestMode("No specific times are open online right now, but you can still request a preferred date and time below and we'll confirm within one business day.");
        return;
      }
      fill(type, unique(slots, "appointmentTypeCode", "appointmentTypeName"), "Choose an appointment type");
      fill(provider, [], "Choose an appointment type first"); fill(location, [], "Choose an appointment type first"); fill(date, [], "Choose an appointment type first"); fill(time, [], "Choose a date first");
      status.textContent = "Times shown are live and will be checked again when you submit.";
      if (retry) retry.hidden = true;
      emit("AVAILABILITY_VIEWED", { appointment_intent: normalized(requestedIntent) });
      var intendedSlot = slots.find(intentMatch);
      if (intendedSlot) {
        type.value = intendedSlot.appointmentTypeCode;
        updateFilters();
        status.textContent = "Appointment type selected from the page you visited. Times shown are live and will be checked again when you submit.";
        emit("APPOINTMENT_TYPE_SELECTED", { appointment_intent: normalized(requestedIntent) });
      } else if (requestedIntent) {
        status.textContent = "That visit type isn't available online right now. Please choose another appointment type or call the office.";
      }
    } catch (_) {
      // Network/parse failure — degrade to the general request form rather than
      // leaving the visitor with a broken, unusable page.
      enterGeneralRequestMode();
    }
  }
  document.querySelectorAll('input[name="patientRelationship"]').forEach(function (radio) { radio.addEventListener("change", load); });
  type.addEventListener("change", function () {
    if (fallbackMode) {
      if (type.value) emit("APPOINTMENT_TYPE_SELECTED", { appointment_intent: "patient-selected" });
      return;
    }
    updateFilters();
    if (type.value) emit("APPOINTMENT_TYPE_SELECTED", { appointment_intent: "patient-selected" });
  });
  provider.addEventListener("change", function () { if (!fallbackMode) updateDates(); });
  location.addEventListener("change", function () { if (!fallbackMode) updateDates(); });
  date.addEventListener("change", updateTimes); time.addEventListener("change", selectTime);
  if (retry) retry.addEventListener("click", load);
  if (["new patient", "new patient exam"].includes(normalized(requestedIntent))) {
    var newPatient = document.querySelector('input[name="patientRelationship"][value="New"]');
    if (newPatient) { newPatient.checked = true; load(); }
  }
})();
