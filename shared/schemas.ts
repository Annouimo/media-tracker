import { z } from 'zod'
import {
  DEFAULT_TYPE,
  MAX_CREATOR_LENGTH,
  MAX_LONG_REVIEW_URL_LENGTH,
  MAX_PROGRESS,
  MAX_RELEASE_YEAR,
  MAX_SHORT_REVIEW_LENGTH,
  MAX_TITLE_LENGTH,
  MAX_TYPE_LENGTH,
} from './constants'
import { isValidDateOnly } from './dates'
import { WORK_STATUSES } from './types'

export const workStatusSchema = z.enum(WORK_STATUSES)

export const dateOnlySchema = z
  .string()
  .refine(isValidDateOnly, 'Expected a valid YYYY-MM-DD date')

const httpsUrlSchema = z
  .string()
  .trim()
  .max(MAX_LONG_REVIEW_URL_LENGTH)
  .refine(
    (value) => value === '' || /^https:\/\/[^\s]+$/i.test(value),
    'long_review_url must be empty or start with https://',
  )

export const createWorkSchema = z
  .object({
    title: z.string().trim().min(1).max(MAX_TITLE_LENGTH),
    creator: z.string().trim().max(MAX_CREATOR_LENGTH).default(''),
    release_year: z.number().int().min(0).max(MAX_RELEASE_YEAR).nullable().optional(),
    type: z.string().trim().min(1).max(MAX_TYPE_LENGTH).default(DEFAULT_TYPE),
    total_progress: z.number().int().min(1).max(MAX_PROGRESS).default(1),
    status: workStatusSchema.default('wish'),
    progress: z.number().int().min(0).max(MAX_PROGRESS).optional(),
    finished_on: dateOnlySchema.optional(),
    short_review: z.string().max(MAX_SHORT_REVIEW_LENGTH).default(''),
    long_review_url: httpsUrlSchema.default(''),
    confirm_binary: z.boolean().default(false),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.status === 'wish' && value.progress != null && value.progress > 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['progress'],
        message: 'wish works cannot have progress',
      })
    }
    if (value.progress != null && value.progress > value.total_progress) {
      ctx.addIssue({
        code: 'custom',
        path: ['progress'],
        message: 'progress cannot exceed total_progress',
      })
    }
    if (value.finished_on && value.status !== 'done') {
      ctx.addIssue({
        code: 'custom',
        path: ['finished_on'],
        message: 'finished_on is only valid for done works',
      })
    }
  })

export const updateWorkSchema = z
  .object({
    title: z.string().trim().min(1).max(MAX_TITLE_LENGTH).optional(),
    creator: z.string().trim().max(MAX_CREATOR_LENGTH).optional(),
    release_year: z.number().int().min(0).max(MAX_RELEASE_YEAR).nullable().optional(),
    type: z.string().trim().min(1).max(MAX_TYPE_LENGTH).optional(),
    total_progress: z.number().int().min(1).max(MAX_PROGRESS).optional(),
    short_review: z.string().max(MAX_SHORT_REVIEW_LENGTH).optional(),
    long_review_url: httpsUrlSchema.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'At least one field is required')

export const progressInputSchema = z
  .object({
    progress: z.number().int().min(0).max(MAX_PROGRESS),
    logged_on: dateOnlySchema.optional(),
    total_progress: z.number().int().min(2).max(MAX_PROGRESS).optional(),
    confirm_binary: z.boolean().default(false),
  })
  .strict()

export const statusInputSchema = z
  .object({
    status: z.enum(['reading', 'done', 'paused', 'dropped']),
    logged_on: dateOnlySchema.optional(),
    total_progress: z.number().int().min(2).max(MAX_PROGRESS).optional(),
    confirm_binary: z.boolean().default(false),
  })
  .strict()

export const roundInputSchema = z
  .object({
    logged_on: dateOnlySchema.optional(),
    total_progress: z.number().int().min(2).max(MAX_PROGRESS).optional(),
    confirm_binary: z.boolean().default(false),
  })
  .strict()

export const workIdSchema = z.string().min(1).max(64)

export type CreateWorkInput = z.infer<typeof createWorkSchema>
export type UpdateWorkInput = z.infer<typeof updateWorkSchema>
export type ProgressInput = z.input<typeof progressInputSchema>
export type StatusInput = z.input<typeof statusInputSchema>
export type RoundInput = z.input<typeof roundInputSchema>
