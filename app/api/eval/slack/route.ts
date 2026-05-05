import { NextRequest, NextResponse } from 'next/server'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { TestCaseSchema, type TestCase } from '@/lib/schemas'

const DATA_DIR = join(process.cwd(), 'data')
const PENDING_FILE = join(DATA_DIR, 'pending.json')

function readPending(): TestCase[] {
  if (!existsSync(PENDING_FILE)) return []
  try {
    return JSON.parse(readFileSync(PENDING_FILE, 'utf-8'))
  } catch {
    return []
  }
}

function writePending(cases: TestCase[]): void {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true })
  writeFileSync(PENDING_FILE, JSON.stringify(cases, null, 2), 'utf-8')
}

async function postToSlack(testCase: TestCase, context: { testName: string; reason: string; severity: string }) {
  const token = process.env.SLACK_BOT_TOKEN
  const channel = process.env.SLACK_CHANNEL_ID
  if (!token || !channel) throw new Error('SLACK_BOT_TOKEN and SLACK_CHANNEL_ID must be set')

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const callbackUrl = `${appUrl}/api/eval/slack/callback`

  const severityEmoji = context.severity === 'high' ? '🔴' : context.severity === 'medium' ? '🟡' : '🟢'

  const body = {
    channel,
    text: `${severityEmoji} New test case proposed from failure`,
    blocks: [
      {
        type: 'header',
        text: { type: 'plain_text', text: `${severityEmoji} Proposed test case — ${context.severity} severity` },
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*Failed test:*\n${context.testName}` },
          { type: 'mrkdwn', text: `*Proposed name:*\n${testCase.name}` },
        ],
      },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: `*Why it failed:*\n${context.reason}` },
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*Input:*\n\`${testCase.input}\`` },
          { type: 'mrkdwn', text: `*Expected behavior:*\n${testCase.expectedBehavior}` },
        ],
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: { type: 'plain_text', text: '✅ Approve' },
            style: 'primary',
            action_id: 'approve_test_case',
            value: testCase.id,
            url: `${callbackUrl}?action=approve&id=${testCase.id}`,
          },
          {
            type: 'button',
            text: { type: 'plain_text', text: '❌ Reject' },
            style: 'danger',
            action_id: 'reject_test_case',
            value: testCase.id,
            url: `${callbackUrl}?action=reject&id=${testCase.id}`,
          },
        ],
      },
    ],
  }

  const res = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  })

  const data = await res.json()
  if (!data.ok) throw new Error(`Slack error: ${data.error}`)
  return data
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const testCase = TestCaseSchema.parse(body.testCase)
    const context: { testName: string; reason: string; severity: string } = body.context ?? {
      testName: testCase.name,
      reason: 'No context provided',
      severity: 'medium',
    }

    // Store in pending regardless of Slack availability
    const pending = readPending()
    if (!pending.some(p => p.id === testCase.id)) {
      pending.push(testCase)
      writePending(pending)
    }

    // Attempt Slack post — graceful failure if not configured
    let slackSent = false
    let slackError: string | undefined
    try {
      await postToSlack(testCase, context)
      slackSent = true
    } catch (err: any) {
      slackError = err.message
    }

    return NextResponse.json({ queued: true, slackSent, slackError, id: testCase.id })
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Internal server error' }, { status: 500 })
  }
}

export async function GET() {
  const pending = readPending()
  return NextResponse.json({ pending, total: pending.length })
}
