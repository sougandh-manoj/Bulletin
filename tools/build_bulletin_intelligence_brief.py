from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen.canvas import Canvas
from reportlab.lib.utils import simpleSplit
import os

OUT = os.path.abspath("output/pdf/bulletin-clustering-personalisation-intelligence.pdf")
W, H = A4

IVORY = HexColor("#F6F3EC")
CREAM = HexColor("#FCFAF5")
INK = HexColor("#15191D")
GRAPHITE = HexColor("#5E6267")
FAINT = HexColor("#73777B")
BLUE = HexColor("#315F91")
BLUE_DARK = HexColor("#20456E")
BLUE_SOFT = HexColor("#E5EDF5")
BORDER = HexColor("#D8D4CB")
DARK = HexColor("#111820")
WARM = HexColor("#F4F1EA")
GREEN = HexColor("#3F6F57")


def fonts():
    base = "/System/Library/Fonts/Supplemental"
    mapping = {
        "Editorial": "Georgia.ttf",
        "Editorial-Bold": "Georgia Bold.ttf",
        "Editorial-Italic": "Georgia Italic.ttf",
        "Interface": "Arial.ttf",
        "Interface-Bold": "Arial Bold.ttf",
    }
    for name, filename in mapping.items():
        pdfmetrics.registerFont(TTFont(name, os.path.join(base, filename)))


fonts()


def footer(c, page):
    c.setStrokeColor(BORDER)
    c.setLineWidth(0.5)
    c.line(20*mm, 14*mm, W-20*mm, 14*mm)
    c.setFont("Interface", 7)
    c.setFillColor(FAINT)
    c.drawString(20*mm, 9*mm, "BULLETIN  /  INTELLIGENCE BRIEF")
    c.drawRightString(W-20*mm, 9*mm, str(page))


def wrapped(c, text, x, y, width, font="Interface", size=8.5, leading=12, color=GRAPHITE):
    c.setFont(font, size)
    c.setFillColor(color)
    lines = simpleSplit(text, font, size, width)
    for line in lines:
        c.drawString(x, y, line)
        y -= leading
    return y


def header(c, eyebrow, title, subtitle):
    c.setFillColor(IVORY)
    c.rect(0, 0, W, H, fill=1, stroke=0)
    c.setFont("Interface-Bold", 7.5)
    c.setFillColor(BLUE)
    c.drawString(20*mm, H-20*mm, eyebrow.upper())
    c.setFont("Editorial-Bold", 23)
    c.setFillColor(INK)
    title_lines = title.split("|") if "|" in title else simpleSplit(title, "Editorial-Bold", 23, 168*mm)
    y = H-31*mm
    for line in title_lines:
        c.drawString(20*mm, y, line)
        y -= 9*mm
    y -= 1*mm
    y = wrapped(c, subtitle, 20*mm, y, 162*mm, "Editorial-Italic", 10.2, 14, GRAPHITE)
    c.setStrokeColor(BLUE)
    c.setLineWidth(1.6)
    c.line(20*mm, y-2*mm, 42*mm, y-2*mm)
    return y-9*mm


def level_card(c, num, title, body, y):
    x = 20*mm
    box_w = 170*mm
    box_h = 29*mm
    c.setFillColor(CREAM)
    c.setStrokeColor(BORDER)
    c.setLineWidth(0.55)
    c.roundRect(x, y-box_h, box_w, box_h, 3*mm, fill=1, stroke=1)
    c.setFillColor(BLUE_SOFT)
    c.circle(x+11*mm, y-14.5*mm, 6*mm, fill=1, stroke=0)
    c.setFont("Interface-Bold", 8)
    c.setFillColor(BLUE_DARK)
    c.drawCentredString(x+11*mm, y-16*mm, str(num))
    c.setFont("Editorial-Bold", 11)
    c.setFillColor(INK)
    c.drawString(x+22*mm, y-9*mm, title)
    wrapped(c, body, x+22*mm, y-15*mm, 140*mm, "Interface", 7.7, 10.4, GRAPHITE)
    return y-box_h-3*mm


def tag(c, text, x, y, width, fill=BLUE_SOFT, ink=BLUE_DARK):
    c.setFillColor(fill)
    c.setStrokeColor(BORDER)
    c.roundRect(x, y-8*mm, width, 8*mm, 2*mm, fill=1, stroke=1)
    c.setFont("Interface-Bold", 6.7)
    c.setFillColor(ink)
    c.drawCentredString(x+width/2, y-5.2*mm, text.upper())


def draw_page_one(c):
    y = header(
        c,
        "01 / Five-level event clustering",
        "How repeated reporting becomes one trustworthy story",
        "Clustering reduces repetition without confusing two different events that merely sound alike. Each level adds intelligence while preserving the underlying evidence."
    )
    levels = [
        ("Deterministic normalization", "Canonicalize URLs, remove tracking parameters, clean titles and punctuation, unify source identities, and collapse exact or nearly exact duplicates before expensive processing."),
        ("Semantic embeddings", "Convert the title, RSS description and useful metadata into a numerical meaning vector. Differently worded reports can become candidates even when their headlines share few words."),
        ("Recent candidate comparison", "Compare only plausible recent neighbors selected by time, category, geography, named entities and vector similarity. Never search the entire database for every article."),
        ("Consistency verification", "Before merging, verify that people, organizations, location, event time, major numbers, topic and event nature agree. Similarity proposes the match; consistency decides it."),
        ("Source preservation", "Keep every accepted article attached to the canonical cluster. The final story retains publisher attribution, direct links, evidence history and the ability to re-verify future updates."),
    ]
    for i, (title, body) in enumerate(levels, 1):
        y = level_card(c, i, title, body, y)

    # Bottom safety strip
    c.setFillColor(DARK)
    c.roundRect(20*mm, 20*mm, 170*mm, 26*mm, 3*mm, fill=1, stroke=0)
    c.setFont("Editorial-Bold", 10.5)
    c.setFillColor(WARM)
    c.drawString(27*mm, 37*mm, "The safety rule")
    wrapped(c, "A shared name or high vector score is never enough. Election rounds, court hearings, market moves and sports matches remain separate unless the event facts align. Thresholds are calibrated against a manually reviewed real-news test set.", 27*mm, 31*mm, 151*mm, "Interface", 7.3, 9.5, HexColor("#C7CDD3"))
    footer(c, 1)


def draw_page_two(c):
    y = header(
        c,
        "02 / Personalisation intelligence",
        "How one shared news pool|becomes a personal briefing",
        "Gemini does not create a separate news universe for every subscriber. Stories receive structured metadata once; transparent code then filters, scores and diversifies them for each delivery."
    )

    # Shared metadata band
    c.setFont("Editorial-Bold", 12)
    c.setFillColor(INK)
    c.drawString(20*mm, y, "One shared intelligence record per cluster")
    y -= 6*mm
    tags = [
        ("Categories", 28), ("Topics + entities", 37), ("Geography", 27),
        ("Recency", 23), ("Source strength", 35), ("Update state", 29)
    ]
    x = 20*mm
    for label, width in tags:
        if x + width*mm > W-20*mm:
            x = 20*mm
            y -= 11*mm
        tag(c, label, x, y, width*mm)
        x += (width+3)*mm
    y -= 14*mm

    # Three columns
    col_w = 53*mm
    gap = 5.5*mm
    cols = [
        ("1. HARD FILTERS", BLUE, [
            "Use only the subscriber's relevant delivery window.",
            "Remove previously delivered versions unless a meaningful Update exists.",
            "Require a selected category or a direct custom-topic match.",
            "Block a central excluded topic, but not an incidental mention.",
            "Reject unverified, conflicted or insufficient-evidence summaries."
        ]),
        ("2. RELEVANCE SCORE", GREEN, [
            "Custom topics work independently as explicit interests.",
            "Selected category match establishes ordinary eligibility.",
            "Geographic order: India-wide importance, then state, then city.",
            "Recency and meaningful developments raise priority.",
            "Multi-source evidence and source quality strengthen ranking."
        ]),
        ("3. FINAL RE-RANK", HexColor("#9A6A25"), [
            "For 3 to 4 stories, normally cap one category at 2 stories.",
            "For 5 to 10 stories, normally cap one category at 40 percent.",
            "Relax the cap when only one category is selected or alternatives are weak.",
            "Suppress several stories about essentially the same subject.",
            "Never add filler simply to reach the chosen story count."
        ]),
    ]
    top = y
    box_h = 78*mm
    for idx, (title, color, items) in enumerate(cols):
        x = 20*mm + idx*(col_w+gap)
        c.setFillColor(CREAM)
        c.setStrokeColor(BORDER)
        c.roundRect(x, top-box_h, col_w, box_h, 3*mm, fill=1, stroke=1)
        c.setFillColor(color)
        c.rect(x, top-10*mm, col_w, 10*mm, fill=1, stroke=0)
        c.setFont("Interface-Bold", 7)
        c.setFillColor(WARM)
        c.drawString(x+4*mm, top-6.5*mm, title)
        yy = top-17*mm
        for item in items:
            c.setFillColor(color)
            c.circle(x+4.5*mm, yy+0.8*mm, 1*mm, fill=1, stroke=0)
            yy = wrapped(c, item, x+8*mm, yy+2.5*mm, col_w-12*mm, "Interface", 7.15, 9.7, GRAPHITE) - 2.2*mm
    y = top-box_h-9*mm

    c.setFont("Editorial-Bold", 12)
    c.setFillColor(INK)
    c.drawString(20*mm, y, "The result")
    y -= 7*mm
    result_rows = [
        ("Relevant", "Matches explicit interests rather than hidden behavioral assumptions."),
        ("Balanced", "Avoids category domination and repeated versions of the same subject."),
        ("Trustworthy", "Uses only verified summaries backed by preserved source evidence."),
        ("Honest", "Sends fewer stories - or no meaningful updates - when quality is insufficient."),
    ]
    row_h = 13*mm
    for i, (label, body) in enumerate(result_rows):
        x = 20*mm + (i%2)*86.5*mm
        yy = y - (i//2)*(row_h+3*mm)
        c.setFillColor(BLUE_SOFT if i < 2 else HexColor("#E8F0EA"))
        c.setStrokeColor(BORDER)
        c.roundRect(x, yy-row_h, 82*mm, row_h, 2.5*mm, fill=1, stroke=1)
        c.setFont("Interface-Bold", 7.5)
        c.setFillColor(BLUE_DARK if i < 2 else GREEN)
        c.drawString(x+4*mm, yy-5*mm, label.upper())
        wrapped(c, body, x+33*mm, yy-4.6*mm, 45*mm, "Interface", 6.8, 8.6, GRAPHITE)

    # final line
    c.setFont("Editorial-Italic", 9.6)
    c.setFillColor(BLUE_DARK)
    c.drawString(20*mm, 25*mm, "No click tracking. No per-user AI summarization. Explicit choices remain in control.")
    # Redraw the opening word after all page elements; this avoids a macOS
    # TrueType subset rendering quirk observed in the visual QA pass.
    c.setFont("Editorial-Bold", 23)
    c.setFillColor(INK)
    c.drawString(20*mm, H-31*mm, "How")
    footer(c, 2)


def build():
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    c = Canvas(OUT, pagesize=A4)
    c.setTitle("Bulletin - Clustering and Personalisation Intelligence")
    c.setAuthor("Bulletin Product Planning")
    c.setSubject("Two-page explanation of clustering levels and personalization logic")
    draw_page_one(c)
    c.showPage()
    draw_page_two(c)
    c.showPage()
    c.save()
    print(OUT)


if __name__ == "__main__":
    build()
