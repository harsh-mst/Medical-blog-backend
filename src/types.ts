export interface BlogGenerationRequest {
  topic: string;
  specialization?: MedicalSpecialization;
  targetAudience?: TargetAudience;
  tone?: BlogTone;
  wordCount?: number;
  includeDisclaimer?: boolean;
  additionalContext?: string;
}

export interface BlogGenerationResponse {
  id: string;
  title: string;
  content: string;
  originalTopic: string;
  specialization: MedicalSpecialization;
  targetAudience: TargetAudience;
  tone: BlogTone;
  estimatedReadTime: number;
  disclaimer: string | null;
  generatedAt: string;
  model: string;
}

export type MedicalSpecialization =
  | 'general_practitioner'
  | 'cardiologist'
  | 'neurologist'
  | 'pediatrician'
  | 'oncologist'
  | 'dermatologist'
  | 'orthopedist'
  | 'psychiatrist'
  | 'endocrinologist'
  | 'gastroenterologist'
  | 'pulmonologist'
  | 'infectious_disease'
  | 'emergency_medicine';

export type TargetAudience = 'patients' | 'caregivers' | 'medical_professionals' | 'general_public';

export type BlogTone = 'clinical' | 'educational' | 'compassionate' | 'informative';

export interface ApiError {
  code: string;
  message: string;
  details?: unknown;
  requestId?: string;
}

export interface HealthCheckResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime: number;
  services: {
    googleAI: 'connected' | 'disconnected' | 'unknown';
  };
  version: string;
}
