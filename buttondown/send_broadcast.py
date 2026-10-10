"""
Sofrito Studio — Buttondown Broadcast & Email Scheduler

Sends / schedules email campaigns via the Buttondown API, using the
Markdown templates in ./templates/. Supports:
  - Session offer (45-minute Sofrito Session, $400)
  - Post-session onboarding 3-step sequence
  - Seasonal broadcasts

All copy points at the current offer: the $400 Sofrito Session, credited in
full toward the $997 Brand & Web Sprint when booked within 30 days.

Requires BUTTONDOWN_API_KEY (config/.env or environment).

Usage:
    python send_broadcast.py --demo                    # preview templates
    python send_broadcast.py --flow onboarding --to you@example.com
    python send_broadcast.py --flow seasonal --holiday navidad --lang es
"""

import os
import sys
import json
import time
import urllib.request
import urllib.error
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "config"))

# Load .env if present (config/.env)
try:
    from dotenv import load_dotenv
    load_dotenv(ROOT / "config" / ".env")
except Exception:
    pass

BUTTONDOWN_API_KEY = os.getenv("BUTTONDOWN_API_KEY", "")
BUTTONDOWN_API = "https://api.buttondown.com/v1"
TEMPLATE_DIR = Path(__file__).resolve().parent / "templates"

# Current offer. The retired low-ticket product, the per-product cookbook pages
# and the digital-download library are all gone; every CTA below points at a
# page verified live.
BOOK_URL = "https://sofritostudio.com/#book-now"
SPRINT_URL = "https://sofritostudio.com/sprint.html"
SESSION_PRICE = "$400"
SPRINT_PRICE = "$997"
SESSION_CREDIT = "credited in full toward your $997 sprint if you book within 30 days"


def _headers() -> dict:
    if not BUTTONDOWN_API_KEY:
        raise RuntimeError("BUTTONDOWN_API_KEY not set. Add it to config/.env")
    # Buttondown expects: Authorization: Token <key>
    return {"Authorization": f"Token {BUTTONDOWN_API_KEY}", "Content-Type": "application/json"}


def _api(method: str, path: str, body: dict | None = None) -> dict:
    url = f"{BUTTONDOWN_API}{path}"
    data = json.dumps(body).encode() if body else None
    req = urllib.request.Request(url, data=data, headers=_headers(), method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode() or "{}")
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"Buttondown API error {e.code}: {e.read().decode()}")


def load_template(name: str, lang: str = "en") -> dict:
    """Load a bilingual template .md and return {subject, body}."""
    path = TEMPLATE_DIR / f"{name}.md"
    text = path.read_text(encoding="utf-8")
    # Template format: `subject: ...` on first line, then body
    lines = text.splitlines()
    subject = lines[0].replace("subject:", "").strip()
    body = "\n".join(lines[1:]).strip()
    return {"subject": subject, "body": body}


def send_flow(flow: str, to: str | None = None, lang: str = "en", holiday: str = "navidad") -> None:
    """Create/send a flow as a Buttondown broadcast.

    IMPORTANT: Buttondown's /v1/emails endpoint creates BROADCASTS to the
    whole list (or a tag segment) — it does NOT support sending a one-off
    email to a single address (the `to` field is rejected). Segmentation is
    done via tags (requires the paid Basic plan).

    - `to` is accepted for backward-compat but IGNORED by the API (no targeted
      one-off sends via the API). Pass `tag` to target a segment instead.
    - Each email in the flow is created as a broadcast draft; on a paid plan
      with tags you can schedule it to a segment.
    """
    # Build the email list for the requested flow
    if flow == "onboarding":
        emails = [
            {"subject": "Thanks! Your book is ready", "body": _onboarding_email(lang, 1)},
            {"subject": "How's your first week?" if lang == "en" else "¿Cómo va tu primera semana?", "body": _onboarding_email(lang, 2)},
            {"subject": "Ready for the next level?" if lang == "en" else "¿Listo para el siguiente nivel?", "body": _onboarding_email(lang, 3)},
        ]
    elif flow == "tripwire":
        emails = _tripwire_sequence(lang)
    elif flow == "abandoned_cart":
        emails = [
            {"subject": "Your cart is waiting" if lang == "en" else "Tu carrito te espera",
             "body": load_template("abandoned_cart", lang)["body"]},
            {"subject": "Your session is still open" if lang == "en" else "Tu sesión sigue disponible",
             "body": _session_nudge(lang)},
        ]
    elif flow == "seasonal":
        emails = _seasonal_sequence(lang, holiday)
    else:  # lead_magnet
        emails = [load_template("lead_magnet", lang)]

    for e in emails:
        # Broadcast to the list (or a tag segment on paid plans).
        payload = {"subject": e["subject"], "body": e["body"]}
        _api("POST", "/emails", payload)
        print(f"Created broadcast: {e['subject']}")
        time.sleep(1)


def _tripwire_sequence(lang: str) -> list[dict]:
    """Session -> Sprint conversion.

    Email 1: offer the 45-minute Sofrito Session ($400).
    Email 2: the Brand & Web Sprint ($997), with the $400 credit named.
    """
    if lang == "es":
        return [
            {
                "subject": "45 minutos para ordenar tu marca",
                "body": "Si tu menú, tu web o tu mensaje no encajan entre sí, eso se "
                        "resuelve en una conversación de 45 minutos.\n\n"
                        f"Una Sofrito Session son {SESSION_PRICE}. En 45 minutos vemos tu "
                        "posicionamiento, tu menú, y el cambio que más mueve la aguja.\n\n"
                        f"Reserve su tiempo: {BOOK_URL}\n\n— La cocina Ortiz",
            },
            {
                "subject": f"Tu sesión de {SESSION_PRICE} se descuenta del Brand & Web Sprint",
                "body": "Si ya hicimos la sesión, el siguiente paso es el Brand & Web "
                        f"Sprint: {SPRINT_PRICE} para marca y web en 48 horas.\n\n"
                        f"Tu sesión de {SESSION_PRICE} queda {SESSION_CREDIT}.\n\n"
                        f"Ver el Sprint: {SPRINT_URL}\n\n— La cocina Ortiz",
            },
        ]
    return [
        {
            "subject": "45 minutes to get your brand straight",
            "body": "If your menu, your site, and your message don't line up, that's a "
                    "45-minute conversation, not a document.\n\n"
                    f"A Sofrito Session is {SESSION_PRICE}. In 45 minutes we go through "
                    "your positioning, your menu, and the one fix that moves the most.\n\n"
                    f"Book a time: {BOOK_URL}\n\n— The Ortiz kitchen",
        },
        {
            "subject": f"Your {SESSION_PRICE} session comes off the Sprint",
            "body": f"If we've already done the session, the next step is the Brand & Web "
                    f"Sprint: {SPRINT_PRICE} for brand and website in 48 hours.\n\n"
                    f"Your {SESSION_PRICE} session is {SESSION_CREDIT}.\n\n"
                    f"See the Sprint: {SPRINT_URL}\n\n— The Ortiz kitchen",
        },
    ]


def _session_nudge(lang: str) -> str:
    """Replaces the retired percentage-discount nudge. There is no product left
    to discount, so this is a plain 'your session is still open' follow-up."""
    if lang == "es":
        return (f"Tu sesión de {SESSION_PRICE} sigue disponible. Son 45 minutos para "
                f"ordenar tu marca.\n\n{BOOK_URL}\n\n— La cocina Ortiz, Sofrito Studio")
    return (f"Your {SESSION_PRICE} session is still open. 45 minutes to get your brand "
            f"straight.\n\n{BOOK_URL}\n\n— The Ortiz kitchen, Sofrito Studio")


def _seasonal_sequence(lang: str, holiday: str) -> list[dict]:
    """Seasonal broadcasts: Thanksgiving, Nochebuena, San Sebastián."""
    topics = {
        "thanksgiving": ("Boricua Thanksgiving", "the holiday menu and the pernil timing"),
        "navidad": ("Nochebuena", "the holiday menu, the pernil, and the timeline"),
        "san-sebastian": ("San Sebastián", "the street-fest menu and the parade schedule"),
    }
    title, focus = topics.get(holiday, topics["navidad"])
    if lang == "es":
        subject = f"{title} — reserve tu sesión antes de la fecha"
        body = (f"La temporada de {title} se acerca y la hora de reservar se llena.\n\n"
                f"Una Sofrito Session de {SESSION_PRICE} son 45 minutos para dejar tu "
                f"marca y tu menú listos antes de {focus}.\n\n"
                f"Reserve: {BOOK_URL}\n\n— La cocina Ortiz")
    else:
        subject = f"{title} — book your session before the date"
        body = (f"{title} is coming, and the calendar fills up.\n\n"
                f"A {SESSION_PRICE} Sofrito Session is 45 minutes to get your brand and "
                f"menu straight ahead of {focus}.\n\n"
                f"Book: {BOOK_URL}\n\n— The Ortiz kitchen")
    return [{"subject": subject, "body": body}]


def _onboarding_email(lang: str, step: int) -> str:
    """Post-session follow-up: recap, then the Sprint with the credit named."""
    if lang == "es":
        steps = {
            1: f"Gracias por la sesión de hoy. Aquí va lo que acordamos, en un solo lugar.\n\n"
               f"Cuando quieras dar el siguiente paso, el Brand & Web Sprint es {SPRINT_PRICE} "
               f"para marca y web en 48 horas.",
            2: "¿Pudiste escribir tu página de inicio con lo que vimos? Si quieres que la "
               "revisemos, responde a este correo.\n\n"
               "Tip: una frase clara por sección vale más que cinco puntos.",
            3: f"Cuando quieras continuar, el Brand & Web Sprint es {SPRINT_PRICE} para marca "
               f"y web en 48 horas. Tu sesión de {SESSION_PRICE} queda {SESSION_CREDIT}.\n\n"
               f"{SPRINT_URL}",
        }
        return steps[step] + "\n\n— La cocina Ortiz"
    steps = {
        1: "Thanks for the session today. Everything we agreed is written down in one "
           "place.\n\n"
           f"When you're ready for the next step, the Brand & Web Sprint is {SPRINT_PRICE} "
           "for brand and website in 48 hours.",
        2: "Have you written your homepage line yet from what we covered? If you want it "
           "looked at, reply to this email.\n\n"
           "Tip: one clear sentence per section beats five bullet points.",
        3: f"When you're ready to continue, the Brand & Web Sprint is {SPRINT_PRICE} for "
           f"brand and website in 48 hours. Your {SESSION_PRICE} session is {SESSION_CREDIT}.\n\n"
           f"{SPRINT_URL}",
    }
    return steps[step] + "\n\n— The Ortiz kitchen"


def _seasonal_email(lang: str, holiday: str) -> dict:
    return _seasonal_sequence(lang, holiday)[0]


def demo() -> None:
    print("=== Lead magnet (EN) ===")
    print(load_template("lead_magnet")["subject"])
    print("=== Onboarding step 1 (ES) ===")
    print(_onboarding_email("es", 1)[:80], "...")
    print("=== Tripwire step 2 (EN) ===")
    print(_tripwire_sequence("en")[1]["subject"])
    print("=== Seasonal San Sebastián (EN) ===")
    print(_seasonal_sequence("en", "san-sebastian")[0]["subject"])


if __name__ == "__main__":
    import argparse
    p = argparse.ArgumentParser()
    p.add_argument("--demo", action="store_true")
    p.add_argument("--flow", choices=["lead_magnet", "onboarding", "tripwire", "abandoned_cart", "seasonal"])
    p.add_argument("--to", default=None)
    p.add_argument("--lang", default="en", choices=["en", "es"])
    p.add_argument("--holiday", default="navidad", choices=["thanksgiving", "navidad", "san-sebastian"])
    a = p.parse_args()

    if a.demo:
        demo()
    elif a.flow:
        send_flow(a.flow, to=a.to, lang=a.lang, holiday=a.holiday)
    else:
        print("Use --demo, or --flow <name> [--to email] [--lang es] [--holiday navidad]")
