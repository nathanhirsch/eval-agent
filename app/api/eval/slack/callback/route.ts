import { NextRequest, NextResponse } from 'next/server'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { type TestCase } from '@/lib/schemas'

const DATA_DIR = join(process.cwd(), 'data')
const PENDING_FILE = join(DATA_DIR, 'pending.json')
const LIBRARY_FILE = join(DATA_DIR, 'library.json')

function readJson(path: string): TestCase[] {
  if (!existsSync(path)) return []
  try { return JSON.parse(readFileSync(path, 'utf-8')) } catch { return [] }
}

function writeJson(path: string, data: TestCase[]): void {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true })
  writeFileSync(path, JSON.stringify(data, null, 2), 'utf-8')
}

// Called by Slack interactive button clicks (link_button actions)
// Also called directly when the user clicks approve/reject in the browser
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const action = searchParams.get('action')
  const id = searchParams.get('id')

  if (!action || !id) {
    return new Response('Missing action or id', { status: 400 })
  }

  const pending = readJson(PENDING_FILE)
  const testCase = pending.find(p => p.id === id)

  if (!testCase) {
    return new Response('Test case not found or already processed', { status: 404 })
  }

  const remaining = pending.filter(p => p.id !== id)
  writeJson(PENDING_FILE, remaining)

  if (action === 'approve') {
    const library = readJson(LIBRARY_FILE)
    if (!library.some(c => c.id === id)) {
      library.push(testCase)
      writeJson(LIBRARY_FILE, library)
    }
    return new Response(
      `<html><body style="font-family:sans-serif;padding:40px;background:#0a0a0a;color:#a3e635">
        <h2>✅ Approved</h2><p>"${testCase.name}" has been added to the test library.</p>
      </body></html>`,
      { headers: { 'Content-Type': 'text/html' } }
    )
  }

  return new Response(
    `<html><body style="font-family:sans-serif;padding:40px;background:#0a0a0a;color:#f87171">
      <h2>❌ Rejected</h2><p>"${testCase.name}" has been discarded.</p>
    </body></html>`,
    { headers: { 'Content-Type': 'text/html' } }
  )
}

// Handle Slack's interactive payload (block_actions)
export async function POST(req: NextRequest) {
  try {
    const body = await req.text()
    const params = new URLSearchParams(body)
    const payloadStr = params.get('payload')
    if (!payloadStr) return NextResponse.json({ error: 'No payload' }, { status: 400 })

    const payload = JSON.parse(payloadStr)
    if (payload.type !== 'block_actions') {
      return NextResponse.json({ ok: true })
    }

    for (const action of payload.actions ?? []) {
      const id: string = action.value
      const approve = action.action_id === 'approve_test_case'

      const pending = readJson(PENDING_FILE)
      const testCase = pending.find(p => p.id === id)
      if (!testCase) continue

      const remaining = pending.filter(p => p.id !== id)
      writeJson(PENDING_FILE, remaining)

      if (approve) {
        const library = readJson(LIBRARY_FILE)
        if (!library.some(c => c.id === id)) {
          library.push(testCase)
          writeJson(LIBRARY_FILE, library)
        }
      }
    }

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
