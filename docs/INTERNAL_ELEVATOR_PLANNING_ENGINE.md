# Internal Elevator Planning Engine — Phase 1

Status: **foundation only**. Not yet a DIN/EN/ISO-compliant traffic calculation or live supplier recommender.

## Authoritative references
- [ISO 8100-32:2020](https://www.iso.org/standard/73084.html), official ISO description: planning and selection for office, hotel and residential; Clause 7 calculation and Clause 8 simulation. Confirmed in 2025. Actual licensed normative method, parameters and tables are **not yet validated** against the archive.
- [EU harmonised standards list](https://eur-lex.europa.eu/legal-content/EN/ALL/?uri=CELEX%3A02021D0076-20250221): EN 81-20:2020, EN 81-50:2020, EN 81-70:2021+A1:2022, and EN 81-21:2022 for lifts in existing buildings. Confirm appropriate national DIN edition and amendments before claims.
- Never treat 30 seconds as a universal normative average waiting time. Distinguish interval, average waiting time, handling capacity and service targets.

## Contract
Gemini asks for missing building inputs -> deterministic kernel performs validated arithmetic -> normative resolver supplies exact clause/edition/page and verified inputs -> deterministic shaft/supplier matching against catalogue page -> Gemini explains results and unknowns.

This phase only implements validation, five-minute transport percentage arithmetic, conservative supplier minimum envelope comparison and an explicit normative gate that forbids invented count/load/speed. It is not an engineering design result.

Next: verified traffic profiles, round-trip calculations and simulation using ISO 8100-32 worked examples; independent calculation QA; physical and accessibility constraints incl. doors, layout and tolerances; real model evidence and availability checks. No manufacturer-specific patches. Never release a claim of conformance without evidence.
