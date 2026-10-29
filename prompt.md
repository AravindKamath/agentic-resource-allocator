# Prompt Archive — Intelligent IT Resource Allocation System

> **Provenance note:** This is a reconstructed prompt archive, not a verbatim export of the original AI conversation history. The exact original prompts were not all available for retrieval. The prompts below have been recreated from the project's documented goals, architecture, implementation notes, and workflow. They represent major prompts that could have guided project creation. Bug-fix and incident-specific prompts are intentionally excluded. Do not describe these as exact historical transcripts unless you verify them against the original chat history.

## How to use this file

- Prompts are organized by project phase.
- Each prompt is written as a standalone instruction for a coding assistant.
- Adapt paths, framework versions, and implementation details to the repository's actual state before reuse.
- These are project-building prompts, not a claim that every prompt was used verbatim or that every requested feature was completed.

---

# Phase 1 — Project Ideation and Requirements

## Prompt 1 — Define the problem and project scope

You are helping design an Intelligent IT Resource Allocation System for a college IT department. Staff receive requests for computers, workstations, servers, and other IT equipment through email or a web interface. They must interpret each request, identify technical requirements, check inventory, and decide whether an asset can be assigned.

Help define the problem, target users, objectives, scope, assumptions, constraints, and expected outcomes. Keep the proposal achievable as a student project with a working prototype. Distinguish essential features from optional extensions. Do not claim that AI alone can safely make allocation decisions; preserve deterministic compatibility checks and administrator oversight.

Deliver a concise problem statement, functional and non-functional requirements, user roles, primary use cases, in-scope/out-of-scope features, and testable acceptance criteria.

## Prompt 2 — Turn requirements into user journeys

Map the primary journeys for a requester and an IT administrator. Include web-form submission, Gmail intake, requirement extraction, inventory matching, administrator review, approval, allocation, status changes, notifications, and unfulfilled requests.

For each journey, show the steps, system responses, relevant states, failure paths, and acceptance criteria. Keep the workflow consistent with a prototype rather than assuming an enterprise ITSM platform.

## Prompt 3 — Identify risks and design principles

Identify risks involving incorrect extraction, incompatible allocation, stale inventory, duplicate processing, email authorization, LLM prompt injection, and notification failures. Propose design principles and tests that address these risks. Keep hard compatibility rules and authorization in backend application code rather than relying on model instructions. Treat email content as untrusted input. Separate risks mitigated in the prototype from those requiring further evaluation.

Deliver a risk table with risk, impact, mitigation, and a test that could demonstrate the mitigation.

---

# Phase 2 — Architecture and Technology Choices

## Prompt 4 — Propose the system architecture

Design a maintainable architecture with a React/Vite frontend, Node.js/Express backend API, MongoDB persistence, a separate Python FastAPI extraction service, Gmail API/OAuth for optional email intake and notifications, and Gemini as an optional LLM provider with a deterministic stub provider for development.

Explain component responsibilities, API boundaries, data flow, configuration, and failure handling. Make the system runnable locally and deployable as separate services. Avoid infrastructure components without a clear requirement. Include a Mermaid architecture diagram and concise component descriptions.

## Prompt 5 — Define source-of-truth documentation

Create a `Source_Of_Truth.md` document recording the project goals, confirmed requirements, architecture, data model, request lifecycle, matching and allocation rules, AI provider and stub-mode behavior, Gmail assumptions, security/reliability requirements, known limitations, open decisions, validation commands, and deployment notes.

Separate confirmed implementation facts from proposals and unresolved questions. Update the document as features are added, and do not state that a feature is complete unless repository or test evidence supports it.

## Prompt 6 — Design the repository structure

Inspect the repository and recommend a clear structure for the frontend, backend, extraction agent, tests, scripts, and documentation. Explain the responsibility of routes, middleware, models, domain logic, services, utilities, scripts, and tests.

Prefer a structure that separates HTTP handling, business logic, persistence, and external integrations. Avoid unnecessary abstraction or introducing a framework solely for stylistic reasons. If the existing structure is suitable, preserve it and explain why.

## Prompt 7 — Define the data model

Design MongoDB models for users/requesters and administrators, resource requests, inventory assets, assignments, request history/audit events, and inbound-email/notification metadata where needed.

Specify fields, validation, indexes, references, and lifecycle states. Make asset availability and assignment relationships unambiguous. Consider duplicate email processing, concurrent requests, and traceability. Unknown asset specifications must not be treated as proof that an asset satisfies a requirement.

---

# Phase 3 — Requester and Administrator Interface

## Prompt 8 — Build the requester workflow

Implement the requester workflow in the existing React/Vite application. A requester should submit an IT resource request, provide purpose and hardware requirements, view status, and understand whether the request is being processed, awaiting review, approved, allocated, or unable to be fulfilled.

Keep the form accessible and straightforward. Validate inputs without silently inventing missing requirements. Reuse existing API conventions and components. Include loading, empty, success, and error states. Do not use hardcoded success responses in place of backend integration.

## Prompt 9 — Design a minimal administrator dashboard

Design an administrator dashboard focused on viewing/filtering requests, reviewing extracted specifications, inspecting matching candidates and rejection reasons, approving or rejecting requests where supported, assigning compatible assets, and browsing inventory.

Prioritize clarity over decorative cards and excessive metrics. Use a restrained visual system with readable contrast, a professional dark theme, and a light-theme option if supported by the existing application. Keep destructive actions distinct and confirm them where appropriate. Preserve existing API behavior.

## Prompt 10 — Improve the inventory management experience

Create an inventory interface for viewing and editing asset details: category, availability, manufacturer, model, serial number, operating system, location, department, installed software, CPU cores, RAM, storage capacity/type, and applicable GPU attributes.

Use clear validation and indicate when a specification is unknown. Keep inventory status and active assignments consistent with backend rules. Support searching and filtering without presenting unavailable assets as allocatable. Do not invent asset details or assume missing values satisfy a request.

## Prompt 11 — Establish visual consistency and branding

Review the frontend and establish a coherent design system: restrained black/dark palette, accessible contrast, consistent typography, spacing, borders, form controls, tables, status indicators, and error messages. Preserve the project's logo and avoid redundant branding text where the logo should stand alone.

Make the interface usable on typical laptop and mobile widths. Keep common administrator tasks prominent. Avoid unnecessary animation and visual complexity.

---

# Phase 4 — Backend, Matching, and Allocation

## Prompt 12 — Implement the request lifecycle

Implement or document a clear request lifecycle for incoming IT resource requests. Define valid states and permitted transitions, including receipt, review, approval, allocation, rejection, and escalation where appropriate.

Enforce transitions on the backend rather than trusting frontend controls. Record lifecycle history with timestamps and relevant actor information. Reject invalid transitions with clear API responses. Prevent allocation before the required approval state and make the lifecycle testable through service and API tests.

## Prompt 13 — Implement deterministic inventory matching

Design inventory matching around explicit hard requirements and optional soft preferences. Hard requirements may include category, CPU cores, RAM, storage capacity/type, GPU count, GPU memory, operating system, and availability when relevant.

A candidate violating a hard requirement must not be marked eligible. Rank candidates only after hard constraints pass. Return eligible candidates and useful rejection reasons. Treat unknown asset attributes as unknown, not as proof of compatibility. Keep rules deterministic and covered by unit tests. Do not weaken hard constraints merely to produce a match.

## Prompt 14 — Design candidate ranking and explanations

After filtering incompatible assets, define a transparent way to rank eligible candidates. Consider documented soft preferences such as specification fit or stated user preferences, but never allow a ranking score to override mandatory requirements.

Explain ranking factors in administrator-friendly terms. Return enough information for the UI to show why a candidate is recommended. If no candidate qualifies, return an explicit no-match result with actionable reasons rather than an arbitrary fallback asset.

## Prompt 15 — Implement safe allocation operations

Design assignment so it proceeds only when the request is in a valid state and the selected asset is compatible and available. Revalidate conditions at allocation time rather than trusting an earlier matching result.

Handle concurrent attempts safely. Keep request, asset, and assignment records consistent. Prevent multiple active assignments for one asset, and make repeated attempts return a clear result without duplicate active records. Test success, invalid state, unavailable/incompatible assets, and repeated or concurrent attempts.

## Prompt 16 — Add administrator review and escalation

Implement a review path for ambiguous requests, missing or unsupported critical requirements, and requests with no compatible inventory candidate. Preserve the original request text and show extracted fields, uncertainties, and matching explanations to the administrator.

Distinguish “no compatible asset exists,” “inventory data is incomplete,” and “the request needs clarification.” Define how an administrator can clarify a request and which cases should remain pending. Review must not bypass approval or compatibility rules.

---

# Phase 5 — AI-Assisted Extraction

## Prompt 17 — Define the requirement-extraction contract

Design a structured output contract for extracting IT resource requirements from email or web request text. Include category, purpose, quantity, CPU cores, RAM, storage capacity/type, GPU count, GPU memory, operating system, and ambiguities or missing critical fields.

Specify valid types, supported units, normalization rules, and representation of unknown values. Separate the original request from inferred fields. The extraction service should return structured data for backend validation; the model must not make the final allocation decision.

## Prompt 18 — Integrate Gemini as an optional provider

Implement a provider abstraction for requirement extraction in the Python FastAPI agent. Support Gemini when configured and retain a stub provider for deterministic local tests.

Keep API keys in environment variables and never log credentials. Validate provider output against the extraction schema and handle malformed responses, missing fields, timeouts, rate limits, and provider errors. Make the active provider observable through safe diagnostics without exposing secrets. Document configuration and testing for each mode.

## Prompt 19 — Create a deterministic stub provider

Create a stub extraction provider for development and tests so the workflow can run without an external LLM. It should parse supported labelled requirements, normalize supported units, and report ambiguous or malformed values rather than fabricating values.

Document its limitations. Ensure the same supported input produces reproducible output. Keep its interface consistent with the Gemini implementation so the rest of the application does not need separate workflow logic.

## Prompt 20 — Design uncertainty handling

Define how the application responds when extraction cannot reliably determine a critical requirement. Distinguish model-reported confidence, application validation, inventory compatibility, and allocation eligibility. Do not assume a self-reported model confidence is calibrated or that valid JSON proves the values are correct.

Propose safe rules for routing uncertain requests to review. No confidence score may override hard constraints, asset availability, authorization, or approval requirements. If a numerical score is implemented, document its source and validate it against labelled examples before interpreting it as a probability of correctness.

---

# Phase 6 — Gmail Intake and Notifications

## Prompt 21 — Design Gmail-based request intake

Implement an optional Gmail intake workflow. Retrieve eligible messages, identify the sender, verify authorization, extract message content, and create a request before running extraction and matching.

Preserve the subject and original content for auditability. Handle HTML and plain-text bodies, quoted replies, missing fields, and duplicate delivery. Make polling safe to retry and prevent downstream failures from creating multiple requests for the same message. Document required Gmail API scopes and OAuth configuration.

## Prompt 22 — Design lifecycle notification emails

Create consistent notifications for request submission, administrator review, approval, allocation, rejection, and other supported lifecycle events. Use shared templates with configurable organization identity and support details. Include a concise summary and clear next step.

Support HTML and plain-text bodies. Escape user-provided content before inserting it into HTML. Avoid exposing stack traces, raw database identifiers, secrets, or low-level API errors. Record notification failures without incorrectly reversing a request transition that has already been committed.

## Prompt 23 — Define OAuth configuration and operational guidance

Document Gmail OAuth setup for local and deployed environments. Explain the Google Cloud project, enabled Gmail API, OAuth client ID/secret, requested scopes, redirect URI, access token, and refresh token.

Keep credentials in environment variables and separate local and hosted configuration. Explain how to verify configuration, reauthorize when necessary, and diagnose errors without printing tokens or secrets. Request only the scopes needed by implemented features.

---

# Phase 7 — Testing and Quality

## Prompt 24 — Build a test strategy

Create a test strategy covering unit tests for extraction and matching, service tests for request creation and lifecycle transitions, API tests for authorization and validation, allocation tests, Gmail integration tests using controlled messages or mocks, notification-template tests, frontend build/interaction checks, and end-to-end tests.

Use isolated test data and avoid modifying production inventory or sending real emails during routine tests. Distinguish mocked tests from live integration tests. Report actual commands and results; do not claim that unexecuted tests passed.

## Prompt 25 — Create an end-to-end demonstration plan

Prepare a reproducible demonstration with a valid request and known compatible asset, a request with no compatible asset, an ambiguous request requiring review, and an allocation lifecycle case.

For each scenario, define input, expected extracted fields, expected matching result, state transitions, and evidence to capture. Verify that an approved request can be allocated and a repeat assignment is rejected. Use a controlled environment and known inventory fixture. Do not claim success until the workflow has been run and observed.

## Prompt 26 — Evaluate the prototype honestly

Propose a concise evaluation section. Separate extraction correctness, matching correctness, allocation safety, workflow reliability, and processing performance. Suggest measurable metrics and a manageable set of test cases.

Do not invent accuracy, latency, user-satisfaction, or throughput results. Explain measurement methods, sample size, and environment. Distinguish historical results from fresh results, include known limitations, and avoid production-readiness claims without evidence.

---

# Phase 8 — Deployment and Operations

## Prompt 27 — Prepare deployment configuration

Prepare deployment documentation for the React/Vite frontend, Express backend, Python FastAPI agent, and MongoDB Atlas. Explain environment variables and the relationship between frontend API base URL, backend CORS origin, and agent base URL.

Keep secrets out of source control and logs. Include health checks, startup commands, configuration validation, and safe handling of missing optional integrations. Explain that hosted free services may sleep and background polling may pause while a service is not running. Do not claim a service is healthy or deployed unless checked.

## Prompt 28 — Make the project reproducible locally

Provide a local setup guide for frontend, backend, extraction agent, and database. Include prerequisites, example environment files with placeholders, installation/startup/test commands, and troubleshooting guidance.

Allow the core application to run without Gmail credentials or a Gemini API key through suitable local/test configuration. Clearly label optional integrations and never include real secrets in examples. Explain how to reset test data safely.

## Prompt 29 — Document monitoring and operational status

Define safe logs and monitoring for request processing, extraction, matching, allocation, Gmail polling, and notifications. Use correlation identifiers and useful error categories while excluding credentials and sensitive email content.

Describe health checks and indicators such as failed polls, extraction failures, requests awaiting review, allocation failures, and notification failures. Do not call a request successful merely because an API accepted it; follow the workflow through its stages.

---

# Phase 9 — Documentation and Presentation

## Prompt 30 — Create a concise project README

Write a README covering purpose, major features, architecture diagram, technology stack, local setup, environment variables, tests, deployment overview, and known limitations.

Use concise language and document only behavior supported by code or test evidence. Distinguish optional Gemini integration from stub mode and email intake from web-form submission. Do not include credentials or claim unverified performance. Do not describe planned functionality as complete.

## Prompt 31 — Prepare a project demonstration script

Create a short presentation/demo script for a college evaluation. Explain the problem, show the architecture, submit a request, demonstrate extracted requirements, inspect compatible candidates, and complete an allocation through the permitted lifecycle. Include an example where the system escalates rather than making an unsafe assignment.

For each step, state what to show and what technical concept it demonstrates. Keep the presentation focused on the actual prototype and known limitations. Avoid claims that every email is processed perfectly or that production-scale performance has been benchmarked.

## Prompt 32 — Prepare the technical project report

Draft a concise formal report with introduction, problem statement, objectives, related work, architecture, implementation, testing and results, limitations, future work, conclusion, and references.

Use verified research sources for literature claims. Ground implementation claims in repository documentation and observed test evidence. Do not invent test outcomes, metrics, source metadata, or capabilities. Use IEEE-style numbered citations where appropriate and keep the prose readable for a college project report.

## Prompt 33 — Create a source and decision register

Create a register separating confirmed requirements, architecture decisions and rationale, implemented features and evidence, open questions, external research sources and supported claims, and test commands/results.

For important statements, identify whether they are based on code, tests, a user requirement, or an external source. Do not invent evidence. Use this register to keep the README, report, and project documentation consistent.

---

# Cross-cutting instructions for substantial coding tasks

1. Inspect the existing repository and relevant files before making changes.
2. Briefly explain the approach before implementing a large change.
3. Preserve working behavior and avoid unrelated refactoring.
4. Separate extraction, validation, matching, authorization, and allocation responsibilities.
5. Treat model output and user-supplied email content as untrusted input.
6. Enforce hard requirements and lifecycle rules in backend code.
7. Add tests for new functionality and run relevant existing tests.
8. Report exactly which tests ran and whether they passed; do not invent results.
9. Keep credentials and personal email content out of logs and source control.
10. Update README and source-of-truth documentation when behavior changes.
11. Clearly label proposed, implemented, and unverified behavior.
12. Do not deploy, push, merge, or modify production data without explicit authorization.

---

## Provenance and integrity statement

This file is a reconstructed collection of major project-building prompts based on the documented goals and architecture of the Intelligent IT Resource Allocation System. It is not a verified transcript of historical prompts. Bug-fix and incident-specific prompts are intentionally excluded. Unless the original prompt history is checked and exact wording restored, describe this document as a **reconstructed prompt archive**.
