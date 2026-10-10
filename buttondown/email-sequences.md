# Sofrito Studio — Email Automation Sequences

Complete email copy for every automated flow. These map to the flows in
`buttondown/send_broadcast.py` and run as Buttondown broadcasts (tag-segmented
on the paid plan; whole-list on free).

> ⚠️ On Buttondown's FREE plan, emails broadcast to the whole list (no tags).
> Upgrade to Basic to segment leads vs. buyers for the session and onboarding
> flows to work as intended.

**Current offer:** 45-minute Sofrito Session — **$400**. Brand & Web Sprint —
**$997** for brand and website in 48 hours. A $400 session booked within 30 days
is credited in full toward the Sprint.

**Live destinations used below** (all verified 200):
- Booking: `https://sofritostudio.com/#book-now`
- Sprint: `https://sofritostudio.com/sprint.html`

---

## 1. Welcome / Lead Magnet (lead_magnet)

**Trigger:** New subscriber.
**Goal:** Build connection, offer the session.

**Subject:** Your 45-minute brand session is open

Hi —

You asked what your menu is really costing you. That's a 45-minute conversation, not a document.

A Sofrito Session is $400. In 45 minutes we go through your positioning, your menu, and the one fix that moves the most. If you then book the $997 Brand & Web Sprint within 30 days, the $400 comes straight off it.

Book a time: https://sofritostudio.com/#book-now

— The Ortiz kitchen, Sofrito Studio

> Live copy: `templates/lead_magnet.md`, `templates/welcome.md`, `templates/welcome_es.md`

---

## 2. Session → Sprint Conversion (tripwire)

**Trigger:** 24–48h after a subscriber joins.
**Goal:** Convert subscriber → $400 Session buyer, then Sprint.

### Email 1 (hour ~24) — the session
**Subject:** 45 minutes to get your brand straight

If your menu, your site, and your message don't line up, that's a 45-minute conversation, not a document.

A Sofrito Session is $400. In 45 minutes we go through your positioning, your menu, and the one fix that moves the most.

Book a time: https://sofritostudio.com/#book-now

— The Ortiz kitchen, Sofrito Studio

### Email 2 (hour ~48) — the Sprint
**Subject:** Your $400 session comes off the Sprint

If we've already done the session, the next step is the Brand & Web Sprint: $997 for brand and website in 48 hours.

Your $400 session is credited in full if you book within 30 days.

See the Sprint: https://sofritostudio.com/sprint.html

— The Ortiz kitchen, Sofrito Studio

---

## 3. Post-Session Onboarding (onboarding)

**Trigger:** After a booked session.
**Goal:** Recap, then the Sprint with the credit named.
**Segmentation:** Tag `customer:<tier>` (paid plan).

### Email 1 (immediate) — recap
**Subject:** Thanks — here's where we go from the session

Everything we agreed is written down in one place, so you don't have to remember it.

When you're ready for the next step, the Brand & Web Sprint is $997 for brand and website in 48 hours. Your $400 session is credited in full if you book within 30 days.

See the Sprint: https://sofritostudio.com/sprint.html

### Email 2 (day 7) — check-in + tip
**Subject:** How's the first week?

Have you written your homepage line yet from what we covered? If you want it looked at, reply to this email.

**Tip:** one clear sentence per section beats five bullet points.

Reply and tell us how it landed.

### Email 3 (day 14) — the Sprint
**Subject:** Ready for the next step?

The Brand & Web Sprint is $997 for brand and website in 48 hours. Your $400 session is credited in full if you book within 30 days.

https://sofritostudio.com/sprint.html

— The Ortiz kitchen, Sofrito Studio

> Live copy: `templates/onboarding.md`

---

## 4. Abandoned Cart (abandoned_cart)

**Trigger:** Started booking, didn't finish.
**Goal:** Recover the session booking.
**Segmentation:** Tag `cart:abandoned` (paid plan).

### Email 1 — reminder
**Subject:** Your cart is waiting

Looks like you started something and didn't finish. No worries — nothing is lost.

Right now the open door is a Sofrito Session: 45 minutes, $400, and one clear fix for your brand and menu. If you go on to the $997 Brand & Web Sprint within 30 days, the $400 comes straight off it.

Book a time: https://sofritostudio.com/#book-now

### Email 2 — plain nudge (no discount)
**Subject:** Your session is still open

Your $400 session is still open. 45 minutes to get your brand straight.

https://sofritostudio.com/#book-now

— The Ortiz kitchen, Sofrito Studio

> Live copy: `templates/abandoned_cart.md`
> Note: the old percentage-discount email was deleted. There is no product left
> to discount, so the second email is a plain re-offer, not an expiring code.

---

## 5. Seasonal (seasonal)

**Trigger:** High-volume holidays.
**Goal:** Drive session bookings before the rush.
**Segmentation:** Tag `seasonal:<holiday>` (paid plan).

### Thanksgiving (Nov)
**Subject:** Thanksgiving — book your session before the date

A $400 Sofrito Session is 45 minutes to get your brand and menu straight ahead of the holiday menu and the pernil timing.

Book: https://sofritostudio.com/#book-now

### Nochebuena / Navidad (Dec)
**Subject:** Nochebuena — book your session before the date

A $400 Sofrito Session is 45 minutes to get your brand and menu straight ahead of the holiday menu, the pernil, and the timeline.

Book: https://sofritostudio.com/#book-now

### San Sebastián (Jan)
**Subject:** San Sebastián — book your session before the date

A $400 Sofrito Session is 45 minutes to get your brand and menu straight ahead of the street-fest menu and the parade schedule.

Book: https://sofritostudio.com/#book-now

---

## How to run these

```bash
# Preview the flow copy
cd buttondown
python send_broadcast.py --demo

# Create a flow as a Buttondown broadcast (draft)
python send_broadcast.py --flow lead_magnet --lang en
python send_broadcast.py --flow tripwire --lang en
python send_broadcast.py --flow onboarding --lang es
python send_broadcast.py --flow seasonal --holiday navidad --lang en
```

Each creates a broadcast draft in Buttondown. Review + schedule it there (or
automate via a GitHub Action — see `.github/workflows/`).
