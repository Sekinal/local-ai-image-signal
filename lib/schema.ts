import { z } from 'zod';

const imageKindSchema = z.enum(['img', 'background', 'context-menu']);
export const imageDescriptorSchema = z.object({
  id: z.string().min(1).max(160),
  url: z.string().min(1).max(2_000_000),
  kind: imageKindSchema,
  width: z.number().int().nonnegative(),
  height: z.number().int().nonnegative(),
  alt: z.string().max(500),
  pageUrl: z.string().max(20_000),
});

export type ImageDescriptor = z.infer<typeof imageDescriptorSchema>;

export const analysisResultSchema = z.object({
  image: imageDescriptorSchema,
  status: z.enum(['complete', 'error', 'cancelled']),
  rawLogit: z.number().optional(),
  score: z.number().min(0).max(1).optional(),
  label: z.enum(['stronger-signal', 'weaker-signal']).optional(),
  certainty: z.enum(['near-threshold', 'moderate', 'far-from-threshold']).optional(),
  elapsedMs: z.number().nonnegative().optional(),
  warning: z.string().max(500).optional(),
  errorCode: z
    .enum(['permission-needed', 'cors', 'decode', 'unsupported', 'tiny', 'inference', 'cancelled'])
    .optional(),
});

export type AnalysisResult = z.infer<typeof analysisResultSchema>;

export const jobStateSchema = z.object({
  jobId: z.string().max(100).nullable(),
  tabId: z.number().int().positive().nullable(),
  documentId: z.string().max(200),
  executionProvider: z.enum(['pending', 'webgpu', 'wasm']),
  pageUrl: z.string().max(20_000),
  status: z.enum(['idle', 'loading-model', 'running', 'complete', 'cancelled', 'error']),
  total: z.number().int().nonnegative(),
  completed: z.number().int().nonnegative(),
  currentImageId: z.string().nullable(),
  results: z.array(analysisResultSchema).max(100),
  message: z.string().max(500),
});

export type JobState = z.infer<typeof jobStateSchema>;

const envelope = z.object({ target: z.enum(['background', 'offscreen', 'popup', 'content']) });

export const runtimeMessageSchema = z.discriminatedUnion('type', [
  envelope.extend({ type: z.literal('GET_PAGE_IMAGES'), tabId: z.number().int().positive() }),
  envelope.extend({ type: z.literal('GET_JOB_STATE'), tabId: z.number().int().positive() }),
  envelope.extend({
    type: z.literal('START_AUTOMATIC_ANALYSIS'),
    jobId: z.string().min(1).max(100),
    pageUrl: z.string().max(20_000),
    images: z.array(imageDescriptorSchema).min(1).max(100),
    threshold: z.number().min(0.5).max(0.95),
  }),
  envelope.extend({
    type: z.literal('START_ANALYSIS'),
    jobId: z.string().min(1).max(100),
    tabId: z.number().int().positive(),
    documentId: z.string().min(1).max(200),
    executionProvider: z.enum(['auto', 'wasm']).optional(),
    pageUrl: z.string().max(20_000),
    images: z.array(imageDescriptorSchema).min(1).max(100),
    threshold: z.number().min(0.5).max(0.95),
  }),
  envelope.extend({ type: z.literal('CANCEL_ANALYSIS'), jobId: z.string().min(1).max(100) }),
  envelope.extend({
    type: z.literal('RUN_ANALYSIS'),
    state: jobStateSchema,
    images: z.array(imageDescriptorSchema).min(1).max(100),
    threshold: z.number().min(0.5).max(0.95),
    executionProvider: z.enum(['auto', 'wasm']),
  }),
  envelope.extend({ type: z.literal('JOB_UPDATE'), state: jobStateSchema }),
  envelope.extend({ type: z.literal('CLOSE_OFFSCREEN'), jobId: z.string().min(1).max(100) }),
  envelope.extend({ type: z.literal('GET_OFFSCREEN_STATUS') }),
  envelope.extend({ type: z.literal('CONTEXT_IMAGE_AVAILABLE') }),
]);

export type RuntimeMessage = z.infer<typeof runtimeMessageSchema>;

export function parseRuntimeMessage(value: unknown): RuntimeMessage | null {
  const parsed = runtimeMessageSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export const IDLE_JOB: JobState = {
  jobId: null,
  tabId: null,
  documentId: '',
  executionProvider: 'pending',
  pageUrl: '',
  status: 'idle',
  total: 0,
  completed: 0,
  currentImageId: null,
  results: [],
  message: '',
};
