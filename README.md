# EvalAgent

EvalAgent generates structured test suites for AI agents. Give it a system prompt (or a GitHub repo URL) and it infers what the agent does, then produces fifteen tests across three categories — golden path, edge cases, and adversarial — designed to surface how the agent behaves when things go right, when assumptions break, and when it is actively pushed off course.

## What it does

Most agent testing is ad hoc: someone writes a few example inputs and checks whether the output looks reasonable. EvalAgent makes the process systematic. It reads the agent definition, extracts its purpose, tools, golden path, and implicit assumptions, then uses that model to generate tests that cover the full failure surface.

The output is a test suite you can review, export, or run directly against a live agent API.

---

## Test categories

### Golden path (5 tests)

Golden path tests verify the agent under ideal conditions — every assumption is met, the input is well-formed, and the agent has everything it needs to complete the task. These establish a performance baseline and confirm the agent can execute its primary job end to end.

Each golden path test specifies:

| Field | Description |
|---|---|
| `input` | A well-formed user message that satisfies all agent assumptions |
| `expectedBehavior` | The complete, correct action sequence the agent should take |
| `expectedToolCalled` | Which tool should be invoked, and in what order |
| `passCriteria` | How to judge whether the agent passed — what must appear in the response or action trace |

### Edge cases (5 tests)

Edge case tests are derived directly from the assumption matrix. Each test violates exactly one assumption the agent makes about its inputs — an ambiguous identifier, a missing required field, an out-of-range value, a user who provides incomplete context. The goal is to confirm the agent degrades gracefully: it should ask for clarification, surface a useful error, or decline to act — not hallucinate a resolution.

Each edge case test specifies:

| Field | Description |
|---|---|
| `input` | A message that violates one specific assumption |
| `violatedAssumption` | The exact assumption being broken |
| `expectedBehavior` | How the agent should handle the failure — clarify, refuse, or escalate |
| `passCriteria` | What a correct graceful failure looks like |

The **assumption matrix** is generated alongside these tests and maps each assumption to its corresponding edge case input and expected behavior, giving you a single reference for the agent's failure modes.

### Adversarial tests (5 tests)

Adversarial tests probe for robustness under deliberate manipulation. They test whether the agent can be redirected, confused, or exploited. Each test is tagged with an attack type:

| Attack type | What it tests |
|---|---|
| **Prompt injection** | Embedded instructions in user input that try to override the agent's system prompt |
| **Tool confusion** | Requests that try to invoke the wrong tool, or invoke a tool with incorrect or fabricated arguments |
| **Overconfidence trap** | Inputs that contain false premises the agent might accept and act on without verification |
| **Loop induction** | Messages designed to send the agent into a repetitive or recursive action cycle |
| **Scope creep** | Requests that push the agent beyond its defined purpose to perform actions it should decline |

Each adversarial test specifies:

| Field | Description |
|---|---|
| `input` | The adversarial message |
| `attackType` | Which of the five attack patterns is being used |
| `expectedBehavior` | How a robust agent should respond — typically: ignore the injection, refuse the out-of-scope request, or ask for verification |
| `passCriteria` | What the response must (or must not) contain to pass |

---

## Setup

```bash
npm install
```

Add your Anthropic API key to `.env.local`:

```
ANTHROPIC_API_KEY=sk-ant-...
```

```bash
npm run dev
```

Navigate to `http://localhost:3000/eval`.

## How it works

1. **Analyze** — paste a system prompt (and optional tool descriptions) or provide a GitHub repo URL. The agent definition is sent to Claude, which extracts the agent's purpose, tool list, golden path, and assumptions.
2. **Generate** — the extracted model is used to generate the full fifteen-test suite plus assumption matrix.
3. **Run (optional)** — provide your agent's API endpoint. EvalAgent sends each test as a user message and records the response and latency. Pass/fail review is manual, guided by the `passCriteria` field on each test.

Models used: `claude-haiku-4-5` for analysis, `claude-sonnet-4-6` for test generation.
