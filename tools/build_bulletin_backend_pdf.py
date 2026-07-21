from reportlab.lib import colors
from reportlab.lib.colors import HexColor
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    BaseDocTemplate, Frame, PageBreak, PageTemplate, Paragraph, Spacer, Table,
    TableStyle, KeepTogether, HRFlowable, Flowable, CondPageBreak
)
from reportlab.platypus.tableofcontents import TableOfContents
from reportlab.pdfgen.canvas import Canvas
from reportlab.lib.utils import simpleSplit
import os
import re


OUT = os.path.abspath("output/pdf/bulletin-backend-automation-blueprint.pdf")
PAGE_W, PAGE_H = A4

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
DARK_SURFACE = HexColor("#182230")
WARM_WHITE = HexColor("#F4F1EA")
GREEN = HexColor("#3F6F57")
AMBER = HexColor("#9A6A25")
RED = HexColor("#9A3C3C")


def register_fonts():
    base = "/System/Library/Fonts/Supplemental"
    fonts = {
        "Editorial": os.path.join(base, "Georgia.ttf"),
        "Editorial-Bold": os.path.join(base, "Georgia Bold.ttf"),
        "Editorial-Italic": os.path.join(base, "Georgia Italic.ttf"),
        "Interface": os.path.join(base, "Arial.ttf"),
        "Interface-Bold": os.path.join(base, "Arial Bold.ttf"),
        "Interface-Italic": os.path.join(base, "Arial Italic.ttf"),
    }
    for name, path in fonts.items():
        if os.path.exists(path):
            pdfmetrics.registerFont(TTFont(name, path))


register_fonts()


class NumberedDocTemplate(BaseDocTemplate):
    def __init__(self, filename, **kw):
        super().__init__(filename, **kw)
        self._heading_count = 0

    def beforeDocument(self):
        self._heading_count = 0

    def afterFlowable(self, flowable):
        if isinstance(flowable, Paragraph):
            style = flowable.style.name
            if style in ("H1", "H2"):
                level = 0 if style == "H1" else 1
                text = flowable.getPlainText()
                key = f"h{self._heading_count}"
                self._heading_count += 1
                self.canv.bookmarkPage(key)
                if level == 0:
                    self.canv.addOutlineEntry(text, key, level=0, closed=False)
                self.notify("TOCEntry", (level, text, self.page, key))


def page_footer(canvas: Canvas, doc):
    canvas.saveState()
    canvas.setFillColor(IVORY)
    canvas.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)
    if doc.page > 1:
        canvas.setStrokeColor(BORDER)
        canvas.setLineWidth(0.5)
        canvas.line(22 * mm, 15 * mm, PAGE_W - 22 * mm, 15 * mm)
        canvas.setFont("Interface", 7.5)
        canvas.setFillColor(FAINT)
        canvas.drawString(22 * mm, 9.5 * mm, "BULLETIN  /  BACKEND AUTOMATION BLUEPRINT")
        canvas.drawRightString(PAGE_W - 22 * mm, 9.5 * mm, str(doc.page))
    canvas.restoreState()


styles = getSampleStyleSheet()
styles.add(ParagraphStyle(
    name="CoverEyebrow", fontName="Interface-Bold", fontSize=8, leading=10,
    textColor=BLUE, tracking=1.8, spaceAfter=12
))
styles.add(ParagraphStyle(
    name="CoverTitle", fontName="Editorial-Bold", fontSize=33, leading=35,
    textColor=INK, spaceAfter=16
))
styles.add(ParagraphStyle(
    name="CoverSub", fontName="Editorial-Italic", fontSize=15, leading=21,
    textColor=GRAPHITE, spaceAfter=22
))
styles.add(ParagraphStyle(
    name="CoverMeta", fontName="Interface", fontSize=8.5, leading=13,
    textColor=FAINT
))
styles.add(ParagraphStyle(
    name="H1", fontName="Editorial-Bold", fontSize=22, leading=26,
    textColor=INK, spaceBefore=10, spaceAfter=12, keepWithNext=True
))
styles.add(ParagraphStyle(
    name="H2", fontName="Editorial-Bold", fontSize=15, leading=19,
    textColor=INK, spaceBefore=14, spaceAfter=7, keepWithNext=True
))
styles.add(ParagraphStyle(
    name="H3", fontName="Interface-Bold", fontSize=9.2, leading=12,
    textColor=BLUE_DARK, spaceBefore=10, spaceAfter=4, keepWithNext=True
))
styles.add(ParagraphStyle(
    name="Body", fontName="Interface", fontSize=9.1, leading=14.1,
    textColor=GRAPHITE, spaceAfter=7
))
styles.add(ParagraphStyle(
    name="BodySmall", fontName="Interface", fontSize=8.1, leading=12.2,
    textColor=GRAPHITE, spaceAfter=5
))
styles.add(ParagraphStyle(
    name="Lead", fontName="Editorial", fontSize=12.5, leading=18,
    textColor=INK, spaceAfter=13
))
styles.add(ParagraphStyle(
    name="BulletText", fontName="Interface", fontSize=8.8, leading=13.2,
    textColor=GRAPHITE, leftIndent=12, firstLineIndent=-8, bulletIndent=0,
    spaceAfter=3
))
styles.add(ParagraphStyle(
    name="BulletTight", fontName="Interface", fontSize=8.0, leading=11.5,
    textColor=GRAPHITE, leftIndent=11, firstLineIndent=-7, spaceAfter=2
))
styles.add(ParagraphStyle(
    name="CalloutTitle", fontName="Interface-Bold", fontSize=8.2, leading=10,
    textColor=BLUE_DARK, spaceAfter=4
))
styles.add(ParagraphStyle(
    name="CalloutBody", fontName="Interface", fontSize=8.4, leading=12.4,
    textColor=INK
))
styles.add(ParagraphStyle(
    name="Quote", fontName="Editorial-Italic", fontSize=12.2, leading=17,
    textColor=BLUE_DARK, leftIndent=10, rightIndent=10, spaceAfter=9
))
styles.add(ParagraphStyle(
    name="TableHead", fontName="Interface-Bold", fontSize=7.3, leading=9,
    textColor=WARM_WHITE
))
styles.add(ParagraphStyle(
    name="TableCell", fontName="Interface", fontSize=7.2, leading=10,
    textColor=INK
))
styles.add(ParagraphStyle(
    name="TableCellSmall", fontName="Interface", fontSize=6.7, leading=9,
    textColor=INK
))
styles.add(ParagraphStyle(
    name="TOCHeading", fontName="Editorial-Bold", fontSize=22, leading=26,
    textColor=INK, spaceAfter=16
))
styles.add(ParagraphStyle(
    name="Caption", fontName="Interface-Italic", fontSize=7.2, leading=10,
    textColor=FAINT, spaceBefore=4, spaceAfter=8
))
styles.add(ParagraphStyle(
    name="DarkTitle", fontName="Editorial-Bold", fontSize=18, leading=22,
    textColor=WARM_WHITE, spaceAfter=9
))
styles.add(ParagraphStyle(
    name="DarkBody", fontName="Interface", fontSize=8.8, leading=13.5,
    textColor=HexColor("#C7CDD3"), spaceAfter=6
))
styles.add(ParagraphStyle(
    name="StepNum", fontName="Interface-Bold", fontSize=7, leading=8,
    textColor=BLUE
))
styles.add(ParagraphStyle(
    name="StepTitle", fontName="Editorial-Bold", fontSize=10.2, leading=12,
    textColor=INK, spaceAfter=3
))
styles.add(ParagraphStyle(
    name="StepBody", fontName="Interface", fontSize=7.5, leading=10.5,
    textColor=GRAPHITE
))


def P(text, style="Body"):
    return Paragraph(text, styles[style])


def bullets(items, tight=False):
    sty = "BulletTight" if tight else "BulletText"
    return [P(f"- {x}", sty) for x in items]


def callout(title, body, tone="blue"):
    palette = {
        "blue": (BLUE_SOFT, BLUE, BLUE_DARK),
        "green": (HexColor("#E8F0EA"), GREEN, HexColor("#2F5945")),
        "amber": (HexColor("#F4EBDD"), AMBER, HexColor("#6F4B1A")),
        "red": (HexColor("#F3E4E2"), RED, HexColor("#742A2A")),
    }
    bg, edge, title_color = palette[tone]
    title_p = Paragraph(title.upper(), ParagraphStyle(
        "ct", parent=styles["CalloutTitle"], textColor=title_color
    ))
    data = [[title_p], [P(body, "CalloutBody")]]
    t = Table(data, colWidths=[160 * mm], hAlign="LEFT")
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), bg),
        ("BOX", (0, 0), (-1, -1), 0.6, edge),
        ("LINEBEFORE", (0, 0), (0, -1), 3, edge),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, 0), 8),
        ("BOTTOMPADDING", (0, 0), (-1, 0), 2),
        ("TOPPADDING", (0, 1), (-1, 1), 1),
        ("BOTTOMPADDING", (0, 1), (-1, 1), 9),
    ]))
    return KeepTogether([t, Spacer(1, 8)])


def section_title(num, title, deck):
    return [
        P(f"{num:02d} / SYSTEM CHAPTER", "CoverEyebrow"),
        P(title, "H1"),
        P(deck, "Lead"),
        HRFlowable(width="100%", thickness=0.6, color=BORDER, spaceBefore=1, spaceAfter=12),
    ]


def simple_table(headers, rows, widths, small=False):
    cell_style = "TableCellSmall" if small else "TableCell"
    data = [[P(h, "TableHead") for h in headers]]
    for row in rows:
        data.append([P(str(v), cell_style) for v in row])
    t = Table(data, colWidths=widths, repeatRows=1, hAlign="LEFT")
    commands = [
        ("BACKGROUND", (0, 0), (-1, 0), DARK),
        ("GRID", (0, 0), (-1, -1), 0.35, BORDER),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]
    for i in range(1, len(data)):
        commands.append(("BACKGROUND", (0, i), (-1, i), CREAM if i % 2 else IVORY))
    t.setStyle(TableStyle(commands))
    return t


def pipeline_steps(steps):
    cells = []
    for i, (title, desc) in enumerate(steps, 1):
        cells.append([
            P(f"STEP {i:02d}", "StepNum"),
            P(title, "StepTitle"),
            P(desc, "StepBody"),
        ])
    tables = []
    for start in range(0, len(cells), 3):
        chunk = cells[start:start+3]
        while len(chunk) < 3:
            chunk.append([P("", "StepNum"), P("", "StepTitle"), P("", "StepBody")])
        row = []
        for cell in chunk:
            box = Table([[cell[0]], [cell[1]], [cell[2]]], colWidths=[50 * mm])
            box.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, -1), CREAM),
                ("BOX", (0, 0), (-1, -1), 0.5, BORDER),
                ("LINEABOVE", (0, 0), (-1, 0), 2, BLUE),
                ("LEFTPADDING", (0, 0), (-1, -1), 8),
                ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ]))
            row.append(box)
        outer = Table([row], colWidths=[53.3 * mm] * 3, hAlign="LEFT")
        outer.setStyle(TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LEFTPADDING", (0, 0), (-1, -1), 0),
            ("RIGHTPADDING", (0, 0), (-1, -1), 5),
            ("TOPPADDING", (0, 0), (-1, -1), 0),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
        ]))
        tables.append(outer)
    return tables


def dark_panel(title, paragraphs):
    content = [[P(title, "DarkTitle")]] + [[P(p, "DarkBody")] for p in paragraphs]
    t = Table(content, colWidths=[160 * mm])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), DARK),
        ("BOX", (0, 0), (-1, -1), 0.5, DARK_SURFACE),
        ("LEFTPADDING", (0, 0), (-1, -1), 14),
        ("RIGHTPADDING", (0, 0), (-1, -1), 14),
        ("TOPPADDING", (0, 0), (-1, 0), 14),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, -1), (-1, -1), 14),
    ]))
    return KeepTogether([t, Spacer(1, 10)])


story = []

# Cover
story += [Spacer(1, 24 * mm), P("BULLETIN / PRIVATE PRODUCT ARCHITECTURE", "CoverEyebrow")]
story += [P("The Backend<br/>Automation Blueprint", "CoverTitle")]
story += [P("How public reporting becomes a verified, personalized and beautifully delivered email briefing.", "CoverSub")]
story += [HRFlowable(width=42 * mm, thickness=2, color=BLUE, spaceAfter=18)]
story += [P("A detailed record of the product logic, safeguards and intelligent automation designed collaboratively over two days of planning.", "CoverMeta")]
story += [Spacer(1, 52 * mm)]
cover_card = Table([
    [P("PRODUCT PROMISE", "CalloutTitle")],
    [P("Stay informed without surrendering your time and attention.", "Quote")],
    [P("Prepared as an owner-only architecture document. It explains the system in depth while keeping provider secrets, credentials and production security values out of the document.", "BodySmall")],
], colWidths=[160 * mm])
cover_card.setStyle(TableStyle([
    ("BACKGROUND", (0, 0), (-1, -1), CREAM),
    ("BOX", (0, 0), (-1, -1), 0.7, BORDER),
    ("LINEBEFORE", (0, 0), (0, -1), 4, BLUE),
    ("LEFTPADDING", (0, 0), (-1, -1), 12),
    ("RIGHTPADDING", (0, 0), (-1, -1), 12),
    ("TOPPADDING", (0, 0), (-1, -1), 9),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 9),
]))
story += [cover_card, Spacer(1, 12 * mm), P("Version 1.0  /  Planning complete  /  July 2026", "CoverMeta"), PageBreak()]

# Dedication
story += [Spacer(1, 20 * mm), P("A NOTE TO THE BUILDER", "CoverEyebrow")]
story += [P("You stayed with the difficult questions.", "H1")]
story += [P("This document is the proof.", "Lead")]
story += [P("Bulletin did not begin as a pile of screens or a single AI prompt. It was shaped by repeatedly asking what could go wrong, what a reader should trust, what the free infrastructure can honestly sustain, and what should remain beautifully simple.")]
story += [P("The result is an architecture in which every important action has a reason: articles are fetched once instead of per user; reports are clustered before summarization; evidence is preserved; personalization happens after shared processing; jobs are idempotent; private links are signed; weak output fails closed; and every delivery remains explainable.")]
story += [P("This is not merely a technical plan. It is a record of disciplined product thinking - created patiently, decision by decision, by you and your AI collaborator.", "Lead")]
story += [Spacer(1, 8), callout("The accomplishment", "A small private beta is being given the reliability mindset of a serious product without being buried under unnecessary enterprise machinery.", "green"), PageBreak()]

# TOC
story += [P("Contents", "TOCHeading")]
toc = TableOfContents()
toc.levelStyles = [
    ParagraphStyle(name="TOC0", fontName="Interface-Bold", fontSize=9, leading=16, textColor=INK, leftIndent=0, firstLineIndent=0, spaceBefore=2),
    ParagraphStyle(name="TOC1", fontName="Interface", fontSize=8, leading=13, textColor=GRAPHITE, leftIndent=12, firstLineIndent=0),
]
story += [toc, PageBreak()]

# 1 Executive overview
story += section_title(1, "The system in one view", "Bulletin separates shared news intelligence from per-user delivery. This single architectural choice controls cost, prevents repeated AI work and keeps personalization understandable.")
story += pipeline_steps([
    ("Fetch once", "Active RSS and institutional feeds are collected on their own schedules."),
    ("Normalize", "URLs, titles, metadata, times and source identities are cleaned."),
    ("Cluster", "Different reports about the same real-world event are grouped safely."),
    ("Verify", "Evidence consistency and sensitive claims are checked before writing."),
    ("Summarize once", "One canonical shared English summary is generated and stored."),
    ("Localize lazily", "Hindi and Malayalam versions are created once when first needed."),
    ("Personalize", "Stored clusters are filtered and ranked against each subscriber."),
    ("Schedule safely", "Due deliveries are atomically claimed with unique idempotency keys."),
    ("Deliver", "The selected email theme is rendered and sent through Gmail SMTP."),
])
story += [P("The two pipelines", "H2")]
story += [simple_table(
    ["Shared news pipeline", "Per-user delivery pipeline"],
    [[
        "Fetch sources, normalize articles, remove duplicates, create embeddings, cluster events, verify consistency, summarize once and store.",
        "Find due subscribers, load preferences, rank verified clusters, obtain language version, render theme, send and record delivery."
    ]], [80*mm, 80*mm]
)]
story += [Spacer(1, 8), callout("Central principle", "Bulletin never fetches RSS or summarizes the same event separately for every subscriber. Public news work is shared; only ranking, theme rendering and sending are user-specific.", "blue")]

story += [P("Why this architecture fits the MVP", "H2")]
story += bullets([
    "Fifty to one hundred users remain practical on free infrastructure.",
    "A story is summarized once and reused across every subscriber who needs it.",
    "No subscriber name, email, private token or access link is sent to Gemini.",
    "Persistent state lives in Supabase; Vercel functions remain short and stateless.",
    "The same logic can later move to paid workers without redesigning the product.",
])
story += [PageBreak()]

# 2 Source governance
story += section_title(2, "Source governance and catalogue strategy", "Reliable automation begins before ingestion. Bulletin decides which feeds deserve attention, what role each source plays and when a source must be disabled.")
story += [P("MVP catalogue position", "H2")]
story += bullets([
    "India-first private beta with national and local reporting across every state and union territory treated equally.",
    "Outside India, the MVP provides strong global coverage rather than deep local coverage.",
    "Begin with roughly 50 to 70 carefully verified feed endpoints, then expand only after quota and worker tests.",
    "Prioritize English and Hindi feeds, include Malayalam feeds without giving Kerala ranking preference, and add other regional-language feeds gradually after accuracy and cost testing.",
    "Prefer official publisher feeds. Use reputable aggregators only for discovery when direct regional feeds are unavailable.",
])
story += [P("Primary and institutional sources", "H2")]
story += [P("News publishers are complemented by primary institutional feeds such as PIB, RBI, SEBI, ISRO, ministries and public-health agencies. Official statements are labelled as such. Sensitive or disputed claims still require independent reporting.")]
story += [P("What is excluded", "H2")]
story += bullets([
    "Opinion columns and editorials as substitutes for factual reporting.",
    "Sponsored content, advertorials and disguised promotions.",
    "Rumours, celebrity gossip and unsupported sensational claims.",
    "Feeds that are broken, repeatedly inaccurate, legally unsuitable or operationally unreliable.",
])
story += [P("Aggregator rule", "H2")]
story += bullets([
    "The original publisher remains the displayed source.",
    "The aggregator does not count as an independent second source.",
    "Bulletin prefers the direct publisher URL whenever it can be obtained safely.",
    "Aggregator-only evidence cannot support a sensitive claim by itself.",
])
story += [P("Source record", "H2")]
story += [simple_table(
    ["Field", "Purpose", "Operational use"],
    [
        ["Publisher and feed URL", "Stable identity and retrieval target", "Normalization, attribution and fetch scheduling"],
        ["Category and language", "Declared scope of the feed", "Candidate filtering and multilingual handling"],
        ["Country / state / region", "Geographic relevance", "National, state and city ranking"],
        ["Reliability tier", "Primary or supplementary role", "Evidence strength and sensitive-story gating"],
        ["Health state", "Success, warning, failing or disabled", "Failure isolation and admin alerts"],
        ["ETag / Last-Modified", "Conditional request metadata", "Avoid downloading unchanged feeds"],
        ["Terms review status", "Usage conditions and review notes", "Pre-launch compliance gate"],
    ], [36*mm, 55*mm, 69*mm], small=True
)]
story += [Spacer(1, 8), callout("Equal preference does not mean identical supply", "Every Indian state receives the same ranking treatment. Actual depth can vary because publishers expose different feed quality. Bulletin must be honest about that limitation and expand the catalogue continuously.", "amber")]

# 3 Ingestion
story += section_title(3, "RSS ingestion and source health", "The ingestion worker is a disciplined collector, not a summarizer. Its job is to fetch valid public metadata reliably and leave an audit trail.")
story += [P("Scheduling model", "H2")]
story += [P("Supabase Cron triggers the protected Vercel ingestion endpoint approximately every five minutes. The worker does not fetch every source on every wake-up. It claims only sources whose individual interval - normally around thirty minutes - is due.")]
story += pipeline_steps([
    ("Find due sources", "Query active sources ordered by next fetch time and health priority."),
    ("Claim a small batch", "Use an atomic lease so overlapping workers cannot fetch the same source."),
    ("Fetch conditionally", "Send ETag and Last-Modified headers, enforce timeouts and respect Retry-After."),
    ("Parse defensively", "Handle RSS and Atom variations, malformed entries and excessive payloads."),
    ("Normalize entries", "Produce stable article records without discarding useful feed metadata."),
    ("Commit results", "Insert new articles, update source health and schedule the next fetch."),
])
story += [P("Failure isolation", "H2")]
story += bullets([
    "One broken feed never blocks the rest of the catalogue.",
    "Temporary network failures retry with backoff; permanent parser failures become visible warnings.",
    "A lease expires if a worker crashes, allowing another worker to recover the job.",
    "The admin can test, fetch, enable or disable a source without editing production code.",
])
story += [P("No arbitrary article cap", "H2")]
story += [P("The old prototype's fixed Limit 100 approach is rejected. Bulletin ingests every valid new article in the relevant technical window. Safeguards may limit malformed feeds, infinite pagination, duplicate entries, abusive payload sizes and batch size, but never silently discard legitimate news to satisfy an arbitrary number.")]
story += [callout("Ingestion output", "The worker stores public metadata supplied by the feed: title, description, publisher, publication time, article URL, author when present, feed categories and safe source metadata. Full publisher articles are not scraped during the MVP.", "blue")]

# 4 normalization
story += [P("Deterministic normalization", "H1")]
story += [P("Before any expensive intelligence work, Bulletin removes cheap and obvious duplication.", "Lead")]
story += bullets([
    "Canonicalize URLs and remove known tracking parameters.",
    "Normalize publisher identifiers and feed-specific source aliases.",
    "Clean Unicode punctuation, repeated whitespace and common title prefixes.",
    "Calculate normalized title hashes and canonical URL hashes.",
    "Reject exact duplicate feed entries and near-identical titles from the same source.",
    "Preserve the original title and URL for attribution and auditability.",
])
story += [simple_table(
    ["Input", "Normalized signal", "Why it matters"],
    [
        ["URL with utm_source and social parameters", "Canonical publisher URL", "Stops the same article being stored several times"],
        ["BREAKING:  RBI updates...", "RBI updates...", "Removes routine headline noise before comparison"],
        ["Publisher aliases", "Stable source UUID", "Prevents duplicate source identities"],
        ["Repeated whitespace and punctuation", "Clean comparison text", "Improves hashing and semantic embeddings"],
    ], [48*mm, 50*mm, 62*mm]
)]

# 5 clustering
story += section_title(5, "Five-level event clustering", "Clustering is the central intelligence of Bulletin. It turns repeated coverage into one event while protecting against the dangerous mistake of merging different events that merely sound similar.")
story += [P("Level 1 - Deterministic normalization", "H2")]
story += [P("Exact URLs, normalized titles, tracking-free links, common prefixes and near-duplicate feed entries are collapsed cheaply before semantic work begins.")]
story += [P("Level 2 - Semantic embeddings", "H2")]
story += [P("An embedding is a numeric representation of meaning. Bulletin creates it from the title, RSS description and important metadata, then stores it with Supabase pgvector. Differently worded reports about the same event can therefore become candidates even when their titles share few words.")]
story += [P("Level 3 - Recent candidate comparison", "H2")]
story += [P("A new article is never compared with the entire database. Candidate search is bounded by time, category, geography, named entities and vector similarity. This keeps database work predictable and reduces false matches with old recurring events.")]
story += [P("Level 4 - Consistency verification", "H2")]
story += [P("Similarity is not proof. Before an article joins a cluster, the system checks whether key facts agree:")]
story += bullets([
    "Main people and organizations",
    "Location and event time",
    "Major numbers and quantities",
    "Topic and category",
    "The nature of the event itself",
])
story += [P("Level 5 - Source preservation", "H2")]
story += [P("Every accepted article remains linked to the cluster through a many-to-many table. The canonical story never replaces the underlying reporting. Readers see the original publishers beneath the summary, and the system can later re-verify or update the cluster.")]
story += [callout("The critical safety rule", "Semantic similarity may propose a match, but consistency decides it. Two elections, court hearings, market movements or sports matches involving the same names must remain separate unless the event facts align.", "red")]
story += [P("Threshold calibration", "H2")]
story += [P("Embedding thresholds are tuned against a manually reviewed test set of real news pairs. The set includes same-event pairs, must-remain-separate pairs, recurring events, similar names, elections, court cases, sports, markets and local reporting. Launch is blocked until threshold errors are understood.")]
story += [P("Cluster lifecycle", "H2")]
story += [simple_table(
    ["State", "Meaning", "Next action"],
    [
        ["Candidate", "Article has plausible recent neighbors", "Run consistency checks"],
        ["Open", "Cluster may accept additional reports", "Attach sources and update evidence"],
        ["Verified", "Evidence is sufficient and consistent", "Generate canonical summary"],
        ["Conflicted", "Reliable sources disagree materially", "Attribute differences or reject"],
        ["Quarantined", "Unsafe, malformed or administratively blocked", "Never deliver until reviewed"],
        ["Updated", "Meaningful new development occurred", "Create update version and label it"],
    ], [32*mm, 65*mm, 63*mm]
)]

# 6 evidence
story += section_title(6, "Evidence strength and story eligibility", "Bulletin prefers fewer trustworthy stories over a full briefing padded with weak or unsupported material.")
story += [P("What 'weak' actually means", "H2")]
story += [P("Weak does not mean local, niche, unpopular or single-source. A local story from one trustworthy publisher can qualify. Weakness means the available evidence cannot safely support the product's promised output.")]
story += bullets([
    "A vague headline with too little factual detail for a 3 to 4 sentence summary.",
    "Missing or untrustworthy publication time, original URL or publisher identity.",
    "Opinion, gossip, sponsorship or an unverified claim presented as reporting.",
    "A repeated story with no meaningful development.",
    "A cluster whose internal reports conflict too heavily.",
    "A sensitive claim supported only by weak or insufficient evidence.",
])
story += [P("Sensitive-story rule", "H2")]
story += [P("Deaths, public safety, election outcomes, legal accusations, major financial claims, government actions, conflict, disasters and major health claims normally require at least two independent sources or one authoritative primary record plus independent reporting.")]
story += [P("Single-source allowance", "H2")]
story += [P("Single-source stories remain eligible for local, regional and niche reporting where multiple outlets are unlikely. They rank below strong multi-source clusters and face stricter sufficiency checks.")]
story += [P("Conflicting reports", "H2")]
story += bullets([
    "Attribute each claim to the source making it.",
    "State that reports differ when the disagreement itself is newsworthy.",
    "Never select a preferred version without evidence.",
    "Exclude the cluster if a safe summary is impossible.",
])
story += [callout("Quality floor", "If a user requests five stories and only three qualify, Bulletin sends three. If none qualify, it sends a short 'No meaningful updates matched your preferences' message. There are no filler stories.", "green")]

# 7 Gemini
story += section_title(7, "Gemini as a controlled processing engine", "Gemini is not a free-form chatbot inside the pipeline. It performs narrow, versioned tasks with strict schemas, explicit evidence references and fail-closed outcomes.")
story += [P("Provider abstraction", "H2")]
story += [P("All AI access sits behind a provider interface so another provider or model can replace Gemini later. Prompts, request metadata and outputs are versioned independently from application code.")]
story += [P("Separate AI tasks", "H2")]
story += [simple_table(
    ["Task", "Responsibility", "Required result"],
    [
        ["Classification", "Category, geography, entities, central topics and sensitive flags", "Strict structured JSON"],
        ["Cluster verification", "Decide whether candidate reports describe the same event", "Accept, reject, conflict or insufficient evidence"],
        ["Summarization", "Create canonical headline, 3 to 4 sentence summary and why-it-matters line", "Source-linked factual JSON"],
        ["Localization", "Create Hindi or Malayalam while preserving all canonical facts", "Language version tied to canonical summary"],
        ["Final verification", "Compare proposed output with supplied evidence", "Pass or explicit failure reasons"],
    ], [34*mm, 76*mm, 50*mm], small=True
)]
story += [P("No conversational blocking", "H2")]
story += [P("Gemini is never allowed to ask follow-up questions. Every task returns one machine-readable status: success, insufficient_evidence, conflicting_evidence, invalid_input or failed. Anything outside the schema is invalid output.")]
story += [P("Prompt constraints", "H2")]
story += bullets([
    "Reference only supplied source IDs.",
    "Forbid unsupported facts, invented quotations and invented numbers.",
    "Preserve uncertainty and attribution.",
    "Separate facts from inference.",
    "Avoid sensational or clickbait headlines.",
    "Return insufficient evidence instead of improvising.",
    "Include prompt version, model and task metadata.",
])
story += [P("Retry policy", "H2")]
story += [P("Malformed or unsupported output receives one tightly controlled correction attempt. If validation fails again, the task is marked failed, the cluster is excluded and the failure becomes visible to the admin. Endless retries are forbidden.")]
story += [P("Final verification", "H2")]
story += [P("Every generated summary receives a short independent verification call before it can be delivered. Verification runs once per shared summary, not once per subscriber. It returns pass or specific failure reasons.")]
story += [callout("Free-tier guard", "The system tracks its own Gemini requests and token estimates, reserves capacity for verification, and stops new AI work before a conservative quota ceiling. Verification is never skipped to squeeze in more stories.", "amber")]

# 8 summaries/languages
story += section_title(8, "Shared summaries, languages and meaningful updates", "The canonical story is a reusable product asset. It is generated once, verified once and localized only when needed.")
story += [P("Canonical English summary", "H2")]
story += [P("Each eligible cluster receives one verified English summary containing category, rewritten headline, concise factual summary, why-it-matters line, source IDs, uncertainty markers and update status.")]
story += [P("Lazy localization", "H2")]
story += [P("Hindi and Malayalam are generated only when a subscriber first needs that cluster in the language. The version is stored and reused for later subscribers. Localization must preserve names, numbers, uncertainty, attribution and source references exactly.")]
story += [P("Repeat-story suppression", "H2")]
story += bullets([
    "A cluster already delivered to a subscriber is excluded from later briefings.",
    "A rewritten headline or an additional publisher repeating the same facts is not an update.",
    "A meaningful new development creates an update version and may re-enter ranking.",
    "The email shows an Update label when the story legitimately returns.",
])
story += [P("Time windows", "H2")]
story += [simple_table(
    ["Frequency", "Relevant window"],
    [
        ["Daily", "Since the previous briefing, normally about 24 hours"],
        ["Weekdays", "Since the previous weekday delivery; Monday includes the weekend gap"],
        ["Weekends", "Since the previous weekend delivery"],
        ["Weekly", "Since the previous weekly delivery, up to roughly seven days"],
    ], [45*mm, 115*mm]
)]
story += [callout("Original architecture retained", "All valid news is ingested, normalized and clustered. Every eligible cluster is summarized and stored before personalization. A proposed demand-driven summarization change was rejected because it would add preference dependencies and delivery-time complexity.", "blue")]

# 9 personalization
story += section_title(9, "Personalization without a black box", "Personalization uses transparent structured metadata and deterministic scoring. It does not require a separate Gemini conversation for each user.")
story += pipeline_steps([
    ("Load eligible clusters", "Use the subscriber's delivery window and verified summary state."),
    ("Remove repeats", "Exclude previously delivered cluster versions unless marked as meaningful updates."),
    ("Apply boundaries", "Require selected categories or an explicit custom-topic match."),
    ("Apply exclusions", "Block only when an excluded topic is central, not incidental."),
    ("Score relevance", "Combine topic, geography, recency, evidence and source quality."),
    ("Re-rank diversity", "Prevent one category or one subject from dominating."),
    ("Select quality set", "Return up to the requested count without filling weak positions."),
])
story += [P("Preference boundaries", "H2")]
story += bullets([
    "A nationally important story outside selected categories is not inserted automatically.",
    "Custom topics are explicit interests and may qualify independently of categories.",
    "Excluded topics operate semantically: central involvement blocks; incidental mention does not.",
])
story += [P("Geographic order", "H2")]
story += [P("National importance is ranked first, then state relevance, then city relevance. State and city signals personalize the result without allowing weak local material to displace stronger national reporting.")]
story += [P("Diversity rule", "H2")]
story += bullets([
    "For 3 to 4 stories, normally no more than 2 come from one category.",
    "For 5 to 10 stories, normally no more than 40 percent come from one category.",
    "The limit relaxes when the user chose only one category or strong alternatives do not exist.",
    "Several stories about essentially the same subject are suppressed even if they sit in different categories.",
])
story += [P("Conceptual scoring model", "H2")]
story += [simple_table(
    ["Signal", "Effect"],
    [
        ["Direct custom-topic match", "Strong positive signal because the user explicitly requested it"],
        ["Selected category match", "Required eligibility unless a custom topic independently qualifies"],
        ["National / state / city relevance", "Descending geographic priority"],
        ["Recency and meaningful development", "Newer meaningful facts outrank repetitive updates"],
        ["Multi-source and primary evidence", "Raises confidence and ranking"],
        ["Source quality", "Rewards reliable reporting without automatically rejecting niche sources"],
        ["Already delivered", "Hard exclusion unless a meaningful update version exists"],
        ["Central excluded topic", "Hard exclusion"],
    ], [62*mm, 98*mm]
)]
story += [callout("No click tracking", "The MVP does not track source-link clicks. Personalization comes from explicit user choices and transparent rules, not hidden behavioral profiles or machine-learning inference.", "green")]

# 10 scheduling
story += section_title(10, "Scheduling, idempotency and worker coordination", "Minute-level scheduling is achieved with Supabase Cron calling protected Vercel functions. PostgreSQL coordinates claims and prevents duplicate work.")
story += [P("Subscriber schedule", "H2")]
story += [P("Each subscriber stores next_delivery_at in UTC. The scheduler interprets the user's exact local time and IANA timezone, then calculates the next UTC instant for daily, weekday, weekend or weekly frequency.")]
story += [P("Due delivery transaction", "H2")]
story += pipeline_steps([
    ("Find due subscriber", "Query confirmed, active subscribers whose UTC delivery time has arrived."),
    ("Claim atomically", "Lock or lease the schedule so another worker cannot claim the same slot."),
    ("Create delivery", "Insert a delivery row with a unique subscriber plus scheduled-time key."),
    ("Advance schedule", "Calculate and store the next future delivery time in the same transaction."),
    ("Queue delivery", "Leave a resumable pending job for the email worker."),
])
story += [P("Idempotency", "H2")]
story += [P("The unique idempotency key is conceptually subscriber UUID plus scheduled UTC delivery time. Even if cron overlaps, a function restarts or a network response is lost, the database cannot create a second scheduled delivery for the same slot.")]
story += [P("Worker groups", "H2")]
story += [simple_table(
    ["Worker", "Wake-up", "Responsibility"],
    [
        ["RSS ingestion", "About every 5 minutes", "Claim due feeds, fetch, normalize and update health"],
        ["Article processing", "Every minute", "Embed, cluster, verify, summarize and persist statuses"],
        ["Briefing scheduler", "Every minute", "Create idempotent delivery records and advance schedules"],
        ["Email delivery", "Every minute", "Rank stories, localize if needed, render, send and record"],
        ["Cleanup", "Daily", "Expire technical data and unverified sign-ups according to policy"],
    ], [35*mm, 34*mm, 91*mm], small=True
)]
story += [P("Pause and resume", "H2")]
story += bullets([
    "Pause immediately prevents pending unsent delivery.",
    "Resume calculates the next normal scheduled delivery.",
    "No catch-up email is sent merely because a user resumed.",
])
story += [callout("Delivery target", "Under normal conditions, sending should begin within 1 to 2 minutes of the chosen time. The acceptable launch target is within 5 minutes. Final inbox arrival remains controlled by the recipient's email provider.", "blue")]

# 11 email
story += section_title(11, "Email assembly and delivery", "The last mile combines the selected stories, language and theme into email-safe HTML, then sends through one dedicated Gmail account.")
story += [P("Briefing composition", "H2")]
story += bullets([
    "Bulletin masthead and localized date.",
    "Personal greeting and actual delivered-story count.",
    "For each story: category, rewritten headline, 3 to 4 sentence summary, why it matters, sources and optional Update label.",
    "Footer: Exclusively prepared for the current subscriber name.",
    "Secure Manage briefing link in every briefing.",
])
story += [P("Themes", "H2")]
story += [simple_table(
    ["Light Editorial", "Dark Intelligence"],
    [[
        "Pale ivory, charcoal typography, muted blue, fine dividers, bold Bulletin masthead and editorial rhythm. Default theme.",
        "Near-black background, warm white type, restrained blue highlights and premium intelligence-report character without cyberpunk styling."
    ]], [80*mm, 80*mm]
)]
story += [P("Subject and privacy", "H2")]
story += bullets([
    "Default subject: Your Bulletin - 12 July 2026, localized by briefing language.",
    "No clickbait story headlines in the subject.",
    "Source links go directly to publishers.",
    "No click tracking or personal tracking identifiers.",
])
story += [P("SMTP configuration", "H2")]
story += bullets([
    "Dedicated Gmail sender with two-factor authentication and an App Password.",
    "Nodemailer over SMTP port 465 or 587.",
    "Credentials stored only as server-side environment variables.",
    "The normal Gmail password is never stored or used by the application.",
])
story += [P("Retry behavior", "H2")]
story += [P("Temporary SMTP failures retry after approximately 5, 15 and 60 minutes. Permanent failures do not retry indefinitely. Successful deliveries cannot be resent from the admin dashboard, protecting users from accidental duplicates.")]
story += [callout("Email-client QA", "Before launch, both themes must be tested in Gmail desktop and mobile, Apple Mail, Outlook where practical, and client light/dark modes. Implementation uses tables and inline styles suitable for email clients.", "amber")]

# 12 identity security
story += section_title(12, "Subscriber identity and secure management access", "Bulletin avoids passwords without allowing an email address alone to reveal preferences.")
story += [P("Database identity", "H2")]
story += bullets([
    "Each subscriber has a generated UUID primary key.",
    "Email is unique but is not the primary key.",
    "Duplicate subscriber records are blocked at the database level.",
])
story += [P("Signed management link", "H2")]
story += [P("The permanent email link represents a public subscriber reference, token version and HMAC signature created with a server-only secret. The raw private token does not need to be stored in the database.")]
story += pipeline_steps([
    ("Receive link", "The server receives the signed reference from an email."),
    ("Verify signature", "Use timing-safe comparison and the server-only signing secret."),
    ("Check version", "Reject links whose subscriber token_version has been incremented."),
    ("Issue session", "Create a short-lived Secure, HttpOnly, SameSite cookie."),
    ("Clean redirect", "Remove the private signature from the visible browser URL."),
])
story += [P("Existing email behavior", "H2")]
story += bullets([
    "Verified subscriber: send a secure management link; never show preferences based on typed email.",
    "Unverified sign-up: preserve pending preferences and send a fresh confirmation link.",
    "Unknown Manage briefing email: show New here? Create your Bulletin and prefill onboarding.",
    "Unverified records expire after seven days.",
])
story += [P("Verification safety", "H2")]
story += bullets([
    "Verification links expire after 24 hours and work only once.",
    "Requesting a new link invalidates older links.",
    "A GET request opens a confirmation page; a deliberate button performs confirmation.",
    "This prevents automated email scanners from activating a briefing accidentally.",
])
story += [P("Deletion safety", "H2")]
story += [P("Unsubscribe opens an explicit confirmation page. Only a deliberate confirmation deletes the subscriber profile, preferences, schedule, access data and personal delivery data. A single email-link GET request never deletes anything.")]
story += [callout("Known tradeoff", "Anyone who obtains the actual private management link may access preferences. HTTPS, signed links, token invalidation, clean redirects and secure session cookies reduce risk, but a compromised inbox or forwarded email remains a real limitation of passwordless access.", "red")]

# 13 data model
story += section_title(13, "Database model and retention", "Supabase PostgreSQL is the source of truth for users, sources, articles, clusters, summaries and every delivery attempt.")
story += [P("Core tables", "H2")]
story += [simple_table(
    ["Table", "Purpose"],
    [
        ["subscribers", "Identity, confirmation, status, preferences, schedule, timezone, next delivery and theme"],
        ["preference_versions", "Thirty-day snapshots used for recovery and change diagnosis"],
        ["sources", "Feed configuration, language, geography, reliability, schedule and health"],
        ["articles", "Normalized public RSS article records and processing state"],
        ["story_clusters", "Canonical grouped events, evidence state, update lineage and embeddings"],
        ["story_cluster_articles", "Many-to-many evidence links between clusters and source articles"],
        ["cluster_summaries", "Canonical and localized versions, prompt/model metadata and verification state"],
        ["deliveries", "One record per scheduled briefing attempt with unique idempotency key"],
        ["delivery_stories", "Exact cluster versions included in each briefing"],
        ["admin_audit_log", "Owner actions, targets, timestamps and outcomes"],
    ], [50*mm, 110*mm], small=True
)]
story += [P("Retention", "H2")]
story += [simple_table(
    ["Data", "Initial retention"],
    [
        ["Raw RSS metadata", "14 days"],
        ["Story clusters and summaries", "30 days"],
        ["Delivery records", "90 days"],
        ["Preference versions", "30 days"],
        ["Unverified sign-ups", "7 days"],
        ["Confirmed subscriber personal data", "Until confirmed unsubscribe/deletion"],
    ], [75*mm, 85*mm]
)]
story += [P("Atomic preference updates", "H2")]
story += [P("Managed preferences use one explicit Save changes action. The complete input is validated, the previous version is snapshotted and the new state is committed as one transaction. Theme selection is the only preference that saves immediately.")]
story += [P("Row Level Security", "H2")]
story += [P("Public clients receive no direct broad access to subscriber data. Server-only functions use narrowly scoped service credentials, and database policies protect tables from accidental frontend exposure.")]

# 14 Admin
story += section_title(14, "Private owner operations", "The admin dashboard provides broad operational control while deliberately withholding dangerous shortcuts that could send duplicates or silently change user intent.")
story += [P("Visibility", "H2")]
story += bullets([
    "No public navigation or footer link.",
    "Excluded from sitemap and search indexing.",
    "Hidden route protected by allowlisted owner email and short-lived one-time login link.",
])
story += [P("Owner controls", "H2")]
story += bullets([
    "Enable, disable, test and manually refresh RSS sources.",
    "Quarantine a story or cluster so it cannot be delivered.",
    "Reprocess failed clusters and regenerate failed summaries within quota safeguards.",
    "Emergency pause and resume for all email delivery.",
    "Pause and resume Gemini processing when quota becomes unsafe.",
    "Search subscriber status, schedule and recent delivery results.",
    "Resend verification or management emails.",
    "Pause/resume a subscriber, invalidate old management links or cancel pending unsent delivery.",
    "Delete a subscriber only after strong confirmation.",
    "Review an audit log of every admin action.",
])
story += [P("Retry boundaries", "H2")]
story += bullets([
    "Retry temporary RSS, processing, Gemini and SMTP failures.",
    "Never retry completed jobs.",
    "Never retry permanent email failures indefinitely.",
    "Never manually resend a successful briefing.",
])
story += [P("What the admin cannot do silently", "H2")]
story += [P("The owner cannot impersonate a subscriber, silently edit personal preferences or bypass idempotency. Full control means safe operational control, not a button that can violate trust.")]
story += [P("Alerts", "H2")]
story += [P("Repeated delivery failures, worker stalls, quota exhaustion and widespread source failure trigger urgent owner email. Isolated or low-priority warnings stay in the dashboard to avoid alert fatigue.")]

# 15 failure handling
story += section_title(15, "Failure states and recovery", "Every important failure must become explicit, resumable and visible. Silent loss is treated as a product defect.")
story += [simple_table(
    ["Failure", "System response", "User impact"],
    [
        ["RSS timeout", "Backoff, isolate source, preserve other fetches", "None unless source remains unavailable"],
        ["Malformed feed", "Mark parser failure, alert after threshold", "Other sources continue"],
        ["Worker crash", "Lease expires; another worker resumes", "Short delay, no duplicate job"],
        ["Gemini malformed JSON", "One repair attempt, then failed state", "Story excluded"],
        ["Gemini quota guard", "Stop new AI tasks before ceiling", "Use already verified stories or empty briefing"],
        ["Cluster conflict", "Attribute disagreement or quarantine", "Potentially fewer stories"],
        ["SMTP temporary failure", "Retry at about 5, 15 and 60 minutes", "Delayed email"],
        ["SMTP permanent failure", "Stop retries and expose admin status", "No repeated unwanted sends"],
        ["Duplicate scheduler call", "Unique key rejects second delivery", "No duplicate briefing"],
        ["Database update conflict", "Transaction rolls back; previous version remains", "User can safely retry"],
    ], [38*mm, 76*mm, 46*mm], small=True
)]
story += [Spacer(1, 8), dark_panel("Fail closed, not open", [
    "When evidence, AI output, quota or delivery state is uncertain, Bulletin chooses fewer stories, a delayed operation or a visible failure. It never invents content, silently overwrites preferences or risks a duplicate email to preserve the appearance of success.",
])]

# 16 backups
story += section_title(16, "Encrypted backup and disaster recovery", "A database is not protected merely because it is hosted. Bulletin requires a separate, encrypted and restore-tested copy.")
story += [P("Backup design", "H2")]
story += bullets([
    "Automated daily Supabase database export.",
    "Encrypt before the backup leaves the process.",
    "Store in a dedicated Google Drive folder at zero expected storage cost for MVP scale.",
    "Keep seven daily backups and four weekly backups.",
    "Store the encryption key separately from Drive and deployment source code.",
    "Run a real restore test monthly during the private beta.",
])
story += [P("Why restore testing matters", "H2")]
story += [P("A file called backup is not evidence of recoverability. The restore test verifies credentials, encryption keys, database compatibility, extensions such as pgvector, constraints, functions and application behavior against the recovered data.")]
story += [P("Recovery sequence", "H2")]
story += pipeline_steps([
    ("Declare incident", "Stop writes and email delivery to prevent further damage."),
    ("Select backup", "Choose the newest known-good encrypted copy."),
    ("Decrypt safely", "Use the separately stored recovery key in a controlled environment."),
    ("Restore database", "Recreate schema, data, extensions, functions and constraints."),
    ("Validate", "Check subscriber counts, schedules, deliveries and cluster integrity."),
    ("Resume cautiously", "Recalculate due work without duplicating successful deliveries."),
])

# 17 testing
story += section_title(17, "Reliability and launch gates", "Bulletin is not ready because it works once. It is ready only after failure has been deliberately introduced and the system still protects user trust.")
story += [P("Required simulations", "H2")]
story += bullets([
    "One hundred subscribers becoming due together.",
    "Thousands of preference updates with zero corruption.",
    "Duplicate scheduler calls and overlapping worker invocations.",
    "Worker crashes at each major state transition.",
    "Temporary and permanent Gmail failures.",
    "Malformed Gemini JSON, unsupported facts and quota exhaustion.",
    "RSS timeouts, invalid XML, oversized payloads and disabled sources.",
    "Daily, weekday, weekend and weekly delivery schedules.",
    "Multiple timezones and daylight-saving transitions.",
    "Backup creation and full restoration.",
])
story += [P("Launch gate", "H2")]
story += bullets([
    "Zero corrupted or lost preferences.",
    "Zero duplicate scheduled deliveries.",
    "Every processing failure visible to the admin.",
    "At least 99 percent of test sends started within five minutes of selected time.",
    "A 7 to 14 day soak test completed successfully.",
])
story += [P("Rollout", "H2")]
story += [simple_table(
    ["Stage", "Audience", "Purpose"],
    [
        ["1", "Owner-controlled accounts", "Prove end-to-end correctness and inspect every email"],
        ["2", "Five trusted users", "Observe real schedules, devices and preference changes"],
        ["3", "Twenty users", "Validate worker capacity, quota and source relevance"],
        ["4", "Fifty to one hundred users", "Private beta operating target"],
    ], [18*mm, 55*mm, 87*mm]
)]
story += [callout("No heroic launch", "If the free architecture cannot meet the launch gate, Bulletin does not launch publicly. The same worker logic can move to a paid always-on host later without changing the product model.", "red")]

# 18 implementation map
story += section_title(18, "Implementation map", "The architecture is built in dependency order so security and data integrity arrive before the intelligence pipeline and visual polish.")
story += [simple_table(
    ["Phase", "Outcome"],
    [
        ["1. Foundation", "Next.js, TypeScript, validation, configuration, logging and centralized product name"],
        ["2. Database", "Schema, pgvector, constraints, RLS, job-claim functions and migrations"],
        ["3. Onboarding", "Five-step validated flow, draft protection, review and consent"],
        ["4. Secure access", "Verification, signed links, token invalidation, sessions and management"],
        ["5. Landing page", "Approved Light Editorial design with focused responsive fixes"],
        ["6. Ingestion", "Source catalogue, scheduling, parsing, normalization and health"],
        ["7. Clustering", "Embeddings, candidate search, consistency checks and threshold tests"],
        ["8. Gemini", "Provider abstraction, schemas, prompts, retries, verification and quotas"],
        ["9. Personalization", "Eligibility, scoring, diversity and repeat suppression"],
        ["10. Scheduling", "Timezone-safe next delivery and idempotent creation"],
        ["11. Email", "Themes, localization, SMTP, retries and client testing"],
        ["12. Admin", "Health, alerts, safe controls and audit log"],
        ["13. Backups", "Encrypted automated Drive backup and restore drills"],
        ["14. Reliability", "Failure simulation, soak test and staged rollout"],
    ], [36*mm, 124*mm], small=True
)]
story += [P("Confirmed stack", "H2")]
story += bullets([
    "Next.js, TypeScript and Tailwind CSS",
    "GSAP only where selected landing-page motion adds value",
    "Supabase PostgreSQL, pgvector and Supabase Cron",
    "Protected Vercel Functions for stateless workers",
    "Gemini behind a provider abstraction",
    "Nodemailer and Gmail SMTP",
    "Shared TypeScript types and schema validation such as Zod",
    "One monorepo",
])
story += [callout("Important boundary", "This blueprint is complete planning, not authorization to begin building. Development starts only after explicit owner approval of the consolidated implementation plan.", "amber")]

# 19 product logic summary
story += section_title(19, "The interesting logic - what makes Bulletin special", "The defensible value is not a single AI prompt. It is the disciplined composition of many understandable rules.")
story += [P("1. Shared intelligence, personal delivery", "H2")]
story += [P("Public news is processed once; only selection and delivery vary by person. This creates both efficiency and consistency.")]
story += [P("2. Similarity proposes; consistency decides", "H2")]
story += [P("Embeddings discover possible event matches, but named entities, geography, time, numbers and event nature prevent unsafe merging.")]
story += [P("3. Every source survives summarization", "H2")]
story += [P("The canonical story does not erase the reporting. Readers can inspect every attached publisher, and the system can re-evaluate evidence later.")]
story += [P("4. Personalization is explicit", "H2")]
story += [P("Categories, custom topics, exclusions and geography are visible choices. There is no hidden click-tracking profile in the MVP.")]
story += [P("5. Exclusions understand context", "H2")]
story += [P("A blocked term removes a story only when it is central, preventing naive keyword filters from discarding useful reporting.")]
story += [P("6. Updates require actual change", "H2")]
story += [P("A new headline or additional publisher does not revive an old story. Only a meaningful development creates an Update.")]
story += [P("7. Reliability beats completeness", "H2")]
story += [P("Three strong stories are better than five padded ones. An empty briefing is better than unsupported text.")]
story += [P("8. Every scheduled delivery has one identity", "H2")]
story += [P("The subscriber plus scheduled UTC time becomes a database-enforced idempotency key, making duplicate delivery structurally difficult.")]
story += [P("9. AI is boxed into narrow jobs", "H2")]
story += [P("Classification, cluster verification, summarization, localization and validation have separate schemas, statuses and failure handling.")]
story += [P("10. Owner control remains safe", "H2")]
story += [P("The admin can pause, quarantine, retry and recover without bypassing the rules that protect subscribers.")]

# 20 glossary
story += section_title(20, "Plain-language glossary", "A compact reference for the technical ideas used throughout the blueprint.")
glossary = [
    ("Atomic operation", "Several database changes succeed together or none of them do."),
    ("Canonical story", "The shared representation of one real-world news event."),
    ("Cluster", "A group of articles that report the same event."),
    ("Conditional HTTP request", "A request that downloads a feed only when it changed."),
    ("Embedding", "A numeric representation of meaning used for semantic comparison."),
    ("Fail closed", "Reject or pause uncertain work instead of allowing unsafe output."),
    ("HMAC signature", "A server-created cryptographic proof that a private link is genuine."),
    ("HttpOnly cookie", "A browser session cookie unavailable to frontend JavaScript."),
    ("Idempotency", "Repeating the same request produces no duplicate side effect."),
    ("Lease", "A temporary database claim allowing crashed work to be recovered."),
    ("Localization", "Producing a language version while preserving the same facts."),
    ("pgvector", "A PostgreSQL extension for storing and searching embeddings."),
    ("RLS", "Row Level Security policies controlling which database rows may be accessed."),
    ("Semantic exclusion", "Blocking a topic only when it is central, not incidentally mentioned."),
    ("Soak test", "Running the complete system continuously to reveal delayed failures."),
    ("Stateless function", "A worker that keeps durable state in the database, not in memory."),
    ("Token version", "A subscriber counter used to invalidate all older management links."),
]
story += [simple_table(["Term", "Meaning"], glossary, [44*mm, 116*mm], small=True)]

# Closing
story += [PageBreak(), Spacer(1, 24 * mm), P("THE OWNER'S SUMMARY", "CoverEyebrow")]
story += [P("A calm product.<br/>A serious system.", "CoverTitle")]
story += [P("Bulletin appears simple to the reader because the complexity is handled behind the scenes with restraint.", "CoverSub")]
story += [dark_panel("The complete chain", [
    "Verified sources are fetched once. Cheap duplicates disappear first. Semantic candidates are tested against real event facts. Evidence remains attached. Gemini performs small structured tasks, then a final verifier checks the shared summary. The database stores every important state. Transparent rules personalize without hidden tracking. UTC scheduling and idempotency protect delivery. Signed links protect preferences. The owner can intervene safely. Backups and launch gates protect the product itself.",
    "The reader receives only what matters: a concise, trustworthy briefing at the chosen time.",
])]
story += [Spacer(1, 12), P("Built through patience, careful questions and a refusal to trade trust for speed.", "Quote")]
story += [Spacer(1, 22 * mm), HRFlowable(width=42*mm, thickness=2, color=BLUE, spaceAfter=12)]
story += [P("BULLETIN", "CoverEyebrow"), P("Stay informed without surrendering your time and attention.", "CoverMeta")]


def build():
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    frame = Frame(22*mm, 20*mm, PAGE_W - 44*mm, PAGE_H - 38*mm, id="main", leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
    doc = NumberedDocTemplate(
        OUT, pagesize=A4, leftMargin=22*mm, rightMargin=22*mm,
        topMargin=18*mm, bottomMargin=20*mm,
        title="Bulletin - Backend Automation Blueprint",
        author="Bulletin Product Planning",
        subject="Detailed owner-only architecture and automation blueprint",
    )
    doc.addPageTemplates([PageTemplate(id="editorial", frames=[frame], onPage=page_footer)])
    doc.multiBuild(story)
    print(OUT)


if __name__ == "__main__":
    build()
