import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic()

export async function POST(req: NextRequest) {
  try {
  const { agentPurpose, tools, goldenPath, assumptions } = await req.json()

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 8000,
    messages: [{
      role: 'user',
      content: `You are an expert at writing evaluation tests for AI agents.

Given this agent analysis:
- Purpose: ${agentPurpose}
- Tools: ${tools.join(', ')}
- Golden path: ${goldenPath.join(' → ')}
- Assumptions: ${assumptions.join(', ')}

Generate exactly:
- 5 golden path tests (happy path, all assumptions met)
- 5 edge case tests (one per assumption violation — include an assumption matrix)
- 5 adversarial tests (prompt injection, tool confusion, overconfidence traps, loops, scope creep)

For each test include:
- id
- category: "golden" | "edge" | "adversarial"
- name (short)
- input (what the user sends to the agent)
- expectedBehavior (what the agent should do)
- expectedToolCalled (which tool, if any)
- passCriteria (how to judge pass/fail)
- violatedAssumption (for edge cases only)
- attackType (for adversarial only)

Respond in JSON only. No markdown, no preamble.

Format:
{
  "assumptionMatrix": [
    { "assumption": "...", "edgeCaseInput": "...", "expectedBehavior": "..." }
  ],
  "tests": [ ...array of test objects... ]
}`,
    }]
  })

    const text = response.content[0].type === 'text' ? response.content[0].text : ''
    const parsed = JSON.parse(text.replace(/```json|```/g, '').trim())
    return NextResponse.json(parsed)
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Internal server error' }, { status: 500 })
  }
}
