'use client'

import { useState, useEffect } from 'react'
import type { TestCase, ReviewerOutput } from '@/lib/schemas'

type AnalysisResult = {
  agentPurpose: string
  tools: string[]
  goldenPath: string[]
  assumptions: string[]
}

type Test = {
  id: string
  category: 'golden' | 'edge' | 'adversarial'
  name: string
  input: string
  expectedBehavior: string
  expectedToolCalled?: string
  passCriteria: string
  violatedAssumption?: string
  attackType?: string
}

type TestSuite = {
  assumptionMatrix: { assumption: string; edgeCaseInput: string; expectedBehavior: string }[]
  tests: Test[]
}

type RunResult = {
  testId: string
  testName: string
  category: string
  input: string
  agentResponse: string | null
  latencyMs: number
  passCriteria: string
  expectedBehavior: string
  status: 'ran' | 'error'
  error?: string
}

const CATEGORY_STYLES = {
  golden: {
    bg: 'bg-yellow-500/5',
    border: 'border-yellow-400/30',
    hoverBorder: 'hover:border-yellow-400/60',
    badge: 'border border-yellow-400/55 bg-yellow-500/10 text-yellow-300',
    label: 'Golden Path',
    meta: 'text-yellow-300/70',
  },
  edge: {
    bg: 'bg-amber-500/5',
    border: 'border-amber-400/30',
    hoverBorder: 'hover:border-amber-400/60',
    badge: 'border border-amber-400/55 bg-amber-500/10 text-amber-300',
    label: 'Edge Case',
    meta: 'text-amber-300/70',
  },
  adversarial: {
    bg: 'bg-red-500/5',
    border: 'border-red-500/30',
    hoverBorder: 'hover:border-red-500/60',
    badge: 'border border-red-500/55 bg-red-500/10 text-red-300',
    label: 'Adversarial',
    meta: 'text-red-300/70',
  },
}

const INPUT_CLS = 'w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-3 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-yellow-400/60 transition-colors'
const BTN_GOLD = 'px-5 py-2.5 rounded-lg border border-yellow-400/55 bg-yellow-500/10 text-yellow-200 text-sm font-medium hover:bg-yellow-500/15 disabled:opacity-30 disabled:cursor-not-allowed transition-colors'
const BTN_OUTLINE = 'px-5 py-2.5 rounded-lg border border-slate-700 bg-slate-900/70 text-white text-sm font-medium hover:border-yellow-400/60 disabled:opacity-30 disabled:cursor-not-allowed transition-colors'
const BTN_GHOST = 'px-3 py-1.5 rounded-lg border border-slate-700 text-slate-400 text-xs font-medium hover:border-slate-500 hover:text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors'

const SEVERITY_STYLES = {
  low: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
  medium: 'border-yellow-400/40 bg-yellow-500/10 text-yellow-300',
  high: 'border-red-500/40 bg-red-500/10 text-red-300',
}

export default function EvalPage() {
  const [inputMode, setInputMode] = useState<'repo' | 'prompt'>('prompt')
  const [repoUrl, setRepoUrl] = useState('')
  const [systemPrompt, setSystemPrompt] = useState('')
  const [toolDescriptions, setToolDescriptions] = useState('')
  const [targetApiUrl, setTargetApiUrl] = useState('')
  const [targetApiKey, setTargetApiKey] = useState('')
  const [targetApiFormat, setTargetApiFormat] = useState<'openai' | 'custom'>('openai')
  const [customBodyTemplate, setCustomBodyTemplate] = useState(`{\n  "message": "{{message}}"\n}`)

  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null)
  const [testSuite, setTestSuite] = useState<TestSuite | null>(null)
  const [runResults, setRunResults] = useState<RunResult[] | null>(null)

  // Reviewer state
  const [reviewerResults, setReviewerResults] = useState<Record<string, ReviewerOutput>>({})
  const [reviewingIds, setReviewingIds] = useState<Set<string>>(new Set())
  const [reviewingAll, setReviewingAll] = useState(false)

  // Library state
  const [library, setLibrary] = useState<TestCase[]>([])
  const [libraryLoading, setLibraryLoading] = useState(false)
  const [addedToLibrary, setAddedToLibrary] = useState<Set<string>>(new Set())
  const [sentToSlack, setSentToSlack] = useState<Set<string>>(new Set())

  const [step, setStep] = useState<'input' | 'analyzing' | 'analyzed' | 'generating' | 'generated' | 'running' | 'done'>('input')
  const [error, setError] = useState<string | null>(null)
  const [sessionUsed, setSessionUsed] = useState(() =>
    typeof window !== 'undefined' && sessionStorage.getItem('eval_used') === '1'
  )

  const GENERATING_STEPS = [
    'Reading agent definition...',
    'Mapping assumption matrix...',
    'Writing golden path tests...',
    'Writing edge case tests...',
    'Writing adversarial tests...',
    'Finalizing test suite...',
  ]
  const [generatingIdx, setGeneratingIdx] = useState(0)

  useEffect(() => {
    if (step !== 'generating') { setGeneratingIdx(0); return }
    const id = setInterval(() => setGeneratingIdx(i => Math.min(i + 1, GENERATING_STEPS.length - 1)), 2200)
    return () => clearInterval(id)
  }, [step])

  useEffect(() => {
    if (step === 'done') loadLibrary()
  }, [step])

  async function loadLibrary() {
    setLibraryLoading(true)
    try {
      const res = await fetch('/api/eval/library')
      const data = await res.json()
      setLibrary(data.testCases ?? [])
    } catch {
      // library is optional — ignore errors
    } finally {
      setLibraryLoading(false)
    }
  }

  async function handleAnalyze() {
    setStep('analyzing')
    setError(null)
    try {
      const res = await fetch('/api/eval/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoUrl, systemPrompt, toolDescriptions })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? `Server error ${res.status}`)
      sessionStorage.setItem('eval_used', '1')
      setSessionUsed(true)
      setAnalysis(data)
      setStep('analyzed')
    } catch (e: any) {
      setError(e.message)
      setStep('input')
    }
  }

  async function handleGenerateTests() {
    if (!analysis) return
    setStep('generating')
    setError(null)
    try {
      const res = await fetch('/api/eval/generate-tests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(analysis)
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? `Server error ${res.status}`)
      setTestSuite(data)
      setStep('generated')
    } catch (e: any) {
      setError(e.message)
      setStep('analyzed')
    }
  }

  async function handleRunTests() {
    if (!testSuite) return
    setStep('running')
    setError(null)
    try {
      const settled = await Promise.allSettled(
        testSuite.tests.map(async (test) => {
          const start = Date.now()
          try {
            const res = await fetch(targetApiUrl, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                ...(targetApiKey && { Authorization: `Bearer ${targetApiKey}` }),
              },
              body: targetApiFormat === 'openai'
                ? JSON.stringify({ messages: [{ role: 'user', content: test.input }] })
                : customBodyTemplate.replace(/\{\{message\}\}/g, test.input.replace(/\\/g, '\\\\').replace(/"/g, '\\"')),
            })
            const data = await res.json()
            const agentResponse =
              data?.choices?.[0]?.message?.content ||
              data?.content?.[0]?.text ||
              data?.response ||
              JSON.stringify(data)
            return {
              testId: test.id, testName: test.name, category: test.category,
              input: test.input, agentResponse, latencyMs: Date.now() - start,
              passCriteria: test.passCriteria, expectedBehavior: test.expectedBehavior,
              status: 'ran' as const,
            }
          } catch (err: any) {
            return {
              testId: test.id, testName: test.name, category: test.category,
              input: test.input, agentResponse: null, latencyMs: Date.now() - start,
              passCriteria: test.passCriteria, expectedBehavior: test.expectedBehavior,
              status: 'error' as const, error: err.message,
            }
          }
        })
      )
      setRunResults(settled.map(r => r.status === 'fulfilled' ? r.value : (r as PromiseRejectedResult).reason))
      setStep('done')
    } catch (e: any) {
      setError(e.message)
      setStep('generated')
    }
  }

  async function reviewOne(runResult: RunResult, test: Test) {
    setReviewingIds(prev => new Set(prev).add(runResult.testId))
    try {
      const res = await fetch('/api/eval/reviewer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ test, agentResponse: runResult.agentResponse ?? runResult.error ?? '' }),
      })
      const data: ReviewerOutput = await res.json()
      if (!res.ok) throw new Error((data as any).error ?? `Server error ${res.status}`)
      setReviewerResults(prev => ({ ...prev, [runResult.testId]: data }))
    } catch {
      // don't surface reviewer errors in the main error banner
    } finally {
      setReviewingIds(prev => { const next = new Set(prev); next.delete(runResult.testId); return next })
    }
  }

  async function handleReviewAll() {
    if (!runResults || !testSuite) return
    setReviewingAll(true)
    await Promise.allSettled(
      runResults
        .filter(r => !reviewerResults[r.testId])
        .map(r => {
          const test = testSuite.tests.find(t => t.id === r.testId)
          return test ? reviewOne(r, test) : Promise.resolve()
        })
    )
    setReviewingAll(false)
  }

  async function handleAddToLibrary(testCase: TestCase) {
    try {
      await fetch('/api/eval/library', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ testCase }),
      })
      setAddedToLibrary(prev => new Set(prev).add(testCase.id))
      setLibrary(prev => prev.some(c => c.id === testCase.id) ? prev : [...prev, testCase])
    } catch {
      // silent — the user can retry
    }
  }

  async function handleSendToSlack(testCase: TestCase, context: { testName: string; reason: string; severity: string }) {
    try {
      await fetch('/api/eval/slack', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ testCase, context }),
      })
      setSentToSlack(prev => new Set(prev).add(testCase.id))
    } catch {
      // silent
    }
  }

  const isLoading = ['analyzing', 'generating', 'running'].includes(step)

  const SAMPLES = {
    prompt: {
      systemPrompt: `You are a customer support agent for an e-commerce platform. Your job is to help customers with order issues, returns, and refunds.

You have access to the following tools:
- lookup_order(order_id): Returns order status, items, and shipping info
- initiate_return(order_id, reason): Creates a return request and sends a prepaid label
- issue_refund(order_id, amount): Issues a refund to the original payment method

Always look up the order before taking any action. Never issue a refund greater than the original order total. If an order is still in transit, offer to wait or file a lost package claim instead of an immediate refund.`,
      toolDescriptions: 'lookup_order, initiate_return, issue_refund',
    },
    repo: { repoUrl: 'https://github.com/anthropics/anthropic-quickstarts' },
  }

  function handleFillSample() {
    if (inputMode === 'prompt') {
      setSystemPrompt(SAMPLES.prompt.systemPrompt)
      setToolDescriptions(SAMPLES.prompt.toolDescriptions)
    } else {
      setRepoUrl(SAMPLES.repo.repoUrl)
    }
  }

  const reviewedCount = Object.keys(reviewerResults).length
  const failCount = Object.values(reviewerResults).filter(r => !r.passed).length
  const proposedCount = Object.values(reviewerResults).filter(r => r.newTestCase).length

  return (
    <div className="min-h-screen bg-[#020617] text-slate-100" style={{ fontFamily: 'var(--font-geist-sans)' }}>
      <div className="max-w-4xl mx-auto px-6 md:px-10 py-16 space-y-10">

        {/* Header */}
        <div className="space-y-3">
          <div className="text-xs text-slate-500 tracking-widest uppercase">Agent Evaluation Framework</div>
          <h1 className="text-4xl font-semibold tracking-tight text-white">EvalAgent</h1>
          <p className="text-slate-300 text-base leading-relaxed max-w-xl">
            Generate golden path, edge case, and adversarial tests for any AI agent — in seconds.
          </p>
        </div>

        {/* Step 1: Input */}
        <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-6 space-y-5">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400 tracking-widest uppercase">01 — Define your agent</span>
            <button
              onClick={handleFillSample}
              className="px-3 py-1.5 text-xs rounded-lg border border-slate-700 text-slate-400 hover:border-yellow-400/60 hover:text-yellow-200 transition-colors"
            >
              Fill with sample ↗
            </button>
          </div>

          <div className="flex gap-2">
            {(['prompt', 'repo'] as const).map(mode => (
              <button
                key={mode}
                onClick={() => setInputMode(mode)}
                className={`px-4 py-1.5 text-xs rounded-lg border font-medium transition-colors ${
                  inputMode === mode
                    ? 'border-yellow-400/55 bg-yellow-500/10 text-yellow-200'
                    : 'border-slate-700 text-slate-400 hover:border-yellow-400/40 hover:text-slate-300'
                }`}
              >
                {mode === 'prompt' ? 'System Prompt' : 'GitHub URL'}
              </button>
            ))}
          </div>

          {inputMode === 'repo' ? (
            <input
              className={INPUT_CLS}
              placeholder="https://github.com/yourname/your-agent"
              value={repoUrl}
              onChange={e => setRepoUrl(e.target.value)}
            />
          ) : (
            <div className="space-y-3">
              <textarea
                className={`${INPUT_CLS} resize-none`}
                rows={5}
                placeholder="Paste your agent's system prompt here..."
                value={systemPrompt}
                onChange={e => setSystemPrompt(e.target.value)}
              />
              <textarea
                className={`${INPUT_CLS} resize-none`}
                rows={3}
                placeholder="Tool descriptions (optional): lookup_order, send_email, query_db..."
                value={toolDescriptions}
                onChange={e => setToolDescriptions(e.target.value)}
              />
            </div>
          )}

          <div className="flex items-center gap-4">
            {analysis ? (
              <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-yellow-400/30 bg-yellow-500/5 text-yellow-300 text-sm font-medium">
                <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                Agent analyzed
              </div>
            ) : (
              <button
                onClick={handleAnalyze}
                disabled={isLoading || (!repoUrl && !systemPrompt) || sessionUsed}
                className={BTN_GOLD}
              >
                {step === 'analyzing' ? 'Analyzing...' : 'Analyze Agent →'}
              </button>
            )}
            {sessionUsed && !analysis && (
              <span className="text-xs text-slate-500 flex items-center gap-2">
                One run per session — refresh to start over.
                {process.env.NODE_ENV === 'development' && (
                  <button
                    onClick={() => { sessionStorage.removeItem('eval_used'); setSessionUsed(false) }}
                    className="underline text-yellow-400/60 hover:text-yellow-300 transition-colors"
                  >
                    [dev: reset]
                  </button>
                )}
              </span>
            )}
          </div>
        </section>

        {/* Step 2: Analysis Result */}
        {analysis && (
          <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-6 space-y-5">
            <span className="text-xs text-slate-400 tracking-widest uppercase">02 — Agent inference</span>

            <div className="space-y-4">
              <div>
                <div className="text-xs text-slate-500 mb-1.5">Purpose</div>
                <div className="text-sm text-slate-200 leading-relaxed">{analysis.agentPurpose}</div>
              </div>

              <div>
                <div className="text-xs text-slate-500 mb-1.5">Tools</div>
                <div className="flex flex-wrap gap-2">
                  {analysis.tools.map(t => (
                    <span key={t} className="px-2.5 py-0.5 rounded-full border border-slate-700 text-slate-400 text-xs font-mono">
                      {t}
                    </span>
                  ))}
                </div>
              </div>

              <div>
                <div className="text-xs text-slate-500 mb-1.5">Golden Path</div>
                <ol className="space-y-1.5">
                  {analysis.goldenPath.map((s, i) => (
                    <li key={i} className="flex gap-3 text-sm text-slate-300">
                      <span className="text-yellow-400/50 font-mono text-xs pt-0.5 shrink-0">{String(i + 1).padStart(2, '0')}</span>
                      {s}
                    </li>
                  ))}
                </ol>
              </div>

              <div>
                <div className="text-xs text-slate-500 mb-1.5">Assumptions</div>
                <ul className="space-y-1.5">
                  {analysis.assumptions.map((a, i) => (
                    <li key={i} className="flex gap-3 text-sm text-slate-300">
                      <span className="text-yellow-400/40 shrink-0">—</span>
                      {a}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {step === 'generating' ? (
              <div className="space-y-3">
                <div className="flex items-center gap-3 text-sm text-yellow-300/80">
                  <svg className="w-4 h-4 animate-spin shrink-0" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2.5" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                  </svg>
                  <span className="transition-all duration-500">{GENERATING_STEPS[generatingIdx]}</span>
                </div>
                <div className="flex gap-1">
                  {GENERATING_STEPS.map((_, i) => (
                    <div key={i} className={`h-0.5 flex-1 rounded-full transition-colors duration-500 ${i <= generatingIdx ? 'bg-yellow-400/60' : 'bg-slate-700'}`} />
                  ))}
                </div>
              </div>
            ) : testSuite ? (
              <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-yellow-400/30 bg-yellow-500/5 text-yellow-300 text-sm font-medium">
                <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                Test suite generated
              </div>
            ) : (
              <button onClick={handleGenerateTests} disabled={isLoading} className={BTN_GOLD}>
                Generate Test Suite →
              </button>
            )}
          </section>
        )}

        {/* Step 3: Test Suite */}
        {testSuite && (
          <section className="space-y-6">
            <span className="text-xs text-slate-400 tracking-widest uppercase">03 — Test suite</span>

            {/* Assumption Matrix */}
            <div className="rounded-xl border border-slate-800 overflow-hidden">
              <div className="px-5 py-3 bg-slate-900 border-b border-slate-800 flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-300 tracking-wide uppercase">Assumption Matrix</span>
              </div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-900/40">
                    <th className="text-left px-5 py-2.5 text-slate-500 font-normal">Assumption</th>
                    <th className="text-left px-5 py-2.5 text-slate-500 font-normal">Edge Case Input</th>
                    <th className="text-left px-5 py-2.5 text-slate-500 font-normal">Expected Behavior</th>
                  </tr>
                </thead>
                <tbody>
                  {testSuite.assumptionMatrix.map((row, i) => (
                    <tr key={i} className="border-b border-slate-800/50 hover:bg-slate-900/40 transition-colors">
                      <td className="px-5 py-3 text-slate-300">{row.assumption}</td>
                      <td className="px-5 py-3 text-yellow-300/80">{row.edgeCaseInput}</td>
                      <td className="px-5 py-3 text-slate-400">{row.expectedBehavior}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Tests by category */}
            {(['golden', 'edge', 'adversarial'] as const).map(cat => (
              <div key={cat} className="space-y-3">
                <div className="text-xs text-slate-400 uppercase tracking-widest">{CATEGORY_STYLES[cat].label} Tests</div>
                <div className="space-y-3">
                  {testSuite.tests.filter(t => t.category === cat).map(test => (
                    <div
                      key={test.id}
                      className={`rounded-xl border p-5 transition-colors ${CATEGORY_STYLES[cat].bg} ${CATEGORY_STYLES[cat].border} ${CATEGORY_STYLES[cat].hoverBorder}`}
                    >
                      <div className="flex items-center gap-2.5 mb-3">
                        <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${CATEGORY_STYLES[cat].badge}`}>
                          {test.category}
                        </span>
                        <span className="text-sm font-semibold text-white">{test.name}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-4 text-xs">
                        <div>
                          <div className="text-slate-500 mb-1">Input</div>
                          <div className="text-slate-300 leading-relaxed">{test.input}</div>
                        </div>
                        <div>
                          <div className="text-slate-500 mb-1">Expected behavior</div>
                          <div className="text-slate-300 leading-relaxed">{test.expectedBehavior}</div>
                        </div>
                        <div>
                          <div className="text-slate-500 mb-1">Pass criteria</div>
                          <div className="text-slate-300 leading-relaxed">{test.passCriteria}</div>
                        </div>
                        {test.expectedToolCalled && (
                          <div>
                            <div className="text-slate-500 mb-1">Expected tool</div>
                            <div className="text-slate-300 font-mono">{test.expectedToolCalled}</div>
                          </div>
                        )}
                        {test.violatedAssumption && (
                          <div className="col-span-2">
                            <div className="text-slate-500 mb-1">Violated assumption</div>
                            <div className={CATEGORY_STYLES[cat].meta}>{test.violatedAssumption}</div>
                          </div>
                        )}
                        {test.attackType && (
                          <div className="col-span-2">
                            <div className="text-slate-500 mb-1">Attack type</div>
                            <div className={CATEGORY_STYLES[cat].meta}>{test.attackType}</div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {/* Run against target API */}
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-6 space-y-4">
              <span className="text-xs text-slate-400 tracking-widest uppercase">04 — Run against your agent (optional)</span>
              <div className="space-y-3">
                <input
                  className={INPUT_CLS}
                  placeholder="Agent API URL — must allow CORS (e.g. http://localhost:8080/api/chat)"
                  value={targetApiUrl}
                  onChange={e => setTargetApiUrl(e.target.value)}
                />
                <div className="space-y-1.5">
                  <input
                    className={INPUT_CLS}
                    placeholder="API key (optional)"
                    type="password"
                    value={targetApiKey}
                    onChange={e => setTargetApiKey(e.target.value)}
                  />
                  <p className="text-xs text-slate-500 flex items-center gap-1.5 px-1">
                    <svg className="w-3 h-3 shrink-0 text-slate-600" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" /></svg>
                    Your key is never sent to our server — requests go directly from your browser to your agent.
                  </p>
                </div>
                <div className="space-y-3">
                  <div className="flex gap-2">
                    {(['openai', 'custom'] as const).map(fmt => (
                      <button
                        key={fmt}
                        onClick={() => setTargetApiFormat(fmt)}
                        className={`px-4 py-1.5 text-xs rounded-lg border font-medium transition-colors ${
                          targetApiFormat === fmt
                            ? 'border-yellow-400/55 bg-yellow-500/10 text-yellow-200'
                            : 'border-slate-700 text-slate-400 hover:border-yellow-400/40 hover:text-slate-300'
                        }`}
                      >
                        {fmt === 'openai' ? 'OpenAI format' : 'Custom template'}
                      </button>
                    ))}
                  </div>
                  {targetApiFormat === 'custom' && (
                    <div className="space-y-1.5">
                      <textarea
                        className={`${INPUT_CLS} resize-none font-mono text-xs leading-relaxed`}
                        rows={5}
                        value={customBodyTemplate}
                        onChange={e => setCustomBodyTemplate(e.target.value)}
                        spellCheck={false}
                      />
                      <p className="text-xs text-slate-500 px-1">
                        Use <code className="text-yellow-300/70 bg-yellow-500/10 px-1 rounded">{'{{message}}'}</code> where the test input should be inserted.
                      </p>
                    </div>
                  )}
                </div>
              </div>
              <button onClick={handleRunTests} disabled={isLoading || !targetApiUrl} className={BTN_OUTLINE}>
                {step === 'running' ? 'Running tests...' : 'Run All Tests →'}
              </button>
            </div>
          </section>
        )}

        {/* Step 5: Results + AI Review */}
        {runResults && (
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400 tracking-widest uppercase">05 — Results</span>
              <div className="flex items-center gap-3">
                {reviewedCount > 0 && (
                  <span className="text-xs text-slate-500">
                    {reviewedCount}/{runResults.length} reviewed · {failCount} failed · {proposedCount} proposed
                  </span>
                )}
                <button
                  onClick={handleReviewAll}
                  disabled={reviewingAll || reviewedCount === runResults.length}
                  className={BTN_GOLD}
                >
                  {reviewingAll ? (
                    <span className="flex items-center gap-2">
                      <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2.5" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                      </svg>
                      Reviewing...
                    </span>
                  ) : reviewedCount === runResults.length ? 'All reviewed ✓' : 'Review All with AI →'}
                </button>
              </div>
            </div>

            <div className="space-y-3">
              {runResults.map(r => {
                const review = reviewerResults[r.testId]
                const isReviewing = reviewingIds.has(r.testId)
                const test = testSuite?.tests.find(t => t.id === r.testId)

                return (
                  <div
                    key={r.testId}
                    className={`rounded-xl border p-5 transition-colors ${
                      r.status === 'error'
                        ? 'border-red-500/30 bg-red-500/5'
                        : review
                          ? review.passed
                            ? 'border-emerald-500/25 bg-emerald-500/5'
                            : 'border-red-500/25 bg-red-500/5'
                          : 'border-slate-800 bg-slate-900/60 hover:border-yellow-400/40'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm font-semibold text-white">{r.testName}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-500 font-mono">{r.latencyMs}ms</span>
                        <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${
                          CATEGORY_STYLES[r.category as keyof typeof CATEGORY_STYLES]?.badge ?? 'border border-slate-700 bg-slate-800 text-slate-400'
                        }`}>{r.category}</span>

                        {/* Reviewer verdict badge */}
                        {review ? (
                          <span className={`text-xs px-2.5 py-0.5 rounded-full border font-medium ${
                            review.passed
                              ? 'border-emerald-500/55 bg-emerald-500/10 text-emerald-300'
                              : 'border-red-500/55 bg-red-500/10 text-red-300'
                          }`}>
                            {review.passed ? '✓ pass' : '✗ fail'}
                          </span>
                        ) : r.status === 'error' ? (
                          <span className="text-xs px-2.5 py-0.5 rounded-full border border-red-500/55 bg-red-500/10 text-red-300 font-medium">error</span>
                        ) : isReviewing ? (
                          <span className="text-xs px-2.5 py-0.5 rounded-full border border-slate-700 text-slate-500 font-medium flex items-center gap-1">
                            <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2.5" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                            </svg>
                            reviewing
                          </span>
                        ) : (
                          test && (
                            <button
                              onClick={() => reviewOne(r, test)}
                              className={BTN_GHOST}
                            >
                              Review →
                            </button>
                          )
                        )}

                        {review?.severity && (
                          <span className={`text-xs px-2.5 py-0.5 rounded-full border font-medium ${SEVERITY_STYLES[review.severity]}`}>
                            {review.severity}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 text-xs">
                      <div>
                        <div className="text-slate-500 mb-1">Input sent</div>
                        <div className="text-slate-300 leading-relaxed">{r.input}</div>
                      </div>
                      <div>
                        <div className="text-slate-500 mb-1">Agent response</div>
                        <div className="text-slate-300 leading-relaxed max-h-20 overflow-y-auto">
                          {r.agentResponse || r.error || '—'}
                        </div>
                      </div>

                      {review ? (
                        <div className="col-span-2">
                          <div className="text-slate-500 mb-1">AI reviewer verdict</div>
                          <div className={`leading-relaxed ${review.passed ? 'text-emerald-300/80' : 'text-red-300/80'}`}>
                            {review.reason}
                          </div>
                        </div>
                      ) : (
                        <div className="col-span-2">
                          <div className="text-slate-500 mb-1">Pass criteria (review manually)</div>
                          <div className="text-slate-400 italic leading-relaxed">{r.passCriteria}</div>
                        </div>
                      )}
                    </div>

                    {/* Proposed new test case */}
                    {review?.newTestCase && (
                      <div className="mt-4 pt-4 border-t border-slate-700/50 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-yellow-300/70 uppercase tracking-wider">Proposed test case</span>
                          <div className="flex items-center gap-2">
                            {addedToLibrary.has(review.newTestCase.id) ? (
                              <span className="text-xs text-emerald-400">Added to library ✓</span>
                            ) : (
                              <button
                                onClick={() => handleAddToLibrary(review.newTestCase!)}
                                className={BTN_GHOST}
                              >
                                + Add to library
                              </button>
                            )}
                            {sentToSlack.has(review.newTestCase.id) ? (
                              <span className="text-xs text-slate-500">Sent to Slack ✓</span>
                            ) : (
                              <button
                                onClick={() => handleSendToSlack(review.newTestCase!, {
                                  testName: r.testName,
                                  reason: review.reason,
                                  severity: review.severity ?? 'medium',
                                })}
                                className={BTN_GHOST}
                              >
                                Send to Slack ↗
                              </button>
                            )}
                          </div>
                        </div>
                        <div className="rounded-lg border border-yellow-400/20 bg-yellow-500/5 p-4 grid grid-cols-2 gap-3 text-xs">
                          <div>
                            <div className="text-slate-500 mb-1">Name</div>
                            <div className="text-yellow-200/90 font-medium">{review.newTestCase.name}</div>
                          </div>
                          <div>
                            <div className="text-slate-500 mb-1">Source</div>
                            <div className="text-slate-400 font-mono">{review.newTestCase.source}</div>
                          </div>
                          <div>
                            <div className="text-slate-500 mb-1">Input</div>
                            <div className="text-slate-300 leading-relaxed">{review.newTestCase.input}</div>
                          </div>
                          <div>
                            <div className="text-slate-500 mb-1">Expected behavior</div>
                            <div className="text-slate-300 leading-relaxed">{review.newTestCase.expectedBehavior}</div>
                          </div>
                          {review.newTestCase.tags && review.newTestCase.tags.length > 0 && (
                            <div className="col-span-2">
                              <div className="text-slate-500 mb-1.5">Tags</div>
                              <div className="flex flex-wrap gap-1.5">
                                {review.newTestCase.tags.map(tag => (
                                  <span key={tag} className="px-2 py-0.5 rounded-full border border-slate-700 text-slate-400 font-mono">{tag}</span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {/* Test Library */}
        {step === 'done' && (
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400 tracking-widest uppercase">06 — Test library</span>
              <button onClick={loadLibrary} disabled={libraryLoading} className={BTN_GHOST}>
                {libraryLoading ? 'Loading...' : 'Refresh'}
              </button>
            </div>

            {library.length === 0 ? (
              <div className="rounded-xl border border-slate-800 bg-slate-900/40 px-6 py-8 text-center">
                <div className="text-slate-500 text-sm">No approved test cases yet.</div>
                <div className="text-slate-600 text-xs mt-1">Approve proposed test cases above to start building your library.</div>
              </div>
            ) : (
              <div className="rounded-xl border border-slate-800 overflow-hidden">
                <div className="px-5 py-3 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-300 tracking-wide uppercase">
                    {library.length} approved test {library.length === 1 ? 'case' : 'cases'}
                  </span>
                </div>
                <div className="divide-y divide-slate-800/50">
                  {library.map(tc => (
                    <div key={tc.id} className="px-5 py-4 hover:bg-slate-900/40 transition-colors">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-white">{tc.name}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-xs px-2 py-0.5 rounded-full border border-slate-700 text-slate-400 font-mono">{tc.source}</span>
                          <span className="text-xs text-slate-600">{new Date(tc.createdAt).toLocaleDateString()}</span>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3 text-xs">
                        <div>
                          <div className="text-slate-500 mb-1">Input</div>
                          <div className="text-slate-300">{tc.input}</div>
                        </div>
                        <div>
                          <div className="text-slate-500 mb-1">Expected behavior</div>
                          <div className="text-slate-300">{tc.expectedBehavior}</div>
                        </div>
                      </div>
                      {tc.tags && tc.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {tc.tags.map(tag => (
                            <span key={tag} className="px-2 py-0.5 rounded-full border border-slate-700 text-slate-500 text-xs font-mono">{tag}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/5 px-5 py-4 text-sm text-red-300 leading-relaxed">
            {error}
          </div>
        )}
      </div>
    </div>
  )
}
