// import { Router, Request, Response, NextFunction } from 'express';
// import rateLimit from 'express-rate-limit';
// import { validateBlogRequest } from './validation';
// import { generateMedicalBlog } from './aiService';
// import { config } from './config';
// import { logger } from './logger';
// import { HealthCheckResponse } from './types';

// const router = Router();

// const blogGenerationLimiter = rateLimit({
//   windowMs: config.rateLimit.windowMs,
//   max: config.rateLimit.max,
//   standardHeaders: true,
//   legacyHeaders: false,
//   message: {
//     code: 'RATE_LIMIT_EXCEEDED',
//     message: 'Too many blog generation requests. Please wait before trying again.',
//   },
// });

// router.get('/health', (_req: Request, res: Response) => {
//   const health: HealthCheckResponse = {
//     status: config.googleAI.apiKey ? 'healthy' : 'degraded',
//     timestamp: new Date().toISOString(),
//     uptime: Math.floor(process.uptime()),
//     services: {
//       googleAI: config.googleAI.apiKey ? 'connected' : 'disconnected',
//     },
//     version: config.app.version,
//   };
//   res.status(health.status === 'healthy' ? 200 : 503).json(health);
// });

// router.get('/api/options', (_req: Request, res: Response) => {
//   res.json({
//     specializations: [
//       'general_practitioner', 'cardiologist', 'neurologist', 'pediatrician',
//       'oncologist', 'dermatologist', 'orthopedist', 'psychiatrist',
//       'endocrinologist', 'gastroenterologist', 'pulmonologist',
//       'infectious_disease', 'emergency_medicine',
//     ],
//     targetAudiences: ['patients', 'caregivers', 'medical_professionals', 'general_public'],
//     tones: ['clinical', 'educational', 'compassionate', 'informative'],
//     wordCountRange: { min: 200, max: 2000, default: 600 },
//   });
// });

// router.post(
//   '/api/blogs/generate',
//   blogGenerationLimiter,
//   async (req: Request, res: Response, next: NextFunction) => {
//     try {
//       const validated = validateBlogRequest(req.body);

//       logger.info('Blog generation started', {
//         topic: validated.topic,
//         specialization: validated.specialization,
//         requestId: req.headers['x-request-id'],
//       });

//       const blog = await generateMedicalBlog(validated);

//       logger.info('Blog generation completed', {
//         blogId: blog.id,
//         title: blog.title,
//         requestId: req.headers['x-request-id'],
//       });

//       res.status(201).json({ success: true, data: blog });
//     } catch (err) {
//       next(err);
//     }
//   }
// );

// export default router;


import { Router, Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { validateSimpleBlogRequest, validateBlogRequest } from './validation';
import { generateMedicalBlog } from './aiService';
import { extractBlogParamsFromNote } from './extractService';
import { config } from './config';
import { logger } from './logger';
import { HealthCheckResponse } from './types';
import { saveBlog, BlogModel } from './blogModel';

const router = Router();

const blogGenerationLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.max,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    code: 'RATE_LIMIT_EXCEEDED',
    message: 'Too many blog generation requests. Please wait before trying again.',
  },
  skip: (req) => req.path === '/health',
});

// ── Health check ──────────────────────────────────────────────────────────────
router.get('/health', (_req: Request, res: Response) => {
  const health: HealthCheckResponse = {
    status: config.googleAI.apiKey ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
    services: {
      googleAI: config.googleAI.apiKey ? 'connected' : 'disconnected',
    },
    version: config.app.version,
  };
  res.status(health.status === 'healthy' ? 200 : 503).json(health);
});

// ── Available options (for frontend dropdowns in advanced mode) ───────────────
router.get('/api/options', (_req: Request, res: Response) => {
  res.json({
    specializations: [
      'general_practitioner', 'cardiologist', 'neurologist', 'pediatrician',
      'oncologist', 'dermatologist', 'orthopedist', 'psychiatrist',
      'endocrinologist', 'gastroenterologist', 'pulmonologist',
      'infectious_disease', 'emergency_medicine',
    ],
    targetAudiences: ['patients', 'caregivers', 'medical_professionals', 'general_public'],
    tones: ['clinical', 'educational', 'compassionate', 'informative'],
    wordCountRange: { min: 200, max: 2000, default: 700 },
    doctorNoteTips: [
      "Mention your specialty — e.g. 'I am a cardiologist'",
      "Say who you're writing for — e.g. 'for my patients' or 'for general public'",
      "Mention length — e.g. 'short' (~400 words), 'medium' (~700), 'detailed' (~1500)",
      "Describe the tone — e.g. 'warm and empathetic' or 'straightforward and factual'",
      "Add your focus angle — e.g. 'focus on prevention' or 'based on my 10 years in ICU'",
      "Share your experience — e.g. 'I have 8 years of experience in pediatric care'",
    ],
    doctorNoteExample:
      "I'm a neurologist with 8 years of experience. Writing for patients. Warm tone, around 800 words. Focus on early warning signs people usually ignore.",
  });
});


router.post(
  '/api/blogs/generate',
  blogGenerationLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { topic, doctorNote, includeDisclaimer } = validateSimpleBlogRequest(req.body);

      logger.info('Blog generation started', {
        topic,
        hasNote: !!doctorNote,
        requestId: req.headers['x-request-id'],
      });

      // Step 1: Extract style/persona params from doctorNote (or use smart defaults)
      const extracted = await extractBlogParamsFromNote(topic, doctorNote);
      console.log('=== EXTRACTED ===', JSON.stringify(extracted, null, 2));

      // Step 2: Generate the blog
      const blog = await generateMedicalBlog({
        topic,
        ...extracted,
        includeDisclaimer,
      });

      logger.info('Blog generation completed', {
        blogId: blog.id,
        title: blog.title,
        specialization: extracted.specialization,
        requestId: req.headers['x-request-id'],
      });

      // ── Persist to MongoDB (non-blocking on error) ────────────────────
      try {
        await saveBlog(blog);
        logger.info('Blog saved to MongoDB', { blogId: blog.id });
      } catch (saveErr) {
        logger.error('Failed to save blog to MongoDB', {
          blogId: blog.id,
          error: (saveErr as Error).message,
        });
      }

      res.status(201).json({
        success: true,
        inferredParams: {
          specialization: extracted.specialization,
          targetAudience: extracted.targetAudience,
          tone: extracted.tone,
          wordCount: extracted.wordCount,
        },
        data: blog,
      });

    } catch (err) {
      next(err);
    }
  }
);


router.post(
  '/api/blogs/generate-structured',
  blogGenerationLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const validated = validateBlogRequest(req.body);

      logger.info('Blog generation started (structured)', {
        topic: validated.topic,
        specialization: validated.specialization,
        requestId: req.headers['x-request-id'],
      });

      const blog = await generateMedicalBlog(validated);

      logger.info('Blog generation completed (structured)', {
        blogId: blog.id,
        title: blog.title,
        requestId: req.headers['x-request-id'],
      });

      // ── Persist to MongoDB (non-blocking on error) ────────────────────
      try {
        await saveBlog(blog);
        logger.info('Blog saved to MongoDB', { blogId: blog.id });
      } catch (saveErr) {
        logger.error('Failed to save blog to MongoDB', {
          blogId: blog.id,
          error: (saveErr as Error).message,
        });
      }

      res.status(201).json({ success: true, data: blog });

    } catch (err) {
      next(err);
    }
  }
);

// ── GET all blogs (with optional pagination & filters) ────────────────────────
router.get('/api/blogs', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page       = Math.max(1, parseInt(req.query.page  as string) || 1);
    const limit      = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 10));
    const skip       = (page - 1) * limit;

    // Optional filters
    const filter: Record<string, unknown> = {};
    if (req.query.specialization) filter.specialization = req.query.specialization;
    if (req.query.targetAudience) filter.targetAudience = req.query.targetAudience;
    if (req.query.tone)           filter.tone           = req.query.tone;

    const [blogs, total] = await Promise.all([
      BlogModel.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .select('-__v')
        .lean(),
      BlogModel.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: blogs,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        hasNextPage: page * limit < total,
        hasPrevPage: page > 1,
      },
    });

  } catch (err) {
    next(err);
  }
});


// ── DELETE a single blog by its UUID (blogId field) ───────────────────────────
router.delete('/api/blogs/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const deleted = await BlogModel.findOneAndDelete({ blogId: id });

    if (!deleted) {
      res.status(404).json({
        success: false,
        code: 'BLOG_NOT_FOUND',
        message: `No blog found with id "${id}"`,
      });
      return;
    }

    logger.info('Blog deleted', { blogId: id });

    res.json({
      success: true,
      message: 'Blog deleted successfully',
      data: { blogId: id },
    });

  } catch (err) {
    next(err);
  }
});


export default router;