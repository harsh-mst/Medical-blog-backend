


import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold, SchemaType } from '@google/generative-ai';
import OpenAI from 'openai';
import { config } from './config';
import { logger } from './logger';
import { AIServiceError } from './errors';
import { BlogGenerationRequest, BlogGenerationResponse, MedicalSpecialization } from './types';
import { v4 as uuidv4 } from 'uuid';


// ─── Specialization Labels ────────────────────────────────────────────────────
const SPECIALIZATION_LABELS: Record<MedicalSpecialization, string> = {
  general_practitioner:  'General Practitioner',
  cardiologist:          'Cardiologist',
  neurologist:           'Neurologist',
  pediatrician:          'Pediatrician',
  oncologist:            'Oncologist',
  dermatologist:         'Dermatologist',
  orthopedist:           'Orthopedic Surgeon',
  psychiatrist:          'Psychiatrist',
  endocrinologist:       'Endocrinologist',
  gastroenterologist:    'Gastroenterologist',
  pulmonologist:         'Pulmonologist',
  infectious_disease:    'Infectious Disease Specialist',
  emergency_medicine:    'Emergency Medicine Physician',
};

// ─── Variation Engine ─────────────────────────────────────────────────────────

const OPENING_STYLES = [
  'Start with a surprising or counterintuitive medical statistic about this topic.',
  'Open with a brief, vivid patient scenario (anonymized) that illustrates the topic.',
  'Begin with a common misconception patients have about this topic, then debunk it.',
  'Start with a provocative question that challenges what the reader thinks they know.',
  'Open with a historical or evolutionary perspective on this medical topic.',
  'Begin with the moment a patient first realizes something is wrong — build from there.',
  'Start with a day-in-the-life framing: walk through how this condition affects a typical day.',
  'Open with a bold clinical observation you have made across years of practice.',
  'Begin by contrasting what most people do vs. what the evidence actually recommends.',
  'Start with the one thing about this topic that most doctors wish their patients knew.',
];

const STRUCTURAL_ANGLES = [
  'Structure the piece around myths vs. facts.',
  'Structure it as a progression: early signs → diagnosis → management → long-term outlook.',
  'Organize around the top 3–4 questions patients always ask you about this topic.',
  'Structure it around the biggest mistakes patients make and how to avoid them.',
  'Build around the science first, then translate each finding into a practical takeaway.',
  'Organize by risk group: who is most affected and why each group needs a different approach.',
  'Frame the piece as "what I wish I had told my patients earlier in my career."',
  'Structure it as a before/after: life without proper management vs. life with it.',
];

const STYLISTIC_TEXTURES = [
  'Use short, punchy sentences to create urgency.',
  'Write with longer, flowing sentences that feel reflective and considered.',
  'Alternate between short sentences for impact and longer ones for explanation.',
  'Use rhetorical questions within paragraphs to keep the reader engaged.',
  'Include one concrete analogy that makes a complex mechanism easy to understand.',
];

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}


function extractJSON(raw: string): string {
  const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) return fenceMatch[1].trim();

  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) {
    return raw.slice(start, end + 1).trim();
  }

  return raw.trim();
}


const DISCLAIMER =
  'This blog post is for informational purposes only and does not constitute medical advice. ' +
  'Always consult a qualified healthcare professional for diagnosis, treatment, or any medical concerns.';


// ─── JSON Schema for Structured Output ───────────────────────────────────────
const blogSchema = {
  type: SchemaType.OBJECT,
  properties: {
    title: {
      type: SchemaType.STRING,
      description:
        'A concise, engaging blog title. MAXIMUM 10 words. Must be a short headline — NOT a sentence, NOT a paragraph, NOT a question with a long answer embedded in it.',
    },
    content: {
      type: SchemaType.STRING,
      description:
        'The full blog post body written in markdown. Use ## for subheadings. IMPORTANT: You MUST use double newlines (\\n\\n) between EVERY paragraph and EVERY section header to ensure proper rendering. Do NOT include or repeat the title here.',
    },
  },
  required: ['title', 'content'],
};


// ─── Types ────────────────────────────────────────────────────────────────────
type FullRequest = Omit<BlogGenerationRequest, 'targetAudience' | 'tone'> & {
  wordCount: number;
  tone: string;
  targetAudience: string;
  specialization: MedicalSpecialization;
  includeDisclaimer: boolean;
};


// ─── Prompt Builder (KEY CHANGE) ──────────────────────────────────────────────
function buildPrompt(req: FullRequest): string {
  const doctorTitle = SPECIALIZATION_LABELS[req.specialization];

  const audienceNote =
    req.targetAudience === 'medical_professionals'
      ? 'Use appropriate clinical terminology and reference medical guidelines where relevant.'
      : 'Use clear, accessible language. Avoid unnecessary jargon. Explain any medical terms used.';

  const toneInstruction: Record<string, string> = {
    professional:   'Write in a formal, authoritative tone. Use precise language and structured reasoning.',
    conversational: 'Write in a warm, approachable tone as if speaking directly to the patient. Use "you" and "we".',
    educational:    'Write in a clear, instructional tone. Break down complex concepts step-by-step.',
    empathetic:     'Write with compassion and emotional awareness. Acknowledge patient concerns before clinical facts.',
    motivational:   'Write with energy and encouragement. Inspire the reader to take action for their health.',
  };
  const toneGuide = toneInstruction[req.tone] ?? `Write in a ${req.tone} tone.`;

  const depthNote =
    req.targetAudience === 'medical_professionals'
      ? 'Include pathophysiology, clinical evidence, and treatment considerations where relevant.'
      : 'Focus on lifestyle implications, early warning signs, and when to seek care. Avoid overwhelming clinical detail.';

  // ── Variation engine selections: fresh every call ───────────────────────────────
  const openingStyle    = pickRandom(OPENING_STYLES);
  const structuralAngle = pickRandom(STRUCTURAL_ANGLES);
  const stylisticGuide  = pickRandom(STYLISTIC_TEXTURES);

  // Dynamic paragraph count: 1 paragraph for every ~125 words requested, min 4 paragraphs.
  const targetParagraphCount = Math.max(4, Math.ceil(req.wordCount / 125));
  const styleInstruction = `Write in ${targetParagraphCount} substantial, deep paragraphs (average 130–160 words each).`;

  return `You are a highly experienced ${doctorTitle} writing a professional medical blog post.

TOPIC: "${req.topic}"
TARGET AUDIENCE: ${req.targetAudience.replace(/_/g, ' ')}
TONE: ${req.tone}
${req.additionalContext ? `DOCTOR'S ADDITIONAL CONTEXT: ${req.additionalContext}` : ''}

━━━ CREATIVE DIRECTION ━━━
OPENING STYLE: ${openingStyle}
STRUCTURAL ANGLE: ${structuralAngle}
STYLISTIC TEXTURE: ${stylisticGuide}

Do NOT default to a generic introduction. The first sentence must reflect the OPENING STYLE above.
━━━

TITLE RULES:
- MAXIMUM 10 words
- Must be a punchy, standalone headline specific to "${req.topic}"

TONE INSTRUCTION:
${toneGuide}

AUDIENCE & DEPTH:
${depthNote}

MANDATORY LENGTH & FORMAT:
- TOTAL CONTENT MUST BE MINIMUM ${req.wordCount} WORDS. THIS IS NON-NEGOTIABLE.
- ${styleInstruction}
- You MUST separate every paragraph with exactly ONE blank line (double newlines \n\n). 
- Use ## subheadings to organize the content into logical sections (at least 3-5 headers for long articles).
- Place a blank line before and after every ## subheading.
- No bullet points, no numbered lists—use full, rich paragraphs only.
- Do NOT cut off mid-paragraph — finish every thought completely.
- Depth is required. Do not be concise. Expand on every point with clinical nuances.

CONTENT RULES:
- ${audienceNote}
- Evidence-based and accurate
- Practical takeaways specific to this topic
- No specific medications or dosages
- No diagnostic claims
- Encourage professional consultation
- First person as a ${doctorTitle} where natural
- Do NOT include the title inside the content body

Respond with valid JSON only. No markdown fences.
{
  "title": "max 10 word headline",
  "content": "full blog body (MINIMUM ${req.wordCount} words)"
}`;
}


// ─── Utilities ────────────────────────────────────────────────────────────────
function estimateReadTime(content: string): number {
  const wordsPerMinute = 200;
  const wordCount = content.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(wordCount / wordsPerMinute));
}

function sanitizeTitle(raw: string): string {
  return raw
    .replace(/^#+\s*/, '')
    .replace(/\*+/g, '')
    .trim();
}


// ─── Groq Fallback ────────────────────────────────────────────────────────────
async function generateWithGroq(
  req: FullRequest,
  prompt: string
): Promise<{ title: string; content: string; model: string }> {
  if (!config.groq.apiKey) {
    throw new Error('Groq API Key not configured for fallback');
  }

  const groq = new OpenAI({
    apiKey: config.groq.apiKey,
    baseURL: 'https://api.groq.com/openai/v1',
  });

  logger.info('Attempting fallback to Groq', { model: config.groq.model });

  const completion = await groq.chat.completions.create({
    model: config.groq.model,
    messages: [
      {
        role: 'system',
        content: `You are a medical writing assistant. You write unique, detailed blog posts tailored to the specific topic, audience, and tone given. Respond only in JSON format.`,
      },
      { role: 'user', content: prompt },
    ],
    temperature: 0.7,   // slightly higher than before for more variation
    max_tokens: 4096,
    response_format: { type: 'json_object' },
  });

  const raw = completion.choices[0]?.message?.content || '';
  if (!raw) throw new Error('Groq returned an empty response');

  const parsed = JSON.parse(raw);

  if (!parsed.title || !parsed.content) {
    throw new Error('Groq returned incomplete JSON — missing title or content');
  }

  return {
    title: parsed.title,
    content: parsed.content,
    model: config.groq.model,
  };
}


// ─── Main Export ──────────────────────────────────────────────────────────────
export async function generateMedicalBlog(req: FullRequest): Promise<BlogGenerationResponse> {
  const prompt = buildPrompt(req);
  let finalContent: { title: string; content: string; model: string } | null = null;
  let googleError: any = null;

  // ── 1. Try Google AI ────────────────────────────────────────────────────────
  if (config.googleAI.apiKey) {
    try {
      const genAI = new GoogleGenerativeAI(config.googleAI.apiKey);
      const model = genAI.getGenerativeModel({
        model: config.googleAI.model,
        safetySettings: [
          { category: HarmCategory.HARM_CATEGORY_HARASSMENT,        threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
          { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,       threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
          { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
        ],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema:   blogSchema,
          maxOutputTokens:  config.googleAI.maxOutputTokens,
          temperature:      config.googleAI.temperature,
        },
      });

      logger.info('Sending request to Google AI', {
        topic:          req.topic,
        specialization: req.specialization,
        wordCount:      req.wordCount,
        tone:           req.tone,
        targetAudience: req.targetAudience,
        model:          config.googleAI.model,
      });

      const result   = await model.generateContent(prompt);
      const response = result.response;
      const finishReason = response.candidates?.[0]?.finishReason;

      logger.debug('Google AI generation finished', { 
        finishReason, 
        rawLength: response.text().length 
      });

      if (finishReason === 'SAFETY') {
        throw new Error('Content was blocked by Google AI safety filters.');
      }
      if (finishReason === 'RECITATION') {
        throw new Error('Content was flagged for recitation by Google AI.');
      }
      if (finishReason === 'MAX_TOKENS') {
        throw new Error('Google AI hit token limit — consider reducing word count.');
      }

      const rawText = response.text();
      if (!rawText || rawText.trim().length === 0) {
        throw new Error('Google AI returned an empty response.');
      }

      const cleaned = extractJSON(rawText);
      const parsed  = JSON.parse(cleaned);

      if (!parsed.title || !parsed.content) {
        throw new Error('Google AI returned incomplete JSON — missing title or content.');
      }

      finalContent = {
        title:   parsed.title,
        content: parsed.content,
        model:   config.googleAI.model,
      };
    } catch (err) {
      googleError = err;
      logger.warn('Google AI failed — attempting Groq fallback', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // ── 2. Fallback to Groq ─────────────────────────────────────────────────────
  if (!finalContent && config.groq.apiKey) {
    try {
      finalContent = await generateWithGroq(req, prompt);
      logger.info('Groq fallback successful', { model: config.groq.model });
    } catch (err) {
      const groqMessage = err instanceof Error ? err.message : 'Unknown Groq error';
      logger.error('Groq fallback also failed', { error: groqMessage });
      throw new AIServiceError(
        `Both AI providers failed.\n` +
        `Google error: ${googleError?.message ?? 'Not attempted'}.\n` +
        `Groq error: ${groqMessage}`,
        err
      );
    }
  }

  if (!finalContent) {
    throw new AIServiceError('No AI providers could fulfill the request. Check your API keys in config.');
  }

  // ── Post-Process ────────────────────────────────────────────────────────────
  const cleanTitle  = sanitizeTitle(finalContent.title);
  const words       = cleanTitle.split(/\s+/);
  const finalTitle  = words.length > 14
    ? words.slice(0, 12).join(' ') + '...'
    : cleanTitle;

  const cleanContent = finalContent.content.trim();

  if (cleanContent.length < 100) {
    throw new AIServiceError('AI returned insufficient content. Please try again.');
  }

  logger.info('Blog generation successful', {
    title:          finalTitle,
    wordCount:      cleanContent.split(/\s+/).length,
    estimatedRead:  estimateReadTime(cleanContent),
    modelUsed:      finalContent.model,
  });

  // ── Return ──────────────────────────────────────────────────────────────────
  return {
    id:                uuidv4(),
    title:             finalTitle,
    content:           cleanContent,
    originalTopic:     req.topic,
    specialization:    req.specialization,
    targetAudience:    req.targetAudience as BlogGenerationResponse['targetAudience'],
    tone:              req.tone as BlogGenerationResponse['tone'],
    estimatedReadTime: estimateReadTime(cleanContent),
    disclaimer:        req.includeDisclaimer ? DISCLAIMER : null,
    generatedAt:       new Date().toISOString(),
    model:             finalContent.model,
  };
}