# Candidate Transformer

A production-quality CLI tool that transforms messy, multi-source candidate data into a single trustworthy canonical profile. It merges structured (CSV) and unstructured (GitHub, PDF) data with deterministic conflict resolution, tracks the provenance of every field, and supports runtime schema projection.

## Install

```bash
npm install
npm run build
```

## Run — Default Schema

```bash
npx ts-node src/cli.ts --csv sample-inputs/candidates.csv --github octocat --resume sample-inputs/resume.pdf --pretty
```

## Run — Custom Config

```bash
npx ts-node src/cli.ts --csv sample-inputs/candidates.csv --config sample-inputs/output-config.json --pretty
```

## Run Tests

```bash
npm test
```

## Architecture Decisions

**SHA-256 Fingerprinting vs Probabilistic Matching:**
We use a deterministic SHA-256 hash of sorted, normalized emails and phone numbers to generate the `candidate_id` instead of probabilistic name matching. Probabilistic matching often leads to silent false-positives that pollute downstream systems, whereas cryptographic fingerprinting guarantees explainable, deterministic ID generation where the same inputs always yield the same ID.

**Project Separated from Merge:**
The `project()` layer is implemented as a completely separate downstream step from `mergeRecords()`. This strict decoupling ensures the core canonical merge engine remains pure and unmutated by varying downstream consumer requirements. Downstream products can configure custom schemas (renaming fields, omitting data) dynamically at runtime via JSON without requiring code changes or redeployments to the engine.

**Enforcing "Wrong-but-Confident" Architecturally:**
We architecturally limit the `overall_confidence` score rather than just adding warnings. If a candidate profile lacks contact info (both emails and phones are empty), the maximum possible confidence is strictly capped at 0.40, regardless of how well other fields match. This prevents a sparse or heuristic-heavy profile from silently passing high-confidence thresholds in downstream hiring decisions.

## Known Limitations & Descoped Items

- **NLP Extraction Descoped**: True semantic understanding of unstructured prose in resumes requires deep NLP models. We descoped this for speed, relying on robust regex heuristics for sectional boundary detection instead.
- **Probabilistic Entity Resolution Descoped**: Identifying "Jane Doe" from CSV as the exact same person as "Jane M. Doe" in a PDF is descoped in favor of deterministic key-matching on emails and phones.
- **Experience Overlap Resolution**: Rather than intelligently merging concurrent overlapping experiences (e.g., holding two jobs simultaneously), we simply retain all extracted records and flag inferred overlaps in the provenance.
- **Rate Limiting Handling**: While the GitHub adapter degrades gracefully, it does not currently implement smart retry-after queuing to recover from rate limits during bulk runs.

## Sample Output (Default Schema snippet)

```json
{
  "candidate_id": "cand_a1b2c3d4e5f6g7h8",
  "full_name": "Jane Doe",
  "emails": [
    "jane.doe@gmail.com"
  ],
  "phones": [
    "+19876543210"
  ],
  "location": {},
  "links": {
    "github": "https://github.com/octocat"
  },
  "headline": null,
  "years_experience": null,
  "skills": [
    {
      "name": "javascript",
      "confidence": 0.92,
      "sources": ["pdf", "github"]
    }
  ],
  "experience": [
    {
      "company": "Acme Corp",
      "title": "Senior Software Engineer",
      "start": "2020-01",
      "end": null,
      "summary": "Worked on distributed systems."
    }
  ],
  "education": [],
  "provenance": [
    {
      "field": "full_name",
      "source": "csv",
      "method": "direct",
      "raw_value": "Jane Doe"
    },
    {
      "field": "emails",
      "source": "csv",
      "method": "normalized",
      "raw_value": "jane.doe@gmail.com"
    }
  ],
  "overall_confidence": 0.85
}
```
