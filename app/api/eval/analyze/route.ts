import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic()

export async function POST(req: NextRequest) {
  try {
    const { repoUrl, systemPrompt, toolDescriptions } = await req.json()

    const input = repoUrl
      ? `GitHub repo URL: ${repoUrl}`
      : `System prompt: ${systemPrompt}\n\nTools: ${toolDescriptions}`

    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1000,
      messages: [{
        role: 'user',
        content: `You are an expert at analyzing AI agents. Given the following agent definition, extract:
1. What this agent's primary job is (1 sentence)
2. What tools it has access to (list)
3. What its golden path looks like — the ideal successful interaction (step by step)
4. What assumptions it makes about inputs

Respond in JSON only. No markdown, no preamble.

Format:
{
  "agentPurpose": "...",
  "tools": ["tool1", "tool2"],
  "goldenPath": ["step1", "step2", "step3"],
  "assumptions": ["assumption1", "assumption2"]
}

Agent definition:
${input}`
      }]
    })

    const text = response.content[0].type === 'text' ? response.content[0].text : ''
    const parsed = JSON.parse(text.replace(/```json|```/g, '').trim())
    return NextResponse.json(parsed)
  } catch (err: any) {
    const message = err.message ?? 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
