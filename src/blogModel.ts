import mongoose, { Schema, Document, Model } from 'mongoose';
import { BlogGenerationResponse, MedicalSpecialization, TargetAudience, BlogTone } from './types';

// ── Mongoose document interface ────────────────────────────────────────────────
export interface IBlog extends Document {
  blogId: string;              // UUID from BlogGenerationResponse.id
  title: string;
  content: string;
  originalTopic: string;
  specialization: MedicalSpecialization;
  targetAudience: TargetAudience;
  tone: BlogTone;
  estimatedReadTime: number;
  disclaimer: string | null;
  generatedAt: Date;
  aiModel: string;
  createdAt: Date;
  updatedAt: Date;
}

// ── Schema ─────────────────────────────────────────────────────────────────────
const BlogSchema = new Schema<IBlog>(
  {
    blogId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    content: {
      type: String,
      required: true,
    },
    originalTopic: {
      type: String,
      required: true,
      trim: true,
    },
    specialization: {
      type: String,
      required: true,
      enum: [
        'general_practitioner', 'cardiologist', 'neurologist', 'pediatrician',
        'oncologist', 'dermatologist', 'orthopedist', 'psychiatrist',
        'endocrinologist', 'gastroenterologist', 'pulmonologist',
        'infectious_disease', 'emergency_medicine',
      ],
    },
    targetAudience: {
      type: String,
      required: true,
      enum: ['patients', 'caregivers', 'medical_professionals', 'general_public'],
    },
    tone: {
      type: String,
      required: true,
      enum: ['clinical', 'educational', 'compassionate', 'informative'],
    },
    estimatedReadTime: {
      type: Number,
      required: true,
    },
    disclaimer: {
      type: String,
      default: null,
    },
    generatedAt: {
      type: Date,
      required: true,
    },
    aiModel: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: true,          // adds createdAt + updatedAt automatically
    collection: 'medical_blogs',
  }
);

// ── Text index for basic full-text search ─────────────────────────────────────
BlogSchema.index({ title: 'text', content: 'text', originalTopic: 'text' });

// ── Model ──────────────────────────────────────────────────────────────────────
export const BlogModel: Model<IBlog> =
  mongoose.models['Blog'] || mongoose.model<IBlog>('Blog', BlogSchema);

// ── Helper: persist a BlogGenerationResponse ──────────────────────────────────
export async function saveBlog(blog: BlogGenerationResponse): Promise<IBlog> {
  const doc = new BlogModel({
    blogId:           blog.id,
    title:            blog.title,
    content:          blog.content,
    originalTopic:    blog.originalTopic,
    specialization:   blog.specialization,
    targetAudience:   blog.targetAudience,
    tone:             blog.tone,
    estimatedReadTime: blog.estimatedReadTime,
    disclaimer:       blog.disclaimer,
    generatedAt:      new Date(blog.generatedAt),
    aiModel:          blog.model,
  });

  return doc.save();
}
