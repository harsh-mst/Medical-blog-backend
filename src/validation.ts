// import { z } from 'zod';
// import { ValidationError } from './errors';

// const MEDICAL_SPECIALIZATIONS = [
//   'general_practitioner', 'cardiologist', 'neurologist', 'pediatrician',
//   'oncologist', 'dermatologist', 'orthopedist', 'psychiatrist',
//   'endocrinologist', 'gastroenterologist', 'pulmonologist',
//   'infectious_disease', 'emergency_medicine',
// ] as const;

// const TARGET_AUDIENCES = ['patients', 'caregivers', 'medical_professionals', 'general_public'] as const;
// const BLOG_TONES = ['clinical', 'educational', 'compassionate', 'informative'] as const;

// export const BlogRequestSchema = z.object({
//   topic: z
//     .string()
//     .min(5, 'Topic must be at least 5 characters')
//     .max(300, 'Topic must not exceed 300 characters')
//     .trim(),
//   specialization: z.enum(MEDICAL_SPECIALIZATIONS).optional().default('general_practitioner'),
//   targetAudience: z.enum(TARGET_AUDIENCES).optional().default('general_public'),
//   tone: z.enum(BLOG_TONES).optional().default('informative'),
//   wordCount: z
//     .number()
//     .int()
//     .min(200, 'Word count must be at least 200')
//     .max(2000, 'Word count must not exceed 2000')
//     .optional()
//     .default(600),
//   includeDisclaimer: z.boolean().optional().default(true),
//   additionalContext: z.string().max(500).optional(),
// });

// export function validateBlogRequest(body: unknown) {
//   const result = BlogRequestSchema.safeParse(body);
//   if (!result.success) {
//     const messages = result.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ');
//     throw new ValidationError(`Invalid request: ${messages}`, result.error.errors);
//   }
//   return result.data;
// }



import { z } from 'zod';
import { ValidationError } from './errors';

export const MEDICAL_SPECIALIZATIONS = [
  'general_practitioner', 'cardiologist', 'neurologist', 'pediatrician',
  'oncologist', 'dermatologist', 'orthopedist', 'psychiatrist',
  'endocrinologist', 'gastroenterologist', 'pulmonologist',
  'infectious_disease', 'emergency_medicine',
] as const;

export const TARGET_AUDIENCES = ['patients', 'caregivers', 'medical_professionals', 'general_public'] as const;
export const BLOG_TONES = ['clinical', 'educational', 'compassionate', 'informative'] as const;

// ── Simple 2-field schema (primary) ───────────────────────────────────────────
export const SimpleBlogSchema = z.object({
  topic: z
    .string()
    .min(5, 'Topic must be at least 5 characters')
    .max(200, 'Topic must not exceed 200 characters')
    .trim(),
  doctorNote: z
    .string()
    .max(1000, 'Doctor note must not exceed 1000 characters')
    .trim()
    .optional(),
  includeDisclaimer: z.boolean().optional().default(true),
});

// ── Full structured schema (advanced / programmatic use) ─────────────────────
export const BlogRequestSchema = z.object({
  topic: z.string().min(5).max(300).trim(),
  specialization: z.enum(MEDICAL_SPECIALIZATIONS).optional().default('general_practitioner'),
  targetAudience: z.enum(TARGET_AUDIENCES).optional().default('general_public'),
  tone: z.enum(BLOG_TONES).optional().default('informative'),
  wordCount: z.number().int().min(200).max(2000).optional().default(600),
  includeDisclaimer: z.boolean().optional().default(true),
  additionalContext: z.string().max(500).optional(),
});

export function validateSimpleBlogRequest(body: unknown) {
  const result = SimpleBlogSchema.safeParse(body);
  if (!result.success) {
    const messages = result.error.errors
      .map((e) => `${e.path.join('.')}: ${e.message}`)
      .join('; ');
    throw new ValidationError(`Invalid request: ${messages}`, result.error.errors);
  }
  return result.data;
}

export function validateBlogRequest(body: unknown) {
  const result = BlogRequestSchema.safeParse(body);
  if (!result.success) {
    const messages = result.error.errors
      .map((e) => `${e.path.join('.')}: ${e.message}`)
      .join('; ');
    throw new ValidationError(`Invalid request: ${messages}`, result.error.errors);
  }
  return result.data;
}