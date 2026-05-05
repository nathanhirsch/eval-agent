import { z } from 'zod'

export const TestCaseSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  input: z.string(),
  expectedBehavior: z.string(),
  tags: z.array(z.string()).optional(),
  createdAt: z.string().datetime(),
  source: z.enum(['generated', 'human', 'reviewer']),
})

export const ReviewerOutputSchema = z.object({
  passed: z.boolean(),
  reason: z.string(),
  severity: z.enum(['low', 'medium', 'high']).optional(),
  newTestCase: TestCaseSchema.optional(),
})

export type TestCase = z.infer<typeof TestCaseSchema>
export type ReviewerOutput = z.infer<typeof ReviewerOutputSchema>
