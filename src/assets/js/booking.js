(function () {
  var slots = [];
  var type = document.getElementById("book-reason");
  var provider = document.getElementById("book-provider");
  var location = document.getElementById("book-location");
  var date = document.getElementById("book-date");
  var time = document.getElementById("book-time");
  var token = document.getElementById("book-availability-token");
  var preferredStart = document.getElementById("book-preferred-start");
  var status = document.getElementById("book-availability-status");
  if (!type || !date || !time || !token || !preferredStart) return;

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
  function matching() {
    return slots.filter(function (slot) {
      return (!type.value || slot.appointmentTypeCode === type.value) && (!provider.value || slot.providerCode === provider.value) && (!location.value || slot.locationCode === location.value);
    });
  }
  function resetSelection() { token.value = ""; preferredStart.value = ""; }
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
    var available = matching().filter(function (slot) { return phoenixDate(slot.start) === date.value; });
    fill(time, available.map(function (slot, index) {
      return [String(index), new Date(slot.start).toLocaleTimeString("en-US", { timeZone: "America/Phoenix", hour: "numeric", minute: "2-digit" })];
    }), available.length ? "Choose a time" : "No times available");
    time._availableSlots = available;
  }
  function selectTime() {
    var selected = time._availableSlots && time._availableSlots[Number(time.value)];
    token.value = selected ? selected.availabilityToken : ""; preferredStart.value = selected ? selected.start : "";
  }
  async function load() {
    var selected = document.querySelector('input[name="patientRelationship"]:checked');
    if (!selected) return;
    status.textContent = "Loading current availability…"; type.disabled = true; resetSelection();
    var from = new Date(); var to = new Date(from.getTime() + 30 * 86400000);
    var query = new URLSearchParams({ patientRelationship: selected.value, from: from.toISOString(), to: to.toISOString() });
    try {
      var response = await fetch("/booking-availability?" + query.toString(), { headers: { Accept: "application/json" } });
      if (!response.ok) throw new Error("availability");
      slots = await response.json();
      fill(type, unique(slots, "appointmentTypeCode", "appointmentTypeName"), slots.length ? "Choose an appointment type" : "No appointments available");
      fill(provider, [], "Choose an appointment type first"); fill(location, [], "Choose an appointment type first"); fill(date, [], "Choose an appointment type first"); fill(time, [], "Choose a date first");
      status.textContent = slots.length ? "Times shown are live and will be checked again when you submit." : "No online times are currently available. Please call us for help.";
    } catch (_) {
      slots = []; status.textContent = "We couldn't load online availability. Please try again or call (480) 334-2752.";
      fill(type, [], "Availability unavailable");
      fill(provider, [], "Availability unavailable"); fill(location, [], "Availability unavailable");
      fill(date, [], "Availability unavailable"); fill(time, [], "Availability unavailable");
      time._availableSlots = []; resetSelection();
    }
  }
  document.querySelectorAll('input[name="patientRelationship"]').forEach(function (radio) { radio.addEventListener("change", load); });
  type.addEventListener("change", updateFilters); provider.addEventListener("change", updateDates); location.addEventListener("change", updateDates);
  date.addEventListener("change", updateTimes); time.addEventListener("change", selectTime);
})();
