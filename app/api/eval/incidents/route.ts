import { NextResponse } from 'next/server'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

const INCIDENTS_FILE = join(process.cwd(), 'data', 'incidents.json')

type Category = 'golden' | 'edge' | 'adversarial'

export async function GET() {
  try {
    let incidents: any[] = []

    if (existsSync(INCIDENTS_FILE)) {
      try {
        incidents = JSON.parse(readFileSync(INCIDENTS_FILE, 'utf-8'))
      } catch (err: any) {
        return NextResponse.json(
          { error: `Failed to read incidents file: ${err.message}` },
          { status: 500 }
        )
      }
    }

    const byCategory: Record<Category, number> = {
      golden: 0,
      edge: 0,
      adversarial: 0,
    }

    for (const inc of incidents) {
      const cat = inc.category as Category
      if (cat in byCategory) byCategory[cat]++
    }

    return NextResponse.json({
      incidents,
      total: incidents.length,
      byCategory,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Internal server error' }, { status: 500 })
  }
}
