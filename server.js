import express from "express";
import { chromium } from "playwright";

const app = express();
app.use(express.json());

const wait = (ms) => new Promise(r => setTimeout(r, ms));

function parseFrSlot(text) {
  const jours = ["dimanche","lundi","mardi","mercredi","jeudi","vendredi","samedi"];
  const m = (text || "").toLowerCase().match(/(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)[^0-9]*?(\d{1,2})h(?:\s?(\d{1,2}))?/);
  if (!m) return null;

  const jourTxt = m[1];
  const h = parseInt(m[2],10);
  const min = m[3] ? parseInt(m[3],10) : 0;

  const now = new Date();
  const target = new Date(now);
  const idxNow = now.getDay();
  const idxTarget = jours.indexOf(jourTxt);
  let delta = idxTarget - idxNow;

  if (delta < 0 || (delta === 0 && (h < now.getHours() || (h === now.getHours() && min <= now.getMinutes())))) {
    delta += 7;
  }

  target.setDate(now.getDate() + delta);
  target.setHours(h, min, 0, 0);
  return target;
}

app.post("/book", async (req, res) => {
  const { pageUrl, service, datetimeText, name, email, phone } = req.body || {};
  if (!pageUrl || !service || !datetimeText || !name || !email) {
    return res.status(400).json({ ok:false, reason:"missing_fields" });
  }

  const slot = parseFrSlot(datetimeText);
  if (!slot) return res.status(400).json({ ok:false, reason:"invalid_datetimeText" });

  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext({
      locale: "fr-FR",
      timezoneId: "America/Toronto"
    });
    const page = await ctx.newPage();

    // Booking Page publique (canal officiel Microsoft pour réserver)
    await page.goto(pageUrl, { waitUntil: "domcontentloaded" });

    await page.getByText(service, { exact: false }).first().click();
    await wait(300);

    const day = slot.getDate().toString();

    try {
      await page.getByRole('button', { name: new RegExp(`^${day}$`) }).first().click();
    } catch { /* fallback calendrier */ }

    await wait(500);

    const hh = slot.toLocaleTimeString("fr-CA",{hour:"2-digit",minute:"2-digit",hour12:false});

    let clicked = false;
    for (const pattern of [
      new RegExp(`^${hh.replace(':','h')}$`, 'i'),
      new RegExp(`^${hh}$`, 'i'),
      new RegExp(`^${slot.getHours()}h$`, 'i')
    ]) {
      const el = page.getByRole('button', { name: pattern }).first();
      if (await el.isVisible().catch(()=>false)) {
        await el.click();
        clicked = true;
        break;
      }
    }

    if (!clicked) {
      await page.getByRole('button', { name: /(\d{1,2}[:h]\d{2}|\d{1,2}h)/ }).first().click();
    }

    await wait(400);

    await page.getByLabel(/nom/i).fill(name).catch(async()=> await page.getByPlaceholder(/nom/i).fill(name));
    await page.getByLabel(/mail|courriel/i).fill(email).catch(async()=> await page.getByPlaceholder(/mail|courriel/i).fill(email));
    
    if (phone) {
      await page.getByLabel(/téléphone|phone/i).fill(phone).catch(async()=> await page.getByPlaceholder(/téléphone|phone/i).fill(phone));
    }

    await page.getByRole('button', { name: /réserver|book/i }).click();

    await wait(1200);

    const confirmed = await page.getByText(/confirmé|réservation effectuée|booking confirmed/i).first().isVisible().catch(()=>false);

    await browser.close();

    return res.json({
      ok: true,
      confirmed: {
        date: slot.toISOString().slice(0,10),
        time: hh,
        service
      }
    });

  } catch (e) {
    if (browser) await browser.close();
    return res.status(500).json({ ok:false, reason:"automation_error", detail:e.toString() });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Bookings automator running on :${PORT}`));
