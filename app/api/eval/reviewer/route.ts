import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { ReviewerOutputSchema } from '@/lib/schemas'

const client = new Anthropic()

function parseJson(text: string): unknown {
  return JSON.parse(text.replace(/```json|```/g, '').trim())
}

export async function POST(req: NextRequest) {
  try {
    const { test, agentResponse } = await req.json()

    if (!test || !agentResponse) {
      return NextResponse.json({ error: 'Missing required fields: test, agentResponse' }, { status: 400 })
    }

    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1500,
      system: 'You are an AI test reviewer. Evaluate whether an agent passed a test case. Respond in JSON only. No markdown.',
      messages: [{
        role: 'user',
        content: `Evaluate this agent test run.

Test name: ${test.name}
Input sent to agent: ${test.input}
Expected behavior: ${test.expectedBehavior}
Pass criteria: ${test.passCriteria ?? 'Not specified'}

Agent's actual response:
${agentResponse}

Return a JSON object with this exact shape:

{
  "passed": boolean,
  "reason": "Plain-English explanation of why it passed or failed",
  "severity": "low" | "medium" | "high",  // ONLY include when passed=false
  "newTestCase": {                          // ONLY include when passed=false AND the failure reveals a novel pattern worth capturing
    "id": "<uuid v4>",
    "name": "short descriptive name",
    "input": "variation of the failing input — same failure pattern, not a copy",
    "expectedBehavior": "what a correct response looks like",
    "tags": ["relevant", "tags"],
    "createdAt": "${new Date().toISOString()}",
    "source": "reviewer"
  }
}

Rules:
- If passed=true, return only { "passed": true, "reason": "..." }
- severity must be present on every failure
- newTestCase is optional even on failures — only propose one if the failure reveals a pattern distinct from the test itself`,
      }],
    })

    const text = response.content[0].type === 'text' ? response.content[0].text : ''
    const raw = parseJson(text)
    const result = ReviewerOutputSchema.parse(raw)

    return NextResponse.json(result)
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Internal server error' }, { status: 500 })
  }
}
