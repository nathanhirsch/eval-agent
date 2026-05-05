import { NextRequest, NextResponse } from 'next/server'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { TestCaseSchema, type TestCase } from '@/lib/schemas'

const DATA_DIR = join(process.cwd(), 'data')
const LIBRARY_FILE = join(DATA_DIR, 'library.json')

function readLibrary(): TestCase[] {
  if (!existsSync(LIBRARY_FILE)) return []
  try {
    return JSON.parse(readFileSync(LIBRARY_FILE, 'utf-8'))
  } catch {
    return []
  }
}

function writeLibrary(cases: TestCase[]): void {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true })
  writeFileSync(LIBRARY_FILE, JSON.stringify(cases, null, 2), 'utf-8')
}

export async function GET() {
  const cases = readLibrary()
  return NextResponse.json({ testCases: cases, total: cases.length })
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const testCase = TestCaseSchema.parse(body.testCase)

    const cases = readLibrary()
    if (cases.some(c => c.id === testCase.id)) {
      return NextResponse.json({ error: 'Test case already in library' }, { status: 409 })
    }
    cases.push(testCase)
    writeLibrary(cases)

    return NextResponse.json({ testCase, total: cases.length })
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { id } = await req.json()
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

    const cases = readLibrary()
    const next = cases.filter(c => c.id !== id)
    if (next.length === cases.length) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    writeLibrary(next)

    return NextResponse.json({ removed: id, total: next.length })
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Internal server error' }, { status: 500 })
  }
}
