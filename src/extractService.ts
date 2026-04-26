import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';
import OpenAI from 'openai';
import { config } from './config';
import { logger } from './logger';
import { AIServiceError } from './errors';
import { MedicalSpecialization } from './types';

export interface ExtractedBlogParams {
  specialization: MedicalSpecialization;
  targetAudience: string;
  tone: string;
  wordCount: number;
  additionalContext: string;
}

const extractionSchema = {
  type: SchemaType.OBJECT,
  properties: {
    specialization: {
      type: SchemaType.STRING,
      description: 'One of: general_practitioner | cardiologist | neurologist | pediatrician | oncologist | dermatologist | orthopedist | psychiatrist | endocrinologist | gastroenterologist | pulmonologist | infectious_disease | emergency_medicine',
    },
    targetAudience: {
      type: SchemaType.STRING,
      description: 'One of: patients | caregivers | medical_professionals | general_public',
    },
    tone: {
      type: SchemaType.STRING,
      description: 'One of: clinical | educational | compassionate | informative',
    },
    wordCount: {
      type: SchemaType.NUMBER,
      description: 'Target length in words (200-2000)',
    },
    additionalContext: {
      type: SchemaType.STRING,
      description: 'Summary of doctor credentials, experience, or specific angles mentioned in the note',
    },
  },
  required: ['specialization', 'targetAudience', 'tone', 'wordCount', 'additionalContext'],
};

const EXTRACTION_PROMPT = (topic: string, doctorNote: string) => `
You are a medical content extraction system. Respond in valid JSON format only.

TOPIC: "${topic}"
DOCTOR'S NOTE: "${doctorNote || 'Not provided'}"

INFERENCE RULES:
1. specialization: infer from TOPIC if not in note; default: general_practitioner
2. targetAudience: default: general_public
3. tone: default: informative
4. wordCount PRIORITY: 
   - If DOCTOR'S NOTE contains an explicit number (e.g. 800, 1200, 1500, 2000), use that number exactly.
   - If keywords only: short=400, medium=700, long=1000, detailed/comprehensive=1500.
   - Default if no hint: 700.
   - Clamp final result between 200 and 2000.
5. additionalContext: Summarize any personal experience or expertise mentioned in the note.
`;


function cleanJSON(raw: string): string {
  return raw.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
}

async function extractWithGemini(topic: string, doctorNote: string): Promise<ExtractedBlogParams> {
  const genAI = new GoogleGenerativeAI(config.googleAI.apiKey);
  const model = genAI.getGenerativeModel({
    model: config.googleAI.model,
    generationConfig: {
      maxOutputTokens: 1000,
      temperature: 0.1,
      responseMimeType: 'application/json',
      responseSchema: extractionSchema,
    },
  });

  const result = await model.generateContent(EXTRACTION_PROMPT(topic, doctorNote));
  const raw = result.response.text();
  return JSON.parse(raw) as ExtractedBlogParams;
}

async function extractWithGroq(topic: string, doctorNote: string): Promise<ExtractedBlogParams> {
  const groq = new OpenAI({
    apiKey: config.groq.apiKey,
    baseURL: 'https://api.groq.com/openai/v1',
  });

  const completion = await groq.chat.completions.create({
    model: config.groq.model,
    messages: [{ role: 'user', content: EXTRACTION_PROMPT(topic, doctorNote) }],
    temperature: 0.1,
    max_tokens: 800,
    response_format: { type: 'json_object' },
  });

  const raw = completion.choices[0]?.message?.content || '';
  return JSON.parse(cleanJSON(raw)) as ExtractedBlogParams;
}

/**
 * Deterministically extract word count patterns from text (e.g. "1500 words", "~800", "around 1200")
 */
function parseExplicitWordCount(note: string): number | null {
  if (!note) return null;

  // Pattern 1: [numbers] followed by "word(s)"
  const wordMatch = note.match(/(\d{3,4})\s*words?/i);
  if (wordMatch) return parseInt(wordMatch[1], 10);

  // Pattern 2: around/about/~ followed by [numbers]
  const aboutMatch = note.match(/(?:around|about|~)\s*(\d{3,4})/i);
  if (aboutMatch) return parseInt(aboutMatch[1], 10);

  return null;
}

export async function extractBlogParamsFromNote(
  topic: string,
  doctorNote?: string
): Promise<ExtractedBlogParams> {
  logger.info('Extracting blog params', { topic, hasNote: !!doctorNote });

  // 1. Run deterministic Regex extraction first
  const explicitCount = parseExplicitWordCount(doctorNote || '');
  if (explicitCount) {
    logger.info('Deterministic word count found in note', { explicitCount });
  }

  let finalParams: ExtractedBlogParams | null = null;

  if (config.googleAI.apiKey) {
    try {
      finalParams = await extractWithGemini(topic, doctorNote || '');
      logger.info('Extraction successful via Gemini', { specialization: finalParams.specialization });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn('Gemini extraction failed — falling back to Groq', { error: msg });
    }
  }

  if (!finalParams && config.groq.apiKey) {
    try {
      finalParams = await extractWithGroq(topic, doctorNote || '');
      logger.info('Extraction successful via Groq', { specialization: finalParams.specialization });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new AIServiceError(`Failed to extract blog parameters: ${msg}`, err);
    }
  }

  if (!finalParams) {
    throw new AIServiceError('No AI provider configured or both providers failed.');
  }

  // 2. Override AI result with deterministic Regex result if found (and valid)
  if (explicitCount && explicitCount >= 200 && explicitCount <= 2000) {
    logger.info('Overriding AI wordCount with deterministic value', { 
      original: finalParams.wordCount, 
      override: explicitCount 
    });
    finalParams.wordCount = explicitCount;
  }

  return finalParams;
}