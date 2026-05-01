# Bufaisal Project Documentation

This folder contains the strategic and operational reasoning behind the Bufaisal website. Every code change should align with these documents.

## Files

- `SEO-AGENT.md` — Operating document for the AI agent that generates product listings (titles, descriptions, FAQs, schema, etc.)
- `WEBSITE-ARCHITECTURE.md` — Architectural decisions for the public website with reasoning for each
- `DECISIONS.md` — Chronological log of all locked product, brand, and technical decisions

## When to consult these docs

- Before adding a new feature → check `WEBSITE-ARCHITECTURE.md` and `DECISIONS.md`
- Before changing how listings are generated → check `SEO-AGENT.md`
- Before changing brand voice or copy → check `SEO-AGENT.md`
- When onboarding a new developer → start with all three

These files are the source of truth. Code that contradicts them must be reviewed.
