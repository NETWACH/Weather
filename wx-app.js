import // ---- Performance / Calm Mode ----
const prefersReduced =
  window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
  (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4);

if (prefersReduced) {
  document.body.classList.add("wx-calm");
}
 { createWXFX } from "./wx-fx.js";

const fx = createWXFX(document.getElementById("wx-fx"));

let wxUnit = "F";
let wxData = null;
let lastPressure = null;

// barometer tween
let pressureAnim = { raf: 0, from: null, to: null, start: 0, dur: 900 };

const DEFAULT_LAT = 40.7128;
const DEFAULT_LON = -74.0060;

const el = (id) => document.getElementById(id);
const els = {
  locate: el("wx-locate"),
  unitF: el("wx-unit-f"),
  unitC: el("wx-unit-c"),
  location: el("wx-location"),
  conditionText: el("wx-condition-text"),
  conditionIconContainer: el("wx-condition-icon-container"),
  currentTemp: el("wx-current-temp"),
  feelsLike: el("wx-feels-like"),
  hiLo: el("wx-hi-lo"),
  wind: el("wx-wind"),
  precip: el("wx-precip"),
  hourly: el("wx-hourly"),
  daily: el("wx-daily"),
  pressureValue: el("wx-pressure-value"),
  pressureTrend: el("wx-pressure-trend"),
  needle: el("wx-needle"),
  pressureArc: el("wx-pressure-arc"),
  pressureArcGlow: el("wx-pressure-arc-glow"),
  pressureDot: el("wx-pressure-dot"),
  radarLink: el("wx-radar-link"),
};

const root = document.documentElement;

function getWeatherInfo(code, isDay = 1) {
  const BG_CLEAR_DAY = ["#3b82f6", "#60a5fa"];
  const BG_CLEAR_NIGHT = ["#0f172a", "#1e293b"];
  const BG_CLOUDY_DAY = ["#64748b", "#94a3b8"];
  const BG_CLOUDY_NIGHT = ["#1e293b", "#334155"];
  const BG_RAIN = ["#334155", "#475569"];
  const BG_STORM = ["#0f172a", "#312e81"];
  const ICON_BASE = "icons/";

  const map = {
    0: { desc: "Clear Sky", file: isDay ? "day.svg" : "night.svg", bg: isDay ? BG_CLEAR_DAY : BG_CLEAR_NIGHT },
    1: { desc: "Mainly Clear", file: isDay ? "cloudy-day-1.svg" : "cloudy-night-1.svg", bg: isDay ? BG_CLEAR_DAY : BG_CLEAR_NIGHT },
    2: { desc: "Partly Cloudy", file: isDay ? "cloudy-day-1.svg" : "cloudy-night-1.svg", bg: isDay ? BG_CLEAR_DAY : BG_CLEAR_NIGHT },
    3: { desc: "Overcast", file: "cloudy.svg", bg: isDay ? BG_CLOUDY_DAY : BG_CLOUDY_NIGHT },
    45: { desc: "Fog", file: "cloudy.svg", bg: BG_CLOUDY_DAY },
    48: { desc: "Rime Fog", file: "cloudy.svg", bg: BG_CLOUDY_DAY },
    51: { desc: "Drizzle", file: "rainy-1.svg", bg: BG_RAIN },
    53: { desc: "Drizzle", file: "rainy-1.svg", bg: BG_RAIN },
    55: { desc: "Drizzle", file: "rainy-1.svg", bg: BG_RAIN },
    61: { desc: "Rain", file: "rainy-4.svg", bg: BG_RAIN },
    63: { desc: "Rain", file: "rainy-4.svg", bg: BG_RAIN },
    65: { desc: "Heavy Rain", file: "rainy-4.svg", bg: BG_RAIN },
    71: { desc: "Snow", file: "snowy-4.svg", bg: BG_RAIN },
    73: { desc: "Snow", file: "snowy-4.svg", bg: BG_RAIN },
    75: { desc: "Heavy Snow", file: "snowy-6.svg", bg: BG_RAIN },
    80: { desc: "Showers", file: "rainy-6.svg", bg: BG_RAIN },
    81: { desc: "Showers", file: "rainy-6.svg", bg: BG_RAIN },
    82: { desc: "Showers", file: "rainy-6.svg", bg: BG_RAIN },
    85: { desc: "Snow Showers", file: "snowy-6.svg", bg: BG_RAIN },
    86: { desc: "Snow Showers", file: "snowy-6.svg", bg: BG_RAIN },
    95: { desc: "Thunderstorm", file: "thunder.svg", bg: BG_STORM },
    96: { desc: "Thunderstorm", file: "thunder.svg", bg: BG_STORM },
    99: { desc: "Thunderstorm", file: "thunder.svg", bg: BG_STORM },
  };

  const res = map[code] || { desc: "Unknown", file: "weather.svg", bg: BG_CLOUDY_DAY };
  res.path = ICON_BASE + res.file;
  return res;
}

function getTemp(c) {
  return wxUnit === "F" ? Math.round((c * 9) / 5 + 32) : Math.round(c);
}
function getWind(mph) {
  return wxUnit === "F" ? `${Math.round(mph)} mph` : `${Math.round(mph * 1.60934)} km/h`;
}

function animateNumber(node, to, suffix = "") {
  if (!node) return;
  const from = Number(node.dataset.v ?? to);
  node.dataset.v = String(to);
  const start = performance.now();
  const dur = 520;
  const ease = (p) => 1 - Math.pow(1 - p, 3);

  function tick(now) {
    const p = Math.min(1, (now - start) / dur);
    const v = from + (to - from) * ease(p);
    node.textContent = `${Math.round(v)}${suffix}`;
    if (p < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  node.classList.remove("wx-value-pop");
  void node.offsetWidth;
  node.classList.add("wx-value-pop");
  setTimeout(() => node.classList.remove("wx-value-pop"), 180);
}

function formatTime(isoString, timezone, options) {
  return new Intl.DateTimeFormat("en-US", { timeZone: timezone, ...options }).format(new Date(isoString));
}

/* ===== Barometer core ===== */
function setPressureVisuals(pressure, trend) {
  const minP = 970;
  const maxP = 1040;
  const clamped = Math.max(minP, Math.min(maxP, pressure));
  const ratio = (clamped - minP) / (maxP - minP);

  // pressure hue mapping (looks clean + dramatic)
  // low pressure => warmer hue, high pressure => cooler hue
  const hue = Math.round(25 + ratio * (210 - 25));

  root.style.setProperty("--wx-p-ratio", String(ratio));
  root.style.setProperty("--wx-p-hue", String(hue));

  document.body.classList.toggle("wx-p-rising", trend === "rising");
  document.body.classList.toggle("wx-p-falling", trend === "falling");
  document.body.classList.toggle("wx-p-stable", trend === "stable");
}

function updateBarometerInstant(pressure) {
  const minP = 970;
  const maxP = 1040;
  const clamped = Math.max(minP, Math.min(maxP, pressure));
  const ratio = (clamped - minP) / (maxP - minP);

  const minDeg = -135;
  const maxDeg = 45;
  const deg = minDeg + ratio * (maxDeg - minDeg);

  if (els.needle) els.needle.style.transform = `translate(-50%, -50%) rotate(${deg}deg)`;

  const arcLen = 212;
  const offset = (1 - ratio) * arcLen;
  if (els.pressureArc) els.pressureArc.style.strokeDashoffset = `${offset}`;
  if (els.pressureArcGlow) els.pressureArcGlow.style.strokeDashoffset = `${offset}`;

  if (els.pressureDot) {
    const r = 45;
    const rad = (deg - 90) * (Math.PI / 180);
    const cx = 60 + Math.cos(rad) * r;
    const cy = 60 + Math.sin(rad) * r;
    els.pressureDot.style.transform = `translate(${cx}px, ${cy}px) translate(-50%, -50%)`;
  }

  if (els.pressureValue) {
    els.pressureValue.textContent = `${Math.round(pressure)} hPa`;
    els.pressureValue.classList.remove("wx-value-pop");
    void els.pressureValue.offsetWidth;
    els.pressureValue.classList.add("wx-value-pop");
    setTimeout(() => els.pressureValue.classList.remove("wx-value-pop"), 180);
  }
}

function updateBarometer(pressure) {
  let trend = "stable";
  if (lastPressure !== null) {
    const diff = pressure - lastPressure;
    if (Math.abs(diff) < 1) trend = "stable";
    else if (diff > 0) trend = "rising";
    else trend = "falling";
  }
  lastPressure = pressure;

  if (els.pressureTrend) {
    els.pressureTrend.textContent =
      trend === "stable" ? "Stable" : trend === "rising" ? "Rising" : "Falling";
  }

  setPressureVisuals(pressure, trend);

  const currentDisplayed = pressureAnim.to ?? pressure;
  pressureAnim.from = currentDisplayed;
  pressureAnim.to = pressure;
  pressureAnim.start = performance.now();

  cancelAnimationFrame(pressureAnim.raf);

  const ease = (p) => 1 - Math.pow(1 - p, 3);

  function step(now) {
    const p = Math.min(1, (now - pressureAnim.start) / pressureAnim.dur);
    const v = pressureAnim.from + (pressureAnim.to - pressureAnim.from) * ease(p);
    updateBarometerInstant(v);
    if (p < 1) pressureAnim.raf = requestAnimationFrame(step);
  }
  pressureAnim.raf = requestAnimationFrame(step);
}

/* ===== Render ===== */
function render() {
  if (!wxData) return;

  const { current_weather: curr, hourly, daily, timezone } = wxData;

  const info = getWeatherInfo(curr.weathercode, curr.is_day);

  els.location.textContent = wxData.locationName || "Local weather";
  els.conditionText.textContent = info.desc;
  els.conditionIconContainer.innerHTML = `<img src="${info.path}" alt="${info.desc}" class="wx-icon-hero">`;

  animateNumber(els.currentTemp, getTemp(curr.temperature), "°");

  els.wind.textContent = `Wind: ${getWind(curr.windspeed)}`;
  document.body.style.setProperty("--wx-wind", String(curr.windspeed || 0));

  root.style.setProperty("--wx-bg-top", info.bg[0]);
  root.style.setProperty("--wx-bg-bottom", info.bg[1]);

  // timezone-aware "now" index
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(now);

  const get = (t) => parts.find((p) => p.type === t)?.value;
  const key = `${get("year")}-${get("month")}-${get("day")}T${get("hour")}`;
  let idx = hourly.time.findIndex((t) => t.startsWith(key));
  if (idx === -1) idx = 0;

  const feelsC = hourly.apparent_temperature[idx];
  els.feelsLike.textContent = `Feels like ${getTemp(feelsC)}°`;

  const precipProb = hourly.precipitation_probability[idx] ?? 0;
  els.precip.textContent = `Precip: ${precipProb}%`;

  // FX
  const code = curr.weathercode;
  const isFog = code >= 45 && code <= 48;
  const isSnow = (code >= 71 && code <= 77) || (code >= 85 && code <= 86);
  const isRain = (code >= 51 && code <= 67) || (code >= 80 && code <= 82) || code >= 95;
  const mode = isFog ? "fog" : isSnow ? "snow" : isRain ? "rain" : "dust";

  fx.set({
    mode,
    windMph: Number(curr.windspeed || 0),
    intensity: Math.max(0, Math.min(1, precipProb / 100)),
  });

  // High/Low
  els.hiLo.textContent = `H:${getTemp(daily.temperature_2m_max[0])}° L:${getTemp(daily.temperature_2m_min[0])}°`;

  // Hourly HTML
  let hourlyHTML = "";
  for (let i = idx; i < idx + 24 && i < hourly.time.length; i++) {
    const hInfo = getWeatherInfo(hourly.weathercode[i], hourly.is_day[i]);
    const hTime = formatTime(hourly.time[i], timezone, { hour: "numeric" });

    hourlyHTML += `
      <div class="wx-hourly-item">
        <span class="wx-hourly-item-time">${i === idx ? "Now" : hTime}</span>
        <img src="${hInfo.path}" alt="${hInfo.desc}" class="wx-hourly-item-icon">
        <span class="wx-hourly-item-temp">${getTemp(hourly.temperature_2m[i])}°</span>
      </div>
    `;
  }
  els.hourly.innerHTML = hourlyHTML;

  // Daily HTML
  let dailyHTML = "";
  for (let i = 0; i < 7 && i < daily.time.length; i++) {
    const dInfo = getWeatherInfo(daily.weathercode[i], 1);
    const dLabel = i === 0 ? "Today" : formatTime(daily.time[i], timezone, { weekday: "long" });

    dailyHTML += `
      <div class="wx-daily-row">
        <span class="wx-daily-label">${dLabel}</span>
        <img src="${dInfo.path}" alt="${dInfo.desc}" class="wx-daily-icon">
        <div class="wx-daily-temps">
          <span>${getTemp(daily.temperature_2m_max[i])}°</span>
          <span>${getTemp(daily.temperature_2m_min[i])}°</span>
        </div>
      </div>
    `;
  }
  els.daily.innerHTML = dailyHTML;

  // Pressure
  const pres = hourly.surface_pressure?.[idx] ?? hourly.pressure_msl?.[idx];
  if (pres != null) updateBarometer(pres);

  // Radar
  els.radarLink.href = `https://www.windy.com/?${wxData.latitude},${wxData.longitude},10`;

  // Mark loaded (releases blur/opacity gating)
  document.body.classList.add("wx-loaded");
}

/* ===== Fetch ===== */
async function getLocationViaIP() {
  try {
    const res = await fetch("https://ipwho.is/", { cache: "no-store" });
    const data = await res.json();
    if (!data.success) return null;
    return { lat: data.latitude, lon: data.longitude, name: `${data.city}, ${data.country_code}` };
  } catch {
    return null;
  }
}

async function loadWeather(useGeo) {
  let lat = DEFAULT_LAT;
  let lon = DEFAULT_LON;
  let name = "New York, USA";

  els.location.textContent = "Locating...";
  els.conditionText.textContent = "Fetching...";

  let foundLocation = null;

  // Fast geo attempt (won't hang forever)
  if (useGeo && navigator.geolocation) {
    try {
      const pos = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 3500 });
      });
      foundLocation = { lat: pos.coords.latitude, lon: pos.coords.longitude, name: "My Location" };
    } catch {}
  }

  if (!foundLocation) {
    const ipLoc = await getLocationViaIP();
    if (ipLoc) foundLocation = ipLoc;
    else name = "New York (Fallback)";
  }

  if (foundLocation) {
    lat = foundLocation.lat;
    lon = foundLocation.lon;
    name = foundLocation.name;
  }

  const url =
    `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${lat}` +
    `&longitude=${lon}` +
    `&current_weather=true` +
    `&hourly=temperature_2m,apparent_temperature,precipitation_probability,weathercode,surface_pressure,pressure_msl,is_day` +
    `&daily=weathercode,temperature_2m_max,temperature_2m_min` +
    `&windspeed_unit=mph` +
    `&timezone=auto`;

  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error("API Error");
    const data = await res.json();
    wxData = { ...data, locationName: name };
    render();
  } catch (err) {
    console.error(err);
    els.location.textContent = "Connection Error";
    els.conditionText.textContent = "Failed to fetch weather";
  }
}

/* ===== Events ===== */
function setUnit(u) {
  wxUnit = u;
  els.unitF.classList.toggle("active", u === "F");
  els.unitC.classList.toggle("active", u === "C");
  render();
}

els.unitF.onclick = () => setUnit("F");
els.unitC.onclick = () => setUnit("C");
els.locate.onclick = () => loadWeather(true);

loadWeather(true);

document.addEventListener("visibilitychange", () => {
  if (!document.hidden) loadWeather(false);
});
