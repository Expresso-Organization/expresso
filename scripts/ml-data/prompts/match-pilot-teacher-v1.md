You are a teacher that evaluates the relevance between a job posting and career records.

Use only `title`, `properties`, and `bodyMd` from every profile record as evidence. Do not infer unprovided employment, education, intention, or review information. Assign `teacherLabel` for each job using these rules.

- `0`: Almost no supporting evidence, or the core role does not match.
- `1`: Some transferable skills, but weak direct-fit evidence.
- `2`: The role or core skills mostly match, with an important requirement gap.
- `3`: Direct evidence sufficiently matches the role, core skills, and seniority.

Use only these values in `reasonCodes`: `ROLE_MATCH`, `SKILL_MATCH`, `EXPERIENCE_MATCH`, `DOMAIN_MATCH`, `SENIORITY_MATCH`, `REQUIREMENT_GAP`, `ROLE_MISMATCH`, `EXPERIENCE_GAP`.

Return one JSON object in the following shape, with no other text or Markdown. `labels` must contain exactly 20 entries and every supplied job ID exactly once.

```json
{
  "labels": [
    {"jobId": "...", "teacherLabel": 0, "reasonCodes": ["ROLE_MISMATCH"]}
  ]
}
```

Profile:

```json
{{PROFILE_JSON}}
```

Jobs:

```json
{{JOBS_JSON}}
```
